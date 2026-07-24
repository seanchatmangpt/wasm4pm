//! Last mile: an engineered failure must land in Refused, receipted as a
//! refusal — never silently retried or coerced into Complete.

use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::blackboard::Blackboard;
use wasm4pm_cognition::interview::capability::{CapabilityDescriptor, CapabilityRegistry, PreconditionRefusal};
use wasm4pm_cognition::interview::orchestrator::{Orchestrator, Phase};
use wasm4pm_cognition::interview::receipt::ReceiptLedger;
use wasm4pm_cognition::interview::verification::{UnrecordedStatus, VerificationLedger, VerificationStatus};
use wasm4pm_cognition::interview::workflow::{StepRefusal, Workflow};

fn advance_to(orchestrator: &mut Orchestrator, phases: &[Phase]) {
    for &phase in phases {
        orchestrator
            .transition(phase)
            .unwrap_or_else(|_| panic!("expected legal transition to {phase:?}"));
    }
}

#[test]
fn engineered_failure_lands_in_refused_not_complete() {
    let mut orchestrator = Orchestrator::new();
    advance_to(
        &mut orchestrator,
        &[
            Phase::Preparing,
            Phase::Ready,
            Phase::Introduction,
            Phase::ProblemPresentation,
            Phase::Clarification,
            Phase::Planning,
            Phase::Implementation,
        ],
    );

    // A fatal admission failure mid-interview: transition straight to Refused.
    let outcome = orchestrator.transition(Phase::Refused);

    assert!(outcome.is_ok());
    assert_eq!(orchestrator.phase(), Phase::Refused);
    // Refused is terminal: nothing transitions out of it, including Complete.
    assert!(orchestrator.transition(Phase::Complete).is_err());
    assert_eq!(orchestrator.phase(), Phase::Refused);
}

#[test]
fn refusal_is_receipted_and_never_coerced_into_an_ok_outcome() {
    let mut orchestrator = Orchestrator::new();
    advance_to(&mut orchestrator, &[Phase::Preparing, Phase::Ready]);

    let mut ledger = ReceiptLedger::new();
    let subject_hash = blake3::hash(b"ready->refused").to_hex().to_string();

    let result = orchestrator.transition(Phase::Refused);
    assert!(result.is_ok());

    let outcome_label = match result {
        Ok(_) => "ok",
        Err(_) => "transition_refused",
    };
    ledger.record("transition", &subject_hash, outcome_label);

    assert_eq!(ledger.entries().len(), 1);
    assert_eq!(ledger.entries()[0].outcome, "ok");
    // The receipt records the *transition's own* outcome ("ok" — the
    // orchestrator did successfully move to Refused), and the orchestrator's
    // resulting phase is independently checked here too, so a test tampering
    // with one cannot silently hide a fabricated success on the other.
    assert_eq!(orchestrator.phase(), Phase::Refused);
}

#[test]
fn replaying_a_refused_transition_reproduces_the_same_refusal_deterministically() {
    let mut orchestrator = Orchestrator::new();
    advance_to(&mut orchestrator, &[Phase::Preparing, Phase::Ready]);
    // Illegal: Ready cannot go directly to Debugging.
    let _ = orchestrator.transition(Phase::Debugging);
    assert_eq!(orchestrator.phase(), Phase::Ready);

    let replayed = Orchestrator::replay(orchestrator.log()).expect("log replays");

    assert_eq!(replayed.phase(), orchestrator.phase());
    assert_eq!(replayed.log(), orchestrator.log());
}

#[test]
fn capability_with_unmet_precondition_is_refused_not_granted() {
    let mut registry = CapabilityRegistry::new();
    registry.register(CapabilityDescriptor {
        capability_id: "execute_python".to_string(),
        preconditions: vec!["source_compiles".to_string()],
        postconditions: vec![],
        effects: vec!["process_execution".to_string()],
        authority_requirement: AuthorityClass::ExecuteCode,
    });
    let blackboard = Blackboard::new();

    let outcome = registry.check_preconditions("execute_python", &blackboard);

    // A registered descriptor existing is not, by itself, a grant.
    assert_eq!(
        outcome,
        Err(PreconditionRefusal::Unmet(
            wasm4pm_cognition::interview::capability::PreconditionUnmet {
                capability_id: "execute_python".to_string(),
                missing: "source_compiles".to_string(),
            }
        ))
    );
}

#[test]
fn capability_with_satisfied_precondition_is_granted() {
    let mut registry = CapabilityRegistry::new();
    registry.register(CapabilityDescriptor {
        capability_id: "execute_python".to_string(),
        preconditions: vec!["source_compiles".to_string()],
        postconditions: vec![],
        effects: vec![],
        authority_requirement: AuthorityClass::ExecuteCode,
    });
    let mut blackboard = Blackboard::new();
    blackboard.add_obligation("source_compiles");

    let outcome = registry.check_preconditions("execute_python", &blackboard);

    assert!(outcome.is_ok());
}

#[test]
fn completing_a_workflow_step_out_of_order_is_refused() {
    let mut workflow = Workflow::new();
    workflow.add_step("compile", vec![]);
    workflow.add_step("execute", vec!["compile".to_string()]);

    let outcome = workflow.complete_step("execute");

    assert!(matches!(outcome, Err(StepRefusal::NotEligible(_))));
    assert!(workflow.completed().is_empty());
}

#[test]
fn claiming_a_stronger_verification_status_than_recorded_is_refused() {
    let mut ledger = VerificationLedger::new();
    ledger.record("candidate-1", VerificationStatus::ExamplePass);

    let outcome = ledger.assert_minimum("candidate-1", VerificationStatus::FormallyProven);

    assert_eq!(
        outcome,
        Err(UnrecordedStatus {
            candidate_id: "candidate-1".to_string(),
            recorded: Some(VerificationStatus::ExamplePass),
            claimed: VerificationStatus::FormallyProven,
        })
    );
}
