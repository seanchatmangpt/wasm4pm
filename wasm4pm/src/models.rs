//! Core event log data model for process mining.
//!
//! Defines the three-level hierarchy that mirrors the XES standard:
//!
//! ```text
//! EventLog
//! └── Trace (one per case/process instance)
//!     └── Event (one per activity occurrence)
//!         └── Attribute: AttributeValue
//! ```
//!
//! [`AttributeValue`] represents XES attribute types: String, Int, Float, Date,
//! Boolean, List, and Container. The [`parse_timestamp_ms`] function converts
//! ISO 8601 / RFC 3339 timestamps to millisecond Unix epoch for uniform time arithmetic.

use rustc_hash::FxHashMap;
use serde::{Deserialize, Deserializer, Serialize};
use std::borrow::Cow;
use std::collections::{BTreeMap, BinaryHeap, HashMap, HashSet, VecDeque};

/// Alignment move types for A* alignment computation.
#[derive(Clone, Debug, Serialize, Deserialize, Eq, PartialEq)]
pub enum AlignmentMove {
    /// Synchronous move (log and model match)
    Sync { _activity: String },
    /// Log move (only in log)
    LogMove { _activity: String },
    /// Model move (only in model)
    ModelMove { _activity: String },
}

/// A* search frontier state for alignment computation.
#[derive(Clone, Debug)]
pub struct AlignmentState {
    /// Current position in trace (index)
    pub trace_pos: usize,
    /// Current marking (place -> token count)
    pub marking: Vec<usize>,
    /// Cost so far
    pub g_cost: f64,
    /// Estimated remaining cost (heuristic)
    pub h_cost: f64,
    /// Alignment path
    pub path: Vec<AlignmentMove>,
}

impl PartialEq for AlignmentState {
    fn eq(&self, other: &Self) -> bool {
        self.trace_pos == other.trace_pos && self.marking == other.marking
    }
}

impl Eq for AlignmentState {}

impl PartialOrd for AlignmentState {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for AlignmentState {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // BinaryHeap is max-heap, but we want min-heap for A*
        // Use floating point total ordering
        let f_self = self.g_cost + self.h_cost;
        let f_other = other.g_cost + other.h_cost;
        f_other
            .partial_cmp(&f_self)
            .unwrap_or(std::cmp::Ordering::Equal)
    }
}

/// Configuration for alignment-based fitness computation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AlignmentFitnessConfig {
    pub max_iterations: usize,
    pub sync_cost: f64,
    pub log_move_cost: f64,
    pub model_move_cost: f64,
}

impl Default for AlignmentFitnessConfig {
    fn default() -> Self {
        Self {
            max_iterations: 100000,
            sync_cost: 0.0,
            log_move_cost: 1.0,
            model_move_cost: 1.0,
        }
    }
}

/// Parse an ISO 8601 / RFC 3339 timestamp string into milliseconds since Unix epoch.
///
/// Handles formats:
/// - `2024-01-01T10:00:00+00:00`
/// - `2024-01-01T10:00:00Z`
/// - `2024-01-01T10:00:00.123+00:00`
/// - `2024-01-01T10:00:00` (naive UTC)
///
/// Returns `None` if the string cannot be parsed as a valid date-time.
pub fn parse_timestamp_ms(s: &str) -> Option<i64> {
    use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
    // Try RFC 3339 / ISO 8601 with offset first
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }
    // Try with space instead of T
    if let Ok(dt) = DateTime::parse_from_rfc3339(&s.replacen(' ', "T", 1)) {
        return Some(dt.timestamp_millis());
    }
    // Naive datetime (assume UTC)
    for fmt in &[
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(Utc.from_utc_datetime(&ndt).timestamp_millis());
        }
    }
    None
}

/// Attribute value types for event data.
///
/// Mirrors the XES standard attribute types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "tag", content = "value")]
pub enum AttributeValue {
    /// UTF-8 string value.
    String(String),
    /// 64-bit signed integer value.
    Int(i64),
    /// 64-bit floating point value.
    Float(f64),
    /// ISO 8601 formatted date string.
    Date(String),
    /// Boolean value.
    Boolean(bool),
    /// List of attribute values.
    List(Vec<AttributeValue>),
    /// Nested container of named attribute values.
    Container(HashMap<String, AttributeValue>),
}

impl AttributeValue {
    /// Return a reference to the inner string if this is a `String` variant.
    #[inline]
    pub fn as_string(&self) -> Option<&str> {
        match self {
            AttributeValue::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Return the inner integer if this is an `Int` variant.
    #[inline]
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            AttributeValue::Int(i) => Some(*i),
            _ => None,
        }
    }

    /// Return the inner float if this is a `Float` variant.
    #[inline]
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            AttributeValue::Float(f) => Some(*f),
            _ => None,
        }
    }

    /// Return the inner boolean if this is a `Boolean` variant.
    #[inline]
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            AttributeValue::Boolean(b) => Some(*b),
            _ => None,
        }
    }
}

/// Type alias for a collection of named attributes.
pub type Attributes = HashMap<String, AttributeValue>;

/// Custom deserializer for OCEL type names.
fn deserialize_ocel_type_names<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum TypeEntry {
        Name(String),
        Object { name: String },
    }
    Vec::<TypeEntry>::deserialize(deserializer).map(|v| {
        v.into_iter()
            .map(|e| match e {
                TypeEntry::Name(s) => s,
                TypeEntry::Object { name } => name,
            })
            .collect()
    })
}

/// Custom deserializer for OCEL attributes.
fn deserialize_ocel_attributes<'de, D>(deserializer: D) -> Result<Attributes, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::{self, Visitor};
    use std::fmt;

    struct AttributesVisitor;

    impl<'de> Visitor<'de> for AttributesVisitor {
        type Value = Attributes;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map or array of {name, value} objects")
        }

        fn visit_map<A>(self, map: A) -> Result<Attributes, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            Deserialize::deserialize(de::value::MapAccessDeserializer::new(map))
        }

        fn visit_seq<A>(self, seq: A) -> Result<Attributes, A::Error>
        where
            A: de::SeqAccess<'de>,
        {
            #[derive(Deserialize)]
            struct NamedAttribute {
                name: String,
                #[serde(default)]
                value: Option<serde_json::Value>,
            }

            fn json_to_attr(v: serde_json::Value) -> AttributeValue {
                match v {
                    serde_json::Value::String(s) => AttributeValue::String(s),
                    serde_json::Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            AttributeValue::Int(i)
                        } else {
                            AttributeValue::Float(n.as_f64().unwrap_or(0.0))
                        }
                    }
                    serde_json::Value::Bool(b) => AttributeValue::Boolean(b),
                    other => AttributeValue::String(other.to_string()),
                }
            }

            let visitor = de::value::SeqAccessDeserializer::new(seq);
            let attrs: Vec<NamedAttribute> = Deserialize::deserialize(visitor)?;
            let mut result = Attributes::new();
            for attr in attrs {
                if let Some(v) = attr.value {
                    result.insert(attr.name, json_to_attr(v));
                }
            }
            Ok(result)
        }
    }

    deserializer.deserialize_any(AttributesVisitor)
}

