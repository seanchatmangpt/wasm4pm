#![allow(dead_code, unused_imports)]

use std::collections::{BTreeMap, BTreeSet};

use serde_json::{json, Value};
use wasm4pm_cognition::session::{
    run_session_turn, verify_session_state, Confirmation, DomainPack, Observation, SessionError,
    SessionState, SessionTurnInput, SessionTurnOutput,
};

const PROTOCOL_VERSION: u64 = 1;
const REQUEST_ID: &str = "request-two-sum-001";
const SESSION_ID: &str = "session-python-001";
const EVENT_ID: &str = "event-transcript-001";
const QUESTION: &str = "Given an array of integers and a target, return the indices of two numbers whose values add up to the target.";
const TWO_POINTER_CORRECTION: &str =
    "The array is sorted. Use two pointers with left and right indices toward the target sum.";
const BRUTE_FORCE_CORRECTION: &str =
    "Use brute force with a nested loop over all pairs and compare every pair to the target.";

fn domain_pack() -> DomainPack {
    serde_json::from_value(json!({
        "version": "2",
        "id": "interview-assist-two-sum-contract-v1",
        "concepts": {
            "array_values": {"label": "Array values", "prompt": "Identify the integer array and its values."},
            "target_sum": {"label": "Target sum", "prompt": "Identify the target sum constraint."},
            "pair_indices": {"label": "Pair indices", "prompt": "Return the indices for exactly two values."},
            "complement_lookup": {"label": "Complement lookup", "prompt": "Track seen values by the complement needed for the target."},
            "sorted_scan": {"label": "Sorted scan", "prompt": "Use left and right pointers on sorted input."},
            "nested_scan": {"label": "Nested scan", "prompt": "Compare candidate pairs with bounded nested iteration."}
        },
        "tracks": [
            {"id": "hash_lookup", "label": "Complement lookup for pair indices", "concepts": ["array_values", "target_sum", "pair_indices", "complement_lookup"]},
            {"id": "two_pointer", "label": "Two-pointer scan over sorted values", "concepts": ["array_values", "target_sum", "pair_indices", "sorted_scan"]},
            {"id": "brute_force", "label": "Bounded pair enumeration", "concepts": ["array_values", "target_sum", "pair_indices", "nested_scan"]}
        ],
        "patterns": [
            {"id": "array-observed", "phrases": ["array of integers", "array"], "proposition": "has_array", "track_weights": {"hash_lookup": 0.35, "two_pointer": 0.15, "brute_force": 0.10}, "concept": "array_values"},
            {"id": "target-observed", "phrases": ["target"], "proposition": "has_target", "track_weights": {"hash_lookup": 0.35, "two_pointer": 0.15, "brute_force": 0.10}, "concept": "target_sum"},
            {"id": "indices-requested", "phrases": ["indices", "index"], "proposition": "asks_indices", "track_weights": {"hash_lookup": 0.40, "two_pointer": 0.20, "brute_force": 0.15}, "concept": "pair_indices"},
            {"id": "pair-requested", "phrases": ["two numbers", "two values", "pair"], "proposition": "asks_pair", "track_weights": {"hash_lookup": 0.30, "two_pointer": 0.20, "brute_force": 0.15}},
            {"id": "sum-requested", "phrases": ["add up", "sum"], "proposition": "asks_sum", "track_weights": {"hash_lookup": 0.30, "two_pointer": 0.20, "brute_force": 0.15}},
            {"id": "complement-strategy", "phrases": ["hash map", "hashmap", "complement", "lookup"], "proposition": "uses_complement", "track_weights": {"hash_lookup": 0.90}, "concept": "complement_lookup"},
            {"id": "sorted-array-correction", "phrases": ["array is sorted"], "proposition": "sorted_array", "track_weights": {"two_pointer": 0.85}, "concept": "array_values"},
            {"id": "two-pointer-correction", "phrases": ["two pointers"], "proposition": "uses_two_pointers", "track_weights": {"two_pointer": 0.90}, "concept": "sorted_scan"},
            {"id": "left-right-correction", "phrases": ["left and right indices"], "proposition": "uses_left_right_indices", "track_weights": {"two_pointer": 0.85}, "concept": "pair_indices"},
            {"id": "target-sum-correction", "phrases": ["target sum"], "proposition": "uses_target_sum", "track_weights": {"two_pointer": 0.85}, "concept": "target_sum"},
            {"id": "all-pairs-correction", "phrases": ["all pairs"], "proposition": "enumerates_all_pairs", "track_weights": {"brute_force": 0.85}, "concept": "array_values"},
            {"id": "nested-loop-correction", "phrases": ["nested loop"], "proposition": "uses_nested_loop", "track_weights": {"brute_force": 0.85}, "concept": "pair_indices"},
            {"id": "brute-force-correction", "phrases": ["brute force"], "proposition": "uses_brute_force", "track_weights": {"brute_force": 0.90}, "concept": "nested_scan"},
            {"id": "pair-target-correction", "phrases": ["compare every pair to the target"], "proposition": "checks_pair_target", "track_weights": {"brute_force": 0.85}, "concept": "target_sum"}
        ],
        "rules": [],
        "phases": [
            {"id": "observing", "label": "Observing the interview question", "requires_committed_track": true, "required_concepts": []},
            {"id": "solving", "label": "Developing the confirmed solution", "requires_committed_track": true, "required_concepts": ["complement_lookup"]}
        ],
        "aliases": {},
        "thresholds": {"confidence": 0.85, "margin": 0.10, "minimum_coverage": 3, "concept_coverage": 0.25, "confirmation_required": true, "maximum_contradiction": 0.50},
        "bounds": {"max_turns": 32, "max_observations": 24, "max_evidence": 256, "max_observation_bytes": 4096, "max_tracks": 8, "max_patterns": 32, "max_rules": 16}
    }))
    .expect("valid deterministic InterviewAssist domain pack")
}

