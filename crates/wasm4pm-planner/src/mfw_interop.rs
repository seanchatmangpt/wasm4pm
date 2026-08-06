//! Receipt-bound admission of MFW universal-planning candidates.
//!
//! MFW constructs candidate plans. This module admits exact source and payload
//! identities as evidence. It never actuates a plan, and every rejection is a
//! typed, hashed receipt.

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

fn sorted(value: &Value) -> Value {
    match value {
        Value::Object(object) => {
            let mut keys: Vec<_> = object.keys().collect();
            keys.sort_unstable();
            let mut result = Map::new();
            for key in keys {
                result.insert(key.clone(), sorted(&object[key]));
            }
            Value::Object(result)
        }
        Value::Array(values) => Value::Array(values.iter().map(sorted).collect()),
        other => other.clone(),
    }
}

fn sha256_json(value: &Value) -> String {
    let bytes = serde_json::to_vec(&sorted(value)).expect("JSON values serialize");
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn exact_sha(value: &str) -> bool {
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

fn authority() -> Value {
    serde_json::json!({"actuation": "none", "class": "candidate"})
}

fn string<'a>(object: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    object.get(key).and_then(Value::as_str)
}

#[allow(clippy::too_many_arguments)]
fn admission_hash(
    admitted: bool,
    standing: &str,
    refusal_reason: &Option<String>,
    mfw_revision: &str,
    wasm4pm_revision: &str,
    request_sha256: &Option<String>,
    result_sha256: &Option<String>,
    candidate: &Option<Value>,
    authority: &Value,
    replay_operation: &str,
) -> String {
    let core = AdmissionCore {
        schema: WASM4PM_ADMISSION_SCHEMA,
        admitted,
        standing,
        refusal_reason,
        mfw_revision,
        wasm4pm_revision,
        request_sha256,
        result_sha256,
        candidate,
        authority,
        replay_operation,
    };
    let value = serde_json::to_value(core).expect("admission receipts serialize");
    sha256_json(&value)
}

fn refused(
    reason: &str,
    detail: impl Into<String>,
    mfw_revision: &str,
    wasm4pm_revision: &str,
) -> MfwInteropAdmission {
    let standing = format!("REFUSED:{reason}");
    let refusal_reason = Some(detail.into());
    let request_sha256 = None;
    let result_sha256 = None;
    let candidate = None;
    let authority = authority();
    let replay_operation = "admit_mfw_candidate".to_string();
    let receipt_sha256 = admission_hash(
        false,
        &standing,
        &refusal_reason,
        mfw_revision,
        wasm4pm_revision,
        &request_sha256,
        &result_sha256,
        &candidate,
        &authority,
        &replay_operation,
    );
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
        receipt_sha256,
    }
}

