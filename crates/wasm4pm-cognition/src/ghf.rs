#![allow(missing_docs)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum RefusalState8 {
    ReceiptSchemaInvalid,
    HashBindingFailed,
    BoundaryEvidenceMissing,
    PolicyConformanceFailed,
    OCELAlignmentFailed,
    ReplayFailed,
    FleetDriftDetected,
    TemporalConformanceFailed,
    ExternalVerificationFailed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ValidationResult {
    Pass,
    Refuse(RefusalState8, String),
}

impl ValidationResult {
    pub fn is_pass(&self) -> bool {
        matches!(self, ValidationResult::Pass)
    }
}

pub fn check_receipt_schema(valid: bool) -> ValidationResult {
    if valid { ValidationResult::Pass } else { ValidationResult::Refuse(RefusalState8::ReceiptSchemaInvalid, "invalid schema".into()) }
}

pub fn check_hash_binding(valid: bool) -> ValidationResult {
    if valid { ValidationResult::Pass } else { ValidationResult::Refuse(RefusalState8::HashBindingFailed, "hash mismatch".into()) }
}

pub fn check_boundary_evidence(valid: bool) -> ValidationResult {
    if valid { ValidationResult::Pass } else { ValidationResult::Refuse(RefusalState8::BoundaryEvidenceMissing, "missing evidence".into()) }
}

pub fn check_policy_conformance(valid: bool) -> ValidationResult {
    if valid { ValidationResult::Pass } else { ValidationResult::Refuse(RefusalState8::PolicyConformanceFailed, "policy failed".into()) }
}

pub fn check_ocel_alignment(valid: bool) -> ValidationResult {
    if valid { ValidationResult::Pass } else { ValidationResult::Refuse(RefusalState8::OCELAlignmentFailed, "ocel alignment failed".into()) }
}

pub fn check_replay(valid: bool) -> ValidationResult {
    if valid { ValidationResult::Pass } else { ValidationResult::Refuse(RefusalState8::ReplayFailed, "replay failed".into()) }
}

pub fn check_fleet_drift() -> ValidationResult {
    if !std::path::Path::new("SECURITY.md").exists() && !std::path::Path::new("../../SECURITY.md").exists() {
        ValidationResult::Refuse(RefusalState8::FleetDriftDetected, "SECURITY.md missing".into())
    } else {
        ValidationResult::Pass
    }
}

pub fn check_temporal_conformance(valid: bool) -> ValidationResult {
    if valid { ValidationResult::Pass } else { ValidationResult::Refuse(RefusalState8::TemporalConformanceFailed, "temporal check failed".into()) }
}

pub fn check_external_verification(valid: bool) -> ValidationResult {
    if valid { ValidationResult::Pass } else { ValidationResult::Refuse(RefusalState8::ExternalVerificationFailed, "external verify failed".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_refuses_receipt_schema_invalid() {
        assert_eq!(check_receipt_schema(false), ValidationResult::Refuse(RefusalState8::ReceiptSchemaInvalid, "invalid schema".into()));
    }

    #[test]
    fn test_refuses_hash_binding_failed() {
        assert_eq!(check_hash_binding(false), ValidationResult::Refuse(RefusalState8::HashBindingFailed, "hash mismatch".into()));
    }

    #[test]
    fn test_refuses_boundary_evidence_missing() {
        assert_eq!(check_boundary_evidence(false), ValidationResult::Refuse(RefusalState8::BoundaryEvidenceMissing, "missing evidence".into()));
    }

    #[test]
    fn test_refuses_policy_conformance_failed() {
        assert_eq!(check_policy_conformance(false), ValidationResult::Refuse(RefusalState8::PolicyConformanceFailed, "policy failed".into()));
    }

    #[test]
    fn test_refuses_ocel_alignment_failed() {
        assert_eq!(check_ocel_alignment(false), ValidationResult::Refuse(RefusalState8::OCELAlignmentFailed, "ocel alignment failed".into()));
    }

    #[test]
    fn test_refuses_replay_failed() {
        assert_eq!(check_replay(false), ValidationResult::Refuse(RefusalState8::ReplayFailed, "replay failed".into()));
    }

    #[test]
    fn test_refuses_temporal_conformance_failed() {
        assert_eq!(check_temporal_conformance(false), ValidationResult::Refuse(RefusalState8::TemporalConformanceFailed, "temporal check failed".into()));
    }

    #[test]
    fn test_refuses_external_verification_failed() {
        assert_eq!(check_external_verification(false), ValidationResult::Refuse(RefusalState8::ExternalVerificationFailed, "external verify failed".into()));
    }
}
