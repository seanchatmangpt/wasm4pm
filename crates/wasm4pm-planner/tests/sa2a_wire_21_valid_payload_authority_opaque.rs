use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_payload_authority_opaque() {
    let result = decode_request(include_bytes!(
        "fixtures/sa2a/21_valid_payload_authority_opaque.json"
    ));
    assert_eq!(
        result.is_ok(),
        true,
        "valid_payload_authority_opaque: {:?}",
        result
    );
    let r = result.unwrap();
    assert_eq!(r.authority, "none");
    assert!(!r.subject.is_empty());
}
