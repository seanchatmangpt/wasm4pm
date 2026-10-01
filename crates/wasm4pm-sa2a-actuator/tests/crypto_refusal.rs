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
fn pq_algorithms_fail_closed_until_actuator_provider_is_admitted() {
    assert_eq!(
        crypto::verify(SignatureAlgorithm::MlDsa65, &[], b"message", &[]).unwrap_err(),
        ActuatorRefusal::UnsupportedAlgorithm
    );
    assert_eq!(
        crypto::verify(SignatureAlgorithm::SlhDsaShake128f, &[], b"message", &[]).unwrap_err(),
        ActuatorRefusal::UnsupportedAlgorithm
    );
}
