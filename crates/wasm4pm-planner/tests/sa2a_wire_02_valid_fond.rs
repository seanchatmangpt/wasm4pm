use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_fond(){let result=decode_request(include_bytes!("fixtures/sa2a/02_valid_fond.json"));assert_eq!(result.is_ok(),true,"valid_fond: {:?}",result);let r=result.unwrap();assert_eq!(r.authority,"none");assert!(!r.subject.is_empty());}
