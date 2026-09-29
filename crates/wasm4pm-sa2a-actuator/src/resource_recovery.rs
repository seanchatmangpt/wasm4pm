use crate::{ActuatorRefusal, ResourceEnvelope};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ResourceRecoveryState {
    Allocated,
    Claimed,
    Executed,
    UnknownOutcome,
}
pub struct ResourceRecovery;
impl ResourceRecovery {
    pub fn reconcile(
        e: &ResourceEnvelope,
        claimed: bool,
        completed: bool,
    ) -> Result<ResourceRecoveryState, ActuatorRefusal> {
        e.validate()?;
        Ok(match (claimed, completed) {
            (false, false) => ResourceRecoveryState::Allocated,
            (true, false) => ResourceRecoveryState::UnknownOutcome,
            (true, true) => ResourceRecoveryState::Executed,
            (false, true) => return Err(ActuatorRefusal::ResourceEnvelopeInvalid),
        })
    }
}
