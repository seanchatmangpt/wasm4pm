mod interview_assist_scenario;
mod interview_assist_support;

use interview_assist_scenario::{first_response, InterviewAssistResponseExt};
use interview_assist_support::{REQUEST_ID, SESSION_ID};
use serde_json::Value;
use wasm4pm_cognition::interview_assist::INTERVIEW_ASSIST_PROTOCOL_VERSION;

#[test]
fn response_is_valid_utf8_json() {
    let encoded = serde_json::to_vec(&first_response()).expect("valid JSON bytes");
    assert!(std::str::from_utf8(&encoded).is_ok());
}

#[test]
fn response_echoes_protocol_and_identity() {
    let response = first_response();
    response.assert_success();
    assert_eq!(response.protocol_version, INTERVIEW_ASSIST_PROTOCOL_VERSION);
    assert_eq!(response.request_id, REQUEST_ID);
    assert_eq!(response.session_id, SESSION_ID);
    assert_eq!(response.verb, "run");
    assert!(!response.breed.trim().is_empty());
}

#[test]
fn response_contains_consumer_projection() {
    let response = first_response();
    response.assert_success();
    assert!(response.observed_question.is_some());
    assert!(!response.detected_constraints.is_empty());
    assert!(!response.candidates.is_empty());
    assert!(response.cognition_state.is_some());
}

#[test]
fn success_and_refusal_are_mutually_exclusive() {
    let response = first_response();
    assert_ne!(response.result.is_some(), response.refusal.is_some());
}

#[test]
fn response_contains_no_rust_debug_encoding() {
    let encoded = serde_json::to_string(&first_response()).expect("response JSON string");
    for marker in ["Some(", "Ok(", "Err("] {
        assert!(!encoded.contains(marker));
    }
}

#[test]
fn every_json_number_is_finite() {
    fn assert_finite(value: &Value) {
        match value {
            Value::Array(items) => items.iter().for_each(assert_finite),
            Value::Object(fields) => fields.values().for_each(assert_finite),
            Value::Number(number) => {
                if let Some(value) = number.as_f64() {
                    assert!(value.is_finite());
                }
            }
            _ => {}
        }
    }

    assert_finite(&serde_json::to_value(first_response()).expect("response JSON"));
}
