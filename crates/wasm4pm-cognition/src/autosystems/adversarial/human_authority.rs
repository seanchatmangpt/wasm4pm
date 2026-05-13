//! Detector: human prose / LLM projection / mixed text used as authority.

use crate::authority::AuthorityKind;
use crate::autosystems::findings::{Detector, Finding, Severity};
use crate::evidence::EvidenceSource;
use crate::observability::emit_detector_span;

/// Authority slots that must be machine-derived.
const SLOTS: &[&str] = &["primary", "verifier", "witness"];

/// Fires when any monitored slot's classification is not `MachineEvidence`
/// or `Empty`. In particular, `Mixed` triggers — a 64-hex digest sandwiched
/// in human prose does NOT pass.
pub struct HumanAuthorityDetector;

impl Detector for HumanAuthorityDetector {
    fn code(&self) -> &'static str {
        "HUMAN_OUTPUT_USED_AS_AUTHORITY"
    }

    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        let mut findings = vec![];
        for slot in SLOTS {
            match src.authority_text(slot) {
                AuthorityKind::HumanProse | AuthorityKind::LlmProjection | AuthorityKind::Mixed => {
                    findings.push(
                        Finding::new(
                            self.code(),
                            Severity::Error,
                            format!(
                                "Authority slot '{}' contains non-machine text (kind={:?})",
                                slot,
                                src.authority_text(slot)
                            ),
                        )
                        .with_evidence(vec![format!("authority.slot={}", slot)]),
                    );
                }
                AuthorityKind::MachineEvidence | AuthorityKind::Empty => {}
            }
        }
        emit_detector_span(self.code(), !findings.is_empty(), Severity::Error, 0);
        findings
    }
}