/// A single event within a trace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// Attributes associated with this event (e.g., activity name, timestamp).
    pub attributes: Attributes,
}

impl Default for Event {
    fn default() -> Self {
        Self::new()
    }
}

impl Event {
    /// Create a new event with empty attributes.
    #[must_use]
    pub fn new() -> Self {
        Event {
            attributes: HashMap::default(),
        }
    }
}

/// A trace representing a single process instance (case).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trace {
    /// Attributes associated with the case (e.g., case ID, customer ID).
    pub attributes: Attributes,
    /// Ordered sequence of events in this case.
    pub events: Vec<Event>,
}

impl Default for Trace {
    fn default() -> Self {
        Self::new()
    }
}

impl Trace {
    /// Create a new trace with empty attributes and events.
    #[must_use]
    pub fn new() -> Self {
        Trace {
            attributes: HashMap::default(),
            events: Vec::default(),
        }
    }
}

/// An event log containing a collection of traces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventLog {
    /// Global attributes for the event log.
    pub attributes: Attributes,
    /// List of traces (cases) in the log.
    pub traces: Vec<Trace>,
}

/// An admitted event log wrapped in a process evidence carrier.
pub type AdmittedEventLog<W = ()> =
    wasm4pm_compat::evidence::Evidence<EventLog, wasm4pm_compat::state::Admitted, W>;

/// An admitted process tree wrapped in a process evidence carrier.
pub type TypedProcessTree<W = wasm4pm_compat::witness::InductiveMiner> =
    wasm4pm_compat::evidence::Evidence<
        wasm4pm_compat::process_tree::ProcessTree,
        wasm4pm_compat::state::Admitted,
        W,
    >;

/// An admitted POWL model wrapped in a process evidence carrier.
pub type TypedPowl<W = wasm4pm_compat::witness::PowlPaper> = wasm4pm_compat::evidence::Evidence<
    wasm4pm_compat::powl::Powl,
    wasm4pm_compat::state::Admitted,
    W,
>;

fn convert_attribute_value(val: wasm4pm_types::AttributeValue) -> Option<AttributeValue> {
    match val {
        wasm4pm_types::AttributeValue::String(s) => Some(AttributeValue::String(s)),
        wasm4pm_types::AttributeValue::Date(d) => Some(AttributeValue::Date(d.to_rfc3339())),
        wasm4pm_types::AttributeValue::Int(i) => Some(AttributeValue::Int(i)),
        wasm4pm_types::AttributeValue::Float(f) => Some(AttributeValue::Float(f)),
        wasm4pm_types::AttributeValue::Boolean(b) => Some(AttributeValue::Boolean(b)),
        wasm4pm_types::AttributeValue::ID(id) => Some(AttributeValue::String(id.to_string())),
        wasm4pm_types::AttributeValue::List(l) => {
            let mut list = Vec::new();
            for attr in l {
                if let Some(cv) = convert_attribute_value(attr.value) {
                    list.push(cv);
                }
            }
            Some(AttributeValue::List(list))
        }
        wasm4pm_types::AttributeValue::Container(c) => {
            let mut map = HashMap::new();
            for attr in c {
                if let Some(cv) = convert_attribute_value(attr.value) {
                    map.insert(attr.key, cv);
                }
            }
            Some(AttributeValue::Container(map))
        }
        wasm4pm_types::AttributeValue::None() => None,
    }
}

fn convert_attributes(attrs: wasm4pm_types::Attributes) -> HashMap<String, AttributeValue> {
    let mut map = HashMap::new();
    for attr in attrs {
        if let Some(cv) = convert_attribute_value(attr.value) {
            map.insert(attr.key, cv);
        }
    }
    map
}

impl From<wasm4pm_types::EventLog> for EventLog {
    fn from(log: wasm4pm_types::EventLog) -> Self {
        let mut traces = Vec::with_capacity(log.traces.len());
        for trace in log.traces {
            let mut events = Vec::with_capacity(trace.events.len());
            for event in trace.events {
                events.push(Event {
                    attributes: convert_attributes(event.attributes),
                });
            }
            traces.push(Trace {
                attributes: convert_attributes(trace.attributes),
                events,
            });
        }
        EventLog {
            attributes: convert_attributes(log.attributes),
            traces,
        }
    }
}

/// Columnar, integer-encoded view of an event log.
///
/// Activities are encoded as `u32` IDs so that edge/frequency counting uses
/// fixed-width integer hash keys (~12 bytes/entry) instead of heap-allocated
/// `(String, String)` pairs (~80 bytes/entry). The flat `events` array gives
/// sequential memory access for the inner DFG loop.
///
/// Both `events` and `trace_offsets` use `Cow<'a, [T]>` so that
/// `ColumnarLog::from_owned` can borrow directly from an `OwnedColumnarLog`
/// (zero allocation) while `EventLog::to_columnar` still works by wrapping
/// freshly-built `Vec`s in `Cow::Owned`.
pub struct ColumnarLog<'a> {
    /// Flat array of activity IDs across all traces (trace 0 events, trace 1 events, …).
    pub events: Cow<'a, [u32]>,
    /// `trace_offsets[t]` = start index of trace `t` in `events`.
    /// Has one extra sentinel entry at the end equal to `events.len()`.
    pub trace_offsets: Cow<'a, [usize]>,
    /// `vocab[id]` = the activity string for integer id `id`.
    pub vocab: Vec<&'a str>,
}

impl<'a> ColumnarLog<'a> {
    /// Create a borrowed `ColumnarLog` view from an owned `OwnedColumnarLog`.
    ///
    /// All three fields are borrowed — no heap allocation occurs.
    /// `events` and `trace_offsets` are `Cow::Borrowed` slices into `owned`;
    /// `vocab` is a `Vec` of `&str` pointers into `owned.vocab` strings.
    #[must_use]
    pub fn from_owned(owned: &'a crate::cache::OwnedColumnarLog) -> Self {
        ColumnarLog {
            events: Cow::Borrowed(owned.events.as_slice()),
            trace_offsets: Cow::Borrowed(owned.trace_offsets.as_slice()),
            vocab: owned.vocab.iter().map(|s| s.as_str()).collect(),
        }
    }

