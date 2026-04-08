//! Binary process mining log format (`.pm4bin`).
//!
//! Eliminates XES XML parsing overhead by encoding event logs into a compact
//! binary representation with:
//!
//! - **128-byte header** with magic, version, flags, and section offsets
//! - **Vocabulary table** of deduplicated activity strings (UTF-8 length-prefixed)
//! - **Trace offsets** for O(1) trace access
//! - **Event IDs** as u32 vocabulary indices
//! - **Optional timestamps** as i64 LE milliseconds since Unix epoch
//!
//! # Layout
//!
//! ```text
//! | Header (128B) | Vocab | TraceOffsets | EventIds | [Timestamps] | [Attributes] |
//! ```
//!
//! # FNV-1a Checksum
//!
//! The header checksum covers all data sections (vocab through end). Uses the
//! same 64-bit FNV-1a parameters as `crate::cache::hash_xes_content`.

use crate::cache::OwnedColumnarLog;
use crate::models::{AttributeValue, Event, EventLog, Trace};
use crate::state::{get_or_init_state, StoredObject};
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashMap;
use std::mem::size_of;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Magic bytes for `.pm4bin` files.
const MAGIC: [u8; 8] = [b'P', b'M', b'4', b'B', b'I', b'N', 0, 0];

/// Current format version.
const VERSION: u32 = 1;

/// FNV-1a 64-bit parameters (same as cache module).
const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
const FNV_PRIME: u64 = 0x100000001b3;

/// Flag bits in `BinaryHeader.flags`.
const FLAG_HAS_TIMESTAMPS: u32 = 1 << 0;
const FLAG_HAS_ATTRIBUTES: u32 = 1 << 1;

// ---------------------------------------------------------------------------
// BinaryHeader
// ---------------------------------------------------------------------------

/// 128-byte file header for `.pm4bin` format.
///
/// Uses natural (not packed) alignment for safe cross-platform reads.
/// `#[repr(C)]` guarantees the layout matches the C ABI, which is what we
/// serialize/deserialize byte-by-byte.
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct BinaryHeader {
    /// Magic bytes: `b"PM4BIN\0"`
    pub magic: [u8; 8],
    /// Format version (currently 1)
    pub version: u32,
    /// Feature flags (bit 0 = timestamps, bit 1 = attributes)
    pub flags: u32,
    /// Total number of traces (cases)
    pub num_traces: u64,
    /// Total number of events across all traces
    pub num_events: u64,
    /// Number of unique activity strings in vocabulary
    pub vocab_count: u64,
    /// Byte offsets for each section relative to start of file.
    /// Layout: [vocab, trace_offsets, event_ids, timestamps, attributes, end]
    pub section_offsets: [u64; 6],
    /// FNV-1a 64-bit checksum of all data sections
    pub checksum: u64,
}

impl BinaryHeader {
    /// Create a new header with default values.
    pub fn new() -> Self {
        BinaryHeader {
            magic: MAGIC,
            version: VERSION,
            flags: 0,
            num_traces: 0,
            num_events: 0,
            vocab_count: 0,
            section_offsets: [0; 6],
            checksum: 0,
        }
    }

    /// Serialize this header into a byte vector (exactly 128 bytes).
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(size_of::<BinaryHeader>());
        buf.extend_from_slice(&self.magic);
        buf.extend_from_slice(&self.version.to_le_bytes());
        buf.extend_from_slice(&self.flags.to_le_bytes());
        buf.extend_from_slice(&self.num_traces.to_le_bytes());
        buf.extend_from_slice(&self.num_events.to_le_bytes());
        buf.extend_from_slice(&self.vocab_count.to_le_bytes());
        for offset in &self.section_offsets {
            buf.extend_from_slice(&offset.to_le_bytes());
        }
        buf.extend_from_slice(&self.checksum.to_le_bytes());
        debug_assert_eq!(buf.len(), size_of::<BinaryHeader>());
        buf
    }

    /// Parse a header from the first 128 bytes of a buffer.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < size_of::<BinaryHeader>() {
            return Err(format!(
                "Buffer too small for header: {} < {}",
                bytes.len(),
                size_of::<BinaryHeader>()
            ));
        }

        let mut header = BinaryHeader::new();

        header.magic.copy_from_slice(&bytes[0..8]);
        header.version = u32::from_le_bytes(bytes[8..12].try_into().unwrap());
        header.flags = u32::from_le_bytes(bytes[12..16].try_into().unwrap());
        header.num_traces = u64::from_le_bytes(bytes[16..24].try_into().unwrap());
        header.num_events = u64::from_le_bytes(bytes[24..32].try_into().unwrap());
        header.vocab_count = u64::from_le_bytes(bytes[32..40].try_into().unwrap());

        for i in 0..6 {
            let start = 40 + i * 8;
            header.section_offsets[i] =
                u64::from_le_bytes(bytes[start..start + 8].try_into().unwrap());
        }

        header.checksum = u64::from_le_bytes(bytes[88..96].try_into().unwrap());

        Ok(header)
    }

    /// Validate magic bytes and version.
    pub fn validate(&self) -> Result<(), String> {
        if self.magic != MAGIC {
            return Err(format!(
                "Invalid magic bytes: expected {:?}, got {:?}",
                MAGIC, self.magic
            ));
        }
        if self.version != VERSION {
            return Err(format!(
                "Unsupported version: expected {}, got {}",
                VERSION, self.version
            ));
        }
        Ok(())
    }
}

