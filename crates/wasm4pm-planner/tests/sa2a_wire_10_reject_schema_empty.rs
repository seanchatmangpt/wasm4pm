use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn reject_schema_empty() {
    let result = decode_request(include_bytes!("fixtures/sa2a/10_reject_schema_empty.json"));
    assert_eq!(result.is_ok(), false, "reject_schema_empty: {:?}", result);
}
