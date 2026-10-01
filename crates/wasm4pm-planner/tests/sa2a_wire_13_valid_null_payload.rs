use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_null_payload() {
    let result = decode_request(include_bytes!("fixtures/sa2a/13_valid_null_payload.json"));
    assert_eq!(result.is_ok(), true, "valid_null_payload: {:?}", result);
    let r = result.unwrap();
    assert_eq!(r.authority, "none");
    assert!(!r.subject.is_empty());
}
