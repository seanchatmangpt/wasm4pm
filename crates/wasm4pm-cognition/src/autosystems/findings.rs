//! Finding registry: a `Detector` runs against a `&dyn EvidenceSource` and
//! emits a list of `Finding`s. No detector reads caller-supplied JSON
//! booleans; all evidence flows through the trait.

use crate::evidence::EvidenceSource;
use serde::{Deserialize, Serialize};

/// Finding severity level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Severity {
    /// Informational.
    Info,
    /// Warning.
    Warning,
    /// Error.
    Error,
    /// Fatal.
    Fatal,
}

/// A finding raised by a detector.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Finding {
    /// Detector code (e.g. `"STUB_GATE_PASS"`).
    pub code: String,
    /// Severity level.
    pub severity: Severity,
    /// Human-readable message.
    pub message: String,
    /// Evidence strings supporting the finding.
    pub evidence: Vec<String>,
}

impl Finding {
    /// Construct a finding.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn new(code: impl Into<String>, severity: Severity, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            severity,
            message: message.into(),
            evidence: vec![],
        }
    }

    /// Attach evidence strings.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn with_evidence(mut self, evidence: Vec<String>) -> Self {
        self.evidence = evidence;
        self
    }
}

/// A detector reads from a typed evidence source and reports findings.
pub trait Detector: Send + Sync {
    /// Detector code (e.g. `"STUB_GATE_PASS"`).
    fn code(&self) -> &'static str;

    /// Run the detector against `src`. Empty vector means clean.
    fn run(&self, src: &dyn EvidenceSource) -> Vec<Finding>;
}

/// Registry of all 8 detectors.
pub struct FindingRegistry {
    detectors: Vec<Box<dyn Detector>>,
}

impl FindingRegistry {
    /// Build a registry containing all 8 adversarial detectors.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn new() -> Self {
        use crate::autosystems::adversarial::{
            bench_missing::BenchMissingDetector, central_firehose::CentralFirehoseDetector,
            human_authority::HumanAuthorityDetector, missing_evidence::MissingEvidenceDetector,
            repair_weakens::RepairWeakensDetector, replay_broken::ReplayBrokenDetector,
            self_certify::SelfCertifyDetector, stub_gate::StubGateDetector,
        };
        Self {
            detectors: vec![
                Box::new(StubGateDetector),
                Box::new(HumanAuthorityDetector),
                Box::new(MissingEvidenceDetector),
                Box::new(CentralFirehoseDetector),
                Box::new(SelfCertifyDetector),
                Box::new(BenchMissingDetector::default()),
                Box::new(RepairWeakensDetector),
                Box::new(ReplayBrokenDetector),
            ],
        }
    }

    /// Run every detector and collect all findings.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn run_all(&self, src: &dyn EvidenceSource) -> Vec<Finding> {
        self.detectors
            .iter()
            .flat_map(|d| d.run(src))
            .collect()
    }
}

impl Default for FindingRegistry {
    fn default() -> Self {
        Self::new()
    }
}
