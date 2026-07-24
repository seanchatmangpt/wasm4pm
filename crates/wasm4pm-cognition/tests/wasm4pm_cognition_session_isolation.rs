mod interview_assist_support;

use interview_assist_support::{domain_pack, first_response, refusal_code, request};
use wasm4pm_cognition::interview_assist::run_interview_assist_request;

#[test]
fn session_identity_is_echoed_and_persisted() {
    let response = first_response();
    let state = response.result.expect("success").state;
    assert_eq!(response.session_id, state.session_id);
}

#[test]
fn changing_session_identity_changes_response_identity() {
    let first = first_response();
    let mut second_request = request();
    second_request.session_id = "session-python-002".to_string();
    let second = run_interview_assist_request(domain_pack(), second_request);
    assert_ne!(first.session_id, second.session_id);
}

#[test]
fn state_cannot_cross_session_boundary() {
    let first = first_response();
    let state = first.result.expect("success").state;
    let mut next = request();
    next.session_id = "session-python-other".to_string();
    next.state.revision = state.revision;
    next.state.phase = state.cognition.phase.clone();
    next.state.confirmed_track = state.cognition.committed_track.clone();
    next.previous_state = Some(state);

    let response = run_interview_assist_request(domain_pack(), next);
    assert_eq!(refusal_code(&response), Some("SESSION_ID_MISMATCH"));
}

#[test]
fn state_revision_is_bound_to_canonical_turn() {
    let response = first_response();
    let state = response.result.expect("success").state;
    assert_eq!(state.revision, state.cognition.turn);
}

#[test]
fn independent_sessions_do_not_share_state_hashes_after_different_input() {
    let first = first_response();
    let mut second_request = request();
    second_request.session_id = "session-python-002".to_string();
    second_request.event.as_mut().expect("event").text =
        "Use brute force with a nested loop over all pairs.".to_string();
    let second = run_interview_assist_request(domain_pack(), second_request);

    let first_hash = first
        .result
        .expect("first success")
        .state
        .cognition
        .state_hash;
    let second_hash = second
        .result
        .expect("second success")
        .state
        .cognition
        .state_hash;
    assert_ne!(first_hash, second_hash);
}
