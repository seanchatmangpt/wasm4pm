//! XES three-level event log hierarchy (Log → Trace → Event → Attribute). Uses BTreeMap for
//! attribute maps so iteration order is deterministic — fixing the HashMap non-determinism bug
//! present in wasm4pm models.rs and conformance.rs.
//!
//! Paper grounding: IEEE 1849-2016 XES standard. van der Aalst 2011 'Process Mining: Discovery,
//! Conformance and Enhancement of Business Processes' §2.1. Attribute type system from XES §5.3
//! (string, int, float, date, boolean, list, container).
//!
//! # Determinism guarantee
//!
//! All attribute maps in this module use [`alloc::collections::BTreeMap`] rather than
//! `HashMap` or `FxHashMap`. This eliminates the non-deterministic iteration order that
//! caused BLAKE3 receipt hash mismatches in wasm4pm (see `models.rs:116` and
//! `conformance.rs` where `Container(HashMap<String, AttributeValue>)` was used).
//! BTreeMap iteration is always lexicographic on the key, making serialisation and
//! hashing fully reproducible across runs, seeds, and platforms.
//!
//! # no_std compatibility
//!
//! This file is `#![no_std]`-compatible. All heap types come from the `alloc` crate.
//! There are no `std::` imports; the `extern crate alloc;` declaration at crate root
//! makes the `alloc` re-exports available.

extern crate alloc;

use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::String;
use alloc::vec::Vec;

// ---------------------------------------------------------------------------
// Primitive type aliases
// ---------------------------------------------------------------------------

/// Nanoseconds since Unix epoch (1970-01-01T00:00:00Z).
///
/// Formal object from [IEEE1849-2016] §5.3 (date type): stored as `i64` nanoseconds
/// so that equality and ordering are exact integer comparisons with no floating-point
/// ambiguity. Nanosecond resolution matches the XES `xs:dateTime` precision requirement.
///
/// Invariant: any value is a valid signed 64-bit integer; no NaN or infinity is possible.
pub type TimestampNs = i64;

/// A single activity label drawn from the activity universe **A**.
///
/// Formal object from [VanDerAalst2016] §2.1: the activity name is a free string; the
/// universe *A* is the set of all distinct strings encountered in a log.
pub type ActivityName = String;

// ---------------------------------------------------------------------------
// XesAttribute — the seven-variant value domain
// ---------------------------------------------------------------------------

/// XES attribute value — the seven-variant type domain of IEEE 1849-2016 §5.3.
///
/// Formal object from [IEEE1849-2016] §5.3 (attribute types: `string`, `int`, `float`,
/// `date`, `boolean`, `list`, `container`). This enum is the direct Rust equivalent of
/// the XES type system.
///
/// # Determinism note
///
/// The [`Container`](XesAttribute::Container) variant uses `BTreeMap<String, XesAttribute>`
/// instead of the `HashMap<String, AttributeValue>` found in `wasm4pm/src/models.rs:74`.
/// BTreeMap gives a deterministic key iteration order (lexicographic), which is required
/// for reproducible BLAKE3 receipt hashes (see `wasm4pm` audit finding, `models.rs:116`).
///
/// # Derivability of `Eq`, `Ord`
///
/// The `Float(f64)` variant means `Eq` and `Ord` cannot be derived automatically —
/// `f64` does not implement `Eq` because `NaN != NaN`. We provide manual `PartialEq`
/// and `PartialOrd` implementations that treat NaN as equal to NaN (total ordering for
/// deterministic map keys) and document this deviation from IEEE 754.
#[derive(Debug, Clone)]
pub enum XesAttribute {
    /// `xs:string` — arbitrary UTF-8 text value (IEEE 1849-2016 §5.3.1).
    String(alloc::string::String),

    /// `xs:long` — 64-bit signed integer (IEEE 1849-2016 §5.3.2).
    Int(i64),

    /// `xs:double` — 64-bit IEEE 754 float (IEEE 1849-2016 §5.3.3).
    ///
    /// Invariant: algorithms must never store NaN or ±Infinity in a persistent attribute;
    /// those values indicate a computation error, not a valid data point.
    Float(f64),

