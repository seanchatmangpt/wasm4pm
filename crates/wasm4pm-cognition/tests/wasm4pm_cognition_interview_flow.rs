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

use std::sync::{Mutex, OnceLock};

#[test]
fn transcript_event_produces_candidate_tracks() {
    assert!(!first_turn().projection.hypotheses.is_empty());
}

#[test]
fn two_sum_transcript_produces_a_relevant_problem_hypothesis() {
    let output = first_turn();
    let leading = output.projection.hypotheses.first().expect("leading hypothesis");
    let evidence_text = output
        .state
        .evidence
        .iter()
        .filter(|item| leading.evidence_ids.contains(&item.id))
        .map(|item| item.matched_phrase.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let semantic_text = format!("{} {evidence_text}", leading.label).to_lowercase();
    for required in ["array", "target", "indices"] {
        assert!(semantic_text.contains(required), "missing semantic evidence: {required}");
    }
    assert!(semantic_text.contains("two numbers") || semantic_text.contains("pair"));
    assert!(semantic_text.contains("add up") || semantic_text.contains("sum"));
}

#[test]
fn candidate_tracks_are_ranked_by_confidence() {
    let output = first_turn();
    assert!(output
        .projection
        .hypotheses
        .windows(2)
        .all(|pair| pair[0].score >= pair[1].score));
}

#[test]
fn low_confidence_produces_one_scoped_confirmation_question() {
    let output = first_turn();
    assert!(output.state.committed_track.is_none());
    assert!(output.state.pending_confirmation.is_some());
    let value = output_json(&output);
    let prompts = value
        .get("confirmation")
        .and_then(Value::as_object)
        .and_then(|item| item.get("question"))
        .into_iter()
        .count();
    assert_eq!(prompts, 1);
}

#[test]
fn confirmation_question_offers_yes_no_and_correct_choices() {
    let value = output_json(&first_turn());
    let choices = value
        .pointer("/confirmation/choices")
        .and_then(Value::as_array)
        .expect("confirmation choices must be semantic data");
    let ids: BTreeSet<_> = choices
        .iter()
        .filter_map(|choice| choice.get("id").and_then(Value::as_str))
        .collect();
    assert_eq!(ids, BTreeSet::from(["correct", "no", "yes"]));
}

#[test]
fn yes_confirmation_selects_the_proposed_track() {
    let first = first_turn();
    let expected = first.state.pending_confirmation.clone();
    let confirmed = confirm_after(&first.state, true).expect("eligible confirmation admitted");
    assert_eq!(confirmed.state.committed_track, expected);
    assert!(confirmed.state.pending_confirmation.is_none());
}

#[test]
fn no_confirmation_does_not_select_the_rejected_track() {
    let first = first_turn();
    let rejected = first.state.pending_confirmation.clone().expect("pending track");
    let output = confirm_after(&first.state, false).expect("eligible rejection admitted");
    assert_ne!(output.state.committed_track.as_deref(), Some(rejected.as_str()));
    assert!(output.state.rejected_tracks.contains(&rejected));
}

#[test]
fn correction_event_recomputes_the_candidate_set() {
    let first = first_turn();
    let corrected = observe_after(&first.state, "event-correction-001", TWO_POINTER_CORRECTION);
    assert_ne!(candidate_ids(&first), candidate_ids(&corrected));
    assert_eq!(
        corrected.projection.hypotheses.first().map(|item| item.id.as_str()),
        Some("two_pointer")
    );
}

#[test]
fn confirmed_track_advances_the_canonical_cognition_state() {
    let first = first_turn();
    assert_eq!(first.state.phase, "observing");
    let confirmed = confirm_after(&first.state, true).expect("confirmation admitted");
    assert_ne!(confirmed.state.phase, first.state.phase);
    assert_eq!(confirmed.state.phase, "solving");
}

#[test]
fn normal_flow_does_not_require_a_manual_advance_phase_event() {
    let first = first_turn();
    let confirmed = confirm_after(&first.state, true).expect("confirmation admitted");
    assert!(confirmed
        .inference_trace
        .iter()
        .any(|step| step.kind == "advance-phase"));
    assert!(confirmed
        .state
        .observations
        .iter()
        .all(|event| !event.text.contains("advance phase")));
}

#[test]
fn normal_flow_does_not_require_an_add_track_candidate_event() {
    let output = first_turn();
    assert!(output
        .state
        .observations
        .iter()
        .all(|event| !event.text.contains("add track candidate")));
    assert_eq!(output.projection.hypotheses.len(), domain_pack().tracks.len());
}

#[test]
fn normal_flow_does_not_require_an_llm_request() {
    let output = first_turn();
    let trace = serde_json::to_string(&output.inference_trace).expect("trace JSON");
    assert!(!trace.to_lowercase().contains("llm"));
    assert!(!trace.to_lowercase().contains("ollama"));
}

#[test]
fn live_cognition_path_does_not_require_ollama() {
    static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let _guard = ENV_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .expect("environment mutex");

    let names = ["OLLAMA_HOST", "OLLAMA_BASE_URL", "OLLAMA_API_BASE"];
    let previous: Vec<_> = names.iter().map(|name| (*name, std::env::var(name).ok())).collect();
    for name in names {
        std::env::set_var(name, "http://127.0.0.1:9");
    }

    let result = turn(None, Some(observation(EVENT_ID, QUESTION)), None);

    for (name, value) in previous {
        match value {
            Some(value) => std::env::set_var(name, value),
            None => std::env::remove_var(name),
        }
    }

    let output = result.expect("live cognition must be local and independent of Ollama");
    assert_eq!(
        output.projection.hypotheses.first().map(|item| item.id.as_str()),
        Some("hash_lookup")
    );
}
