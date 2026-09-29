use wasm4pm_planner::sa2a::wire::decode_request;
#[test]
fn reject_empty_subject(){let result=decode_request(include_bytes!("fixtures/sa2a/08_reject_empty_subject.json"));assert_eq!(result.is_ok(),false,"reject_empty_subject: {:?}",result);}
