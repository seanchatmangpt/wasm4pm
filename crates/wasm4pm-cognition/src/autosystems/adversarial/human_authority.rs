//! Detector for human-written text used as decision authority.
//!
//! Fires when human prose or LLM-generated projections are used as the
//! source of truth for manufacturing decisions. Authority must be verifiable
//! runtime evidence.

use crate::autosystems::findings::{Detector, DetectorInput, Finding, Severity};

/// Detects human prose or LLM projections used as authority.
pub struct HumanAuthorityDetector;

impl Detector for HumanAuthorityDetector {
    fn code(&self) -> &'static str {
        "HUMAN_OUTPUT_USED_AS_AUTHORITY"
    }

    fn run(&self, input: &DetectorInput) -> Vec<Finding> {
        if input.human_text_in_authority {
            return vec![Finding::new(
                self.code(),
                Severity::Error,
                "Human-written text or LLM projection detected in authority source; manufacturing authority must be runtime-verifiable evidence",
            )
            .with_evidence(vec!["human_text_in_authority: true".to_string()])];
        }

        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_when_human_text_is_authority() {
        let detector = HumanAuthorityDetector;
        let input = DetectorInput {
            human_text_in_authority: true,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, "HUMAN_OUTPUT_USED_AS_AUTHORITY");
        assert_eq!(findings[0].severity, Severity::Error);
    }

    #[test]
    fn silent_when_human_text_not_authority() {
        let detector = HumanAuthorityDetector;
        let input = DetectorInput {
            human_text_in_authority: false,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }
}
