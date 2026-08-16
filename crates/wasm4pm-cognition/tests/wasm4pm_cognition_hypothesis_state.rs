mod interview_assist_scenario;
mod interview_assist_support;

use interview_assist_scenario::{first_response, InterviewAssistResponseExt};

#[test]
fn candidates_have_stable_identity_and_labels() {
    let response = first_response();
    response.assert_success();
    assert!(!response.candidates.is_empty());
    assert!(response
        .candidates
        .iter()
        .all(|candidate| !candidate.id.trim().is_empty() && !candidate.label.trim().is_empty()));
}

#[test]
fn confidence_is_finite_and_bounded() {
    assert!(first_response()
        .candidates
        .iter()
        .all(|candidate| candidate.confidence.is_finite()
            && (0.0..=1.0).contains(&candidate.confidence)));
}

#[test]
fn leading_candidate_has_supporting_evidence() {
    assert!(first_response()
        .candidates
        .first()
        .is_some_and(|candidate| !candidate.evidence_ids.is_empty()));
}

#[test]
fn cognition_state_matches_persisted_state() {
    let response = first_response();
    let projected = response.cognition_state.as_ref().expect("cognition state");
    let persisted = response.success_state();
    assert_eq!(projected.revision, persisted.revision);
    assert_eq!(projected.confirmed_track, persisted.cognition.committed_track);
    assert_eq!(projected.phase, persisted.cognition.phase);
}
