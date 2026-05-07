//! Detector: gate passed but `runtime_proof_artifacts` is empty.

use crate::autosystems::findings::{Detector, Finding, Severity};
use crate::evidence::EvidenceSource;
use crate::observability::emit_detector_span;

/// Fires when a gate is reported as passed but no runtime artifact carries
/// a digest. A bare `has_runtime_proof: true` flag is NOT enough.
pub struct MissingEvidenceDetector;

impl Detector for MissingEvidenceDetector {
    fn code(&self) -> &'static str {
        "MISSING_RUNTIME_EVIDENCE"
    }

    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        let mut findings = vec![];
        let mut total = 0usize;
        for gate in src.gate_ids() {
            if !src.gate_passed(&gate) {
                continue;
            }
            let arts = src.runtime_proof_artifacts(&gate);
            total += arts.len();
            if arts.is_empty() {
                findings.push(
                    Finding::new(
                        self.code(),
                        Severity::Fatal,
                        format!(
                            "Gate '{}' passed but no runtime-proof artifacts with digests were observed",
                            gate
                        ),
                    )
                    .with_evidence(vec![format!("gate.id={};runtime_artifacts=0", gate)]),
                );
            }
        }
        emit_detector_span(self.code(), !findings.is_empty(), Severity::Fatal, total);
        findings
    }
}