    /// Count length-1 loops (self-loops: A -> A) across all traces.
    pub fn count_loops_length_1(&self) -> usize {
        let mut count = 0;
        for t in 0..self.trace_offsets.len().saturating_sub(1) {
            let start = self.trace_offsets[t];
            let end = self.trace_offsets[t + 1];
            if end > start + 1 {
                for i in start..end - 1 {
                    if self.events[i] == self.events[i + 1] {
                        count += 1;
                    }
                }
            }
        }
        count
    }

    /// Count length-2 loops (short cycles: A -> B -> A) across all traces.
    /// Excludes length-1 loops (A -> A -> A is counted as two L1 loops, not an L2 loop).
    pub fn count_loops_length_2(&self) -> usize {
        let mut count = 0;
        for t in 0..self.trace_offsets.len().saturating_sub(1) {
            let start = self.trace_offsets[t];
            let end = self.trace_offsets[t + 1];
            if end > start + 2 {
                for i in start..end - 2 {
                    if self.events[i] == self.events[i + 2] && self.events[i] != self.events[i + 1]
                    {
                        count += 1;
                    }
                }
            }
        }
        count
    }

    /// Returns the number of traces that contain at least one loop (L1 or L2).
    pub fn count_traces_with_rework(&self) -> usize {
        let mut count = 0;
        for t in 0..self.trace_offsets.len().saturating_sub(1) {
            let start = self.trace_offsets[t];
            let end = self.trace_offsets[t + 1];
            let mut has_rework = false;

            // Check L1
            if end > start + 1 {
                for i in start..end - 1 {
                    if self.events[i] == self.events[i + 1] {
                        has_rework = true;
                        break;
                    }
                }
            }

            // Check L2 if no L1 found
            if !has_rework && end > start + 2 {
                for i in start..end - 2 {
                    if self.events[i] == self.events[i + 2] && self.events[i] != self.events[i + 1]
                    {
                        has_rework = true;
                        break;
                    }
                }
            }

            if has_rework {
                count += 1;
            }
        }
        count
    }
}

impl EventLog {
    /// Create a new event log with empty attributes and traces.
    #[must_use]
    pub fn new() -> Self {
        EventLog {
            attributes: HashMap::new(),
            traces: Vec::new(),
        }
    }

    /// Return the total number of events across all traces.
    #[inline]
    pub fn event_count(&self) -> usize {
        self.traces.iter().map(|t| t.events.len()).sum()
    }

    /// Return the total number of traces (cases) in the log.
    #[inline]
    pub fn case_count(&self) -> usize {
        self.traces.len()
    }

    /// Build a columnar (integer-encoded) view of this log for cache-efficient bulk ops.
    ///
    /// Single pass: builds vocabulary (activity → u32) and encodes all events into a
    /// flat `Vec<u32>`.  The caller can then run DFG/heuristic counting with
    /// `HashMap<(u32,u32), usize>` — integer keys hash and compare in ~1 cycle
    /// vs. O(len) for `String` keys.
    pub fn to_columnar<'a>(&'a self, activity_key: &str) -> ColumnarLog<'a> {
        let total: usize = self.traces.iter().map(|t| t.events.len()).sum();
        let mut events = Vec::with_capacity(total);
        let mut trace_offsets = Vec::with_capacity(self.traces.len() + 1);
        let mut vocab_map: FxHashMap<&'a str, u32> = FxHashMap::default();
        let mut vocab: Vec<&'a str> = Vec::new();

        for trace in &self.traces {
            trace_offsets.push(events.len());
            for event in &trace.events {
                if let Some(act) = event
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                {
                    let next_id = vocab.len() as u32;
                    let id = *vocab_map.entry(act).or_insert_with(|| {
                        vocab.push(act);
                        next_id
                    });
                    events.push(id);
                }
            }
        }
        trace_offsets.push(events.len()); // sentinel

        ColumnarLog {
            events: Cow::Owned(events),
            trace_offsets: Cow::Owned(trace_offsets),
            vocab,
        }
    }

    /// Build an owned columnar representation suitable for caching.
    ///
    /// Same algorithm as `to_columnar` but produces an `OwnedColumnarLog` with
    /// heap-allocated strings instead of borrowed references.  The result can
    /// be stored in the columnar cache and reused across calls.
    pub fn to_columnar_owned(&self, activity_key: &str) -> crate::cache::OwnedColumnarLog {
        let total: usize = self.traces.iter().map(|t| t.events.len()).sum();
        let mut events = Vec::with_capacity(total);
        let mut trace_offsets = Vec::with_capacity(self.traces.len() + 1);
        let mut vocab_map: FxHashMap<&str, u32> = FxHashMap::default();
        let mut vocab: Vec<String> = Vec::new();

        for trace in &self.traces {
            trace_offsets.push(events.len());
            for event in &trace.events {
                if let Some(act) = event
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                {
                    let next_id = vocab.len() as u32;
                    let id = *vocab_map.entry(act).or_insert_with(|| {
                        vocab.push(act.to_owned());
                        next_id
                    });
                    events.push(id);
                }
            }
        }
        trace_offsets.push(events.len()); // sentinel

        crate::cache::OwnedColumnarLog {
            events,
            trace_offsets,
            vocab,
        }
    }

    /// Get unique activity names. Uses `to_columnar` internally so dedup is O(n).
    #[inline]
    pub fn get_activities(&self, activity_key: &str) -> Vec<String> {
        self.to_columnar(activity_key)
            .vocab
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    /// Get directly-follows relations as `(from, to, count)` triples.
    ///
    /// Uses `to_columnar` + `HashMap<(u32,u32), usize>` for integer-keyed counting —
    /// ~6× smaller entries and ~3× faster hashing vs. `HashMap<(String,String), usize>`.
    #[inline]
    pub fn get_directly_follows(&self, activity_key: &str) -> Vec<(String, String, usize)> {
        let col = self.to_columnar(activity_key);
        let mut counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

        for t in 0..col.trace_offsets.len().saturating_sub(1) {
            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];
            for i in start..end.saturating_sub(1) {
                *counts
                    .entry((col.events[i], col.events[i + 1]))
                    .or_insert(0) += 1;
            }
        }
        counts
            .into_iter()
            .map(|((from, to), count)| {
                (
                    col.vocab[from as usize].to_string(),
                    col.vocab[to as usize].to_string(),
                    count,
                )
            })
            .collect()
    }

    /// Get all traces as activity sequences.
    #[inline]
    pub fn get_traces(&self, activity_key: &str) -> Vec<Vec<String>> {
        let col = self.to_columnar(activity_key);
        let mut traces = Vec::with_capacity(col.trace_offsets.len().saturating_sub(1));

        for t in 0..col.trace_offsets.len().saturating_sub(1) {
            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];
            let mut sequence = Vec::with_capacity(end - start);
            for i in start..end {
                sequence.push(col.vocab[col.events[i] as usize].to_string());
            }
            traces.push(sequence);
        }
        traces
    }
}

