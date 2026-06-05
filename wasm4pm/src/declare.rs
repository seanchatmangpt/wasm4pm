//! DECLARE declarative process model with an enum of LTL constraint templates.
//! The Template enum replaces the stringly-typed template field in wasm4pm DeclareConstraint.
//!
//! Paper grounding: Pesic 2006 'A Declarative Approach for Flexible Business Processes
//! Management'. Pesic & van der Aalst 2008 'A Declarative Approach for Flexible Business
//! Processes Management'. Templates: Existence, Absence, Exactly, Init, End, Response,
//! AlternateResponse, ChainResponse, Precedence, AlternatePrecedence, ChainPrecedence,
//! NotCoExistence, NotSuccession, NotChainSuccession, CoExistence, Succession,
//! AlternateSuccession, ChainSuccession.
//!
//! ## Design Notes
//!
//! This module is `no_std`-compatible: all heap allocation uses the `alloc` crate.
//! No `#[wasm_bindgen]` exports — types only.
//!
//! [`DeclareTemplate`] is a closed enum of all standard DECLARE templates, each
//! expressed as a named variant rather than a string.  Pattern matching on the enum
//! is zero-cost compared with `str::eq` at every check site.
//!
//! [`ActivityName`] is a `#[repr(transparent)]` newtype over `alloc::string::String`
//! that prevents passing arbitrary strings where a validated activity name is required.

#![allow(clippy::module_name_repetitions)]

extern crate alloc;

use alloc::collections::BTreeSet;
use alloc::string::String;
use alloc::vec::Vec;
use core::fmt;
use core::ops::Deref;

// ---------------------------------------------------------------------------
// ActivityName newtype
// ---------------------------------------------------------------------------

/// A validated activity name from a DECLARE constraint or model.
///
/// Formal object from [Pesic & van der Aalst 2008 §2]: an *activity* `a ∈ A`
/// where `A` is the finite alphabet of observable actions in the process.
///
/// `#[repr(transparent)]` ensures the newtype has identical ABI to `String`;
/// conversions are zero-cost at the call site.
///
/// # Invariant
///
/// The inner string is non-empty (enforced by [`ActivityName::new`]).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct ActivityName(String);

impl ActivityName {
    /// Construct an [`ActivityName`], returning `None` if `name` is empty.
    #[inline]
    #[must_use]
    pub fn new(name: String) -> Option<Self> {
        if name.is_empty() {
            None
        } else {
            Some(ActivityName(name))
        }
    }

    /// Construct an [`ActivityName`] from a string slice.
    #[inline]
    #[must_use]
    pub fn from_str(name: &str) -> Option<Self> {
        if name.is_empty() {
            None
        } else {
            Some(ActivityName(String::from(name)))
        }
    }

    /// Infallible constructor for use in tests or trusted contexts.
    ///
    /// # Panics
    ///
    /// Panics in debug mode if `name` is empty.
    #[inline]
    #[must_use]
    pub fn trusted(name: &str) -> Self {
        debug_assert!(!name.is_empty(), "ActivityName must be non-empty");
        ActivityName(String::from(name))
    }

    /// Return the underlying string as a `&str`.
    #[inline]
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Consume the newtype and return the inner `String`.
    #[inline]
    #[must_use]
    pub fn into_inner(self) -> String {
        self.0
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

impl From<ActivityName> for String {
    #[inline]
    fn from(a: ActivityName) -> Self {
        a.0
    }
}

#[cfg(feature = "serde")]
mod serde_activity_name {
    use super::ActivityName;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    impl Serialize for ActivityName {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            s.serialize_str(&self.0)
        }
    }

    impl<'de> Deserialize<'de> for ActivityName {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            let raw = <&str>::deserialize(d)?;
            ActivityName::from_str(raw).ok_or_else(|| {
                serde::de::Error::custom("ActivityName must be non-empty")
            })
        }
    }
}

// ---------------------------------------------------------------------------
// Support and Confidence newtypes
// ---------------------------------------------------------------------------

/// Empirical support of a DECLARE constraint: the fraction of traces satisfying it.
///
/// Formal object from [Pesic & van der Aalst 2008 §4]:
/// `supp(c) = |{t ∈ L : t ⊨ c}| / |L|`  where `L` is the event log.
///
/// # Invariant
///
/// `support ∈ [0.0, 1.0]`
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
#[repr(transparent)]
pub struct Support(f64);

impl Support {
    /// Construct a [`Support`] value.
    ///
    /// Returns `None` if `v` is not finite or not in `[0.0, 1.0]`.
    #[inline]
    #[must_use]
    pub fn new(v: f64) -> Option<Self> {
        if v.is_finite() && v >= 0.0 && v <= 1.0 {
            Some(Support(v))
        } else {
            None
        }
    }

    /// Return the inner `f64`.
    #[inline]
    #[must_use]
    pub fn value(self) -> f64 {
        self.0
    }
}

impl Deref for Support {
    type Target = f64;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[cfg(feature = "serde")]
mod serde_support {
    use super::Support;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    impl Serialize for Support {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            s.serialize_f64(self.0)
        }
    }

    impl<'de> Deserialize<'de> for Support {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            let v = f64::deserialize(d)?;
            Support::new(v).ok_or_else(|| {
                serde::de::Error::custom("Support must be finite and in [0.0, 1.0]")
            })
        }
    }
}

/// Confidence (conditional probability) that a DECLARE constraint holds given
/// the trigger activity occurred.
///
/// Formal object from [Pesic & van der Aalst 2008 §4]:
/// `conf(c) = |{t ∈ L : t ⊨ c}| / |{t ∈ L : trigger(c) ∈ t}|`
///
/// # Invariant
///
/// `confidence ∈ [0.0, 1.0]`
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
#[repr(transparent)]
pub struct Confidence(f64);