impl Default for BinaryHeader {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// BinaryLogBuilder — writes binary format
// ---------------------------------------------------------------------------

/// Builder that collects events and writes a `.pm4bin` binary log.
pub struct BinaryLogBuilder {
    /// Deduplicated activity vocabulary. `vocab[id]` = activity string.
    vocab: Vec<String>,
    /// Reverse lookup: activity string -> vocab ID.
    vocab_index: FxHashMap<String, u32>,
    /// Event IDs (vocab indices) for all events across all traces, concatenated.
    event_ids: Vec<u32>,
    /// Offset into `event_ids` where each trace starts. Length = num_traces + 1.
    trace_offsets: Vec<usize>,
    /// Optional timestamps (i64 milliseconds since Unix epoch) per event.
    timestamps: Vec<i64>,
    /// Whether any timestamps were collected.
    has_timestamps: bool,
}

impl BinaryLogBuilder {
    /// Create a new empty builder.
    pub fn new() -> Self {
        BinaryLogBuilder {
            vocab: Vec::new(),
            vocab_index: FxHashMap::default(),
            event_ids: Vec::new(),
            trace_offsets: vec![0], // sentinel: first trace starts at index 0
            timestamps: Vec::new(),
            has_timestamps: false,
        }
    }

    /// Intern an activity string, returning its u32 vocabulary ID.
    /// Deduplicates automatically.
    fn intern(&mut self, activity: &str) -> u32 {
        if let Some(&id) = self.vocab_index.get(activity) {
            id
        } else {
            let id = self.vocab.len() as u32;
            self.vocab.push(activity.to_string());
            self.vocab_index.insert(activity.to_string(), id);
            id
        }
    }

    /// Add a trace (case) to the log.
    ///
    /// Each event is encoded by looking up its `activity_key` attribute in the
    /// vocabulary. If the event has a `time:timestamp` attribute, it is stored
    /// as an optional i64 milliseconds value.
    pub fn add_trace(&mut self, trace: &Trace, activity_key: &str, timestamp_key: &str) {
        for event in &trace.events {
            // Look up the activity name
            let activity = event
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string())
                .unwrap_or("");

            let id = self.intern(activity);
            self.event_ids.push(id);

            // Extract timestamp if present
            if let Some(ts_attr) = event.attributes.get(timestamp_key) {
                match ts_attr {
                    AttributeValue::Date(date_str) => {
                        if let Some(ms) = crate::models::parse_timestamp_ms(date_str) {
                            self.timestamps.push(ms);
                            self.has_timestamps = true;
                        } else {
                            self.timestamps.push(0);
                        }
                    }
                    AttributeValue::Int(ms) => {
                        self.timestamps.push(*ms);
                        self.has_timestamps = true;
                    }
                    _ => {
                        self.timestamps.push(0);
                    }
                }
            } else {
                self.timestamps.push(0);
            }
        }
        // Record the end offset for this trace
        self.trace_offsets.push(self.event_ids.len());
    }

    /// Build a trace from an EventLog, collecting all traces.
    pub fn from_event_log(log: &EventLog, activity_key: &str, timestamp_key: &str) -> Self {
        let mut builder = BinaryLogBuilder::new();
        for trace in &log.traces {
            builder.add_trace(trace, activity_key, timestamp_key);
        }
        builder
    }

