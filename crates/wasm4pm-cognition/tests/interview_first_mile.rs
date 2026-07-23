//! First mile: the very first observation, with no prior admitted state.
//!
//! An empty admitted set is not license to wave a malformed first
//! observation through, and a well-formed one must land at sequence 1 with
//! exactly one receipt.

use wasm4pm_cognition::interview::admission::{AdmissionEngine, RawObservation, RefusalReason};
use wasm4pm_cognition::interview::blackboard::Blackboard;
use wasm4pm_cognition::interview::receipt::ReceiptLedger;

fn observation(id: &str, text: &str) -> RawObservation {
    RawObservation {
        id: id.to_string(),
        source: "transcript".to_string(),
        text: text.to_string(),
    }
}

#[test]
fn first_well_formed_observation_admits_at_sequence_one() {
    let engine = AdmissionEngine::new(0.0);
    let mut blackboard = Blackboard::new();
    assert!(blackboard.admitted().is_empty());

    let fact = blackboard
        .propose_admission(&engine, &observation("obs-1", "x and y dictionary of moves"), 1.0)
        .expect("first observation admits");

    assert_eq!(fact.sequence, 1);
    assert_eq!(blackboard.admitted().len(), 1);
}

#[test]
fn first_observation_records_exactly_one_receipt() {
    let engine = AdmissionEngine::new(0.0);
    let mut blackboard = Blackboard::new();
    let mut ledger = ReceiptLedger::new();

    let fact = blackboard
        .propose_admission(&engine, &observation("obs-1", "x and y"), 1.0)
        .expect("first observation admits")
        .clone();
    ledger.record("admission", &fact.fact_hash, "ok");

    assert_eq!(ledger.entries().len(), 1);
    assert_eq!(ledger.entries()[0].sequence, 1);
    assert!(ledger.entries()[0].previous_receipt_hash.is_none());
}

#[test]
fn empty_admitted_set_does_not_excuse_a_malformed_first_observation() {
    let engine = AdmissionEngine::new(0.0);
    let mut blackboard = Blackboard::new();
    assert!(blackboard.admitted().is_empty());

    let outcome = blackboard.propose_admission(&engine, &observation("obs-1", "   "), 1.0);

    assert_eq!(outcome, Err(RefusalReason::SchemaInvalid));
    assert!(blackboard.admitted().is_empty());
}

#[test]
fn empty_admitted_set_does_not_excuse_below_floor_confidence() {
    let engine = AdmissionEngine::new(0.5);
    let mut blackboard = Blackboard::new();

    let outcome = blackboard.propose_admission(&engine, &observation("obs-1", "hello"), 0.1);

    assert_eq!(outcome, Err(RefusalReason::BelowConfidenceFloor));
    assert!(blackboard.admitted().is_empty());
}
