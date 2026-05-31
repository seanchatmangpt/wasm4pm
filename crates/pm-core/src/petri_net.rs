//! Petri net model with strongly-typed PlaceId/TransitionId newtypes. ArcEndpoint enum makes the
//! arc direction bipartite invariant explicit at the type level, eliminating the O(n) is_place()
//! scan present in wasm4pm's etconformance_precision.rs. Marking uses BTreeMap<PlaceId,
//! TokenCount> for deterministic replay.
//!
//! Paper grounding: van der Aalst 2016 §3.1 Def 3.1: N = (P, T, F, W, M₀). WF-net (Def 3.3):
//! unique source i, unique sink o, every node on a path from i to o. Soundness (Def 3.5): (1) no
//! dead transitions, (2) option to complete, (3) proper completion. Kourani, Park & van der Aalst
//! 2026 arXiv:2602.15739v3 §3 for free-choice, state-machine, marked-graph predicates.

// ---------------------------------------------------------------------------
// no_std compatibility
// ---------------------------------------------------------------------------
// This crate is written for #![no_std] + alloc. When building with std the
// alloc crate is re-exported by std, so there is no conflict.

extern crate alloc;

use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::String;
use alloc::vec::Vec;
use core::fmt;
use core::ops::Deref;

// ---------------------------------------------------------------------------
// PlaceId newtype
// ---------------------------------------------------------------------------

/// Strongly-typed identifier for a **place** `p ∈ P` in the Petri net
/// `N = (P, T, F, W, M₀)` (van der Aalst 2016 §3.1 Def 3.1).
///
/// Using a distinct newtype over [`String`] makes the bipartite invariant of
/// the flow relation `F ⊆ (P×T) ∪ (T×P)` enforceable at the type level:
/// a function that expects a `PlaceId` cannot silently receive a
/// [`TransitionId`], and vice versa. This eliminates the O(n)
/// `PetriNetLookup::is_place` scan found in `wasm4pm` `etconformance_precision.rs`.
///
/// # Invariant
/// The inner `String` must be non-empty and unique within a given [`PetriNet`].
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PlaceId(pub String);

impl PlaceId {
    /// Construct a `PlaceId` from any `Into<String>`.
    #[inline]
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }
}

impl Deref for PlaceId {
    type Target = String;

    #[inline]
    fn deref(&self) -> &Self::Target {
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
        Self(s)
    }
}

impl From<&str> for PlaceId {
    #[inline]
    fn from(s: &str) -> Self {
        Self(s.into())
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for PlaceId {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for PlaceId {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer).map(Self)
    }
}

// ---------------------------------------------------------------------------
// TransitionId newtype
// ---------------------------------------------------------------------------

/// Strongly-typed identifier for a **transition** `t ∈ T` in the Petri net
/// `N = (P, T, F, W, M₀)` (van der Aalst 2016 §3.1 Def 3.1).
///
/// The type-level distinction from [`PlaceId`] encodes the bipartite property
/// of the flow relation so that arc direction errors become compile-time failures
/// rather than runtime panics (see [`ArcEndpoint`]).
///
/// # Invariant
/// The inner `String` must be non-empty and unique within a given [`PetriNet`].
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TransitionId(pub String);

impl TransitionId {
    /// Construct a `TransitionId` from any `Into<String>`.
    #[inline]
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }
}

impl Deref for TransitionId {
    type Target = String;

    #[inline]
    fn deref(&self) -> &Self::Target {
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
        Self(s)
    }
}

impl From<&str> for TransitionId {
    #[inline]
    fn from(s: &str) -> Self {
        Self(s.into())
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for TransitionId {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for TransitionId {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer).map(Self)
    }
}

// ---------------------------------------------------------------------------
// ActivityName newtype
// ---------------------------------------------------------------------------

/// Strongly-typed activity/event-class name used to label observable transitions
/// in a Petri net.
///
/// In the alignment framework (Adriansyah 2014 §3 Def 3.1) each observable
/// transition `t` carries a label `l(t) ∈ Σ`, where `Σ` is the activity
/// alphabet. Silent transitions (`τ`) are represented by `label: None` on
/// [`PetriTransition`].
///
/// # Invariant
/// The inner `String` must be non-empty (empty labels indicate invisible
/// transitions and should use `label: None` on [`PetriTransition`] instead).
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ActivityName(pub String);

impl ActivityName {
    /// Construct an `ActivityName` from any `Into<String>`.
    #[inline]
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
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
        Self(s)
    }
}

impl From<&str> for ActivityName {
    #[inline]
    fn from(s: &str) -> Self {
        Self(s.into())
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
        String::deserialize(deserializer).map(Self)
    }
}

// ---------------------------------------------------------------------------
// TokenCount newtype
// ---------------------------------------------------------------------------

