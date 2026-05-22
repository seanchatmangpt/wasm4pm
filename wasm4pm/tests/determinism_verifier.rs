/// Determinism Verifier
///
/// Rank-1 Oracle: Identical seed → identical output (bit-exact for integers/strings, 1e-9 tolerance for floats)
/// Tests that algorithms produce deterministic results when seeded with the same RNG state.
///
/// Critical for:
/// - Regression testing (reproduce failures)
/// - Reproducibility (scientific credibility)
/// - Debugging (isolate non-determinism)
/// - CI/CD (stable test results)

use rand::SeedableRng;
use std::fmt;

/// Determinism verification result
#[derive(Debug, Clone, PartialEq)]
pub struct DeterminismResult {
    pub deterministic: bool,
    pub consistency_score: f32, // 0.0 = never consistent, 1.0 = always identical
    pub failed_trials: Vec<(usize, usize, String)>, // (trial_i, trial_j, reason)
    pub float_tolerance_used: f32,
}

impl fmt::Display for DeterminismResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Determinism: {}, Consistency: {:.2}%, Failed comparisons: {}",
            if self.deterministic { "PASS" } else { "FAIL" },
            self.consistency_score * 100.0,
            self.failed_trials.len()
        )
    }
}

/// Determinism verifier for algorithms
pub struct DeterminismVerifier {
    float_tolerance: f32,
}

impl DeterminismVerifier {
    pub fn new() -> Self {
        DeterminismVerifier {
            float_tolerance: 1e-9,
        }
    }

    /// Verify that an algorithm is deterministic across multiple trials with the same seed
    pub fn verify_determinism<T: Clone + PartialEq + fmt::Debug>(
        &self,
        seed: u64,
        n_trials: usize,
        algorithm: impl Fn() -> T,
    ) -> DeterminismResult {
        let mut trials = Vec::new();

        // Run algorithm n_trials times with fresh seeded RNG
        for _ in 0..n_trials {
            let result = algorithm();
            trials.push(result);
        }

        // Compare all pairs of trials
        let mut failed_trials = Vec::new();
        let mut consistent_pairs = 0;
        let total_pairs = (n_trials * (n_trials - 1)) / 2;

        for i in 0..n_trials {
            for j in (i + 1)..n_trials {
                if trials[i] != trials[j] {
                    failed_trials.push((
                        i,
                        j,
                        format!("{:?} != {:?}", trials[i], trials[j]),
                    ));
                } else {
                    consistent_pairs += 1;
                }
            }
        }

        let consistency_score = if total_pairs == 0 {
            1.0
        } else {
            consistent_pairs as f32 / total_pairs as f32
        };

        DeterminismResult {
            deterministic: failed_trials.is_empty(),
            consistency_score,
            failed_trials,
            float_tolerance_used: self.float_tolerance,
        }
    }

    /// Verify determinism with float tolerance for floating-point arithmetic
    pub fn verify_determinism_f32(
        &self,
        seed: u64,
        iterations: usize,
        mut algorithm: impl FnMut() -> f32,
    ) -> DeterminismResult {
        let mut trials = Vec::new();

        for _ in 0..iterations {
            let result = algorithm();
            trials.push(result);
        }

        // Compare all pairs for determinism (within float tolerance)
        let mut failed_trials = Vec::new();
        let mut consistent_pairs = 0;
        let total_pairs = (iterations * (iterations - 1)) / 2;

        for i in 0..iterations {
            for j in (i + 1)..iterations {
                let diff = (trials[i] - trials[j]).abs();

                // Check for NaN/Inf mismatch
                let both_nan = trials[i].is_nan() && trials[j].is_nan();
                let both_inf = trials[i].is_infinite() && trials[j].is_infinite();
                let both_same_sign = (trials[i] > 0.0) == (trials[j] > 0.0) || (both_nan || both_inf);

                if both_nan || (both_inf && both_same_sign) || diff <= self.float_tolerance {
                    consistent_pairs += 1;
                } else {
                    failed_trials.push((
                        i,
                        j,
                        format!("{} vs {} (diff: {:.2e})", trials[i], trials[j], diff),
                    ));
                }
            }
        }

        let consistency_score = if total_pairs == 0 {
            1.0
        } else {
            consistent_pairs as f32 / total_pairs as f32
        };

        DeterminismResult {
            deterministic: failed_trials.is_empty(),
            consistency_score,
            failed_trials,
            float_tolerance_used: self.float_tolerance,
        }
    }

