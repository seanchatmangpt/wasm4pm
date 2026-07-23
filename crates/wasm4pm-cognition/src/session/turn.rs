//! Pure state transition, history replay, and receipt manufacture.

use super::analysis::{analyze, current_phase, Analysis};
use super::hash::{
    hash_domain_pack, hash_output_payload, hash_receipt_material, hash_session_state,
    hash_turn_input,
};
use super::matcher::extract_evidence;
use super::model::*;
use super::validate::validate_domain_pack;
use crate::breeds::TraceStep;
use std::collections::BTreeSet;

const SESSION_SCHEMA_VERSION: &str = "2";

fn initial_state(pack_hash: String) -> SessionState {
    SessionState {
        schema_version: SESSION_SCHEMA_VERSION.to_string(),
        turn: 0,
        domain_pack_hash: pack_hash,
        previous_state_hash: None,
        turns: vec![],
        observations: vec![],
        evidence: vec![],
        rejected_tracks: BTreeSet::new(),
        hypotheses: vec![],
        committed_track: None,
        phase: "uninitialized".to_string(),
        covered_concepts: vec![],
        missing_concepts: vec![],
        pending_confirmation: None,
        state_hash: String::new(),
    }
}

fn is_hex_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn invalid_state(reason: impl Into<String>) -> SessionError {
    SessionError::InvalidState {
        reason: reason.into(),
    }
}

fn track_satisfies_commitment(
    pack: &DomainPack,
    analysis: &Analysis,
    track_id: &str,
) -> bool {
    let Some(track) = analysis
        .hypotheses
        .iter()
        .find(|hypothesis| hypothesis.id == track_id)
    else {
        return false;
    };
    if track.eliminated
        || track.score < pack.thresholds.confidence
        || track.contradiction > pack.thresholds.maximum_contradiction
    {
        return false;
    }
    let coverage = analysis
        .covered_by_track
        .get(track_id)
        .map(Vec::len)
        .unwrap_or_default();
    if coverage < pack.thresholds.minimum_coverage {
        return false;
    }
    let best_competitor = analysis
        .hypotheses
        .iter()
        .filter(|hypothesis| hypothesis.id != track_id && !hypothesis.eliminated)
        .map(|hypothesis| hypothesis.score)
        .max_by(f32::total_cmp)
        .unwrap_or(0.0);
    track.score - best_competitor >= pack.thresholds.margin
}

fn apply_observation(
    pack: &DomainPack,
    state: &mut SessionState,
    observation: &Observation,
    trace: &mut Vec<TraceStep>,
) -> Result<(), SessionError> {
    if observation.id.trim().is_empty() || observation.source.trim().is_empty() {
        return Err(SessionError::MalformedInput {
            reason: "observation id and source must be non-empty".to_string(),
        });
    }
    if observation.text.trim().is_empty() && observation.retract_evidence_ids.is_empty() {
        return Err(SessionError::EmptyObservation);
    }
    if observation.text.len() > pack.bounds.max_observation_bytes {
        return Err(SessionError::ObservationTooLarge);
    }
    if state
        .observations
        .iter()
        .any(|existing| existing.id == observation.id)
    {
        return Err(SessionError::ObservationIdConflict {
            id: observation.id.clone(),
        });
    }
    if state.observations.len() >= pack.bounds.max_observations {
        return Err(SessionError::ResourceCap {
            resource: "observations".to_string(),
        });
    }

    let mut retractions = BTreeSet::new();
    for evidence_id in &observation.retract_evidence_ids {
        if !retractions.insert(evidence_id.clone()) {
            return Err(SessionError::MalformedInput {
                reason: format!("duplicate evidence retraction: {evidence_id}"),
            });
        }
        if !state.evidence.iter().any(|item| item.id == *evidence_id) {
            return Err(SessionError::UnknownEvidence {
                id: evidence_id.clone(),
            });
        }
    }
    for evidence_id in retractions {
        let item = state
            .evidence
            .iter_mut()
            .find(|item| item.id == evidence_id)
            .expect("retractions were prevalidated");
        item.active = false;
        trace.push(TraceStep {
            step: trace.len(),
            kind: "retract-evidence".to_string(),
            detail: format!("evidence={evidence_id}"),
            depth: 0,
            objects: vec![("evidence".to_string(), evidence_id)],
        });
    }

    let new_evidence = extract_evidence(pack, observation, trace)?;
    if state.evidence.len() + new_evidence.len() > pack.bounds.max_evidence {
        return Err(SessionError::ResourceCap {
            resource: "evidence".to_string(),
        });
    }
    state.observations.push(observation.clone());
    state.evidence.extend(new_evidence);
    Ok(())
}

