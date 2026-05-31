//! Heuristics Net intermediate representation — the dependency matrix aᵢⱼ and
//! filtered edge set produced by the Heuristics Miner before conversion to a
//! Petri net. DependencyScore newtype from dfg.rs enforces the (−1,1] range.
//!
//! Paper grounding: Weijters & van der Aalst 2003 'Rediscovering Workflow Models
//! from Event-Based Data Using Little Thumb' §3: aᵢⱼ = (|i>j| − |j>i|) /
//! (|i>j| + |j>i| + 1). The Heuristics Net HN = (A, D, inputs, outputs,
//! bindings) captures the dependency graph together with split/join bindings.
//!
//! ## Invariants
//!
//! - [`DependencyScore`] values are confined to the half-open interval (−1, 1].
//!   The denominator `|i>j| + |j>i| + 1 ≥ 1` guarantees the score never reaches
//!   exactly −1; a score of +1 is achieved when `|j>i| = 0` and `|i>j| > 0`.
//! - Only activity pairs whose `aᵢⱼ ≥ dependency_threshold` appear in
//!   [`HeuristicsNet::dependency_matrix`]; the threshold itself is a
//!   [`DependencyScore`] in (−1, 1].
//! - [`InputOutputBinding`] sets contain at least one [`ActivityName`] (an empty
//!   binding is semantically invalid and must be rejected by constructors).
//! - Every key of `input_bindings` / `output_bindings` is a member of
//!   `activities`.
//!
//! ## `no_std` compatibility
//!
//! This file imports only from `alloc` and `core`. The `std` feature is absent.
//! All collection types are `BTreeMap` / `BTreeSet` for deterministic ordering.

// Bring alloc collections into scope (no_std compatible).
extern crate alloc;

use alloc::collections::BTreeMap;
use alloc::collections::BTreeSet;
use alloc::string::String;
use core::fmt;
use core::ops::Deref;

// ---------------------------------------------------------------------------
// ActivityName — a zero-cost wrapper around a process-mining activity label
// ---------------------------------------------------------------------------

/// A process-mining activity label — the node type of a Heuristics Net.
///
/// Formal object from [Weijters & van der Aalst 2003]: an element `a ∈ A` of
/// the activity set. Every node in the Heuristics Net is identified by its
/// activity name; `BTreeSet<ActivityName>` and `BTreeMap<ActivityName, _>` give
/// deterministic, paper-consistent ordering.
///
/// ## Invariant
/// The inner `String` must be non-empty (activity labels are non-empty in the
/// paper's event-log model).
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ActivityName(String);

impl ActivityName {
    /// Construct an `ActivityName` from any `Into<String>`.
    ///
    /// # Panics
    /// Panics (in debug builds) if `s` is empty, as empty activity names are
    /// outside the domain of the Heuristics Miner.
    #[inline]
    pub fn new(s: impl Into<String>) -> Self {
        let inner = s.into();
        debug_assert!(!inner.is_empty(), "ActivityName must be non-empty");
        ActivityName(inner)
    }

    /// Borrow the underlying activity label as a `&str`.
    #[inline]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Deref for ActivityName {
    type Target = String;

    #[inline]
    fn deref(&self) -> &Self::Target {
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
        ActivityName::new(s)
    }
}

impl From<&str> for ActivityName {
    #[inline]
    fn from(s: &str) -> Self {
        ActivityName::new(s)
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for ActivityName {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for ActivityName {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Ok(ActivityName::new(s))
    }
}

// ---------------------------------------------------------------------------
// DependencyScore — a zero-cost f64 newtype for aᵢⱼ ∈ (−1, 1]
// ---------------------------------------------------------------------------

/// The dependency score `aᵢⱼ` between activities `i` and `j`.
///
/// Formal object from [Weijters & van der Aalst 2003 §3]:
///
/// ```text
/// aᵢⱼ = (|i>j| − |j>i|) / (|i>j| + |j>i| + 1)
/// ```
///
/// where `|i>j|` is the number of times activity `i` is directly followed by
/// activity `j` in the event log (the directly-follows frequency).
///
/// ## Invariant
/// `aᵢⱼ ∈ (−1, 1]`. The +1 denominator prevents division by zero and ensures
/// the score never reaches −1 exactly. A score of +1 indicates that `i` is
/// always followed by `j` and `j` is never followed by `i`.
///
/// `DependencyScore` is also used as the filtering threshold: only pairs with
/// `aᵢⱼ ≥ threshold` survive into the Heuristics Net's dependency graph.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub struct DependencyScore(f64);

impl DependencyScore {
    /// The minimum admissible threshold in published experiments (Weijters &
    /// van der Aalst 2003 §4.1 recommend 0.5 as a default starting point).
    pub const DEFAULT_THRESHOLD: DependencyScore = DependencyScore(0.5);

    /// The theoretical maximum: +1.0 (activity `i` always precedes `j`, never
    /// vice-versa).
    pub const MAX: DependencyScore = DependencyScore(1.0);

    /// The theoretical minimum (exclusive, open bound): −1.0 is never reached
    /// because the +1 in the denominator guarantees a strictly greater value.
    pub const MIN_EXCLUSIVE: f64 = -1.0;

    /// Construct a `DependencyScore` from a raw `f64`.
    ///
    /// # Panics
    /// Panics (in debug builds) if `v` is not in the half-open interval (−1, 1].
    #[inline]
    pub fn new(v: f64) -> Self {
        debug_assert!(
            v > Self::MIN_EXCLUSIVE && v <= 1.0,
            "DependencyScore must be in (−1, 1], got {}",
            v
        );
        DependencyScore(v)
    }

    /// Compute `aᵢⱼ` from raw directly-follows counts.
    ///
    /// Implements the formula from Weijters & van der Aalst 2003 §3:
    /// `aᵢⱼ = (forward − backward) / (forward + backward + 1)`
    ///
    /// where `forward = |i>j|` and `backward = |j>i|`.
    ///
    /// The result is always in (−1, 1] because the denominator `≥ 1`.
    #[inline]
    pub fn from_counts(forward: u64, backward: u64) -> Self {
        let f = forward as f64;
        let b = backward as f64;
        let score = (f - b) / (f + b + 1.0);
        // score is strictly in (−1, 1] by construction; no need for clamping.
        DependencyScore(score)
    }

    /// Return the raw `f64` value.
    #[inline]
    pub fn value(self) -> f64 {
        self.0
    }

    /// Return `true` if this score is at or above `threshold`, meaning the
    /// dependency is strong enough to include in the Heuristics Net.
    #[inline]
    pub fn is_above_threshold(self, threshold: DependencyScore) -> bool {
        self.0 >= threshold.0
    }
}

impl Deref for DependencyScore {
    type Target = f64;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for DependencyScore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:.6}", self.0)
    }
}

