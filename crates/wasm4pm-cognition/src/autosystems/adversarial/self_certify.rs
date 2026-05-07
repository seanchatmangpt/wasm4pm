//! Detector for self-certification (executor = verifier).
//!
//! Fires when the same agent or system verifies its own execution.
//! Verification must involve an independent authority.

use crate::autosystems::findings::{Detector, DetectorInput, Finding, Severity};

/// Detects self-certification (executor verifying its own output).
pub struct SelfCertifyDetector;

impl Detector for SelfCertifyDetector {
    fn code(&self) -> &'static str {
        "AGENT_SELF_CERTIFIES"
    }

    fn run(&self, input: &DetectorInput) -> Vec<Finding> {
        // Fire if executor and verifier are both present and equal
        match (&input.executor_id, &input.verifier_id) {
            (Some(exec), Some(verif)) if !exec.is_empty() && !verif.is_empty() && exec == verif => {
                return vec![Finding::new(
                    self.code(),
                    Severity::Fatal,
                    "Executor and verifier are identical; self-certification is not allowed",
                )
                .with_evidence(vec![format!(
                    "executor_id == verifier_id: '{}'",
                    exec
                )])];
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
    fn fires_when_executor_equals_verifier() {
        let detector = SelfCertifyDetector;
        let input = DetectorInput {
            executor_id: Some("agent_1".to_string()),
            verifier_id: Some("agent_1".to_string()),
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, "AGENT_SELF_CERTIFIES");
        assert_eq!(findings[0].severity, Severity::Fatal);
    }

    #[test]
    fn silent_when_different_verifier() {
        let detector = SelfCertifyDetector;
        let input = DetectorInput {
            executor_id: Some("agent_1".to_string()),
            verifier_id: Some("agent_2".to_string()),
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }

    #[test]
    fn silent_when_ids_missing() {
        let detector = SelfCertifyDetector;
        let input = DetectorInput {
            executor_id: None,
            verifier_id: None,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }
}
