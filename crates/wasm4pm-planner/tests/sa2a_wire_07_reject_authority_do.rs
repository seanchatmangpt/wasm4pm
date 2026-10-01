use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn reject_authority_do() {
    let result = decode_request(include_bytes!("fixtures/sa2a/07_reject_authority_do.json"));
    assert_eq!(result.is_ok(), false, "reject_authority_do: {:?}", result);
}
