//! Cost law evaluators: traditional multiplication and replacement sum.

use crate::autosystems::candidates::Candidate;

/// Trait for cost evaluation strategies.
pub trait CostLaw {
    /// Evaluate a candidate's cost profile.
    fn evaluate(&self, candidate: &Candidate) -> f64;
}

/// Traditional cost law: multiply all dimensions.
pub struct TraditionalCostLaw;

impl CostLaw for TraditionalCostLaw {
    fn evaluate(&self, candidate: &Candidate) -> f64 {
        let dims = vec!["cost", "latency", "throughput", "availability", "scalability", "compliance"];
        let mut product = 1.0;

        for dim in dims {
            let score = candidate.scores.get(dim).copied().unwrap_or(1.0);
            product *= score;
        }

        if !product.is_finite() {
            return 0.0;
        }
        product
    }
}

/// Replacement cost law: sum 4 key dimensions.
pub struct ReplacementCostLaw;

impl CostLaw for ReplacementCostLaw {
    fn evaluate(&self, candidate: &Candidate) -> f64 {
        let dims = vec!["cost", "latency", "scalability", "compliance"];
        let mut sum = 0.0;
        let mut count = 0;

        for dim in dims {
            if let Some(score) = candidate.scores.get(dim) {
                sum += score;
                count += 1;
            }
        }

        if count == 0 {
            return 0.0;
        }

        let avg = sum / count as f64;
        if !avg.is_finite() {
            return 0.0;
        }
        avg
    }
}