impl From<f64> for DependencyScore {
    #[inline]
    fn from(v: f64) -> Self {
        DependencyScore::new(v)
    }
}

// DependencyScore intentionally does NOT implement `Eq` or `Ord` because f64
// does not satisfy total equality (NaN ≠ NaN). Comparisons use `PartialOrd`.

#[cfg(feature = "serde")]
impl serde::Serialize for DependencyScore {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for DependencyScore {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let v = f64::deserialize(deserializer)?;
        Ok(DependencyScore(v))
    }
}

// ---------------------------------------------------------------------------
// InputOutputBinding — split/join connector types
// ---------------------------------------------------------------------------

/// The split/join connector type for an activity's input or output arc set.
///
/// Formal object from [Weijters & van der Aalst 2003 §3.3]:
/// The Heuristics Miner attaches a *binding* to each activity that describes
/// how its incoming (input) or outgoing (output) arcs are logically connected:
///
/// - **AND** — all bound activities must co-occur (AND-split / AND-join).
/// - **OR** — any non-empty subset of bound activities may occur
///   (OR-split / OR-join; sometimes called inclusive-or).
/// - **XOR** — exactly one of the bound activities occurs
///   (XOR-split / XOR-join; exclusive choice / merge).
///
/// The binding's member set `BTreeSet<ActivityName>` is ordered deterministically
/// so that two bindings with the same members always compare equal regardless of
/// the order in which members were inserted.
///
/// ## Invariant
/// Every variant's `BTreeSet` must be non-empty (a binding over zero activities
/// is undefined in the paper's formalism).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputOutputBinding {
    /// AND-split / AND-join: all bound activities must participate.
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3.3]: the AND
    /// connector requires simultaneous execution of every member activity.
    And(BTreeSet<ActivityName>),

    /// OR-split / OR-join: any non-empty subset of bound activities may
    /// participate (inclusive-or).
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3.3]: the OR
    /// connector is detected by the short-loop heuristic when multiple
    /// successors exhibit overlapping co-occurrence patterns.
    Or(BTreeSet<ActivityName>),

    /// XOR-split / XOR-join: exactly one of the bound activities participates
    /// (exclusive choice / merge).
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3.3]: the XOR
    /// connector is the default when the miner cannot establish AND or OR
    /// semantics from the frequency matrix alone.
    Xor(BTreeSet<ActivityName>),
}

impl InputOutputBinding {
    /// Return the set of activities referenced by this binding.
    pub fn members(&self) -> &BTreeSet<ActivityName> {
        match self {
            InputOutputBinding::And(s) => s,
            InputOutputBinding::Or(s) => s,
            InputOutputBinding::Xor(s) => s,
        }
    }

    /// Return `true` if the binding's member set is non-empty.
    ///
    /// An empty binding is always invalid per the Heuristics Net formalism.
    pub fn is_valid(&self) -> bool {
        !self.members().is_empty()
    }

    /// Return the number of activities in the binding.
    pub fn len(&self) -> usize {
        self.members().len()
    }

    /// Return `true` if the binding contains no activities.
    pub fn is_empty(&self) -> bool {
        self.members().is_empty()
    }

