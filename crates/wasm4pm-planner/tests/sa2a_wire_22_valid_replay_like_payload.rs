use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn valid_replay_like_payload(){let result=decode_request(include_bytes!("fixtures/sa2a/22_valid_replay_like_payload.json"));assert_eq!(result.is_ok(),true,"valid_replay_like_payload: {:?}",result);let r=result.unwrap();assert_eq!(r.authority,"none");assert!(!r.subject.is_empty());}
