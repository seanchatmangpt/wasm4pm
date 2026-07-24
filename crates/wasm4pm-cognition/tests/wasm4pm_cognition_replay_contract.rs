mod interview_assist_scenario;
mod interview_assist_support;

use interview_assist_scenario::{
    first_response, InterviewAssistResponseExt, InterviewAssistScenario,
};
use interview_assist_support::domain_pack;
use wasm4pm_cognition::interview_assist::InterviewAssistConfirmationChoice;
use wasm4pm_cognition::session::verify_session_state;

#[test]
fn returned_state_verifies_against_domain_pack() {
    let response = first_response();
    verify_session_state(&domain_pack(), &response.success_state().cognition)
        .expect("state verifies");
}

#[test]
fn confirmation_turn_extends_receipt_chain() {
    let first = first_response();
    let first_state_hash = first.success_state().cognition.state_hash.clone();
    let second = InterviewAssistScenario::continuing_from(&first)
        .without_event()
        .confirm_prompt(&first, InterviewAssistConfirmationChoice::Yes)
        .run();

    assert_eq!(
        second.receipt.expect("second receipt").previous_state_hash,
        first_state_hash
    );
}

#[test]
fn persisted_state_replays_deterministically() {
    let first = first_response();
    let scenario = InterviewAssistScenario::continuing_from(&first).transcript(
        "event-follow-up-001",
        "Use a hash map and complement lookup.",
    );
    assert_eq!(scenario.clone().run(), scenario.run());
}

#[test]
fn tampered_state_is_refused() {
    let first = first_response();
    InterviewAssistScenario::continuing_from(&first)
        .mutate(|request| {
            let state = request.previous_state.as_mut().expect("previous state");
            state.cognition.turn += 1;
            state.revision += 1;
            request.state.revision = state.revision;
        })
        .run()
        .assert_refusal("INVALID_STATE_RECEIPT");
}