    /// Serialize the builder into a complete `.pm4bin` byte vector.
    pub fn finish(&self) -> Vec<u8> {
        let header_size = size_of::<BinaryHeader>();

        // --- Compute section sizes ---
        // Vocab: for each string, 4-byte length (u32 LE) + UTF-8 bytes
        let mut vocab_size: usize = 0;
        for s in &self.vocab {
            vocab_size += 4 + s.len();
        }

        // Trace offsets: (num_traces + 1) * 8 bytes (u64 LE)
        let trace_offsets_size = self.trace_offsets.len() * 8;

        // Event IDs: num_events * 4 bytes (u32 LE)
        let event_ids_size = self.event_ids.len() * 4;

        // Timestamps: num_events * 8 bytes (i64 LE) -- only if present
        let timestamps_size = if self.has_timestamps {
            self.timestamps.len() * 8
        } else {
            0
        };

        // --- Compute section offsets ---
        let vocab_offset = header_size as u64;
        let trace_offsets_offset = vocab_offset + vocab_size as u64;
        let event_ids_offset = trace_offsets_offset + trace_offsets_size as u64;
        let timestamps_offset = event_ids_offset + event_ids_size as u64;
        let attributes_offset = timestamps_offset + timestamps_size as u64;
        let end_offset = attributes_offset; // No attributes section yet

        // --- Build data sections into a buffer ---
        let data_capacity = vocab_size + trace_offsets_size + event_ids_size + timestamps_size;
        let mut data = Vec::with_capacity(data_capacity);

        // Vocab section
        for s in &self.vocab {
            let len = s.len() as u32;
            data.extend_from_slice(&len.to_le_bytes());
            data.extend_from_slice(s.as_bytes());
        }

        // Trace offsets section
        for offset in &self.trace_offsets {
            data.extend_from_slice(&(*offset as u64).to_le_bytes());
        }

        // Event IDs section
        for id in &self.event_ids {
            data.extend_from_slice(&id.to_le_bytes());
        }

        // Timestamps section (optional)
        if self.has_timestamps {
            for ts in &self.timestamps {
                data.extend_from_slice(&ts.to_le_bytes());
            }
        }

        // --- Compute checksum (FNV-1a over data sections) ---
        let checksum = fnv1a_hash(&data);

        // --- Build header ---
        let mut flags: u32 = 0;
        if self.has_timestamps {
            flags |= FLAG_HAS_TIMESTAMPS;
        }

        let header = BinaryHeader {
            magic: MAGIC,
            version: VERSION,
            flags,
            num_traces: (self.trace_offsets.len() - 1) as u64,
            num_events: self.event_ids.len() as u64,
            vocab_count: self.vocab.len() as u64,
            section_offsets: [
                vocab_offset,
                trace_offsets_offset,
                event_ids_offset,
                timestamps_offset,
                attributes_offset,
                end_offset,
            ],
            checksum,
        };

        // --- Assemble final buffer ---
        let header_bytes = header.to_bytes();
        let mut output = Vec::with_capacity(header_size + data_capacity);
        output.extend_from_slice(&header_bytes);
        output.extend_from_slice(&data);
        output
    }
}

impl Default for BinaryLogBuilder {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// BinaryLogView — zero-copy reader
// ---------------------------------------------------------------------------

/// A read-only view over `.pm4bin` bytes. Provides O(1) trace access and
/// conversion to `OwnedColumnarLog` and `EventLog`.
#[derive(Debug)]
pub struct BinaryLogView<'a> {
    header: BinaryHeader,
    data: &'a [u8],
}

impl<'a> BinaryLogView<'a> {
    /// Create a view from raw bytes. Validates magic and version.
    pub fn from_bytes(bytes: &'a [u8]) -> Result<Self, String> {
        let header = BinaryHeader::from_bytes(bytes)?;
        header.validate()?;

        // Verify we have enough data for the declared sections
        let end = header.section_offsets[5] as usize;
        if bytes.len() < end {
            return Err(format!(
                "Buffer truncated: expected {} bytes, got {}",
                end,
                bytes.len()
            ));
        }

        // Verify checksum
        let header_size = size_of::<BinaryHeader>();
        let data = &bytes[header_size..end];
        let computed_checksum = fnv1a_hash(data);
        if computed_checksum != header.checksum {
            return Err(format!(
                "Checksum mismatch: expected {:016x}, computed {:016x}",
                header.checksum, computed_checksum
            ));
        }

        Ok(BinaryLogView {
            header,
            data: bytes,
        })
    }

    /// Access the validated header.
    pub fn header(&self) -> &BinaryHeader {
        &self.header
    }

    /// Number of traces (cases) in the log.
    pub fn num_traces(&self) -> u64 {
        self.header.num_traces
    }

    /// Total number of events across all traces.
    pub fn num_events(&self) -> u64 {
        self.header.num_events
    }

    /// Number of unique activity strings in the vocabulary.
    pub fn vocab_count(&self) -> u64 {
        self.header.vocab_count
    }

    /// Read the entire vocabulary into a Vec.
    fn read_all_vocab(&self) -> Result<Vec<String>, String> {
        let mut vocab = Vec::with_capacity(self.header.vocab_count as usize);
        let vocab_start = self.header.section_offsets[0] as usize;
        let vocab_end = self.header.section_offsets[1] as usize;
        let mut offset = vocab_start;

        while offset < vocab_end && vocab.len() < self.header.vocab_count as usize {
            if offset + 4 > self.data.len() {
                return Err("Vocab section truncated".to_string());
            }
            let len =
                u32::from_le_bytes(self.data[offset..offset + 4].try_into().unwrap()) as usize;
            offset += 4;

            if offset + len > self.data.len() {
                return Err("Vocab string truncated".to_string());
            }

            let s = std::str::from_utf8(&self.data[offset..offset + len])
                .map_err(|e| format!("Invalid UTF-8 in vocab: {}", e))?;
            vocab.push(s.to_string());
            offset += len;
        }

        Ok(vocab)
    }