    /// Return the connector kind as a static string (`"and"`, `"or"`, `"xor"`).
    pub fn kind_str(&self) -> &'static str {
        match self {
            InputOutputBinding::And(_) => "and",
            InputOutputBinding::Or(_) => "or",
            InputOutputBinding::Xor(_) => "xor",
        }
    }

    /// Construct an AND binding from an iterator of activity names.
    ///
    /// # Panics
    /// Panics (in debug builds) if the resulting set is empty.
    pub fn and(members: impl IntoIterator<Item = ActivityName>) -> Self {
        let set: BTreeSet<ActivityName> = members.into_iter().collect();
        debug_assert!(!set.is_empty(), "InputOutputBinding::And must be non-empty");
        InputOutputBinding::And(set)
    }

    /// Construct an OR binding from an iterator of activity names.
    ///
    /// # Panics
    /// Panics (in debug builds) if the resulting set is empty.
    pub fn or(members: impl IntoIterator<Item = ActivityName>) -> Self {
        let set: BTreeSet<ActivityName> = members.into_iter().collect();
        debug_assert!(!set.is_empty(), "InputOutputBinding::Or must be non-empty");
        InputOutputBinding::Or(set)
    }

    /// Construct an XOR binding from an iterator of activity names.
    ///
    /// # Panics
    /// Panics (in debug builds) if the resulting set is empty.
    pub fn xor(members: impl IntoIterator<Item = ActivityName>) -> Self {
        let set: BTreeSet<ActivityName> = members.into_iter().collect();
        debug_assert!(!set.is_empty(), "InputOutputBinding::Xor must be non-empty");
        InputOutputBinding::Xor(set)
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for InputOutputBinding {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("InputOutputBinding", 2)?;
        state.serialize_field("kind", self.kind_str())?;
        state.serialize_field("members", self.members())?;
        state.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for InputOutputBinding {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};
        use alloc::string::ToString;

        struct BindingVisitor;

        impl<'de> Visitor<'de> for BindingVisitor {
            type Value = InputOutputBinding;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a Heuristics Net InputOutputBinding object with 'kind' and 'members' fields")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut kind: Option<String> = None;
                let mut members: Option<BTreeSet<ActivityName>> = None;

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "kind" => {
                            kind = Some(map.next_value()?);
                        }
                        "members" => {
                            members = Some(map.next_value()?);
                        }
                        _ => {
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }

                let kind = kind.ok_or_else(|| de::Error::missing_field("kind"))?;
                let members = members.ok_or_else(|| de::Error::missing_field("members"))?;

                match kind.as_str() {
                    "and" => Ok(InputOutputBinding::And(members)),
                    "or" => Ok(InputOutputBinding::Or(members)),
                    "xor" => Ok(InputOutputBinding::Xor(members)),
                    other => Err(de::Error::unknown_variant(
                        other,
                        &["and", "or", "xor"],
                    )),
                }
            }
        }

        deserializer.deserialize_map(BindingVisitor)
    }
}

// ---------------------------------------------------------------------------
// HeuristicsNet — the central intermediate representation
// ---------------------------------------------------------------------------

/// The Heuristics Net HN = (A, D, input\_bindings, output\_bindings) produced
/// by the Heuristics Miner as an intermediate representation before conversion
/// to a Petri net.
///
/// Formal object from [Weijters & van der Aalst 2003 §3]:
///
/// ```text
/// HN = (A, D, inputs, outputs)
///
/// A  = finite set of activities (process tasks)
/// D ⊆ A × A  = dependency relation, where (i,j) ∈ D ⟺ aᵢⱼ ≥ threshold
/// aᵢⱼ = (|i>j| − |j>i|) / (|i>j| + |j>i| + 1)   ∈ (−1, 1]
/// inputs(a)  : A → Binding  (the set of input bindings for activity a)
/// outputs(a) : A → Binding  (the set of output bindings for activity a)
/// ```
///
/// Only pairs whose dependency score `aᵢⱼ ≥ dependency_threshold` survive into
/// `dependency_matrix`; the threshold is stored alongside the matrix so the
/// representation is self-documenting.
///
/// `start_activities` and `end_activities` are the activities with no
/// predecessors / no successors in `D`, corresponding to the source and sink
/// activities inferred from the event log's trace prefixes and suffixes.
///
/// ## Structural invariants
///
/// 1. Every key in `dependency_matrix` is a pair of members of `activities`.
/// 2. Every `aᵢⱼ` stored in `dependency_matrix` satisfies
///    `aᵢⱼ ≥ dependency_threshold`.
/// 3. Every key of `input_bindings` and `output_bindings` is in `activities`.
/// 4. `start_activities ⊆ activities` and `end_activities ⊆ activities`.
/// 5. `dependency_threshold ∈ (−1, 1]`.
///
/// ## BTreeMap / BTreeSet for determinism
///
/// All collections use `BTreeMap` / `BTreeSet` (not `HashMap` / `HashSet`) so
/// that iteration order is deterministic and serialized representations are
/// stable across runs — a prerequisite for the BLAKE3 receipt chain.
#[derive(Debug, Clone, PartialEq)]
pub struct HeuristicsNet {
    /// The finite set `A` of activities in the process.
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3]: the alphabet of
    /// task labels derived from the event log.
    pub activities: BTreeSet<ActivityName>,

    /// The dependency matrix `D ⊆ A × A` together with the associated score.
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3]:
    /// `(i, j) ∈ D` iff `aᵢⱼ ≥ dependency_threshold`, where
    /// `aᵢⱼ = (|i>j| − |j>i|) / (|i>j| + |j>i| + 1)`.
    ///
    /// Only pairs that survive the threshold filter appear here. The score
    /// for every stored pair satisfies `aᵢⱼ ≥ dependency_threshold`.
    ///
    /// ## Key order
    /// Keys are `(ActivityName, ActivityName)` which inherits `BTreeMap`'s
    /// lexicographic key ordering, giving a deterministic iteration order.
    pub dependency_matrix: BTreeMap<(ActivityName, ActivityName), DependencyScore>,

    /// The input binding `inputs(a)` for each activity `a ∈ A`.
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3.3]: describes how
    /// `a`'s incoming arcs in the dependency graph are logically combined
    /// (AND-join, OR-join, or XOR-join).
    ///
    /// Activities that have no incoming arcs (i.e., start activities) typically
    /// do not appear in this map.
    pub input_bindings: BTreeMap<ActivityName, InputOutputBinding>,

    /// The output binding `outputs(a)` for each activity `a ∈ A`.
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3.3]: describes how
    /// `a`'s outgoing arcs in the dependency graph are logically combined
    /// (AND-split, OR-split, or XOR-split).
    ///
    /// Activities that have no outgoing arcs (i.e., end activities) typically
    /// do not appear in this map.
    pub output_bindings: BTreeMap<ActivityName, InputOutputBinding>,

    /// The dependency-score threshold `θ ∈ (−1, 1]` used to filter `D`.
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §4]: only pairs with
    /// `aᵢⱼ ≥ dependency_threshold` are included in `dependency_matrix`. A
    /// higher threshold yields a more selective (sparser) dependency graph.
    ///
    /// The paper's default recommendation for most logs is 0.5
    /// ([`DependencyScore::DEFAULT_THRESHOLD`]).
    pub dependency_threshold: DependencyScore,

    /// Activities that appear as the first event in one or more traces.
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3]: activities with
    /// no predecessors in the dependency graph `D`; they map to the source
    /// place(s) in the resulting Petri net.
    pub start_activities: BTreeSet<ActivityName>,

    /// Activities that appear as the last event in one or more traces.
    ///
    /// Formal object from [Weijters & van der Aalst 2003 §3]: activities with
    /// no successors in the dependency graph `D`; they map to the sink place(s)
    /// in the resulting Petri net.
    pub end_activities: BTreeSet<ActivityName>,
}

