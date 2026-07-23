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

const SESSION_SCHEMA_VERSION: &str = "2";

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

fn is_hex_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn invalid_state(reason: impl Into<String>) -> SessionError {
    SessionError::InvalidState {
        reason: reason.into(),
    }
}

fn verify_previous_state(
    pack: &DomainPack,
    state: &SessionState,
    domain_pack_hash: &str,
) -> Result<(), SessionError> {
    if state.schema_version != SESSION_SCHEMA_VERSION {
        return Err(invalid_state(format!(
            "unsupported state schema {}; expected {}",
            state.schema_version, SESSION_SCHEMA_VERSION
        )));
    }
    if state.domain_pack_hash != domain_pack_hash {
        return Err(SessionError::DomainPackMismatch);
    }
    if !is_hex_hash(&state.domain_pack_hash) || !is_hex_hash(&state.state_hash) {
        return Err(invalid_state("state and domain hashes must be 64 hexadecimal characters"));
    }
    if state.turn == 0 {
        return Err(invalid_state("persisted state must represent at least one turn"));
    }
    if state.turn == 1 && state.previous_state_hash.is_some() {
        return Err(invalid_state("genesis state must not name a previous state"));
    }
    if state.turn > 1
        && !state
            .previous_state_hash
            .as_deref()
            .is_some_and(is_hex_hash)
    {
        return Err(invalid_state("non-genesis state requires a valid previous-state hash"));
    }
    if state.observations.len() > pack.bounds.max_observations
        || state.evidence.len() > pack.bounds.max_evidence
        || state.turn < state.observations.len() as u64
    {
        return Err(invalid_state("state exceeds declared resource or turn bounds"));
    }

    let recomputed = hash_session_state(state)?;
    if recomputed != state.state_hash {
        return Err(SessionError::StateHashMismatch);
    }

    let known_tracks: BTreeSet<&str> = pack.tracks.iter().map(|track| track.id.as_str()).collect();
    if state
        .rejected_tracks
        .iter()
        .any(|track| !known_tracks.contains(track.as_str()))
        || state
            .committed_track
            .as_deref()
            .is_some_and(|track| !known_tracks.contains(track))
        || state
            .pending_confirmation
            .as_deref()
            .is_some_and(|track| !known_tracks.contains(track))
    {
        return Err(invalid_state("state references an unknown track"));
    }
    if state
        .committed_track
        .as_ref()
        .is_some_and(|track| state.rejected_tracks.contains(track))
    {
        return Err(invalid_state("committed track is also rejected"));
    }

    let mut observation_ids = BTreeSet::new();
    let mut rebuilt_evidence: Vec<EvidenceRecord> = Vec::new();
    for observation in &state.observations {
        if observation.id.trim().is_empty() || observation.source.trim().is_empty() {
            return Err(invalid_state("observation id and source must be non-empty"));
        }
        if !observation_ids.insert(observation.id.as_str()) {
            return Err(invalid_state(format!(
                "duplicate observation id {}",
                observation.id
            )));
        }
        if observation.text.len() > pack.bounds.max_observation_bytes {
            return Err(invalid_state(format!(
                "observation {} exceeds the byte bound",
                observation.id
            )));
        }
        if observation.text.trim().is_empty() && observation.retract_evidence_ids.is_empty() {
            return Err(invalid_state(format!(
                "observation {} has no text or retractions",
                observation.id
            )));
        }
        for evidence_id in &observation.retract_evidence_ids {
            let Some(item) = rebuilt_evidence.iter_mut().find(|item| item.id == *evidence_id) else {
                return Err(invalid_state(format!(
                    "observation {} retracts unknown evidence {}",
                    observation.id, evidence_id
                )));
            };
            item.active = false;
        }
        let mut ignored_trace = Vec::new();
        let extracted = extract_evidence(pack, observation, &mut ignored_trace)?;
        if rebuilt_evidence.len() + extracted.len() > pack.bounds.max_evidence {
            return Err(invalid_state("rebuilt evidence exceeds max_evidence"));
        }
        rebuilt_evidence.extend(extracted);
    }
    if rebuilt_evidence != state.evidence {
        return Err(invalid_state(
            "evidence is not the deterministic projection of admitted observations",
        ));
    }

    let mut ignored_trace = Vec::new();
    let analysis = analyze(
        pack,
        &state.evidence,
        &state.rejected_tracks,
        &mut ignored_trace,
    );
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
    let pending = if pack.thresholds.confirmation_required && state.committed_track.is_none() {
        analysis.eligible_track.clone()
    } else {
        None
    };
    let (phase, _, _) = current_phase(pack, state.committed_track.as_deref(), &covered);
    if state.hypotheses != analysis.hypotheses
        || state.covered_concepts != covered
        || state.missing_concepts != missing
        || state.pending_confirmation != pending
        || state.phase != phase
    {
        return Err(invalid_state(
            "derived hypotheses, concepts, confirmation, or phase do not recompute",
        ));
    }
    Ok(())
}

