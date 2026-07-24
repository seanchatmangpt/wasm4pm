use wasm4pm_cognition::interview::accessibility::{AccessibilityProfile, ProjectionOption};
use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    BreedProposal, ClosureBreed, CognitivePipelineBuilder, PipelineEvent, PipelineInput,
};
use wasm4pm_cognition::interview::graph::Triple;
use wasm4pm_cognition::interview::verification::VerificationStatus;

#[test]
fn downstream_user_declares_breed_without_manually_wiring_pipeline() {
    let breed = ClosureBreed::new(
        "solve_two_sum",
        vec!["explain:question-1".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                triples: vec![Triple {
                    subject: "candidate:two-sum".to_string(),
                    predicate: "uses_strategy".to_string(),
                    object: "hash-map".to_string(),
                }],
                resolve_obligations: vec!["explain:question-1".to_string()],
                verification: Some((
                    "candidate:two-sum".to_string(),
                    VerificationStatus::VisibleTestsPass,
                )),
                value: Some("Use a hash map for O(n) lookup".to_string()),
                ..BreedProposal::default()
            })
        },
    );

    let mut pipeline = CognitivePipelineBuilder::new(0.5)
        .grant(AuthorityClass::Project)
        .breed(breed)
        .require_verification(
            "candidate:two-sum",
            VerificationStatus::VisibleTestsPass,
        )
        .build();

    let output = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "question-1".to_string(),
                source: "transcript".to_string(),
                text: "Return two indices whose values sum to a target".to_string(),
            },
            confidence: 0.99,
            accessibility_profile: Some(AccessibilityProfile {
                unusable: vec!["dense".to_string()],
                preferred_default: "concise".to_string(),
                urgency_threshold: 0.9,
            }),
            projection_options: vec![
                ProjectionOption {
                    id: "dense".to_string(),
                    urgency: 0.8,
                },
                ProjectionOption {
                    id: "concise".to_string(),
                    urgency: 0.4,
                },
            ],
        })
        .expect("the declared pipeline should compose lawfully");

    assert_eq!(output.admitted.id, "question-1");
    assert_eq!(
        output.breed_values,
        vec![(
            "solve_two_sum".to_string(),
            Some("Use a hash map for O(n) lookup".to_string())
        )]
    );
    assert_eq!(output.projection.expect("projection").id, "concise");
    assert!(pipeline.context().blackboard().obligations().is_empty());
    assert_eq!(
        pipeline
            .context()
            .graph()
            .query(
                Some("candidate:two-sum"),
                Some("uses_strategy"),
                Some("hash-map")
            )
            .len(),
        1
    );
    assert!(output.trace.contains(&PipelineEvent::VerificationEstablished(
        "candidate:two-sum".to_string(),
        VerificationStatus::VisibleTestsPass,
    )));
}
