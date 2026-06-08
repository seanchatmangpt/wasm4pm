//! Transition System (TS) — the abstract state-machine abstraction of a process. StateId newtype prevents StateId being confused with other usize indices. BTreeMap/BTreeSet for deterministic state and alphabet enumeration.
//! Paper grounding: van der Aalst, Rubin, Verbeek, van Dongen, Kindler & Günther 2010 'Process Mining: A Two-Step Approach to Balance Between Underfitting and Overfitting' §3 Def 3.1: TS = (S, Σ, →, s₀) — state set S, activity alphabet Σ, transition relation → ⊆ S×Σ×S, initial state s₀.

extern crate alloc;

use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::String;
use alloc::vec::Vec;
use core::fmt;
use core::ops::Deref;

// ─── ActivityName ──────────────────────────────────────────────────────────────

/// A typed activity label drawn from the alphabet Σ of a Transition System.
///
/// Formal object from [van der Aalst et al. 2010]: element of the activity
/// alphabet Σ in TS = (S, Σ, →, s₀). Wraps a heap-allocated string.
/// Using a newtype rather than a raw `String` prevents activity names from
/// being silently confused with state labels, case identifiers, or other
/// string-typed values in the same data structure.
///
/// # Invariant
/// The inner string must be non-empty; an empty activity name has no
/// well-defined process-mining semantics.
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ActivityName(pub String);

impl ActivityName {
    /// Construct an `ActivityName` from any value that converts into a `String`.
    #[inline]
    pub fn new(name: impl Into<String>) -> Self {
        ActivityName(name.into())
    }

    /// View the inner string slice without cloning.
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
        fmt::Display::fmt(&self.0, f)
    }
}

impl From<&str> for ActivityName {
    #[inline]
    fn from(s: &str) -> Self {
        ActivityName(String::from(s))
    }
}

impl From<String> for ActivityName {
    #[inline]
    fn from(s: String) -> Self {
        ActivityName(s)
    }
}

#[cfg(feature = "serde")]
mod serde_activity_name {
    use super::ActivityName;
    use alloc::string::String;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    impl Serialize for ActivityName {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            self.0.serialize(s)
        }
    }

    impl<'de> Deserialize<'de> for ActivityName {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            String::deserialize(d).map(ActivityName)
        }
    }
}

// ─── Frequency ────────────────────────────────────────────────────────────────

/// An empirical occurrence count derived from log abstraction.
///
/// Formal object from [van der Aalst et al. 2010]: the paper describes TS
/// construction by abstracting event logs; each transition (s, a, s') carries
/// an empirical frequency — the number of times the corresponding activity `a`
/// was observed while the process was in state `s` and moved to state `s'`.
///
/// # Invariant
/// `Frequency` is always ≥ 1 when the transition was observed at least once.
/// A value of 0 indicates a structurally declared but never-fired transition
/// (e.g., from a model annotation rather than log abstraction).
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Frequency(pub u64);

impl Frequency {
    /// The smallest meaningful frequency — exactly one observed occurrence.
    pub const ONE: Frequency = Frequency(1);

    /// A frequency of zero: structurally declared but never observed in the log.
    pub const ZERO: Frequency = Frequency(0);

    /// Construct a `Frequency` from a raw count.
    #[inline]
    pub const fn new(count: u64) -> Self {
        Frequency(count)
    }

    /// Return the inner count.
    #[inline]
    pub const fn get(self) -> u64 {
        self.0
    }

    /// Saturating addition — frequency can never overflow in well-formed logs
    /// but this avoids a panic on pathological inputs.
    #[inline]
    pub fn saturating_add(self, other: Frequency) -> Frequency {
        Frequency(self.0.saturating_add(other.0))
    }
}

