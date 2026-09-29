use ed25519_dalek::{Signer, SigningKey};
use serde_json::json;
use wasm4pm_sa2a_actuator::{
    ActuationCertificate, ActuatorRefusal, CertificateSignature, KeyRecord, KeyRegistry, KeyState,
    PreparedEffect, SecurityVerifier, SignatureAlgorithm, TrustDomainId,
};

fn key(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

fn record(key_id: &str, custodian_id: &str, domain: &str, signing_key: &SigningKey) -> KeyRecord {
    KeyRecord {
        key_id: key_id.into(),
        custodian_id: custodian_id.into(),
        trust_domain_id: TrustDomainId::parse(domain).expect("trust domain"),
        algorithm: SignatureAlgorithm::Ed25519,
        public_key: signing_key.verifying_key().to_bytes().to_vec(),
        state: KeyState::Active,
        not_before_ms: 0,
        expires_at_ms: 10_000,
        revocation_epoch: 7,
    }
}

fn effect() -> PreparedEffect {
    PreparedEffect {
        version: 1,
        principal: "principal:alice".into(),
        capability: "fs.write_utf8".into(),
        subject: json!({"path": "receipts/result.txt"}),
        payload: json!({"utf8": "ok"}),
    }
}

fn certificate(effect: &PreparedEffect) -> ActuationCertificate {
    ActuationCertificate {
        version: 1,
        effect_digest: effect.digest().unwrap(),
        principal: effect.principal.clone(),
        policy_epoch: 11,
        revocation_epoch: 7,
        generation: 3,
        nonce: "nonce-1".into(),
        not_before_ms: 100,
        expires_at_ms: 9_000,
        audience: "actuator:test".into(),
        threshold: 2,
        signatures: Vec::new(),
    }
}

fn sign(cert: &mut ActuationCertificate, key_id: &str, signing_key: &SigningKey) {
    let message = cert.signing_message().unwrap();
    cert.signatures.push(CertificateSignature {
        key_id: key_id.into(),
        algorithm: SignatureAlgorithm::Ed25519,
        signature: signing_key.sign(&message).to_bytes().to_vec(),
    });
}

fn verify(registry: &KeyRegistry, effect: &PreparedEffect, cert: &ActuationCertificate)
    -> Result<(), ActuatorRefusal>
{
    SecurityVerifier {
        registry,
        audience: "actuator:test",
        policy_epoch: 11,
        revocation_epoch: 7,
        generation: 3,
        now_ms: 1_000,
    }.verify(effect, cert)
}

#[test]
fn same_domain_signers_are_not_independent() {
    let k1 = key(1);
    let k2 = key(2);
    let registry = KeyRegistry::new([
        record("k1", "custodian:a", "domain:shared", &k1),
        record("k2", "custodian:b", "domain:shared", &k2),
    ]);
    let effect = effect();
    let mut cert = certificate(&effect);
    sign(&mut cert, "k1", &k1);
    sign(&mut cert, "k2", &k2);
    assert_eq!(verify(&registry, &effect, &cert), Err(ActuatorRefusal::TrustDomainIndependence));
}

#[test]
fn independent_domains_satisfy_threshold() {
    let k1 = key(3);
    let k2 = key(4);
    let registry = KeyRegistry::new([
        record("k1", "custodian:a", "domain:east", &k1),
        record("k2", "custodian:b", "domain:west", &k2),
    ]);
    let effect = effect();
    let mut cert = certificate(&effect);
    sign(&mut cert, "k1", &k1);
    sign(&mut cert, "k2", &k2);
    assert_eq!(verify(&registry, &effect, &cert), Ok(()));
}

#[test]
fn duplicate_key_does_not_manufacture_quorum() {
    let k1 = key(5);
    let registry = KeyRegistry::new([record("k1", "custodian:a", "domain:east", &k1)]);
    let effect = effect();
    let mut cert = certificate(&effect);
    sign(&mut cert, "k1", &k1);
    sign(&mut cert, "k1", &k1);
    assert_eq!(verify(&registry, &effect, &cert), Err(ActuatorRefusal::InsufficientQuorum));
}
