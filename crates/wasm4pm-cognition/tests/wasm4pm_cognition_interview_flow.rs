mod interview_assist_scenario;
mod interview_assist_support;

use interview_assist_scenario::{
    first_response, InterviewAssistResponseExt, InterviewAssistScenario,
};
use wasm4pm_cognition::interview_assist::InterviewAssistConfirmationChoice;

#[test]
fn first_turn_returns_success_and_confirmation_prompt() {
    let response = first_response();
    response.assert_success();
    assert!(response.confirmation.is_some());
}

#[test]
fn accepted_confirmation_commits_pending_track() {
    let first = first_response();
    let track = first.prompt_track().to_string();
    let response = InterviewAssistScenario::continuing_from(&first)
        .without_event()
        .confirm(track.clone(), InterviewAssistConfirmationChoice::Yes)
        .run();

    response.assert_success();
    assert_eq!(
        response
            .cognition_state
            .expect("cognition state")
            .confirmed_track
            .as_deref(),
        Some(track.as_str())
    );
}

#[test]
fn rejected_confirmation_does_not_commit_track() {
    let first = first_response();
    let response = InterviewAssistScenario::continuing_from(&first)
        .without_event()
        .confirm_prompt(&first, InterviewAssistConfirmationChoice::No)
        .run();

    response.assert_success();
    assert!(response
        .cognition_state
        .expect("cognition state")
        .confirmed_track
        .is_none());
}

#[test]
fn abstention_refuses_without_advancing_state() {
    let first = first_response();
    InterviewAssistScenario::continuing_from(&first)
        .without_event()
        .confirm_prompt(&first, InterviewAssistConfirmationChoice::NotSure)
        .run()
        .assert_refusal("CONFIRMATION_ABSTAINED");
}