impl Confidence {
    /// Construct a [`Confidence`] value.
    ///
    /// Returns `None` if `v` is not finite or not in `[0.0, 1.0]`.
    #[inline]
    #[must_use]
    pub fn new(v: f64) -> Option<Self> {
        if v.is_finite() && v >= 0.0 && v <= 1.0 {
            Some(Confidence(v))
        } else {
            None
        }
    }

    /// Return the inner `f64`.
    #[inline]
    #[must_use]
    pub fn value(self) -> f64 {
        self.0
    }
}

impl Deref for Confidence {
    type Target = f64;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[cfg(feature = "serde")]
mod serde_confidence {
    use super::Confidence;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    impl Serialize for Confidence {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            s.serialize_f64(self.0)
        }
    }

    impl<'de> Deserialize<'de> for Confidence {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            let v = f64::deserialize(d)?;
            Confidence::new(v).ok_or_else(|| {
                serde::de::Error::custom("Confidence must be finite and in [0.0, 1.0]")
            })
        }
    }
}

// ---------------------------------------------------------------------------
// DeclareTemplate enum
// ---------------------------------------------------------------------------

/// A DECLARE constraint template, expressed as a closed enum of all standard
/// LTL-encoded templates.
///
/// Formal object from [Pesic & van der Aalst 2008 §3]:
/// `T ∈ LTL` — one of the standard DECLARE constraint templates expressed as
/// an LTL formula over activities. Replaces the stringly-typed `template`
/// field in the original wasm4pm `DeclareConstraint`.
///
/// ## Template semantics (abbreviated LTL forms)
///
/// | Variant | LTL sketch | Cardinality |
/// |---|---|---|
/// | `Existence { min }` | `◇A ∧ … (min times)` | unary |
/// | `Absence { max }` | `¬◇A ∨ … (at most max)` | unary |
/// | `ExactlyN { n }` | `♯(A) = n` | unary |
/// | `Init` | `A` (first event is A) | unary |
/// | `End` | `◻(last ⇒ A)` | unary |
/// | `RespondedExistence` | `◇A ⇒ ◇B` | binary |
/// | `Response` | `◻(A ⇒ ◇B)` | binary |
/// | `AlternateResponse` | `◻(A ⇒ X[¬A U B])` | binary |
/// | `ChainResponse` | `◻(A ⇒ XB)` | binary |
/// | `Precedence` | `◇A ⇒ (¬A U B)` at trace start | binary |
/// | `AlternatePrecedence` | alternating version of Precedence | binary |
/// | `ChainPrecedence` | `◻(XA ⇒ B)` | binary |
/// | `CoExistence` | `◇A ⟺ ◇B` | binary |
/// | `Succession` | `Response ∧ Precedence` | binary |
/// | `AlternateSuccession` | `AltResponse ∧ AltPrecedence` | binary |
/// | `ChainSuccession` | `ChainResponse ∧ ChainPrecedence` | binary |
/// | `NotCoExistence` | `¬(◇A ∧ ◇B)` | binary |
/// | `NotSuccession` | `◻(A ⇒ ¬◇B)` | binary |
/// | `NotChainSuccession` | `◻(A ⇒ ¬XB)` | binary |
///
/// ## Zero-cost note
///
/// Enum — no heap allocation. Pattern matching replaces string comparison.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum DeclareTemplate {
    // -----------------------------------------------------------------------
    // Unary existence templates (Pesic & van der Aalst 2008 §3.1)
    // -----------------------------------------------------------------------

    /// `Existence(min, A)`: activity `A` must occur at least `min` times.
    ///
    /// LTL: `◇A` (for `min = 1`), generalised for larger `min`.
    Existence {
        /// Minimum number of required occurrences (≥ 1).
        min: u32,
    },

    /// `Absence(max, A)`: activity `A` must occur at most `max` times
    /// (including zero).
    ///
    /// LTL: `¬◇A` (for `max = 0`), generalised for larger `max`.
    Absence {
        /// Maximum number of allowed occurrences (≥ 0).
        max: u32,
    },

    /// `Exactly(n, A)`: activity `A` must occur exactly `n` times.
    ///
    /// LTL: `♯(A, trace) = n`.
    ExactlyN {
        /// Exact required occurrence count.
        n: u32,
    },

    /// `Init(A)`: the first event in every trace must be `A`.
    ///
    /// LTL: `A` (holds at position 0).
    Init,

    /// `End(A)`: the last event in every trace must be `A`.
    ///
    /// LTL: `◻(last ⇒ A)`.
    End,

    // -----------------------------------------------------------------------
    // Binary relation templates — responded existence / response family
    // (Pesic & van der Aalst 2008 §3.2)
    // -----------------------------------------------------------------------

    /// `RespondedExistence(A, B)`: if `A` occurs, `B` must also occur
    /// (before or after).
    ///
    /// LTL: `◇A ⇒ ◇B`.
    RespondedExistence,

    /// `Response(A, B)`: every occurrence of `A` must eventually be followed
    /// by `B`.
    ///
    /// LTL: `◻(A ⇒ ◇B)`.
    Response,

    /// `AlternateResponse(A, B)`: between any occurrence of `A` and its next
    /// obligatory `B`, no other `A` may appear.
    ///
    /// LTL: `◻(A ⇒ X[¬A U B])`.
    AlternateResponse,

    /// `ChainResponse(A, B)`: every occurrence of `A` must be immediately
    /// followed by `B` (no intervening event).
    ///
    /// LTL: `◻(A ⇒ XB)`.
    ChainResponse,

    // -----------------------------------------------------------------------
    // Binary relation templates — precedence family
    // -----------------------------------------------------------------------

    /// `Precedence(A, B)`: `B` may only occur after `A` has occurred.
    ///
    /// LTL: `¬B U A` (at trace start), or equivalently `◇B ⇒ (¬B U A)`.
    Precedence,

    /// `AlternatePrecedence(A, B)`: every occurrence of `B` must be preceded
    /// by an `A` that is not preceded by another `B` (alternating pattern).
    ///
    /// LTL: `◻(B ⇒ Y[¬B S A])` (using past-LTL Since operator).
    AlternatePrecedence,

    /// `ChainPrecedence(A, B)`: every occurrence of `B` must be immediately
    /// preceded by `A`.
    ///
    /// LTL: `◻(XB ⇒ A)`.
    ChainPrecedence,

    // -----------------------------------------------------------------------
    // Binary relation templates — co-existence / succession family
    // -----------------------------------------------------------------------

    /// `CoExistence(A, B)`: `A` and `B` must either both occur or both be
    /// absent.
    ///
    /// LTL: `◇A ⟺ ◇B`.
    CoExistence,

    /// `Succession(A, B)`: `Response(A, B) ∧ Precedence(A, B)`.
    Succession,

    /// `AlternateSuccession(A, B)`:
    /// `AlternateResponse(A, B) ∧ AlternatePrecedence(A, B)`.
    AlternateSuccession,

    /// `ChainSuccession(A, B)`:
    /// `ChainResponse(A, B) ∧ ChainPrecedence(A, B)`.
    ///
    /// LTL: `◻(A ⟺ XB)`.
    ChainSuccession,

    // -----------------------------------------------------------------------
    // Binary negative relation templates
    // -----------------------------------------------------------------------

    /// `NotCoExistence(A, B)`: `A` and `B` cannot both occur in the same
    /// trace.
    ///
    /// LTL: `¬(◇A ∧ ◇B)`.
    NotCoExistence,

    /// `NotSuccession(A, B)`: `A` cannot be eventually followed by `B`.
    ///
    /// LTL: `◻(A ⇒ ¬◇B)`.
    NotSuccession,

    /// `NotChainSuccession(A, B)`: `A` cannot be immediately followed by `B`.
    ///
    /// LTL: `◻(A ⇒ ¬XB)`.
    NotChainSuccession,
}

