use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn reject_authority_nullish_string() {
    let result = decode_request(include_bytes!(
        "fixtures/sa2a/24_reject_authority_nullish_string.json"
    ));
    assert_eq!(
        result.is_ok(),
        false,
        "reject_authority_nullish_string: {:?}",
        result
    );
}
