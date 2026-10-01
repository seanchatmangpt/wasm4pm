use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_subject_whitespace_nonempty() {
    let result = decode_request(include_bytes!(
        "fixtures/sa2a/19_valid_subject_whitespace_nonempty.json"
    ));
    assert_eq!(
        result.is_ok(),
        true,
        "valid_subject_whitespace_nonempty: {:?}",
        result
    );
    let r = result.unwrap();
    assert_eq!(r.authority, "none");
    assert!(!r.subject.is_empty());
}
