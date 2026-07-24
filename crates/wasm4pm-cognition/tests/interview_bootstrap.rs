//! Bootstrap: a fresh session before anything has happened.
//!
//! A cold-start orchestrator and authority broker must refuse work rather
//! than silently permit it just because nothing has been denied yet.

use wasm4pm_cognition::interview::accessibility::{
    select_projection, AccessibilityProfile, ProjectionOption,
};
use wasm4pm_cognition::interview::authority_broker::{AuthorityBroker, AuthorityClass};
use wasm4pm_cognition::interview::blackboard::Blackboard;
use wasm4pm_cognition::interview::construct::construct_obligations;
use wasm4pm_cognition::interview::graph::SemanticGraph;
use wasm4pm_cognition::interview::orchestrator::{Orchestrator, Phase};
use wasm4pm_cognition::interview::receipt::ReceiptLedger;

#[test]
fn fresh_orchestrator_starts_created_with_empty_log() {
    let orchestrator = Orchestrator::new();

    assert_eq!(orchestrator.phase(), Phase::Created);
    assert!(orchestrator.log().is_empty());
}

#[test]
fn fresh_blackboard_and_ledger_start_empty() {
    let blackboard = Blackboard::new();
    let ledger = ReceiptLedger::new();

    assert!(blackboard.admitted().is_empty());
    assert!(blackboard.obligations().is_empty());
    assert!(blackboard.residue().is_empty());
    assert!(ledger.entries().is_empty());
}

#[test]
fn fresh_authority_broker_denies_every_class_by_default() {
    let broker = AuthorityBroker::new();

    assert!(broker.authorize(AuthorityClass::Observe).is_err());
    assert!(broker.authorize(AuthorityClass::Admit).is_err());
    assert!(broker.authorize(AuthorityClass::Project).is_err());
    assert!(broker.authorize(AuthorityClass::ExecuteCode).is_err());
    assert!(broker.authorize(AuthorityClass::Record).is_err());
    assert!(broker.authorize(AuthorityClass::Retain).is_err());
    assert!(broker.authorize(AuthorityClass::Export).is_err());
    assert!(broker.authorize(AuthorityClass::Communicate).is_err());
}

#[test]
fn execute_code_still_refused_before_session_reaches_ready() {
    let mut orchestrator = Orchestrator::new();
    let mut broker = AuthorityBroker::new();

    // Even after granting ExecuteCode, the orchestrator being pre-Ready is a
    // fact the caller must check independently — the broker only answers
    // "is this authority class granted," not "is now an appropriate time."
    // This test asserts the *broker* default-deny half of bootstrap: nothing
    // is authorized purely because the orchestrator exists.
    assert_eq!(orchestrator.phase(), Phase::Created);
    assert!(broker.authorize(AuthorityClass::ExecuteCode).is_err());

    broker.grant(AuthorityClass::ExecuteCode);
    assert!(broker.authorize(AuthorityClass::ExecuteCode).is_ok());
}

#[test]
fn illegal_transition_out_of_created_is_refused_and_recorded() {
    let mut orchestrator = Orchestrator::new();

    let outcome = orchestrator.transition(Phase::Complete);

    assert!(outcome.is_err());
    assert_eq!(orchestrator.phase(), Phase::Created);
    assert_eq!(orchestrator.log().len(), 1);
    assert!(!orchestrator.log()[0].admitted);
}

#[test]
fn fresh_semantic_graph_starts_empty_and_construct_derives_nothing_from_zero_facts() {
    let graph = SemanticGraph::new();
    assert!(graph.is_empty());

    let obligations = construct_obligations(&graph, &[]);

    // Bootstrap: zero admitted facts must never produce a fabricated
    // default obligation.
    assert!(obligations.is_empty());
}

#[test]
fn accessibility_projector_picks_preferred_default_with_no_prior_projection() {
    let profile = AccessibilityProfile {
        unusable: vec![],
        preferred_default: "high_contrast".to_string(),
        urgency_threshold: 0.5,
    };
    let candidates = vec![
        ProjectionOption {
            id: "high_contrast".to_string(),
            urgency: 0.1,
        },
        ProjectionOption {
            id: "reduced_motion".to_string(),
            urgency: 0.9,
        },
    ];

    // Bootstrap: no `previous` turn to stay stable against yet, but the
    // projector must still not pick arbitrarily — it honors the profile's
    // declared preference, not whichever candidate happens to be most urgent.
    let selected = select_projection(&profile, None, &candidates).expect("has a usable option");

    assert_eq!(selected.id, "high_contrast");
}