impl HeuristicsNet {
    /// Construct an empty `HeuristicsNet` with the given threshold.
    ///
    /// All activity sets and maps start empty. Callers populate the fields
    /// (typically by the Heuristics Miner algorithm) before the net is used.
    pub fn new(dependency_threshold: DependencyScore) -> Self {
        HeuristicsNet {
            activities: BTreeSet::new(),
            dependency_matrix: BTreeMap::new(),
            input_bindings: BTreeMap::new(),
            output_bindings: BTreeMap::new(),
            dependency_threshold,
            start_activities: BTreeSet::new(),
            end_activities: BTreeSet::new(),
        }
    }

    /// Construct an empty `HeuristicsNet` using the paper's recommended default
    /// threshold of 0.5.
    pub fn with_default_threshold() -> Self {
        HeuristicsNet::new(DependencyScore::DEFAULT_THRESHOLD)
    }

    /// Return `true` if no activities have been registered.
    pub fn is_empty(&self) -> bool {
        self.activities.is_empty()
    }

    /// Return the number of activities in `A`.
    pub fn activity_count(&self) -> usize {
        self.activities.len()
    }

    /// Return the number of dependency arcs in `D` that survived the threshold
    /// filter (i.e., the number of entries in `dependency_matrix`).
    pub fn dependency_arc_count(&self) -> usize {
        self.dependency_matrix.len()
    }

    /// Look up the dependency score `aᵢⱼ` for the ordered pair `(from, to)`.
    ///
    /// Returns `None` if the pair is below the threshold (and therefore absent
    /// from the matrix) or if either activity is not in `activities`.
    pub fn dependency_score(
        &self,
        from: &ActivityName,
        to: &ActivityName,
    ) -> Option<DependencyScore> {
        self.dependency_matrix
            .get(&(from.clone(), to.clone()))
            .copied()
    }

    /// Return `true` if the arc `(from, to)` is present in the dependency
    /// graph `D` (i.e., its score met the threshold).
    pub fn has_dependency(&self, from: &ActivityName, to: &ActivityName) -> bool {
        self.dependency_matrix
            .contains_key(&(from.clone(), to.clone()))
    }

    /// Add an activity to the set `A`.
    ///
    /// Returns `true` if the activity was newly inserted, `false` if it was
    /// already present (mirrors `BTreeSet::insert`).
    pub fn add_activity(&mut self, activity: ActivityName) -> bool {
        self.activities.insert(activity)
    }

    /// Record a dependency arc `(from, to)` with its score.
    ///
    /// The arc is only stored if `score ≥ self.dependency_threshold`; if the
    /// score is below the threshold the call is a no-op and returns `false`.
    /// Both `from` and `to` must already be members of `activities`; if either
    /// is absent the call panics in debug builds.
    ///
    /// Returns `true` if the arc was inserted or updated.
    pub fn add_dependency(
        &mut self,
        from: ActivityName,
        to: ActivityName,
        score: DependencyScore,
    ) -> bool {
        debug_assert!(
            self.activities.contains(&from),
            "Activity '{}' not in HeuristicsNet", from
        );
        debug_assert!(
            self.activities.contains(&to),
            "Activity '{}' not in HeuristicsNet", to
        );
        if score.is_above_threshold(self.dependency_threshold) {
            self.dependency_matrix.insert((from, to), score);
            true
        } else {
            false
        }
    }