/// Number of tokens held at a place `p` in a marking `M`.
///
/// Formal object: `M(p) ∈ ℕ` — the token count at place `p` in marking `M`
/// (van der Aalst 2016 §3.1 Def 3.1).
///
/// # Representation
/// `#[repr(transparent)]` over `u32` (not `usize`) so that markings are
/// byte-for-byte identical across 32-bit and 64-bit architectures, enabling
/// deterministic serialization and cross-architecture receipt comparison.
///
/// # Invariant
/// `TokenCount(0)` represents an empty place; there is no strict upper bound
/// in a general Petri net, though WF-net soundness requires 1-bounded markings
/// (at most one token per place) during reachability analysis.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TokenCount(pub u32);

impl TokenCount {
    /// Zero tokens — empty place.
    pub const ZERO: Self = Self(0);

    /// One token — the canonical initial token for a WF-net source place.
    pub const ONE: Self = Self(1);

    /// Returns `true` if the place holds no tokens.
    #[inline]
    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }

    /// Checked addition: returns `None` on overflow.
    #[inline]
    pub fn checked_add(self, rhs: Self) -> Option<Self> {
        self.0.checked_add(rhs.0).map(Self)
    }

    /// Saturating subtraction — cannot go below zero.
    #[inline]
    pub fn saturating_sub(self, rhs: Self) -> Self {
        Self(self.0.saturating_sub(rhs.0))
    }
}

impl Deref for TokenCount {
    type Target = u32;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for TokenCount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<u32> for TokenCount {
    #[inline]
    fn from(n: u32) -> Self {
        Self(n)
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for TokenCount {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for TokenCount {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        u32::deserialize(deserializer).map(Self)
    }
}

// ---------------------------------------------------------------------------
// Marking type alias
// ---------------------------------------------------------------------------

/// A marking assigns a non-negative integer token count to each place.
///
/// Formal object: `M: P → ℕ` — the marking function mapping each place to its
/// token count (van der Aalst 2016 §3.1 Def 3.1).
///
/// # Design rationale
/// `BTreeMap<PlaceId, TokenCount>` is chosen over `HashMap` for two reasons:
///
/// 1. **Determinism**: iteration order is the sorted [`PlaceId`] order, which
///    fixes the non-determinism of the `Marking = HashMap<String, usize>` type
///    found in `wasm4pm`'s `etconformance_precision.rs:30` and
///    `alignments.rs AlignmentState.marking`.
///
/// 2. **Receipt stability**: BLAKE3 hashes of serialized markings are
///    byte-stable across machines, satisfying the wasm4pm receipt-chain contract.
///
/// Absent entries are interpreted as `TokenCount::ZERO` (sparse representation).
pub type Marking = BTreeMap<PlaceId, TokenCount>;

// ---------------------------------------------------------------------------
// ArcEndpoint enum
// ---------------------------------------------------------------------------

/// An endpoint of an arc in the flow relation `F ⊆ (P×T) ∪ (T×P)`.
///
/// Formal object: endpoint in `F ⊆ (P×T) ∪ (T×P)` — the flow relation;
/// the enum encodes the bipartite invariant so place→place and
/// transition→transition arcs cannot be constructed (van der Aalst 2016 §3.1
/// Def 3.1).
///
/// # Type-level bipartite invariant
/// A [`PetriArc`] has `from: ArcEndpoint` and `to: ArcEndpoint`.  A valid arc
/// must have exactly one `Place` endpoint and one `Transition` endpoint.  The
/// invariant is documented rather than enforced at construction time so that
/// [`PetriNet`] can be built incrementally; callers that need to *verify* the
/// bipartite property should iterate `arcs` and pattern-match.
///
/// Replacing raw `(String, String)` pairs in `PetriNetArc` with this enum makes
/// the O(n) `PetriNetLookup::is_place` scan in `wasm4pm`
/// `etconformance_precision.rs` unnecessary — the kind of each endpoint is
/// directly legible from the variant, reducing arc classification to an O(1)
/// pattern match.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ArcEndpoint {
    /// A place endpoint `p ∈ P`.
    Place(PlaceId),
    /// A transition endpoint `t ∈ T`.
    Transition(TransitionId),
}

impl ArcEndpoint {
    /// Returns `true` if this endpoint is a place.
    #[inline]
    pub fn is_place(&self) -> bool {
        matches!(self, ArcEndpoint::Place(_))
    }

    /// Returns `true` if this endpoint is a transition.
    #[inline]
    pub fn is_transition(&self) -> bool {
        matches!(self, ArcEndpoint::Transition(_))
    }

    /// Returns the [`PlaceId`] if this is a `Place` variant, otherwise `None`.
    #[inline]
    pub fn place_id(&self) -> Option<&PlaceId> {
        match self {
            ArcEndpoint::Place(id) => Some(id),
            ArcEndpoint::Transition(_) => None,
        }
    }

    /// Returns the [`TransitionId`] if this is a `Transition` variant, otherwise `None`.
    #[inline]
    pub fn transition_id(&self) -> Option<&TransitionId> {
        match self {
            ArcEndpoint::Place(_) => None,
            ArcEndpoint::Transition(id) => Some(id),
        }
    }
}

impl fmt::Display for ArcEndpoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ArcEndpoint::Place(id) => write!(f, "place({})", id),
            ArcEndpoint::Transition(id) => write!(f, "transition({})", id),
        }
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for ArcEndpoint {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("ArcEndpoint", 2)?;
        match self {
            ArcEndpoint::Place(id) => {
                s.serialize_field("kind", "place")?;
                s.serialize_field("id", &id.0)?;
            }
            ArcEndpoint::Transition(id) => {
                s.serialize_field("kind", "transition")?;
                s.serialize_field("id", &id.0)?;
            }
        }
        s.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for ArcEndpoint {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};
        use core::fmt;

        struct ArcEndpointVisitor;

        impl<'de> Visitor<'de> for ArcEndpointVisitor {
            type Value = ArcEndpoint;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a map with 'kind' (\"place\" or \"transition\") and 'id' fields")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut kind: Option<String> = None;
                let mut id: Option<String> = None;
                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "kind" => kind = Some(map.next_value()?),
                        "id" => id = Some(map.next_value()?),
                        _ => {
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }
                let kind = kind.ok_or_else(|| de::Error::missing_field("kind"))?;
                let id = id.ok_or_else(|| de::Error::missing_field("id"))?;
                match kind.as_str() {
                    "place" => Ok(ArcEndpoint::Place(PlaceId(id))),
                    "transition" => Ok(ArcEndpoint::Transition(TransitionId(id))),
                    other => Err(de::Error::unknown_variant(other, &["place", "transition"])),
                }
            }
        }

