use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    BreedProposal, ClosureBreed, CognitivePipelineBuilder, PipelineEvent, PipelineInput,
};

#[test]
fn one_breed_can_unlock_a_later_breed_without_consumer_pipeline_knowledge() {
    let classify = ClosureBreed::new(
        "classify_problem",
        vec!["explain:q-1".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                add_obligations: vec!["plan:array-search".to_string()],
                value: Some("array-search".to_string()),
                ..BreedProposal::default()
            })
        },
    );
    let plan = ClosureBreed::new(
        "plan_solution",
        vec!["plan:array-search".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                resolve_obligations: vec![
                    "explain:q-1".to_string(),
                    "plan:array-search".to_string(),
                ],
                value: Some("scan once with indexed memory".to_string()),
                ..BreedProposal::default()
            })
        },
    );

    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(classify)
        .breed(plan)
        .build();

    let output = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-1".to_string(),
                source: "transcript".to_string(),
                text: "Find a pair in an array".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: None,
            projection_options: Vec::new(),
        })
        .expect("the first breed should lawfully unlock the second");

    assert_eq!(
        output.breed_values,
        vec![
            ("classify_problem".to_string(), Some("array-search".to_string())),
            (
                "plan_solution".to_string(),
                Some("scan once with indexed memory".to_string())
            ),
        ]
    );
    assert_eq!(
        output
            .trace
            .iter()
            .filter(|event| matches!(event, PipelineEvent::BreedInvoked(_)))
            .count(),
        2
    );
    assert!(pipeline.context().blackboard().obligations().is_empty());
}