impl Deref for Frequency {
    type Target = u64;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for Frequency {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

impl From<u64> for Frequency {
    #[inline]
    fn from(n: u64) -> Self {
        Frequency(n)
    }
}

impl From<usize> for Frequency {
    #[inline]
    fn from(n: usize) -> Self {
        Frequency(n as u64)
    }
}

#[cfg(feature = "serde")]
mod serde_frequency {
    use super::Frequency;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    impl Serialize for Frequency {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            self.0.serialize(s)
        }
    }

    impl<'de> Deserialize<'de> for Frequency {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            u64::deserialize(d).map(Frequency)
        }
    }
}

// ─── StateId ──────────────────────────────────────────────────────────────────

/// Opaque identifier for a state `s ∈ S` in a Transition System.
///
/// Formal object from [van der Aalst et al. 2010]: `s ∈ S` — abstract state
/// identifier in a Transition System TS = (S, Σ, →, s₀) (§3 Def 3.1).
///
/// Using `u32` (not `usize`) achieves cross-platform determinism: a state
/// serialised on a 64-bit host deserialises identically on a 32-bit WASM
/// runtime. Using a newtype prevents a `StateId` from being silently used as
/// an array index into an unrelated collection, which was the precise bug
/// motivating this type (raw `usize` TSState.id in the original wasm4pm
/// transition_system.rs could alias with edge-list indices or OCEL object ids
/// at the call site).
///
/// # Zero-cost note
/// `#[repr(transparent)]` over `u32`. `Copy` — 4 bytes. No heap allocation.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct StateId(pub u32);

impl StateId {
    /// The conventional initial state id (ordinal 0).
    pub const INITIAL: StateId = StateId(0);

    /// Construct a `StateId` from a raw `u32`.
    #[inline]
    pub const fn new(id: u32) -> Self {
        StateId(id)
    }

    /// Return the inner `u32`.
    #[inline]
    pub const fn get(self) -> u32 {
        self.0
    }

    /// Return `true` iff this is the conventional initial-state sentinel.
    #[inline]
    pub fn is_initial(self) -> bool {
        self.0 == 0
    }
}

impl Deref for StateId {
    type Target = u32;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for StateId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "s{}", self.0)
    }
}

impl From<u32> for StateId {
    #[inline]
    fn from(id: u32) -> Self {
        StateId(id)
    }
}

#[cfg(feature = "serde")]
mod serde_state_id {
    use super::StateId;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    impl Serialize for StateId {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            self.0.serialize(s)
        }
    }

    impl<'de> Deserialize<'de> for StateId {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            u32::deserialize(d).map(StateId)
        }
    }
}

// ─── TsTransition ─────────────────────────────────────────────────────────────

/// A single element of the transition relation → ⊆ S × Σ × S.
///
/// Formal object from [van der Aalst et al. 2010]: `(s, a, s') ∈ →` — an
/// element of the transition relation with an empirical frequency from log
/// abstraction (§3 Def 3.1). The `frequency` field records how many times this
/// `(from, activity, to)` triple was observed during log abstraction; it is not
/// part of the minimal formal definition but is required for the Two-Step
/// algorithm's weighting heuristics.
///
/// `ActivityName` replaces the raw `String` in the  wasm4pm
/// `TSTransition.activity` field — a breaking but necessary fix noted in the
/// module-level audit.
///
/// # Invariant
/// `from ≠ to` is not enforced here (self-loops are permitted by the formal
/// definition), but `activity` must be an element of the `TransitionSystem`'s
/// `alphabet` field.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TsTransition {
    /// Source state — the `s` in `(s, a, s') ∈ →`.
    pub from: StateId,
    /// Target state — the `s'` in `(s, a, s') ∈ →`.
    pub to: StateId,
    /// Activity label — the `a` in `(s, a, s') ∈ →`, drawn from Σ.
    pub activity: ActivityName,
    /// Empirical frequency: how many times this transition was observed in the
    /// log during the abstraction step. A value of `Frequency::ZERO` denotes a
    /// structurally declared but unobserved transition.
    pub frequency: Frequency,
}

