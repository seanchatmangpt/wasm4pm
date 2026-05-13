//! Detector: receipt chain fails verification, or its Merkle root does
//! not match an externally anchored expected root.

use crate::autosystems::findings::{Detector, Finding, Severity};
use crate::evidence::EvidenceSource;
use crate::observability::emit_detector_span;

/// Fires on either local chain-verification failure or external-root mismatch.
pub struct ReplayBrokenDetector;

impl Detector for ReplayBrokenDetector {
    fn code(&self) -> &'static str {
        "REPLAY_BROKEN"
    }

    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        let mut findings = vec![];
        let chain = src.receipt_chain();
        if !chain.verify_chain() {
            findings.push(
                Finding::new(
                    self.code(),
                    Severity::Fatal,
                    "Local receipt chain failed BLAKE3 verification",
                )
                .with_evidence(vec!["chain.verify=false".to_string()]),
            );
        }
        if let Some(expected) = src.external_chain_root() {
            let actual = chain.merkle_root_bytes();
            if actual != expected {
                findings.push(
                    Finding::new(
                        self.code(),
                        Severity::Fatal,
                        "Receipt chain Merkle root does not match externally anchored root",
                    )
                    .with_evidence(vec![
                        format!("actual_root={}", hex::encode(actual)),
                        format!("expected_root={}", hex::encode(expected)),
                    ]),
                );
            }
        }
        emit_detector_span(self.code(), !findings.is_empty(), Severity::Fatal, 0);
        findings
    }
}
