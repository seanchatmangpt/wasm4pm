use wasm4pm_sa2a_actuator::{ActuatorRefusal, EffectLedger, FileEffectLedger};

#[test]
fn restart_converts_inflight_claim_to_unknown_outcome() {
    let dir = tempfile::tempdir().unwrap();
    let digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    {
        let ledger = FileEffectLedger::new(dir.path()).unwrap();
        ledger.claim(digest, 9).unwrap();
    }
    let recovered = FileEffectLedger::new(dir.path()).unwrap();
    assert_eq!(recovered.recover_unknown_outcomes().unwrap(), 1);
    assert_eq!(
        recovered.claim(digest, 9).unwrap_err(),
        ActuatorRefusal::UnknownOutcome
    );
}