    /// Assign an input binding to an activity.
    ///
    /// Panics in debug builds if `activity` is not in `activities` or the
    /// binding is empty.
    pub fn set_input_binding(&mut self, activity: ActivityName, binding: InputOutputBinding) {
        debug_assert!(
            self.activities.contains(&activity),
            "Activity '{}' not in HeuristicsNet", activity
        );
        debug_assert!(binding.is_valid(), "InputOutputBinding must be non-empty");
        self.input_bindings.insert(activity, binding);
    }

    /// Assign an output binding to an activity.
    ///
    /// Panics in debug builds if `activity` is not in `activities` or the
    /// binding is empty.
    pub fn set_output_binding(&mut self, activity: ActivityName, binding: InputOutputBinding) {
        debug_assert!(
            self.activities.contains(&activity),
            "Activity '{}' not in HeuristicsNet", activity
        );
        debug_assert!(binding.is_valid(), "InputOutputBinding must be non-empty");
        self.output_bindings.insert(activity, binding);
    }

    /// Mark an activity as a start activity (no predecessors in `D`).
    ///
    /// Panics in debug builds if `activity` is not in `activities`.
    pub fn add_start_activity(&mut self, activity: ActivityName) {
        debug_assert!(
            self.activities.contains(&activity),
            "Activity '{}' not in HeuristicsNet", activity
        );
        self.start_activities.insert(activity);
    }

    /// Mark an activity as an end activity (no successors in `D`).
    ///
    /// Panics in debug builds if `activity` is not in `activities`.
    pub fn add_end_activity(&mut self, activity: ActivityName) {
        debug_assert!(
            self.activities.contains(&activity),
            "Activity '{}' not in HeuristicsNet", activity
        );
        self.end_activities.insert(activity);
    }

    /// Return an iterator over all dependency arcs `((from, to), score)` in
    /// `D`, ordered lexicographically by `(from, to)`.
    pub fn dependency_arcs(
        &self,
    ) -> impl Iterator<Item = (&(ActivityName, ActivityName), &DependencyScore)> {
        self.dependency_matrix.iter()
    }

    /// Validate that the stored `HeuristicsNet` satisfies the structural
    /// invariants listed in the type-level documentation.
    ///
    /// Returns `Ok(())` on success or an `Err` with a human-readable
    /// description of the first violation found. This method does *not* check
    /// the quality of the mined model — only its structural consistency.
    pub fn validate(&self) -> Result<(), HeuristicsNetValidationError> {
        // Invariant 1: all dependency-matrix keys reference known activities.
        for (from, to) in self.dependency_matrix.keys() {
            if !self.activities.contains(from) {
                return Err(HeuristicsNetValidationError::UnknownActivity(
                    from.as_str().into(),
                    "dependency_matrix from-key",
                ));
            }
            if !self.activities.contains(to) {
                return Err(HeuristicsNetValidationError::UnknownActivity(
                    to.as_str().into(),
                    "dependency_matrix to-key",
                ));
            }
        }

        // Invariant 2: every stored score meets the threshold.
        for ((from, to), score) in &self.dependency_matrix {
            if !score.is_above_threshold(self.dependency_threshold) {
                return Err(HeuristicsNetValidationError::ScoreBelowThreshold {
                    from: from.as_str().into(),
                    to: to.as_str().into(),
                    score: score.value(),
                    threshold: self.dependency_threshold.value(),
                });
            }
        }

        // Invariant 3: input/output binding keys are in activities.
        for activity in self.input_bindings.keys() {
            if !self.activities.contains(activity) {
                return Err(HeuristicsNetValidationError::UnknownActivity(
                    activity.as_str().into(),
                    "input_bindings key",
                ));
            }
        }
        for activity in self.output_bindings.keys() {
            if !self.activities.contains(activity) {
                return Err(HeuristicsNetValidationError::UnknownActivity(
                    activity.as_str().into(),
                    "output_bindings key",
                ));
            }
        }

        // Invariant 4: start/end activities are in activities.
        for a in &self.start_activities {
            if !self.activities.contains(a) {
                return Err(HeuristicsNetValidationError::UnknownActivity(
                    a.as_str().into(),
                    "start_activities",
                ));
            }
        }
        for a in &self.end_activities {
            if !self.activities.contains(a) {
                return Err(HeuristicsNetValidationError::UnknownActivity(
                    a.as_str().into(),
                    "end_activities",
                ));
            }
        }

        // Invariant 5: bindings are non-empty.
        for (a, b) in &self.input_bindings {
            if !b.is_valid() {
                return Err(HeuristicsNetValidationError::EmptyBinding(
                    a.as_str().into(),
                    "input_bindings",
                ));
            }
        }
        for (a, b) in &self.output_bindings {
            if !b.is_valid() {
                return Err(HeuristicsNetValidationError::EmptyBinding(
                    a.as_str().into(),
                    "output_bindings",
                ));
            }
        }

        Ok(())
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for HeuristicsNet {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("HeuristicsNet", 7)?;
        state.serialize_field("activities", &self.activities)?;
        state.serialize_field("dependency_matrix", &self.dependency_matrix)?;
        state.serialize_field("input_bindings", &self.input_bindings)?;
        state.serialize_field("output_bindings", &self.output_bindings)?;
        state.serialize_field("dependency_threshold", &self.dependency_threshold)?;
        state.serialize_field("start_activities", &self.start_activities)?;
        state.serialize_field("end_activities", &self.end_activities)?;
        state.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for HeuristicsNet {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};

        struct HnVisitor;

        #[allow(non_camel_case_types)]
        enum Field {
            Activities,
            DependencyMatrix,
            InputBindings,
            OutputBindings,
            DependencyThreshold,
            StartActivities,
            EndActivities,
        }

        impl<'de> serde::Deserialize<'de> for Field {
            fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
                struct FieldVisitor;
                impl<'de> Visitor<'de> for FieldVisitor {
                    type Value = Field;
                    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                        f.write_str("a HeuristicsNet field name")
                    }
                    fn visit_str<E: de::Error>(self, v: &str) -> Result<Field, E> {
                        match v {
                            "activities" => Ok(Field::Activities),
                            "dependency_matrix" => Ok(Field::DependencyMatrix),
                            "input_bindings" => Ok(Field::InputBindings),
                            "output_bindings" => Ok(Field::OutputBindings),
                            "dependency_threshold" => Ok(Field::DependencyThreshold),
                            "start_activities" => Ok(Field::StartActivities),
                            "end_activities" => Ok(Field::EndActivities),
                            other => Err(de::Error::unknown_field(
                                other,
                                &[
                                    "activities",
                                    "dependency_matrix",
                                    "input_bindings",
                                    "output_bindings",
                                    "dependency_threshold",
                                    "start_activities",
                                    "end_activities",
                                ],
                            )),
                        }
                    }
                }
                de.deserialize_identifier(FieldVisitor)
            }
        }

