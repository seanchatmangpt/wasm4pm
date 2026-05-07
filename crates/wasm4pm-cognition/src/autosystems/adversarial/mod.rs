//! 8 adversarial detectors for false-pass gate detection. Each detector
//! reads from a `&dyn EvidenceSource`; none trust caller-supplied flags.

pub mod bench_missing;
pub mod central_firehose;
pub mod human_authority;
pub mod missing_evidence;
pub mod repair_weakens;
pub mod replay_broken;
pub mod self_certify;
pub mod stub_gate;

pub use crate::autosystems::findings::{Detector, Finding, FindingRegistry, Severity};
