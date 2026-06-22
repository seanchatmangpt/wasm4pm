use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// ─── Structs ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyGrant {
    pub actor_pattern: String,
    pub event_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdmissionPolicy {
    pub version: String,
    pub policy_hash: String,
    pub grants: Vec<PolicyGrant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundaryMap {
    pub transitions: std::collections::BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdmissionConfig {
    pub ledger_path: String,
    pub policy_path: String,
    pub boundary_map_path: String,
    pub revocation_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdmissionResult {
    pub admitted: bool,
    pub failing_conjunct: Option<String>,
    pub refusal_code: Option<String>,
    pub receipt_hash: Option<String>,
}

// ─── Hex utilities ────────────────────────────────────────────────────────────

fn bytes_to_hex(b: &[u8]) -> String {
    b.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn hex_to_bytes(hex: &str) -> Vec<u8> {
    hex.as_bytes()
        .chunks(2)
        .filter_map(|chunk| {
            let s = std::str::from_utf8(chunk).ok()?;
            u8::from_str_radix(s, 16).ok()
        })
        .collect()
}

// ─── C5: Nonce functions ──────────────────────────────────────────────────────

pub fn mint_challenge_nonce() -> String {
    let mut buf = [0u8; 16];
    for b in buf.iter_mut() {
        *b = fastrand::u8(..);
    }
    bytes_to_hex(&buf)
}

pub fn is_nonce_fresh(nonce: &str, ledger_path: &str) -> bool {
    let content = match std::fs::read_to_string(ledger_path) {
        Ok(c) => c,
        Err(_) => return true, // file missing → fresh
    };
    for line in content.lines() {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
            if val.get("nonce").and_then(|v| v.as_str()) == Some(nonce) {
                return false;
            }
        }
    }
    true
}

pub fn consume_nonce(nonce: &str, ledger_path: &str) -> std::io::Result<()> {
    use std::io::Write;
    if let Some(parent) = std::path::Path::new(ledger_path).parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(ledger_path)?;
    let entry = serde_json::json!({"nonce": nonce});
    writeln!(file, "{}", entry)?;
    Ok(())
}

// ─── C3: Policy functions ─────────────────────────────────────────────────────

pub fn load_policy(policy_path: &str) -> Option<AdmissionPolicy> {
    let content = std::fs::read_to_string(policy_path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn policy_allows(actor: &str, event_type: &str, policy: &AdmissionPolicy) -> bool {
    for grant in &policy.grants {
        let actor_match = grant.actor_pattern == "*" || grant.actor_pattern == actor;
        let event_match = grant
            .event_types
            .iter()
            .any(|et| et == "*" || et == event_type);
        if actor_match && event_match {
            return true;
        }
    }
    false
}

// ─── C4: Validator version functions ─────────────────────────────────────────

pub fn current_validator_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn is_validator_revoked(version: &str, revocation_path: &str) -> bool {
    let content = match std::fs::read_to_string(revocation_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let versions: Vec<String> = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return false,
    };
    versions.iter().any(|v| v == version)
}

// ─── C6: Boundary map functions ───────────────────────────────────────────────

pub fn load_boundary_map(path: &str) -> Option<BoundaryMap> {
    let content = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    // Support both { "state": [...] } and { "transitions": { "state": [...] } }
    let map_value = if let Some(inner) = v.get("transitions") {
        inner.clone()
    } else {
        v
    };
    let transitions: std::collections::BTreeMap<String, Vec<String>> = serde_json::from_value(map_value).ok()?;
    Some(BoundaryMap { transitions })
}

pub fn default_boundary_map() -> BoundaryMap {
    let mut transitions: std::collections::BTreeMap<String, Vec<String>> = std::collections::BTreeMap::new();
    transitions.insert("idle".to_string(), vec!["start".to_string()]);
    transitions.insert(
        "running".to_string(),
        vec![
            "complete".to_string(),
            "fail".to_string(),
            "pause".to_string(),
        ],
    );
    transitions.insert(
        "paused".to_string(),
        vec!["resume".to_string(), "fail".to_string()],
    );
    transitions.insert("completed".to_string(), vec![]);
    transitions.insert("failed".to_string(), vec!["retry".to_string()]);
    BoundaryMap { transitions }
}

pub fn boundary_admits(state: &str, event_type: &str, map: &BoundaryMap) -> bool {
    // Check wildcard first
    if let Some(wildcards) = map.transitions.get("*") {
        if wildcards.iter().any(|et| et == "*" || et == event_type) {
            return true;
        }
    }
    // Then state-specific
    if let Some(allowed) = map.transitions.get(state) {
        return allowed.iter().any(|et| et == "*" || et == event_type);
    }
    false
}

// ─── C1: Signature verification ───────────────────────────────────────────────

pub fn verify_receipt_signature(receipt: &serde_json::Value) -> bool {
    let sig_hex = match receipt.get("signature").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return false,
    };
    let pub_hex = match receipt.get("signer_pubkey").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return false,
    };

    let sig_bytes = hex_to_bytes(sig_hex);
    let pub_bytes = hex_to_bytes(pub_hex);

    if sig_bytes.len() != 64 || pub_bytes.len() != 32 {
        return false;
    }

    let actor = receipt
        .get("actor")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let event_type = receipt
        .get("event_type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let objects = receipt
        .get("objects")
        .map(|v| v.to_string())
        .unwrap_or_default();
    let state = receipt
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let prior_receipt_hash = receipt
        .get("prior_receipt_hash")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let policy_version = receipt
        .get("policy_version")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0");
    let validator_version = receipt
        .get("validator_version")
        .and_then(|v| v.as_str())
        .unwrap_or(env!("CARGO_PKG_VERSION"));
    let timestamp = receipt
        .get("timestamp")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let challenge_nonce = receipt
        .get("challenge_nonce")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    let msg = format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}",
        actor,
        event_type,
        objects,
        state,
        prior_receipt_hash,
        policy_version,
        validator_version,
        timestamp,
        challenge_nonce
    );

    let msg_hash = blake3::hash(msg.as_bytes());

    {
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};
        let pub_array: [u8; 32] = match pub_bytes.try_into() {
            Ok(a) => a,
            Err(_) => return false,
        };
        let sig_array: [u8; 64] = match sig_bytes.try_into() {
            Ok(a) => a,
            Err(_) => return false,
        };
        let vk = match VerifyingKey::from_bytes(&pub_array) {
            Ok(k) => k,
            Err(_) => return false,
        };
        let sig = Signature::from_bytes(&sig_array);
        vk.verify(msg_hash.as_bytes(), &sig).is_ok()
    }
}

// ─── Write residual helper ────────────────────────────────────────────────────

fn write_residual(candidate: &serde_json::Value, conjunct: &str, code: &str) {
    let candidate_bytes = serde_json::to_vec(candidate).unwrap_or_default();
    let candidate_hash = bytes_to_hex(blake3::hash(&candidate_bytes).as_bytes());
    let path = format!(".wasm4pm/residuals/{}.json", candidate_hash);
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let residual = serde_json::json!({
        "candidate_hash": candidate_hash,
        "failing_conjunct": conjunct,
        "refusal_code": code,
        "candidate": candidate,
    });
    let _ = std::fs::write(
        &path,
        serde_json::to_vec_pretty(&residual).unwrap_or_default(),
    );
}

// ─── Unified admit_change gate ────────────────────────────────────────────────

pub fn admit_change(candidate: &serde_json::Value, config: &AdmissionConfig) -> AdmissionResult {
    // NOTE: C2-C7 are checked before C1 so each conjunct test can be isolated
    // without needing a valid signature. C1 is the final authority gate.

    // C2: Receipt chain — check both top-level and nested under "receipt" object
    let receipt_obj = candidate.get("receipt");
    let has_receipt_hash = receipt_obj
        .and_then(|r| r.get("receipt_hash"))
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or_else(|| {
            candidate
                .get("receipt_hash")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false)
        });
    let has_prev_hash = receipt_obj
        .and_then(|r| r.get("previous_receipt_hash"))
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or_else(|| {
            candidate
                .get("previous_receipt_hash")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false)
        });
    if !has_receipt_hash || !has_prev_hash {
        write_residual(candidate, "C2", "ReceiptChainIncomplete");
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C2".to_string()),
            refusal_code: Some("ReceiptChainIncomplete".to_string()),
            receipt_hash: None,
        };
    }

    // C3: Policy
    if let Some(policy) = load_policy(&config.policy_path) {
        let actor = candidate
            .get("actor")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let event_type = candidate
            .get("event_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !policy_allows(actor, event_type, &policy) {
            write_residual(candidate, "C3", "PolicyDenied");
            return AdmissionResult {
                admitted: false,
                failing_conjunct: Some("C3".to_string()),
                refusal_code: Some("PolicyDenied".to_string()),
                receipt_hash: None,
            };
        }
    }
    // Policy file missing → open default (allow)

    // C4: Validator revocation
    let ver = current_validator_version();
    if is_validator_revoked(&ver, &config.revocation_path) {
        write_residual(candidate, "C4", "ValidatorRevoked");
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C4".to_string()),
            refusal_code: Some("ValidatorRevoked".to_string()),
            receipt_hash: None,
        };
    }

    // C5: Nonce freshness
    let nonce = candidate
        .get("challenge_nonce")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if nonce.is_empty() || !is_nonce_fresh(nonce, &config.ledger_path) {
        write_residual(candidate, "C5", "NonceConsumed");
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C5".to_string()),
            refusal_code: Some("NonceConsumed".to_string()),
            receipt_hash: None,
        };
    }
    let _ = consume_nonce(nonce, &config.ledger_path);

    // C6: Boundary map
    let state = candidate
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let event_type = candidate
        .get("event_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let bmap = load_boundary_map(&config.boundary_map_path).unwrap_or_else(default_boundary_map);
    if !boundary_admits(state, event_type, &bmap) {
        write_residual(candidate, "C6", "BoundaryViolation");
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C6".to_string()),
            refusal_code: Some("BoundaryViolation".to_string()),
            receipt_hash: None,
        };
    }

    // C7: Objects structural soundness
    let objects_arr = candidate.get("objects").and_then(|v| v.as_array());
    let objects_empty = objects_arr.map(|arr| arr.is_empty()).unwrap_or(true);
    if objects_empty {
        write_residual(candidate, "C7", "ObjectsEmpty");
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C7".to_string()),
            refusal_code: Some("ObjectsEmpty".to_string()),
            receipt_hash: None,
        };
    }
    // C7b: each object must have a non-empty "id" string
    if let Some(arr) = objects_arr {
        for obj in arr {
            let id_ok = obj
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false);
            if !id_ok {
                write_residual(candidate, "C7", "ObjectMissingId");
                return AdmissionResult {
                    admitted: false,
                    failing_conjunct: Some("C7".to_string()),
                    refusal_code: Some("ObjectMissingId".to_string()),
                    receipt_hash: None,
                };
            }
            let type_ok = obj
                .get("type")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false);
            if !type_ok {
                write_residual(candidate, "C7", "ObjectMissingType");
                return AdmissionResult {
                    admitted: false,
                    failing_conjunct: Some("C7".to_string()),
                    refusal_code: Some("ObjectMissingType".to_string()),
                    receipt_hash: None,
                };
            }
        }
        // C7c: no duplicate object ids
        let mut seen_ids = std::collections::HashSet::new();
        for obj in arr {
            if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                if !seen_ids.insert(id) {
                    write_residual(candidate, "C7", "ObjectDuplicateId");
                    return AdmissionResult {
                        admitted: false,
                        failing_conjunct: Some("C7".to_string()),
                        refusal_code: Some("ObjectDuplicateId".to_string()),
                        receipt_hash: None,
                    };
                }
            }
        }
    }

    // C1: Signature — checked last so C2-C7 tests can isolate their conjuncts
    // without requiring a valid ed25519 keypair in tests.
    if candidate.get("signature").is_some() {
        if !verify_receipt_signature(candidate) {
            write_residual(candidate, "C1", "SignatureInvalid");
            return AdmissionResult {
                admitted: false,
                failing_conjunct: Some("C1".to_string()),
                refusal_code: Some("SignatureInvalid".to_string()),
                receipt_hash: None,
            };
        }
    } else {
        write_residual(candidate, "C1", "SignatureMissing");
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C1".to_string()),
            refusal_code: Some("SignatureMissing".to_string()),
            receipt_hash: None,
        };
    }

    // All conjuncts passed — consume nonce and return admitted receipt hash
    let candidate_bytes = serde_json::to_vec(candidate).unwrap_or_default();
    let receipt_hash = bytes_to_hex(blake3::hash(&candidate_bytes).as_bytes());
    AdmissionResult {
        admitted: true,
        failing_conjunct: None,
        refusal_code: None,
        receipt_hash: Some(receipt_hash),
    }
}

