//! Detector for centralized event bus re-introduction.
//!
//! Fires when a centralized event firehose is present. The manufacturing
//! architecture requires distributed, object-centric event logging without
//! a single point of event aggregation.

use crate::autosystems::findings::{Detector, DetectorInput, Finding, Severity};

/// Detects presence of a centralized event aggregation system.
pub struct CentralFirehoseDetector;

impl Detector for CentralFirehoseDetector {
    fn code(&self) -> &'static str {
        "CENTRAL_EVENT_FIREHOSE_REINTRODUCED"
    }

    fn run(&self, input: &DetectorInput) -> Vec<Finding> {
        if input.central_event_bus_present {
            return vec![Finding::new(
                self.code(),
                Severity::Fatal,
                "Centralized event aggregation detected; architecture must use distributed, object-centric event logging",
            )
            .with_evidence(vec!["central_event_bus_present: true".to_string()])];
        }

        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_when_central_event_bus_present() {
        let detector = CentralFirehoseDetector;
        let input = DetectorInput {
            central_event_bus_present: true,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, "CENTRAL_EVENT_FIREHOSE_REINTRODUCED");
        assert_eq!(findings[0].severity, Severity::Fatal);
    }

    #[test]
    fn silent_when_distributed_event_logging() {
        let detector = CentralFirehoseDetector;
        let input = DetectorInput {
            central_event_bus_present: false,
            ..Default::default()
        };
        let findings = detector.run(&input);
        assert!(findings.is_empty());
    }
}
