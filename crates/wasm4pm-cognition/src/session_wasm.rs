//! Hardened WebAssembly boundary for state-carrying cognition sessions.

#![cfg(feature = "wasm")]

use crate::registry::{CognitionReceipt, REGISTRY};
use crate::session::{
    project_python_code, run_session_turn, verify_session_state, CodeProjection, DomainPack,
    SessionError, SessionState, SessionTurnInput, SessionTurnOutput,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const MAX_SESSION_INPUT_LEN: usize = 10 * 1024 * 1024;

#[derive(Serialize)]
struct AttestationBoundary {
    kind: &'static str,
    signature: Option<String>,
    public_key: Option<String>,
}

#[derive(Serialize)]
struct SuccessBoundary<'a> {
    status: &'static str,
    run_id: &'a str,
    input_hash: &'a str,
    output_hash: &'a str,
    attested_hash: &'a str,
    replay_pointer: &'a str,
    output: &'a SessionTurnOutput,
    attestation: &'a AttestationBoundary,
}

#[derive(Serialize)]
struct VerificationBoundary<'a> {
    status: &'static str,
    run_id: &'a str,
    input_hash: &'a str,
    state_hash: &'a str,
    domain_pack_hash: &'a str,
    attested_hash: &'a str,
    replay_pointer: &'a str,
    attestation: &'a AttestationBoundary,
}

#[derive(Serialize)]
struct CodeBoundary<'a> {
    status: &'static str,
    run_id: &'a str,
    input_hash: &'a str,
    attested_hash: &'a str,
    replay_pointer: &'a str,
    code: &'a Option<CodeProjection>,
    attestation: &'a AttestationBoundary,
}

#[derive(Serialize)]
struct RefusalBoundary<'a> {
    status: &'static str,
    run_id: &'a str,
    input_hash: &'a str,
    refusal_hash: &'a str,
    attested_hash: &'a str,
    replay_pointer: &'a str,
    refusal: &'a SessionError,
    message: String,
    attestation: &'a AttestationBoundary,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VerificationInput {
    domain_pack: DomainPack,
    state: SessionState,
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|json| JsValue::from_str(&json))
        .map_err(|error| {
            JsValue::from_str(&format!(
                "session boundary serialization failed: {error}"
            ))
        })
}

fn raw_hash(input: &str) -> String {
    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.session.raw-input.v2");
    hasher.update(input.as_bytes());
    hasher.finalize().to_hex().to_string()
}

fn refusal_hash(input_hash: &str, refusal: &SessionError) -> Result<String, JsValue> {
    let encoded = serde_json::to_vec(&(input_hash, refusal)).map_err(|error| {
        JsValue::from_str(&format!("session refusal serialization failed: {error}"))
    })?;
    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.session.refusal.v2");
    hasher.update(&encoded);
    Ok(hasher.finalize().to_hex().to_string())
}

fn run_id(kind: &str, digest: &str) -> String {
    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.session.run.v2");
    hasher.update(kind.as_bytes());
    hasher.update(digest.as_bytes());
    hasher.finalize().to_hex().to_string()
}

#[cfg(feature = "actor-ed25519")]
fn attest(run_id: &str, input_hash: &str, attested_hash: &str) -> AttestationBoundary {
    use crate::autosystems::receipt::ActorSigner;

    let signer = ActorSigner::from_seed(
        *blake3::hash(b"wasm4pm.cognition.session.v2.local-self-signer").as_bytes(),
    );
    let message = format!(
        "wasm4pm.cognition.session.attestation.v2|{run_id}|{input_hash}|{attested_hash}"
    );
    AttestationBoundary {
        kind: "ed25519-self-signed",
        signature: Some(hex::encode(signer.sign(message.as_bytes()))),
        public_key: Some(hex::encode(&signer.id.public_key)),
    }
}

#[cfg(not(feature = "actor-ed25519"))]
fn attest(_run_id: &str, _input_hash: &str, _attested_hash: &str) -> AttestationBoundary {
    AttestationBoundary {
        kind: "blake3-only",
        signature: None,
        public_key: None,
    }
}

fn register_receipt(id: &str, digest: &str, replay_pointer: &str) {
    REGISTRY.with(|registry| {
        registry.borrow_mut().insert(
            id.to_string(),
            CognitionReceipt {
                run_id: id.to_string(),
                output_hash: digest.to_string(),
                replay_pointer: replay_pointer.to_string(),
            },
        );
    });
}