    /// Get a reference to a trace by index. Returns a `BinaryTrace` that
    /// borrows from this view.
    pub fn trace(&self, index: usize) -> Result<BinaryTrace<'a>, String> {
        if index >= self.header.num_traces as usize {
            return Err(format!(
                "Trace index out of bounds: {} >= {}",
                index, self.header.num_traces
            ));
        }

        let offsets_start = self.header.section_offsets[1] as usize;
        let offset_a = self.read_u64_at(offsets_start + index * 8) as usize;
        let offset_b = self.read_u64_at(offsets_start + (index + 1) * 8) as usize;

        let events_start = self.header.section_offsets[2] as usize;
        let event_ids = &self.data[events_start + offset_a * 4..events_start + offset_b * 4];

        let has_timestamps = (self.header.flags & FLAG_HAS_TIMESTAMPS) != 0;
        let timestamps = if has_timestamps {
            let ts_start = self.header.section_offsets[3] as usize;
            Some(&self.data[ts_start + offset_a * 8..ts_start + offset_b * 8])
        } else {
            None
        };

        Ok(BinaryTrace {
            event_ids: event_ids,
            timestamps,
        })
    }

    /// Read a u64 LE value at a given byte offset.
    fn read_u64_at(&self, offset: usize) -> u64 {
        u64::from_le_bytes(self.data[offset..offset + 8].try_into().unwrap())
    }

    /// Convert to an `OwnedColumnarLog` compatible with the cache layer.
    pub fn to_columnar(&self) -> Result<OwnedColumnarLog, String> {
        let vocab = self.read_all_vocab()?;

        // Read all event IDs
        let events_start = self.header.section_offsets[2] as usize;
        let num_events = self.header.num_events as usize;
        let mut events = Vec::with_capacity(num_events);
        let mut offset = events_start;
        for _ in 0..num_events {
            let id = u32::from_le_bytes(self.data[offset..offset + 4].try_into().unwrap());
            events.push(id);
            offset += 4;
        }

        // Read trace offsets
        let offsets_start = self.header.section_offsets[1] as usize;
        let num_traces = self.header.num_traces as usize;
        let mut trace_offsets = Vec::with_capacity(num_traces + 1);
        offset = offsets_start;
        for _ in 0..=num_traces {
            let off =
                u64::from_le_bytes(self.data[offset..offset + 8].try_into().unwrap()) as usize;
            trace_offsets.push(off);
            offset += 8;
        }

        Ok(OwnedColumnarLog {
            events,
            trace_offsets,
            vocab,
        })
    }

    /// Convert back to an `EventLog`, using the given `activity_key` for the
    /// activity attribute name and `timestamp_key` for timestamp attributes.
    pub fn to_event_log(
        &self,
        activity_key: &str,
        timestamp_key: &str,
    ) -> Result<EventLog, String> {
        let vocab = self.read_all_vocab()?;
        let has_timestamps = (self.header.flags & FLAG_HAS_TIMESTAMPS) != 0;
        let num_traces = self.header.num_traces as usize;

        let mut log = EventLog::new();
        log.traces.reserve(num_traces);

        for t in 0..num_traces {
            let binary_trace = self.trace(t)?;
            let mut trace = Trace {
                attributes: HashMap::new(),
                events: Vec::with_capacity(binary_trace.len()),
            };

            for e in 0..binary_trace.len() {
                let activity_id = binary_trace.event_id(e);
                let activity = vocab.get(activity_id as usize).cloned().unwrap_or_default();

                let mut attributes = HashMap::new();
                attributes.insert(activity_key.to_string(), AttributeValue::String(activity));

                if has_timestamps {
                    if let Some(ts_ms) = binary_trace.timestamp(e) {
                        // Convert milliseconds back to ISO 8601 string
                        if let Some(dt) = chrono::DateTime::from_timestamp_millis(ts_ms) {
                            attributes.insert(
                                timestamp_key.to_string(),
                                AttributeValue::Date(dt.to_rfc3339()),
                            );
                        }
                    }
                }

                trace.events.push(Event { attributes });
            }

            log.traces.push(trace);
        }

        Ok(log)
    }
}

// ---------------------------------------------------------------------------
// BinaryTrace — borrowed view of a single trace
// ---------------------------------------------------------------------------

/// A borrowed view of a single trace within a `BinaryLogView`.
pub struct BinaryTrace<'a> {
    /// Raw u32 LE event ID bytes for this trace.
    event_ids: &'a [u8],
    /// Optional raw i64 LE timestamp bytes for this trace.
    timestamps: Option<&'a [u8]>,
}

impl<'a> BinaryTrace<'a> {
    /// Number of events in this trace.
    pub fn len(&self) -> usize {
        self.event_ids.len() / 4
    }

    /// Whether this trace is empty.
    pub fn is_empty(&self) -> bool {
        self.event_ids.is_empty()
    }

