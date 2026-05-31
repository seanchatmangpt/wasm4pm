//! Social network mining types — handover-of-work and working-together graphs.
//!
//! Paper grounding: van der Aalst, Reijers & Song (2005) CSCW —
//! "Discovering Social Networks from Event Logs".
//!
//! Formal objects:
//!   Handover-of-work graph: H = (R, E_H, W_H) where
//!     R = resource set, E_H ⊆ R × R directed edges,
//!     W_H : E_H → ℕ frequency of direct handoffs.
//!   Working-together graph: T = (R, E_T, W_T) where
//!     E_T ⊆ R × R (symmetric), W_T : E_T → ℕ co-participation count.

extern crate alloc;

use alloc::collections::{BTreeMap, BTreeSet};
use crate::primitives::ResourceName;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Directed edge between two resources in a social network.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ResourceEdge {
    pub from: ResourceName,
    pub to: ResourceName,
}

impl ResourceEdge {
    pub fn new(from: impl Into<ResourceName>, to: impl Into<ResourceName>) -> Self {
        ResourceEdge { from: from.into(), to: to.into() }
    }
}

/// Handover-of-work social network: H = (R, E_H, W_H).
///
/// Paper: van der Aalst et al. (2005) CSCW §3.1.
/// Edge (rᵢ, rⱼ) exists iff resource rᵢ completes a task immediately before
/// resource rⱼ starts a task in the same case. W_H is the frequency.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct HandoverNetwork {
    /// R — resource set (nodes).
    pub resources: BTreeSet<ResourceName>,
    /// E_H × W_H — directed edges with frequencies.
    pub edges: BTreeMap<ResourceEdge, u64>,
}

impl HandoverNetwork {
    pub fn new() -> Self {
        HandoverNetwork { resources: BTreeSet::new(), edges: BTreeMap::new() }
    }

    /// Record a handoff from `from` to `to`.
    #[inline]
    pub fn record_handoff(&mut self, from: ResourceName, to: ResourceName) {
        self.resources.insert(from.clone());
        self.resources.insert(to.clone());
        *self.edges.entry(ResourceEdge { from, to }).or_insert(0) += 1;
    }

    pub fn edge_weight(&self, from: &ResourceName, to: &ResourceName) -> u64 {
        self.edges.get(&ResourceEdge { from: from.clone(), to: to.clone() }).copied().unwrap_or(0)
    }
}

impl Default for HandoverNetwork { fn default() -> Self { Self::new() } }

/// Working-together social network: T = (R, E_T, W_T).
///
/// Paper: van der Aalst et al. (2005) CSCW §3.2.
/// Edge {rᵢ, rⱼ} exists iff both resources appear in the same case.
/// W_T counts the number of cases where they co-appear.
///
/// Symmetric — stored with from < to (lexicographic) to avoid duplicates.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct WorkingTogetherNetwork {
    /// R — resource set (nodes).
    pub resources: BTreeSet<ResourceName>,
    /// E_T × W_T — undirected edges stored in canonical (from ≤ to) order.
    pub edges: BTreeMap<ResourceEdge, u64>,
}

impl WorkingTogetherNetwork {
    pub fn new() -> Self {
        WorkingTogetherNetwork { resources: BTreeSet::new(), edges: BTreeMap::new() }
    }

    /// Record co-participation of `a` and `b` in the same case.
    pub fn record_co_participation(&mut self, a: ResourceName, b: ResourceName) {
        self.resources.insert(a.clone());
        self.resources.insert(b.clone());
        // Canonical order: smaller first.
        let (from, to) = if a <= b { (a, b) } else { (b, a) };
        *self.edges.entry(ResourceEdge { from, to }).or_insert(0) += 1;
    }

    pub fn edge_weight(&self, a: &ResourceName, b: &ResourceName) -> u64 {
        let (from, to) = if a <= b { (a.clone(), b.clone()) } else { (b.clone(), a.clone()) };
        self.edges.get(&ResourceEdge { from, to }).copied().unwrap_or(0)
    }
}

impl Default for WorkingTogetherNetwork { fn default() -> Self { Self::new() } }