/// OCEL Object Attribute definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELObjectAttribute {
    /// Name of the object attribute.
    pub name: String,
    /// Type of the object attribute (e.g., "string", "float").
    pub attribute_type: String,
}

/// OCEL Event Attribute definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELEventAttribute {
    /// Name of the event attribute.
    pub name: String,
    /// Type of the event attribute (e.g., "string", "float").
    pub attribute_type: String,
}

/// OCEL Event-Object Reference (OCEL 2.0).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELEventObjectRef {
    /// ID of the referenced object.
    #[serde(rename = "objectId", alias = "object_id")]
    pub object_id: String,
    /// Qualifier for the relationship (e.g., "item", "customer").
    pub qualifier: String,
}

/// OCEL Object Attribute Change (OCEL 2.0).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELObjectAttributeChange {
    /// Timestamp when the attribute changed.
    pub timestamp: String,
    /// Name of the attribute that changed.
    pub attribute_name: String,
    /// New value of the attribute.
    pub value: AttributeValue,
}

/// OCEL Object Relation (OCEL 2.0).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELObjectRelation {
    /// ID of the source object.
    pub source_id: String,
    /// ID of the target object.
    pub target_id: String,
    /// Qualifier for the relationship (e.g., "belongs-to").
    pub qualifier: String,
}

/// A single event in an Object-Centric Event Log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELEvent {
    /// Unique identifier for the event.
    pub id: String,
    /// Type of the event (activity).
    #[serde(rename = "type", alias = "event_type")]
    pub event_type: String,
    /// ISO 8601 timestamp of the event.
    #[serde(rename = "time", alias = "timestamp")]
    pub timestamp: String,
    /// Event attributes.
    #[serde(default, deserialize_with = "deserialize_ocel_attributes")]
    pub attributes: HashMap<String, AttributeValue>,
    /// List of object IDs directly associated with this event (OCEL 1.0).
    #[serde(default)]
    pub object_ids: Vec<String>,
    /// Structured relationships to objects (OCEL 2.0).
    #[serde(rename = "relationships", alias = "object_refs", default)]
    pub object_refs: Vec<OCELEventObjectRef>,
}

impl OCELEvent {
    /// Extract all associated object IDs from both `object_ids` and `object_refs`.
    pub fn all_object_ids(&self) -> impl Iterator<Item = &str> {
        self.object_ids
            .iter()
            .map(|s| s.as_str())
            .chain(self.object_refs.iter().map(|r| r.object_id.as_str()))
    }

    /// Extract object IDs from object_refs only (deprecated, use all_object_ids).
    #[deprecated(since = "0.6.0", note = "use all_object_ids() instead")]
    pub fn get_object_ids(&self) -> Vec<String> {
        self.object_refs
            .iter()
            .map(|r| r.object_id.clone())
            .collect()
    }
}

/// OCEL Object Relation Reference (for embedded relations in objects).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELObjectRelRef {
    /// ID of the referenced object.
    #[serde(rename = "objectId", alias = "object_id")]
    pub object_id: String,
    /// Qualifier for the relationship.
    pub qualifier: String,
}

/// A single object in an Object-Centric Event Log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELObject {
    /// Unique identifier for the object.
    pub id: String,
    /// Type of the object.
    #[serde(rename = "type", alias = "object_type")]
    pub object_type: String,
    /// Initial object attributes.
    #[serde(default, deserialize_with = "deserialize_ocel_attributes")]
    pub attributes: HashMap<String, AttributeValue>,
    /// History of attribute changes (OCEL 2.0).
    #[serde(default)]
    pub changes: Vec<OCELObjectAttributeChange>,
    /// Embedded relationships to other objects.
    #[serde(rename = "relationships", default)]
    pub embedded_relations: Vec<OCELObjectRelRef>,
}

/// An Object-Centric Event Log (OCEL).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCEL {
    /// List of all event types (activities) in the log.
    #[serde(
        rename = "eventTypes",
        alias = "event_types",
        default,
        deserialize_with = "deserialize_ocel_type_names"
    )]
    pub event_types: Vec<String>,
    /// List of all object types in the log.
    #[serde(
        rename = "objectTypes",
        alias = "object_types",
        default,
        deserialize_with = "deserialize_ocel_type_names"
    )]
    pub object_types: Vec<String>,
    /// All events in the log.
    #[serde(default)]
    pub events: Vec<OCELEvent>,
    /// All objects in the log.
    #[serde(default)]
    pub objects: Vec<OCELObject>,
    /// Global object-to-object relations.
    #[serde(default)]
    pub object_relations: Vec<OCELObjectRelation>,
}

impl OCEL {
    /// Create a new empty OCEL.
    #[must_use]
    pub fn new() -> Self {
        OCEL {
            event_types: Vec::new(),
            object_types: Vec::new(),
            events: Vec::new(),
            objects: Vec::new(),
            object_relations: Vec::new(),
        }
    }

    /// Return the total number of events in the log.
    pub fn event_count(&self) -> usize {
        self.events.len()
    }

    /// Return the total number of objects in the log.
    pub fn object_count(&self) -> usize {
        self.objects.len()
    }

    /// Normalize object relations: merge embedded relations from objects into global object_relations.
    ///
    /// Call this after deserialization if the OCEL 2.0 JSON contained relations in objects.
    pub fn normalize_relations(&mut self) {
        let mut all_relations = self.object_relations.clone();
        for obj in &self.objects {
            for rel in &obj.embedded_relations {
                all_relations.push(OCELObjectRelation {
                    source_id: obj.id.clone(),
                    target_id: rel.object_id.clone(),
                    qualifier: rel.qualifier.clone(),
                });
            }
        }
        self.object_relations = all_relations;
    }
}

/// A place in a Petri Net.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetriNetPlace {
    /// Unique identifier for the place.
    pub id: String,
    /// Human-readable label for the place.
    pub label: String,
    /// Initial marking (token count) for this place.
    pub marking: Option<usize>,
}

/// A transition in a Petri Net.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetriNetTransition {
    /// Unique identifier for the transition.
    pub id: String,
    /// Human-readable label (activity name).
    pub label: String,
    /// Whether this is an invisible transition (silent step).
    pub is_invisible: Option<bool>,
}

