#![allow(dead_code)]

use serde_json::json;
use wasm4pm_cognition::interview_assist::{
    InterviewAssistEvent, InterviewAssistEventKind, InterviewAssistMode, InterviewAssistOptions,
    InterviewAssistRequest, InterviewAssistResponse, InterviewAssistStateRef,
    INTERVIEW_ASSIST_PROTOCOL_VERSION,
};
use wasm4pm_cognition::session::DomainPack;

pub const REQUEST_ID: &str = "request-two-sum-001";
pub const SESSION_ID: &str = "session-python-001";
pub const EVENT_ID: &str = "event-transcript-001";
pub const QUESTION: &str = "Given an array of integers and a target, return the indices of two numbers whose values add up to the target.";

pub fn domain_pack() -> DomainPack {
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

pub fn request() -> InterviewAssistRequest {
    InterviewAssistRequest {
        protocol_version: INTERVIEW_ASSIST_PROTOCOL_VERSION,
        request_id: REQUEST_ID.to_string(),
        session_id: SESSION_ID.to_string(),
        mode: InterviewAssistMode::Practice,
        event: Some(InterviewAssistEvent {
            id: EVENT_ID.to_string(),
            kind: InterviewAssistEventKind::Transcript,
            text: QUESTION.to_string(),
            source: "interviewer".to_string(),
            retract_evidence_ids: Vec::new(),
        }),
        state: InterviewAssistStateRef {
            phase: "observing".to_string(),
            revision: 0,
            confirmed_track: None,
        },
        previous_state: None,
        confirmation: None,
        options: InterviewAssistOptions::default(),
    }
}

pub fn first_response() -> InterviewAssistResponse {
    wasm4pm_cognition::interview_assist::run_interview_assist_request(domain_pack(), request())
}

pub fn refusal_code(response: &InterviewAssistResponse) -> Option<&str> {
    response.refusal.as_ref().map(|refusal| refusal.code.as_str())
}