fn apply_confirmation(
    pack: &DomainPack,
    state: &mut SessionState,
    confirmation: &Confirmation,
    analysis: &mut Analysis,
    trace: &mut Vec<TraceStep>,
) -> Result<(), SessionError> {
    if !pack
        .tracks
        .iter()
        .any(|track| track.id == confirmation.track_id)
    {
        return Err(SessionError::UnknownTrack {
            id: confirmation.track_id.clone(),
        });
    }
    if confirmation.accepted {
        if state.committed_track.is_some()
            || analysis.eligible_track.as_deref() != Some(confirmation.track_id.as_str())
        {
            return Err(SessionError::ConfirmationNotEligible {
                id: confirmation.track_id.clone(),
            });
        }
        state.committed_track = Some(confirmation.track_id.clone());
        state.rejected_tracks.remove(&confirmation.track_id);
        trace.push(TraceStep {
            step: trace.len(),
            kind: "confirm-track".to_string(),
            detail: format!("track={} accepted=true", confirmation.track_id),
            depth: 0,
            objects: vec![("track".to_string(), confirmation.track_id.clone())],
        });
        return Ok(());
    }

    let targets_pending =
        analysis.eligible_track.as_deref() == Some(confirmation.track_id.as_str());
    let targets_committed =
        state.committed_track.as_deref() == Some(confirmation.track_id.as_str());
    if !targets_pending && !targets_committed {
        return Err(SessionError::ConfirmationNotPending {
            id: confirmation.track_id.clone(),
        });
    }
    state.rejected_tracks.insert(confirmation.track_id.clone());
    if targets_committed {
        state.committed_track = None;
    }
    trace.push(TraceStep {
        step: trace.len(),
        kind: "reject-track".to_string(),
        detail: format!("track={} accepted=false", confirmation.track_id),
        depth: 0,
        objects: vec![("track".to_string(), confirmation.track_id.clone())],
    });
    *analysis = analyze(pack, &state.evidence, &state.rejected_tracks, trace);
    Ok(())
}