        deserializer.deserialize_map(ArcEndpointVisitor)
    }
}

// ---------------------------------------------------------------------------
// PetriArc
// ---------------------------------------------------------------------------

/// A directed arc `(x, y, w) ∈ F` in the flow relation with weight `W(x, y)`.
///
/// Formal object: `(x, y, w) ∈ F` — arc in the flow relation with weight
/// `W(x,y)` (van der Aalst 2016 §3.1 Def 3.1). `weight = 1` is the standard
/// unit weight; `weight > 1` is permitted for weighted nets (e.g., reset arcs).
///
/// # Bipartite constraint
/// A valid arc must satisfy exactly one of:
/// - `from = Place(_)` and `to = Transition(_)` (place-to-transition)
/// - `from = Transition(_)` and `to = Place(_)` (transition-to-place)
///
/// The [`ArcEndpoint`] enum makes place→place and transition→transition arcs
/// type-distinguishable. [`PetriNet`] validation methods (`validate_bipartite`)
/// check this invariant over all arcs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PetriArc {
    /// Source endpoint of the arc.
    pub from: ArcEndpoint,
    /// Target endpoint of the arc.
    pub to: ArcEndpoint,
    /// Arc weight `W(from, to) ∈ ℕ₊`. Standard Petri nets use `weight = 1`.
    pub weight: u32,
}

impl PetriArc {
    /// Construct a unit-weight place-to-transition arc.
    #[inline]
    pub fn place_to_transition(from: PlaceId, to: TransitionId) -> Self {
        Self {
            from: ArcEndpoint::Place(from),
            to: ArcEndpoint::Transition(to),
            weight: 1,
        }
    }

    /// Construct a unit-weight transition-to-place arc.
    #[inline]
    pub fn transition_to_place(from: TransitionId, to: PlaceId) -> Self {
        Self {
            from: ArcEndpoint::Transition(from),
            to: ArcEndpoint::Place(to),
            weight: 1,
        }
    }

    /// Returns `true` if this arc respects the bipartite invariant (place↔transition).
    #[inline]
    pub fn is_bipartite(&self) -> bool {
        matches!(
            (&self.from, &self.to),
            (ArcEndpoint::Place(_), ArcEndpoint::Transition(_))
                | (ArcEndpoint::Transition(_), ArcEndpoint::Place(_))
        )
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for PetriArc {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("PetriArc", 3)?;
        s.serialize_field("from", &self.from)?;
        s.serialize_field("to", &self.to)?;
        s.serialize_field("weight", &self.weight)?;
        s.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for PetriArc {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};
        use core::fmt;

        struct PetriArcVisitor;

        impl<'de> Visitor<'de> for PetriArcVisitor {
            type Value = PetriArc;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a map with 'from', 'to', and optional 'weight' fields")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut from: Option<ArcEndpoint> = None;
                let mut to: Option<ArcEndpoint> = None;
                let mut weight: Option<u32> = None;
                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "from" => from = Some(map.next_value()?),
                        "to" => to = Some(map.next_value()?),
                        "weight" => weight = Some(map.next_value()?),
                        _ => {
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }
                Ok(PetriArc {
                    from: from.ok_or_else(|| de::Error::missing_field("from"))?,
                    to: to.ok_or_else(|| de::Error::missing_field("to"))?,
                    weight: weight.unwrap_or(1),
                })
            }
        }

        deserializer.deserialize_map(PetriArcVisitor)
    }
}