/// Evaluate admit_change using inline content strings instead of file paths.
/// Used by Node.js/WASM callers where filesystem access is limited.
pub fn admit_change_with_contents(
    candidate: &serde_json::Value,
    ledger_contents: &str,
    policy_contents: &str,
    boundary_contents: &str,
    revoked_contents: &str,
) -> AdmissionResult {
    // C2
    let receipt_obj = candidate.get("receipt");
    let has_receipt_hash = receipt_obj
        .and_then(|r| r.get("receipt_hash"))
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or_else(|| {
            candidate
                .get("receipt_hash")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false)
        });
    let has_prev_hash = receipt_obj
        .and_then(|r| r.get("previous_receipt_hash"))
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or_else(|| {
            candidate
                .get("previous_receipt_hash")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false)
        });
    if !has_receipt_hash || !has_prev_hash {
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C2".to_string()),
            refusal_code: Some("ReceiptChainIncomplete".to_string()),
            receipt_hash: None,
        };
    }
    // C3
    if let Ok(policy) = serde_json::from_str::<AdmissionPolicy>(policy_contents) {
        let actor = candidate
            .get("actor")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let event_type = candidate
            .get("event_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !policy_allows(actor, event_type, &policy) {
            return AdmissionResult {
                admitted: false,
                failing_conjunct: Some("C3".to_string()),
                refusal_code: Some("PolicyDenied".to_string()),
                receipt_hash: None,
            };
        }
    }
    // C4
    let ver = current_validator_version();
    let revoked: Vec<String> = serde_json::from_str(revoked_contents).unwrap_or_default();
    if revoked.iter().any(|v| v == &ver) {
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C4".to_string()),
            refusal_code: Some("ValidatorRevoked".to_string()),
            receipt_hash: None,
        };
    }
    // C5
    let nonce = candidate
        .get("challenge_nonce")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let nonce_consumed = ledger_contents.lines().any(|line| {
        serde_json::from_str::<serde_json::Value>(line)
            .ok()
            .and_then(|v| v.get("nonce").and_then(|n| n.as_str()).map(|n| n == nonce))
            .unwrap_or(false)
    });
    if nonce.is_empty() || nonce_consumed {
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C5".to_string()),
            refusal_code: Some("NonceConsumed".to_string()),
            receipt_hash: None,
        };
    }
    // C6
    let bm = serde_json::from_str::<serde_json::Value>(boundary_contents)
        .ok()
        .and_then(|v| {
            let map_v = if let Some(inner) = v.get("transitions") {
                inner.clone()
            } else {
                v
            };
            serde_json::from_value::<std::collections::BTreeMap<String, Vec<String>>>(map_v).ok()
        })
        .map(|t| BoundaryMap { transitions: t })
        .unwrap_or_else(default_boundary_map);
    let state = candidate
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let event_type = candidate
        .get("event_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if !boundary_admits(state, event_type, &bm) {
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C6".to_string()),
            refusal_code: Some("BoundaryDenied".to_string()),
            receipt_hash: None,
        };
    }
    // C7
    let objects_ok = candidate
        .get("objects")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    if !objects_ok {
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C7".to_string()),
            refusal_code: Some("ObjectsEmpty".to_string()),
            receipt_hash: None,
        };
    }
    // C1
    if candidate.get("signature").is_some() {
        if !verify_receipt_signature(candidate) {
            return AdmissionResult {
                admitted: false,
                failing_conjunct: Some("C1".to_string()),
                refusal_code: Some("SignatureInvalid".to_string()),
                receipt_hash: None,
            };
        }
    } else {
        return AdmissionResult {
            admitted: false,
            failing_conjunct: Some("C1".to_string()),
            refusal_code: Some("SignatureMissing".to_string()),
            receipt_hash: None,
        };
    }
    let candidate_bytes = serde_json::to_vec(candidate).unwrap_or_default();
    let receipt_hash = bytes_to_hex(blake3::hash(&candidate_bytes).as_bytes());
    AdmissionResult {
        admitted: true,
        failing_conjunct: None,
        refusal_code: None,
        receipt_hash: Some(receipt_hash),
    }
}

