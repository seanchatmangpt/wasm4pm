use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::crypto;
use crate::error::ActuatorRefusal;
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
        let mut verified = 0usize;

        for sig in &cert.signatures {
            if !key_ids.insert(sig.key_id.clone()) {
                return Err(ActuatorRefusal::InsufficientQuorum);
            }
            let key = self.registry.resolve(&sig.key_id, self.now_ms, cert.revocation_epoch)?;
            if key.algorithm != sig.algorithm {
                return Err(ActuatorRefusal::UnsupportedAlgorithm);
            }
            crypto::verify(key.algorithm, &key.public_key, &message, &sig.signature)?;
            if custodians.insert(key.custodian_id.clone()) {
                verified += 1;
            }
        }

        if verified < usize::from(cert.threshold) {
            return Err(ActuatorRefusal::CustodianIndependence);
        }
        Ok(())
    }
}