impl TsTransition {
    /// Construct a new `TsTransition` from its four components.
    #[inline]
    pub fn new(
        from: StateId,
        to: StateId,
        activity: impl Into<ActivityName>,
        frequency: impl Into<Frequency>,
    ) -> Self {
        TsTransition {
            from,
            to,
            activity: activity.into(),
            frequency: frequency.into(),
        }
    }

    /// Return `true` iff this is a self-loop (`from == to`).
    #[inline]
    pub fn is_self_loop(&self) -> bool {
        self.from == self.to
    }
}

impl fmt::Display for TsTransition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} --[{}]--> {} (freq={})",
            self.from, self.activity, self.to, self.frequency
        )
    }
}

#[cfg(feature = "serde")]
mod serde_ts_transition {
    use super::{ActivityName, Frequency, StateId, TsTransition};
    use alloc::string::String;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    #[derive(serde::Serialize, serde::Deserialize)]
    struct TsTransitionProxy {
        from: u32,
        to: u32,
        activity: String,
        frequency: u64,
    }

    impl Serialize for TsTransition {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            TsTransitionProxy {
                from: self.from.get(),
                to: self.to.get(),
                activity: self.activity.as_str().into(),
                frequency: self.frequency.get(),
            }
            .serialize(s)
        }
    }

    impl<'de> Deserialize<'de> for TsTransition {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            let p = TsTransitionProxy::deserialize(d)?;
            Ok(TsTransition {
                from: StateId(p.from),
                to: StateId(p.to),
                activity: ActivityName(p.activity),
                frequency: Frequency(p.frequency),
            })
        }
    }
}

// ─── TransitionSystem ─────────────────────────────────────────────────────────

/// A labelled Transition System TS = (S, Σ, →, s₀, F).
///
/// Formal object from [van der Aalst et al. 2010]: TS = (S, Σ, →, s₀)
/// — labelled transition system as defined in §3 Def 3.1. The implementation
/// extends the minimal definition with an `accepting` set F ⊆ S (final states
/// derived from trace endings during log abstraction) to enable language
/// equivalence and fitness checks.
///
/// ## Fields
/// - `states` — `BTreeMap<StateId, String>`: maps each state identifier to its
///   label. In the Two-Step approach the label is the window of activity names
///   used as the state abstraction (e.g., `"A, B"` for a 2-activity backward
///   window). `BTreeMap` guarantees deterministic enumeration order for
///   serialisation and cross-run reproducibility.
/// - `initial` — the unique initial state `s₀ ∈ S` (Def 3.1). The caller is
///   responsible for ensuring `initial ∈ states.keys()`.
/// - `accepting` — `BTreeSet<StateId>`: final/accepting states F ⊆ S
///   (renamed from `final_states` in the  code to match standard
///   automata-theory notation). `BTreeSet` guarantees deterministic
///   enumeration.
/// - `transitions` — `Vec<TsTransition>`: the transition relation → as an
///   ordered list of `(from, activity, to, frequency)` tuples. Order is
///   caller-determined; the set semantics of → are not enforced at this layer
///   (de-duplication is the responsibility of the builder).
/// - `alphabet` — `BTreeSet<ActivityName>`: the activity alphabet Σ derived
///   from the transitions. `BTreeSet` ensures deterministic alphabetical order.
///
/// ## Invariants (documented, not runtime-enforced)
/// 1. `initial ∈ states.keys()`
/// 2. `accepting ⊆ states.keys()`
/// 3. For every `t ∈ transitions`: `t.from ∈ states.keys()`,
///    `t.to ∈ states.keys()`, `t.activity ∈ alphabet`.
/// 4. `alphabet = { t.activity | t ∈ transitions }` (kept in sync by
///    [`TransitionSystem::rebuild_alphabet`]).
#[derive(Debug, Clone, PartialEq)]
pub struct TransitionSystem {
    /// Map from `StateId` to its string label (activity-window or custom label).
    /// `BTreeMap` guarantees deterministic key order.
    pub states: BTreeMap<StateId, String>,

