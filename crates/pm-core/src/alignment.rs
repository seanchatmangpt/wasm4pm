//! Trace alignment types — optimal alignment between observed trace and process model.
//!
//! Paper grounding: Adriansyah (2014) PhD thesis TU/e — "Aligning Observed and Modelled Behaviour".
//! Defines the alignment problem as a shortest-path search in the synchronous product of a trace
//! automaton and a Petri net reachability graph.
//!
//! Formal objects:
//!   Move: synchronous (τ,τ) | log-only (a, ≫) | model-only (≫, t)
//!   Alignment: sequence of moves γ = ⟨m₁, …, mₙ⟩ minimising cost c(γ).
//!   Cost function: c(sync)=0, c(log-only)=1, c(model-only)=1 (standard unit cost).
//!   Fitness: f(γ) = 1 − cost(γ) / max_cost(γ).

extern crate alloc;

use alloc::vec::Vec;
use crate::primitives::ActivityName;
use crate::petri_net::TransitionId;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Alignment cost — non-negative real. Range: [0.0, ∞).
///
/// Formal: c : Move → ℝ≥0 (Adriansyah 2014 Def. 3).
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct AlignmentCost(pub f64);

impl AlignmentCost {
    /// Construct a cost value. Returns `None` if negative or non-finite.
    pub fn new(v: f64) -> Option<Self> {
        if v >= 0.0 && v.is_finite() { Some(AlignmentCost(v)) } else { None }
    }
    pub const ZERO: AlignmentCost = AlignmentCost(0.0);
    pub const UNIT: AlignmentCost = AlignmentCost(1.0);
}

/// A single alignment move (Adriansyah 2014 Def. 2).
///
/// Three kinds:
///   - **Synchronous**: the observed activity and the model transition fire together.
///     Cost = 0 under standard unit cost.
///   - **LogOnly** (≫ on model side): the observed event has no matching model step.
///     Cost = 1 under standard unit cost.
///   - **ModelOnly** (≫ on log side): the model fires a silent/invisible step.
///     Cost = 1 (for visible transitions) or 0 (for invisible τ-transitions).
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum AlignmentMove {
    /// Observed activity `a` matches model transition `t`. Formal: (a, t).
    Synchronous {
        activity: ActivityName,
        transition: TransitionId,
    },
    /// Observed activity `a` has no model counterpart. Formal: (a, ≫).
    LogOnly { activity: ActivityName },
    /// Model transition `t` fires with no log counterpart. Formal: (≫, t).
    /// `invisible` is true for τ-transitions (zero cost), false for visible (unit cost).
    ModelOnly { transition: TransitionId, invisible: bool },
}

impl AlignmentMove {
    /// Standard unit cost: sync=0, log-only=1, model-only visible=1, τ=0.
    pub fn standard_cost(&self) -> AlignmentCost {
        match self {
            AlignmentMove::Synchronous { .. } => AlignmentCost::ZERO,
            AlignmentMove::LogOnly { .. } => AlignmentCost::UNIT,
            AlignmentMove::ModelOnly { invisible: true, .. } => AlignmentCost::ZERO,
            AlignmentMove::ModelOnly { invisible: false, .. } => AlignmentCost::UNIT,
        }
    }

    pub fn is_synchronous(&self) -> bool {
        matches!(self, AlignmentMove::Synchronous { .. })
    }
    pub fn is_deviation(&self) -> bool {
        !self.is_synchronous()
    }
}

/// An optimal trace alignment γ = ⟨m₁, …, mₙ⟩ (Adriansyah 2014 Def. 4).
///
/// Minimises total cost subject to the trace being fully consumed and the
/// model reaching a final marking.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Alignment {
    /// The sequence of moves.
    pub moves: Vec<AlignmentMove>,
    /// Total cost of this alignment under the chosen cost function.
    pub total_cost: AlignmentCost,
    /// Whether this alignment is optimal (minimum cost). May be false if truncated.
    pub is_optimal: bool,
}

impl Alignment {
    /// Fitness of this alignment: 1 - cost / max_cost (Adriansyah 2014 §4.2).
    ///
    /// `max_cost` is the cost of the worst possible alignment (all log-only + all model-only).
    /// Returns `None` if `max_cost` is zero (empty trace and empty model).
    pub fn fitness(&self, max_cost: f64) -> Option<f64> {
        if max_cost <= 0.0 {
            return None;
        }
        Some(1.0 - self.total_cost.0 / max_cost)
    }

    /// Number of synchronous moves (conforming steps).
    pub fn sync_count(&self) -> usize {
        self.moves.iter().filter(|m| m.is_synchronous()).count()
    }

    /// Number of deviating moves (log-only + model-only visible).
    pub fn deviation_count(&self) -> usize {
        self.moves.iter().filter(|m| m.is_deviation()).count()
    }
}