impl DeclareTemplate {
    /// Return the canonical string name of this template as used in the
    /// DECLARE literature (e.g., `"Response"`, `"ChainPrecedence"`).
    ///
    /// This is useful for serialising to the stringly-typed JSON format used
    /// by the existing wasm4pm WASM API so that migration is backward-
    /// compatible.
    #[must_use]
    pub fn canonical_name(&self) -> &'static str {
        match self {
            DeclareTemplate::Existence { .. } => "Existence",
            DeclareTemplate::Absence { .. } => "Absence",
            DeclareTemplate::ExactlyN { .. } => "ExactlyN",
            DeclareTemplate::Init => "Init",
            DeclareTemplate::End => "End",
            DeclareTemplate::RespondedExistence => "RespondedExistence",
            DeclareTemplate::Response => "Response",
            DeclareTemplate::AlternateResponse => "AlternateResponse",
            DeclareTemplate::ChainResponse => "ChainResponse",
            DeclareTemplate::Precedence => "Precedence",
            DeclareTemplate::AlternatePrecedence => "AlternatePrecedence",
            DeclareTemplate::ChainPrecedence => "ChainPrecedence",
            DeclareTemplate::CoExistence => "CoExistence",
            DeclareTemplate::Succession => "Succession",
            DeclareTemplate::AlternateSuccession => "AlternateSuccession",
            DeclareTemplate::ChainSuccession => "ChainSuccession",
            DeclareTemplate::NotCoExistence => "NotCoExistence",
            DeclareTemplate::NotSuccession => "NotSuccession",
            DeclareTemplate::NotChainSuccession => "NotChainSuccession",
        }
    }

    /// Return `true` if this template is unary (involves a single activity).
    #[must_use]
    #[inline]
    pub fn is_unary(&self) -> bool {
        matches!(
            self,
            DeclareTemplate::Existence { .. }
                | DeclareTemplate::Absence { .. }
                | DeclareTemplate::ExactlyN { .. }
                | DeclareTemplate::Init
                | DeclareTemplate::End
        )
    }

    /// Return `true` if this template is binary (involves two activities).
    #[must_use]
    #[inline]
    pub fn is_binary(&self) -> bool {
        !self.is_unary()
    }

    /// Return `true` if this template is a negative constraint.
    ///
    /// Negative constraints forbid co-occurrence or ordering relationships.
    #[must_use]
    #[inline]
    pub fn is_negative(&self) -> bool {
        matches!(
            self,
            DeclareTemplate::NotCoExistence
                | DeclareTemplate::NotSuccession
                | DeclareTemplate::NotChainSuccession
        )
    }

    /// Return the expected number of activities for this template (`1` or `2`).
    ///
    /// Checking the length of [`DeclareConstraint::activities`] against this
    /// value can catch mis-constructed constraints early.
    #[must_use]
    #[inline]
    pub fn arity(&self) -> usize {
        if self.is_unary() { 1 } else { 2 }
    }

    /// Attempt to construct a [`DeclareTemplate`] from its canonical string
    /// name.
    ///
    /// `Existence`, `Absence`, and `ExactlyN` require a count parameter
    /// passed separately; use [`DeclareTemplate::from_str_with_count`] for
    /// those.  This method returns `None` for those three variants and for
    /// unrecognised names.
    #[must_use]
    pub fn from_canonical_name(name: &str) -> Option<Self> {
        match name {
            "Init" => Some(DeclareTemplate::Init),
            "End" => Some(DeclareTemplate::End),
            "RespondedExistence" => Some(DeclareTemplate::RespondedExistence),
            "Response" => Some(DeclareTemplate::Response),
            "AlternateResponse" => Some(DeclareTemplate::AlternateResponse),
            "ChainResponse" => Some(DeclareTemplate::ChainResponse),
            "Precedence" => Some(DeclareTemplate::Precedence),
            "AlternatePrecedence" => Some(DeclareTemplate::AlternatePrecedence),
            "ChainPrecedence" => Some(DeclareTemplate::ChainPrecedence),
            "CoExistence" => Some(DeclareTemplate::CoExistence),
            "Succession" => Some(DeclareTemplate::Succession),
            "AlternateSuccession" => Some(DeclareTemplate::AlternateSuccession),
            "ChainSuccession" => Some(DeclareTemplate::ChainSuccession),
            "NotCoExistence" => Some(DeclareTemplate::NotCoExistence),
            "NotSuccession" => Some(DeclareTemplate::NotSuccession),
            "NotChainSuccession" => Some(DeclareTemplate::NotChainSuccession),
            _ => None,
        }
    }

    /// Attempt to construct an `Existence`, `Absence`, or `ExactlyN` template
    /// from its canonical name and an associated count.
    ///
    /// Returns `None` for other template names (use [`from_canonical_name`]
    /// instead).
    ///
    /// [`from_canonical_name`]: DeclareTemplate::from_canonical_name
    #[must_use]
    pub fn from_str_with_count(name: &str, count: u32) -> Option<Self> {
        match name {
            "Existence" => Some(DeclareTemplate::Existence { min: count }),
            "Absence" => Some(DeclareTemplate::Absence { max: count }),
            "ExactlyN" => Some(DeclareTemplate::ExactlyN { n: count }),
            _ => None,
        }
    }
}

