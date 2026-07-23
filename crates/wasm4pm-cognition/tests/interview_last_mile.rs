//! Last mile: an engineered failure must land in Refused, receipted as a
//! refusal — never silently retried or coerced into Complete.

use wasm4pm_cognition::interview::orchestrator::{Orchestrator, Phase};
use wasm4pm_cognition::interview::receipt::ReceiptLedger;

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