fn observation(id: &str, text: &str) -> Observation {
    Observation { id: id.to_string(), source: "interviewer".to_string(), text: text.to_string(), retract_evidence_ids: vec![] }
}

fn turn(previous_state: Option<SessionState>, observation: Option<Observation>, confirmation: Option<Confirmation>) -> Result<SessionTurnOutput, SessionError> {
    run_session_turn(&SessionTurnInput { domain_pack: domain_pack(), previous_state, observation, confirmation })
}

fn first_turn() -> SessionTurnOutput {
    turn(None, Some(observation(EVENT_ID, QUESTION)), None).expect("two-sum observation admitted")
}

fn observe_after(state: &SessionState, id: &str, text: &str) -> SessionTurnOutput {
    turn(Some(state.clone()), Some(observation(id, text)), None).expect("follow-up observation admitted")
}

fn confirm_after(state: &SessionState, accepted: bool) -> Result<SessionTurnOutput, SessionError> {
    let track_id = state.pending_confirmation.clone().expect("fixture must expose a pending confirmation");
    turn(Some(state.clone()), None, Some(Confirmation { track_id, accepted }))
}

fn consumer_request() -> Value {
    json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": REQUEST_ID,
        "session_id": SESSION_ID,
        "mode": "practice",
        "event": {"id": EVENT_ID, "kind": "transcript", "text": QUESTION},
        "state": {"phase": "OBSERVING", "revision": 0, "confirmed_track": null},
        "options": {"maximum_candidates": 3, "confirmation_threshold": 0.85}
    })
}

fn output_json(output: &SessionTurnOutput) -> Value {
    serde_json::to_value(output).expect("session output serializes as JSON")
}

fn candidate_ids(output: &SessionTurnOutput) -> Vec<String> {
    output.projection.hypotheses.iter().map(|candidate| candidate.id.clone()).collect()
}

fn replay_state(state: &SessionState) -> Result<SessionTurnOutput, SessionError> {
    let mut previous = None;
    let mut last = None;
    for record in &state.turns {
        let output = turn(previous, record.observation.clone(), record.confirmation.clone())?;
        previous = Some(output.state.clone());
        last = Some(output);
    }
    last.ok_or(SessionError::EmptyTurn)
}

fn json_contains_rust_debug_text(value: &Value) -> bool {
    let encoded = serde_json::to_string(value).expect("JSON serialization");
    ["Some(", "Ok(", "Err(", "EnumVariant("].iter().any(|needle| encoded.contains(needle))
}

