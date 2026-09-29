use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_generation_max(){let result=decode_request(include_bytes!("fixtures/sa2a/16_valid_generation_max.json"));assert_eq!(result.is_ok(),true,"valid_generation_max: {:?}",result);let r=result.unwrap();assert_eq!(r.authority,"none");assert!(!r.subject.is_empty());}
