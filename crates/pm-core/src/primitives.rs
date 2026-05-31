//! Zero-cost domain newtypes. Every type is #[repr(transparent)] over its inner primitive.
//! These are the shared vocabulary used by all other modules — passing an ActivityName where
//! a PlaceId is expected is a compile error.
//!
//! Paper grounding: XES IEEE 1849-2016 (activity name, case id, resource); ISO 8601 nanosecond
//! timestamps; van der Aalst 2016 §2.1 definition of the activity universe A and case universe C.

extern crate alloc;

use alloc::string::String;
use core::fmt;
use core::ops::Deref;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// String-backed newtypes
// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [vanderAalst2016]: `a ∈ A` — element of the activity universe A (§2.1).
///
/// Every unique task label in an event log is an element of the activity universe A.
/// Typed separately from [`CaseId`] and [`PlaceId`] so that call-sites cannot accidentally
/// pass an activity name where a place identifier is expected.
///
/// XES attribute: `concept:name` on `<event>` elements (IEEE 1849-2016 §5.4).
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ActivityName(pub String);

impl Deref for ActivityName {
    type Target = str;
    #[inline]
    fn deref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ActivityName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for ActivityName {
    #[inline]
    fn from(s: String) -> Self {
        ActivityName(s)
    }
}

impl From<&str> for ActivityName {
    #[inline]
    fn from(s: &str) -> Self {
        ActivityName(String::from(s))
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [IEEE1849-2016]: case identifier — the `concept:name` attribute on a
/// XES `<trace>` element (§5.4).
///
/// Identifies a single process instance (case) in the event log. Cases correspond to elements
/// of the case universe C in van der Aalst 2016 §2.1.
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct CaseId(pub String);

impl Deref for CaseId {
    type Target = str;
    #[inline]
    fn deref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for CaseId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for CaseId {
    #[inline]
    fn from(s: String) -> Self {
        CaseId(s)
    }
}

impl From<&str> for CaseId {
    #[inline]
    fn from(s: &str) -> Self {
        CaseId(String::from(s))
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [vanderAalst2005]: resource `r ∈ R` — the `org:resource` attribute value
/// in XES (IEEE 1849-2016 §5.4); actor node in the social network mined by the handover-of-work
/// metric (van der Aalst et al. 2005 §3).
///
/// Separate from [`ActivityName`] so that organisational-network edges cannot be confused with
/// activity-level directly-follows edges.
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ResourceName(pub String);

impl Deref for ResourceName {
    type Target = str;
    #[inline]
    fn deref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ResourceName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for ResourceName {
    #[inline]
    fn from(s: String) -> Self {
        ResourceName(s)
    }
}

impl From<&str> for ResourceName {
    #[inline]
    fn from(s: &str) -> Self {
        ResourceName(String::from(s))
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [IEEE1849-2016]: `time:timestamp` — nanoseconds since the Unix epoch
/// (§5.3.4).
///
/// The unit tag prevents accidental mixing of millisecond and nanosecond timestamp values,
/// which is a common source of silent arithmetic errors in time-based conformance and
/// performance analysis.  Use [`DurationNs`] for differences between two [`TimestampNs`].
///
/// Negative values represent instants before 1970-01-01T00:00:00Z (ISO 8601 §4.3).
/// `Copy`: 8 bytes, no heap allocation.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct TimestampNs(pub i64);

impl Deref for TimestampNs {
    type Target = i64;
    #[inline]
    fn deref(&self) -> &i64 {
        &self.0
    }
}

impl fmt::Display for TimestampNs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}ns", self.0)
    }
}

impl From<i64> for TimestampNs {
    #[inline]
    fn from(v: i64) -> Self {
        TimestampNs(v)
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [Ghahfarokhi2021]: `ot ∈ OT` — element of the object type universe OT in
/// Object-Centric Event Logs (OCEL; §2 Def 1).
///
/// Examples: `"Order"`, `"Item"`, `"Package"`.  Distinct from [`ActivityName`] to prevent
/// confusing the type taxonomy with the activity universe.
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ObjectType(pub String);

impl Deref for ObjectType {
    type Target = str;
    #[inline]
    fn deref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ObjectType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for ObjectType {
    #[inline]
    fn from(s: String) -> Self {
        ObjectType(s)
    }
}

impl From<&str> for ObjectType {
    #[inline]
    fn from(s: &str) -> Self {
        ObjectType(String::from(s))
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [Ghahfarokhi2021]: `o ∈ O` — element of the object universe O in OCEL
/// (§2 Def 1).
///
/// Each object has an [`ObjectType`] and participates in OCEL events. Two objects with the
/// same string identifier but different types are still distinct in the OCEL model; callers
/// must track the associated [`ObjectType`] separately.
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ObjectId(pub String);

impl Deref for ObjectId {
    type Target = str;
    #[inline]
    fn deref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ObjectId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for ObjectId {
    #[inline]
    fn from(s: String) -> Self {
        ObjectId(s)
    }
}

impl From<&str> for ObjectId {
    #[inline]
    fn from(s: &str) -> Self {
        ObjectId(String::from(s))
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [vanderAalst2016]: `p ∈ P` — place in a Petri net tuple
/// `N = (P, T, F, W, M₀)` (§3.1 Def 3.1).
///
/// Distinct from [`TransitionId`]: the type system prevents a [`PlaceId`] from being used as
/// an arc endpoint where a [`TransitionId`] is required, catching Petri net topology errors at
/// compile time.
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct PlaceId(pub String);

impl Deref for PlaceId {
    type Target = str;
    #[inline]
    fn deref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for PlaceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for PlaceId {
    #[inline]
    fn from(s: String) -> Self {
        PlaceId(s)
    }
}

impl From<&str> for PlaceId {
    #[inline]
    fn from(s: &str) -> Self {
        PlaceId(String::from(s))
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [vanderAalst2016]: `t ∈ T` — transition in a Petri net tuple
/// `N = (P, T, F, W, M₀)` (§3.1 Def 3.1).
///
/// Silent (τ) transitions carry the label `"τ"` by convention.  Visible transitions carry the
/// label of the corresponding [`ActivityName`].  The type is kept separate from [`PlaceId`] to
/// prevent arc-direction errors in Petri net construction.
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct TransitionId(pub String);

impl Deref for TransitionId {
    type Target = str;
    #[inline]
    fn deref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for TransitionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for TransitionId {
    #[inline]
    fn from(s: String) -> Self {
        TransitionId(s)
    }
}

impl From<&str> for TransitionId {
    #[inline]
    fn from(s: &str) -> Self {
        TransitionId(String::from(s))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric newtypes — Copy, 8 bytes, no heap
// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [vanderAalst2016]: `|σ|` in multiset notation — occurrence count used in
/// DFG edge weights, trace-variant frequencies, and activity occurrence counts.
///
/// Using a newtype prevents accidentally adding a [`Frequency`] to a [`DurationNs`], both of
/// which would otherwise be plain `u64` values.  `Copy`: 8 bytes.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Frequency(pub u64);

impl Deref for Frequency {
    type Target = u64;
    #[inline]
    fn deref(&self) -> &u64 {
        &self.0
    }
}

impl fmt::Display for Frequency {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<u64> for Frequency {
    #[inline]
    fn from(v: u64) -> Self {
        Frequency(v)
    }
}

impl core::ops::Add for Frequency {
    type Output = Frequency;
    #[inline]
    fn add(self, rhs: Frequency) -> Frequency {
        Frequency(self.0.saturating_add(rhs.0))
    }
}

impl core::ops::AddAssign for Frequency {
    #[inline]
    fn add_assign(&mut self, rhs: Frequency) {
        self.0 = self.0.saturating_add(rhs.0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Formal object from [Denisov2018]: `Δt` — time difference in nanoseconds (§3, performance
/// spectrum).
///
/// The nanosecond unit tag prevents mixing with millisecond durations, which is a common error
/// in performance-analysis pipelines that read XES `time:timestamp` values.  `Copy`: 8 bytes.
///
/// Compute as `DurationNs(end.0.saturating_sub(start.0) as u64)` from two [`TimestampNs`]
/// values.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DurationNs(pub u64);

impl Deref for DurationNs {
    type Target = u64;
    #[inline]
    fn deref(&self) -> &u64 {
        &self.0
    }
}

impl fmt::Display for DurationNs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}ns", self.0)
    }
}

impl From<u64> for DurationNs {
    #[inline]
    fn from(v: u64) -> Self {
        DurationNs(v)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests (std-gated so they don't break #![no_std] targets)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── ActivityName ──────────────────────────────────────────────────────────

    #[test]
    fn activity_name_deref() {
        let a = ActivityName::from("Submit");
        assert_eq!(&*a, "Submit");
    }

    #[test]
    fn activity_name_ord() {
        let a = ActivityName::from("A");
        let b = ActivityName::from("B");
        assert!(a < b);
    }

    // ── CaseId ────────────────────────────────────────────────────────────────

    #[test]
    fn case_id_eq() {
        let c1 = CaseId::from("case-001");
        let c2 = CaseId::from("case-001");
        assert_eq!(c1, c2);
    }

    // ── TimestampNs ───────────────────────────────────────────────────────────

    #[test]
    fn timestamp_ns_copy_semantics() {
        let t1 = TimestampNs(1_000_000_000_i64);
        let t2 = t1; // Copy
        assert_eq!(t1, t2);
    }

    #[test]
    fn timestamp_ns_negative_valid() {
        // Timestamps before Unix epoch are valid
        let t = TimestampNs(-1);
        assert_eq!(*t, -1_i64);
    }

    // ── PlaceId vs TransitionId ───────────────────────────────────────────────

    #[test]
    fn place_and_transition_are_distinct_types() {
        let p = PlaceId::from("p1");
        let t = TransitionId::from("p1");
        // Same underlying string but different types: the following would not compile:
        // let _: PlaceId = t;
        assert_eq!(&*p, &*t); // same string content
    }

    // ── Frequency ────────────────────────────────────────────────────────────

    #[test]
    fn frequency_add_saturates() {
        let f = Frequency(u64::MAX);
        let result = f + Frequency(1);
        assert_eq!(*result, u64::MAX); // saturating_add
    }

    // ── DurationNs ───────────────────────────────────────────────────────────

    #[test]
    fn duration_ns_display() {
        let d = DurationNs(500_000);
        assert_eq!(alloc::format!("{d}"), "500000ns");
    }

    // ── ObjectType / ObjectId ─────────────────────────────────────────────────

    #[test]
    fn object_type_hash_in_btreemap() {
        use alloc::collections::BTreeMap;
        let mut m: BTreeMap<ObjectType, u32> = BTreeMap::new();
        m.insert(ObjectType::from("Order"), 1);
        m.insert(ObjectType::from("Item"), 2);
        assert_eq!(m[&ObjectType::from("Order")], 1);
    }

    #[test]
    fn object_id_ord() {
        let o1 = ObjectId::from("obj-1");
        let o2 = ObjectId::from("obj-2");
        assert!(o1 < o2);
    }
}