impl fmt::Display for DeclareTemplate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeclareTemplate::Existence { min } => write!(f, "Existence(min={})", min),
            DeclareTemplate::Absence { max } => write!(f, "Absence(max={})", max),
            DeclareTemplate::ExactlyN { n } => write!(f, "ExactlyN(n={})", n),
            other => f.write_str(other.canonical_name()),
        }
    }
}

#[cfg(feature = "serde")]
mod serde_declare_template {
    use super::DeclareTemplate;
    use alloc::string::String;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use serde::de::{self, MapAccess, Visitor};
    use core::fmt;

    /// Wire format:
    /// ```json
    /// {"type": "Response"}
    /// {"type": "Existence", "min": 2}
    /// {"type": "Absence",   "max": 0}
    /// {"type": "ExactlyN",  "n":   1}
    /// ```
    impl Serialize for DeclareTemplate {
        fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            use serde::ser::SerializeMap;
            match self {
                DeclareTemplate::Existence { min } => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "Existence")?;
                    m.serialize_entry("min", min)?;
                    m.end()
                }
                DeclareTemplate::Absence { max } => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "Absence")?;
                    m.serialize_entry("max", max)?;
                    m.end()
                }
                DeclareTemplate::ExactlyN { n } => {
                    let mut m = s.serialize_map(Some(2))?;
                    m.serialize_entry("type", "ExactlyN")?;
                    m.serialize_entry("n", n)?;
                    m.end()
                }
                other => {
                    let mut m = s.serialize_map(Some(1))?;
                    m.serialize_entry("type", other.canonical_name())?;
                    m.end()
                }
            }
        }
    }

    struct DeclareTemplateVisitor;

    impl<'de> Visitor<'de> for DeclareTemplateVisitor {
        type Value = DeclareTemplate;

        fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str("a DECLARE template map with a \"type\" key")
        }

        fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
            let mut typ: Option<String> = None;
            let mut min: Option<u32> = None;
            let mut max: Option<u32> = None;
            let mut n: Option<u32> = None;

            while let Some(key) = map.next_key::<String>()? {
                match key.as_str() {
                    "type" => typ = Some(map.next_value()?),
                    "min" => min = Some(map.next_value()?),
                    "max" => max = Some(map.next_value()?),
                    "n" => n = Some(map.next_value()?),
                    _ => { let _ = map.next_value::<serde::de::IgnoredAny>()?; }
                }
            }

            let typ = typ.ok_or_else(|| de::Error::missing_field("type"))?;
            match typ.as_str() {
                "Existence" => Ok(DeclareTemplate::Existence {
                    min: min.ok_or_else(|| de::Error::missing_field("min"))?,
                }),
                "Absence" => Ok(DeclareTemplate::Absence {
                    max: max.ok_or_else(|| de::Error::missing_field("max"))?,
                }),
                "ExactlyN" => Ok(DeclareTemplate::ExactlyN {
                    n: n.ok_or_else(|| de::Error::missing_field("n"))?,
                }),
                other => DeclareTemplate::from_canonical_name(other)
                    .ok_or_else(|| de::Error::unknown_variant(other, &[
                        "Existence", "Absence", "ExactlyN", "Init", "End",
                        "RespondedExistence", "Response", "AlternateResponse",
                        "ChainResponse", "Precedence", "AlternatePrecedence",
                        "ChainPrecedence", "CoExistence", "Succession",
                        "AlternateSuccession", "ChainSuccession",
                        "NotCoExistence", "NotSuccession", "NotChainSuccession",
                    ])),
            }
        }
    }

    impl<'de> Deserialize<'de> for DeclareTemplate {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            d.deserialize_map(DeclareTemplateVisitor)
        }
    }
}