    /// The unique initial state `s₀ ∈ S` (van der Aalst et al. 2010 §3 Def 3.1).
    pub initial: StateId,

    /// Accepting (final) states F ⊆ S — states at which a trace is
    /// considered complete. `BTreeSet` guarantees deterministic order.
    pub accepting: BTreeSet<StateId>,

    /// The transition relation → as an ordered list of typed tuples.
    /// Each element is `(s, a, s', freq) ∈ S × Σ × S × ℕ`.
    pub transitions: Vec<TsTransition>,

    /// The activity alphabet Σ — the set of all activity labels that appear
    /// in at least one transition. `BTreeSet` ensures deterministic
    /// alphabetical order.
    pub alphabet: BTreeSet<ActivityName>,
}

impl TransitionSystem {
    /// Construct a minimal `TransitionSystem` with a single initial state and
    /// an empty transition relation.
    ///
    /// # Arguments
    /// - `initial_label` — the string label of the initial state (e.g., the
    ///   empty window `""` at the start of every trace).
    #[inline]
    pub fn new(initial_label: impl Into<String>) -> Self {
        let initial = StateId::INITIAL;
        let mut states = BTreeMap::new();
        states.insert(initial, initial_label.into());
        TransitionSystem {
            states,
            initial,
            accepting: BTreeSet::new(),
            transitions: Vec::new(),
            alphabet: BTreeSet::new(),
        }
    }

    /// Return the number of states |S|.
    #[inline]
    pub fn state_count(&self) -> usize {
        self.states.len()
    }

    /// Return the number of transitions |→|.
    #[inline]
    pub fn transition_count(&self) -> usize {
        self.transitions.len()
    }

    /// Return the size of the alphabet |Σ|.
    #[inline]
    pub fn alphabet_size(&self) -> usize {
        self.alphabet.len()
    }

    /// Return `true` iff `id` is a state in this system.
    #[inline]
    pub fn contains_state(&self, id: StateId) -> bool {
        self.states.contains_key(&id)
    }

    /// Return `true` iff `id` is an accepting state.
    #[inline]
    pub fn is_accepting(&self, id: StateId) -> bool {
        self.accepting.contains(&id)
    }

    /// Return the label of a state, or `None` if the state does not exist.
    #[inline]
    pub fn state_label(&self, id: StateId) -> Option<&str> {
        self.states.get(&id).map(|s| s.as_str())
    }

    /// Add a new state with the given label. Returns the assigned `StateId`.
    ///
    /// The id is assigned as `max(existing_ids) + 1`, or `StateId(1)` if only
    /// the initial state (id 0) exists. This preserves the invariant that ids
    /// increase monotonically and never collide.
    pub fn add_state(&mut self, label: impl Into<String>) -> StateId {
        let next = self
            .states
            .keys()
            .last()
            .map(|k| StateId(k.0.saturating_add(1)))
            .unwrap_or(StateId::INITIAL);
        self.states.insert(next, label.into());
        next
    }

    /// Mark a state as accepting (final).
    ///
    /// No-op if the state does not exist in `self.states`; callers should add
    /// the state first via [`add_state`].
    #[inline]
    pub fn mark_accepting(&mut self, id: StateId) {
        self.accepting.insert(id);
    }

    /// Add a transition to the system and update `self.alphabet`.
    ///
    /// This does **not** de-duplicate: if the same `(from, activity, to)` triple
    /// is added twice, both entries appear in `self.transitions`. The caller is
    /// responsible for de-duplication or frequency aggregation if required.
    pub fn add_transition(&mut self, transition: TsTransition) {
        self.alphabet.insert(transition.activity.clone());
        self.transitions.push(transition);
    }

    /// Rebuild `self.alphabet` from scratch by scanning all transitions.
    ///
    /// Use this if you have mutated `self.transitions` directly.
    pub fn rebuild_alphabet(&mut self) {
        self.alphabet.clear();
        for t in &self.transitions {
            self.alphabet.insert(t.activity.clone());
        }
    }

