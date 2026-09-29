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
    pub result_digest: String,
    pub state: String,
}

pub struct Actuator<'a, L: EffectLedger, E: Effector> {
    pub verifier: SecurityVerifier<'a>,
    pub ledger: &'a L,
    pub effector: &'a E,
}

impl<'a, L: EffectLedger, E: Effector> Actuator<'a, L, E> {
    /// Consequential entrypoint. Resource admission is complete mediation:
    /// no durable effect claim and therefore no DO is reachable before the
    /// powerless allocation envelope is validated against exact effect identity.
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

        // The claim is deliberately after resource admission. Moving this line
        // above admission would re-open an unbudgeted consequential path.
        self.ledger.claim(&digest, cert.generation)?;

        match self.effector.perform(effect) {
            Ok(outcome) => {
                if let Err(error) = self.ledger.complete(&digest, cert.generation, &outcome.result_digest) {
                    let _ = self.ledger.mark_unknown(&digest, cert.generation);
                    return Err(error);
                }
                Ok(ActuationReceipt {
                    effect_digest: digest,
                    generation: cert.generation,
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
