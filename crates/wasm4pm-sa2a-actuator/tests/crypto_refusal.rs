use wasm4pm_sa2a_actuator::crypto;
use wasm4pm_sa2a_actuator::{ActuatorRefusal, SignatureAlgorithm};

#[test]
fn malformed_ed25519_material_refuses_without_panicking() {
    assert_eq!(
        crypto::verify(SignatureAlgorithm::Ed25519, &[0; 31], b"message", &[0; 64]).unwrap_err(),
        ActuatorRefusal::InvalidKey
    );
}

#[test]
fn malformed_pq_material_refuses_without_panicking() {
    assert_eq!(
        crypto::verify(SignatureAlgorithm::MlDsa65, &[0; 8], b"message", &[0; 8]).unwrap_err(),
        ActuatorRefusal::InvalidKey
    );
    assert_eq!(
        crypto::verify(SignatureAlgorithm::SlhDsaShake128f, &[0; 8], b"message", &[0; 8]).unwrap_err(),
        ActuatorRefusal::InvalidKey
    );
}