fn should_reopen_commitment(
    pack: &DomainPack,
    analysis: &super::analysis::Analysis,
    committed_track: &str,
) -> bool {
    let Some(committed) = analysis
        .hypotheses
        .iter()
        .find(|hypothesis| hypothesis.id == committed_track)
    else {
        return true;
    };
    if committed.eliminated
        || committed.score < pack.thresholds.confidence
        || committed.contradiction > pack.thresholds.maximum_contradiction
    {
        return true;
    }
    analysis.hypotheses.first().is_some_and(|top| {
        top.id != committed_track
            && top.score - committed.score >= pack.thresholds.margin
            && top.score >= pack.thresholds.confidence
    })
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
            verify_previous_state(&input.domain_pack, previous, &domain_pack_hash)?;
            previous.clone()
        }
        None => initial_state(domain_pack_hash.clone()),
    };
    let previous_state_hash = input
        .previous_state
        .as_ref()
        .map(|state| state.state_hash.clone())
        .unwrap_or_else(|| "0".repeat(64));
    let next_turn = state.turn.checked_add(1).ok_or_else(|| SessionError::ResourceCap {
        resource: "turn counter".to_string(),
    })?;

    let mut trace = vec![TraceStep {
        step: 0,
        kind: "admit-turn".to_string(),
        detail: format!(
            "turn={next_turn} observation={} confirmation={}",
            input.observation.is_some(),
            input.confirmation.is_some()
        ),
        depth: 0,
        objects: vec![],
    }];

    if let Some(observation) = &input.observation {
        if observation.id.trim().is_empty() || observation.source.trim().is_empty() {
            return Err(SessionError::MalformedInput {
                reason: "observation id and source must be non-empty".to_string(),
            });
        }
        if observation.text.trim().is_empty() && observation.retract_evidence_ids.is_empty() {
            return Err(SessionError::EmptyObservation);
        }
        if observation.text.len() > input.domain_pack.bounds.max_observation_bytes {
            return Err(SessionError::ObservationTooLarge);
        }
        if let Some(existing) = state.observations.iter().find(|item| item.id == observation.id) {
            if existing != observation {
                return Err(SessionError::ObservationIdConflict {
                    id: observation.id.clone(),
                });
            }
            trace.push(TraceStep {
                step: trace.len(),
                kind: "duplicate-observation".to_string(),
                detail: format!("observation={} already admitted", observation.id),
                depth: 0,
                objects: vec![("observation".to_string(), observation.id.clone())],
            });
        } else {
            if state.observations.len() >= input.domain_pack.bounds.max_observations {
                return Err(SessionError::ResourceCap {
                    resource: "observations".to_string(),
                });
            }
            for evidence_id in &observation.retract_evidence_ids {
                let mut found = false;
                for item in &mut state.evidence {
                    if item.id == *evidence_id {
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

    if input.observation.is_some() && input.confirmation.is_none() {
        if let Some(committed) = state.committed_track.clone() {
            if should_reopen_commitment(&input.domain_pack, &analysis, &committed) {
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
            let targets_pending = analysis.eligible_track.as_deref()
                == Some(confirmation.track_id.as_str());
            let targets_committed = state.committed_track.as_deref()
                == Some(confirmation.track_id.as_str());
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

    state.turn = next_turn;
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
    let ocel_log = serde_json::to_value(ocel).map_err(|error| SessionError::Serialization {
        reason: error.to_string(),
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
