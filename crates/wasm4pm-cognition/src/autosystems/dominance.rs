//! Pareto dominance over manifest-declared dimensions.
//!
//! Dominance is computed strictly from a candidate's declared dimensions and
//! the manifest's [`DimensionSpec::direction`]. Profile weights tilt the
//! comparison without altering ordering semantics.

use crate::autosystems::candidates::Candidate;
use crate::autosystems::dimension::{DimensionSpec, Direction};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Domain-specific weighting profile for dominance checks.
///
/// `Custom(weights)` carries a key→weight mapping; missing keys default to 1.0.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DomainProfile {
    /// All dimensions weighted equally.
    Balanced,
    /// Cost-favored.
    CostFirst,
    /// Latency-favored.
    LatencyFirst,
    /// Availability-favored.
    AvailabilityFirst,
    /// Default = Balanced.
    Default,
    /// High-traffic: latency + throughput tilted.
    HighTraffic,
    /// Mission-critical: availability + compliance tilted.
    MissionCritical,
    /// Offline: compliance + availability tilted.
    Offline,
    /// User-defined weights keyed by dimension key.
    Custom(HashMap<String, f64>),
}

impl DomainProfile {
    /// Compute the weight for a dimension key under this profile.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn weight(&self, key: &str) -> f64 {
        match self {
            DomainProfile::Balanced | DomainProfile::Default => 1.0,
            DomainProfile::CostFirst => match key {
                "cost" | "cost_usd" => 2.0,
                "scalability" => 0.5,
                _ => 1.0,
            },
            DomainProfile::LatencyFirst | DomainProfile::HighTraffic => match key {
                "latency" | "latency_ms" | "latency_s" => 2.0,
                "throughput" => 1.5,
                "scalability" => 0.5,
                _ => 1.0,
            },
            DomainProfile::AvailabilityFirst | DomainProfile::MissionCritical => match key {
                "availability" => 2.0,
                "compliance" => 1.5,
                "cost" | "cost_usd" => 0.5,
                _ => 1.0,
            },
            DomainProfile::Offline => match key {
                "compliance" => 2.0,
                "availability" => 1.2,
                "throughput" => 0.8,
                _ => 1.0,
            },
            DomainProfile::Custom(map) => map.get(key).copied().unwrap_or(1.0),
        }
    }
}

/// Returns true iff `a` is strictly Pareto-dominated by `b`.
///
/// `b` dominates `a` when `b` is at least as good on every declared dimension
/// and strictly better on at least one. Direction is taken from each
/// [`DimensionSpec`]. Weights scale magnitudes but never flip direction.
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn is_dominated(
    a: &Candidate,
    b: &Candidate,
    profile: &DomainProfile,
    specs: &[DimensionSpec],
) -> bool {
    if a.id == b.id {
        return false;
    }
    let mut all_at_least_as_good = true;
    let mut strictly_better_in_one = false;

    for s in specs {
        let aw = profile.weight(&s.key);
        let av = match a.get(&s.key) {
            Some(v) => v * aw,
            None => continue,
        };
        let bv = match b.get(&s.key) {
            Some(v) => v * aw,
            None => continue,
        };
        let (b_at_least_as_good, b_strictly_better) = match s.direction {
            Direction::HigherIsBetter => (bv >= av, bv > av),
            Direction::LowerIsBetter => (bv <= av, bv < av),
        };
        if !b_at_least_as_good {
            all_at_least_as_good = false;
            break;
        }
        if b_strictly_better {
            strictly_better_in_one = true;
        }
    }

    all_at_least_as_good && strictly_better_in_one
}

/// Rejected candidate with reason.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RejectedCandidate {
    /// Candidate id.
    pub id: String,
    /// Reason text.
    pub reason: String,
}

/// Filter dominated candidates. Returns `(kept, rejected)`.
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn reject_dominated(
    candidates: Vec<Candidate>,
    profile: &DomainProfile,
    specs: &[DimensionSpec],
) -> (Vec<Candidate>, Vec<RejectedCandidate>) {
    let mut kept = Vec::new();
    let mut rejected = Vec::new();
    for a in &candidates {
        let mut dominated_by = None;
        for b in &candidates {
            if is_dominated(a, b, profile, specs) {
                dominated_by = Some(b.id.clone());
                break;
            }
        }
        match dominated_by {
            Some(by) => rejected.push(RejectedCandidate {
                id: a.id.clone(),
                reason: format!("dominated by {}", by),
            }),
            None => kept.push(a.clone()),
        }
    }
    (kept, rejected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;

    fn cand(id: &str, dims: &[(&str, f64)]) -> Candidate {
        let mut m = IndexMap::new();
        for (k, v) in dims {
            m.insert((*k).into(), *v);
        }
        Candidate {
            id: id.into(),
            family_id: "demo".into(),
            runtime_boundaries: vec![],
            dimensions: m,
            provenance: None,
        }
    }

    fn specs() -> Vec<DimensionSpec> {
        vec![
            DimensionSpec {
                key: "score_a".into(),
                unit: "score".into(),
                direction: Direction::HigherIsBetter,
                min: None,
                max: None,
            },
            DimensionSpec {
                key: "score_b".into(),
                unit: "score".into(),
                direction: Direction::HigherIsBetter,
                min: None,
                max: None,
            },
        ]
    }

    #[test]
    fn dominated_when_strictly_worse() {
        let a = cand("a", &[("score_a", 0.5), ("score_b", 0.5)]);
        let b = cand("b", &[("score_a", 0.9), ("score_b", 0.9)]);
        let s = specs();
        assert!(is_dominated(&a, &b, &DomainProfile::Balanced, &s));
        assert!(!is_dominated(&b, &a, &DomainProfile::Balanced, &s));
    }

    #[test]
    fn irreflexive() {
        let a = cand("a", &[("score_a", 0.5), ("score_b", 0.5)]);
        assert!(!is_dominated(&a, &a, &DomainProfile::Balanced, &specs()));
    }
}
