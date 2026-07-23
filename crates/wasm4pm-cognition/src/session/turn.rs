//! Pure state transition and receipt manufacture.

use super::analysis::{analyze, current_phase};
use super::hash::{
    hash_domain_pack, hash_output_payload, hash_receipt_material, hash_session_state,
    hash_turn_input,
};
use super::matcher::extract_evidence;
use super::model::*;
use super::validate::validate_domain_pack;
use crate::breeds::TraceStep;
use std::collections::BTreeSet;

const SESSION_SCHEMA_VERSION: &str = "1";

fn initial_state(pack_hash: String) -> SessionState {
    SessionState {
        schema_version: SESSION_SCHEMA_VERSION.to_string(),
        turn: 0,
        domain_pack_hash: pack_hash,
        previous_state_hash: None,
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

fn verify_previous_state(
    state: &SessionState,
    domain_pack_hash: &str,
) -> Result<(), SessionError> {
    if state.domain_pack_hash != domain_pack_hash {
        return Err(SessionError::DomainPackMismatch);
    }
    let recomputed = hash_session_state(state)?;
    if recomputed != state.state_hash {
        return Err(SessionError::StateHashMismatch);
    }
    Ok(())
}

/// Execute one deterministic, receipted session turn.
pub fn run_session_turn(input: &SessionTurnInput) -> Result<SessionTurnOutput, SessionError> {
    validate_domain_pack(&input.domain_pack)?;
    if input.observation.is_none() && input.confirmation.is_none() {
        return Err(SessionError::EmptyTurn);
    }

    let domain_pack_hash = hash_domain_pack(&input.domain_pack)?;
    let mut state = match &input.previous_state {
        Some(previous) => {
            verify_previous_state(previous, &domain_pack_hash)?;
            previous.clone()
        }
        None => initial_state(domain_pack_hash.clone()),
    };
    let previous_state_hash = input
        .previous_state
        .as_ref()
        .map(|s| s.state_hash.clone())
        .unwrap_or_else(|| "0".repeat(64));

    let mut trace = Vec::new();
    trace.push(TraceStep {
        step: 0,
        kind: "admit-turn".to_string(),
        detail: format!(
            "turn={} observation={} confirmation={}",
            state.turn + 1,
            input.observation.is_some(),
            input.confirmation.is_some()
        ),
        depth: 0,
        objects: vec![],
    });

    if let Some(observation) = &input.observation {
        if observation.text.len() > input.domain_pack.bounds.max_observation_bytes {
            return Err(SessionError::ObservationTooLarge);
        }
        if let Some(existing) = state.observations.iter().find(|o| o.id == observation.id) {
            if existing != observation {
                return Err(SessionError::ObservationIdConflict {
                    id: observation.id.clone(),
                });
            }
        } else {
            if state.observations.len() >= input.domain_pack.bounds.max_observations {
                return Err(SessionError::ResourceCap {
                    resource: "observations".to_string(),
                });
            }
            for evidence_id in &observation.retract_evidence_ids {
                let mut found = false;
                for item in &mut state.evidence {
                    if &item.id == evidence_id {
                        item.active = false;
                        found = true;
                        trace.push(TraceStep {
                            step: trace.len(),
                            kind: "retract-evidence".to_string(),
                            detail: format!("evidence={evidence_id}"),
                            depth: 0,
                            objects: vec![("evidence".to_string(), evidence_id.clone())],
                        });
                    }
                }
                if !found {
                    return Err(SessionError::UnknownEvidence {
                        id: evidence_id.clone(),
                    });
                }
            }
            let new_evidence = extract_evidence(&input.domain_pack, observation, &mut trace)?;
            if state.evidence.len() + new_evidence.len() > input.domain_pack.bounds.max_evidence {
                return Err(SessionError::ResourceCap {
                    resource: "evidence".to_string(),
                });
            }
            state.observations.push(observation.clone());
            state.evidence.extend(new_evidence);
        }
    }

    let mut analysis = analyze(
        &input.domain_pack,
        &state.evidence,
        &state.rejected_tracks,
        &mut trace,
    );

    if let Some(confirmation) = &input.confirmation {
        if !input
            .domain_pack
            .tracks
            .iter()
            .any(|track| track.id == confirmation.track_id)
        {
            return Err(SessionError::UnknownTrack {
                id: confirmation.track_id.clone(),
            });
        }
        if confirmation.accepted {
            if analysis.eligible_track.as_deref() != Some(confirmation.track_id.as_str()) {
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
        } else {
            state.rejected_tracks.insert(confirmation.track_id.clone());
            if state.committed_track.as_deref() == Some(confirmation.track_id.as_str()) {
                state.committed_track = None;
            }
            trace.push(TraceStep {
                step: trace.len(),
                kind: "reject-track".to_string(),
                detail: format!("track={} accepted=false", confirmation.track_id),
                depth: 0,
                objects: vec![("track".to_string(), confirmation.track_id.clone())],
            });
            analysis = analyze(
                &input.domain_pack,
                &state.evidence,
                &state.rejected_tracks,
                &mut trace,
            );
        }
    }

    if !input.domain_pack.thresholds.confirmation_required
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
    let pending_confirmation = if input.domain_pack.thresholds.confirmation_required
        && state.committed_track.is_none()
    {
        analysis.eligible_track.clone()
    } else {
        None
    };
    let (phase, phase_label, complete) = current_phase(
        &input.domain_pack,
        state.committed_track.as_deref(),
        &covered,
    );

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

    state.turn = state.turn.saturating_add(1);
    state.schema_version = SESSION_SCHEMA_VERSION.to_string();
    state.domain_pack_hash = domain_pack_hash.clone();
    state.previous_state_hash = input
        .previous_state
        .as_ref()
        .map(|previous| previous.state_hash.clone());
    state.hypotheses = analysis.hypotheses.clone();
    state.phase = phase.clone();
    state.covered_concepts = covered.clone();
    state.missing_concepts = missing.clone();
    state.pending_confirmation = pending_confirmation.clone();
    state.state_hash = hash_session_state(&state)?;

    let projection = SessionProjection {
        current_track,
        hypotheses: analysis.hypotheses,
        covered_concepts: covered,
        missing_concepts: missing,
        phase,
        phase_label,
        pending_confirmation,
        complete,
    };

    let ocel = crate::ocel::derive_ocel("cognition_session", &state.state_hash, &trace);
    let ocel_log = serde_json::to_value(ocel).map_err(|e| SessionError::Serialization {
        reason: e.to_string(),
    })?;

    let input_hash = hash_turn_input(input)?;
    let output_hash = hash_output_payload(&state, &projection, &trace, &ocel_log)?;
    let combined_hash = hash_receipt_material(
        &input_hash,
        &previous_state_hash,
        &domain_pack_hash,
        &output_hash,
    )?;
    let receipt = SessionReceipt {
        input_hash,
        previous_state_hash,
        domain_pack_hash,
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