/// An arc in a Petri Net connecting a place to a transition or vice versa.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetriNetArc {
    /// ID of the source element (place or transition).
    pub from: String,
    /// ID of the target element (place or transition).
    pub to: String,
    /// Weight of the arc (number of tokens moved).
    pub weight: Option<usize>,
}

/// A Petri Net process model.
///
/// Petri Nets provide a formal and precise representation of process workflows,
/// supporting concurrency, synchronization, and conflict resolution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetriNet {
    /// All places in the net.
    pub places: Vec<PetriNetPlace>,
    /// All transitions in the net.
    pub transitions: Vec<PetriNetTransition>,
    /// All arcs in the net.
    pub arcs: Vec<PetriNetArc>,
    /// Initial marking mapping place ID to token count.
    pub initial_marking: HashMap<String, usize>,
    /// List of accepting final markings (place ID to token count).
    pub final_markings: Vec<HashMap<String, usize>>,
}

impl PetriNet {
    /// Create a new empty Petri Net.
    #[must_use]
    pub fn new() -> Self {
        PetriNet {
            places: Vec::new(),
            transitions: Vec::new(),
            arcs: Vec::new(),
            initial_marking: HashMap::new(),
            final_markings: Vec::new(),
        }
    }
}

/// A single directly-follows edge in a DFG.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectlyFollowsRelation {
    /// ID of the source activity.
    pub from: String,
    /// ID of the target activity.
    pub to: String,
    /// Number of times this relation appears in the log.
    pub frequency: usize,
}

/// A Directly-Follows Graph (DFG) representing process flow.
///
/// The DFG shows which activities directly follow each other in the event log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectlyFollowsGraph {
    /// Activities in the graph with their occurrence frequencies.
    pub nodes: Vec<DFGNode>,
    /// Directed edges representing directly-follows relations.
    pub edges: Vec<DirectlyFollowsRelation>,
    /// Activities that start traces, with their frequencies.
    pub start_activities: BTreeMap<String, usize>,
    /// Activities that end traces, with their frequencies.
    pub end_activities: BTreeMap<String, usize>,
}

/// A node in a Directly-Follows Graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DFGNode {
    /// Unique identifier for the activity.
    pub id: String,
    /// Human-readable name of the activity.
    pub label: String,
    /// Total number of times this activity occurs in the log.
    pub frequency: usize,
}

impl DirectlyFollowsGraph {
    /// Create a new empty Directly-Follows Graph.
    #[must_use]
    pub fn new() -> Self {
        DirectlyFollowsGraph {
            nodes: Vec::new(),
            edges: Vec::new(),
            start_activities: BTreeMap::new(),
            end_activities: BTreeMap::new(),
        }
    }
}

/// A single DECLARE constraint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclareConstraint {
    /// Template name (e.g., "Response", "Precedence").
    pub template: String,
    /// Activities involved in the constraint.
    pub activities: Vec<String>,
    /// Percentage of traces that satisfy the constraint.
    pub support: f64,
    /// Probability that the constraint holds given the trigger activity.
    pub confidence: f64,
}

/// A DECLARE model containing declarative process rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclareModel {
    /// List of constraints with support and confidence metrics.
    pub constraints: Vec<DeclareConstraint>,
    /// List of all activities referenced in the model.
    pub activities: Vec<String>,
}

impl DeclareModel {
    /// Create a new empty DECLARE model.
    #[must_use]
    pub fn new() -> Self {
        DeclareModel {
            constraints: Vec::new(),
            activities: Vec::new(),
        }
    }
}

/// Deviation detected during token-based replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenReplayDeviation {
    /// Index of the event in the trace where the deviation occurred.
    pub event_index: usize,
    /// Name of the activity being replayed.
    pub activity: String,
    /// Type of deviation (e.g., "missing_token", "remaining_token").
    pub deviation_type: String,
}

/// Result of token-based replay for a single case.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenReplayResult {
    /// Identifier of the case.
    pub case_id: String,
    /// Whether the trace perfectly conforms to the model.
    pub is_conforming: bool,
    /// Fitness score for the trace [0.0, 1.0].
    pub trace_fitness: f64,
    /// Number of tokens that were missing during replay.
    pub tokens_missing: usize,
    /// Number of tokens remaining in the net after replay.
    pub tokens_remaining: usize,
    /// List of specific deviations found.
    pub deviations: Vec<TokenReplayDeviation>,
}

/// Overall result of conformance checking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConformanceResult {
    /// Individual replay results for each case.
    pub case_fitness: Vec<TokenReplayResult>,
    /// Average fitness across all cases.
    pub avg_fitness: f64,
    /// Number of cases that perfectly conform to the model.
    pub conforming_cases: usize,
    /// Total number of cases checked.
    pub total_cases: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TraceState {
    #[serde(rename = "ALIVE")]
    Alive,
    #[serde(rename = "FAKE-LIVE")]
    FakeLive,
    #[serde(rename = "BLOCKED")]
    Blocked,
}

/// Deviation detected in a streaming context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingConformanceDeviation {
    /// Position in the sequence where the deviation occurred.
    pub position: usize,
    /// Preceding activity name.
    pub from_activity: String,
    /// Succeeding activity name.
    pub to_activity: String,
}

/// Result of streaming conformance checking for a single trace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingConformanceTraceResult {
    /// Identifier of the case.
    pub case_id: String,
    /// Whether the trace conforms to the reference model.
    pub is_conforming: bool,
    /// The trace state classification: ALIVE, FAKE-LIVE, or BLOCKED.
    pub state: TraceState,
    /// List of deviations found.
    pub deviations: Vec<StreamingConformanceDeviation>,
    /// Fitness score for the trace [0.0, 1.0].
    pub fitness: f64,
}

#[derive(Clone, Debug)]
pub struct AStarFrontier {
    pub open_set: BinaryHeap<AlignmentState>,
    pub closed_set: HashSet<(usize, Vec<usize>)>,
}

#[derive(Debug, Clone)]
pub struct OpenTraceState {
    pub activities: Vec<String>,
    pub marking: Vec<usize>,
    pub produced_tokens: usize,
    pub consumed_tokens: usize,
    pub missing_tokens: usize,
    pub state: TraceState,
    pub astar_frontier: Option<AStarFrontier>,
}

