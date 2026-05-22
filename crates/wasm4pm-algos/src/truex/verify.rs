use crate::truex::canonicalize::canonical_stringify;
use serde_json::Value;

#[derive(Debug, PartialEq, Eq)]
pub enum VerificationResult {
    ReceiptAdmitted,
    ReceiptForged,
    ReceiptLaundered,
    BoundaryMissing,
    SummaryOnlyProof,
    CanonicalizationMismatch,
    ReplayDetected,
    InvalidTransition,
    IncompletePath,
    VerifierMismatch,
}

pub fn verify_receipt(envelope: &Value) -> (VerificationResult, String, String) {
    let session_id = envelope.get("session_id").and_then(|v| v.as_str()).unwrap_or("");
    let expected_path_hash = envelope.get("expected_path_hash").and_then(|v| v.as_str()).unwrap_or("");
    let ocel2_batch_hash = envelope.get("ocel2_batch_hash").and_then(|v| v.as_str()).unwrap_or("");
    let receipt_hash = envelope.get("receipt_hash").and_then(|v| v.as_str()).unwrap_or("");
    let admission_status = envelope.get("admission_status").and_then(|v| v.as_str()).unwrap_or("");
    
    let ocel2 = match envelope.get("ocel2") {
        Some(val) => val,
        None => return (VerificationResult::BoundaryMissing, "".to_string(), "".to_string()),
    };

    // Step 1: Recompute OCEL 2.0 Canonical Batch Hash using BLAKE3
    let canonical_ocel2 = canonical_stringify(ocel2);
    let computed_batch_hash = blake3::hash(canonical_ocel2.as_bytes()).to_hex().to_string();

    if computed_batch_hash != ocel2_batch_hash {
        return (VerificationResult::ReceiptForged, computed_batch_hash, "".to_string());
    }

    // Step 2: Recompute Receipt Admission Signature using BLAKE3
    let receipt_seed = format!("{}:{}:{}", session_id, computed_batch_hash, expected_path_hash);
    let computed_receipt_hash = blake3::hash(receipt_seed.as_bytes()).to_hex().to_string();

    if computed_receipt_hash != receipt_hash {
        return (VerificationResult::ReceiptForged, computed_batch_hash, computed_receipt_hash);
    }

    if admission_status == "ReceiptAdmitted" {
        (VerificationResult::ReceiptAdmitted, computed_batch_hash, computed_receipt_hash)
    } else {
        (VerificationResult::InvalidTransition, computed_batch_hash, computed_receipt_hash)
    }
}
