mod interview_assist_scenario;
mod interview_assist_support;

use interview_assist_scenario::{
    first_response, InterviewAssistResponseExt, InterviewAssistScenario,
};

#[test]
fn session_identity_is_echoed_and_persisted() {
    let response = first_response();
    assert_eq!(response.session_id, response.success_state().session_id);
}

#[test]
fn changing_session_identity_changes_response_identity() {
    let first = first_response();
    let second = InterviewAssistScenario::new()
        .session("session-python-002")
        .run();
    assert_ne!(first.session_id, second.session_id);
}

#[test]
fn state_cannot_cross_session_boundary() {
    let first = first_response();
    InterviewAssistScenario::continuing_from(&first)
        .session("session-python-other")
        .run()
        .assert_refusal("SESSION_ID_MISMATCH");
}

#[test]
fn state_revision_is_bound_to_canonical_turn() {
    let response = first_response();
    let state = response.success_state();
    assert_eq!(state.revision, state.cognition.turn);
}

#[test]
fn independent_sessions_do_not_share_state_hashes_after_different_input() {
    let first = first_response();
    let second = InterviewAssistScenario::new()
        .session("session-python-002")
        .transcript(
            "event-transcript-001",
            "Use brute force with a nested loop over all pairs.",
        )
        .run();

    assert_ne!(
        first.success_state().cognition.state_hash,
        second.success_state().cognition.state_hash
    );
}
