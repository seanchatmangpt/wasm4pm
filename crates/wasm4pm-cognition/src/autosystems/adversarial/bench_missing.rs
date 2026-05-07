//! Detector: no machine-readable benchmark verdict for a target.

use crate::autosystems::findings::{Detector, Finding, Severity};
use crate::evidence::EvidenceSource;
use crate::observability::emit_detector_span;

/// Fires when [`EvidenceSource::benchmark_verdict`] returns `None` for any
/// configured target. Unparseable outcomes (e.g. `"maybe"`) become `None`
/// inside the source, which fires this detector — that is the intended
/// behavior.
pub struct BenchMissingDetector {
    targets: Vec<String>,
}

impl Default for BenchMissingDetector {
    fn default() -> Self {
        Self {
            targets: vec!["primary".to_string()],
        }
    }
}

impl BenchMissingDetector {
    /// Construct with explicit target list.
    pub fn for_targets(targets: Vec<String>) -> Self {
        Self { targets }
    }
}

impl Detector for BenchMissingDetector {
    fn code(&self) -> &'static str {
        "BENCHMARK_EXPECTATION_MISSING"
    }

    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        let mut findings = vec![];
        for t in &self.targets {
            if src.benchmark_verdict(t).is_none() {
                findings.push(
                    Finding::new(
                        self.code(),
                        Severity::Warning,
                        format!(
                            "No machine-readable benchmark verdict for target '{}'",
                            t
                        ),
                    )
                    .with_evidence(vec![format!("benchmark.target={}", t)]),
                );
            }
        }
        emit_detector_span(self.code(), !findings.is_empty(), Severity::Warning, 0);
        findings
    }
}
