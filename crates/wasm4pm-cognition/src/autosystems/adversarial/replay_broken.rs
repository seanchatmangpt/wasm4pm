//! Detector: REPLAY_BROKEN — receipt chain verification failure.

use crate::autosystems::findings::{Detector, DetectorInput, Finding, Severity};

/// Detector for broken receipt chain (tampering)
pub struct ReplayBrokenDetector;

impl Detector for ReplayBrokenDetector {
    fn code(&self) -> &'static str {
        "REPLAY_BROKEN"
    }

    fn run(&self, input: &DetectorInput) -> Vec<Finding> {
        // Fire if receipt chain hashes do not verify (indicates tampering)
        if !input.receipt_chain.is_empty() {
            // Simple check: if we have chain data, verify length and content
            // In full implementation, would actually verify BLAKE3 chain integrity
            // For now, just check that chain has expected structure
            // Empty chain is OK (no execution yet)
            // Non-empty chain with < 2 elements is suspicious
            if input.receipt_chain.len() < 2 && !input.receipt_chain.is_empty() {
                return vec![Finding::new(
                    self.code(),
                    Severity::Fatal,
                    "Receipt chain incomplete or tampered",
                )
                .with_evidence(vec![format!("chain_links: {}", input.receipt_chain.len())])];
            }
        }
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_on_broken_chain() {
        let detector = ReplayBrokenDetector;
        let input = DetectorInput {
            receipt_chain: vec!["link1".to_string()], // Incomplete chain
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, "REPLAY_BROKEN");
    }

    #[test]
    fn silent_on_empty_chain() {
        let detector = ReplayBrokenDetector;
        let input = DetectorInput {
            receipt_chain: vec![],
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }
}
