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

fn error_code(error: &SessionError) -> String {
    serde_json::to_value(error)
        .expect("typed refusal JSON")
        .get("code")
        .and_then(Value::as_str)
        .expect("stable refusal code")
        .to_string()
}

#[test]
fn malformed_json_returns_a_typed_refusal() {
    let parse_error = serde_json::from_str::<SessionTurnInput>("{")
        .expect_err("malformed JSON must not deserialize");
    let refusal = SessionError::MalformedInput {
        reason: parse_error.to_string(),
    };
    assert_eq!(error_code(&refusal), "MALFORMED_INPUT");
}

#[test]
fn unknown_breed_returns_a_typed_refusal() {
    let first = first_turn();
    let error = turn(
        Some(first.state),
        None,
        Some(Confirmation {
            track_id: "unknown-breed".to_string(),
            accepted: true,
        }),
    )
    .expect_err("unknown cognition selector must refuse");
    assert_eq!(error_code(&error), "UNKNOWN_TRACK");
}

#[test]
fn empty_transcript_returns_a_typed_refusal() {
    let error = turn(None, Some(observation(EVENT_ID, "   ")), None)
        .expect_err("empty transcript must refuse");
    assert_eq!(error_code(&error), "EMPTY_OBSERVATION");
}

#[test]
fn missing_request_id_returns_a_typed_refusal() {
    let mut request = consumer_request();
    request.as_object_mut().expect("request object").remove("request_id");
    let result = first_turn();
    let value = output_json(&result);
    assert_eq!(
        value.pointer("/refusal/code").and_then(Value::as_str),
        Some("MISSING_REQUEST_ID")
    );
}

#[test]
fn missing_session_id_returns_a_typed_refusal() {
    let mut request = consumer_request();
    request.as_object_mut().expect("request object").remove("session_id");
    let result = first_turn();
    let value = output_json(&result);
    assert_eq!(
        value.pointer("/refusal/code").and_then(Value::as_str),
        Some("MISSING_SESSION_ID")
    );
}

#[test]
fn missing_event_returns_a_typed_refusal() {
    let error = turn(None, None, None).expect_err("missing event must refuse");
    assert_eq!(error_code(&error), "EMPTY_TURN");
}

#[test]
fn unsupported_event_kind_returns_a_typed_refusal() {
    let mut request = consumer_request();
    request["event"]["kind"] = json!("video-frame");
    let parse_error = serde_json::from_value::<SessionTurnInput>(request)
        .expect_err("unsupported consumer event is not currently admitted");
    let refusal = SessionError::MalformedInput {
        reason: parse_error.to_string(),
    };
    assert_eq!(error_code(&refusal), "MALFORMED_INPUT");
}

#[test]
fn invalid_confirmation_choice_returns_a_typed_refusal() {
    let invalid = json!({"track_id": "hash_lookup", "accepted": "maybe"});
    let parse_error = serde_json::from_value::<Confirmation>(invalid)
        .expect_err("invalid confirmation choice must refuse");
    let refusal = SessionError::MalformedInput {
        reason: parse_error.to_string(),
    };
    assert_eq!(error_code(&refusal), "MALFORMED_INPUT");
}

#[test]
fn stale_state_revision_returns_a_typed_refusal() {
    let mut stale = first_turn().state;
    stale.turn += 1;
    let error = turn(
        Some(stale),
        Some(observation("event-after-stale-state", "hash map complement")),
        None,
    )
    .expect_err("stale revision must refuse");
    assert!(matches!(error, SessionError::InvalidState { .. } | SessionError::StateHashMismatch));
}

#[test]
fn oversized_input_is_bounded_or_refused() {
    let text = "x".repeat(domain_pack().bounds.max_observation_bytes + 1);
    let error = turn(None, Some(observation(EVENT_ID, &text)), None)
        .expect_err("oversized observation must refuse");
    assert_eq!(error_code(&error), "OBSERVATION_TOO_LARGE");
}

#[test]
fn runtime_unavailable_does_not_return_success() {
    let mut pack = domain_pack();
    pack.patterns.clear();
    let result = run_session_turn(&SessionTurnInput {
        domain_pack: pack,
        previous_state: None,
        observation: Some(observation(EVENT_ID, QUESTION)),
        confirmation: None,
    });
    assert!(matches!(result, Err(SessionError::InvalidDomain { .. })));
}

#[test]
fn refusal_contains_a_stable_machine_code() {
    let error = turn(None, None, None).expect_err("empty turn refusal");
    assert_eq!(error_code(&error), "EMPTY_TURN");
}

#[test]
fn refusal_contains_a_human_readable_message() {
    let error = turn(None, None, None).expect_err("empty turn refusal");
    assert!(!error.to_string().trim().is_empty());
}

#[test]
fn refusal_contains_a_recovery_action_when_recovery_is_possible() {
    let error = turn(None, Some(observation(EVENT_ID, "")), None)
        .expect_err("empty transcript refusal");
    let value = serde_json::to_value(error).expect("refusal JSON");
    assert!(value
        .get("recovery_action")
        .and_then(Value::as_str)
        .is_some_and(|action| !action.trim().is_empty()));
}

#[test]
fn refusal_does_not_advance_canonical_state() {
    let first = first_turn();
    let snapshot = first.state.clone();
    let result = turn(
        Some(first.state),
        Some(observation("event-empty", "")),
        None,
    );
    assert!(result.is_err());
    assert_eq!(snapshot.turn, 1);
    verify_session_state(&domain_pack(), &snapshot).expect("prior state remains valid");
}

#[test]
fn refusal_does_not_include_a_confirmed_track() {
    let error = turn(None, Some(observation(EVENT_ID, "")), None)
        .expect_err("empty transcript refusal");
    let value = serde_json::to_value(error).expect("refusal JSON");
    assert!(value.get("confirmed_track").is_none_or(Value::is_null));
}
