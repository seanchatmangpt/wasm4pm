//! Process mining quality dimensions — fitness, precision, generalization, simplicity.
//!
//! Paper grounding: van der Aalst (2016) Process Mining §9.2 — the four quality dimensions.
//! Buijs, van Dongen & van der Aalst (2012) OTM — formal definitions of all four dimensions.
//! Munoz-Gama & Carmona (2010) BPM — ETConformance precision (escaping-edge analysis).
//!
//! Formal objects:
//!   Fitness f ∈ [0,1]: fraction of log behaviour replayable by model.
//!   Precision p ∈ [0,1]: fraction of model behaviour observed in log (inverse of overfitting).
//!   Generalization g ∈ [0,1]: fraction of model nodes exercised by log (anti-overfitting).
//!   Simplicity s ∈ [0,1]: inverse of model complexity (fewer elements = simpler).

extern crate alloc;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Macro for bounded [0,1] score newtypes with validated constructor.
macro_rules! bounded_score {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[repr(transparent)]
        #[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
        #[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
        pub struct $name(pub f64);

        impl $name {
            /// Construct a score. Returns `None` if outside [0, 1] or non-finite.
            pub fn new(v: f64) -> Option<Self> {
                if v >= 0.0 && v <= 1.0 && v.is_finite() {
                    Some($name(v))
                } else {
                    None
                }
            }
            /// Construct without bounds check (for trusted computation output).
            #[inline]
            pub const fn new_unchecked(v: f64) -> Self {
                $name(v)
            }
            pub const ZERO: $name = $name(0.0);
            pub const ONE: $name = $name(1.0);
        }
    };
}

bounded_score!(
    FitnessScore,
    "Token-replay fitness f ∈ [0,1]. \
     Formal: f = 1 − (missing + consumed) / (produced + remaining) \
     (van der Aalst 2016 §9.2 Def. 9.1)."
);

bounded_score!(
    PrecisionScore,
    "ETConformance precision p ∈ [0,1]. \
     Formal: p = 1 − |escaping_edges| / |enabled_edges| \
     (Munoz-Gama & Carmona 2010 BPM)."
);

bounded_score!(
    GeneralizationScore,
    "Generalization g ∈ [0,1]. \
     Formal: fraction of model nodes exercised in the log \
     (Buijs, van Dongen & van der Aalst 2012 OTM §3)."
);

bounded_score!(
    SimplicityScore,
    "Simplicity s ∈ [0,1]. \
     Inversely related to model size (places + transitions + arcs). \
     Simpler models score higher (van der Aalst 2016 §9.2 Def. 9.4)."
);

/// All four quality dimensions together (van der Aalst 2016 §9.2).
///
/// A balanced model maximises all four simultaneously; in practice
/// precision↑ conflicts with generalization↑, and fitness↑ conflicts with simplicity↑.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct QualityDimensions {
    pub fitness: FitnessScore,
    pub precision: PrecisionScore,
    pub generalization: GeneralizationScore,
    pub simplicity: SimplicityScore,
}

impl QualityDimensions {
    /// Harmonic mean of all four dimensions — a balanced quality measure.
    pub fn f_measure(&self) -> f64 {
        let vals = [
            self.fitness.0,
            self.precision.0,
            self.generalization.0,
            self.simplicity.0,
        ];
        let n = vals.len() as f64;
        let sum_inv: f64 = vals
            .iter()
            .map(|v| if *v > 0.0 { 1.0 / v } else { f64::INFINITY })
            .sum();
        if sum_inv.is_infinite() {
            0.0
        } else {
            n / sum_inv
        }
    }

    /// Returns true if all four dimensions meet the thresholds:
    ///   fitness ≥ 0.85, precision ≥ 0.70, generalization ≥ 0.70, simplicity ≥ 0.50
    /// (van der Aalst 2016 §9.5 — typical acceptability criteria).
    pub fn is_acceptable(&self) -> bool {
        self.fitness.0 >= 0.85
            && self.precision.0 >= 0.70
            && self.generalization.0 >= 0.70
            && self.simplicity.0 >= 0.50
    }
}

/// Token-replay statistics used to compute fitness (van der Aalst 2016 §9.2).
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct TokenReplayStats {
    /// Tokens produced (model fires a transition, produces tokens).
    pub produced: u64,
    /// Tokens consumed (transition fires, consumes input tokens).
    pub consumed: u64,
    /// Tokens missing (needed but not present — log deviation).
    pub missing: u64,
    /// Tokens remaining (still in places at trace end — log deviation).
    pub remaining: u64,
}

impl TokenReplayStats {
    /// Fitness formula: 1 − (missing + consumed) / (produced + remaining).
    ///
    /// Returns `None` if produced + remaining = 0 (empty replay).
    pub fn fitness(&self) -> Option<FitnessScore> {
        let denom = (self.produced + self.remaining) as f64;
        if denom == 0.0 {
            return None;
        }
        let v = 1.0 - (self.missing + self.consumed) as f64 / denom;
        FitnessScore::new(v.max(0.0))
    }
}
