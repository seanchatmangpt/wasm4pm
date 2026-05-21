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
use std::collections::{HashMap, BTreeMap};

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
        },
        wasm4pm_types::AttributeValue::Container(c) => {
            let mut map = HashMap::new();
            for attr in c {
                if let Some(cv) = convert_attribute_value(attr.value) {
                    map.insert(attr.key, cv);
                }
            }
            Some(AttributeValue::Container(map))
        },
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
/// Lifetime is tied to the source `EventLog` — `vocab` borrows its strings.
pub struct ColumnarLog<'a> {
    /// Flat array of activity IDs across all traces (trace 0 events, trace 1 events, …).
    pub events: Vec<u32>,
    /// `trace_offsets[t]` = start index of trace `t` in `events`.
    /// Has one extra sentinel entry at the end equal to `events.len()`.
    pub trace_offsets: Vec<usize>,
    /// `vocab[id]` = the activity string for integer id `id`.
    pub vocab: Vec<&'a str>,
}

impl<'a> ColumnarLog<'a> {
    /// Create a borrowed `ColumnarLog` view from an owned `OwnedColumnarLog`.
    ///
    /// The returned `ColumnarLog` borrows all fields from `owned`,
    /// so `owned` must outlive the returned value.
    /// This is a zero-copy view — the owned data stays alive behind the reference.
    #[must_use]
    pub fn from_owned(owned: &'a crate::cache::OwnedColumnarLog) -> Self {
        ColumnarLog {
            events: owned.events.clone(),
            trace_offsets: owned.trace_offsets.clone(),
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
            events,
            trace_offsets,
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
    #[serde(rename = "eventTypes", alias = "event_types", default, deserialize_with = "deserialize_ocel_type_names")]
    pub event_types: Vec<String>,
    /// List of all object types in the log.
    #[serde(rename = "objectTypes", alias = "object_types", default, deserialize_with = "deserialize_ocel_type_names")]
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
    /// Whether the trace conforms to the reference DFG.
    pub is_conforming: bool,
    /// List of directly-follows deviations found.
    pub deviations: Vec<StreamingConformanceDeviation>,
    /// Fitness score for the trace [0.0, 1.0].
    pub fitness: f64,
}

/// Streaming DFG-based conformance checker.
#[derive(Debug, Clone)]
pub struct StreamingConformanceChecker {
    /// Valid directly-follows pairs from the reference DFG.
    pub dfg_edges: std::collections::HashSet<(String, String)>,
    /// Start activities from the reference DFG.
    pub start_activities: std::collections::HashSet<String>,
    /// End activities from the reference DFG.
    pub end_activities: std::collections::HashSet<String>,
    /// Open traces: case_id → activity sequence.
    pub open_traces: HashMap<String, Vec<String>>,
    /// Accumulated results for closed traces.
    pub results: Vec<StreamingConformanceTraceResult>,
    /// Total events processed by this checker.
    pub event_count: usize,
}

impl StreamingConformanceChecker {
    /// Create a new checker from a reference `DirectlyFollowsGraph`.
    #[must_use]
    pub fn from_dfg(dfg: &DirectlyFollowsGraph) -> Self {
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
            dfg_edges,
            start_activities,
            end_activities,
            open_traces: HashMap::new(),
            results: Vec::new(),
            event_count: 0,
        }
    }

    /// Append one event to an in-progress trace.
    pub fn add_event(&mut self, case_id: &str, activity: &str) {
        self.event_count += 1;
        self.open_traces
            .entry(case_id.to_string())
            .or_default()
            .push(activity.to_string());
    }

    /// Close a trace: check conformance and return the final result.
    ///
    /// Returns `None` if the case ID was not found in open traces.
    pub fn close_trace(&mut self, case_id: &str) -> Option<StreamingConformanceTraceResult> {
        let activities = self.open_traces.remove(case_id)?;
        let result = self.check_trace(case_id, &activities);
        self.results.push(result.clone());
        Some(result)
    }

    fn check_trace(&self, case_id: &str, activities: &[String]) -> StreamingConformanceTraceResult {
        let mut deviations = Vec::new();

        if activities.is_empty() {
            return StreamingConformanceTraceResult {
                case_id: case_id.to_string(),
                is_conforming: true,
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

        for i in 0..total_steps {
            let pair = (activities[i].clone(), activities[i + 1].clone());
            if self.dfg_edges.contains(&pair) {
                valid_steps += 1;
            } else {
                deviations.push(StreamingConformanceDeviation {
                    position: i,
                    from_activity: activities[i].clone(),
                    to_activity: activities[i + 1].clone(),
                });
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
