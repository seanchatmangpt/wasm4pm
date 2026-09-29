use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_nested_payload(){let result=decode_request(include_bytes!("fixtures/sa2a/12_valid_nested_payload.json"));assert_eq!(result.is_ok(),true,"valid_nested_payload: {:?}",result);let r=result.unwrap();assert_eq!(r.authority,"none");assert!(!r.subject.is_empty());}
