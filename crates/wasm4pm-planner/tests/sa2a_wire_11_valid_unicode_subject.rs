use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_unicode_subject() {
    let result = decode_request(include_bytes!(
        "fixtures/sa2a/11_valid_unicode_subject.json"
    ));
    assert_eq!(result.is_ok(), true, "valid_unicode_subject: {:?}", result);
    let r = result.unwrap();
    assert_eq!(r.authority, "none");
    assert!(!r.subject.is_empty());
}
