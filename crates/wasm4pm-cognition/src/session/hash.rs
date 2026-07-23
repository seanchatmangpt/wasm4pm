//! Canonical domain-separated hashes for session artifacts.

use super::model::*;
use crate::breeds::TraceStep;
use serde::Serialize;

const STATE_HASH_DOMAIN: &str = "wasm4pm.cognition.session.state.v2";
const PACK_HASH_DOMAIN: &str = "wasm4pm.cognition.session.pack.v2";
const INPUT_HASH_DOMAIN: &str = "wasm4pm.cognition.session.input.v2";
const OUTPUT_HASH_DOMAIN: &str = "wasm4pm.cognition.session.output.v2";
const RECEIPT_HASH_DOMAIN: &str = "wasm4pm.cognition.session.receipt.v2";

#[derive(Serialize)]
struct StateHashView<'a> {
    schema_version: &'a str,
    turn: u64,
    domain_pack_hash: &'a str,
    previous_state_hash: &'a Option<String>,
    turns: &'a [SessionTurnRecord],
    observations: &'a [Observation],
    evidence: &'a [EvidenceRecord],
    rejected_tracks: &'a std::collections::BTreeSet<String>,
    hypotheses: &'a [TrackHypothesis],
    committed_track: &'a Option<String>,
    phase: &'a str,
    covered_concepts: &'a [String],
    missing_concepts: &'a [String],
    pending_confirmation: &'a Option<String>,
}

#[derive(Serialize)]
struct OutputHashView<'a> {
    state: &'a SessionState,
    projection: &'a SessionProjection,
    inference_trace: &'a [TraceStep],
    ocel_log: &'a serde_json::Value,
}

#[derive(Serialize)]
struct ReceiptHashView<'a> {
    input_hash: &'a str,
    previous_state_hash: &'a str,
    domain_pack_hash: &'a str,
    output_hash: &'a str,
}

pub(super) fn hash_serializable<T: Serialize>(
    domain: &str,
    value: &T,
) -> Result<String, SessionError> {
    let bytes = serde_json::to_vec(value).map_err(|error| SessionError::Serialization {
        reason: error.to_string(),
    })?;
    let mut hasher = blake3::Hasher::new_derive_key(domain);
    hasher.update(&bytes);
    Ok(hasher.finalize().to_hex().to_string())
}

/// Compute the domain-separated BLAKE3 hash of a domain pack.
pub fn hash_domain_pack(pack: &DomainPack) -> Result<String, SessionError> {
    hash_serializable(PACK_HASH_DOMAIN, pack)
}

/// Recompute the domain-separated BLAKE3 hash of a session state.
///
/// The embedded `state_hash` field is deliberately excluded from the hash view.
pub fn hash_session_state(state: &SessionState) -> Result<String, SessionError> {
    hash_serializable(
        STATE_HASH_DOMAIN,
        &StateHashView {
            schema_version: &state.schema_version,
            turn: state.turn,
            domain_pack_hash: &state.domain_pack_hash,
            previous_state_hash: &state.previous_state_hash,
            turns: &state.turns,
            observations: &state.observations,
            evidence: &state.evidence,
            rejected_tracks: &state.rejected_tracks,
            hypotheses: &state.hypotheses,
            committed_track: &state.committed_track,
            phase: &state.phase,
            covered_concepts: &state.covered_concepts,
            missing_concepts: &state.missing_concepts,
            pending_confirmation: &state.pending_confirmation,
        },
    )
}

pub(super) fn hash_turn_input(input: &SessionTurnInput) -> Result<String, SessionError> {
    hash_serializable(INPUT_HASH_DOMAIN, input)
}

pub(super) fn hash_output_payload(
    state: &SessionState,
    projection: &SessionProjection,
    inference_trace: &[TraceStep],
    ocel_log: &serde_json::Value,
) -> Result<String, SessionError> {
    hash_serializable(
        OUTPUT_HASH_DOMAIN,
        &OutputHashView {
            state,
            projection,
            inference_trace,
            ocel_log,
        },
    )
}

pub(super) fn hash_receipt_material(
    input_hash: &str,
    previous_state_hash: &str,
    domain_pack_hash: &str,
    output_hash: &str,
) -> Result<String, SessionError> {
    hash_serializable(
        RECEIPT_HASH_DOMAIN,
        &ReceiptHashView {
            input_hash,
            previous_state_hash,
            domain_pack_hash,
            output_hash,
        },
    )
}