// ─── WASM exports ─────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn wasm_mint_challenge_nonce() -> String {
    mint_challenge_nonce()
}

#[wasm_bindgen]
pub fn wasm_admit_change(
    candidate_json_str: &str,
    ledger_path: &str,
    policy_path: &str,
    boundary_map_path: &str,
    revocation_path: &str,
) -> String {
    let candidate: serde_json::Value = match serde_json::from_str(candidate_json_str) {
        Ok(v) => v,
        Err(e) => {
            let result = AdmissionResult {
                admitted: false,
                failing_conjunct: Some("parse".to_string()),
                refusal_code: Some(format!("ParseError: {}", e)),
                receipt_hash: None,
            };
            return serde_json::to_string(&result).unwrap_or_default();
        }
    };
    let config = AdmissionConfig {
        ledger_path: ledger_path.to_string(),
        policy_path: policy_path.to_string(),
        boundary_map_path: boundary_map_path.to_string(),
        revocation_path: revocation_path.to_string(),
    };
    let result = admit_change(&candidate, &config);
    serde_json::to_string(&result).unwrap_or_default()
}

#[wasm_bindgen]
pub fn wasm_admit_change_inline(
    candidate_json_str: &str,
    ledger_contents: &str,
    policy_contents: &str,
    boundary_contents: &str,
    revoked_contents: &str,
) -> String {
    let candidate: serde_json::Value = match serde_json::from_str(candidate_json_str) {
        Ok(v) => v,
        Err(e) => {
            return serde_json::json!({
                "admitted": false,
                "failing_conjunct": "parse",
                "refusal_code": format!("ParseError: {}", e),
                "receipt_hash": null
            })
            .to_string();
        }
    };
    let result = admit_change_with_contents(
        &candidate,
        ledger_contents,
        policy_contents,
        boundary_contents,
        revoked_contents,
    );
    serde_json::to_string(&result).unwrap_or_default()
}