    /// `xs:dateTime` stored as nanoseconds since Unix epoch (IEEE 1849-2016 §5.3.4).
    ///
    /// Using [`TimestampNs`] (i64 ns) rather than a date string avoids locale/timezone
    /// ambiguity and enables O(1) arithmetic on timestamps without parsing.
    DateNs(TimestampNs),

    /// `xs:boolean` — true or false (IEEE 1849-2016 §5.3.5).
    Boolean(bool),

    /// `xs:list` — ordered sequence of nested attribute values (IEEE 1849-2016 §5.3.6).
    List(alloc::vec::Vec<XesAttribute>),

    /// `xs:container` — named bag of nested attribute values (IEEE 1849-2016 §5.3.7).
    ///
    /// Uses `BTreeMap` (not `HashMap`) for deterministic serialisation order.
    Container(alloc::collections::BTreeMap<alloc::string::String, XesAttribute>),
}

// Manual PartialEq: treat f64 NaN == NaN so that attribute maps can be compared.
// This is intentional and documented: process-mining attributes should never contain
// NaN in practice; this makes the equality total for test and receipt purposes.
impl PartialEq for XesAttribute {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (XesAttribute::String(a), XesAttribute::String(b)) => a == b,
            (XesAttribute::Int(a), XesAttribute::Int(b)) => a == b,
            (XesAttribute::Float(a), XesAttribute::Float(b)) => {
                // Total equality: NaN == NaN for deterministic comparison.
                (a.is_nan() && b.is_nan()) || a == b
            }
            (XesAttribute::DateNs(a), XesAttribute::DateNs(b)) => a == b,
            (XesAttribute::Boolean(a), XesAttribute::Boolean(b)) => a == b,
            (XesAttribute::List(a), XesAttribute::List(b)) => a == b,
            (XesAttribute::Container(a), XesAttribute::Container(b)) => a == b,
            _ => false,
        }
    }
}

impl Eq for XesAttribute {}

impl PartialOrd for XesAttribute {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for XesAttribute {
    /// Total ordering on attribute values for use in BTreeMap/BTreeSet.
    ///
    /// Variant discriminant order: String < Int < Float < DateNs < Boolean < List < Container.
    /// Within `Float`, NaN is placed after all finite values and ±Infinity (total order).
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        use core::cmp::Ordering;

        fn discriminant(v: &XesAttribute) -> u8 {
            match v {
                XesAttribute::String(_) => 0,
                XesAttribute::Int(_) => 1,
                XesAttribute::Float(_) => 2,
                XesAttribute::DateNs(_) => 3,
                XesAttribute::Boolean(_) => 4,
                XesAttribute::List(_) => 5,
                XesAttribute::Container(_) => 6,
            }
        }

        let d = discriminant(self).cmp(&discriminant(other));
        if d != Ordering::Equal {
            return d;
        }

        match (self, other) {
            (XesAttribute::String(a), XesAttribute::String(b)) => a.cmp(b),
            (XesAttribute::Int(a), XesAttribute::Int(b)) => a.cmp(b),
            (XesAttribute::Float(a), XesAttribute::Float(b)) => {
                // Total order: treat NaN as greater than all non-NaN values.
                match (a.is_nan(), b.is_nan()) {
                    (true, true) => Ordering::Equal,
                    (true, false) => Ordering::Greater,
                    (false, true) => Ordering::Less,
                    (false, false) => a.partial_cmp(b).unwrap_or(Ordering::Equal),
                }
            }
            (XesAttribute::DateNs(a), XesAttribute::DateNs(b)) => a.cmp(b),
            (XesAttribute::Boolean(a), XesAttribute::Boolean(b)) => a.cmp(b),
            (XesAttribute::List(a), XesAttribute::List(b)) => a.cmp(b),
            (XesAttribute::Container(a), XesAttribute::Container(b)) => a.cmp(b),
            // Unreachable: discriminants are equal only for same variant.
            _ => Ordering::Equal,
        }
    }
}