// ---------------------------------------------------------------------------
// PetriPlace
// ---------------------------------------------------------------------------

/// A place `p ∈ P` in a Petri net.
///
/// Formal object: `p ∈ P` — place node in `N = (P, T, F, W, M₀)`. The
/// `label` field is optional because source and sink places in WF-nets are
/// typically unlabelled (van der Aalst 2016 §3.1 and §3.3). Observable
/// places in OCEL-derived nets may carry an activity name as a semantic tag.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PetriPlace {
    /// Unique identifier for this place.
    pub id: PlaceId,
    /// Optional human-readable label. `None` for anonymous places (e.g., the
    /// WF-net source place `i` and sink place `o`).
    pub label: Option<ActivityName>,
}

impl PetriPlace {
    /// Construct an unlabelled place.
    #[inline]
    pub fn new(id: impl Into<PlaceId>) -> Self {
        Self {
            id: id.into(),
            label: None,
        }
    }

    /// Construct a labelled place.
    #[inline]
    pub fn with_label(id: impl Into<PlaceId>, label: impl Into<ActivityName>) -> Self {
        Self {
            id: id.into(),
            label: Some(label.into()),
        }
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for PetriPlace {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("PetriPlace", 2)?;
        s.serialize_field("id", &self.id.0)?;
        s.serialize_field("label", &self.label.as_ref().map(|a| &a.0))?;
        s.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for PetriPlace {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};
        use core::fmt;

        struct PetriPlaceVisitor;

        impl<'de> Visitor<'de> for PetriPlaceVisitor {
            type Value = PetriPlace;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a map with 'id' and optional 'label' fields")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut id: Option<String> = None;
                let mut label: Option<Option<String>> = None;
                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "id" => id = Some(map.next_value()?),
                        "label" => label = Some(map.next_value()?),
                        _ => {
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }
                Ok(PetriPlace {
                    id: PlaceId(id.ok_or_else(|| de::Error::missing_field("id"))?),
                    label: label
                        .unwrap_or(None)
                        .map(ActivityName),
                })
            }
        }

        deserializer.deserialize_map(PetriPlaceVisitor)
    }
}

// ---------------------------------------------------------------------------
// PetriTransition
// ---------------------------------------------------------------------------

/// A transition `t ∈ T` in a Petri net.
///
/// Formal object: `t ∈ T` — transition in `N`; `label = None` means `τ`
/// (silent/invisible transition) with zero alignment cost. Observable
/// transitions carry an [`ActivityName`] label (Adriansyah 2014 §3 Def 3.1).
///
/// # Silent transitions
/// `is_silent` is a concrete `bool` (not `Option<bool>`) because the value is
/// always meaningful: `true` means the transition is invisible (`τ`) and
/// contributes zero cost in alignment-based conformance checking; `false` means
/// the transition is observable and must be matched to a log event. This removes
/// the `Option<bool>` unwrap pattern found in `wasm4pm`'s `PetriNetTransition.is_invisible`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PetriTransition {
    /// Unique identifier for this transition.
    pub id: TransitionId,
    /// Activity label `l(t) ∈ Σ`. `None` indicates a silent transition `τ`.
    pub label: Option<ActivityName>,
    /// Whether this transition is silent (`τ`). When `true`, `label` should be
    /// `None`; when `false`, `label` should be `Some(_)`. Both `is_silent` and
    /// `label` are stored to allow the caller to distinguish "explicitly silent"
    /// from "labelled observable" without resorting to sentinel strings.
    pub is_silent: bool,
}

impl PetriTransition {
    /// Construct a labelled (observable) transition.
    #[inline]
    pub fn observable(id: impl Into<TransitionId>, label: impl Into<ActivityName>) -> Self {
        Self {
            id: id.into(),
            label: Some(label.into()),
            is_silent: false,
        }
    }

    /// Construct a silent (`τ`) transition with no label.
    #[inline]
    pub fn silent(id: impl Into<TransitionId>) -> Self {
        Self {
            id: id.into(),
            label: None,
            is_silent: true,
        }
    }

    /// Returns the activity name, or `None` if this is a silent transition.
    #[inline]
    pub fn activity(&self) -> Option<&ActivityName> {
        self.label.as_ref()
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for PetriTransition {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("PetriTransition", 3)?;
        s.serialize_field("id", &self.id.0)?;
        s.serialize_field("label", &self.label.as_ref().map(|a| &a.0))?;
        s.serialize_field("is_silent", &self.is_silent)?;
        s.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for PetriTransition {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};
        use core::fmt;

        struct PetriTransitionVisitor;

        impl<'de> Visitor<'de> for PetriTransitionVisitor {
            type Value = PetriTransition;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a map with 'id', optional 'label', and optional 'is_silent' fields")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut id: Option<String> = None;
                let mut label: Option<Option<String>> = None;
                let mut is_silent: Option<bool> = None;
                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "id" => id = Some(map.next_value()?),
                        "label" => label = Some(map.next_value()?),
                        "is_silent" => is_silent = Some(map.next_value()?),
                        _ => {
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }
                let label_inner = label.unwrap_or(None).map(ActivityName);
                let is_silent = is_silent.unwrap_or_else(|| label_inner.is_none());
                Ok(PetriTransition {
                    id: TransitionId(id.ok_or_else(|| de::Error::missing_field("id"))?),
                    label: label_inner,
                    is_silent,
                })
            }
        }

        deserializer.deserialize_map(PetriTransitionVisitor)
    }
}

