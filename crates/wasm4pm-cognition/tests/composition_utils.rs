use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::CompositionContext;
use wasm4pm_cognition::interview::hypothesis::HypothesisOutcome;

#[test]
fn obligation_derivation_is_idempotent_and_queryable() {
    let mut context = CompositionContext::new(0.5);
    context.grant(AuthorityClass::Admit);
    context
        .admit(
            &RawObservation {
                id: "obs-1".to_string(),
                source: "transcript".to_string(),
                text: "Design a bounded queue".to_string(),
            },
            0.9,
        )
        .expect("observation should be admitted");

    assert_eq!(context.derive_obligations(), 1);
    assert_eq!(context.derive_obligations(), 0);
    assert!(context.blackboard().obligations().contains("explain:obs-1"));
    assert_eq!(
        context
            .graph()
            .query(None, Some("requires_obligation"), Some("explain:obs-1"))
            .len(),
        1
    );
}

#[test]
fn signed_hypothesis_evidence_abstains_or_commits_without_hidden_state() {
    let abstain = CompositionContext::evaluate_hypotheses(
        vec!["array".to_string(), "graph".to_string()],
        0.7,
        0.2,
        vec![("array".to_string(), 0.6)],
    );
    assert_eq!(abstain, HypothesisOutcome::Abstain);

    let committed = CompositionContext::evaluate_hypotheses(
        vec!["array".to_string(), "graph".to_string()],
        0.7,
        0.2,
        vec![
            ("array".to_string(), 0.9),
            ("graph".to_string(), 0.2),
            ("graph".to_string(), -0.1),
        ],
    );
    assert_eq!(
        committed,
        HypothesisOutcome::Committed {
            id: "array".to_string(),
            score: 0.9,
        }
    );
}