fn assert_finite_json_numbers(value: &Value) {
    match value {
        Value::Array(items) => items.iter().for_each(assert_finite_json_numbers),
        Value::Object(fields) => fields.values().for_each(assert_finite_json_numbers),
        Value::Number(number) => if let Some(value) = number.as_f64() { assert!(value.is_finite(), "JSON number must be finite"); },
        _ => {}
    }
}

#[test]
fn observed_question_has_nonempty_human_readable_text() {
    let output = first_turn();
    assert!(output
        .state
        .observations
        .first()
        .is_some_and(|item| !item.text.trim().is_empty()));
}

#[test]
fn every_candidate_has_a_nonempty_label() {
    assert!(first_turn()
        .projection
        .hypotheses
        .iter()
        .all(|candidate| !candidate.label.trim().is_empty()));
}

#[test]
fn every_candidate_has_a_machine_stable_id() {
    let first = first_turn();
    let second = first_turn();
    assert_eq!(candidate_ids(&first), candidate_ids(&second));
    assert!(candidate_ids(&first).iter().all(|id| !id.trim().is_empty()));
}

#[test]
fn every_candidate_exposes_confidence_as_data_not_color() {
    let value = output_json(&first_turn());
    let candidates = value
        .pointer("/projection/hypotheses")
        .and_then(Value::as_array)
        .expect("candidate array");
    assert!(candidates
        .iter()
        .all(|candidate| candidate.get("score").is_some_and(Value::is_number)));
}

#[test]
fn confirmation_prompt_has_nonempty_question_text() {
    let value = output_json(&first_turn());
    assert!(value
        .pointer("/confirmation/question")
        .and_then(Value::as_str)
        .is_some_and(|text| !text.trim().is_empty()));
}

#[test]
fn confirmation_choices_have_stable_ids_and_readable_labels() {
    let value = output_json(&first_turn());
    let choices = value
        .pointer("/confirmation/choices")
        .and_then(Value::as_array)
        .expect("semantic confirmation choices");
    assert_eq!(choices.len(), 3);
    for choice in choices {
        assert!(choice
            .get("id")
            .and_then(Value::as_str)
            .is_some_and(|id| !id.trim().is_empty()));
        assert!(choice
            .get("label")
            .and_then(Value::as_str)
            .is_some_and(|label| !label.trim().is_empty()));
    }
}

#[test]
fn current_state_has_a_machine_value_and_readable_label() {
    let output = first_turn();
    assert!(!output.projection.phase.trim().is_empty());
    assert!(!output.projection.phase_label.trim().is_empty());
}

#[test]
fn successful_result_has_a_readable_status_summary() {
    let value = output_json(&first_turn());
    assert!(value
        .get("status_summary")
        .and_then(Value::as_str)
        .is_some_and(|summary| !summary.trim().is_empty()));
}

#[test]
fn refusal_has_a_readable_status_summary() {
    let error = turn(None, Some(observation(EVENT_ID, "")), None)
        .expect_err("empty transcript refusal");
    let value = serde_json::to_value(error).expect("refusal JSON");
    assert!(value
        .get("status_summary")
        .and_then(Value::as_str)
        .is_some_and(|summary| !summary.trim().is_empty()));
}

#[test]
fn recoverable_refusal_has_a_readable_recovery_instruction() {
    let error = turn(None, Some(observation(EVENT_ID, "")), None)
        .expect_err("empty transcript refusal");
    let value = serde_json::to_value(error).expect("refusal JSON");
    assert!(value
        .get("recovery_action")
        .and_then(Value::as_str)
        .is_some_and(|instruction| !instruction.trim().is_empty()));
}

#[test]
fn result_does_not_encode_status_only_as_visual_tokens() {
    let encoded = serde_json::to_string(&first_turn()).expect("output JSON").to_lowercase();
    for visual_token in ["aria-label", "css_class", "background-color", "icon-only"] {
        assert!(!encoded.contains(visual_token));
    }
    assert!(first_turn()
        .projection
        .hypotheses
        .iter()
        .all(|candidate| candidate.score.is_finite()));
}

#[test]
fn result_does_not_require_javascript_to_parse_rust_debug_text() {
    assert!(!json_contains_rust_debug_text(&output_json(&first_turn())));
}
