//! Detector for missing benchmark expectation.
//!
//! Fires when a benchmark test provides no expected verdict, making
//! it impossible to verify whether the system is working correctly.

use crate::autosystems::findings::{Detector, DetectorInput, Finding, Severity};

/// Detects missing benchmark expected verdict.
pub struct BenchMissingDetector;

impl Detector for BenchMissingDetector {
    fn code(&self) -> &'static str {
        "BENCHMARK_EXPECTATION_MISSING"
    }

    fn run(&self, input: &DetectorInput) -> Vec<Finding> {
        if input.benchmark_expected_verdict.is_none() {
            return vec![Finding::new(
                self.code(),
                Severity::Warning,
                "Benchmark test has no expected verdict; verification of correctness is impossible",
            )
            .with_evidence(vec!["benchmark_expected_verdict: None".to_string()])];
        }

        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_when_benchmark_verdict_missing() {
        let detector = BenchMissingDetector;
        let input = DetectorInput {
            benchmark_expected_verdict: None,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, "BENCHMARK_EXPECTATION_MISSING");
        assert_eq!(findings[0].severity, Severity::Warning);
    }

    #[test]
    fn silent_when_benchmark_verdict_present() {
        let detector = BenchMissingDetector;
        let input = DetectorInput {
            benchmark_expected_verdict: Some("success".to_string()),
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }
}
