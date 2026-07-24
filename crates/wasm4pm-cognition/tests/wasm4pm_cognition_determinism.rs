mod interview_assist_support;

use interview_assist_support::{domain_pack, first_response, request};
use wasm4pm_cognition::interview_assist::run_interview_assist_request;

#[test]
fn same_request_produces_identical_response() {
    assert_eq!(first_response(), first_response());
}

#[test]
fn canonical_json_is_stable() {
    let first = serde_json::to_string(&first_response()).expect("response serializes");
    let second = serde_json::to_string(&first_response()).expect("response serializes");
    assert_eq!(first, second);
}

#[test]
fn candidate_order_is_stable() {
    let expected: Vec<_> = first_response().candidates.into_iter().map(|item| item.id).collect();
    for _ in 0..16 {
        let actual: Vec<_> = first_response().candidates.into_iter().map(|item| item.id).collect();
        assert_eq!(actual, expected);
    }
}

#[test]
fn changed_transcript_changes_receipt() {
    let first = first_response();
    let mut changed = request();
    changed.event.as_mut().expect("event").text =
        "Given a sorted array, use two pointers to find a target sum.".to_string();
    let second = run_interview_assist_request(domain_pack(), changed);
    assert_ne!(
        first.receipt.expect("first receipt").output_hash,
        second.receipt.expect("second receipt").output_hash
    );
}