impl core::hash::Hash for XesAttribute {
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        core::mem::discriminant(self).hash(state);
        match self {
            XesAttribute::String(s) => s.hash(state),
            XesAttribute::Int(i) => i.hash(state),
            XesAttribute::Float(f) => {
                // Canonical bit pattern: treat NaN as a single canonical value (all-ones mantissa).
                let bits: u64 = if f.is_nan() {
                    u64::MAX
                } else {
                    f.to_bits()
                };
                bits.hash(state);
            }
            XesAttribute::DateNs(n) => n.hash(state),
            XesAttribute::Boolean(b) => b.hash(state),
            XesAttribute::List(l) => l.hash(state),
            XesAttribute::Container(m) => {
                // BTreeMap iteration is already sorted, so hash order is deterministic.
                for (k, v) in m {
                    k.hash(state);
                    v.hash(state);
                }
            }
        }
    }
}

#[cfg(feature = "serde")]
mod serde_impl {
    use super::*;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    impl Serialize for XesAttribute {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            use serde::ser::SerializeMap;
            match self {
                XesAttribute::String(v) => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "string")?;
                    m.serialize_entry("value", v)?;
                    m.end()
                }
                XesAttribute::Int(v) => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "int")?;
                    m.serialize_entry("value", v)?;
                    m.end()
                }
                XesAttribute::Float(v) => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "float")?;
                    m.serialize_entry("value", v)?;
                    m.end()
                }
                XesAttribute::DateNs(v) => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "date_ns")?;
                    m.serialize_entry("value", v)?;
                    m.end()
                }
                XesAttribute::Boolean(v) => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "boolean")?;
                    m.serialize_entry("value", v)?;
                    m.end()
                }
                XesAttribute::List(v) => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "list")?;
                    m.serialize_entry("value", v)?;
                    m.end()
                }
                XesAttribute::Container(v) => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "container")?;
                    m.serialize_entry("value", v)?;
                    m.end()
                }
            }
        }
    }

    impl<'de> Deserialize<'de> for XesAttribute {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            use serde::de::{self, MapAccess, Visitor};
            use alloc::string::ToString;

            struct AttrVisitor;

            impl<'de> Visitor<'de> for AttrVisitor {
                type Value = XesAttribute;

                fn expecting(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                    f.write_str("a map with 'type' and 'value' keys")
                }

                fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<XesAttribute, A::Error> {
                    use serde_json::Value as JV;

                    let mut typ: Option<alloc::string::String> = None;
                    let mut val: Option<serde_json::Value> = None;

                    while let Some(key) = map.next_key::<alloc::string::String>()? {
                        match key.as_str() {
                            "type" => typ = Some(map.next_value()?),
                            "value" => val = Some(map.next_value()?),
                            _ => { let _: serde_json::Value = map.next_value()?; }
                        }
                    }

                    let typ = typ.ok_or_else(|| de::Error::missing_field("type"))?;
                    let val = val.ok_or_else(|| de::Error::missing_field("value"))?;

                    match typ.as_str() {
                        "string" => {
                            let s = val.as_str().unwrap_or("").to_string();
                            Ok(XesAttribute::String(s))
                        }
                        "int" => {
                            let i = val.as_i64().ok_or_else(|| de::Error::custom("expected i64"))?;
                            Ok(XesAttribute::Int(i))
                        }
                        "float" => {
                            let f = val.as_f64().ok_or_else(|| de::Error::custom("expected f64"))?;
                            Ok(XesAttribute::Float(f))
                        }
                        "date_ns" => {
                            let n = val.as_i64().ok_or_else(|| de::Error::custom("expected i64 ns"))?;
                            Ok(XesAttribute::DateNs(n))
                        }
                        "boolean" => {
                            let b = val.as_bool().ok_or_else(|| de::Error::custom("expected bool"))?;
                            Ok(XesAttribute::Boolean(b))
                        }
                        _ => Err(de::Error::custom(alloc::format!("unknown XesAttribute type: {}", typ))),
                    }
                }
            }

            d.deserialize_map(AttrVisitor)
        }
    }
}

