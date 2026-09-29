use wasm4pm_sa2a_actuator::{ActuatorRefusal, EffectLedger, FileEffectLedger};

#[test]
fn exact_effect_generation_claims_once() {
    let dir = tempfile::tempdir().unwrap();
    let ledger = FileEffectLedger::new(dir.path()).unwrap();
    let digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    ledger.claim(digest, 7).unwrap();
    assert_eq!(
        ledger.claim(digest, 7).unwrap_err(),
        ActuatorRefusal::AlreadyClaimed
    );
    ledger
        .complete(
            digest,
            7,
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        )
        .unwrap();
    assert_eq!(
        ledger.claim(digest, 7).unwrap_err(),
        ActuatorRefusal::AlreadyExecuted
    );
}
