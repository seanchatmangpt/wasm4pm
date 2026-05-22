use serde::{Deserialize, Serialize};

/// Result of token-based replay conformance checking
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TokenReplayResult {
    pub fitness: f64,
    pub produced_tokens: usize,
    pub consumed_tokens: usize,
    pub missing_tokens: usize,
    pub remaining_tokens: usize,
}

impl TokenReplayResult {
    pub fn new(
        fitness: f64,
        produced_tokens: usize,
        consumed_tokens: usize,
        missing_tokens: usize,
        remaining_tokens: usize,
    ) -> Self {
        TokenReplayResult {
            fitness,
            produced_tokens,
            consumed_tokens,
            missing_tokens,
            remaining_tokens,
        }
    }

    pub fn calculate_fitness(
        produced: usize,
        consumed: usize,
        missing: usize,
        remaining: usize,
    ) -> f64 {
        let denom = (produced + remaining).max(1) as f64;
        let num = consumed.saturating_sub(missing) as f64;
        // All inputs are usize, so num/denom is finite and in [0, +inf). No
        // NaN is possible here, but clamping defensively keeps the invariant.
        clamp_finite(num / denom, 0.0, 1.0)
    }
}

/// NaN-safe clamp. Returns `lo` for NaN, matches `f64::clamp` for finite values.
///
/// PR #54 NaN class: the stdlib `f64::clamp` *panics* on NaN inputs (and was
/// previously documented as such). The original code below called
/// `precision.clamp(0.0, 1.0)` where `precision` came from caller-supplied f64
/// — passing `f64::NAN` would crash production. We coerce NaN to `lo` because
/// "no information" is the safest conservative fitness/precision value.
fn clamp_finite(x: f64, lo: f64, hi: f64) -> f64 {
    if x.is_nan() || x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}

/// Detailed conformance checking result
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConformanceResult {
    pub fitness: f64,
    pub precision: Option<f64>,
    pub generalization: Option<f64>,
    pub simplicity: Option<f64>,
    pub total_traces: usize,
    pub fitting_traces: usize,
    pub deviating_traces: usize,
}

impl ConformanceResult {
    pub fn new(
        fitness: f64,
        total_traces: usize,
        fitting_traces: usize,
        deviating_traces: usize,
    ) -> Self {
        ConformanceResult {
            fitness,
            precision: None,
            generalization: None,
            simplicity: None,
            total_traces,
            fitting_traces,
            deviating_traces,
        }
    }

    pub fn with_precision(mut self, precision: f64) -> Self {
        // PR #54: f64::clamp panics on NaN; route through clamp_finite.
        self.precision = Some(clamp_finite(precision, 0.0, 1.0));
        self
    }

    pub fn with_generalization(mut self, generalization: f64) -> Self {
        self.generalization = Some(clamp_finite(generalization, 0.0, 1.0));
        self
    }

    pub fn with_simplicity(mut self, simplicity: f64) -> Self {
        self.simplicity = Some(clamp_finite(simplicity, 0.0, 1.0));
        self
    }

    pub fn conformance_rate(&self) -> f64 {
        if self.total_traces == 0 {
            0.0
        } else {
            self.fitting_traces as f64 / self.total_traces as f64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_replay_fitness() {
        let fitness = TokenReplayResult::calculate_fitness(100, 95, 5, 10);
        assert!((fitness - 0.8181818).abs() < 0.001); // (95 - 5) / (100 + 10) = 90/110
    }

    #[test]
    fn test_conformance_result() {
        let result = ConformanceResult::new(0.95, 100, 95, 5);
        assert_eq!(result.conformance_rate(), 0.95);
        assert_eq!(result.fitting_traces, 95);
    }

    /// Rank-1 (mathematical theorem): clamp_finite must NEVER panic and must
    /// satisfy `lo <= clamp_finite(x, lo, hi) <= hi` for every f64 input.
    /// Regression for PR #54 NaN class: the stdlib `f64::clamp` panics if any
    /// of {x, lo, hi} is NaN, so the `precision.clamp(0.0, 1.0)` call on a
    /// caller-supplied NaN previously crashed.
    #[test]
    fn clamp_finite_handles_nan_and_inf() {
        assert_eq!(clamp_finite(f64::NAN, 0.0, 1.0), 0.0);
        assert_eq!(clamp_finite(f64::INFINITY, 0.0, 1.0), 1.0);
        assert_eq!(clamp_finite(f64::NEG_INFINITY, 0.0, 1.0), 0.0);
        assert_eq!(clamp_finite(0.5, 0.0, 1.0), 0.5);
        assert_eq!(clamp_finite(-1.0, 0.0, 1.0), 0.0);
        assert_eq!(clamp_finite(2.0, 0.0, 1.0), 1.0);
    }

    /// Rank-2 (domain contract): ConformanceResult builders must accept NaN
    /// without panicking and store the conservative lower bound.
    #[test]
    fn conformance_builders_do_not_panic_on_nan() {
        let r = ConformanceResult::new(0.5, 10, 5, 5)
            .with_precision(f64::NAN)
            .with_generalization(f64::NAN)
            .with_simplicity(f64::NAN);
        assert_eq!(r.precision, Some(0.0));
        assert_eq!(r.generalization, Some(0.0));
        assert_eq!(r.simplicity, Some(0.0));
    }
}