// ---------------------------------------------------------------------------
// AttributeMap — named bag of typed attribute values
// ---------------------------------------------------------------------------

/// XES attribute map — named bag of typed values attached to a log, trace, or event element.
///
/// Formal object from [IEEE1849-2016] §5.2: every XES element (log, trace, event) carries
/// a set of typed attributes identified by a string key. The map type here is
/// `BTreeMap<String, XesAttribute>` to guarantee deterministic serialisation order.
///
/// # Determinism fix
///
/// The existing `wasm4pm/src/models.rs:116` defines:
/// ```text
/// pub type Attributes = HashMap<String, AttributeValue>;
/// ```
/// HashMap iteration order is random across runs (Rust's default SipHash seed is
/// process-specific). This `AttributeMap` replaces that with BTreeMap, fixing the
/// source of non-deterministic BLAKE3 receipt hashes.
///
/// Type alias — no overhead beyond the BTreeMap itself.
pub type AttributeMap = alloc::collections::BTreeMap<alloc::string::String, XesAttribute>;

// ---------------------------------------------------------------------------
// XesEvent — atomic activity occurrence
// ---------------------------------------------------------------------------

/// e ∈ E — atomic activity occurrence; an event element in XES (IEEE 1849-2016 §5.4).
///
/// Formal object from [IEEE1849-2016] §5.4 and [VanDerAalst2016] §2.1 Def 2.1:
/// an event records a single execution of an activity within a process instance.
/// The activity name is stored as `attributes["concept:name"]` following the XES
/// concept extension (IEEE 1849-2016 Appendix A).
///
/// # Accessor
///
/// Use [`XesEvent::activity_name`] to read `concept:name` without allocation.
///
/// # Invariant
///
/// A well-formed event SHOULD carry `concept:name` (string) and `time:timestamp`
/// (date). These are SHOULD, not MUST, following the XES standard; parsing code
/// must tolerate their absence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct XesEvent {
    /// All typed attributes of this event, keyed by XES extension name.
    ///
    /// Mandatory by convention (XES concept extension): `"concept:name"` → activity label.
    /// Optional by convention (XES time extension): `"time:timestamp"` → [`DateNs`] value.
    pub attributes: AttributeMap,
}

impl XesEvent {
    /// Construct a minimal event with the given activity name (`concept:name`).
    ///
    /// All other attributes can be added via `event.attributes.insert(...)`.
    #[inline]
    pub fn new(activity: impl Into<alloc::string::String>) -> Self {
        let mut attributes = AttributeMap::new();
        attributes.insert(
            alloc::string::String::from("concept:name"),
            XesAttribute::String(activity.into()),
        );
        XesEvent { attributes }
    }

