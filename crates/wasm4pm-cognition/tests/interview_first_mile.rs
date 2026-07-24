//! First mile: the very first observation, with no prior admitted state.
//!
//! An empty admitted set is not license to wave a malformed first
//! observation through, and a well-formed one must land at sequence 1 with
//! exactly one receipt.

use wasm4pm_cognition::interview::accessibility::{
    select_projection, AccessibilityProfile, ProjectionOption,
};
use wasm4pm_cognition::interview::admission::{AdmissionEngine, RawObservation, RefusalReason};
use wasm4pm_cognition::interview::blackboard::Blackboard;
use wasm4pm_cognition::interview::hypothesis::{HypothesisManager, HypothesisOutcome};
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

#[test]
fn hypothesis_manager_abstains_with_no_evidence_yet() {
    let manager = HypothesisManager::new(
        vec!["dynamic_programming".to_string(), "graph_search".to_string()],
        0.5,
        0.1,
    );

    // First mile: zero evidence admitted -> never a fabricated leader.
    assert_eq!(manager.evaluate(), HypothesisOutcome::Abstain);
}

#[test]
fn hypothesis_manager_commits_once_a_hypothesis_clears_floor_and_margin() {
    let mut manager = HypothesisManager::new(
        vec!["dynamic_programming".to_string(), "graph_search".to_string()],
        0.5,
        0.2,
    );

    manager.add_evidence("dynamic_programming", 0.8);

    assert_eq!(
        manager.evaluate(),
        HypothesisOutcome::Committed {
            id: "dynamic_programming".to_string(),
            score: 0.8,
        }
    );
}

#[test]
fn hypothesis_manager_abstains_below_confidence_floor_even_with_a_clear_margin() {
    // Only one hypothesis, so margin (leader minus 0.0 runner-up) trivially
    // clears a small threshold -- isolates the confidence-floor check itself.
    let mut manager = HypothesisManager::new(vec!["only_hypothesis".to_string()], 0.9, 0.05);

    manager.add_evidence("only_hypothesis", 0.3);

    assert_eq!(manager.evaluate(), HypothesisOutcome::Abstain);
}

#[test]
fn accessibility_projector_first_projection_has_no_previous_turn_to_stay_stable_against() {
    let profile = AccessibilityProfile {
        unusable: vec![],
        preferred_default: "screen_reader".to_string(),
        urgency_threshold: 0.5,
    };
    let candidates = vec![ProjectionOption {
        id: "screen_reader".to_string(),
        urgency: 0.2,
    }];

    let selected = select_projection(&profile, None, &candidates).expect("has a usable option");

    assert_eq!(selected.id, "screen_reader");
}
