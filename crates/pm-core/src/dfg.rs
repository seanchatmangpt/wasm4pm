//! Directly-Follows Graph (DFG) — G = (A, F, W).
//!
//! Paper grounding: Cook & Wolf (1998) ACM TOSEM 7(3) — first formal definition of
//! directly-follows relations in workflow traces. van der Aalst (2016) Process Mining §3.2
//! defines the DFG as the canonical starting model for process discovery.
//!
//! Formal object: G = (A, F, W) where
//!   A ⊆ A* is the activity set (nodes),
//!   F ⊆ A × A is the directly-follows relation (edges),
//!   W : F → ℕ is the frequency weight function.
//!
//! Uses BTreeMap/BTreeSet throughout for deterministic iteration — fixing the
//! HashMap non-determinism bug documented in wasm4pm's simd_streaming_dfg.rs.

extern crate alloc;

use alloc::collections::{BTreeMap, BTreeSet};

use crate::primitives::ActivityName;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Frequency count for a directly-follows edge. Non-zero.
///
/// Formal: W : F → ℕ (van der Aalst 2016 §3.2).
pub type Frequency = u64;

/// Directed edge in the DFG: activity `from` directly precedes activity `to`.
///
/// Formal: (a, b) ∈ F iff ∃ trace σ = ⟨…, a, b, …⟩ in the event log.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DfgEdge {
    pub from: ActivityName,
    pub to: ActivityName,
}

impl DfgEdge {
    pub fn new(from: impl Into<ActivityName>, to: impl Into<ActivityName>) -> Self {
        DfgEdge { from: from.into(), to: to.into() }
    }
}

/// Directly-Follows Graph: G = (A, F, W).
///
/// Paper: Cook & Wolf (1998) ACM TOSEM 7(3); van der Aalst (2016) §3.2.
///
/// All collections use BTreeMap/BTreeSet for deterministic iteration order.
/// This is a type-only definition — discovery algorithms live in `wasm4pm` and
/// other crates that depend on `pm-core`.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DirectlyFollowsGraph {
    /// A — activity set (nodes). Formal: A ⊆ A* (van der Aalst 2016 §2.1).
    pub activities: BTreeSet<ActivityName>,
    /// F × W — edge multiset with frequencies. Formal: W : F → ℕ.
    pub edges: BTreeMap<DfgEdge, Frequency>,
    /// Activities that are first in at least one trace (start activities).
    pub start_activities: BTreeMap<ActivityName, Frequency>,
    /// Activities that are last in at least one trace (end activities).
    pub end_activities: BTreeMap<ActivityName, Frequency>,
}

impl DirectlyFollowsGraph {
    /// Construct an empty DFG.
    pub fn new() -> Self {
        DirectlyFollowsGraph {
            activities: BTreeSet::new(),
            edges: BTreeMap::new(),
            start_activities: BTreeMap::new(),
            end_activities: BTreeMap::new(),
        }
    }

    /// Record a directly-follows occurrence: activity `from` immediately precedes `to`.
    #[inline]
    pub fn record_edge(&mut self, from: ActivityName, to: ActivityName) {
        self.activities.insert(from.clone());
        self.activities.insert(to.clone());
        *self.edges.entry(DfgEdge { from, to }).or_insert(0) += 1;
    }

    /// Record `activity` as a start (first event in a trace).
    #[inline]
    pub fn record_start(&mut self, activity: ActivityName) {
        self.activities.insert(activity.clone());
        *self.start_activities.entry(activity).or_insert(0) += 1;
    }

    /// Record `activity` as an end (last event in a trace).
    #[inline]
    pub fn record_end(&mut self, activity: ActivityName) {
        self.activities.insert(activity.clone());
        *self.end_activities.entry(activity).or_insert(0) += 1;
    }

    /// Number of distinct activities (|A|).
    #[inline]
    pub fn activity_count(&self) -> usize {
        self.activities.len()
    }

    /// Number of distinct edges (|F|).
    #[inline]
    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }

    /// Frequency of the directly-follows relation (from → to), or 0 if absent.
    #[inline]
    pub fn edge_frequency(&self, from: &ActivityName, to: &ActivityName) -> Frequency {
        self.edges.get(&DfgEdge { from: from.clone(), to: to.clone() }).copied().unwrap_or(0)
    }
}

impl Default for DirectlyFollowsGraph {
    fn default() -> Self {
        Self::new()
    }
}
