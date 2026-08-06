//! Receipt-bound admission of MFW universal-planning candidates.
//!
//! MFW constructs candidate plans. This module validates exact source pins,
//! canonical SHA-256 digests, authority, consequence, receipt, and replay. It
//! does not actuate a plan. Invalid input always produces a typed refusal
//! receipt rather than a bare error.

use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

pub const MFW_INTEROP_SCHEMA: &str = "chatman.mfw-wasm4pm.planning.v1";
pub const MFW_INTEROP_RECEIPT_SCHEMA: &str = "chatman.mfw-wasm4pm.receipt.v1";
pub const WASM4PM_ADMISSION_SCHEMA: &str = "chatman.wasm4pm.mfw-admission.v1";

#[derive(Debug, Clone, Serialize)]
pub struct MfwInteropAdmission {
    pub schema: &'static str,
    pub admitted: bool,
    pub standing: String,
    pub refusal_reason: Option<String>,
    pub mfw_revision: String,
    pub wasm4pm_revision: String,
    pub request_sha256: Option<String>,
    pub result_sha256: Option<String>,
    pub candidate: Option<Value>,
    pub authority: Value,
    pub replay_operation: String,
    pub receipt_sha256: String,
}

#[derive(Serialize)]
struct AdmissionCore<'a> {
    schema: &'static str,
    admitted: bool,
    standing: &'a str,
    refusal_reason: &'a Option<String>,
    mfw_revision: &'a str,
    wasm4pm_revision: &'a str,
    request_sha256: &'a Option<String>,
    result_sha256: &'a Option<String>,
    candidate: &'a Option<Value>,
    authority: &'a Value,
    replay_operation: &'a str,
}

fn sorted_value(value: &Value) -> Value {
    match value {
        Value::Object(object) => {
            let mut keys: Vec<&String> = object.keys().collect();
            keys.sort_unstable();
            let mut sorted = Map::new();
            for key in keys {
                sorted.insert(key.clone(), sorted_value(&object[key]));
            }
            Value::Object(sorted)
        }
        Value::Array(values) => Value::Array(values.iter().map(sorted_value).collect()),
        other => other.clone(),
    }
}

