use ed25519_dalek::{Signature as Ed25519Signature, VerifyingKey as Ed25519VerifyingKey};
use ml_dsa::{
    MlDsa65, Signature as MlDsaSignature, Verifier as _, VerifyingKey as MlDsaVerifyingKey,
};
use slh_dsa::signature::Verifier as _;
use slh_dsa::{Shake128f, Signature as SlhDsaSignature, VerifyingKey as SlhDsaVerifyingKey};

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
        SignatureAlgorithm::MlDsa65 => {
            let key_bytes: &ml_dsa::EncodedVerifyingKey<MlDsa65> = public_key
                .try_into()
                .map_err(|_| ActuatorRefusal::InvalidKey)?;
            let sig_bytes: &ml_dsa::EncodedSignature<MlDsa65> = signature
                .try_into()
                .map_err(|_| ActuatorRefusal::InvalidSignature)?;
            let key = MlDsaVerifyingKey::<MlDsa65>::decode(key_bytes);
            let sig = MlDsaSignature::<MlDsa65>::decode(sig_bytes)
                .ok_or(ActuatorRefusal::InvalidSignature)?;
            key.verify(message, &sig)
                .map_err(|_| ActuatorRefusal::InvalidSignature)
        }
        SignatureAlgorithm::SlhDsaShake128f => {
            let key = SlhDsaVerifyingKey::<Shake128f>::try_from(public_key)
                .map_err(|_| ActuatorRefusal::InvalidKey)?;
            let sig = SlhDsaSignature::<Shake128f>::try_from(signature)
                .map_err(|_| ActuatorRefusal::InvalidSignature)?;
            key.verify(message, &sig)
                .map_err(|_| ActuatorRefusal::InvalidSignature)
        }
    }
}