// ---------------------------------------------------------------------------
// PetriNet
// ---------------------------------------------------------------------------

/// A Petri net `N = (P, T, F, W, M₀)` with strongly-typed node identifiers.
///
/// Formal object: `N = (P, T, F, W, M₀)` — the complete Petri net tuple
/// (van der Aalst 2016 §3.1 Def 3.1). `final_markings = {Ω}` holds the
/// WF-net acceptance conditions (Def 3.3).
///
/// # Map choice
/// `places` and `transitions` use `BTreeMap<_, _>` to provide:
/// - O(log n) lookup by id without building a secondary index.
/// - Deterministic iteration order (by [`PlaceId`] / [`TransitionId`] key
///   ordering), which fixes the non-deterministic `HashMap<String, _>` in
///   `wasm4pm`'s `PetriNet.initial_marking`.
///
/// # Arcs
/// `arcs` is a `Vec<PetriArc>` because arcs are enumerated, not looked up by
/// id. Algorithms that require fast `•t`/`t•` or `•p`/`p•` pre-sets should
/// build a structural view (e.g., an index over arcs) from this `Vec`.
///
/// # Final markings
/// WF-nets conventionally have a single final marking (one token in the sink
/// place `o`), but the type accommodates nets with multiple accepting markings
/// (e.g., labelled nets with alternative termination conditions).
#[derive(Debug, Clone, PartialEq)]
pub struct PetriNet {
    /// Places `P` — keyed by [`PlaceId`] for O(log n) lookup.
    pub places: BTreeMap<PlaceId, PetriPlace>,
    /// Transitions `T` — keyed by [`TransitionId`] for O(log n) lookup.
    pub transitions: BTreeMap<TransitionId, PetriTransition>,
    /// Flow relation `F ⊆ (P×T) ∪ (T×P)` with weights `W`.
    pub arcs: Vec<PetriArc>,
    /// Initial marking `M₀: P → ℕ`. Missing entries are `TokenCount::ZERO`.
    pub initial_marking: Marking,
    /// Set of accepting final markings `{Ω}`. For a WF-net this is typically
    /// `[{sink_place → TokenCount::ONE}]`.
    pub final_markings: Vec<Marking>,
}

impl PetriNet {
    /// Construct an empty Petri net.
    #[inline]
    pub fn new() -> Self {
        Self {
            places: BTreeMap::new(),
            transitions: BTreeMap::new(),
            arcs: Vec::new(),
            initial_marking: BTreeMap::new(),
            final_markings: Vec::new(),
        }
    }

    /// Add a place to the net, returning `true` if the id was newly inserted.
    #[inline]
    pub fn add_place(&mut self, place: PetriPlace) -> bool {
        let id = place.id.clone();
        self.places.insert(id, place).is_none()
    }

    /// Add a transition to the net, returning `true` if the id was newly inserted.
    #[inline]
    pub fn add_transition(&mut self, transition: PetriTransition) -> bool {
        let id = transition.id.clone();
        self.transitions.insert(id, transition).is_none()
    }

    /// Append an arc to the flow relation.
    #[inline]
    pub fn add_arc(&mut self, arc: PetriArc) {
        self.arcs.push(arc);
    }

    /// Returns `true` if every arc satisfies the bipartite invariant
    /// (`Place → Transition` or `Transition → Place`).
    pub fn is_bipartite(&self) -> bool {
        self.arcs.iter().all(|a| a.is_bipartite())
    }

