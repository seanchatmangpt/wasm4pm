mod interview_assist_scenario;
mod interview_assist_support;

use interview_assist_scenario::{first_response, InterviewAssistScenario};

#[test]
fn same_request_produces_identical_response() {
    assert_eq!(
        InterviewAssistScenario::new().run(),
        InterviewAssistScenario::new().run()
    );
}

#[test]
fn canonical_json_is_stable() {
    let first =
        serde_json::to_string(&InterviewAssistScenario::new().run()).expect("response serializes");
    let second =
        serde_json::to_string(&InterviewAssistScenario::new().run()).expect("response serializes");
    assert_eq!(first, second);
}

#[test]
fn candidate_order_is_stable() {
    let expected: Vec<_> = first_response()
        .candidates
        .into_iter()
        .map(|item| item.id)
        .collect();
    for _ in 0..16 {
        let actual: Vec<_> = InterviewAssistScenario::new()
            .run()
            .candidates
            .into_iter()
            .map(|item| item.id)
            .collect();
        assert_eq!(actual, expected);
    }
}

#[test]
fn changed_transcript_changes_receipt() {
    let first = InterviewAssistScenario::new().run();
    let second = InterviewAssistScenario::new()
        .transcript(
            "event-transcript-001",
            "Given a sorted array, use two pointers to find a target sum.",
        )
        .run();
    assert_ne!(
        first.receipt.expect("first receipt").output_hash,
        second.receipt.expect("second receipt").output_hash
    );
}
