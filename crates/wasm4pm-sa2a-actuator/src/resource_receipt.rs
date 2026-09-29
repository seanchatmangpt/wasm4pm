use serde::{Deserialize,Serialize}; use crate::{ActuationReceipt,ResourceEnvelope};
#[derive(Debug,Clone,PartialEq,Eq,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResourceReceipt { pub version:String,pub allocation_id:String,pub effect_digest:String,pub replay_key:String,pub generation:u64,pub actuator_state:String,pub result_digest:String }
impl ResourceReceipt { pub fn bind(e:&ResourceEnvelope,r:&ActuationReceipt)->Self{Self{version:"sa2a/resource-receipt/v1".into(),allocation_id:e.allocation_id.clone(),effect_digest:r.effect_digest.clone(),replay_key:e.replay_key.clone(),generation:r.generation,actuator_state:r.state.clone(),result_digest:r.result_digest.clone()}}}
