//! Hardened WebAssembly boundary for state-carrying cognition sessions.

#![cfg(feature = "wasm")]

use crate::registry::{CognitionReceipt, REGISTRY};
use crate::session::{run_session_turn, SessionError, SessionTurnInput, SessionTurnOutput};
use serde::Serialize;
use wasm_bindgen::prelude::*;

const MAX_SESSION_INPUT_LEN: usize = 10 * 1024 * 1024;

#[derive(Serialize)]
struct SuccessBoundary<'a> {
    status: &'static str,
    run_id: &'a str,
    input_hash: &'a str,
    output_hash: &'a str,
    replay_pointer: &'a str,
    output: &'a SessionTurnOutput,
    signature: &'a str,
    public_key_id: &'a str,
    signature_algorithm: &'static str,
}

#[derive(Serialize)]
struct RefusalBoundary<'a> {
    status: &'static str,
    run_id: &'a str,
    input_hash: &'a str,
    refusal_hash: &'a str,
    replay_pointer: &'a str,
    refusal: &'a SessionError,
    message: String,
    signature: &'a str,
    public_key_id: &'a str,
    signature_algorithm: &'static str,
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|json| JsValue::from_str(&json))
        .map_err(|error| JsValue::from_str(&format!("session boundary serialization failed: {error}")))
}

fn raw_hash(input: &str) -> String {
    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.session.raw-input.v1");
    hasher.update(input.as_bytes());
    hasher.finalize().to_hex().to_string()
}

fn refusal_hash(input_hash: &str, refusal: &SessionError) -> String {
    let encoded = serde_json::to_vec(&(input_hash, refusal)).unwrap_or_default();
    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.session.refusal.v1");
    hasher.update(&encoded);
    hasher.finalize().to_hex().to_string()
}

fn run_id(kind: &str, digest: &str) -> String {
    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.session.run.v1");
    hasher.update(kind.as_bytes());
    hasher.update(digest.as_bytes());
    hasher.finalize().to_hex().to_string()
}

#[cfg(feature = "actor-ed25519")]
fn sign(run_id: &str, input_hash: &str, output_hash: &str) -> (String, String) {
    use crate::autosystems::receipt::ActorSigner;
    let signer =
        ActorSigner::from_seed(*blake3::hash(b"wasm4pm.cognition.session.v1.default-actor").as_bytes());
    let message = format!("{run_id}|{input_hash}|{output_hash}");
    (
        hex::encode(signer.sign(message.as_bytes())),
        hex::encode(&signer.id.public_key),
    )
}

#[cfg(not(feature = "actor-ed25519"))]
fn sign(_run_id: &str, _input_hash: &str, _output_hash: &str) -> (String, String) {
    ("ed25519-disabled".to_string(), "n/a".to_string())
}

fn refused(input_hash: String, refusal: SessionError) -> Result<JsValue, JsValue> {
    let digest = refusal_hash(&input_hash, &refusal);
    let id = run_id("refusal", &digest);
    let replay_pointer = digest[..16].to_string();
    let (signature, public_key_id) = sign(&id, &input_hash, &digest);
    REGISTRY.with(|registry| {
        registry.borrow_mut().insert(
            id.clone(),
            CognitionReceipt {
                run_id: id.clone(),
                output_hash: digest.clone(),
                replay_pointer: replay_pointer.clone(),
            },
        );
    });
    to_js(&RefusalBoundary {
        status: "refused",
        run_id: &id,
        input_hash: &input_hash,
        refusal_hash: &digest,
        replay_pointer: &replay_pointer,
        message: refusal.to_string(),
        refusal: &refusal,
        signature: &signature,
        public_key_id: &public_key_id,
        signature_algorithm: "ed25519",
    })
}

/// Execute one session turn through the sovereign WASM boundary.
///
/// The function always returns a JSON string. Lawful refusals use
/// `status="refused"` and carry a signed refusal hash rather than throwing.
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
    let id = run_id("success", &output.receipt.combined_hash);
    let replay_pointer = output_hash[..16].to_string();
    let (signature, public_key_id) = sign(&id, &input_hash, &output_hash);

    REGISTRY.with(|registry| {
        registry.borrow_mut().insert(
            id.clone(),
            CognitionReceipt {
                run_id: id.clone(),
                output_hash: output_hash.clone(),
                replay_pointer: replay_pointer.clone(),
            },
        );
    });

    to_js(&SuccessBoundary {
        status: "ok",
        run_id: &id,
        input_hash: &input_hash,
        output_hash: &output_hash,
        replay_pointer: &replay_pointer,
        output: &output,
        signature: &signature,
        public_key_id: &public_key_id,
        signature_algorithm: "ed25519",
    })
}
