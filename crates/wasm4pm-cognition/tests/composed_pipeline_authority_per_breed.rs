use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    BreedProposal, ClosureBreed, CognitivePipelineBuilder, PipelineInput, PipelineRefusal,
};

#[test]
fn each_breed_declares_its_own_authority_requirement() {
    let local = ClosureBreed::new(
        "local_reasoner",
        vec!["explain:q-authority".to_string()],
        AuthorityClass::Project,
        |_input| Ok(BreedProposal::default()),
    );
    let executor = ClosureBreed::new(
        "sandbox_executor",
        vec!["explain:q-authority".to_string()],
        AuthorityClass::ExecuteCode,
        |_input| Ok(BreedProposal::default()),
    );
    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(local)
        .breed(executor)
        .build();

    assert!(matches!(
        pipeline.run(PipelineInput {
            observation: RawObservation {
                id: "q-authority".to_string(),
                source: "transcript".to_string(),
                text: "Run the candidate".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: None,
            projection_options: Vec::new(),
        }),
        Err(PipelineRefusal::Capability { breed_id, .. }) if breed_id == "sandbox_executor"
    ));
}