    /// Collect all [`PlaceId`]s that appear in `•t` (the pre-set of transition `t`).
    pub fn preset_of_transition(&self, t: &TransitionId) -> BTreeSet<PlaceId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.from, &arc.to) {
                (ArcEndpoint::Place(p), ArcEndpoint::Transition(tr)) if tr == t => {
                    Some(p.clone())
                }
                _ => None,
            })
            .collect()
    }

    /// Collect all [`PlaceId`]s that appear in `t•` (the post-set of transition `t`).
    pub fn postset_of_transition(&self, t: &TransitionId) -> BTreeSet<PlaceId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.from, &arc.to) {
                (ArcEndpoint::Transition(tr), ArcEndpoint::Place(p)) if tr == t => {
                    Some(p.clone())
                }
                _ => None,
            })
            .collect()
    }

    /// Collect all [`TransitionId`]s that appear in `•p` (the pre-set of place `p`).
    pub fn preset_of_place(&self, p: &PlaceId) -> BTreeSet<TransitionId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.from, &arc.to) {
                (ArcEndpoint::Transition(t), ArcEndpoint::Place(pl)) if pl == p => {
                    Some(t.clone())
                }
                _ => None,
            })
            .collect()
    }

    /// Collect all [`TransitionId`]s that appear in `p•` (the post-set of place `p`).
    pub fn postset_of_place(&self, p: &PlaceId) -> BTreeSet<TransitionId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.from, &arc.to) {
                (ArcEndpoint::Place(pl), ArcEndpoint::Transition(t)) if pl == p => {
                    Some(t.clone())
                }
                _ => None,
            })
            .collect()
    }

    /// Returns the token count at place `p` in the initial marking, or zero
    /// if the place is absent.
    #[inline]
    pub fn initial_tokens(&self, p: &PlaceId) -> TokenCount {
        self.initial_marking
            .get(p)
            .copied()
            .unwrap_or(TokenCount::ZERO)
    }
}

impl Default for PetriNet {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for PetriNet {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("PetriNet", 5)?;
        // Serialize places as a vec for forward-compatibility.
        let places_vec: Vec<&PetriPlace> = self.places.values().collect();
        s.serialize_field("places", &places_vec)?;
        let transitions_vec: Vec<&PetriTransition> = self.transitions.values().collect();
        s.serialize_field("transitions", &transitions_vec)?;
        s.serialize_field("arcs", &self.arcs)?;
        // Serialize markings as Vec<{place_id, tokens}> pairs for portability.
        let initial: Vec<(&str, u32)> = self
            .initial_marking
            .iter()
            .map(|(p, t)| (p.0.as_str(), t.0))
            .collect();
        s.serialize_field("initial_marking", &initial)?;
        let finals: Vec<Vec<(&str, u32)>> = self
            .final_markings
            .iter()
            .map(|m| m.iter().map(|(p, t)| (p.0.as_str(), t.0)).collect())
            .collect();
        s.serialize_field("final_markings", &finals)?;
        s.end()
    }
}

// ---------------------------------------------------------------------------
// SoundnessProperties
// ---------------------------------------------------------------------------

/// Structural and behavioural soundness properties of a WF-net.
///
/// Formal object: WF-net soundness (Def 3.5, Kourani, Park & van der Aalst
/// 2026 arXiv:2602.15739v3 §3): all three conditions hold —
/// (1) no dead transitions (`no_dead_transitions`),
/// (2) option to complete from any reachable marking (`option_to_complete`),
/// (3) proper completion — only the sink place holds a token in the final
///     marking (`proper_completion`).
///
/// Structural sub-net predicates (Defs 3.3, 3.4, 3.10, 3.11 of Kourani et al.
/// 2026 and van der Aalst 2016) are also captured:
/// - `is_wf_net` — Def 3.3: unique source `i`, unique sink `o`, all nodes on
///   a path from `i` to `o`.
/// - `is_safe` — 1-bounded markings; required for the hierarchical decomposition
///   (Section 4 of Kourani et al. 2026 restricts to safe sound WF-nets).
/// - `is_free_choice` — Def 3.4: `∀p,p' ∈ P: p• ∩ p'• ≠ ∅ ⟹ p• = p'•`.
/// - `is_state_machine` — Def 3.10: `|•t| ≤ 1 ∧ |t•| ≤ 1` for all `t ∈ T`.
/// - `is_marked_graph` — Def 3.11: `|•p| ≤ 1 ∧ |p•| ≤ 1` for all `p ∈ P`.
///
/// This is a pure data carrier — no methods. Algorithms that check soundness
/// (e.g., reachability-graph exploration, `StructuralNet::check_soundness`)
/// return this type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SoundnessProperties {
    /// `true` iff the net is a WF-net (Def 3.3): unique source `i`, unique
    /// sink `o`, every node on a directed path from `i` to `o`.
    pub is_wf_net: bool,

    /// `true` iff the net is 1-safe: no reachable marking places more than one
    /// token in any place. Required by the Kourani et al. 2026 decomposition
    /// (Section 4).
    pub is_safe: bool,

    /// `true` iff the net is free-choice (Def 3.4 of Kourani et al. 2026):
    /// `∀p, p' ∈ P: p• ∩ p'• ≠ ∅ ⟹ p• = p'•`.
    pub is_free_choice: bool,

    /// `true` iff the net is a state machine (Def 3.10 of Kourani et al. 2026):
    /// `|•t| ≤ 1 ∧ |t•| ≤ 1` for every transition `t ∈ T`.
    pub is_state_machine: bool,

    /// `true` iff the net is a marked graph (Def 3.11 of Kourani et al. 2026):
    /// `|•p| ≤ 1 ∧ |p•| ≤ 1` for every place `p ∈ P`.
    pub is_marked_graph: bool,

    /// Soundness condition (1) (Def 3.5 of van der Aalst 2016 / Kourani et al.
    /// 2026): no transition `t ∈ T` is dead — every transition is reachable
    /// and fireable from some reachable marking.
    pub no_dead_transitions: bool,

    /// Soundness condition (2) (Def 3.5): for every reachable marking `M`
    /// there exists a firing sequence that leads to the final marking `Ω`
    /// (option to complete).
    pub option_to_complete: bool,

    /// Soundness condition (3) (Def 3.5): the final marking `Ω` has exactly
    /// one token in the sink place `o` and zero tokens everywhere else (proper
    /// completion).
    pub proper_completion: bool,
}

