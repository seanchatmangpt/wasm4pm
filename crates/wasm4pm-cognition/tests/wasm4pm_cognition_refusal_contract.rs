mod interview_assist_support;

use interview_assist_support::{domain_pack, first_response, refusal_code, request};
use serde_json::json;
use wasm4pm_cognition::interview_assist::{
    run_interview_assist_json, run_interview_assist_request,
};

#[test]
fn malformed_json_returns_typed_refusal() {
    let response = run_interview_assist_json(domain_pack(), b"{");
    assert_eq!(refusal_code(&response), Some("MALFORMED_INPUT"));
    assert!(response.result.is_none());
}

#[test]
fn missing_request_id_returns_typed_refusal() {
    let mut value = serde_json::to_value(request()).expect("request JSON");
    value.as_object_mut().expect("request object").remove("request_id");
    let bytes = serde_json::to_vec(&value).expect("request bytes");
    let response = run_interview_assist_json(domain_pack(), &bytes);
    assert_eq!(refusal_code(&response), Some("MISSING_REQUEST_ID"));
}

#[test]
fn missing_session_id_returns_typed_refusal() {
    let mut value = serde_json::to_value(request()).expect("request JSON");
    value.as_object_mut().expect("request object").remove("session_id");
    let bytes = serde_json::to_vec(&value).expect("request bytes");
    let response = run_interview_assist_json(domain_pack(), &bytes);
    assert_eq!(refusal_code(&response), Some("MISSING_SESSION_ID"));
}

#[test]
fn unsupported_event_kind_returns_typed_refusal() {
    let mut value = serde_json::to_value(request()).expect("request JSON");
    value["event"]["kind"] = json!("video-frame");
    let bytes = serde_json::to_vec(&value).expect("request bytes");
    let response = run_interview_assist_json(domain_pack(), &bytes);
    assert_eq!(refusal_code(&response), Some("UNSUPPORTED_EVENT_KIND"));
}

#[test]
fn empty_transcript_returns_recoverable_refusal() {
    let mut input = request();
    input.event.as_mut().expect("event").text = "   ".to_string();
    let response = run_interview_assist_request(domain_pack(), input);
    let refusal = response.refusal.expect("typed refusal");
    assert_eq!(refusal.code, "EMPTY_TRANSCRIPT");
    assert_eq!(
        refusal.recovery_action.as_deref(),
        Some("supply_non_empty_transcript")
    );
}

#[test]
fn stale_revision_returns_typed_refusal() {
    let first = first_response();
    let state = first.result.expect("success").state;
    let mut next = request();
    next.previous_state = Some(state.clone());
    next.state.revision = state.revision + 1;
    let response = run_interview_assist_request(domain_pack(), next);
    assert_eq!(refusal_code(&response), Some("STALE_STATE_REVISION"));
}

#[test]
fn refusal_never_contains_success_or_receipt() {
    let response = run_interview_assist_json(domain_pack(), b"{");
    assert!(response.refusal.is_some());
    assert!(response.result.is_none());
    assert!(response.receipt.is_none());
}