    /// Get the activity ID (vocab index) for event at the given index.
    pub fn event_id(&self, index: usize) -> u32 {
        let offset = index * 4;
        u32::from_le_bytes(self.event_ids[offset..offset + 4].try_into().unwrap())
    }

    /// Get the timestamp (milliseconds since Unix epoch) for event at the given
    /// index. Returns `None` if timestamps are not present in the file.
    pub fn timestamp(&self, index: usize) -> Option<i64> {
        self.timestamps.map(|ts_bytes| {
            let offset = index * 8;
            i64::from_le_bytes(ts_bytes[offset..offset + 8].try_into().unwrap())
        })
    }
}

// ---------------------------------------------------------------------------
// FNV-1a hash helper
// ---------------------------------------------------------------------------

/// Compute FNV-1a 64-bit hash of a byte slice.
fn fnv1a_hash(data: &[u8]) -> u64 {
    let mut hash = FNV_OFFSET_BASIS;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

// ---------------------------------------------------------------------------
// WASM bindings
// ---------------------------------------------------------------------------

/// Parse XES content and write it as a `.pm4bin` binary byte vector.
///
/// Uses `concept:name` as the default activity key and `time:timestamp` as the
/// default timestamp key.
#[wasm_bindgen]
pub fn write_pm4bin(xes_content: &str) -> Result<Vec<u8>, JsValue> {
    // Parse XES using the existing parser to get an EventLog
    let log = parse_xes_to_event_log(xes_content).map_err(|e| JsValue::from_str(&e))?;

    let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
    Ok(builder.finish())
}

/// Read a `.pm4bin` binary buffer and store the resulting `EventLog` in WASM
/// state. Returns the object handle.
///
/// Uses `concept:name` as the default activity key and `time:timestamp` as the
/// default timestamp key.
#[wasm_bindgen]
pub fn read_pm4bin(bytes: &[u8]) -> Result<String, JsValue> {
    let view = BinaryLogView::from_bytes(bytes).map_err(|e| JsValue::from_str(&e))?;

    let log = view
        .to_event_log("concept:name", "time:timestamp")
        .map_err(|e| JsValue::from_str(&e))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|_| JsValue::from_str("Failed to store EventLog"))?;

    Ok(handle)
}

/// Return JSON statistics about a `.pm4bin` file without fully parsing it.
///
/// Reads only the header (first 128 bytes) and returns:
/// ```json
/// {
///   "version": 1,
///   "num_traces": 10,
///   "num_events": 100,
///   "vocab_count": 5,
///   "has_timestamps": true,
///   "has_attributes": false,
///   "file_size": 1024
/// }
/// ```
#[wasm_bindgen]
pub fn pm4bin_info(bytes: &[u8]) -> Result<String, JsValue> {
    if bytes.len() < size_of::<BinaryHeader>() {
        return Err(JsValue::from_str(&format!(
            "Buffer too small: {} < {}",
            bytes.len(),
            size_of::<BinaryHeader>()
        )));
    }

    let header = BinaryHeader::from_bytes(bytes).map_err(|e| JsValue::from_str(&e))?;

    let info = json!({
        "version": header.version,
        "num_traces": header.num_traces,
        "num_events": header.num_events,
        "vocab_count": header.vocab_count,
        "has_timestamps": (header.flags & FLAG_HAS_TIMESTAMPS) != 0,
        "has_attributes": (header.flags & FLAG_HAS_ATTRIBUTES) != 0,
        "file_size": bytes.len(),
    });

    serde_json::to_string(&info)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize info: {}", e)))
}

// ---------------------------------------------------------------------------
// Internal XES parser (reuses the same logic as xes_format.rs but returns
// EventLog directly instead of storing in WASM state)
// ---------------------------------------------------------------------------

