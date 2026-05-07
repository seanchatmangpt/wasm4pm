//! Detector: a centralized event aggregation point exists.

use crate::autosystems::findings::{Detector, Finding, Severity};
use crate::evidence::EvidenceSource;
use crate::observability::emit_detector_span;

/// Fires whenever the evidence source reports a central bus.
pub struct CentralFirehoseDetector;

impl Detector for CentralFirehoseDetector {
    fn code(&self) -> &'static str {
        "CENTRAL_EVENT_FIREHOSE_REINTRODUCED"
    }

    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        let firing = src.central_bus_present();
        let findings = if firing {
            vec![Finding::new(
                self.code(),
                Severity::Fatal,
                "Centralized event aggregation detected (bus.kind=central or known central messaging system)",
            )
            .with_evidence(vec!["central_bus_present=true".to_string()])]
        } else {
            vec![]
        };
        emit_detector_span(self.code(), firing, Severity::Fatal, 0);
        findings
    }
}