impl SoundnessProperties {
    /// Returns `true` iff all three soundness conditions hold (Def 3.5):
    /// no dead transitions, option to complete, and proper completion.
    #[inline]
    pub const fn is_sound(&self) -> bool {
        self.no_dead_transitions && self.option_to_complete && self.proper_completion
    }

    /// Returns `true` iff the net is a **safe, sound WF-net** — the class on
    /// which the Kourani et al. 2026 hierarchical decomposition algorithm
    /// operates (Section 4).
    #[inline]
    pub const fn is_safe_sound_wf_net(&self) -> bool {
        self.is_wf_net && self.is_safe && self.is_sound()
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for SoundnessProperties {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("SoundnessProperties", 10)?;
        s.serialize_field("is_wf_net", &self.is_wf_net)?;
        s.serialize_field("is_safe", &self.is_safe)?;
        s.serialize_field("is_free_choice", &self.is_free_choice)?;
        s.serialize_field("is_state_machine", &self.is_state_machine)?;
        s.serialize_field("is_marked_graph", &self.is_marked_graph)?;
        s.serialize_field("no_dead_transitions", &self.no_dead_transitions)?;
        s.serialize_field("option_to_complete", &self.option_to_complete)?;
        s.serialize_field("proper_completion", &self.proper_completion)?;
        s.serialize_field("is_sound", &self.is_sound())?;
        s.serialize_field("is_safe_sound_wf_net", &self.is_safe_sound_wf_net())?;
        s.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for SoundnessProperties {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};
        use core::fmt;

        struct Props;

        impl<'de> Visitor<'de> for Props {
            type Value = SoundnessProperties;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a map with SoundnessProperties fields")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                macro_rules! field {
                    ($name:ident) => {
                        let mut $name: Option<bool> = None;
                    };
                }
                field!(is_wf_net);
                field!(is_safe);
                field!(is_free_choice);
                field!(is_state_machine);
                field!(is_marked_graph);
                field!(no_dead_transitions);
                field!(option_to_complete);
                field!(proper_completion);

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "is_wf_net" => is_wf_net = Some(map.next_value()?),
                        "is_safe" => is_safe = Some(map.next_value()?),
                        "is_free_choice" => is_free_choice = Some(map.next_value()?),
                        "is_state_machine" => is_state_machine = Some(map.next_value()?),
                        "is_marked_graph" => is_marked_graph = Some(map.next_value()?),
                        "no_dead_transitions" => no_dead_transitions = Some(map.next_value()?),
                        "option_to_complete" => option_to_complete = Some(map.next_value()?),
                        "proper_completion" => proper_completion = Some(map.next_value()?),
                        // Derived fields (is_sound, is_safe_sound_wf_net) are ignored.
                        _ => {
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }

                macro_rules! require {
                    ($field:ident) => {
                        let $field = $field
                            .ok_or_else(|| de::Error::missing_field(stringify!($field)))?;
                    };
                }
                require!(is_wf_net);
                require!(is_safe);
                require!(is_free_choice);
                require!(is_state_machine);
                require!(is_marked_graph);
                require!(no_dead_transitions);
                require!(option_to_complete);
                require!(proper_completion);

                Ok(SoundnessProperties {
                    is_wf_net,
                    is_safe,
                    is_free_choice,
                    is_state_machine,
                    is_marked_graph,
                    no_dead_transitions,
                    option_to_complete,
                    proper_completion,
                })
            }
        }

        deserializer.deserialize_map(Props)
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_wf_net() -> PetriNet {
        // Minimal WF-net: i --> [t1] --> o
        let mut net = PetriNet::new();
        let src = PlaceId::new("i");
        let snk = PlaceId::new("o");
        let t1 = TransitionId::new("t1");

        net.add_place(PetriPlace::new(src.clone()));
        net.add_place(PetriPlace::new(snk.clone()));
        net.add_transition(PetriTransition::observable(t1.clone(), "A"));

        net.add_arc(PetriArc::place_to_transition(src.clone(), t1.clone()));
        net.add_arc(PetriArc::transition_to_place(t1.clone(), snk.clone()));

        net.initial_marking
            .insert(src.clone(), TokenCount::ONE);

        net.final_markings.push({
            let mut m = BTreeMap::new();
            m.insert(snk.clone(), TokenCount::ONE);
            m
        });

        net
    }

