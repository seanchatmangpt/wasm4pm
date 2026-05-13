//! Detector: executor and verifier are not actually independent.
//!
//! Three independent failure modes:
//! 1. Same public key used by executor and verifier.
//! 2. Signing time skew below 5 seconds (verifier could not have done
//!    independent work in that window).
//! 3. Verifier attestation chain descends from executor identity.

use crate::autosystems::findings::{Detector, Finding, Severity};
use crate::evidence::EvidenceSource;
use crate::observability::emit_detector_span;
use std::time::Duration;

const MIN_INDEPENDENT_SKEW: Duration = Duration::from_secs(5);

/// Fires on any of the three independence-violation conditions.
pub struct SelfCertifyDetector;

impl Detector for SelfCertifyDetector {
    fn code(&self) -> &'static str {
        "AGENT_SELF_CERTIFIES"
    }

    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        let mut findings = vec![];

        if let (Some(e), Some(v)) = (src.executor_pubkey(), src.verifier_pubkey()) {
            if e == v {
                findings.push(
                    Finding::new(
                        self.code(),
                        Severity::Fatal,
                        "Executor and verifier share a public key",
                    )
                    .with_evidence(vec!["pubkey_match=true".to_string()]),
                );
            }
        }

        if let Some(skew) = src.signing_time_skew() {
            if skew < MIN_INDEPENDENT_SKEW {
                findings.push(
                    Finding::new(
                        self.code(),
                        Severity::Fatal,
                        format!(
                            "Executor/verifier signing skew {:?} is below independence threshold {:?}",
                            skew, MIN_INDEPENDENT_SKEW
                        ),
                    )
                    .with_evidence(vec![format!("signing_skew_ms={}", skew.as_millis())]),
                );
            }
        }

        if matches!(src.attestation_descends(), Some(true)) {
            findings.push(
                Finding::new(
                    self.code(),
                    Severity::Fatal,
                    "Verifier attestation chain descends from executor identity",
                )
                .with_evidence(vec!["attestation_descends=true".to_string()]),
            );
        }

        emit_detector_span(self.code(), !findings.is_empty(), Severity::Fatal, 0);
        findings
    }
}
