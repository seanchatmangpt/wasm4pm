use serde::{Deserialize, Serialize};

use crate::{ActuationReceipt, ActuatorRefusal, ResourceEnvelope};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResourceReceipt {
    pub version: String,
    pub allocation_id: String,
    pub effect_digest: String,
    pub replay_key: String,
    pub generation: u64,
    pub actuator_state: String,
    pub result_digest: String,
}

impl ResourceReceipt {
    pub fn bind(
        envelope: &ResourceEnvelope,
        receipt: &ActuationReceipt,
    ) -> Result<Self, ActuatorRefusal> {
        envelope.validate()?;

        if receipt.allocation_id != envelope.allocation_id
            || receipt.replay_key != envelope.replay_key
            || receipt.effect_digest != envelope.effect_digest
            || receipt.generation != envelope.generation
        {
            return Err(ActuatorRefusal::AllocationClaimMismatch);
        }

        Ok(Self {
            version: "sa2a/resource-receipt/v1".into(),
            allocation_id: receipt.allocation_id.clone(),
            effect_digest: receipt.effect_digest.clone(),
            replay_key: receipt.replay_key.clone(),
            generation: receipt.generation,
            actuator_state: receipt.state.clone(),
            result_digest: receipt.result_digest.clone(),
        })
    }
}