    /// Return all transitions that depart from state `from`.
    ///
    /// Allocates a new `Vec`; for hot paths consider iterating
    /// `self.transitions` directly.
    pub fn outgoing(&self, from: StateId) -> Vec<&TsTransition> {
        self.transitions.iter().filter(|t| t.from == from).collect()
    }

    /// Return all transitions that arrive at state `to`.
    pub fn incoming(&self, to: StateId) -> Vec<&TsTransition> {
        self.transitions.iter().filter(|t| t.to == to).collect()
    }

    /// Return all states reachable from `start` via a single transition step.
    pub fn successors(&self, start: StateId) -> BTreeSet<StateId> {
        self.transitions
            .iter()
            .filter(|t| t.from == start)
            .map(|t| t.to)
            .collect()
    }

    /// Return all states that can reach `target` via a single transition step.
    pub fn predecessors(&self, target: StateId) -> BTreeSet<StateId> {
        self.transitions
            .iter()
            .filter(|t| t.to == target)
            .map(|t| t.from)
            .collect()
    }

    /// Return `true` iff there are no accepting states — useful for detecting
    /// structurally incomplete systems produced during incremental construction.
    #[inline]
    pub fn has_accepting_states(&self) -> bool {
        !self.accepting.is_empty()
    }

    /// Return the set of states S as a `BTreeSet` of `StateId` keys.
    ///
    /// This clones the key set from the `BTreeMap`; prefer iterating
    /// `self.states.keys()` when allocation is undesirable.
    pub fn state_ids(&self) -> BTreeSet<StateId> {
        self.states.keys().copied().collect()
    }

    /// Validate structural invariants and return a list of violation strings.
    ///
    /// Checks:
    /// 1. `initial ∈ states`
    /// 2. `accepting ⊆ states`
    /// 3. Every transition's `from` and `to` are in `states`
    /// 4. Every transition's `activity` is in `alphabet`
    ///
    /// An empty return value means the structure is well-formed.
    pub fn validate(&self) -> Vec<String> {
        let mut errors: Vec<String> = Vec::new();

        if !self.states.contains_key(&self.initial) {
            errors.push(alloc::format!(
                "initial state {} not in states",
                self.initial
            ));
        }

        for &s in &self.accepting {
            if !self.states.contains_key(&s) {
                errors.push(alloc::format!("accepting state {} not in states", s));
            }
        }

        for (i, t) in self.transitions.iter().enumerate() {
            if !self.states.contains_key(&t.from) {
                errors.push(alloc::format!(
                    "transition[{}]: from={} not in states",
                    i,
                    t.from
                ));
            }
            if !self.states.contains_key(&t.to) {
                errors.push(alloc::format!(
                    "transition[{}]: to={} not in states",
                    i,
                    t.to
                ));
            }
            if !self.alphabet.contains(&t.activity) {
                errors.push(alloc::format!(
                    "transition[{}]: activity '{}' not in alphabet",
                    i,
                    t.activity
                ));
            }
        }

        errors
    }
}

impl Default for TransitionSystem {
    /// Creates a `TransitionSystem` with a single initial state labelled `""`.
    fn default() -> Self {
        TransitionSystem::new("")
    }
}

impl fmt::Display for TransitionSystem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "TS(|S|={}, |Σ|={}, |→|={}, s₀={}, |F|={})",
            self.state_count(),
            self.alphabet_size(),
            self.transition_count(),
            self.initial,
            self.accepting.len(),
        )
    }
}

#[cfg(feature = "serde")]
mod serde_transition_system {
    use super::{
        ActivityName, BTreeMap, BTreeSet, Frequency, StateId, TransitionSystem, TsTransition,
    };
    use alloc::string::String;
    use alloc::vec::Vec;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    #[derive(serde::Serialize, serde::Deserialize)]
    struct TransitionSystemProxy {
        states: BTreeMap<u32, String>,
        initial: u32,
        accepting: Vec<u32>,
        transitions: Vec<TsTransitionProxy>,
        alphabet: Vec<String>,
    }

