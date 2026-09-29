use wasm4pm_sa2a_actuator::{
    ActuatorRefusal, EffectLedger, FileEffectLedger, LedgerState, ResourceBudget, ResourceEnvelope,
};

fn digest() -> &'static str {
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

fn budget() -> ResourceBudget {
    ResourceBudget {
        cpu_micros: 10,
        memory_bytes: 20,
        io_bytes: 30,
        fuel: 40,
    }
}

fn envelope(allocation_id: &str) -> ResourceEnvelope {
    ResourceEnvelope {
        version: "sa2a/resource-envelope/v1".into(),
        allocation_id: allocation_id.into(),
        effect_digest: digest().into(),
        replay_key: "replay:exact".into(),
        generation: 7,
        parent_allocation_id: None,
        budget: budget(),
        authority: "none".into(),
    }
}

#[test]
fn atomic_claim_persists_allocation_replay_and_budget_identity() {
    let dir = tempfile::tempdir().unwrap();
    let ledger = FileEffectLedger::new(dir.path()).unwrap();
    let resources = envelope("allocation:1");

    ledger
        .claim_with_allocation(digest(), 7, &resources, budget())
        .unwrap();

    let record = ledger.record(digest(), 7).unwrap().unwrap();
    assert_eq!(record.state, LedgerState::Executing);
    assert_eq!(record.allocation_id.as_deref(), Some("allocation:1"));
    assert_eq!(record.replay_key.as_deref(), Some("replay:exact"));
    assert_eq!(record.requested, Some(budget()));
}

#[test]
fn exact_retry_does_not_create_a_second_claim() {
    let dir = tempfile::tempdir().unwrap();
    let ledger = FileEffectLedger::new(dir.path()).unwrap();
    let resources = envelope("allocation:1");

    ledger
        .claim_with_allocation(digest(), 7, &resources, budget())
        .unwrap();

    assert_eq!(
        ledger
            .claim_with_allocation(digest(), 7, &resources, budget())
            .unwrap_err(),
        ActuatorRefusal::AlreadyClaimed
    );
}

#[test]
fn same_effect_cannot_be_rebound_to_another_allocation() {
    let dir = tempfile::tempdir().unwrap();
    let ledger = FileEffectLedger::new(dir.path()).unwrap();

    ledger
        .claim_with_allocation(digest(), 7, &envelope("allocation:1"), budget())
        .unwrap();

    assert_eq!(
        ledger
            .claim_with_allocation(digest(), 7, &envelope("allocation:2"), budget())
            .unwrap_err(),
        ActuatorRefusal::AllocationClaimMismatch
    );
}
