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
    ["Some(", "Ok(", "Err(", "EnumVariant("].iter().any(|needle| encoded.contains(*needle))
}

fn assert_finite_json_numbers(value: &Value) {
    match value {
        Value::Array(items) => items.iter().for_each(assert_finite_json_numbers),
        Value::Object(fields) => fields.values().for_each(assert_finite_json_numbers),
        Value::Number(number) => {
            if let Some(value) = number.as_f64() {
                assert!(value.is_finite(), "JSON number must be finite");
            }
        }
        _ => {}
    }
}

#[test]
fn same_request_and_same_state_produce_the_same_canonical_result() {
    let first = first_turn();
    let second = first_turn();
    assert_eq!(first, second);
}

#[test]
fn same_request_produces_the_same_candidate_order() {
    let first = first_turn();
    let second = first_turn();
    assert_eq!(candidate_ids(&first), candidate_ids(&second));
}

#[test]
fn same_request_produces_the_same_confirmation_question() {
    let first = first_turn();
    let second = first_turn();
    assert_eq!(first.state.pending_confirmation, second.state.pending_confirmation);
    let first_json = output_json(&first);
    let second_json = output_json(&second);
    assert_eq!(first_json.get("confirmation"), second_json.get("confirmation"));
}

#[test]
fn candidate_order_does_not_depend_on_hashmap_iteration() {
    let expected = candidate_ids(&first_turn());
    for _ in 0..16 {
        assert_eq!(candidate_ids(&first_turn()), expected);
    }
}

#[test]
fn constraint_order_is_stable() {
    let first = output_json(&first_turn());
    let second = output_json(&first_turn());
    let first_constraints = first
        .get("detected_constraints")
        .expect("constraints must be explicit semantic data");
    assert_eq!(second.get("detected_constraints"), Some(first_constraints));
}

#[test]
fn evidence_order_is_stable() {
    let first = first_turn();
    let second = first_turn();
    let first_order: Vec<_> = first
        .state
        .evidence
        .iter()
        .map(|item| (&item.pattern_id, &item.matched_phrase))
        .collect();
    let second_order: Vec<_> = second
        .state
        .evidence
        .iter()
        .map(|item| (&item.pattern_id, &item.matched_phrase))
        .collect();
    assert_eq!(first_order, second_order);
}

#[test]
fn canonical_serialization_is_stable() {
    let first = serde_json::to_string(&first_turn()).expect("canonical JSON");
    let second = serde_json::to_string(&first_turn()).expect("canonical JSON");
    assert_eq!(first, second);
}

#[test]
fn canonical_output_hash_is_stable() {
    let first = first_turn();
    let second = first_turn();
    assert_eq!(first.receipt.output_hash, second.receipt.output_hash);
}

#[test]
fn changing_the_transcript_changes_the_output_hash() {
    let original = first_turn();
    let changed = turn(
        None,
        Some(observation(
            EVENT_ID,
            "Given a sorted array, use two pointers to find a target sum.",
        )),
        None,
    )
    .expect("changed transcript admitted");
    assert_ne!(original.receipt.output_hash, changed.receipt.output_hash);
}

#[test]
fn changing_confirmation_changes_the_output_hash() {
    let first = first_turn();
    let accepted = confirm_after(&first.state, true).expect("accepted confirmation");
    let rejected = confirm_after(&first.state, false).expect("rejected confirmation");
    assert_ne!(accepted.receipt.output_hash, rejected.receipt.output_hash);
}

#[test]
fn changing_session_identity_changes_the_receipt_identity() {
    let mut session_a = consumer_request();
    let mut session_b = consumer_request();
    session_a["session_id"] = json!("session-python-a");
    session_b["session_id"] = json!("session-python-b");
    assert_ne!(session_a["session_id"], session_b["session_id"]);

    let output_a = first_turn();
    let output_b = first_turn();
    assert_ne!(
        output_a.receipt.combined_hash, output_b.receipt.combined_hash,
        "session identity must participate in receipt identity"
    );
}

#[test]
fn equivalent_json_key_order_does_not_change_semantic_output() {
    let input = SessionTurnInput {
        domain_pack: domain_pack(),
        previous_state: None,
        observation: Some(observation(EVENT_ID, QUESTION)),
        confirmation: None,
    };
    let ordinary = serde_json::to_value(&input).expect("input JSON");
    let object = ordinary.as_object().expect("input object");
    let reordered = Value::Object(
        ["confirmation", "observation", "previous_state", "domain_pack"]
            .into_iter()
            .map(|key| (key.to_string(), object.get(key).cloned().unwrap_or(Value::Null)))
            .collect(),
    );
    let ordinary: SessionTurnInput = serde_json::from_value(ordinary).expect("ordinary input");
    let reordered: SessionTurnInput = serde_json::from_value(reordered).expect("reordered input");
    let ordinary = run_session_turn(&ordinary).expect("ordinary run");
    let reordered = run_session_turn(&reordered).expect("reordered run");
    assert_eq!(ordinary, reordered);
}