        impl<'de> Visitor<'de> for HnVisitor {
            type Value = HeuristicsNet;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a HeuristicsNet object")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<HeuristicsNet, A::Error> {
                let mut activities = None;
                let mut dependency_matrix = None;
                let mut input_bindings = None;
                let mut output_bindings = None;
                let mut dependency_threshold = None;
                let mut start_activities = None;
                let mut end_activities = None;

                while let Some(key) = map.next_key::<Field>()? {
                    match key {
                        Field::Activities => {
                            activities = Some(map.next_value()?);
                        }
                        Field::DependencyMatrix => {
                            dependency_matrix = Some(map.next_value()?);
                        }
                        Field::InputBindings => {
                            input_bindings = Some(map.next_value()?);
                        }
                        Field::OutputBindings => {
                            output_bindings = Some(map.next_value()?);
                        }
                        Field::DependencyThreshold => {
                            dependency_threshold = Some(map.next_value()?);
                        }
                        Field::StartActivities => {
                            start_activities = Some(map.next_value()?);
                        }
                        Field::EndActivities => {
                            end_activities = Some(map.next_value()?);
                        }
                    }
                }

                Ok(HeuristicsNet {
                    activities: activities
                        .ok_or_else(|| de::Error::missing_field("activities"))?,
                    dependency_matrix: dependency_matrix
                        .ok_or_else(|| de::Error::missing_field("dependency_matrix"))?,
                    input_bindings: input_bindings
                        .ok_or_else(|| de::Error::missing_field("input_bindings"))?,
                    output_bindings: output_bindings
                        .ok_or_else(|| de::Error::missing_field("output_bindings"))?,
                    dependency_threshold: dependency_threshold
                        .ok_or_else(|| de::Error::missing_field("dependency_threshold"))?,
                    start_activities: start_activities
                        .ok_or_else(|| de::Error::missing_field("start_activities"))?,
                    end_activities: end_activities
                        .ok_or_else(|| de::Error::missing_field("end_activities"))?,
                })
            }
        }

        const FIELDS: &[&str] = &[
            "activities",
            "dependency_matrix",
            "input_bindings",
            "output_bindings",
            "dependency_threshold",
            "start_activities",
            "end_activities",
        ];
        deserializer.deserialize_struct("HeuristicsNet", FIELDS, HnVisitor)
    }
}

// ---------------------------------------------------------------------------
// Error type for structural validation
// ---------------------------------------------------------------------------

