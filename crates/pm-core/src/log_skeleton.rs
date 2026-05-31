//! Log skeleton — constraint set over activity pairs.
//!
//! Paper grounding: Verbeek & Medeiros de Carvalho (2018) arXiv:1806.08247 (first known);
//! Verbeek (2021) STTT 24(4) — "The Log Skeleton Visualizer in ProM 6.9" (peer-reviewed).
//! Winner of the Process Discovery Contest 2017 and 2019.
//!
//! Formal object: a log skeleton is a tuple (A, C₁, C₂, C₃, C₄, C₅) where each Cᵢ is a
//! binary relation over A capturing a specific kind of ordering/co-occurrence constraint:
//!   C₁ = always_before   (a always occurs before b in every trace containing both)
//!   C₂ = always_after    (a always occurs after b)
//!   C₃ = equivalence     (a and b always occur the same number of times)
//!   C₄ = never_together  (a and b never occur in the same trace)
//!   C₅ = activity_count  (min/max occurrence count per activity)

extern crate alloc;

use alloc::collections::{BTreeMap, BTreeSet};
use crate::primitives::ActivityName;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Ordered pair of activities (from, to) used as a relation key.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ActivityPair {
    pub from: ActivityName,
    pub to: ActivityName,
}

impl ActivityPair {
    pub fn new(from: impl Into<ActivityName>, to: impl Into<ActivityName>) -> Self {
        ActivityPair { from: from.into(), to: to.into() }
    }
}

/// Observed count bounds for an activity across all traces.
///
/// Part of the C₅ = activity_count constraint (Verbeek 2021 §3).
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct CountBounds {
    /// Minimum number of times this activity occurs in any trace.
    pub min: u32,
    /// Maximum number of times, or `None` for unbounded.
    pub max: Option<u32>,
}

/// Log skeleton: a compact constraint representation of event log behaviour.
///
/// Paper: Verbeek (2021) STTT 24(4). Formal object: (A, C₁, C₂, C₃, C₄, C₅).
///
/// All constraint sets use BTreeSet/BTreeMap for deterministic iteration.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct LogSkeleton {
    /// Universe of activities A observed in the log.
    pub activities: BTreeSet<ActivityName>,

    /// C₁: always_before — if both a and b appear in a trace, a always appears before b.
    pub always_before: BTreeSet<ActivityPair>,

    /// C₂: always_after — if both a and b appear in a trace, a always appears after b.
    pub always_after: BTreeSet<ActivityPair>,

    /// C₃: equivalence — a and b always occur the same number of times in every trace.
    pub equivalence: BTreeSet<ActivityPair>,

    /// C₄: never_together — a and b never both appear in the same trace.
    pub never_together: BTreeSet<ActivityPair>,

    /// C₅: activity_count — min/max observed occurrence count per activity.
    pub activity_count: BTreeMap<ActivityName, CountBounds>,
}

impl LogSkeleton {
    pub fn new(activities: BTreeSet<ActivityName>) -> Self {
        LogSkeleton {
            activities,
            always_before: BTreeSet::new(),
            always_after: BTreeSet::new(),
            equivalence: BTreeSet::new(),
            never_together: BTreeSet::new(),
            activity_count: BTreeMap::new(),
        }
    }

    /// Check whether a given (a, b) pair satisfies the always_before constraint.
    pub fn is_always_before(&self, from: &ActivityName, to: &ActivityName) -> bool {
        self.always_before.contains(&ActivityPair { from: from.clone(), to: to.clone() })
    }

    /// Check whether two activities are declared never_together.
    pub fn is_never_together(&self, a: &ActivityName, b: &ActivityName) -> bool {
        self.never_together.contains(&ActivityPair { from: a.clone(), to: b.clone() })
            || self.never_together.contains(&ActivityPair { from: b.clone(), to: a.clone() })
    }
}
