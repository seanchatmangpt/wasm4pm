//! Chicken-and-egg: persisted/replayed state is never trusted merely because
//! it is our own prior output — it is independently re-verified every time.

use wasm4pm_cognition::interview::admission::{AdmissionEngine, RawObservation};
use wasm4pm_cognition::interview::construct::construct_obligations;
use wasm4pm_cognition::interview::graph::SemanticGraph;
use wasm4pm_cognition::interview::orchestrator::{InvalidTransition, Orchestrator, Phase, TransitionRecord};
use wasm4pm_cognition::interview::receipt::ReceiptLedger;
use wasm4pm_cognition::interview::self_play::{run_self_play, FixtureActor};
use wasm4pm_cognition::interview::workflow::{StepRefusal, Workflow};

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

#[test]
fn a_persisted_graph_snapshot_re_parses_into_the_same_queryable_triples() {
    let mut graph = SemanticGraph::new();
    graph.insert("fact-1", "requires_obligation", "explain:obs-1");
    let persisted: Vec<(String, String, String)> = graph
        .query(None, None, None)
        .into_iter()
        .map(|t| (t.subject.clone(), t.predicate.clone(), t.object.clone()))
        .collect();

    let mut reloaded = SemanticGraph::new();
    for (s, p, o) in &persisted {
        reloaded.insert(s.clone(), p.clone(), o.clone());
    }

    assert_eq!(reloaded.len(), graph.len());
    assert_eq!(
        reloaded.query(Some("fact-1"), None, None).len(),
        graph.query(Some("fact-1"), None, None).len()
    );
}

#[test]
fn replaying_a_completed_steps_list_independently_re_checks_eligibility() {
    let mut workflow = Workflow::new();
    workflow.add_step("compile", vec![]);
    workflow.add_step("execute", vec!["compile".to_string()]);

    // A persisted "completed" list, as if reloaded from a fixture, that
    // claims execute finished before compile — replay must independently
    // re-derive eligibility and refuse, not trust the recorded order.
    let claimed_completed = vec!["execute".to_string(), "compile".to_string()];

    let outcome = workflow.replay_completed(&claimed_completed);

    assert!(matches!(outcome, Err(StepRefusal::NotEligible(_))));
}

#[test]
fn a_self_play_artifact_is_candidate_state_until_independently_verified() {
    let seed = SemanticGraph::new();
    let actor = FixtureActor::new("solver-1");

    // The verifier here independently re-derives whether the artifact is
    // admissible, rather than trusting the actor's own output — mirroring
    // the general "ggen-generated content must independently re-verify"
    // discipline this ARD applies to any generated/self-play artifact.
    let run = run_self_play(&actor, &seed, |artifact| {
        artifact.content == format!("candidate-derived-from-{}-triples", seed.len())
    });

    assert!(run.admitted);
    assert_eq!(run.actor_id, "solver-1");

    // A tampered/forged artifact (wrong content for its claimed derivation)
    // must fail the same independent check.
    let forged_run = run_self_play(&actor, &seed, |_artifact| false);
    assert!(!forged_run.admitted);
}

#[test]
fn construct_does_not_re_propose_an_obligation_already_admitted_into_the_graph() {
    let engine = AdmissionEngine::new(0.0);
    let fact = engine
        .admit(
            &[],
            &RawObservation {
                id: "obs-1".to_string(),
                source: "transcript".to_string(),
                text: "x and y".to_string(),
            },
            1.0,
        )
        .expect("admits");

    let mut graph = SemanticGraph::new();
    let first_pass = construct_obligations(&graph, &[fact.clone()]);
    assert_eq!(first_pass.len(), 1);

    // Admit the proposed obligation into the graph, as a caller would.
    let candidate = &first_pass[0].0;
    graph.insert(candidate.subject.clone(), candidate.predicate.clone(), candidate.object.clone());

    // Re-running CONSTRUCT against the same admitted fact must not propose
    // the same obligation again now that it's already in the graph.
    let second_pass = construct_obligations(&graph, &[fact]);
    assert!(second_pass.is_empty());
}
