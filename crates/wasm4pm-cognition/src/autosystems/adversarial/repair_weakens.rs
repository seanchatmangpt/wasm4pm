//! Detector: current threshold is weaker than the strongest prior.
//!
//! The naive "compare current to immediately-prior" check fails on
//! oscillating histories. Compare current to the maximum prior value.

use crate::autosystems::findings::{Detector, Finding, Severity};
use crate::evidence::EvidenceSource;
use crate::observability::emit_detector_span;

/// Fires when `current < max(prior_history)`.
pub struct RepairWeakensDetector;

impl Detector for RepairWeakensDetector {
    fn code(&self) -> &'static str {
        "REPAIR_WEAKENS_GATE"
    }

    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        let mut findings = vec![];
        for gate in src.gate_ids() {
            let history = src.threshold_history(&gate);
            if history.len() < 2 {
                continue;
            }
            // infallible: guarded by `if history.len() < 2 { continue }` above.
            let current = *history.last().expect("history.len() >= 2");
            let prior = &history[..history.len() - 1];
            let max_prior = prior
                .iter()
                .copied()
                .fold(f64::MIN, f64::max);
            if current < max_prior {
                findings.push(
                    Finding::new(
                        self.code(),
                        Severity::Error,
                        format!(
                            "Gate '{}' threshold weakened: current={} < max_prior={}",
                            gate, current, max_prior
                        ),
                    )
                    .with_evidence(vec![
                        format!("gate.id={}", gate),
                        format!("current={}", current),
                        format!("max_prior={}", max_prior),
                    ]),
                );
            }
        }
        emit_detector_span(self.code(), !findings.is_empty(), Severity::Error, 0);
        findings
    }
}