/// Structural validation error returned by [`HeuristicsNet::validate`].
///
/// Each variant corresponds to one of the structural invariants documented on
/// [`HeuristicsNet`].
#[derive(Debug, Clone, PartialEq)]
pub enum HeuristicsNetValidationError {
    /// An activity referenced by a binding key or dependency-matrix key is not
    /// a member of `activities`.
    ///
    /// The `&'static str` names the collection where the unknown key was found.
    UnknownActivity(String, &'static str),

    /// A stored dependency score is below the net's `dependency_threshold`.
    ///
    /// This indicates the net was constructed incorrectly; the Heuristics Miner
    /// algorithm must filter pairs before insertion.
    ScoreBelowThreshold {
        from: String,
        to: String,
        score: f64,
        threshold: f64,
    },

    /// A binding assigned to an activity has an empty member set.
    ///
    /// The `&'static str` names the binding map (`"input_bindings"` or
    /// `"output_bindings"`).
    EmptyBinding(String, &'static str),
}

impl fmt::Display for HeuristicsNetValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HeuristicsNetValidationError::UnknownActivity(a, ctx) => {
                write!(f, "Unknown activity '{}' found in {}", a, ctx)
            }
            HeuristicsNetValidationError::ScoreBelowThreshold {
                from,
                to,
                score,
                threshold,
            } => write!(
                f,
                "Dependency ({}, {}) has score {:.6} below threshold {:.6}",
                from, to, score, threshold
            ),
            HeuristicsNetValidationError::EmptyBinding(a, ctx) => {
                write!(f, "Empty binding for activity '{}' in {}", a, ctx)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- DependencyScore ---------------------------------------------------

    #[test]
    fn test_dependency_score_from_counts_max() {
        // Forward = 10, backward = 0 → a = 10/11 ≈ 0.909
        let score = DependencyScore::from_counts(10, 0);
        assert!(score.value() > 0.9 && score.value() < 1.0);
    }

    #[test]
    fn test_dependency_score_from_counts_min_is_open_bound() {
        // Forward = 0, backward = 10 → a = -10/11 ≈ -0.909 (never reaches -1)
        let score = DependencyScore::from_counts(0, 10);
        assert!(score.value() > -1.0);
        assert!(score.value() < 0.0);
    }

    #[test]
    fn test_dependency_score_from_counts_symmetric_zero() {
        // Equal forward and backward → score = 0
        let score = DependencyScore::from_counts(5, 5);
        // (5-5)/(5+5+1) = 0/11 = 0
        assert!((score.value() - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_dependency_score_formula_paper_example() {
        // |i>j|=3, |j>i|=1 → a = (3-1)/(3+1+1) = 2/5 = 0.4
        let score = DependencyScore::from_counts(3, 1);
        let expected = (3.0 - 1.0) / (3.0 + 1.0 + 1.0);
        assert!((score.value() - expected).abs() < 1e-10);
    }

    #[test]
    fn test_dependency_score_is_above_threshold() {
        let score = DependencyScore::new(0.7);
        let threshold = DependencyScore::new(0.5);
        assert!(score.is_above_threshold(threshold));

        let low = DependencyScore::new(0.3);
        assert!(!low.is_above_threshold(threshold));
    }

    #[test]
    fn test_dependency_score_deref() {
        let score = DependencyScore::new(0.6);
        // Should deref to &f64
        let raw: f64 = *score;
        assert!((raw - 0.6).abs() < f64::EPSILON);
    }

    // ---- ActivityName ------------------------------------------------------

    #[test]
    fn test_activity_name_deref() {
        let a = ActivityName::new("Register");
        assert_eq!(a.as_str(), "Register");
        // Deref to &String
        let s: &String = &*a;
        assert_eq!(s, "Register");
    }

    #[test]
    fn test_activity_name_ordering() {
        let a = ActivityName::new("A");
        let b = ActivityName::new("B");
        assert!(a < b);
    }

    #[test]
    fn test_activity_name_from_str() {
        let a: ActivityName = "Approve".into();
        assert_eq!(a.as_str(), "Approve");
    }

    // ---- InputOutputBinding ------------------------------------------------

    #[test]
    fn test_binding_and_members() {
        let b = InputOutputBinding::and([
            ActivityName::new("A"),
            ActivityName::new("B"),
        ]);
        assert_eq!(b.len(), 2);
        assert_eq!(b.kind_str(), "and");
        assert!(b.is_valid());
    }

    #[test]
    fn test_binding_or() {
        let b = InputOutputBinding::or([ActivityName::new("X")]);
        assert_eq!(b.kind_str(), "or");
        assert_eq!(b.len(), 1);
    }

    #[test]
    fn test_binding_xor() {
        let b = InputOutputBinding::xor([ActivityName::new("Y"), ActivityName::new("Z")]);
        assert_eq!(b.kind_str(), "xor");
        assert_eq!(b.len(), 2);
    }

    #[test]
    fn test_binding_members_are_sorted() {
        // BTreeSet guarantees sorted order regardless of insertion order.
        let b = InputOutputBinding::and([
            ActivityName::new("C"),
            ActivityName::new("A"),
            ActivityName::new("B"),
        ]);
        let members: alloc::vec::Vec<_> = b.members().iter().collect();
        assert_eq!(members[0].as_str(), "A");
        assert_eq!(members[1].as_str(), "B");
        assert_eq!(members[2].as_str(), "C");
    }

    // ---- HeuristicsNet -----------------------------------------------------

    fn simple_net() -> HeuristicsNet {
        let threshold = DependencyScore::new(0.5);
        let mut hn = HeuristicsNet::new(threshold);

        let a = ActivityName::new("A");
        let b = ActivityName::new("B");
        let c = ActivityName::new("C");

        hn.add_activity(a.clone());
        hn.add_activity(b.clone());
        hn.add_activity(c.clone());

        // A → B (score 0.8), B → C (score 0.7)
        hn.add_dependency(a.clone(), b.clone(), DependencyScore::new(0.8));
        hn.add_dependency(b.clone(), c.clone(), DependencyScore::new(0.7));

        hn.set_output_binding(a.clone(), InputOutputBinding::xor([b.clone()]));
        hn.set_input_binding(b.clone(), InputOutputBinding::xor([a.clone()]));
        hn.set_output_binding(b.clone(), InputOutputBinding::xor([c.clone()]));
        hn.set_input_binding(c.clone(), InputOutputBinding::xor([b.clone()]));

        hn.add_start_activity(a.clone());
        hn.add_end_activity(c.clone());

        hn
    }

    #[test]
    fn test_heuristics_net_construction() {
        let hn = simple_net();
        assert_eq!(hn.activity_count(), 3);
        assert_eq!(hn.dependency_arc_count(), 2);
        assert!(!hn.is_empty());
    }

    #[test]
    fn test_heuristics_net_dependency_score_lookup() {
        let hn = simple_net();
        let a = ActivityName::new("A");
        let b = ActivityName::new("B");
        let c = ActivityName::new("C");

        let ab = hn.dependency_score(&a, &b).unwrap();
        assert!((ab.value() - 0.8).abs() < f64::EPSILON);

        let bc = hn.dependency_score(&b, &c).unwrap();
        assert!((bc.value() - 0.7).abs() < f64::EPSILON);

        // Reverse arc is absent
        assert!(hn.dependency_score(&c, &a).is_none());
    }

    #[test]
    fn test_heuristics_net_has_dependency() {
        let hn = simple_net();
        let a = ActivityName::new("A");
        let b = ActivityName::new("B");
        assert!(hn.has_dependency(&a, &b));
        assert!(!hn.has_dependency(&b, &a));
    }

    #[test]
    fn test_heuristics_net_start_end_activities() {
        let hn = simple_net();
        assert!(hn.start_activities.contains(&ActivityName::new("A")));
        assert!(hn.end_activities.contains(&ActivityName::new("C")));
        assert!(!hn.start_activities.contains(&ActivityName::new("B")));
    }

    #[test]
    fn test_heuristics_net_validate_ok() {
        let hn = simple_net();
        assert!(hn.validate().is_ok());
    }

    #[test]
    fn test_heuristics_net_add_dependency_below_threshold_is_noop() {
        let threshold = DependencyScore::new(0.5);
        let mut hn = HeuristicsNet::new(threshold);
        let a = ActivityName::new("A");
        let b = ActivityName::new("B");
        hn.add_activity(a.clone());
        hn.add_activity(b.clone());

        // Score 0.3 is below threshold 0.5 → should be rejected
        let inserted = hn.add_dependency(a.clone(), b.clone(), DependencyScore::new(0.3));
        assert!(!inserted);
        assert_eq!(hn.dependency_arc_count(), 0);
    }

    #[test]
    fn test_heuristics_net_validate_unknown_activity_in_dep() {
        let threshold = DependencyScore::new(0.5);
        let mut hn = HeuristicsNet::new(threshold);
        let a = ActivityName::new("A");
        let b = ActivityName::new("B");
        hn.add_activity(a.clone());
        hn.add_activity(b.clone());
        // Manually insert an arc referencing an unknown activity to simulate corruption.
        let unknown = ActivityName::new("UNKNOWN");
        hn.dependency_matrix
            .insert((a.clone(), unknown.clone()), DependencyScore::new(0.9));
        let err = hn.validate().unwrap_err();
        matches!(
            err,
            HeuristicsNetValidationError::UnknownActivity(_, "dependency_matrix to-key")
        );
    }

    #[test]
    fn test_heuristics_net_dependency_arcs_are_deterministically_ordered() {
        // Multiple insertions must always yield the same iteration order (BTreeMap).
        let threshold = DependencyScore::new(0.0);
        let mut hn = HeuristicsNet::new(threshold);
        for c in ["C", "A", "B"] {
            hn.add_activity(ActivityName::new(c));
        }
        // Insert in non-alphabetical order
        hn.add_dependency(
            ActivityName::new("C"),
            ActivityName::new("A"),
            DependencyScore::new(0.6),
        );
        hn.add_dependency(
            ActivityName::new("A"),
            ActivityName::new("B"),
            DependencyScore::new(0.7),
        );
        hn.add_dependency(
            ActivityName::new("B"),
            ActivityName::new("C"),
            DependencyScore::new(0.8),
        );

        let keys: alloc::vec::Vec<_> = hn
            .dependency_arcs()
            .map(|((f, t), _)| (f.as_str(), t.as_str()))
            .collect();

        // BTreeMap orders by key, so (A,B) < (B,C) < (C,A)
        assert_eq!(keys[0], ("A", "B"));
        assert_eq!(keys[1], ("B", "C"));
        assert_eq!(keys[2], ("C", "A"));
    }

    #[test]
    fn test_heuristics_net_default_threshold() {
        let hn = HeuristicsNet::with_default_threshold();
        assert!((hn.dependency_threshold.value() - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_validation_error_display() {
        let err = HeuristicsNetValidationError::UnknownActivity(
            "Ghost".into(),
            "dependency_matrix from-key",
        );
        let s = alloc::format!("{}", err);
        assert!(s.contains("Ghost"));
        assert!(s.contains("dependency_matrix from-key"));
    }

    #[test]
    fn test_score_below_threshold_validation_error() {
        let err = HeuristicsNetValidationError::ScoreBelowThreshold {
            from: "A".into(),
            to: "B".into(),
            score: 0.3,
            threshold: 0.5,
        };
        let s = alloc::format!("{}", err);
        assert!(s.contains("0.300000"));
        assert!(s.contains("0.500000"));
    }
}