    /// Return the activity name (`concept:name`) of this event, if present.
    ///
    /// Returns `None` when the mandatory attribute is missing; callers must handle
    /// this gracefully (XES standard does not enforce presence at the wire level).
    #[inline]
    pub fn activity_name(&self) -> Option<&str> {
        match self.attributes.get("concept:name") {
            Some(XesAttribute::String(s)) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Return the timestamp in nanoseconds since epoch (`time:timestamp`), if present.
    ///
    /// Returns `None` when the time extension attribute is absent or has a non-date type.
    #[inline]
    pub fn timestamp_ns(&self) -> Option<TimestampNs> {
        match self.attributes.get("time:timestamp") {
            Some(XesAttribute::DateNs(ns)) => Some(*ns),
            _ => None,
        }
    }
}

impl PartialOrd for XesEvent {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for XesEvent {
    /// Total order on events: compare by `time:timestamp` first (ascending), then
    /// lexicographic on the full attribute map for tie-breaking.
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        match (self.timestamp_ns(), other.timestamp_ns()) {
            (Some(a), Some(b)) => a.cmp(&b).then_with(|| self.attributes.cmp(&other.attributes)),
            (Some(_), None) => core::cmp::Ordering::Less,
            (None, Some(_)) => core::cmp::Ordering::Greater,
            (None, None) => self.attributes.cmp(&other.attributes),
        }
    }
}

impl core::hash::Hash for XesEvent {
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        // BTreeMap iteration order is deterministic (sorted by key), so this hash is stable.
        for (k, v) in &self.attributes {
            k.hash(state);
            v.hash(state);
        }
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for XesEvent {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        self.attributes.serialize(s)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for XesEvent {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let attributes = AttributeMap::deserialize(d)?;
        Ok(XesEvent { attributes })
    }
}

// ---------------------------------------------------------------------------
// XesTrace — ordered sequence of events (one process instance / case)
// ---------------------------------------------------------------------------

/// σ ∈ A* — finite ordered sequence of events representing one process instance / case.
///
/// Formal object from [IEEE1849-2016] §5.5 and [VanDerAalst2016] §2.1 Def 2.1:
/// a trace is the complete history of activities executed for a single case.
/// The case identifier is stored as `attributes["concept:name"]` following the XES
/// concept extension.
///
/// # Ordering invariant
///
/// The `events` vector preserves the original log order (typically ascending
/// `time:timestamp`). Algorithms must not sort this vector unless they explicitly
/// document a sort step.
///
/// # Accessor
///
/// Use [`XesTrace::case_id`] to read `concept:name` without allocation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct XesTrace {
    /// Trace-level attributes (e.g., `concept:name` → case identifier).
    pub attributes: AttributeMap,

    /// Ordered sequence of events constituting this process instance.
    ///
    /// Invariant: order matches the original XES serialisation; typically ascending
    /// by `time:timestamp`. Algorithms that require temporal ordering must verify this.
    pub events: alloc::vec::Vec<XesEvent>,
}

impl XesTrace {
    /// Construct a new empty trace with the given case identifier (`concept:name`).
    #[inline]
    pub fn new(case_id: impl Into<alloc::string::String>) -> Self {
        let mut attributes = AttributeMap::new();
        attributes.insert(
            alloc::string::String::from("concept:name"),
            XesAttribute::String(case_id.into()),
        );
        XesTrace {
            attributes,
            events: alloc::vec::Vec::new(),
        }
    }

    /// Return the case identifier (`concept:name`) of this trace, if present.
    #[inline]
    pub fn case_id(&self) -> Option<&str> {
        match self.attributes.get("concept:name") {
            Some(XesAttribute::String(s)) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Return the number of events in this trace.
    ///
    /// Formal: |σ| — the length of the trace word.
    #[inline]
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// Return `true` iff this trace contains no events.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    /// Append an event to the end of this trace.
    #[inline]
    pub fn push(&mut self, event: XesEvent) {
        self.events.push(event);
    }

    /// Iterate over activity names in trace order, skipping events with no `concept:name`.
    ///
    /// This yields the activity word σ = ⟨a₁, a₂, …, aₙ⟩ ∈ A* (van der Aalst 2016 §2.1).
    #[inline]
    pub fn activity_sequence(&self) -> impl Iterator<Item = &str> {
        self.events.iter().filter_map(|e| e.activity_name())
    }
}

impl PartialOrd for XesTrace {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for XesTrace {
    /// Total order: by case_id (lexicographic), then by event sequence length, then by events.
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.case_id()
            .cmp(&other.case_id())
            .then_with(|| self.events.len().cmp(&other.events.len()))
            .then_with(|| self.events.cmp(&other.events))
            .then_with(|| self.attributes.cmp(&other.attributes))
    }
}

impl core::hash::Hash for XesTrace {
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        for (k, v) in &self.attributes {
            k.hash(state);
            v.hash(state);
        }
        for event in &self.events {
            event.hash(state);
        }
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for XesTrace {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("XesTrace", 2)?;
        st.serialize_field("attributes", &self.attributes)?;
        st.serialize_field("events", &self.events)?;
        st.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for XesTrace {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};

        struct TraceVisitor;

        impl<'de> Visitor<'de> for TraceVisitor {
            type Value = XesTrace;

            fn expecting(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                f.write_str("XesTrace struct with attributes and events")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<XesTrace, A::Error> {
                let mut attributes: Option<AttributeMap> = None;
                let mut events: Option<alloc::vec::Vec<XesEvent>> = None;

                while let Some(key) = map.next_key::<alloc::string::String>()? {
                    match key.as_str() {
                        "attributes" => attributes = Some(map.next_value()?),
                        "events" => events = Some(map.next_value()?),
                        _ => { let _: serde_json::Value = map.next_value()?; }
                    }
                }

                Ok(XesTrace {
                    attributes: attributes.unwrap_or_default(),
                    events: events.unwrap_or_default(),
                })
            }
        }

        d.deserialize_map(TraceVisitor)
    }
}

// ---------------------------------------------------------------------------
// XesLog — top-level event log container
// ---------------------------------------------------------------------------

/// L — event log as a multiset of traces over activity universe A.
///
/// Formal object from [IEEE1849-2016] §5.6 and [VanDerAalst2016] §2.1 Def 2.2:
/// an event log L is a finite multiset of traces σ ∈ A*, each representing one
/// process instance. This is the top-level input to all process mining algorithms
/// in this crate.
///
/// # Algorithm contract
///
/// No algorithm implementations live in this file. Types only. Algorithms receive
/// `&XesLog` or `XesLog` by value and produce output types defined elsewhere.
///
/// # Derived view
///
/// Use [`XesLog::activity_names`] to compute the activity universe A = {a | a appears
/// in some trace of L} as a `BTreeSet<ActivityName>`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct XesLog {
    /// Log-level attributes (e.g., `concept:name` → log name, classifier definitions).
    pub attributes: AttributeMap,

    /// All process instances (cases / traces) in this log.
    ///
    /// Invariant: ordering within this `Vec` matches the original XES document order.
    /// No algorithm may assume traces are sorted by case_id or timestamp.
    pub traces: alloc::vec::Vec<XesTrace>,
}

impl XesLog {
    /// Construct a new empty log with no attributes and no traces.
    #[inline]
    pub fn new() -> Self {
        XesLog {
            attributes: AttributeMap::new(),
            traces: alloc::vec::Vec::new(),
        }
    }

    /// Construct a log with a given name (`concept:name` attribute).
    #[inline]
    pub fn with_name(name: impl Into<alloc::string::String>) -> Self {
        let mut attributes = AttributeMap::new();
        attributes.insert(
            alloc::string::String::from("concept:name"),
            XesAttribute::String(name.into()),
        );
        XesLog {
            attributes,
            traces: alloc::vec::Vec::new(),
        }
    }

    /// Append a trace to the log.
    #[inline]
    pub fn push(&mut self, trace: XesTrace) {
        self.traces.push(trace);
    }

    /// Return the number of traces (cases) in this log.
    ///
    /// Formal: |L| — the cardinality of the trace multiset.
    #[inline]
    pub fn len(&self) -> usize {
        self.traces.len()
    }

    /// Return `true` iff this log contains no traces.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.traces.is_empty()
    }

    /// Total number of events across all traces.
    ///
    /// Formal: Σ_{σ ∈ L} |σ| — the sum of all trace lengths.
    #[inline]
    pub fn event_count(&self) -> usize {
        self.traces.iter().map(|t| t.events.len()).sum()
    }

    /// Compute the activity universe **A** of this log using the given attribute key.
    ///
    /// Formal object from [VanDerAalst2016] §2.1: A is the set of all distinct activity
    /// names that appear in at least one event of at least one trace.
    ///
    /// # Parameters
    ///
    /// * `key` — the attribute key used for activity labels; conventionally `"concept:name"`.
    ///
    /// Returns a `BTreeSet<ActivityName>` (deterministic, sorted lexicographically).
    ///
    /// # Complexity
    ///
    /// O(E · log A) where E = total event count and A = |activity universe|.
    pub fn activity_names(&self, key: &str) -> BTreeSet<ActivityName> {
        let mut set = BTreeSet::new();
        for trace in &self.traces {
            for event in &trace.events {
                if let Some(XesAttribute::String(name)) = event.attributes.get(key) {
                    set.insert(name.clone());
                }
            }
        }
        set
    }

    /// Return all distinct case identifiers (`concept:name` on traces) in sorted order.
    ///
    /// Returns `BTreeSet<String>` — deterministic, no duplicates.
    pub fn case_ids(&self) -> BTreeSet<String> {
        let mut set = BTreeSet::new();
        for trace in &self.traces {
            if let Some(id) = trace.case_id() {
                set.insert(alloc::string::String::from(id));
            }
        }
        set
    }

    /// Iterate over all events in all traces, in log order (trace order, then event order).
    ///
    /// Yields `(&XesTrace, &XesEvent)` pairs so callers can access both trace-level and
    /// event-level attributes in a single pass.
    #[inline]
    pub fn all_events(&self) -> impl Iterator<Item = (&XesTrace, &XesEvent)> {
        self.traces
            .iter()
            .flat_map(|t| t.events.iter().map(move |e| (t, e)))
    }
}

impl Default for XesLog {
    #[inline]
    fn default() -> Self {
        XesLog::new()
    }
}

impl PartialOrd for XesLog {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for XesLog {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.attributes
            .cmp(&other.attributes)
            .then_with(|| self.traces.len().cmp(&other.traces.len()))
            .then_with(|| self.traces.cmp(&other.traces))
    }
}

impl core::hash::Hash for XesLog {
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        for (k, v) in &self.attributes {
            k.hash(state);
            v.hash(state);
        }
        for trace in &self.traces {
            trace.hash(state);
        }
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for XesLog {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("XesLog", 2)?;
        st.serialize_field("attributes", &self.attributes)?;
        st.serialize_field("traces", &self.traces)?;
        st.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for XesLog {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        use serde::de::{MapAccess, Visitor};

        struct LogVisitor;

        impl<'de> Visitor<'de> for LogVisitor {
            type Value = XesLog;

            fn expecting(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                f.write_str("XesLog struct with attributes and traces")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<XesLog, A::Error> {
                let mut attributes: Option<AttributeMap> = None;
                let mut traces: Option<alloc::vec::Vec<XesTrace>> = None;

                while let Some(key) = map.next_key::<alloc::string::String>()? {
                    match key.as_str() {
                        "attributes" => attributes = Some(map.next_value()?),
                        "traces" => traces = Some(map.next_value()?),
                        _ => { let _: serde_json::Value = map.next_value()?; }
                    }
                }

                Ok(XesLog {
                    attributes: attributes.unwrap_or_default(),
                    traces: traces.unwrap_or_default(),
                })
            }
        }

        d.deserialize_map(LogVisitor)
    }
}

// ---------------------------------------------------------------------------
// Unit tests (compile-time only — no I/O, no std)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify that BTreeMap attribute ordering is deterministic: inserting keys in
    /// different orders must yield the same iteration sequence.
    #[test]
    fn attribute_map_order_is_deterministic() {
        let mut m1 = AttributeMap::new();
        m1.insert(alloc::string::String::from("z"), XesAttribute::Int(1));
        m1.insert(alloc::string::String::from("a"), XesAttribute::Int(2));
        m1.insert(alloc::string::String::from("m"), XesAttribute::Int(3));

        let mut m2 = AttributeMap::new();
        m2.insert(alloc::string::String::from("a"), XesAttribute::Int(2));
        m2.insert(alloc::string::String::from("m"), XesAttribute::Int(3));
        m2.insert(alloc::string::String::from("z"), XesAttribute::Int(1));

        // Both maps are equal and iterate in identical key order.
        assert_eq!(m1, m2);
        let keys1: alloc::vec::Vec<_> = m1.keys().collect();
        let keys2: alloc::vec::Vec<_> = m2.keys().collect();
        assert_eq!(keys1, keys2);
        assert_eq!(keys1[0], "a");
        assert_eq!(keys1[1], "m");
        assert_eq!(keys1[2], "z");
    }

    /// Verify XesEvent::activity_name() reads concept:name correctly.
    #[test]
    fn event_activity_name_roundtrip() {
        let event = XesEvent::new("Register Application");
        assert_eq!(event.activity_name(), Some("Register Application"));
    }

    /// Verify XesTrace::case_id() reads concept:name correctly.
    #[test]
    fn trace_case_id_roundtrip() {
        let trace = XesTrace::new("case-42");
        assert_eq!(trace.case_id(), Some("case-42"));
        assert!(trace.is_empty());
    }

    /// Verify XesLog::activity_names() collects the activity universe from all events.
    #[test]
    fn log_activity_universe() {
        let mut log = XesLog::new();

        let mut t1 = XesTrace::new("c1");
        t1.push(XesEvent::new("A"));
        t1.push(XesEvent::new("B"));

        let mut t2 = XesTrace::new("c2");
        t2.push(XesEvent::new("B"));
        t2.push(XesEvent::new("C"));

        log.push(t1);
        log.push(t2);

        let universe = log.activity_names("concept:name");
        let labels: alloc::vec::Vec<_> = universe.iter().map(|s| s.as_str()).collect();
        // BTreeSet gives sorted order.
        assert_eq!(labels, &["A", "B", "C"]);
        assert_eq!(log.event_count(), 4);
    }

    /// Verify XesLog::case_ids() returns sorted, deduplicated case identifiers.
    #[test]
    fn log_case_ids_sorted() {
        let mut log = XesLog::new();
        log.push(XesTrace::new("z-case"));
        log.push(XesTrace::new("a-case"));
        log.push(XesTrace::new("m-case"));

        let ids: alloc::vec::Vec<_> = log.case_ids().into_iter().collect();
        assert_eq!(ids, &["a-case", "m-case", "z-case"]);
    }

    /// Verify total ordering on XesAttribute (Float NaN handling).
    #[test]
    fn float_nan_total_order() {
        let nan = XesAttribute::Float(f64::NAN);
        let finite = XesAttribute::Float(1.0);

        // NaN == NaN (our total-equality rule).
        assert_eq!(nan, nan.clone());
        // NaN > finite (our canonical choice).
        assert!(nan > finite);
        // finite < NaN.
        assert!(finite < nan);
    }

    /// Verify DateNs attribute stores and retrieves a timestamp.
    #[test]
    fn event_timestamp_roundtrip() {
        let mut event = XesEvent::new("Complete");
        event.attributes.insert(
            alloc::string::String::from("time:timestamp"),
            XesAttribute::DateNs(1_700_000_000_000_000_000),
        );
        assert_eq!(
            event.timestamp_ns(),
            Some(1_700_000_000_000_000_000)
        );
    }

    /// Verify XesLog::all_events() yields all trace/event pairs in order.
    #[test]
    fn all_events_flat_iterator() {
        let mut log = XesLog::new();
        let mut t = XesTrace::new("c1");
        t.push(XesEvent::new("A"));
        t.push(XesEvent::new("B"));
        log.push(t);

        let pairs: alloc::vec::Vec<_> = log.all_events().collect();
        assert_eq!(pairs.len(), 2);
        assert_eq!(pairs[0].1.activity_name(), Some("A"));
        assert_eq!(pairs[1].1.activity_name(), Some("B"));
    }

    /// Verify XesLog default() produces an empty log.
    #[test]
    fn log_default_is_empty() {
        let log = XesLog::default();
        assert!(log.is_empty());
        assert_eq!(log.event_count(), 0);
    }

    /// Verify Container variant uses BTreeMap (deterministic key order).
    #[test]
    fn container_variant_deterministic() {
        let mut inner = alloc::collections::BTreeMap::new();
        inner.insert(alloc::string::String::from("z"), XesAttribute::Int(9));
        inner.insert(alloc::string::String::from("a"), XesAttribute::Int(1));

        let container = XesAttribute::Container(inner);

        if let XesAttribute::Container(ref m) = container {
            let keys: alloc::vec::Vec<_> = m.keys().collect();
            assert_eq!(keys[0], "a");
            assert_eq!(keys[1], "z");
        } else {
            panic!("expected Container variant");
        }
    }
}
