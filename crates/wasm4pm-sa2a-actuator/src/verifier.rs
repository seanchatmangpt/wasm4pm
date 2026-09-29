use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::crypto;
use crate::error::ActuatorRefusal;
use crate::trust_domain::TrustDomainId;
use crate::wire::{ActuationCertificate, PreparedEffect};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SignatureAlgorithm {
    Ed25519,
    MlDsa65,
    SlhDsaShake128f,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KeyState {
    Active,
    Revoked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyRecord {
    pub key_id: String,
    pub custodian_id: String,
    pub trust_domain_id: TrustDomainId,
    pub algorithm: SignatureAlgorithm,
    pub public_key: Vec<u8>,
    pub state: KeyState,
    pub not_before_ms: u64,
    pub expires_at_ms: u64,
    pub revocation_epoch: u64,
}

#[derive(Debug, Clone, Default)]
pub struct KeyRegistry {
    keys: BTreeMap<String, KeyRecord>,
}

impl KeyRegistry {
    pub fn new(records: impl IntoIterator<Item = KeyRecord>) -> Self {
        Self { keys: records.into_iter().map(|r| (r.key_id.clone(), r)).collect() }
    }

    fn resolve(&self, key_id: &str, now_ms: u64, revocation_epoch: u64) -> Result<&KeyRecord, ActuatorRefusal> {
        let key = self.keys.get(key_id).ok_or(ActuatorRefusal::UnknownKey)?;
        if key.state == KeyState::Revoked || key.revocation_epoch > revocation_epoch {
            return Err(ActuatorRefusal::RevokedKey);
        }
        if now_ms < key.not_before_ms || now_ms >= key.expires_at_ms {
            return Err(ActuatorRefusal::KeyOutsideValidity);
        }
        Ok(key)
    }
}

pub struct SecurityVerifier<'a> {
    pub registry: &'a KeyRegistry,
    pub audience: &'a str,
    pub policy_epoch: u64,
    pub revocation_epoch: u64,
    pub generation: u64,
    pub now_ms: u64,
}

impl<'a> SecurityVerifier<'a> {
    pub fn verify(&self, effect: &PreparedEffect, cert: &ActuationCertificate) -> Result<(), ActuatorRefusal> {
        if cert.effect_digest != effect.digest()? {
            return Err(ActuatorRefusal::InvalidDigest);
        }
        if cert.principal != effect.principal {
            return Err(ActuatorRefusal::PrincipalMismatch);
        }
        if cert.audience != self.audience {
            return Err(ActuatorRefusal::AudienceMismatch);
        }
        if cert.policy_epoch != self.policy_epoch || cert.revocation_epoch != self.revocation_epoch {
            return Err(ActuatorRefusal::EpochMismatch);
        }
        if cert.generation != self.generation {
            return Err(ActuatorRefusal::GenerationMismatch);
        }
        if self.now_ms < cert.not_before_ms || self.now_ms >= cert.expires_at_ms {
            return Err(ActuatorRefusal::CertificateOutsideValidity);
        }

        let message = cert.signing_message()?;
        let mut key_ids = BTreeSet::new();
        let mut custodians = BTreeSet::new();
        let mut trust_domains = BTreeSet::new();

        for sig in &cert.signatures {
            let key = self.registry.resolve(&sig.key_id, self.now_ms, cert.revocation_epoch)?;
            if key.algorithm != sig.algorithm {
                return Err(ActuatorRefusal::UnsupportedAlgorithm);
            }

            // Independence is counted only after the exact certificate message
            // has been cryptographically verified by the registered key.
            crypto::verify(key.algorithm, &key.public_key, &message, &sig.signature)?;
            key_ids.insert(key.key_id.clone());
            custodians.insert(key.custodian_id.clone());
            trust_domains.insert(key.trust_domain_id.clone());
        }

        let threshold = usize::from(cert.threshold);
        if key_ids.len() < threshold {
            return Err(ActuatorRefusal::InsufficientQuorum);
        }
        if custodians.len() < threshold {
            return Err(ActuatorRefusal::CustodianIndependence);
        }
        if trust_domains.len() < threshold {
            return Err(ActuatorRefusal::TrustDomainIndependence);
        }
        Ok(())
    }
}
