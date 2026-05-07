//! Detector for stub gates that pass without evidence.
//!
//! Fires when a gate claim success (implicitly) but has zero evidence items.
//! This indicates a pass-through without actual verification.

use crate::autosystems::findings::{Detector, DetectorInput, Finding, Severity};

/// Detects gates that claim pass with no supporting evidence.
pub struct StubGateDetector;

impl Detector for StubGateDetector {
    fn code(&self) -> &'static str {
        "STUB_GATE_PASS"
    }

    fn run(&self, input: &DetectorInput) -> Vec<Finding> {
        // Fire if any gate passed (gate_states non-empty) but evidence count is zero
        if !input.gate_states.is_empty() && input.evidence_items.is_empty() {
            vec![Finding::new(
                self.code(),
                Severity::Fatal,
                "Gate claimed success with zero evidence items; stub pass detected",
            )
            .with_evidence(vec!["evidence_count: 0".to_string()])]
        } else {
            vec![]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_on_gate_pass_with_no_evidence() {
        let detector = StubGateDetector;
        let input = DetectorInput {
            gate_states: vec!["passed".to_string()],
            evidence_items: vec![],
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, "STUB_GATE_PASS");
        assert_eq!(findings[0].severity, Severity::Fatal);
    }

    #[test]
    fn silent_when_evidence_present() {
        let detector = StubGateDetector;
        let input = DetectorInput {
            gate_states: vec!["passed".to_string()],
            evidence_items: vec!["evidence_1".to_string()],
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }

    #[test]
    fn silent_when_no_gates() {
        let detector = StubGateDetector;
        let input = DetectorInput {
            gate_states: vec![],
            evidence_items: vec![],
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }
}
