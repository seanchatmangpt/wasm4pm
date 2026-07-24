mod interview_assist_support;

use interview_assist_support::{domain_pack, first_response, request};
use wasm4pm_cognition::interview_assist::{
    run_interview_assist_request, InterviewAssistConfirmation,
    InterviewAssistConfirmationChoice,
};

#[test]
fn first_turn_returns_success_and_confirmation_prompt() {
    let response = first_response();
    assert!(response.result.is_some());
    assert!(response.refusal.is_none());
    assert!(response.confirmation.is_some());
}

#[test]
fn accepted_confirmation_commits_pending_track() {
    let first = first_response();
    let prompt = first.confirmation.clone().expect("pending confirmation");
    let state = first.result.expect("success").state;
    let mut next = request();
    next.event = None;
    next.state.revision = state.revision;
    next.state.phase = state.cognition.phase.clone();
    next.state.confirmed_track = state.cognition.committed_track.clone();
    next.previous_state = Some(state);
    next.confirmation = Some(InterviewAssistConfirmation {
        track_id: prompt.track_id.clone(),
        choice: InterviewAssistConfirmationChoice::Yes,
    });

    let response = run_interview_assist_request(domain_pack(), next);
    assert!(response.refusal.is_none());
    assert_eq!(
        response
            .cognition_state
            .expect("cognition state")
            .confirmed_track
            .as_deref(),
        Some(prompt.track_id.as_str())
    );
}

#[test]
fn rejected_confirmation_does_not_commit_track() {
    let first = first_response();
    let prompt = first.confirmation.clone().expect("pending confirmation");
    let state = first.result.expect("success").state;
    let mut next = request();
    next.event = None;
    next.state.revision = state.revision;
    next.state.phase = state.cognition.phase.clone();
    next.state.confirmed_track = state.cognition.committed_track.clone();
    next.previous_state = Some(state);
    next.confirmation = Some(InterviewAssistConfirmation {
        track_id: prompt.track_id,
        choice: InterviewAssistConfirmationChoice::No,
    });

    let response = run_interview_assist_request(domain_pack(), next);
    assert!(response.refusal.is_none());
    assert!(response
        .cognition_state
        .expect("cognition state")
        .confirmed_track
        .is_none());
}

#[test]
fn abstention_refuses_without_advancing_state() {
    let first = first_response();
    let prompt = first.confirmation.clone().expect("pending confirmation");
    let state = first.result.expect("success").state;
    let mut next = request();
    next.event = None;
    next.state.revision = state.revision;
    next.state.phase = state.cognition.phase.clone();
    next.state.confirmed_track = state.cognition.committed_track.clone();
    next.previous_state = Some(state);
    next.confirmation = Some(InterviewAssistConfirmation {
        track_id: prompt.track_id,
        choice: InterviewAssistConfirmationChoice::NotSure,
    });

    let response = run_interview_assist_request(domain_pack(), next);
    assert_eq!(
        response.refusal.expect("refusal").code,
        "CONFIRMATION_ABSTAINED"
    );
    assert!(response.result.is_none());
}
