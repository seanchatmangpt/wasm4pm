use wasm4pm_sa2a_actuator::{
    ActuatorRefusal, EffectLedger, FileEffectLedger, LedgerState, ResourceBudget,
    ResourceEnvelope,
};

const DIGEST: &str =
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn envelope() -> ResourceEnvelope {
    ResourceEnvelope {
        version: "sa2a/resource-envelope/v1".into(),
        allocation_id: "allocation:crash".into(),
        effect_digest: DIGEST.into(),
        replay_key: "replay:crash".into(),
        generation: 9,
        parent_allocation_id: None,
        budget: ResourceBudget {
            cpu_micros: 100,
            memory_bytes: 200,
            io_bytes: 300,
            fuel: 400,
        },
        authority: "none".into(),
    }
}

#[test]
fn restart_preserves_allocation_identity_while_marking_unknown() {
    let dir = tempfile::tempdir().unwrap();
    let resources = envelope();
    let requested = resources.budget;

    {
        let ledger = FileEffectLedger::new(dir.path()).unwrap();
        ledger
            .claim_with_allocation(DIGEST, 9, &resources, requested)
            .unwrap();
    }

    let recovered = FileEffectLedger::new(dir.path()).unwrap();
    assert_eq!(recovered.recover_unknown_outcomes().unwrap(), 1);

    let record = recovered.record(DIGEST, 9).unwrap().unwrap();
    assert_eq!(record.state, LedgerState::UnknownOutcome);
    assert_eq!(record.allocation_id.as_deref(), Some("allocation:crash"));
    assert_eq!(record.replay_key.as_deref(), Some("replay:crash"));
    assert_eq!(record.requested, Some(requested));

    assert_eq!(
        recovered
            .claim_with_allocation(DIGEST, 9, &resources, requested)
            .unwrap_err(),
        ActuatorRefusal::UnknownOutcome
    );
}
