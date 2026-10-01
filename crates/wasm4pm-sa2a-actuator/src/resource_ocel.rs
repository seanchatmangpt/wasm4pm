use crate::ResourceReceipt;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceOcelEvent {
    pub event_type: String,
    pub object_type: String,
    pub object_id: String,
    pub effect_digest: String,
    pub replay_key: String,
    pub generation: u64,
    pub state: String,
}
impl From<&ResourceReceipt> for ResourceOcelEvent {
    fn from(r: &ResourceReceipt) -> Self {
        Self {
            event_type: "sa2a.resource.actuation".into(),
            object_type: "ResourceAllocation".into(),
            object_id: r.allocation_id.clone(),
            effect_digest: r.effect_digest.clone(),
            replay_key: r.replay_key.clone(),
            generation: r.generation,
            state: r.actuator_state.clone(),
        }
    }
}
