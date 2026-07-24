mod interview_assist_scenario;
mod interview_assist_support;

use interview_assist_scenario::{first_response, InterviewAssistResponseExt};

#[test]
fn observed_question_is_human_readable() {
    let response = first_response();
    response.assert_success();
    let question = response.observed_question.expect("question projection");
    assert!(!question.event_id.trim().is_empty());
    assert!(!question.summary.trim().is_empty());
}

#[test]
fn candidates_have_human_labels_and_machine_ids() {
    assert!(first_response().candidates.iter().all(|candidate| {
        !candidate.id.trim().is_empty() && !candidate.label.trim().is_empty()
    }));
}

#[test]
fn confirmation_prompt_has_three_explicit_choices() {
    let response = first_response();
    let prompt = response.confirmation.expect("confirmation prompt");
    assert!(!prompt.question.trim().is_empty());
    assert_eq!(prompt.choices.len(), 3);
}

#[test]
fn phase_has_machine_and_human_representation() {
    let response = first_response();
    let state = response.cognition_state.expect("cognition state");
    assert!(!state.phase.trim().is_empty());
    assert!(!state.phase_label.trim().is_empty());
}

#[test]
fn constraints_are_sorted_and_unique() {
    let constraints = first_response().detected_constraints;
    let mut sorted = constraints.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(constraints, sorted);
}

#[test]
fn evidence_is_exposed_without_raw_debug_text() {
    assert!(first_response()
        .candidates
        .iter()
        .flat_map(|candidate| candidate.evidence_ids.iter())
        .all(|evidence| !evidence.contains("Some(") && !evidence.contains("Ok(")));
}
