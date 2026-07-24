mod interview_assist_support;

use interview_assist_support::{domain_pack, first_response, request};
use wasm4pm_cognition::interview_assist::{
    run_interview_assist_request, InterviewAssistConfirmation,
    InterviewAssistConfirmationChoice,
};
use wasm4pm_cognition::session::verify_session_state;

#[test]
fn returned_state_verifies_against_domain_pack() {
    let response = first_response();
    let state = response.result.expect("success").state;
    verify_session_state(&domain_pack(), &state.cognition).expect("state verifies");
}

#[test]
fn confirmation_turn_extends_receipt_chain() {
    let first = first_response();
    let first_receipt = first.receipt.clone().expect("first receipt");
    let prompt = first.confirmation.clone().expect("confirmation prompt");
    let state = first.result.expect("success").state;

    let mut next = request();
    next.event = None;
    next.state.revision = state.revision;
    next.state.phase = state.cognition.phase.clone();
    next.state.confirmed_track = state.cognition.committed_track.clone();
    next.previous_state = Some(state);
    next.confirmation = Some(InterviewAssistConfirmation {
        track_id: prompt.track_id,
        choice: InterviewAssistConfirmationChoice::Yes,
    });

    let second = run_interview_assist_request(domain_pack(), next);
    let second_receipt = second.receipt.expect("second receipt");
    assert_eq!(second_receipt.previous_state_hash, first_receipt.output_hash);
}

#[test]
fn persisted_state_replays_deterministically() {
    let first = first_response();
    let state = first.result.expect("success").state;
    let mut next_a = request();
    next_a.state.revision = state.revision;
    next_a.state.phase = state.cognition.phase.clone();
    next_a.state.confirmed_track = state.cognition.committed_track.clone();
    next_a.previous_state = Some(state.clone());
    next_a.event.as_mut().expect("event").id = "event-follow-up-001".to_string();
    next_a.event.as_mut().expect("event").text = "Use a hash map and complement lookup.".to_string();
    let next_b = next_a.clone();

    let first_replay = run_interview_assist_request(domain_pack(), next_a);
    let second_replay = run_interview_assist_request(domain_pack(), next_b);
    assert_eq!(first_replay, second_replay);
}

#[test]
fn tampered_state_is_refused() {
    let first = first_response();
    let mut state = first.result.expect("success").state;
    state.cognition.turn += 1;
    state.revision += 1;
    let mut next = request();
    next.state.revision = state.revision;
    next.state.phase = state.cognition.phase.clone();
    next.state.confirmed_track = state.cognition.committed_track.clone();
    next.previous_state = Some(state);
    let response = run_interview_assist_request(domain_pack(), next);
    assert!(response.refusal.is_some());
    assert!(response.result.is_none());
}