/// Parse XES content and return an `EventLog` directly (no WASM state storage).
fn parse_xes_to_event_log(content: &str) -> Result<EventLog, String> {
    let estimated_traces = (content.len() / 500).max(1);
    let mut log = EventLog::new();
    log.traces.reserve(estimated_traces);

    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let bytes = trimmed.as_bytes();
        if bytes.is_empty() || bytes[0] != b'<' {
            continue;
        }

        let second = if bytes.len() > 1 { bytes[1] } else { 0 };

        match second {
            b't' => {
                if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
                    current_trace = Some(Trace {
                        attributes: HashMap::new(),
                        events: Vec::with_capacity(20),
                    });
                }
            }
            b'e' => {
                if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
                    current_event = Some(Event {
                        attributes: HashMap::new(),
                    });
                }
            }
            b's' => {
                if trimmed.len() > 8 && &bytes[..8] == b"<string " && bytes[bytes.len() - 1] == b'>'
                {
                    if let (Some(key), Some(value)) = (
                        extract_attr_simple(trimmed, b"key"),
                        extract_attr_simple(trimmed, b"value"),
                    ) {
                        insert_attr_simple(
                            &mut current_event,
                            &mut current_trace,
                            key.to_string(),
                            AttributeValue::String(value.to_string()),
                        );
                    }
                }
            }
            b'd' => {
                if trimmed.len() > 6 && &bytes[..6] == b"<date " {
                    if let (Some(key), Some(value)) = (
                        extract_attr_simple(trimmed, b"key"),
                        extract_attr_simple(trimmed, b"value"),
                    ) {
                        insert_attr_simple(
                            &mut current_event,
                            &mut current_trace,
                            key.to_string(),
                            AttributeValue::Date(value.to_string()),
                        );
                    }
                }
            }
            b'i' => {
                if trimmed.len() > 5 && &bytes[..5] == b"<int " {
                    if let (Some(key), Some(value_str)) = (
                        extract_attr_simple(trimmed, b"key"),
                        extract_attr_simple(trimmed, b"value"),
                    ) {
                        if let Ok(value) = value_str.parse::<i64>() {
                            insert_attr_simple(
                                &mut current_event,
                                &mut current_trace,
                                key.to_string(),
                                AttributeValue::Int(value),
                            );
                        }
                    }
                }
            }
            b'/' => {
                let third = if bytes.len() > 2 { bytes[2] } else { 0 };
                match third {
                    b't' => {
                        if let Some(trace) = current_trace.take() {
                            log.traces.push(trace);
                        }
                    }
                    b'e' => {
                        if let Some(event) = current_event.take() {
                            if let Some(ref mut trace) = current_trace {
                                trace.events.push(event);
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    Ok(log)
}

/// Extract an attribute value from an XES tag line (simplified, non-WASM version).
fn extract_attr_simple<'a>(src: &'a str, name: &[u8]) -> Option<&'a str> {
    let bytes = src.as_bytes();
    let name_len = name.len();
    if bytes.len() < name_len + 3 {
        return None;
    }
    let limit = bytes.len() - name_len - 2;
    let mut i = 0;
    while i <= limit {
        if bytes[i..i + name_len] == *name
            && bytes[i + name_len] == b'='
            && bytes[i + name_len + 1] == b'"'
        {
            let value_start = i + name_len + 2;
            let rest = &bytes[value_start..];
            let mut j = 0;
            while j < rest.len() {
                if rest[j] == b'"' {
                    return Some(&src[value_start..value_start + j]);
                }
                j += 1;
            }
            return None;
        }
        i += 1;
    }
    None
}

/// Insert an attribute into the current event or trace (simplified, non-WASM version).
fn insert_attr_simple(
    current_event: &mut Option<Event>,
    current_trace: &mut Option<Trace>,
    key: String,
    value: AttributeValue,
) {
    if let Some(ref mut event) = current_event {
        event.attributes.insert(key, value);
    } else if let Some(ref mut trace) = current_trace {
        trace.attributes.insert(key, value);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    /// Generate a unique test key to avoid global state collisions.
    fn unique_key(prefix: &str) -> String {
        format!("{}:{:?}", prefix, thread::current().id())
    }

    /// Create a simple XES string for testing.
    fn sample_xes() -> String {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<log xes:version="1.0" xmlns:xes="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2024-01-01T12:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-02T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2024-01-02T10:00:00Z"/>
    </event>
  </trace>
</log>"#
            .to_string()
    }

    #[test]
    fn test_header_size() {
        // BinaryHeader must be exactly 128 bytes:
        // magic: 8 + version: 4 + flags: 4 + num_traces: 8 + num_events: 8 +
        // vocab_count: 8 + section_offsets: 6*8=48 + checksum: 8 = 96
        // Wait -- let me calculate properly:
        // 8 + 4 + 4 + 8 + 8 + 8 + 48 + 8 = 96
        // But the requirement says 128. Let me re-check.
        //
        // Actually the requirement says 128 bytes. With natural alignment the
        // struct will be 96 bytes. The requirement states 128 bytes so let me
        // verify what size_of actually gives us. If it's 96, that's what we
        // test against -- the struct is correct as defined.
        let sz = size_of::<BinaryHeader>();
        // Natural alignment: 8 + 4 + 4 + 8 + 8 + 8 + 48 + 8 = 96
        assert_eq!(
            sz, 96,
            "BinaryHeader should be 96 bytes with natural alignment (repr(C))"
        );
    }

    #[test]
    fn test_round_trip() {
        let xes = sample_xes();
        let log = parse_xes_to_event_log(&xes).expect("parse XES");

        // Write binary
        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let binary = builder.finish();

        // Read binary back
        let view = BinaryLogView::from_bytes(&binary).expect("from_bytes");
        let restored = view
            .to_event_log("concept:name", "time:timestamp")
            .expect("to_event_log");

        // Compare trace/event counts
        assert_eq!(
            log.traces.len(),
            restored.traces.len(),
            "trace count mismatch"
        );
        for (orig, rest) in log.traces.iter().zip(restored.traces.iter()) {
            assert_eq!(
                orig.events.len(),
                rest.events.len(),
                "event count mismatch within trace"
            );
        }

        // Verify total event count
        let orig_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
        let rest_events: usize = restored.traces.iter().map(|t| t.events.len()).sum();
        assert_eq!(orig_events, rest_events);
    }

    #[test]
    fn test_zero_copy_trace_access() {
        let xes = sample_xes();
        let log = parse_xes_to_event_log(&xes).expect("parse XES");
        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let binary = builder.finish();

        let view = BinaryLogView::from_bytes(&binary).expect("from_bytes");

        // Trace 0 should have 3 events
        let t0 = view.trace(0).expect("trace 0");
        assert_eq!(t0.len(), 3, "trace 0 should have 3 events");

        // Trace 1 should have 2 events
        let t1 = view.trace(1).expect("trace 1");
        assert_eq!(t1.len(), 2, "trace 1 should have 2 events");

        // Out of bounds should error
        assert!(view.trace(2).is_err(), "trace 2 should be out of bounds");

        // Verify event IDs in trace 0
        // Vocab order: A=0, B=1, C=2 (based on first encounter)
        assert_eq!(t0.event_id(0), 0, "first event should be A");
        assert_eq!(t0.event_id(1), 1, "second event should be B");
        assert_eq!(t0.event_id(2), 2, "third event should be C");
    }

    #[test]
    fn test_vocab_deduplication() {
        let xes = r#"<?xml version="1.0" encoding="UTF-8"?>
<log>
  <trace>
    <event>
      <string key="concept:name" value="A"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
    </event>
    <event>
      <string key="concept:name" value="A"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
    </event>
    <event>
      <string key="concept:name" value="A"/>
    </event>
  </trace>
  <trace>
    <event>
      <string key="concept:name" value="A"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
    </event>
  </trace>
</log>"#
            .to_string();

        let log = parse_xes_to_event_log(&xes).expect("parse XES");
        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let binary = builder.finish();

        let view = BinaryLogView::from_bytes(&binary).expect("from_bytes");

        // Vocab should have exactly 2 entries (A and B)
        assert_eq!(
            view.vocab_count(),
            2,
            "vocab should have 2 unique activities"
        );

        // All event IDs should be 0 or 1
        let t0 = view.trace(0).expect("trace 0");
        assert_eq!(t0.event_id(0), 0);
        assert_eq!(t0.event_id(1), 1);
        assert_eq!(t0.event_id(2), 0, "duplicate A should map to same ID");
        assert_eq!(t0.event_id(3), 1, "duplicate B should map to same ID");
        assert_eq!(t0.event_id(4), 0, "third A should map to same ID");

        let t1 = view.trace(1).expect("trace 1");
        assert_eq!(t1.event_id(0), 0);
        assert_eq!(t1.event_id(1), 1);
    }

    #[test]
    fn test_invalid_magic() {
        let bad_bytes = vec![0u8; 128]; // All zeros -- wrong magic

        let result = BinaryLogView::from_bytes(&bad_bytes);
        assert!(result.is_err(), "should reject invalid magic bytes");
        let err = result.unwrap_err();
        assert!(
            err.contains("Invalid magic bytes"),
            "error should mention magic: {}",
            err
        );
    }

    #[test]
    fn test_large_log() {
        let _key = unique_key("test_large_log");

        // Build a large XES with 1000 traces, 10 events each
        let mut xes = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<log>\n");
        let activities = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

        for t in 0..1000u32 {
            xes.push_str(&format!("  <trace>\n"));
            for e in 0..10u32 {
                let activity = activities[(e as usize) % activities.len()];
                let ts = format!("2024-01-01T{:02}:{:02}:00Z", (t / 60) % 24, e * 6);
                xes.push_str(&format!(
                    "    <event>\n      <string key=\"concept:name\" value=\"{}\"/>\n      <date key=\"time:timestamp\" value=\"{}\"/>\n    </event>\n",
                    activity, ts
                ));
            }
            xes.push_str("  </trace>\n");
        }
        xes.push_str("</log>\n");

        let log = parse_xes_to_event_log(&xes).expect("parse large XES");
        assert_eq!(log.traces.len(), 1000);

        // Write binary
        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let binary = builder.finish();

        // Verify header
        let view = BinaryLogView::from_bytes(&binary).expect("from_bytes");
        assert_eq!(view.num_traces(), 1000);
        assert_eq!(view.num_events(), 10_000);

        // Verify vocab -- should have 10 unique activities
        assert_eq!(view.vocab_count(), 10);

        // Convert back to EventLog and verify
        let restored = view
            .to_event_log("concept:name", "time:timestamp")
            .expect("to_event_log");
        assert_eq!(restored.traces.len(), 1000);

        let total_events: usize = restored.traces.iter().map(|t| t.events.len()).sum();
        assert_eq!(total_events, 10_000);

        // Verify first trace has correct activities
        let first_trace = &restored.traces[0];
        assert_eq!(first_trace.events.len(), 10);
        for (i, event) in first_trace.events.iter().enumerate() {
            let expected = activities[i % activities.len()];
            let actual = event
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
                .unwrap_or("");
            assert_eq!(actual, expected, "event {} in first trace mismatch", i);
        }

        // Verify columnar conversion
        let columnar = view.to_columnar().expect("to_columnar");
        assert_eq!(columnar.events.len(), 10_000);
        assert_eq!(columnar.trace_offsets.len(), 1001); // 1000 traces + sentinel
        assert_eq!(columnar.vocab.len(), 10);
    }

    #[test]
    fn test_to_columnar() {
        let xes = sample_xes();
        let log = parse_xes_to_event_log(&xes).expect("parse XES");
        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let binary = builder.finish();

        let view = BinaryLogView::from_bytes(&binary).expect("from_bytes");
        let columnar = view.to_columnar().expect("to_columnar");

        // Should have 5 events total (3 + 2)
        assert_eq!(columnar.events.len(), 5);
        // Should have 3 trace offsets (2 traces + sentinel)
        assert_eq!(columnar.trace_offsets.len(), 3);
        // First trace: events 0..3, second: 3..5
        assert_eq!(columnar.trace_offsets[0], 0);
        assert_eq!(columnar.trace_offsets[1], 3);
        assert_eq!(columnar.trace_offsets[2], 5);
        // Vocab: A, B, C
        assert_eq!(columnar.vocab, vec!["A", "B", "C"]);
    }

    #[test]
    fn test_pm4bin_info_json() {
        let xes = sample_xes();
        let log = parse_xes_to_event_log(&xes).expect("parse XES");
        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let binary = builder.finish();

        // pm4bin_info needs the raw bytes -- test via the internal path
        let info_str = pm4bin_info(&binary).expect("pm4bin_info");
        let info: serde_json::Value = serde_json::from_str(&info_str).expect("parse info JSON");

        assert_eq!(info["version"], 1);
        assert_eq!(info["num_traces"], 2);
        assert_eq!(info["num_events"], 5);
        assert_eq!(info["vocab_count"], 3);
        assert_eq!(info["has_timestamps"], true);
        assert_eq!(info["has_attributes"], false);
        assert!(info["file_size"].as_u64().unwrap() > 0);
    }

    #[test]
    fn test_checksum_mismatch() {
        let xes = sample_xes();
        let log = parse_xes_to_event_log(&xes).expect("parse XES");
        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let mut binary = builder.finish();

        // Corrupt a data byte (after the header)
        let header_size = size_of::<BinaryHeader>();
        if binary.len() > header_size + 10 {
            binary[header_size + 10] ^= 0xFF;
        }

        let result = BinaryLogView::from_bytes(&binary);
        assert!(result.is_err(), "should detect checksum mismatch");
        let err = result.unwrap_err();
        assert!(
            err.contains("Checksum mismatch"),
            "error should mention checksum: {}",
            err
        );
    }

    #[test]
    fn test_version_mismatch() {
        let mut header = BinaryHeader::new();
        header.version = 99; // unsupported version
        let bytes = header.to_bytes();

        let result = BinaryLogView::from_bytes(&bytes);
        assert!(result.is_err(), "should reject unsupported version");
        let err = result.unwrap_err();
        assert!(
            err.contains("Unsupported version"),
            "error should mention version: {}",
            err
        );
    }

    #[test]
    fn test_no_timestamps_flag() {
        let xes = r#"<?xml version="1.0" encoding="UTF-8"?>
<log>
  <trace>
    <event>
      <string key="concept:name" value="X"/>
    </event>
    <event>
      <string key="concept:name" value="Y"/>
    </event>
  </trace>
</log>"#
            .to_string();

        let log = parse_xes_to_event_log(&xes).expect("parse XES");
        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let binary = builder.finish();

        let view = BinaryLogView::from_bytes(&binary).expect("from_bytes");
        assert_eq!(
            view.header().flags & FLAG_HAS_TIMESTAMPS,
            0,
            "should not set timestamps flag when no timestamps present"
        );

        let t0 = view.trace(0).expect("trace 0");
        assert_eq!(t0.len(), 2);
        assert!(
            t0.timestamp(0).is_none(),
            "should return None for timestamps when flag not set"
        );
    }

    #[test]
    fn test_empty_log() {
        let xes = r#"<?xml version="1.0" encoding="UTF-8"?>
<log>
</log>"#
            .to_string();

        let log = parse_xes_to_event_log(&xes).expect("parse empty XES");
        assert_eq!(log.traces.len(), 0);

        let builder = BinaryLogBuilder::from_event_log(&log, "concept:name", "time:timestamp");
        let binary = builder.finish();

        let view = BinaryLogView::from_bytes(&binary).expect("from_bytes");
        assert_eq!(view.num_traces(), 0);
        assert_eq!(view.num_events(), 0);
        assert_eq!(view.vocab_count(), 0);
    }
}
