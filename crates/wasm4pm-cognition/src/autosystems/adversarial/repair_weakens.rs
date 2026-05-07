//! Detector for threshold degradation during recovery.
//!
//! Fires when the acceptance threshold is lowered during repair, indicating
//! that the system is accepting worse evidence after a failure.

use crate::autosystems::findings::{Detector, DetectorInput, Finding, Severity};

/// Detects threshold reduction during repair operations.
pub struct RepairWeakensDetector;

impl Detector for RepairWeakensDetector {
    fn code(&self) -> &'static str {
        "REPAIR_WEAKENS_GATE"
    }

    fn run(&self, input: &DetectorInput) -> Vec<Finding> {
        // Fire if prior_threshold > current_threshold (both present)
        match (&input.prior_threshold, &input.current_threshold) {
            (Some(prior), Some(current)) if prior > current => {
                return vec![Finding::new(
                    self.code(),
                    Severity::Error,
                    "Threshold was lowered during repair; system is accepting weaker evidence",
                )
                .with_evidence(vec![
                    format!("prior_threshold: {}", prior),
                    format!("current_threshold: {}", current),
                ])];
            }
            _ => {}
        }

        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_when_threshold_lowered() {
        let detector = RepairWeakensDetector;
        let input = DetectorInput {
            prior_threshold: Some(0.95),
            current_threshold: Some(0.80),
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, "REPAIR_WEAKENS_GATE");
        assert_eq!(findings[0].severity, Severity::Error);
    }

    #[test]
    fn silent_when_threshold_maintained() {
        let detector = RepairWeakensDetector;
        let input = DetectorInput {
            prior_threshold: Some(0.80),
            current_threshold: Some(0.80),
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }

    #[test]
    fn silent_when_threshold_raised() {
        let detector = RepairWeakensDetector;
        let input = DetectorInput {
            prior_threshold: Some(0.80),
            current_threshold: Some(0.95),
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }
}