/// Helper to check if a marking matches any accepting final marking.
pub fn is_final_marking(
    net: &PetriNet,
    place_index: &FxHashMap<&String, usize>,
    marking: &[usize],
) -> bool {
    if net.final_markings.is_empty() {
        let mut sink_indices = Vec::new();
        for p in &net.places {
            if !net.arcs.iter().any(|arc| arc.from == p.id) {
                if let Some(&idx) = place_index.get(&p.id) {
                    sink_indices.push(idx);
                }
            }
        }
        if !sink_indices.is_empty() {
            let mut sink_has_token = false;
            for (i, &tokens) in marking.iter().enumerate() {
                if sink_indices.contains(&i) {
                    if tokens == 1 {
                        sink_has_token = true;
                    } else if tokens > 1 {
                        return false;
                    }
                } else if tokens > 0 {
                    return false;
                }
            }
            return sink_has_token;
        }
        return marking.iter().sum::<usize>() == 0;
    }
    net.final_markings.iter().any(|final_marking| {
        net.places.iter().enumerate().all(|(i, p)| {
            let expected = final_marking.get(&p.id).copied().unwrap_or(0);
            marking.get(i).copied().unwrap_or(0) == expected
        })
    })
}

/// Helper to determine if a final marking is reachable from the current marking.
/// Explores the marking reachability graph up to a safe search depth limit.
pub fn is_final_reachable(
    net: &PetriNet,
    start_marking: &[usize],
    place_index: &FxHashMap<&String, usize>,
) -> bool {
    if is_final_marking(net, place_index, start_marking) {
        return true;
    }

    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();

    let start_vec = start_marking.to_vec();
    queue.push_back(start_vec.clone());
    visited.insert(start_vec);

    // Compile input/output place indices per transition
    let mut trans_inputs = vec![Vec::new(); net.transitions.len()];
    let mut trans_outputs = vec![Vec::new(); net.transitions.len()];
    for arc in &net.arcs {
        if let (Some(&p_idx), Some(t_idx)) = (
            place_index.get(&arc.from),
            net.transitions.iter().position(|t| t.id == arc.to),
        ) {
            trans_inputs[t_idx].push(p_idx);
        }
        if let (Some(t_idx), Some(&p_idx)) = (
            net.transitions.iter().position(|t| t.id == arc.from),
            place_index.get(&arc.to),
        ) {
            trans_outputs[t_idx].push(p_idx);
        }
    }

    let max_states = 1000; // Hard boundary to prevent infinite loops in cyclic nets
    let mut states_explored = 0;

    while let Some(current) = queue.pop_front() {
        states_explored += 1;
        if states_explored > max_states {
            break;
        }

        if is_final_marking(net, place_index, &current) {
            return true;
        }

        // Generate successor markings by firing any enabled transition
        for (t_idx, _) in net.transitions.iter().enumerate() {
            let enabled = trans_inputs[t_idx].iter().all(|&p_idx| current[p_idx] > 0);

            if enabled {
                let mut next_marking = current.clone();
                for &p_idx in &trans_inputs[t_idx] {
                    next_marking[p_idx] = next_marking[p_idx].saturating_sub(1);
                }
                for &p_idx in &trans_outputs[t_idx] {
                    next_marking[p_idx] += 1;
                }

                if !visited.contains(&next_marking) {
                    visited.insert(next_marking.clone());
                    queue.push_back(next_marking);
                }
            }
        }
    }

    false
}

/// Streaming incremental conformance checker. Supports either Directly-Follows Graph checking

/// or Token Replay on a Petri Net.
#[derive(Debug, Clone)]
pub struct StreamingConformanceChecker {
    // DFG Mode fields
    pub dfg_edges: Option<std::collections::HashSet<(String, String)>>,
    pub start_activities: Option<std::collections::HashSet<String>>,
    pub end_activities: Option<std::collections::HashSet<String>>,

    // Petri Net Mode fields
    pub net: Option<crate::models::PetriNet>,
    pub incidence: Option<wasm4pm_types::models::FlatIncidenceMatrix>,

    // Shared state
    pub open_traces: HashMap<String, OpenTraceState>,
    pub results: Vec<StreamingConformanceTraceResult>,
    pub event_count: usize,
}

impl StreamingConformanceChecker {
    /// Create a new checker from a Directly-Follows Graph.
    #[must_use]
    pub fn from_dfg(dfg: DirectlyFollowsGraph) -> Self {
        let dfg_edges: std::collections::HashSet<(String, String)> = dfg
            .edges
            .iter()
            .map(|e| (e.from.clone(), e.to.clone()))
            .collect();
        let start_activities: std::collections::HashSet<String> =
            dfg.start_activities.keys().cloned().collect();
        let end_activities: std::collections::HashSet<String> =
            dfg.end_activities.keys().cloned().collect();

        StreamingConformanceChecker {
            dfg_edges: Some(dfg_edges),
            start_activities: Some(start_activities),
            end_activities: Some(end_activities),
            net: None,
            incidence: None,
            open_traces: HashMap::new(),
            results: Vec::new(),
            event_count: 0,
        }
    }