    #[test]
    fn place_id_deref() {
        let p = PlaceId::new("p1");
        assert_eq!(&*p, "p1");
    }

    #[test]
    fn transition_id_deref() {
        let t = TransitionId::new("t1");
        assert_eq!(&*t, "t1");
    }

    #[test]
    fn token_count_arithmetic() {
        let a = TokenCount(3);
        let b = TokenCount(2);
        assert_eq!(a.saturating_sub(b), TokenCount(1));
        assert_eq!(b.saturating_sub(a), TokenCount::ZERO);
        assert_eq!(a.checked_add(b), Some(TokenCount(5)));
        assert_eq!(TokenCount(u32::MAX).checked_add(TokenCount(1)), None);
    }

    #[test]
    fn arc_endpoint_is_bipartite() {
        let valid = PetriArc::place_to_transition(PlaceId::new("p"), TransitionId::new("t"));
        assert!(valid.is_bipartite());

        // A place-to-place arc (hand-constructed) is not bipartite.
        let invalid = PetriArc {
            from: ArcEndpoint::Place(PlaceId::new("p1")),
            to: ArcEndpoint::Place(PlaceId::new("p2")),
            weight: 1,
        };
        assert!(!invalid.is_bipartite());
    }

    #[test]
    fn wf_net_bipartite() {
        let net = make_wf_net();
        assert!(net.is_bipartite());
    }

    #[test]
    fn preset_postset() {
        let net = make_wf_net();
        let t1 = TransitionId::new("t1");
        let src = PlaceId::new("i");
        let snk = PlaceId::new("o");

        assert_eq!(
            net.preset_of_transition(&t1),
            core::iter::once(src.clone()).collect::<BTreeSet<_>>()
        );
        assert_eq!(
            net.postset_of_transition(&t1),
            core::iter::once(snk.clone()).collect::<BTreeSet<_>>()
        );
        assert_eq!(
            net.postset_of_place(&src),
            core::iter::once(t1.clone()).collect::<BTreeSet<_>>()
        );
        assert_eq!(
            net.preset_of_place(&snk),
            core::iter::once(t1.clone()).collect::<BTreeSet<_>>()
        );
    }

    #[test]
    fn initial_tokens_absent_is_zero() {
        let net = make_wf_net();
        assert_eq!(
            net.initial_tokens(&PlaceId::new("o")),
            TokenCount::ZERO
        );
        assert_eq!(
            net.initial_tokens(&PlaceId::new("i")),
            TokenCount::ONE
        );
    }

    #[test]
    fn soundness_properties_is_sound() {
        let props = SoundnessProperties {
            is_wf_net: true,
            is_safe: true,
            is_free_choice: true,
            is_state_machine: false,
            is_marked_graph: false,
            no_dead_transitions: true,
            option_to_complete: true,
            proper_completion: true,
        };
        assert!(props.is_sound());
        assert!(props.is_safe_sound_wf_net());
    }

    #[test]
    fn soundness_properties_not_sound_if_dead_transition() {
        let props = SoundnessProperties {
            is_wf_net: true,
            is_safe: true,
            is_free_choice: false,
            is_state_machine: false,
            is_marked_graph: false,
            no_dead_transitions: false, // violation
            option_to_complete: true,
            proper_completion: true,
        };
        assert!(!props.is_sound());
        assert!(!props.is_safe_sound_wf_net());
    }

    #[test]
    fn silent_transition_is_silent_flag() {
        let t = PetriTransition::silent("tau");
        assert!(t.is_silent);
        assert!(t.label.is_none());

        let u = PetriTransition::observable("t1", "Register");
        assert!(!u.is_silent);
        assert_eq!(u.label.as_deref().map(|s| s.as_str()), Some("Register"));
    }

    #[test]
    fn marking_deterministic_ordering() {
        let mut m: Marking = BTreeMap::new();
        m.insert(PlaceId::new("z"), TokenCount(2));
        m.insert(PlaceId::new("a"), TokenCount(1));
        // BTreeMap iterates in sorted key order.
        let keys: Vec<&str> = m.keys().map(|p| p.0.as_str()).collect();
        assert_eq!(keys, vec!["a", "z"]);
    }

    #[test]
    fn arc_endpoint_accessors() {
        let ep_place = ArcEndpoint::Place(PlaceId::new("p1"));
        let ep_trans = ArcEndpoint::Transition(TransitionId::new("t1"));

        assert!(ep_place.is_place());
        assert!(!ep_place.is_transition());
        assert!(ep_place.place_id().is_some());
        assert!(ep_place.transition_id().is_none());

        assert!(!ep_trans.is_place());
        assert!(ep_trans.is_transition());
        assert!(ep_trans.transition_id().is_some());
        assert!(ep_trans.place_id().is_none());
    }
}
