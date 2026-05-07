//! Detector for gates that pass without runtime proof.
//!
//! Fires when any gate reports success but runtime evidence is absent.
//! Runtime proof means actual execution traces, OTEL spans, or artifact evidence.

use crate::autosystems::findings::{Detector, DetectorInput, Finding, Severity};

/// Detects gates that pass without runtime evidence.
pub struct MissingEvidenceDetector;

impl Detector for MissingEvidenceDetector {
    fn code(&self) -> &'static str {
        "MISSING_RUNTIME_EVIDENCE"
    }

    fn run(&self, input: &DetectorInput) -> Vec<Finding> {
        // Fire if gates exist (passed), but no runtime proof was collected
        if !input.gate_states.is_empty() && !input.has_runtime_proof {
            return vec![Finding::new(
                self.code(),
                Severity::Fatal,
                "Gate passed but no runtime proof collected; manufacturing requires machine-verifiable evidence",
            )
            .with_evidence(vec!["has_runtime_proof: false".to_string()])];
        }

        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_on_gate_pass_without_runtime_proof() {
        let detector = MissingEvidenceDetector;
        let input = DetectorInput {
            gate_states: vec!["passed".to_string()],
            has_runtime_proof: false,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, "MISSING_RUNTIME_EVIDENCE");
        assert_eq!(findings[0].severity, Severity::Fatal);
    }

    #[test]
    fn silent_when_runtime_proof_present() {
        let detector = MissingEvidenceDetector;
        let input = DetectorInput {
            gate_states: vec!["passed".to_string()],
            has_runtime_proof: true,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }

    #[test]
    fn silent_when_no_gates() {
        let detector = MissingEvidenceDetector;
        let input = DetectorInput {
            gate_states: vec![],
            has_runtime_proof: false,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }
}
