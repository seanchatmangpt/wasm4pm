//! Detector: gate passed but no digest-bearing artifacts present.

use crate::autosystems::findings::{Detector, Finding, Severity};
use crate::evidence::EvidenceSource;
use crate::observability::emit_detector_span;

/// Fires when any gate has `gate_passed && evidence_count == 0`.
pub struct StubGateDetector;

impl Detector for StubGateDetector {
    fn code(&self) -> &'static str {
        "STUB_GATE_PASS"
    }

    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        let mut findings = vec![];
        let mut total_ev = 0usize;
        for gate in src.gate_ids() {
            let passed = src.gate_passed(&gate);
            let count = src.evidence_count(&gate);
            total_ev += count;
            if passed && count == 0 {
                findings.push(
                    Finding::new(
                        self.code(),
                        Severity::Fatal,
                        format!(
                            "Gate '{}' marked passed but no digest-bearing evidence is recorded",
                            gate
                        ),
                    )
                    .with_evidence(vec![format!("gate.id={};evidence_count=0", gate)]),
                );
            }
        }
        emit_detector_span(self.code(), !findings.is_empty(), Severity::Fatal, total_ev);
        findings
    }
}