fn apply_turn_record(
    pack: &DomainPack,
    pack_hash: &str,
    state: &mut SessionState,
    record: &SessionTurnRecord,
    trace: &mut Vec<TraceStep>,
) -> Result<SessionProjection, SessionError> {
    if record.observation.is_none() && record.confirmation.is_none() {
        return Err(SessionError::EmptyTurn);
    }
    if state.turns.len() >= pack.bounds.max_turns {
        return Err(SessionError::ResourceCap {
            resource: "turns".to_string(),
        });
    }
    let next_turn = state
        .turn
        .checked_add(1)
        .ok_or_else(|| SessionError::ResourceCap {
            resource: "turn counter".to_string(),
        })?;
    trace.push(TraceStep {
        step: trace.len(),
        kind: "admit-turn".to_string(),
        detail: format!(
            "turn={next_turn} observation={} confirmation={}",
            record.observation.is_some(),
            record.confirmation.is_some()
        ),
        depth: 0,
        objects: vec![],
    });
    if let Some(observation) = &record.observation {
        apply_observation(pack, state, observation, trace)?;
    }
    let mut analysis = analyze(pack, &state.evidence, &state.rejected_tracks, trace);
    if record.observation.is_some() {
        if let Some(committed) = state.committed_track.clone() {
            if !track_satisfies_commitment(pack, &analysis, &committed) {
                state.committed_track = None;
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "reopen-commitment".to_string(),
                    detail: format!("track={committed} no longer satisfies commitment gates"),
                    depth: 0,
                    objects: vec![("track".to_string(), committed)],
                });
            }
        }
    }
    if let Some(confirmation) = &record.confirmation {
        apply_confirmation(pack, state, confirmation, &mut analysis, trace)?;
    }
    if !pack.thresholds.confirmation_required
        && state.committed_track.is_none()
        && analysis.eligible_track.is_some()
    {
        state.committed_track = analysis.eligible_track.clone();
        trace.push(TraceStep {
            step: trace.len(),
            kind: "auto-commit-track".to_string(),
            detail: format!(
                "track={}",
                state.committed_track.as_deref().unwrap_or_default()
            ),
            depth: 0,
            objects: vec![],
        });
    }

    let current_track = state
        .committed_track
        .clone()
        .or_else(|| analysis.top_track.clone());
    let covered = current_track
        .as_ref()
        .and_then(|id| analysis.covered_by_track.get(id))
        .cloned()
        .unwrap_or_default();
    let missing = current_track
        .as_ref()
        .and_then(|id| analysis.missing_by_track.get(id))
        .cloned()
        .unwrap_or_default();
    let pending_confirmation = if pack.thresholds.confirmation_required
        && state.committed_track.is_none()
    {
        analysis.eligible_track.clone()
    } else {
        None
    };
    let (phase, phase_label, complete) =
        current_phase(pack, state.committed_track.as_deref(), &covered);
    trace.push(TraceStep {
        step: trace.len(),
        kind: "commitment-gate".to_string(),
        detail: format!(
            "eligible={:?} committed={:?} pending={:?}",
            analysis.eligible_track, state.committed_track, pending_confirmation
        ),
        depth: 0,
        objects: vec![],
    });
    trace.push(TraceStep {
        step: trace.len(),
        kind: "advance-phase".to_string(),
        detail: format!("phase={phase} complete={complete}"),
        depth: 0,
        objects: vec![],
    });

    let previous_hash = if state.turn == 0 {
        None
    } else {
        Some(state.state_hash.clone())
    };
    state.turns.push(record.clone());
    state.turn = next_turn;
    state.schema_version = SESSION_SCHEMA_VERSION.to_string();
    state.domain_pack_hash = pack_hash.to_string();
    state.previous_state_hash = previous_hash;
    state.hypotheses = analysis.hypotheses.clone();
    state.phase = phase.clone();
    state.covered_concepts = covered.clone();
    state.missing_concepts = missing.clone();
    state.pending_confirmation = pending_confirmation.clone();
    state.state_hash = hash_session_state(state)?;

    Ok(SessionProjection {
        current_track,
        hypotheses: analysis.hypotheses,
        covered_concepts: covered,
        missing_concepts: missing,
        phase,
        phase_label,
        pending_confirmation,
        complete,
    })
}

fn replay_history(
    pack: &DomainPack,
    pack_hash: &str,
    turns: &[SessionTurnRecord],
) -> Result<SessionState, SessionError> {
    if turns.len() > pack.bounds.max_turns {
        return Err(SessionError::ResourceCap {
            resource: "turns".to_string(),
        });
    }
    let mut rebuilt = initial_state(pack_hash.to_string());
    for record in turns {
        let mut trace = Vec::new();
        apply_turn_record(pack, pack_hash, &mut rebuilt, record, &mut trace)?;
    }
    Ok(rebuilt)
}