    /// Create a new checker from a reference `PetriNet`.
    #[must_use]
    pub fn from_petri_net(net: crate::models::PetriNet) -> Self {
        let p_count = net.places.len();
        let t_count = net.transitions.len();
        let mut data = vec![0; p_count * t_count];

        let place_idx: HashMap<&str, usize> = net
            .places
            .iter()
            .enumerate()
            .map(|(i, p)| (p.id.as_str(), i))
            .collect();
        let trans_idx: HashMap<&str, usize> = net
            .transitions
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.as_str(), i))
            .collect();

        for arc in &net.arcs {
            let weight = arc.weight.unwrap_or(1) as i32;
            if let (Some(&p), Some(&t)) = (
                place_idx.get(arc.from.as_str()),
                trans_idx.get(arc.to.as_str()),
            ) {
                data[p * t_count + t] -= weight;
            } else if let (Some(&t), Some(&p)) = (
                trans_idx.get(arc.from.as_str()),
                place_idx.get(arc.to.as_str()),
            ) {
                data[p * t_count + t] += weight;
            }
        }

        let incidence = wasm4pm_types::models::FlatIncidenceMatrix {
            data,
            places_count: p_count,
            transitions_count: t_count,
        };

        StreamingConformanceChecker {
            dfg_edges: None,
            start_activities: None,
            end_activities: None,
            net: Some(net),
            incidence: Some(incidence),
            open_traces: HashMap::new(),
            results: Vec::new(),
            event_count: 0,
        }
    }

    /// Append one event to an in-progress trace and update incremental fitness.
    pub fn add_event(&mut self, case_id: &str, activity: &str) {
        self.event_count += 1;

        if self.net.is_some() {
            let p_count = self.incidence.as_ref().unwrap().places_count;
            let net = self.net.as_ref().unwrap();
            let incidence = self.incidence.as_ref().unwrap();

            let state = self
                .open_traces
                .entry(case_id.to_string())
                .or_insert_with(|| {
                    let mut marking = vec![0; p_count];
                    let mut produced_tokens = 0;
                    for (i, p) in net.places.iter().enumerate() {
                        if let Some(&tokens) = net.initial_marking.get(&p.id) {
                            marking[i] = tokens;
                            produced_tokens += tokens;
                        }
                    }
                    if produced_tokens == 0 && !net.places.is_empty() {
                        marking[0] = 1;
                        produced_tokens = 1;
                    }
                    OpenTraceState {
                        activities: Vec::new(),
                        marking,
                        produced_tokens,
                        consumed_tokens: 0,
                        missing_tokens: 0,
                        state: TraceState::Alive,
                        astar_frontier: None,
                    }
                });

            state.activities.push(activity.to_string());

            let mut t_idx_opt = None;
            for (t_idx, t) in net.transitions.iter().enumerate() {
                if !t.is_invisible.unwrap_or(false) && t.label == activity {
                    let mut enabled = true;
                    for p_idx in 0..p_count {
                        let weight = incidence.get(p_idx, t_idx);
                        if weight < 0 {
                            let needed = (-weight) as usize;
                            if state.marking[p_idx] < needed {
                                enabled = false;
                                break;
                            }
                        }
                    }
                    if enabled {
                        t_idx_opt = Some(t_idx);
                        break;
                    }
                    if t_idx_opt.is_none() {
                        t_idx_opt = Some(t_idx);
                    }
                }
            }

            if let Some(t_idx) = t_idx_opt {
                // Consume tokens
                for p_idx in 0..p_count {
                    let weight = incidence.get(p_idx, t_idx);
                    if weight < 0 {
                        let needed = (-weight) as usize;
                        if state.marking[p_idx] >= needed {
                            state.marking[p_idx] -= needed;
                        } else {
                            state.missing_tokens += needed - state.marking[p_idx];
                            state.marking[p_idx] = 0;
                        }
                        state.consumed_tokens += needed;
                    }
                }
                // Produce tokens
                for p_idx in 0..p_count {
                    let weight = incidence.get(p_idx, t_idx);
                    if weight > 0 {
                        state.marking[p_idx] += weight as usize;
                        state.produced_tokens += weight as usize;
                    }
                }
            } else {
                state.missing_tokens += 1;
                state.consumed_tokens += 1;
            }

            // State Classification (ALIVE / FAKE-LIVE / BLOCKED)
            if state.missing_tokens > 0 {
                state.state = TraceState::Blocked;
            } else {
                let place_index: FxHashMap<&String, usize> = net
                    .places
                    .iter()
                    .enumerate()
                    .map(|(i, p)| (&p.id, i))
                    .collect();
                if is_final_reachable(net, &state.marking, &place_index) {
                    state.state = TraceState::Alive;
                } else {
                    state.state = TraceState::FakeLive;
                }
            }

            // Incremental A* Alignment Search Caching
            let config = AlignmentFitnessConfig::default();
            let k = state.activities.len();

            let place_index: FxHashMap<&String, usize> = net
                .places
                .iter()
                .enumerate()
                .map(|(i, p)| (&p.id, i))
                .collect();
            let transition_index: FxHashMap<&String, usize> = net
                .transitions
                .iter()
                .enumerate()
                .map(|(i, t)| (&t.id, i))
                .collect();
            let mut trans_inputs: Vec<Vec<usize>> = vec![Vec::new(); net.transitions.len()];
            let mut trans_outputs: Vec<Vec<usize>> = vec![Vec::new(); net.transitions.len()];
            for arc in &net.arcs {
                if let (Some(&place_idx), Some(&trans_idx)) =
                    (place_index.get(&arc.from), transition_index.get(&arc.to))
                {
                    trans_inputs[trans_idx].push(place_idx);
                }
                if let (Some(&trans_idx), Some(&place_idx)) =
                    (transition_index.get(&arc.from), place_index.get(&arc.to))
                {
                    trans_outputs[trans_idx].push(place_idx);
                }
            }

            let is_new = state.astar_frontier.is_none();
            let frontier = state.astar_frontier.get_or_insert_with(|| {
                let mut initial_marking = vec![0usize; net.places.len()];
                for (place, &count) in &net.initial_marking {
                    if let Some(&idx) = place_index.get(place) {
                        initial_marking[idx] = count;
                    }
                }
                let mut heap = BinaryHeap::new();
                heap.push(AlignmentState {
                    trace_pos: 0,
                    marking: initial_marking,
                    g_cost: 0.0,
                    h_cost: (k as f64) * config.log_move_cost.min(config.model_move_cost),
                    path: Vec::new(),
                });
                AStarFrontier {
                    open_set: heap,
                    closed_set: HashSet::new(),
                }
            });

            if !is_new {
                let mut heap_vec = frontier.open_set.drain().collect::<Vec<_>>();
                let cost_diff = config.log_move_cost.min(config.model_move_cost);
                for s in &mut heap_vec {
                    s.h_cost += cost_diff;
                }
                frontier.open_set = BinaryHeap::from(heap_vec);
            }

            // Resume search to align prefix of length k
            let mut iterations = 0;
            while let Some(current) = frontier.open_set.pop() {
                iterations += 1;
                if iterations > config.max_iterations {
                    frontier.open_set.push(current);
                    break;
                }

                if current.trace_pos >= k {
                    frontier.open_set.push(current);
                    break;
                }

                let state_key = (current.trace_pos, current.marking.clone());
                if frontier.closed_set.contains(&state_key) {
                    continue;
                }
                frontier.closed_set.insert(state_key);

                #[cfg(feature = "alignment_fitness")]
                crate::alignment_fitness::generate_successors(
                    &state.activities,
                    net,
                    &place_index,
                    &trans_inputs,
                    &trans_outputs,
                    &config,
                    &current,
                    &mut frontier.open_set,
                );
                #[cfg(not(feature = "alignment_fitness"))]
                {
                    // Placeholder if alignment_fitness feature is not enabled
                    panic!(
                        "alignment_fitness feature is required for Petri net conformance checking"
                    );
                }
            }
        } else {
            // DFG Mode
            let state = self
                .open_traces
                .entry(case_id.to_string())
                .or_insert_with(|| OpenTraceState {
                    activities: Vec::new(),
                    marking: Vec::new(),
                    produced_tokens: 0,
                    consumed_tokens: 0,
                    missing_tokens: 0,
                    state: TraceState::Alive,
                    astar_frontier: None,
                });
            state.activities.push(activity.to_string());
        }
    }

    /// Close a trace: check final conformance and return the result.
    pub fn close_trace(&mut self, case_id: &str) -> Option<StreamingConformanceTraceResult> {
        let state = self.open_traces.remove(case_id)?;

        let result = if self.net.is_some() {
            let net = self.net.as_ref().unwrap();
            let remaining_tokens: usize = state.marking.iter().sum();

            let denom_c = state.consumed_tokens as f64;
            let denom_p = state.produced_tokens as f64;

            let term1 = if denom_c > 0.0 {
                1.0 - (state.missing_tokens as f64 / denom_c)
            } else {
                1.0
            };
            let term2 = if denom_p > 0.0 {
                1.0 - (remaining_tokens as f64 / denom_p)
            } else {
                1.0
            };
            let fitness = (0.5 * term1 + 0.5 * term2).clamp(0.0, 1.0);

            let final_state = if state.state == TraceState::Blocked {
                TraceState::Blocked
            } else if fitness < 1.0 {
                TraceState::FakeLive
            } else {
                let place_index: FxHashMap<&String, usize> = net
                    .places
                    .iter()
                    .enumerate()
                    .map(|(i, p)| (&p.id, i))
                    .collect();
                let reached_final = is_final_marking(net, &place_index, &state.marking);
                if reached_final {
                    TraceState::Alive
                } else {
                    TraceState::FakeLive
                }
            };

            StreamingConformanceTraceResult {
                case_id: case_id.to_string(),
                is_conforming: final_state == TraceState::Alive,
                state: final_state,
                deviations: vec![],
                fitness,
            }
        } else {
            // DFG Mode
            self.check_trace_dfg(case_id, &state.activities)
        };

        self.results.push(result.clone());
        Some(result)
    }

    fn check_trace_dfg(
        &self,
        case_id: &str,
        activities: &[String],
    ) -> StreamingConformanceTraceResult {
        let mut deviations = Vec::new();

        if activities.is_empty() {
            return StreamingConformanceTraceResult {
                case_id: case_id.to_string(),
                is_conforming: true,
                state: TraceState::Alive,
                deviations,
                fitness: 1.0,
            };
        }

        let mut valid_steps = 0usize;
        let total_steps = if activities.len() > 1 {
            activities.len() - 1
        } else {
            0
        };

        if let Some(ref dfg_edges) = self.dfg_edges {
            for i in 0..total_steps {
                let pair = (activities[i].clone(), activities[i + 1].clone());
                if dfg_edges.contains(&pair) {
                    valid_steps += 1;
                } else {
                    deviations.push(StreamingConformanceDeviation {
                        position: i,
                        from_activity: activities[i].clone(),
                        to_activity: activities[i + 1].clone(),
                    });
                }
            }
        }

        let fitness = if total_steps == 0 {
            1.0
        } else {
            valid_steps as f64 / total_steps as f64
        };

        StreamingConformanceTraceResult {
            case_id: case_id.to_string(),
            is_conforming: deviations.is_empty(),
            state: if deviations.is_empty() {
                TraceState::Alive
            } else {
                TraceState::Blocked
            },
            deviations,
            fitness,
        }
    }
}

