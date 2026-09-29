use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_unknown_formalism_transport(){let result=decode_request(include_bytes!("fixtures/sa2a/18_valid_unknown_formalism_transport.json"));assert_eq!(result.is_ok(),true,"valid_unknown_formalism_transport: {:?}",result);let r=result.unwrap();assert_eq!(r.authority,"none");assert!(!r.subject.is_empty());}
