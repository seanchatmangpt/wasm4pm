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

fn confirmed_session() -> SessionTurnOutput {
    let first = first_turn();
    confirm_after(&first.state, true).expect("confirmation admitted")
}

#[test]
fn successful_cognition_result_can_be_replayed() {
    let output = confirmed_session();
    verify_session_state(&domain_pack(), &output.state).expect("canonical state replay verifies");
    assert_eq!(replay_state(&output.state).expect("replay succeeds").state, output.state);
}

#[test]
fn replay_reproduces_the_same_observed_question() {
    let output = confirmed_session();
    let replayed = replay_state(&output.state).expect("replay succeeds");
    assert_eq!(replayed.state.observations, output.state.observations);
    assert_eq!(replayed.state.observations[0].text, QUESTION);
}

#[test]
fn replay_reproduces_the_same_constraints() {
    let output = confirmed_session();
    let replayed = replay_state(&output.state).expect("replay succeeds");
    let original = output_json(&output);
    let replay = output_json(&replayed);
    let original_constraints = original
        .get("detected_constraints")
        .expect("constraints are canonical replay data");
    assert_eq!(replay.get("detected_constraints"), Some(original_constraints));
}

#[test]
fn replay_reproduces_the_same_candidate_ids() {
    let output = confirmed_session();
    let replayed = replay_state(&output.state).expect("replay succeeds");
    let original: BTreeSet<_> = candidate_ids(&output).into_iter().collect();
    let replayed: BTreeSet<_> = candidate_ids(&replayed).into_iter().collect();
    assert_eq!(replayed, original);
}

#[test]
fn replay_reproduces_the_same_candidate_order() {
    let output = confirmed_session();
    let replayed = replay_state(&output.state).expect("replay succeeds");
    assert_eq!(candidate_ids(&replayed), candidate_ids(&output));
}

#[test]
fn replay_reproduces_the_same_confirmed_track() {
    let output = confirmed_session();
    let replayed = replay_state(&output.state).expect("replay succeeds");
    assert_eq!(replayed.state.committed_track, output.state.committed_track);
}

#[test]
fn replay_reproduces_the_same_abstention_state() {
    let output = confirmed_session();
    let replayed = replay_state(&output.state).expect("replay succeeds");
    assert_eq!(
        output_json(&replayed).get("abstention"),
        output_json(&output).get("abstention")
    );
}

#[test]
fn replay_reproduces_the_same_canonical_output_hash() {
    let output = confirmed_session();
    let replayed = replay_state(&output.state).expect("replay succeeds");
    assert_eq!(replayed.receipt.output_hash, output.receipt.output_hash);
    assert_eq!(replayed.receipt.combined_hash, output.receipt.combined_hash);
}

#[test]
fn tampered_input_is_rejected_during_replay() {
    let mut state = confirmed_session().state;
    state.turns[0]
        .observation
        .as_mut()
        .expect("first observation")
        .text = "tampered question".to_string();
    assert!(verify_session_state(&domain_pack(), &state).is_err());
}

#[test]
fn tampered_candidate_confidence_is_detected() {
    let mut state = confirmed_session().state;
    state.hypotheses[0].score = 0.01;
    assert!(verify_session_state(&domain_pack(), &state).is_err());
}

#[test]
fn tampered_confirmed_track_is_detected() {
    let mut state = confirmed_session().state;
    state.committed_track = Some("brute_force".to_string());
    assert!(verify_session_state(&domain_pack(), &state).is_err());
}

#[test]
fn tampered_previous_receipt_hash_is_detected() {
    let mut state = confirmed_session().state;
    state.previous_state_hash = Some("f".repeat(64));
    assert!(verify_session_state(&domain_pack(), &state).is_err());
}

#[test]
fn replay_does_not_call_an_llm() {
    let output = confirmed_session();
    let replayed = replay_state(&output.state).expect("replay succeeds without an LLM");
    let encoded = serde_json::to_string(&replayed).expect("replay JSON").to_lowercase();
    assert!(!encoded.contains("ollama"));
    assert!(!encoded.contains("llm_request"));
}

#[test]
fn replay_does_not_depend_on_wall_clock_time() {
    let output = confirmed_session();
    let first = replay_state(&output.state).expect("first replay");
    let second = replay_state(&output.state).expect("second replay");
    assert_eq!(first.receipt, second.receipt);
    assert_eq!(first.state, second.state);
}