fn refused(input_hash: String, refusal: SessionError) -> Result<JsValue, JsValue> {
    let digest = refusal_hash(&input_hash, &refusal)?;
    let id = run_id("refusal", &digest);
    let replay_pointer = digest[..16].to_string();
    let attestation = attest(&id, &input_hash, &digest);
    register_receipt(&id, &digest, &replay_pointer);
    to_js(&RefusalBoundary {
        status: "refused",
        run_id: &id,
        input_hash: &input_hash,
        refusal_hash: &digest,
        attested_hash: &digest,
        replay_pointer: &replay_pointer,
        message: refusal.to_string(),
        refusal: &refusal,
        attestation: &attestation,
    })
}

fn parse_verification_input(
    input_json: &str,
) -> Result<(String, VerificationInput), Result<JsValue, JsValue>> {
    let input_hash = raw_hash(input_json);
    if input_json.len() > MAX_SESSION_INPUT_LEN {
        return Err(refused(input_hash, SessionError::InputTooLarge));
    }
    match serde_json::from_str(input_json) {
        Ok(input) => Ok((input_hash, input)),
        Err(error) => Err(refused(
            input_hash,
            SessionError::MalformedInput {
                reason: error.to_string(),
            },
        )),
    }
}

/// Verify a persisted session state without admitting a new turn.
#[wasm_bindgen]
pub fn cognition_session_verify(input_json: &str) -> Result<JsValue, JsValue> {
    let (input_hash, input) = match parse_verification_input(input_json) {
        Ok(value) => value,
        Err(boundary) => return boundary,
    };
    if let Err(error) = verify_session_state(&input.domain_pack, &input.state) {
        return refused(input_hash, error);
    }

    let state_hash = input.state.state_hash.clone();
    let domain_pack_hash = input.state.domain_pack_hash.clone();
    let id = run_id("verification", &state_hash);
    let replay_pointer = state_hash[..16].to_string();
    let attestation = attest(&id, &input_hash, &state_hash);
    register_receipt(&id, &state_hash, &replay_pointer);
    to_js(&VerificationBoundary {
        status: "verified",
        run_id: &id,
        input_hash: &input_hash,
        state_hash: &state_hash,
        domain_pack_hash: &domain_pack_hash,
        attested_hash: &state_hash,
        replay_pointer: &replay_pointer,
        attestation: &attestation,
    })
}

/// Replay-verify state and return the canonical Python artifact selected by cognition.
#[wasm_bindgen]
pub fn cognition_session_code(input_json: &str) -> Result<JsValue, JsValue> {
    let (input_hash, input) = match parse_verification_input(input_json) {
        Ok(value) => value,
        Err(boundary) => return boundary,
    };
    let code = match project_python_code(&input.domain_pack, &input.state) {
        Ok(code) => code,
        Err(error) => return refused(input_hash, error),
    };
    let encoded = serde_json::to_vec(&(input.state.state_hash.as_str(), &code)).map_err(|error| {
        JsValue::from_str(&format!("code projection serialization failed: {error}"))
    })?;
    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.code-boundary.v1");
    hasher.update(&encoded);
    let digest = hasher.finalize().to_hex().to_string();
    let id = run_id("code", &digest);
    let replay_pointer = digest[..16].to_string();
    let attestation = attest(&id, &input_hash, &digest);
    register_receipt(&id, &digest, &replay_pointer);
    to_js(&CodeBoundary {
        status: "ok",
        run_id: &id,
        input_hash: &input_hash,
        attested_hash: &digest,
        replay_pointer: &replay_pointer,
        code: &code,
        attestation: &attestation,
    })
}

/// Execute one session turn through the sovereign WASM boundary.
#[wasm_bindgen]
pub fn cognition_session_turn(input_json: &str) -> Result<JsValue, JsValue> {
    let raw_input_hash = raw_hash(input_json);
    if input_json.len() > MAX_SESSION_INPUT_LEN {
        return refused(raw_input_hash, SessionError::InputTooLarge);
    }

    let input: SessionTurnInput = match serde_json::from_str(input_json) {
        Ok(input) => input,
        Err(error) => {
            return refused(
                raw_input_hash,
                SessionError::MalformedInput {
                    reason: error.to_string(),
                },
            )
        }
    };

    let output = match run_session_turn(&input) {
        Ok(output) => output,
        Err(error) => return refused(raw_input_hash, error),
    };

    let input_hash = output.receipt.input_hash.clone();
    let output_hash = output.receipt.output_hash.clone();
    let attested_hash = output.receipt.combined_hash.clone();
    let id = run_id("success", &attested_hash);
    let replay_pointer = attested_hash[..16].to_string();
    let attestation = attest(&id, &input_hash, &attested_hash);
    register_receipt(&id, &output_hash, &replay_pointer);

    to_js(&SuccessBoundary {
        status: "ok",
        run_id: &id,
        input_hash: &input_hash,
        output_hash: &output_hash,
        attested_hash: &attested_hash,
        replay_pointer: &replay_pointer,
        output: &output,
        attestation: &attestation,
    })
}