// ---------------------------------------------------------------------------
// DeclareConstraint
// ---------------------------------------------------------------------------

/// A single typed DECLARE constraint instance.
///
/// Formal object from [Pesic & van der Aalst 2008 §4]:
/// `c = (T, A, supp, conf)` — a constraint instance: template `T` applied to
/// activities `A ⊆ Activities`, with empirical support (fraction of traces
/// satisfying it) and confidence (conditional probability).
///
/// ## Migration note
///
/// Replaces the original `wasm4pm` `DeclareConstraint` which stored
/// `template: String`.  The new `template: DeclareTemplate` field is a
/// zero-cost closed enum; pattern matching replaces string comparison.
/// `activities: Vec<ActivityName>` replaces `Vec<String>` to enforce the
/// non-empty-name invariant at construction.
///
/// ## Invariants
///
/// - `support ∈ [0.0, 1.0]`
/// - `confidence ∈ [0.0, 1.0]`
/// - `activities.len() == template.arity()` (not enforced by the type system
///   but checked by [`DeclareConstraint::is_well_formed`])
#[derive(Debug, Clone, PartialEq)]
pub struct DeclareConstraint {
    /// The LTL-encoded template for this constraint.
    ///
    /// Replaces the stringly-typed `template: String` field in the legacy
    /// wasm4pm model.
    pub template: DeclareTemplate,

    /// The activities to which the template applies.
    ///
    /// Unary templates (e.g., `Init`, `Existence`) take exactly one activity;
    /// binary templates take exactly two.  Use [`DeclareTemplate::arity`] to
    /// determine the expected count.
    pub activities: Vec<ActivityName>,

    /// Empirical support: fraction of traces in the log satisfying this
    /// constraint.
    ///
    /// Stored as a plain `f64` (∈ [0.0, 1.0]) for compatibility with
    /// existing WASM serialisation paths.  Use [`Support`] at construction
    /// sites when range validation is required.
    pub support: f64,

    /// Confidence: conditional probability that the constraint holds given
    /// the trigger activity occurred.
    ///
    /// Stored as a plain `f64` (∈ [0.0, 1.0]).  Use [`Confidence`] at
    /// construction sites when range validation is required.
    pub confidence: f64,
}

impl DeclareConstraint {
    /// Construct a new [`DeclareConstraint`].
    ///
    /// This is an unchecked constructor; call [`is_well_formed`] afterwards
    /// if you need to validate arity, support, and confidence ranges.
    ///
    /// [`is_well_formed`]: DeclareConstraint::is_well_formed
    #[inline]
    #[must_use]
    pub fn new(
        template: DeclareTemplate,
        activities: Vec<ActivityName>,
        support: f64,
        confidence: f64,
    ) -> Self {
        DeclareConstraint { template, activities, support, confidence }
    }

    /// Return `true` if this constraint satisfies all structural invariants:
    ///
    /// 1. `activities.len() == template.arity()`
    /// 2. `support ∈ [0.0, 1.0]` (finite)
    /// 3. `confidence ∈ [0.0, 1.0]` (finite)
    #[must_use]
    pub fn is_well_formed(&self) -> bool {
        let arity_ok = self.activities.len() == self.template.arity();
        let support_ok = self.support.is_finite()
            && self.support >= 0.0
            && self.support <= 1.0;
        let confidence_ok = self.confidence.is_finite()
            && self.confidence >= 0.0
            && self.confidence <= 1.0;
        arity_ok && support_ok && confidence_ok
    }

    /// Return the canonical template name (e.g., `"Response"`).
    ///
    /// Convenience wrapper around [`DeclareTemplate::canonical_name`] for use
    /// in serialisation contexts that still require a string.
    #[must_use]
    #[inline]
    pub fn template_name(&self) -> &'static str {
        self.template.canonical_name()
    }

    /// Return a reference to the first activity (the *trigger* or *source*).
    ///
    /// Returns `None` if `activities` is empty (malformed constraint).
    #[must_use]
    #[inline]
    pub fn trigger(&self) -> Option<&ActivityName> {
        self.activities.first()
    }

    /// Return a reference to the second activity (the *response* or *target*).
    ///
    /// Returns `None` for unary constraints or malformed constraints.
    #[must_use]
    #[inline]
    pub fn target(&self) -> Option<&ActivityName> {
        self.activities.get(1)
    }
}

impl fmt::Display for DeclareConstraint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}(", self.template)?;
        for (i, a) in self.activities.iter().enumerate() {
            if i > 0 {
                f.write_str(", ")?;
            }
            f.write_str(a.as_str())?;
        }
        write!(f, ") supp={:.3} conf={:.3}", self.support, self.confidence)
    }
}