fn sha256_json(value: &Value) -> String {
    let canonical =
        serde_json::to_vec(&sorted_value(value)).expect("JSON values are serializable");
    let digest = Sha256::digest(canonical);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn sha256_serializable<T: Serialize>(value: &T) -> String {
    let json = serde_json::to_value(value).expect("receipt values are serializable");
    sha256_json(&json)
}

fn is_exact_sha(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn valid_standing(value: &str) -> bool {
    matches!(
        value,
        "UNKNOWN"
            | "PARTIAL_ALIVE"
            | "ALIVE"
            | "BLOCKED"
            | "BUILD_BROKEN"
            | "UNSUPPORTED"
    ) || value
        .strip_prefix("REFUSED:")
        .is_some_and(|reason| !reason.is_empty())
}

fn expected_authority() -> Value {
    serde_json::json!({"actuation": "none", "class": "candidate"})
}

fn refused(
    reason: &str,
    detail: impl Into<String>,
    mfw_revision: &str,
    wasm4pm_revision: &str,
) -> MfwInteropAdmission {
    let refusal_reason = Some(detail.into());
    let standing = format!("REFUSED:{reason}");
    let authority = expected_authority();
    let request_sha256 = None;
    let result_sha256 = None;
    let candidate = None;
    let replay_operation = "admit_mfw_candidate".to_string();
    let core = AdmissionCore {
        schema: WASM4PM_ADMISSION_SCHEMA,
        admitted: false,
        standing: &standing,
        refusal_reason: &refusal_reason,
        mfw_revision,
        wasm4pm_revision,
        request_sha256: &request_sha256,
        result_sha256: &result_sha256,
        candidate: &candidate,
        authority: &authority,
        replay_operation: &replay_operation,
    };
    MfwInteropAdmission {
        schema: WASM4PM_ADMISSION_SCHEMA,
        admitted: false,
        standing,
        refusal_reason,
        mfw_revision: mfw_revision.to_string(),
        wasm4pm_revision: wasm4pm_revision.to_string(),
        request_sha256,
        result_sha256,
        candidate,
        authority,
        replay_operation,
        receipt_sha256: sha256_serializable(&core),
    }
}

fn string_field<'a>(object: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    object.get(key).and_then(Value::as_str)
}

/// Admit one exact MFW candidate envelope.
///
/// Structural admission and candidate standing remain separate: a correctly
/// receipted `REFUSED:*` candidate is admitted as evidence while retaining its
/// refusal standing. No plan step is executed by this function.
pub fn admit_mfw_candidate_json(
    input: &str,
    expected_request: &Value,
    expected_mfw_revision: &str,
    expected_wasm4pm_revision: &str,
) -> MfwInteropAdmission {
    if !is_exact_sha(expected_mfw_revision) || !is_exact_sha(expected_wasm4pm_revision) {
        return refused(
            "SOURCE_IDENTITY_INVALID",
            "expected source identities must be exact lowercase 40-character SHAs",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let envelope: Value = match serde_json::from_str(input) {
        Ok(value) => value,
        Err(error) => {
            return refused(
                "INVALID_JSON",
                format!("candidate envelope is not JSON: {error}"),
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    let object = match envelope.as_object() {
        Some(object) => object,
        None => {
            return refused(
                "PAYLOAD_INVALID",
                "candidate envelope must be a JSON object",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    if string_field(object, "schema") != Some(MFW_INTEROP_SCHEMA) {
        return refused(
            "SCHEMA_MISMATCH",
            format!("expected {MFW_INTEROP_SCHEMA}"),
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let standing = match string_field(object, "status") {
        Some(value) if valid_standing(value) => value.to_string(),
        _ => {
            return refused(
                "STANDING_INVALID",
                "candidate standing is not admitted",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    let source = match object.get("source").and_then(Value::as_object) {
        Some(value) => value,
        None => {
            return refused(
                "SOURCE_IDENTITY_MISSING",
                "source object is required",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    let source_matches = string_field(source, "mfw_repository") == Some("seanchatmangpt/mfw")
        && string_field(source, "mfw_revision") == Some(expected_mfw_revision)
        && string_field(source, "wasm4pm_repository") == Some("seanchatmangpt/wasm4pm")
        && string_field(source, "wasm4pm_revision") == Some(expected_wasm4pm_revision);
    if !source_matches {
        return refused(
            "SOURCE_IDENTITY_MISMATCH",
            "candidate source pins do not match the admitted repositories and revisions",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let authority = object.get("authority").cloned().unwrap_or(Value::Null);
    if authority != expected_authority() {
        return refused(
            "AUTHORITY_ESCALATION",
            "MFW interoperability is candidate-only with actuation=none",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let request = match object.get("request") {
        Some(Value::Object(_)) => &object["request"],
        _ => {
            return refused(
                "PAYLOAD_INVALID",
                "request must be a JSON object",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    let result = match object.get("result") {
        Some(Value::Object(_)) => &object["result"],
        _ => {
            return refused(
                "PAYLOAD_INVALID",
                "result must be a JSON object",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    if sorted_value(request) != sorted_value(expected_request) {
        return refused(
            "REQUEST_SUBJECT_MISMATCH",
            "candidate was manufactured for another request",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let request_sha256 = sha256_json(request);
    let result_sha256 = sha256_json(result);
    if string_field(object, "request_sha256") != Some(request_sha256.as_str()) {
        return refused(
            "REQUEST_DIGEST_MISMATCH",
            "request digest does not recompute",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    if string_field(object, "result_sha256") != Some(result_sha256.as_str()) {
        return refused(
            "RESULT_DIGEST_MISMATCH",
            "result digest does not recompute",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let receipt = match object.get("receipt").and_then(Value::as_object) {
        Some(value) => value,
        None => {
            return refused(
                "RECEIPT_MISSING",
                "versioned receipt is required",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    if string_field(receipt, "schema") != Some(MFW_INTEROP_RECEIPT_SCHEMA)
        || string_field(receipt, "standing") != Some(standing.as_str())
        || receipt.get("authority") != Some(&authority)
    {
        return refused(
            "RECEIPT_MISMATCH",
            "receipt schema, standing, or authority does not match the consequence",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let subject = match receipt.get("subject").and_then(Value::as_object) {
        Some(value) => value,
        None => {
            return refused(
                "RECEIPT_SUBJECT_MISSING",
                "receipt subject is required",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    let subject_matches = string_field(subject, "mfw_repository") == Some("seanchatmangpt/mfw")
        && string_field(subject, "mfw_revision") == Some(expected_mfw_revision)
        && string_field(subject, "wasm4pm_repository") == Some("seanchatmangpt/wasm4pm")
        && string_field(subject, "wasm4pm_revision") == Some(expected_wasm4pm_revision)
        && string_field(subject, "request_sha256") == Some(request_sha256.as_str())
        && string_field(subject, "result_sha256") == Some(result_sha256.as_str());
    if !subject_matches {
        return refused(
            "RECEIPT_SUBJECT_MISMATCH",
            "receipt does not bind exact source and payload identities",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let replay = match receipt.get("replay").and_then(Value::as_object) {
        Some(value) => value,
        None => {
            return refused(
                "REPLAY_INVALID",
                "replay object is required",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    if string_field(replay, "operation") != Some("admit_mfw_candidate")
        || string_field(replay, "request_sha256") != Some(request_sha256.as_str())
        || string_field(replay, "result_sha256") != Some(result_sha256.as_str())
    {
        return refused(
            "REPLAY_INVALID",
            "replay must re-enter exact receipt-bound admission",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }
    let mut receipt_core = receipt.clone();
    let receipt_sha256 = match receipt_core
        .remove("receipt_sha256")
        .and_then(|value| value.as_str().map(str::to_string))
    {
        Some(value) => value,
        None => {
            return refused(
                "RECEIPT_DIGEST_MISSING",
                "receipt digest is required",
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        }
    };
    if sha256_json(&Value::Object(receipt_core)) != receipt_sha256 {
        return refused(
            "RECEIPT_DIGEST_MISMATCH",
            "receipt digest does not recompute",
            expected_mfw_revision,
            expected_wasm4pm_revision,
        );
    }

    let request_sha256 = Some(request_sha256);
    let result_sha256 = Some(result_sha256);
    let candidate = Some(result.clone());
    let refusal_reason = None;
    let replay_operation = "admit_mfw_candidate".to_string();
    let core = AdmissionCore {
        schema: WASM4PM_ADMISSION_SCHEMA,
        admitted: true,
        standing: &standing,
        refusal_reason: &refusal_reason,
        mfw_revision: expected_mfw_revision,
        wasm4pm_revision: expected_wasm4pm_revision,
        request_sha256: &request_sha256,
        result_sha256: &result_sha256,
        candidate: &candidate,
        authority: &authority,
        replay_operation: &replay_operation,
    };
    MfwInteropAdmission {
        schema: WASM4PM_ADMISSION_SCHEMA,
        admitted: true,
        standing,
        refusal_reason,
        mfw_revision: expected_mfw_revision.to_string(),
        wasm4pm_revision: expected_wasm4pm_revision.to_string(),
        request_sha256,
        result_sha256,
        candidate,
        authority,
        replay_operation,
        receipt_sha256: sha256_serializable(&core),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MFW_SHA: &str = "e4fbda46f13d8213b86aa4f981d2387638983066";
    const WASM_SHA: &str = "44f1bca8ff8cb05b1d8f5561c20c827e33d2b5fd";

    fn request() -> Value {
        serde_json::json!({
            "planning_type": "classical",
            "problem": {"id": "tiny"},
            "schema": "mfw.universal-planning.v1"
        })
    }

    fn envelope(status: &str) -> Value {
        let request = request();
        let result = serde_json::json!({
            "ok": status == "ALIVE",
            "oracle": "mfw-python-v1",
            "result": {"plan": ["move-a-b"], "planning_type": "classical"}
        });
        let request_sha256 = sha256_json(&request);
        let result_sha256 = sha256_json(&result);
        let source = serde_json::json!({
            "mfw_repository": "seanchatmangpt/mfw",
            "mfw_revision": MFW_SHA,
            "wasm4pm_repository": "seanchatmangpt/wasm4pm",
            "wasm4pm_revision": WASM_SHA
        });
        let authority = expected_authority();
        let subject = serde_json::json!({
            "mfw_repository": "seanchatmangpt/mfw",
            "mfw_revision": MFW_SHA,
            "wasm4pm_repository": "seanchatmangpt/wasm4pm",
            "wasm4pm_revision": WASM_SHA,
            "request_sha256": request_sha256,
            "result_sha256": result_sha256
        });
        let receipt_core = serde_json::json!({
            "schema": MFW_INTEROP_RECEIPT_SCHEMA,
            "subject": subject,
            "authority": authority,
            "standing": status,
            "replay": {
                "operation": "admit_mfw_candidate",
                "request_sha256": request_sha256,
                "result_sha256": result_sha256
            }
        });
        let mut receipt = receipt_core.as_object().unwrap().clone();
        receipt.insert(
            "receipt_sha256".to_string(),
            Value::String(sha256_json(&receipt_core)),
        );
        serde_json::json!({
            "schema": MFW_INTEROP_SCHEMA,
            "status": status,
            "source": source.clone(),
            "authority": authority.clone(),
            "request": request.clone(),
            "request_sha256": request_sha256.clone(),
            "result": result.clone(),
            "result_sha256": result_sha256.clone(),
            "receipt": receipt
        })
    }

    #[test]
    fn admits_exact_candidate_without_actuation() {
        let value = envelope("ALIVE");
        let admission =
            admit_mfw_candidate_json(&value.to_string(), &request(), MFW_SHA, WASM_SHA);
        assert!(admission.admitted, "{:?}", admission.refusal_reason);
        assert_eq!(admission.standing, "ALIVE");
        assert_eq!(admission.authority, expected_authority());
        assert!(admission.candidate.is_some());
    }

    #[test]
    fn admits_typed_candidate_refusal_as_evidence() {
        let value = envelope("REFUSED:SEARCH_LIMIT_EXHAUSTED");
        let admission =
            admit_mfw_candidate_json(&value.to_string(), &request(), MFW_SHA, WASM_SHA);
        assert!(admission.admitted, "{:?}", admission.refusal_reason);
        assert_eq!(admission.standing, "REFUSED:SEARCH_LIMIT_EXHAUSTED");
    }

    #[test]
    fn receipt_is_emitted_for_digest_drift() {
        let mut value = envelope("ALIVE");
        value["result"]["result"]["plan"] = serde_json::json!(["tampered"]);
        let admission =
            admit_mfw_candidate_json(&value.to_string(), &request(), MFW_SHA, WASM_SHA);
        assert!(!admission.admitted);
        assert_eq!(admission.standing, "REFUSED:RESULT_DIGEST_MISMATCH");
        assert!(!admission.receipt_sha256.is_empty());
    }

    #[test]
    fn authority_escalation_is_typed_and_receipted() {
        let mut value = envelope("ALIVE");
        value["authority"] =
            serde_json::json!({"actuation": "shell", "class": "actuator"});
        let admission =
            admit_mfw_candidate_json(&value.to_string(), &request(), MFW_SHA, WASM_SHA);
        assert!(!admission.admitted);
        assert_eq!(admission.standing, "REFUSED:AUTHORITY_ESCALATION");
        assert!(!admission.receipt_sha256.is_empty());
    }

    #[test]
    fn blocked_is_a_valid_primary_standing() {
        let value = envelope("BLOCKED");
        let admission =
            admit_mfw_candidate_json(&value.to_string(), &request(), MFW_SHA, WASM_SHA);
        assert!(admission.admitted, "{:?}", admission.refusal_reason);
        assert_eq!(admission.standing, "BLOCKED");
    }
}
