mod interview_assist_scenario;
mod interview_assist_support;

use interview_assist_scenario::{
    first_response, InterviewAssistResponseExt, InterviewAssistScenario,
};
use serde_json::json;

#[test]
fn malformed_json_returns_typed_refusal() {
    InterviewAssistScenario::run_json(b"{").assert_refusal("MALFORMED_INPUT");
}

#[test]
fn missing_request_id_returns_typed_refusal() {
    let bytes = InterviewAssistScenario::new().json(|value| {
        value
            .as_object_mut()
            .expect("request object")
            .remove("request_id");
    });
    InterviewAssistScenario::run_json(&bytes).assert_refusal("MISSING_REQUEST_ID");
}

#[test]
fn missing_session_id_returns_typed_refusal() {
    let bytes = InterviewAssistScenario::new().json(|value| {
        value
            .as_object_mut()
            .expect("request object")
            .remove("session_id");
    });
    InterviewAssistScenario::run_json(&bytes).assert_refusal("MISSING_SESSION_ID");
}

#[test]
fn unsupported_event_kind_returns_typed_refusal() {
    let bytes = InterviewAssistScenario::new().json(|value| {
        value["event"]["kind"] = json!("video-frame");
    });
    InterviewAssistScenario::run_json(&bytes).assert_refusal("UNSUPPORTED_EVENT_KIND");
}

#[test]
fn empty_transcript_returns_recoverable_refusal() {
    let response = InterviewAssistScenario::new()
        .transcript("event-transcript-001", "   ")
        .run();
    response.assert_refusal("EMPTY_TRANSCRIPT");
    assert_eq!(
        response
            .refusal
            .expect("typed refusal")
            .recovery_action
            .as_deref(),
        Some("supply_non_empty_transcript")
    );
}

#[test]
fn stale_revision_returns_typed_refusal() {
    let first = first_response();
    InterviewAssistScenario::continuing_from(&first)
        .stale_revision(1)
        .run()
        .assert_refusal("STALE_STATE_REVISION");
}

#[test]
fn refusal_never_contains_success_or_receipt() {
    let response = InterviewAssistScenario::run_json(b"{");
    response.assert_refusal("MALFORMED_INPUT");
    assert!(response.receipt.is_none());
}
