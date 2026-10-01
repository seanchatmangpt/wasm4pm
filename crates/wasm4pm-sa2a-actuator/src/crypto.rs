use ed25519_dalek::{Signature as Ed25519Signature, VerifyingKey as Ed25519VerifyingKey};

use crate::error::ActuatorRefusal;
use crate::verifier::SignatureAlgorithm;

pub fn verify(
    algorithm: SignatureAlgorithm,
    public_key: &[u8],
    message: &[u8],
    signature: &[u8],
) -> Result<(), ActuatorRefusal> {
    match algorithm {
        SignatureAlgorithm::Ed25519 => {
            let key_bytes: &[u8; 32] = public_key
                .try_into()
                .map_err(|_| ActuatorRefusal::InvalidKey)?;
            let key = Ed25519VerifyingKey::from_bytes(key_bytes)
                .map_err(|_| ActuatorRefusal::InvalidKey)?;
            let sig = Ed25519Signature::from_slice(signature)
                .map_err(|_| ActuatorRefusal::InvalidSignature)?;
            key.verify_strict(message, &sig)
                .map_err(|_| ActuatorRefusal::InvalidSignature)
        }
        SignatureAlgorithm::MlDsa65 | SignatureAlgorithm::SlhDsaShake128f => {
            Err(ActuatorRefusal::UnsupportedAlgorithm)
        }
    }
}