fn verify_previous_state(
    pack: &DomainPack,
    state: &SessionState,
    pack_hash: &str,
) -> Result<(), SessionError> {
    if state.schema_version != SESSION_SCHEMA_VERSION {
        return Err(invalid_state(format!(
            "unsupported state schema {}; expected {}",
            state.schema_version, SESSION_SCHEMA_VERSION
        )));
    }
    if state.domain_pack_hash != pack_hash {
        return Err(SessionError::DomainPackMismatch);
    }
    if !is_hex_hash(&state.domain_pack_hash) || !is_hex_hash(&state.state_hash) {
        return Err(invalid_state(
            "state and domain hashes must be 64 hexadecimal characters",
        ));
    }
    if state.turn == 0 || state.turn as usize != state.turns.len() {
        return Err(invalid_state(
            "persisted turn number must equal the non-empty turn ledger length",
        ));
    }
    if state.turn == 1 && state.previous_state_hash.is_some() {
        return Err(invalid_state(
            "first persisted turn must not have a previous-state hash",
        ));
    }
    if state.turn > 1
        && !state
            .previous_state_hash
            .as_deref()
            .is_some_and(is_hex_hash)
    {
        return Err(invalid_state(
            "non-genesis state requires a valid previous-state hash",
        ));
    }
    let recomputed_hash = hash_session_state(state)?;
    if recomputed_hash != state.state_hash {
        return Err(SessionError::StateHashMismatch);
    }
    let rebuilt = replay_history(pack, pack_hash, &state.turns)
        .map_err(|error| invalid_state(format!("turn-ledger replay refused: {error}")))?;
    if rebuilt != *state {
        return Err(invalid_state(
            "persisted state is not the deterministic replay of its turn ledger",
        ));
    }
    Ok(())
}

/// Verify a persisted state without admitting a new turn.
pub fn verify_session_state(
    domain_pack: &DomainPack,
    state: &SessionState,
) -> Result<(), SessionError> {
    validate_domain_pack(domain_pack)?;
    let pack_hash = hash_domain_pack(domain_pack)?;
    verify_previous_state(domain_pack, state, &pack_hash)
}

/// Execute one deterministic, receipted session turn.
pub fn run_session_turn(input: &SessionTurnInput) -> Result<SessionTurnOutput, SessionError> {
    validate_domain_pack(&input.domain_pack)?;
    let record = SessionTurnRecord {
        observation: input.observation.clone(),
        confirmation: input.confirmation.clone(),
    };
    if record.observation.is_none() && record.confirmation.is_none() {
        return Err(SessionError::EmptyTurn);
    }
    let pack_hash = hash_domain_pack(&input.domain_pack)?;
    let mut state = match &input.previous_state {
        Some(previous) => {
            verify_previous_state(&input.domain_pack, previous, &pack_hash)?;
            previous.clone()
        }
        None => initial_state(pack_hash.clone()),
    };
    let previous_state_hash = input
        .previous_state
        .as_ref()
        .map(|state| state.state_hash.clone())
        .unwrap_or_else(|| "0".repeat(64));
    let mut trace = Vec::new();
    let projection = apply_turn_record(
        &input.domain_pack,
        &pack_hash,
        &mut state,
        &record,
        &mut trace,
    )?;
    let ocel = crate::ocel::derive_ocel("cognition_session", &state.state_hash, &trace);
    let ocel_log = serde_json::to_value(ocel).map_err(|error| SessionError::Serialization {
        reason: error.to_string(),
    })?;
    let input_hash = hash_turn_input(input)?;
    let output_hash = hash_output_payload(&state, &projection, &trace, &ocel_log)?;
    let combined_hash = hash_receipt_material(
        &input_hash,
        &previous_state_hash,
        &pack_hash,
        &output_hash,
    )?;
    let receipt = SessionReceipt {
        input_hash,
        previous_state_hash,
        domain_pack_hash: pack_hash,
        output_hash,
        combined_hash,
    };
    Ok(SessionTurnOutput {
        state,
        projection,
        inference_trace: trace,
        ocel_log,
        receipt,
    })
}