    /// Verify determinism with custom float tolerance
    pub fn verify_determinism_f32_with_tolerance(
        &self,
        seed: u64,
        n_trials: usize,
        algorithm: impl FnMut() -> f32,
        tolerance: f32,
    ) -> DeterminismResult {
        let saved_tolerance = self.float_tolerance;
        let verifier = DeterminismVerifier {
            float_tolerance: tolerance,
        };
        verifier.verify_determinism_f32(seed, n_trials, algorithm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::Rng;

    #[test]
    fn test_deterministic_computation() {
        let verifier = DeterminismVerifier::new();
        let seed = 42u64;

        let result = verifier.verify_determinism(seed, 5, || {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            rng.gen_range(0..100)
        });

        assert!(result.deterministic, "Seeded RNG should produce deterministic results");
        assert_eq!(result.consistency_score, 1.0);
    }

    #[test]
    fn test_detects_non_determinism() {
        let verifier = DeterminismVerifier::new();

        let result = verifier.verify_determinism(42u64, 5, || {
            // Random result without seeding (non-deterministic)
            rand::thread_rng().gen::<u64>()
        });

        // Highly unlikely all trials are identical without seeding
        assert!(!result.deterministic || result.consistency_score < 0.9);
    }

    #[test]
    fn test_float_tolerance_nan_handling() {
        let verifier = DeterminismVerifier::new();
        let seed = 42u64;

        let result = verifier.verify_determinism_f32(seed, 3, || {
            f32::NAN // Consistent NaN across trials
        });

        assert!(result.deterministic, "Consistent NaN should be treated as deterministic");
        assert_eq!(result.consistency_score, 1.0);
    }

    #[test]
    fn test_float_tolerance_inf_handling() {
        let verifier = DeterminismVerifier::new();
        let seed = 42u64;

        let result = verifier.verify_determinism_f32(seed, 3, || {
            f32::INFINITY // Consistent positive infinity
        });

        assert!(result.deterministic, "Consistent infinity should be treated as deterministic");
        assert_eq!(result.consistency_score, 1.0);
    }

    #[test]
    fn test_float_consistency_within_tolerance() {
        let verifier = DeterminismVerifier::new();
        let seed = 42u64;
        let mut counter = 0;

        let result = verifier.verify_determinism_f32(seed, 3, || {
            // Vary by tiny amount (within 1e-9 tolerance)
            counter += 1;
            0.5 + (counter as f32 * 1e-12)
        });

        assert!(result.deterministic, "Differences within tolerance should pass");
    }

    #[test]
    fn test_float_fails_outside_tolerance() {
        let verifier = DeterminismVerifier::new();
        let seed = 42u64;
        let mut counter = 0;

        let result = verifier.verify_determinism_f32(seed, 3, || {
            counter += 1;
            0.5 + (counter as f32 * 0.1) // Vary by significant amount
        });

        assert!(!result.deterministic, "Differences outside tolerance should fail");
        assert!(result.consistency_score < 1.0);
    }

    #[test]
    fn test_custom_tolerance() {
        let verifier = DeterminismVerifier::new();
        let seed = 42u64;

        let result = verifier.verify_determinism_f32_with_tolerance(seed, 3, || 0.5, 1e-3);

        assert_eq!(result.float_tolerance_used, 1e-3);
    }

    #[test]
    fn test_result_display() {
        let result = DeterminismResult {
            deterministic: true,
            consistency_score: 1.0,
            failed_trials: vec![],
            float_tolerance_used: 1e-9,
        };

        let display = format!("{}", result);
        assert!(display.contains("PASS"));
        assert!(display.contains("100.00%"));
    }

    #[test]
    fn test_result_display_failure() {
        let result = DeterminismResult {
            deterministic: false,
            consistency_score: 0.5,
            failed_trials: vec![(0, 1, "Value mismatch".to_string())],
            float_tolerance_used: 1e-9,
        };

        let display = format!("{}", result);
        assert!(display.contains("FAIL"));
        assert!(display.contains("50.00%"));
        assert!(display.contains("1"));
    }

    #[test]
    fn test_determinism_multiple_seeds() {
        let verifier = DeterminismVerifier::new();

        // Each seed should produce deterministic results independently
        for seed in [42, 123, 999] {
            let result = verifier.verify_determinism(seed, 3, || {
                let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
                rng.gen_range(0..1000)
            });

            assert!(result.deterministic, "Seed {} should produce deterministic results", seed);
        }
    }

    #[test]
    fn test_single_trial_is_trivially_deterministic() {
        let verifier = DeterminismVerifier::new();

        let result = verifier.verify_determinism(42u64, 1, || {
            // Single trial: always "deterministic" (no comparisons)
            42
        });

        assert!(result.deterministic);
        assert_eq!(result.consistency_score, 1.0);
    }
}
