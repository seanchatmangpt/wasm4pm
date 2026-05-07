//! Pareto dominance and candidate rejection.

use crate::autosystems::candidates::Candidate;
use serde::{Deserialize, Serialize};

/// Domain-specific weighting profile for dominance checks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DomainProfile {
    /// Balanced across all dimensions
    Balanced,
    /// Favor low cost
    CostFirst,
    /// Favor low latency
    LatencyFirst,
    /// Favor high availability
    AvailabilityFirst,
    /// Default (alias for Balanced)
    Default,
    /// High traffic / low latency prioritized
    HighTraffic,
    /// Mission critical / high availability
    MissionCritical,
    /// Offline first / local execution
    Offline,
}

impl DomainProfile {
    /// Get weight overrides for this profile.
    fn weights(&self) -> (f64, f64, f64, f64, f64, f64) {
        // (cost, latency, throughput, availability, scalability, compliance)
        match self {
            DomainProfile::Balanced => (1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
            DomainProfile::CostFirst => (2.0, 1.0, 1.0, 1.0, 0.5, 1.0),
            DomainProfile::LatencyFirst => (1.0, 2.0, 1.5, 1.0, 0.5, 1.0),
            DomainProfile::AvailabilityFirst => (0.5, 1.0, 1.0, 2.0, 1.0, 1.5),
            DomainProfile::Default => (1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
            DomainProfile::HighTraffic => (1.0, 2.0, 1.5, 1.0, 0.5, 1.0),
            DomainProfile::MissionCritical => (0.5, 1.0, 1.0, 2.0, 1.0, 1.5),
            DomainProfile::Offline => (1.0, 1.0, 0.8, 1.2, 0.9, 2.0),
        }
    }
}

/// Check if candidate `a` is dominated by candidate `b`.
pub fn is_dominated(a: &Candidate, b: &Candidate, profile: DomainProfile) -> bool {
    let (w_cost, w_lat, w_tput, w_avail, w_scale, w_comp) = profile.weights();
    let dims = [
        ("cost", w_cost, true),      // lower is better
        ("latency", w_lat, true),    // lower is better
        ("throughput", w_tput, false), // higher is better
        ("availability", w_avail, false),
        ("scalability", w_scale, false),
        ("compliance", w_comp, false),
    ];

    let mut all_at_least_as_good = true;
    let mut strictly_better_in_one = false;

    for (key, weight, lower_is_better) in dims {
        let a_val = a.scores.get(key).copied().unwrap_or(1.0) * weight;
        let b_val = b.scores.get(key).copied().unwrap_or(1.0) * weight;

        let a_better = if lower_is_better { a_val <= b_val } else { a_val >= b_val };

        if !a_better {
            all_at_least_as_good = false;
            break;
        }

        if (lower_is_better && b_val < a_val) || (!lower_is_better && b_val > a_val) {
            strictly_better_in_one = true;
        }
    }

    all_at_least_as_good && strictly_better_in_one
}

/// Rejected candidate with reason.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RejectedCandidate {
    /// Candidate ID
    pub id: String,
    /// Why it was rejected
    pub reason: String,
}

/// Reject dominated candidates; return (undominated, rejected).
pub fn reject_dominated(
    candidates: Vec<Candidate>,
    profile: DomainProfile,
) -> (Vec<Candidate>, Vec<RejectedCandidate>) {
    let mut undominated = vec![];
    let mut rejected = vec![];

    for a in &candidates {
        let mut is_dom = false;
        for b in &candidates {
            if a.id != b.id && is_dominated(a, b, profile) {
                is_dom = true;
                break;
            }
        }

        if is_dom {
            rejected.push(RejectedCandidate {
                id: a.id.clone(),
                reason: "Dominated by another candidate".to_string(),
            });
        } else {
            undominated.push(a.clone());
        }
    }

    (undominated, rejected)
}
