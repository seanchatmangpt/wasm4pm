//! Chicken-and-egg: persisted/replayed state is never trusted merely because
//! it is our own prior output — it is independently re-verified every time.

use wasm4pm_cognition::interview::orchestrator::{InvalidTransition, Orchestrator, Phase, TransitionRecord};
use wasm4pm_cognition::interview::receipt::ReceiptLedger;

#[test]
fn a_well_formed_persisted_ledger_replays_and_verifies() {
    let mut ledger = ReceiptLedger::new();
    ledger.record("admission", "hash-a", "ok");
    ledger.record("admission", "hash-b", "ok");
    let persisted = ledger.entries().to_vec();

    let round_tripped = ReceiptLedger::from_persisted(persisted).expect("well-formed ledger replays");

    assert_eq!(round_tripped.entries().len(), 2);
}

#[test]
fn a_tampered_receipt_field_breaks_replay_even_though_it_came_from_our_own_write() {
    let mut ledger = ReceiptLedger::new();
    ledger.record("admission", "hash-a", "ok");
    let mut persisted = ledger.entries().to_vec();

    // Tamper: rewrite the outcome after the fact, as if a stale/forged
    // fixture were reloaded — the stored receipt_hash no longer matches.
    persisted[0].outcome = "refused".to_string();

    let outcome = ReceiptLedger::from_persisted(persisted);

    assert!(outcome.is_err());
}

#[test]
fn a_tampered_previous_hash_link_breaks_the_chain() {
    let mut ledger = ReceiptLedger::new();
    ledger.record("admission", "hash-a", "ok");
    ledger.record("admission", "hash-b", "ok");
    let mut persisted = ledger.entries().to_vec();

    persisted[1].previous_receipt_hash = Some("f".repeat(64));

    let outcome = ReceiptLedger::from_persisted(persisted);

    assert!(outcome.is_err());
}

#[test]
fn a_persisted_transition_log_with_a_flipped_admitted_flag_is_independently_re_refused() {
    let mut orchestrator = Orchestrator::new();
    orchestrator.transition(Phase::Preparing).unwrap();
    // Illegal transition, recorded as refused (admitted: false).
    let _ = orchestrator.transition(Phase::Complete);

    let mut tampered_log: Vec<TransitionRecord> = orchestrator.log().to_vec();
    // Tamper: claim the illegal transition was actually admitted, as if a
    // stale/forged log were reloaded from disk.
    let last = tampered_log.len() - 1;
    tampered_log[last].admitted = true;

    let outcome: Result<Orchestrator, InvalidTransition> = Orchestrator::replay(&tampered_log);

    // Replay independently re-validates the transition table; it does not
    // trust the persisted `admitted: true` flag.
    assert!(outcome.is_err());
}
