use serde::{Deserialize, Serialize};

use crate::effector::Effector;
use crate::error::ActuatorRefusal;
use crate::ledger::EffectLedger;
use crate::resource::{ResourceBudget, ResourceEnvelope};
use crate::resource_admission::ResourceAdmission;
use crate::verifier::SecurityVerifier;
use crate::wire::{ActuationCertificate, PreparedEffect};

#[derive(Debug, Clone, Copy)]
pub struct ActuatorContext<'a> {
    pub audience: &'a str,
    pub policy_epoch: u64,
    pub revocation_epoch: u64,
    pub generation: u64,
    pub now_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActuationReceipt {
    pub effect_digest: String,
    pub generation: u64,
    pub allocation_id: String,
    pub replay_key: String,
    pub result_digest: String,
    pub state: String,
}

pub struct Actuator<'a, L: EffectLedger, E: Effector> {
    pub verifier: SecurityVerifier<'a>,
    pub ledger: &'a L,
    pub effector: &'a E,
}

impl<'a, L: EffectLedger, E: Effector> Actuator<'a, L, E> {
    /// Consequential entrypoint.
    ///
    /// Resource admission is complete mediation and the allocation binding is
    /// stored atomically with the effect claim. A crash before the claim has no
    /// durable budget consumption; a crash after the claim retains allocation
    /// and replay identity and is recovered as unknown_outcome.
    pub fn execute(
        &self,
        effect: &PreparedEffect,
        cert: &ActuationCertificate,
        resources: &ResourceEnvelope,
        requested: ResourceBudget,
    ) -> Result<ActuationReceipt, ActuatorRefusal> {
        self.verifier.verify(effect, cert)?;

        if effect.capability != self.effector.capability() {
            return Err(ActuatorRefusal::EffectorMismatch);
        }

        let digest = effect.digest()?;
        ResourceAdmission::admit(resources, &digest, cert.generation, requested)?;

        // Allocation identity and the effect claim become one durable record.
        // No DO is reachable until this create-new claim is durable.
        self.ledger
            .claim_with_allocation(&digest, cert.generation, resources, requested)?;

        match self.effector.perform(effect) {
            Ok(outcome) => {
                if let Err(error) =
                    self.ledger
                        .complete(&digest, cert.generation, &outcome.result_digest)
                {
                    let _ = self.ledger.mark_unknown(&digest, cert.generation);
                    return Err(error);
                }

                Ok(ActuationReceipt {
                    effect_digest: digest,
                    generation: cert.generation,
                    allocation_id: resources.allocation_id.clone(),
                    replay_key: resources.replay_key.clone(),
                    result_digest: outcome.result_digest,
                    state: "executed".into(),
                })
            }
            Err(error) => {
                let _ = self.ledger.mark_unknown(&digest, cert.generation);
                Err(error)
            }
        }
    }
}