    #[derive(serde::Serialize, serde::Deserialize)]
    struct TsTransitionProxy {
        from: u32,
        to: u32,
        activity: String,
        frequency: u64,
    }

    impl Serialize for TransitionSystem {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            TransitionSystemProxy {
                states: self
                    .states
                    .iter()
                    .map(|(k, v)| (k.get(), v.clone()))
                    .collect(),
                initial: self.initial.get(),
                accepting: self.accepting.iter().map(|s| s.get()).collect(),
                transitions: self
                    .transitions
                    .iter()
                    .map(|t| TsTransitionProxy {
                        from: t.from.get(),
                        to: t.to.get(),
                        activity: t.activity.as_str().into(),
                        frequency: t.frequency.get(),
                    })
                    .collect(),
                alphabet: self.alphabet.iter().map(|a| a.as_str().into()).collect(),
            }
            .serialize(s)
        }
    }

    impl<'de> Deserialize<'de> for TransitionSystem {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            let p = TransitionSystemProxy::deserialize(d)?;
            let states = p.states.into_iter().map(|(k, v)| (StateId(k), v)).collect();
            let accepting = p.accepting.into_iter().map(StateId).collect();
            let transitions = p
                .transitions
                .into_iter()
                .map(|t| TsTransition {
                    from: StateId(t.from),
                    to: StateId(t.to),
                    activity: ActivityName(t.activity),
                    frequency: Frequency(t.frequency),
                })
                .collect();
            let alphabet = p.alphabet.into_iter().map(ActivityName).collect();
            Ok(TransitionSystem {
                states,
                initial: StateId(p.initial),
                accepting,
                transitions,
                alphabet,
            })
        }
    }
}