#[cfg(feature = "serde")]
mod serde_declare_constraint {
    use super::{ActivityName, DeclareConstraint, DeclareTemplate};
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize)]
    struct DeclareConstraintWire {
        template: DeclareTemplate,
        activities: Vec<String>,
        support: f64,
        confidence: f64,
    }

    impl serde::Serialize for DeclareConstraint {
        fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            let wire = DeclareConstraintWire {
                template: self.template.clone(),
                activities: self
                    .activities
                    .iter()
                    .map(|a| a.as_str().into())
                    .collect(),
                support: self.support,
                confidence: self.confidence,
            };
            wire.serialize(s)
        }
    }

    impl<'de> serde::Deserialize<'de> for DeclareConstraint {
        fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            let wire = DeclareConstraintWire::deserialize(d)?;
            let activities = wire
                .activities
                .into_iter()
                .map(|s| {
                    ActivityName::new(s.clone())
                        .ok_or_else(|| serde::de::Error::custom(
                            alloc::format!("activity name must be non-empty, got {:?}", s),
                        ))
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(DeclareConstraint {
                template: wire.template,
                activities,
                support: wire.support,
                confidence: wire.confidence,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// DeclareModel
// ---------------------------------------------------------------------------

/// A DECLARE model: a finite set of activities and declarative constraint
/// instances over them.
///
/// Formal object from [Pesic 2006 §3 Def 3.1]:
/// `DM = (A, C)` — a DECLARE model as a set of activities `A` and a set of
/// constraint instances `C`.
///
/// ## Determinism
///
/// Activities are stored in a [`BTreeSet<ActivityName>`] rather than a
/// `HashSet` or `Vec<String>`, giving reproducible iteration order across
/// runs — a requirement for the wasm4pm determinism oracle (Rank-1).
///
/// ## Zero-cost note
///
/// No `HashMap` is used anywhere in this type. `BTreeSet` gives reproducible
/// activity ordering with `O(log n)` insertion and membership test.
#[derive(Debug, Clone, PartialEq)]
pub struct DeclareModel {
    /// The finite alphabet of activities referenced by the model.
    ///
    /// `BTreeSet` ensures deterministic ordering; no two entries are equal
    /// (activity names are unique by definition of a set).
    pub activities: BTreeSet<ActivityName>,

    /// The constraint instances that constitute the model.
    ///
    /// A `Vec` is used rather than a `BTreeSet` because constraints are
    /// identified by their full content (template + activities + metrics) and
    /// duplicates are prevented by the discovery algorithm rather than the
    /// container type.
    pub constraints: Vec<DeclareConstraint>,
}

impl DeclareModel {
    /// Construct an empty [`DeclareModel`].
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        DeclareModel {
            activities: BTreeSet::new(),
            constraints: Vec::new(),
        }
    }

    /// Add an activity to the model's alphabet.
    ///
    /// If the activity was already present, this is a no-op (set semantics).
    #[inline]
    pub fn add_activity(&mut self, activity: ActivityName) {
        self.activities.insert(activity);
    }

    /// Add a constraint to the model.
    ///
    /// All activities referenced by the constraint are automatically added to
    /// [`DeclareModel::activities`].
    pub fn add_constraint(&mut self, constraint: DeclareConstraint) {
        for a in &constraint.activities {
            self.activities.insert(a.clone());
        }
        self.constraints.push(constraint);
    }

    /// Return the number of constraints in the model.
    #[must_use]
    #[inline]
    pub fn constraint_count(&self) -> usize {
        self.constraints.len()
    }

    /// Return the number of distinct activities in the model's alphabet.
    #[must_use]
    #[inline]
    pub fn activity_count(&self) -> usize {
        self.activities.len()
    }

    /// Return `true` if all constraints in the model are well-formed.
    ///
    /// A well-formed constraint satisfies the arity, support, and confidence
    /// invariants as defined by [`DeclareConstraint::is_well_formed`].
    #[must_use]
    pub fn is_well_formed(&self) -> bool {
        self.constraints.iter().all(DeclareConstraint::is_well_formed)
    }

    /// Iterate over all constraints whose template matches `template`.
    ///
    /// This is O(n) in the number of constraints.
    pub fn constraints_by_template(
        &self,
        template: &DeclareTemplate,
    ) -> impl Iterator<Item = &DeclareConstraint> {
        self.constraints
            .iter()
            .filter(move |c| &c.template == template)
    }

    /// Return all constraints whose support is at or above `min_support`.
    pub fn constraints_above_support(
        &self,
        min_support: f64,
    ) -> impl Iterator<Item = &DeclareConstraint> {
        self.constraints
            .iter()
            .filter(move |c| c.support >= min_support)
    }

    /// Return all constraints whose confidence is at or above `min_confidence`.
    pub fn constraints_above_confidence(
        &self,
        min_confidence: f64,
    ) -> impl Iterator<Item = &DeclareConstraint> {
        self.constraints
            .iter()
            .filter(move |c| c.confidence >= min_confidence)
    }
}

impl Default for DeclareModel {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for DeclareModel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "DeclareModel(activities={}, constraints={})",
            self.activities.len(),
            self.constraints.len()
        )
    }
}

#[cfg(feature = "serde")]
mod serde_declare_model {
    use super::{ActivityName, DeclareConstraint, DeclareModel};
    use alloc::collections::BTreeSet;
    use alloc::vec::Vec;
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize)]
    struct DeclareModelWire {
        activities: Vec<String>,
        constraints: Vec<DeclareConstraint>,
    }

    impl serde::Serialize for DeclareModel {
        fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
            let wire = DeclareModelWire {
                activities: self
                    .activities
                    .iter()
                    .map(|a| a.as_str().into())
                    .collect(),
                constraints: self.constraints.clone(),
            };
            wire.serialize(s)
        }
    }

    impl<'de> serde::Deserialize<'de> for DeclareModel {
        fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
            let wire = DeclareModelWire::deserialize(d)?;
            let activities: BTreeSet<ActivityName> = wire
                .activities
                .into_iter()
                .map(|s| {
                    ActivityName::new(s.clone()).ok_or_else(|| {
                        serde::de::Error::custom(alloc::format!(
                            "activity name must be non-empty, got {:?}",
                            s
                        ))
                    })
                })
                .collect::<Result<BTreeSet<_>, _>>()?;
            Ok(DeclareModel {
                activities,
                constraints: wire.constraints,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ActivityName
    // -----------------------------------------------------------------------

    #[test]
    fn activity_name_rejects_empty() {
        assert!(ActivityName::new(String::from("")).is_none());
        assert!(ActivityName::from_str("").is_none());
    }

    #[test]
    fn activity_name_accepts_nonempty() {
        let a = ActivityName::trusted("Register");
        assert_eq!(a.as_str(), "Register");
    }

    #[test]
    fn activity_name_deref_to_string() {
        let a = ActivityName::trusted("Submit");
        let s: &String = &*a;
        assert_eq!(s, "Submit");
    }

    #[test]
    fn activity_name_ordering_is_lexicographic() {
        let a = ActivityName::trusted("A");
        let b = ActivityName::trusted("B");
        assert!(a < b);
    }

    // -----------------------------------------------------------------------
    // Support / Confidence
    // -----------------------------------------------------------------------

    #[test]
    fn support_rejects_out_of_range() {
        assert!(Support::new(-0.1).is_none());
        assert!(Support::new(1.1).is_none());
        assert!(Support::new(f64::NAN).is_none());
        assert!(Support::new(f64::INFINITY).is_none());
    }

    #[test]
    fn support_accepts_boundary_values() {
        assert!(Support::new(0.0).is_some());
        assert!(Support::new(1.0).is_some());
        assert!(Support::new(0.85).is_some());
    }

    #[test]
    fn confidence_rejects_out_of_range() {
        assert!(Confidence::new(-0.01).is_none());
        assert!(Confidence::new(1.01).is_none());
    }

    // -----------------------------------------------------------------------
    // DeclareTemplate
    // -----------------------------------------------------------------------

    #[test]
    fn template_canonical_names_are_stable() {
        assert_eq!(DeclareTemplate::Response.canonical_name(), "Response");
        assert_eq!(
            DeclareTemplate::AlternatePrecedence.canonical_name(),
            "AlternatePrecedence"
        );
        assert_eq!(
            DeclareTemplate::NotChainSuccession.canonical_name(),
            "NotChainSuccession"
        );
        assert_eq!(
            DeclareTemplate::Existence { min: 2 }.canonical_name(),
            "Existence"
        );
    }

    #[test]
    fn template_arity_matches_unary_binary_split() {
        assert_eq!(DeclareTemplate::Init.arity(), 1);
        assert_eq!(DeclareTemplate::End.arity(), 1);
        assert_eq!(DeclareTemplate::Existence { min: 1 }.arity(), 1);
        assert_eq!(DeclareTemplate::Absence { max: 0 }.arity(), 1);
        assert_eq!(DeclareTemplate::ExactlyN { n: 1 }.arity(), 1);
        assert_eq!(DeclareTemplate::Response.arity(), 2);
        assert_eq!(DeclareTemplate::ChainSuccession.arity(), 2);
        assert_eq!(DeclareTemplate::NotCoExistence.arity(), 2);
    }

    #[test]
    fn template_negative_flag_is_correct() {
        assert!(DeclareTemplate::NotCoExistence.is_negative());
        assert!(DeclareTemplate::NotSuccession.is_negative());
        assert!(DeclareTemplate::NotChainSuccession.is_negative());
        assert!(!DeclareTemplate::Response.is_negative());
        assert!(!DeclareTemplate::CoExistence.is_negative());
    }

    #[test]
    fn template_roundtrip_from_canonical_name() {
        let names = [
            "Init",
            "End",
            "RespondedExistence",
            "Response",
            "AlternateResponse",
            "ChainResponse",
            "Precedence",
            "AlternatePrecedence",
            "ChainPrecedence",
            "CoExistence",
            "Succession",
            "AlternateSuccession",
            "ChainSuccession",
            "NotCoExistence",
            "NotSuccession",
            "NotChainSuccession",
        ];
        for name in &names {
            let t = DeclareTemplate::from_canonical_name(name)
                .unwrap_or_else(|| unreachable!("unknown template: {}", name));
            assert_eq!(t.canonical_name(), *name, "roundtrip failed for {}", name);
        }
    }

    #[test]
    fn template_from_str_with_count_works() {
        let e = DeclareTemplate::from_str_with_count("Existence", 3);
        assert_eq!(e, Some(DeclareTemplate::Existence { min: 3 }));
        let a = DeclareTemplate::from_str_with_count("Absence", 0);
        assert_eq!(a, Some(DeclareTemplate::Absence { max: 0 }));
        let x = DeclareTemplate::from_str_with_count("ExactlyN", 1);
        assert_eq!(x, Some(DeclareTemplate::ExactlyN { n: 1 }));
        // Non-count templates return None
        assert!(DeclareTemplate::from_str_with_count("Response", 0).is_none());
    }

    #[test]
    fn template_display_includes_parameters() {
        let t = DeclareTemplate::Existence { min: 2 };
        assert!(t.to_string().contains("min=2"));
        let t2 = DeclareTemplate::Absence { max: 0 };
        assert!(t2.to_string().contains("max=0"));
    }

    // -----------------------------------------------------------------------
    // DeclareConstraint
    // -----------------------------------------------------------------------

    #[test]
    fn constraint_well_formed_when_valid() {
        let c = DeclareConstraint::new(
            DeclareTemplate::Response,
            vec![
                ActivityName::trusted("A"),
                ActivityName::trusted("B"),
            ],
            0.9,
            0.95,
        );
        assert!(c.is_well_formed());
    }

    #[test]
    fn constraint_not_well_formed_wrong_arity() {
        let c = DeclareConstraint::new(
            DeclareTemplate::Response,
            vec![ActivityName::trusted("A")], // arity should be 2
            0.9,
            0.95,
        );
        assert!(!c.is_well_formed());
    }

    #[test]
    fn constraint_not_well_formed_bad_support() {
        let c = DeclareConstraint::new(
            DeclareTemplate::Init,
            vec![ActivityName::trusted("Start")],
            1.1,   // out of range
            0.95,
        );
        assert!(!c.is_well_formed());
    }

    #[test]
    fn constraint_trigger_and_target() {
        let c = DeclareConstraint::new(
            DeclareTemplate::Precedence,
            vec![
                ActivityName::trusted("A"),
                ActivityName::trusted("B"),
            ],
            0.8,
            0.9,
        );
        assert_eq!(c.trigger().map(|a| a.as_str()), Some("A"));
        assert_eq!(c.target().map(|a| a.as_str()), Some("B"));
    }

    #[test]
    fn constraint_display_is_informative() {
        let c = DeclareConstraint::new(
            DeclareTemplate::ChainResponse,
            vec![
                ActivityName::trusted("X"),
                ActivityName::trusted("Y"),
            ],
            0.75,
            0.88,
        );
        let s = c.to_string();
        assert!(s.contains("ChainResponse"), "got: {}", s);
        assert!(s.contains('X'), "got: {}", s);
        assert!(s.contains('Y'), "got: {}", s);
    }

    // -----------------------------------------------------------------------
    // DeclareModel
    // -----------------------------------------------------------------------

    #[test]
    fn model_starts_empty() {
        let m = DeclareModel::new();
        assert_eq!(m.activity_count(), 0);
        assert_eq!(m.constraint_count(), 0);
    }

    #[test]
    fn model_add_constraint_auto_registers_activities() {
        let mut m = DeclareModel::new();
        m.add_constraint(DeclareConstraint::new(
            DeclareTemplate::Response,
            vec![
                ActivityName::trusted("A"),
                ActivityName::trusted("B"),
            ],
            0.9,
            1.0,
        ));
        assert_eq!(m.activity_count(), 2);
        assert!(m.activities.contains(&ActivityName::trusted("A")));
        assert!(m.activities.contains(&ActivityName::trusted("B")));
        assert_eq!(m.constraint_count(), 1);
    }

    #[test]
    fn model_activity_set_deduplicates() {
        let mut m = DeclareModel::new();
        m.add_activity(ActivityName::trusted("A"));
        m.add_activity(ActivityName::trusted("A")); // duplicate
        assert_eq!(m.activity_count(), 1);
    }

    #[test]
    fn model_activity_ordering_is_deterministic() {
        let mut m = DeclareModel::new();
        // Insert in reverse lexicographic order
        m.add_activity(ActivityName::trusted("C"));
        m.add_activity(ActivityName::trusted("A"));
        m.add_activity(ActivityName::trusted("B"));
        let names: Vec<&str> = m.activities.iter().map(|a| a.as_str()).collect();
        assert_eq!(names, ["A", "B", "C"], "BTreeSet must iterate in sorted order");
    }

    #[test]
    fn model_is_well_formed_when_all_constraints_valid() {
        let mut m = DeclareModel::new();
        m.add_constraint(DeclareConstraint::new(
            DeclareTemplate::Existence { min: 1 },
            vec![ActivityName::trusted("Start")],
            1.0,
            1.0,
        ));
        assert!(m.is_well_formed());
    }

    #[test]
    fn model_constraints_by_template_filter_works() {
        let mut m = DeclareModel::new();
        m.add_constraint(DeclareConstraint::new(
            DeclareTemplate::Response,
            vec![ActivityName::trusted("A"), ActivityName::trusted("B")],
            0.9,
            0.95,
        ));
        m.add_constraint(DeclareConstraint::new(
            DeclareTemplate::Precedence,
            vec![ActivityName::trusted("A"), ActivityName::trusted("B")],
            0.8,
            0.85,
        ));
        let responses: Vec<_> = m
            .constraints_by_template(&DeclareTemplate::Response)
            .collect();
        assert_eq!(responses.len(), 1);
        assert_eq!(responses[0].template_name(), "Response");
    }

    #[test]
    fn model_constraints_above_support_threshold() {
        let mut m = DeclareModel::new();
        m.add_constraint(DeclareConstraint::new(
            DeclareTemplate::CoExistence,
            vec![ActivityName::trusted("X"), ActivityName::trusted("Y")],
            0.7,
            0.9,
        ));
        m.add_constraint(DeclareConstraint::new(
            DeclareTemplate::Succession,
            vec![ActivityName::trusted("A"), ActivityName::trusted("B")],
            0.5,
            0.6,
        ));
        let high: Vec<_> = m.constraints_above_support(0.65).collect();
        assert_eq!(high.len(), 1);
        assert_eq!(high[0].template_name(), "CoExistence");
    }

    #[test]
    fn model_default_is_empty() {
        let m = DeclareModel::default();
        assert!(m.activities.is_empty());
        assert!(m.constraints.is_empty());
    }

    #[test]
    fn model_display_shows_counts() {
        let m = DeclareModel::new();
        let s = m.to_string();
        assert!(s.contains("activities=0"), "got: {}", s);
        assert!(s.contains("constraints=0"), "got: {}", s);
    }
}