/// Temporal profile: per-pair mean and standard-deviation of time differences (ms).
#[derive(Debug, Clone)]
pub struct TemporalProfile {
    /// Mapping of (from, to) activity pairs to their timing statistics (mean, std, count).
    pub pairs: HashMap<(String, String), (f64, f64, usize)>,
}

impl TemporalProfile {
    /// Create a new empty temporal profile.
    #[must_use]
    pub fn new() -> Self {
        TemporalProfile {
            pairs: HashMap::new(),
        }
    }
}

/// N-gram predictor for next-activity forecasting.
#[derive(Debug, Clone)]
pub struct NGramPredictor {
    /// The 'n' in n-gram (length of history considered).
    pub n: usize,
    /// Mapping of activity prefix sequences to next-activity occurrence counts.
    pub counts: HashMap<Vec<String>, HashMap<String, usize>>,
}

impl NGramPredictor {
    /// Create a new N-gram predictor with history length `n`.
    #[must_use]
    pub fn new(n: usize) -> Self {
        NGramPredictor {
            n,
            counts: HashMap::new(),
        }
    }

    /// Return ranked next-activity predictions for a given prefix.
    pub fn predict(&self, prefix: &[String]) -> Vec<(String, f64)> {
        let key_len = self.n.min(prefix.len());
        let key = prefix[prefix.len() - key_len..].to_vec();
        let Some(dist) = self.counts.get(&key) else {
            return vec![];
        };
        let total: usize = dist.values().sum();
        if total == 0 {
            return vec![];
        }
        let mut result: Vec<(String, f64)> = dist
            .iter()
            .map(|(act, &cnt)| (act.clone(), cnt as f64 / total as f64))
            .collect();
        result.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        result
    }
}

impl Default for EventLog {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for OCEL {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for PetriNet {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for DirectlyFollowsGraph {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for DeclareModel {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for TemporalProfile {
    fn default() -> Self {
        Self::new()
    }
}

/// A node in a process tree representation of a workflow.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProcessTreeNode {
    /// Type of node (e.g., "sequence", "xor", "parallel", "loop", "leaf").
    pub node_type: String,
    /// Activity name for leaf nodes.
    pub label: Option<String>,
    /// Child nodes for control structure operators.
    pub children: Vec<ProcessTreeNode>,
}

impl ProcessTreeNode {
    /// Create a leaf node for a specific activity.
    pub fn leaf(activity: String) -> Self {
        Self {
            node_type: "leaf".to_string(),
            label: Some(activity),
            children: vec![],
        }
    }

    /// Create a sequence operator node.
    pub fn sequence(children: Vec<ProcessTreeNode>) -> Self {
        Self {
            node_type: "sequence".to_string(),
            label: None,
            children,
        }
    }

    /// Create an exclusive-choice (XOR) operator node.
    pub fn xor(children: Vec<ProcessTreeNode>) -> Self {
        Self {
            node_type: "xor".to_string(),
            label: None,
            children,
        }
    }

    /// Create a parallel (AND) operator node.
    pub fn parallel(children: Vec<ProcessTreeNode>) -> Self {
        Self {
            node_type: "parallel".to_string(),
            label: None,
            children,
        }
    }

    /// Create a loop operator node.
    pub fn loop_node(body: ProcessTreeNode, redo: ProcessTreeNode) -> Self {
        Self {
            node_type: "loop".to_string(),
            label: None,
            children: vec![body, redo],
        }
    }

    /// Create a flower node (allows any behavior).
    pub fn flower() -> Self {
        Self {
            node_type: "flower".to_string(),
            label: None,
            children: vec![],
        }
    }

    /// Return the total number of nodes in this subtree.
    pub fn count_nodes(&self) -> usize {
        1 + self.children.iter().map(|c| c.count_nodes()).sum::<usize>()
    }
}
