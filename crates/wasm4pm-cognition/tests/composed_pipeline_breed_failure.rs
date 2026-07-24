use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    BreedFailure, ClosureBreed, CognitivePipelineBuilder, PipelineInput, PipelineRefusal,
};

#[test]
fn downstream_breed_failure_remains_typed_and_attributed() {
    let breed = ClosureBreed::new(
        "planner",
        vec!["explain:q-failure".to_string()],
        AuthorityClass::Project,
        |_input| {
            Err(BreedFailure {
                code: "NO_PLAN".to_string(),
                message: "no bounded plan satisfies the admitted constraints".to_string(),
            })
        },
    );
    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(breed)
        .build();

    let refusal = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-failure".to_string(),
                source: "transcript".to_string(),
                text: "Find a valid plan".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: None,
            projection_options: Vec::new(),
        })
        .expect_err("breed must refuse");

    assert_eq!(
        refusal,
        PipelineRefusal::Breed {
            breed_id: "planner".to_string(),
            failure: BreedFailure {
                code: "NO_PLAN".to_string(),
                message: "no bounded plan satisfies the admitted constraints".to_string(),
            },
        }
    );
}
