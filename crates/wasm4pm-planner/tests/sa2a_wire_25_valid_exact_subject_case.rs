use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_exact_subject_case() {
    let result = decode_request(include_bytes!(
        "fixtures/sa2a/25_valid_exact_subject_case.json"
    ));
    assert_eq!(
        result.is_ok(),
        true,
        "valid_exact_subject_case: {:?}",
        result
    );
    let r = result.unwrap();
    assert_eq!(r.authority, "none");
    assert!(!r.subject.is_empty());
}
