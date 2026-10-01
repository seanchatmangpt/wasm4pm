use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::error::ActuatorRefusal;
use crate::verifier::SignatureAlgorithm;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreparedEffect {
    pub version: u32,
    pub principal: String,
    pub capability: String,
    pub subject: Value,
    pub payload: Value,
}

impl PreparedEffect {
    pub fn digest(&self) -> Result<String, ActuatorRefusal> {
        if self.version != 1 || self.principal.is_empty() || self.capability.is_empty() {
            return Err(ActuatorRefusal::InvalidEffect);
        }
        let bytes =
            serde_json_canonicalizer::to_vec(self).map_err(|_| ActuatorRefusal::InvalidEffect)?;
        let digest = Sha256::digest(bytes);
        Ok(format!("sha256:{digest:x}"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CertificateSignature {
    pub key_id: String,
    pub algorithm: SignatureAlgorithm,
    pub signature: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActuationCertificate {
    pub version: u32,
    pub effect_digest: String,
    pub principal: String,
    pub policy_epoch: u64,
    pub revocation_epoch: u64,
    pub generation: u64,
    pub nonce: String,
    pub not_before_ms: u64,
    pub expires_at_ms: u64,
    pub audience: String,
    pub threshold: u16,
    pub signatures: Vec<CertificateSignature>,
}

impl ActuationCertificate {
    pub fn signing_message(&self) -> Result<Vec<u8>, ActuatorRefusal> {
        if self.version != 1 || self.nonce.is_empty() || self.threshold == 0 {
            return Err(ActuatorRefusal::InvalidCertificate);
        }
        #[derive(Serialize)]
        struct Signed<'a> {
            v: u32,
            effect_digest: &'a str,
            principal: &'a str,
            policy_epoch: u64,
            revocation_epoch: u64,
            generation: u64,
            nonce: &'a str,
            not_before: u64,
            expires: u64,
            audience: &'a str,
            threshold: u16,
        }
        let body = Signed {
            v: self.version,
            effect_digest: &self.effect_digest,
            principal: &self.principal,
            policy_epoch: self.policy_epoch,
            revocation_epoch: self.revocation_epoch,
            generation: self.generation,
            nonce: &self.nonce,
            not_before: self.not_before_ms,
            expires: self.expires_at_ms,
            audience: &self.audience,
            threshold: self.threshold,
        };
        let canonical = serde_json_canonicalizer::to_vec(&body)
            .map_err(|_| ActuatorRefusal::InvalidCertificate)?;
        let mut message = b"SA2A-C2-ACTUATION-CERTIFICATE-V1\0".to_vec();
        message.extend_from_slice(&canonical);
        Ok(message)
    }
}