/// Admit one exact MFW candidate envelope without executing any plan step.
///
/// A correctly receipted `REFUSED:*` or `BLOCKED` candidate remains admissible
/// evidence while preserving its standing.
pub fn admit_mfw_candidate_json(
    input: &str,
    expected_request: &Value,
    expected_mfw_revision: &str,
    expected_wasm4pm_revision: &str,
) -> MfwInteropAdmission {
    macro_rules! reject {
        ($reason:literal, $detail:expr) => {
            return refused(
                $reason,
                $detail,
                expected_mfw_revision,
                expected_wasm4pm_revision,
            )
        };
    }

    if !exact_sha(expected_mfw_revision) || !exact_sha(expected_wasm4pm_revision) {
        reject!(
            "SOURCE_IDENTITY_INVALID",
            "expected identities must be exact lowercase 40-character SHAs"
        );
    }
    let envelope: Value = match serde_json::from_str(input) {
        Ok(value) => value,
        Err(error) => reject!("INVALID_JSON", format!("invalid JSON: {error}")),
    };
    let object = match envelope.as_object() {
        Some(value) => value,
        None => reject!("PAYLOAD_INVALID", "envelope must be an object"),
    };
    if string(object, "schema") != Some(MFW_INTEROP_SCHEMA) {
        reject!("SCHEMA_MISMATCH", format!("expected {MFW_INTEROP_SCHEMA}"));
    }
    let standing = match string(object, "status") {
        Some(value) if valid_standing(value) => value.to_string(),
        _ => reject!("STANDING_INVALID", "standing is not admitted"),
    };
    let source = match object.get("source").and_then(Value::as_object) {
        Some(value) => value,
        None => reject!("SOURCE_IDENTITY_MISSING", "source object is required"),
    };
    let source_matches = string(source, "mfw_repository") == Some("seanchatmangpt/mfw")
        && string(source, "mfw_revision") == Some(expected_mfw_revision)
        && string(source, "wasm4pm_repository") == Some("seanchatmangpt/wasm4pm")
        && string(source, "wasm4pm_revision") == Some(expected_wasm4pm_revision);
    if !source_matches {
        reject!("SOURCE_IDENTITY_MISMATCH", "source pins do not match");
    }
    let candidate_authority = object.get("authority").cloned().unwrap_or(Value::Null);
    if candidate_authority != authority() {
        reject!(
            "AUTHORITY_ESCALATION",
            "interop is candidate-only with actuation=none"
        );
    }
    let request = match object.get("request") {
        Some(Value::Object(_)) => &object["request"],
        _ => reject!("PAYLOAD_INVALID", "request must be an object"),
    };
    let result = match object.get("result") {
        Some(Value::Object(_)) => &object["result"],
        _ => reject!("PAYLOAD_INVALID", "result must be an object"),
    };
    if sorted(request) != sorted(expected_request) {
        reject!("REQUEST_SUBJECT_MISMATCH", "request identity differs");
    }
    let request_digest = sha256_json(request);
    let result_digest = sha256_json(result);
    if string(object, "request_sha256") != Some(request_digest.as_str()) {
        reject!("REQUEST_DIGEST_MISMATCH", "request digest differs");
    }
    if string(object, "result_sha256") != Some(result_digest.as_str()) {
        reject!("RESULT_DIGEST_MISMATCH", "result digest differs");
    }
    let receipt = match object.get("receipt").and_then(Value::as_object) {
        Some(value) => value,
        None => reject!("RECEIPT_MISSING", "versioned receipt is required"),
    };
    if string(receipt, "schema") != Some(MFW_INTEROP_RECEIPT_SCHEMA)
        || string(receipt, "standing") != Some(standing.as_str())
        || receipt.get("authority") != Some(&candidate_authority)
    {
        reject!("RECEIPT_MISMATCH", "receipt consequence differs");
    }
    let subject = match receipt.get("subject").and_then(Value::as_object) {
        Some(value) => value,
        None => reject!("RECEIPT_SUBJECT_MISSING", "receipt subject is required"),
    };
    let subject_matches = string(subject, "mfw_repository") == Some("seanchatmangpt/mfw")
        && string(subject, "mfw_revision") == Some(expected_mfw_revision)
        && string(subject, "wasm4pm_repository") == Some("seanchatmangpt/wasm4pm")
        && string(subject, "wasm4pm_revision") == Some(expected_wasm4pm_revision)
        && string(subject, "request_sha256") == Some(request_digest.as_str())
        && string(subject, "result_sha256") == Some(result_digest.as_str());
    if !subject_matches {
        reject!("RECEIPT_SUBJECT_MISMATCH", "receipt subject differs");
    }
    let replay = match receipt.get("replay").and_then(Value::as_object) {
        Some(value) => value,
        None => reject!("REPLAY_INVALID", "replay object is required"),
    };
    if string(replay, "operation") != Some("admit_mfw_candidate")
        || string(replay, "request_sha256") != Some(request_digest.as_str())
        || string(replay, "result_sha256") != Some(result_digest.as_str())
    {
        reject!("REPLAY_INVALID", "replay does not re-enter admission");
    }
    let mut receipt_core = receipt.clone();
    let receipt_digest = match receipt_core.remove("receipt_sha256") {
        Some(Value::String(value)) => value,
        _ => reject!("RECEIPT_DIGEST_MISSING", "receipt digest is required"),
    };
    if sha256_json(&Value::Object(receipt_core)) != receipt_digest {
        reject!("RECEIPT_DIGEST_MISMATCH", "receipt digest differs");
    }

    let request_sha256 = Some(request_digest);
    let result_sha256 = Some(result_digest);
    let candidate = Some(result.clone());
    let refusal_reason = None;
    let replay_operation = "admit_mfw_candidate".to_string();
    let receipt_sha256 = admission_hash(
        true,
        &standing,
        &refusal_reason,
        expected_mfw_revision,
        expected_wasm4pm_revision,
        &request_sha256,
        &result_sha256,
        &candidate,
        &candidate_authority,
        &replay_operation,
    );
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
        authority: candidate_authority,
        replay_operation,
        receipt_sha256,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MFW_SHA: &str = "e4fbda46f13d8213b86aa4f981d2387638983066";
    const WASM_SHA: &str = "44f1bca8ff8cb05b1d8f5561c20c827e33d2b5fd";

    fn fixture(status: &str) -> (Value, Value) {
        let request = serde_json::json!({
            "planning_type": "classical",
            "problem": {"id": "tiny"},
            "schema": "mfw.universal-planning.v1"
        });
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
        let receipt_core = serde_json::json!({
            "schema": MFW_INTEROP_RECEIPT_SCHEMA,
            "subject": {
                "mfw_repository": "seanchatmangpt/mfw",
                "mfw_revision": MFW_SHA,
                "wasm4pm_repository": "seanchatmangpt/wasm4pm",
                "wasm4pm_revision": WASM_SHA,
                "request_sha256": request_sha256,
                "result_sha256": result_sha256
            },
            "authority": authority(),
            "standing": status,
            "replay": {
                "operation": "admit_mfw_candidate",
                "request_sha256": request_sha256,
                "result_sha256": result_sha256
            }
        });
        let envelope = serde_json::json!({
            "schema": MFW_INTEROP_SCHEMA,
            "status": status,
            "source": source,
            "authority": authority(),
            "request": request,
            "request_sha256": request_sha256,
            "result": result,
            "result_sha256": result_sha256,
            "receipt": {
                "schema": receipt_core["schema"],
                "subject": receipt_core["subject"],
                "authority": receipt_core["authority"],
                "standing": receipt_core["standing"],
                "replay": receipt_core["replay"],
                "receipt_sha256": sha256_json(&receipt_core)
            }
        });
        (envelope, request)
    }

    #[test]
    fn admits_exact_candidate_without_actuation() {
        let (value, request) = fixture("ALIVE");
        let admission = admit_mfw_candidate_json(&value.to_string(), &request, MFW_SHA, WASM_SHA);
        assert!(admission.admitted, "{:?}", admission.refusal_reason);
        assert_eq!(admission.standing, "ALIVE");
        assert_eq!(admission.authority, authority());
    }

    #[test]
    fn preserves_refused_and_blocked_standings() {
        for standing in ["REFUSED:SEARCH_LIMIT_EXHAUSTED", "BLOCKED"] {
            let (value, request) = fixture(standing);
            let admission =
                admit_mfw_candidate_json(&value.to_string(), &request, MFW_SHA, WASM_SHA);
            assert!(admission.admitted, "{:?}", admission.refusal_reason);
            assert_eq!(admission.standing, standing);
        }
    }

    #[test]
    fn digest_drift_is_typed_and_receipted() {
        let (mut value, request) = fixture("ALIVE");
        value["result"]["result"]["plan"] = serde_json::json!(["tampered"]);
        let admission = admit_mfw_candidate_json(&value.to_string(), &request, MFW_SHA, WASM_SHA);
        assert!(!admission.admitted);
        assert_eq!(admission.standing, "REFUSED:RESULT_DIGEST_MISMATCH");
        assert!(!admission.receipt_sha256.is_empty());
    }

    #[test]
    fn authority_escalation_is_typed_and_receipted() {
        let (mut value, request) = fixture("ALIVE");
        value["authority"] = serde_json::json!({"actuation": "shell", "class": "actuator"});
        let admission = admit_mfw_candidate_json(&value.to_string(), &request, MFW_SHA, WASM_SHA);
        assert!(!admission.admitted);
        assert_eq!(admission.standing, "REFUSED:AUTHORITY_ESCALATION");
        assert!(!admission.receipt_sha256.is_empty());
    }
}
