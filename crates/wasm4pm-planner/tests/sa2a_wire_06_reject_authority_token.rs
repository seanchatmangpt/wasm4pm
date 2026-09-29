use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn reject_authority_token(){let result=decode_request(include_bytes!("fixtures/sa2a/06_reject_authority_token.json"));assert_eq!(result.is_ok(),false,"reject_authority_token: {:?}",result);}