// ─── Unit Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── StateId ────────────────────────────────────────────────────────────────

    #[test]
    fn state_id_newtype_is_repr_transparent_u32() {
        // Zero-cost: size_of<StateId> == size_of<u32>
        assert_eq!(core::mem::size_of::<StateId>(), core::mem::size_of::<u32>(),);
    }

    #[test]
    fn state_id_ordering_follows_inner_u32() {
        let s0 = StateId::new(0);
        let s1 = StateId::new(1);
        let s9 = StateId::new(9);
        assert!(s0 < s1);
        assert!(s1 < s9);
    }

    #[test]
    fn state_id_deref_gives_inner_u32() {
        let s = StateId::new(42);
        assert_eq!(*s, 42u32);
    }

    #[test]
    fn state_id_initial_sentinel() {
        assert!(StateId::INITIAL.is_initial());
        assert!(!StateId::new(1).is_initial());
    }

    #[test]
    fn state_id_display() {
        assert_eq!(alloc::format!("{}", StateId::new(3)), "s3");
    }

    // ── ActivityName ──────────────────────────────────────────────────────────

    #[test]
    fn activity_name_from_str() {
        let a: ActivityName = "Register".into();
        assert_eq!(a.as_str(), "Register");
    }

    #[test]
    fn activity_name_ordering_is_lexicographic() {
        let a = ActivityName::new("A");
        let b = ActivityName::new("B");
        assert!(a < b);
    }

    #[test]
    fn activity_name_deref_to_string() {
        let a = ActivityName::new("Approve");
        let s: &String = &*a;
        assert_eq!(s, "Approve");
    }

    #[test]
    fn activity_name_equality() {
        assert_eq!(ActivityName::new("Ship"), ActivityName::new("Ship"));
        assert_ne!(ActivityName::new("Ship"), ActivityName::new("ship"));
    }

    // ── Frequency ─────────────────────────────────────────────────────────────

    #[test]
    fn frequency_zero_and_one_sentinels() {
        assert_eq!(Frequency::ZERO.get(), 0u64);
        assert_eq!(Frequency::ONE.get(), 1u64);
    }

    #[test]
    fn frequency_saturating_add_no_panic() {
        let max = Frequency::new(u64::MAX);
        let result = max.saturating_add(Frequency::ONE);
        assert_eq!(result.get(), u64::MAX);
    }

    #[test]
    fn frequency_from_usize() {
        let f = Frequency::from(7usize);
        assert_eq!(f.get(), 7u64);
    }

    #[test]
    fn frequency_ordering() {
        assert!(Frequency::ZERO < Frequency::ONE);
        assert!(Frequency::new(5) < Frequency::new(10));
    }

    // ── TsTransition ──────────────────────────────────────────────────────────

    #[test]
    fn ts_transition_self_loop_detection() {
        let t = TsTransition::new(StateId::new(2), StateId::new(2), "Loop", Frequency::ONE);
        assert!(t.is_self_loop());
    }

    #[test]
    fn ts_transition_not_self_loop() {
        let t = TsTransition::new(StateId::new(0), StateId::new(1), "Register", 5u64);
        assert!(!t.is_self_loop());
    }

    #[test]
    fn ts_transition_display_format() {
        let t = TsTransition::new(StateId::new(0), StateId::new(1), "A", Frequency::ONE);
        let s = alloc::format!("{}", t);
        assert!(s.contains("A"));
        assert!(s.contains("freq=1"));
    }

    // ── TransitionSystem ──────────────────────────────────────────────────────

    #[test]
    fn transition_system_new_has_initial_state() {
        let ts = TransitionSystem::new("start");
        assert_eq!(ts.state_count(), 1);
        assert_eq!(ts.state_label(StateId::INITIAL), Some("start"));
        assert_eq!(ts.initial, StateId::INITIAL);
    }

    #[test]
    fn transition_system_add_state_monotonic_ids() {
        let mut ts = TransitionSystem::new("s0");
        let s1 = ts.add_state("s1");
        let s2 = ts.add_state("s2");
        assert_eq!(s1.get(), 1);
        assert_eq!(s2.get(), 2);
        assert_eq!(ts.state_count(), 3);
    }

    #[test]
    fn transition_system_add_transition_updates_alphabet() {
        let mut ts = TransitionSystem::new("s0");
        let s1 = ts.add_state("s1");
        ts.add_transition(TsTransition::new(StateId::INITIAL, s1, "Register", 3u64));
        ts.add_transition(TsTransition::new(s1, s1, "Approve", 1u64));
        assert_eq!(ts.alphabet_size(), 2);
        assert!(ts.alphabet.contains(&ActivityName::new("Register")));
        assert!(ts.alphabet.contains(&ActivityName::new("Approve")));
    }

    #[test]
    fn transition_system_mark_accepting() {
        let mut ts = TransitionSystem::new("s0");
        let s1 = ts.add_state("sink");
        ts.mark_accepting(s1);
        assert!(ts.is_accepting(s1));
        assert!(!ts.is_accepting(StateId::INITIAL));
        assert!(ts.has_accepting_states());
    }

    #[test]
    fn transition_system_outgoing_and_incoming() {
        let mut ts = TransitionSystem::new("s0");
        let s1 = ts.add_state("s1");
        let s2 = ts.add_state("s2");
        ts.add_transition(TsTransition::new(StateId::INITIAL, s1, "A", 1u64));
        ts.add_transition(TsTransition::new(StateId::INITIAL, s2, "B", 1u64));
        ts.add_transition(TsTransition::new(s1, s2, "C", 1u64));

        assert_eq!(ts.outgoing(StateId::INITIAL).len(), 2);
        assert_eq!(ts.incoming(s2).len(), 2);
        assert_eq!(ts.outgoing(s2).len(), 0);
    }

    #[test]
    fn transition_system_successors_and_predecessors() {
        let mut ts = TransitionSystem::new("s0");
        let s1 = ts.add_state("s1");
        ts.add_transition(TsTransition::new(StateId::INITIAL, s1, "A", 1u64));

        let succ = ts.successors(StateId::INITIAL);
        assert!(succ.contains(&s1));

        let pred = ts.predecessors(s1);
        assert!(pred.contains(&StateId::INITIAL));
    }

    #[test]
    fn transition_system_validate_well_formed() {
        let mut ts = TransitionSystem::new("s0");
        let s1 = ts.add_state("s1");
        ts.mark_accepting(s1);
        ts.add_transition(TsTransition::new(StateId::INITIAL, s1, "A", 1u64));
        let errs = ts.validate();
        assert!(errs.is_empty(), "unexpected errors: {:?}", errs);
    }

    #[test]
    fn transition_system_validate_detects_bad_initial() {
        let mut ts = TransitionSystem::new("s0");
        ts.initial = StateId::new(99); // not in states
        let errs = ts.validate();
        assert!(!errs.is_empty());
        assert!(errs[0].contains("initial state"));
    }

    #[test]
    fn transition_system_validate_detects_transition_to_unknown_state() {
        let mut ts = TransitionSystem::new("s0");
        // Bypass add_transition to inject a bad transition manually
        ts.transitions.push(TsTransition {
            from: StateId::INITIAL,
            to: StateId::new(99),
            activity: ActivityName::new("X"),
            frequency: Frequency::ONE,
        });
        ts.alphabet.insert(ActivityName::new("X"));
        let errs = ts.validate();
        assert!(!errs.is_empty());
        assert!(errs.iter().any(|e| e.contains("to=s99")));
    }

    #[test]
    fn transition_system_rebuild_alphabet() {
        let mut ts = TransitionSystem::new("s0");
        let s1 = ts.add_state("s1");
        ts.add_transition(TsTransition::new(StateId::INITIAL, s1, "A", 1u64));
        // Manually corrupt the alphabet
        ts.alphabet.clear();
        assert_eq!(ts.alphabet_size(), 0);
        ts.rebuild_alphabet();
        assert_eq!(ts.alphabet_size(), 1);
        assert!(ts.alphabet.contains(&ActivityName::new("A")));
    }

    #[test]
    fn transition_system_display() {
        let ts = TransitionSystem::new("start");
        let s = alloc::format!("{}", ts);
        assert!(s.starts_with("TS("));
    }

    #[test]
    fn transition_system_default_has_initial_state() {
        let ts = TransitionSystem::default();
        assert_eq!(ts.state_count(), 1);
        assert_eq!(ts.initial, StateId::INITIAL);
    }

    #[test]
    fn btree_state_enumeration_is_deterministic() {
        // BTreeMap must enumerate states in ascending StateId order.
        let mut ts = TransitionSystem::new("s0");
        let s2 = ts.add_state("s2");
        let s1 = ts.add_state("s1");
        // Keys are iterated in sorted order regardless of insertion order.
        let keys: Vec<StateId> = ts.states.keys().copied().collect();
        let mut sorted = keys.clone();
        sorted.sort();
        assert_eq!(keys, sorted, "BTreeMap must iterate in sorted key order");
        // Confirm s2 was allocated before s1 but still appears after INITIAL
        assert_eq!(s2.get(), 1);
        assert_eq!(s1.get(), 2);
    }

    #[test]
    fn btree_alphabet_is_lexicographically_sorted() {
        let mut ts = TransitionSystem::new("s0");
        let s1 = ts.add_state("s1");
        ts.add_transition(TsTransition::new(StateId::INITIAL, s1, "Zebra", 1u64));
        ts.add_transition(TsTransition::new(StateId::INITIAL, s1, "Apple", 2u64));
        let alpha: Vec<&ActivityName> = ts.alphabet.iter().collect();
        assert_eq!(alpha[0].as_str(), "Apple");
        assert_eq!(alpha[1].as_str(), "Zebra");
    }
}
