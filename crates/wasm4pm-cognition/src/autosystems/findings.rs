//! Finding detectors: 8 adversarial gate checks.

use crate::autosystems::receipt::ReceiptChain;
use serde::{Deserialize, Serialize};

/// Finding severity level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Severity {
    /// Informational
    Info,
    /// Warning
    Warning,
    /// Error
    Error,
    /// Fatal
    Fatal,
}

/// A finding raised by a detector.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    /// Detector code (e.g., "STUB_GATE_PASS")
    pub code: String,
    /// Severity level
    pub severity: Severity,
    /// Message
    pub message: String,
    /// Evidence items
    pub evidence: Vec<String>,
}

/// Input to detector functions.
#[derive(Debug, Clone, Default)]
pub struct DetectorInput {
    /// Gate execution states
    pub gate_states: Vec<(String, bool, usize)>,
    /// Evidence items
    pub evidence_items: Vec<String>,
    /// Executor agent ID
    pub executor_id: String,
    /// Verifier agent ID
    pub verifier_id: String,
    /// Receipt chain for replay verification
    pub receipt_chain: ReceiptChain,
    /// Prior threshold for repair comparison
    pub prior_threshold: Option<f64>,
    /// Current threshold for repair comparison
    pub current_threshold: Option<f64>,
    /// Whether runtime proof exists
    pub has_runtime_proof: bool,
    /// Whether human text was used as authority
    pub human_text_in_authority: bool,
    /// Whether central event bus is present
    pub central_event_bus_present: bool,
    /// Expected benchmark verdict
    pub benchmark_expected_verdict: Option<String>,
}

/// Trait for detectors.
pub trait Detector: Send + Sync {
    /// Run the detector; return None if clean, Some(Finding) if violation.
    fn detect(&self, input: &DetectorInput) -> Option<Finding>;
}

/// Registry of all 8 detectors.
pub struct FindingRegistry {
    detectors: Vec<Box<dyn Detector>>,
}

impl FindingRegistry {
    /// Create a new registry with all 8 detectors.
    pub fn new() -> Self {
        let detectors: Vec<Box<dyn Detector>> = vec![
            Box::new(StubGateDetector),
            Box::new(HumanAuthorityDetector),
            Box::new(MissingEvidenceDetector),
            Box::new(CentralFirehoseDetector),
            Box::new(SelfCertifyDetector),
            Box::new(BenchMissingDetector),
            Box::new(RepairWeakensDetector),
            Box::new(ReplayBrokenDetector),
        ];

        FindingRegistry { detectors }
    }

    /// Run all detectors; return all findings (if any).
    pub fn run_all(&self, input: &DetectorInput) -> Vec<Finding> {
        self.detectors
            .iter()
            .filter_map(|d| d.detect(input))
            .collect()
    }
}

impl Default for FindingRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Detector 1: STUB_GATE_PASS
struct StubGateDetector;
impl Detector for StubGateDetector {
    fn detect(&self, input: &DetectorInput) -> Option<Finding> {
        for (name, passed, evidence_count) in &input.gate_states {
            if *passed && evidence_count == &0 {
                return Some(Finding {
                    code: "STUB_GATE_PASS".to_string(),
                    severity: Severity::Fatal,
                    message: format!("Gate '{}' passed with zero evidence", name),
                    evidence: vec![],
                });
            }
        }
        None
    }
}

/// Detector 2: HUMAN_OUTPUT_USED_AS_AUTHORITY
struct HumanAuthorityDetector;
impl Detector for HumanAuthorityDetector {
    fn detect(&self, input: &DetectorInput) -> Option<Finding> {
        if input.human_text_in_authority {
            return Some(Finding {
                code: "HUMAN_OUTPUT_USED_AS_AUTHORITY".to_string(),
                severity: Severity::Error,
                message: "Human prose used as verification authority".to_string(),
                evidence: input.evidence_items.clone(),
            });
        }
        None
    }
}

/// Detector 3: MISSING_RUNTIME_EVIDENCE
struct MissingEvidenceDetector;
impl Detector for MissingEvidenceDetector {
    fn detect(&self, input: &DetectorInput) -> Option<Finding> {
        if !input.gate_states.is_empty() && !input.has_runtime_proof {
            return Some(Finding {
                code: "MISSING_RUNTIME_EVIDENCE".to_string(),
                severity: Severity::Fatal,
                message: "Gate passed but no runtime proof available".to_string(),
                evidence: input.evidence_items.clone(),
            });
        }
        None
    }
}

/// Detector 4: CENTRAL_EVENT_FIREHOSE_REINTRODUCED
struct CentralFirehoseDetector;
impl Detector for CentralFirehoseDetector {
    fn detect(&self, input: &DetectorInput) -> Option<Finding> {
        if input.central_event_bus_present {
            return Some(Finding {
                code: "CENTRAL_EVENT_FIREHOSE_REINTRODUCED".to_string(),
                severity: Severity::Fatal,
                message: "Central event bus found in architecture".to_string(),
                evidence: vec!["central_event_bus_present=true".to_string()],
            });
        }
        None
    }
}

/// Detector 5: AGENT_SELF_CERTIFIES
struct SelfCertifyDetector;
impl Detector for SelfCertifyDetector {
    fn detect(&self, input: &DetectorInput) -> Option<Finding> {
        if !input.executor_id.is_empty()
            && !input.verifier_id.is_empty()
            && input.executor_id == input.verifier_id
        {
            return Some(Finding {
                code: "AGENT_SELF_CERTIFIES".to_string(),
                severity: Severity::Fatal,
                message: "Executor and verifier are the same agent".to_string(),
                evidence: vec![format!(
                    "executor_id={}, verifier_id={}",
                    input.executor_id, input.verifier_id
                )],
            });
        }
        None
    }
}

/// Detector 6: BENCHMARK_EXPECTATION_MISSING
struct BenchMissingDetector;
impl Detector for BenchMissingDetector {
    fn detect(&self, input: &DetectorInput) -> Option<Finding> {
        if input.benchmark_expected_verdict.is_none() {
            return Some(Finding {
                code: "BENCHMARK_EXPECTATION_MISSING".to_string(),
                severity: Severity::Warning,
                message: "No expected benchmark verdict provided".to_string(),
                evidence: vec![],
            });
        }
        None
    }
}

/// Detector 7: REPAIR_WEAKENS_GATE
struct RepairWeakensDetector;
impl Detector for RepairWeakensDetector {
    fn detect(&self, input: &DetectorInput) -> Option<Finding> {
        if let (Some(prior), Some(current)) = (input.prior_threshold, input.current_threshold) {
            if prior > current {
                return Some(Finding {
                    code: "REPAIR_WEAKENS_GATE".to_string(),
                    severity: Severity::Error,
                    message: "Repair lowered the verification threshold".to_string(),
                    evidence: vec![format!(
                        "prior={}, current={}",
                        prior, current
                    )],
                });
            }
        }
        None
    }
}

/// Detector 8: REPLAY_BROKEN
struct ReplayBrokenDetector;
impl Detector for ReplayBrokenDetector {
    fn detect(&self, input: &DetectorInput) -> Option<Finding> {
        if !input.receipt_chain.verify_chain() {
            return Some(Finding {
                code: "REPLAY_BROKEN".to_string(),
                severity: Severity::Fatal,
                message: "Receipt chain verification failed".to_string(),
                evidence: vec!["chain_verification=failed".to_string()],
            });
        }
        None
    }
}
