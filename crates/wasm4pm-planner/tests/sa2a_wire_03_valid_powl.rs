use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_powl() {
    let result = decode_request(include_bytes!("fixtures/sa2a/03_valid_powl.json"));
    assert_eq!(result.is_ok(), true, "valid_powl: {:?}", result);
    let r = result.unwrap();
    assert_eq!(r.authority, "none");
    assert!(!r.subject.is_empty());
}
