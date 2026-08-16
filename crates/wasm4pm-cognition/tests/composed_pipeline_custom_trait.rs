use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    BreedFailure, BreedInput, BreedProposal, CognitiveBreed, CognitivePipelineBuilder,
    PipelineInput,
};

struct DomainBreed;

impl CognitiveBreed for DomainBreed {
    fn id(&self) -> &str {
        "domain_breed"
    }

    fn preconditions(&self) -> Vec<String> {
        vec!["explain:q-domain".to_string()]
    }

    fn authority_requirement(&self) -> AuthorityClass {
        AuthorityClass::Project
    }

    fn evaluate(&self, input: BreedInput<'_>) -> Result<BreedProposal, BreedFailure> {
        assert_eq!(input.blackboard.admitted().len(), 1);
        assert_eq!(
            input
                .graph
                .query(None, Some("requires_obligation"), None)
                .len(),
            1
        );
        Ok(BreedProposal {
            value: Some("domain result".to_string()),
            ..BreedProposal::default()
        })
    }
}

#[test]
fn downstream_users_can_implement_the_public_breed_trait() {
    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(DomainBreed)
        .build();
    let output = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-domain".to_string(),
                source: "transcript".to_string(),
                text: "Use a custom domain breed".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: None,
            projection_options: Vec::new(),
        })
        .expect("custom trait breed should compose");

    assert_eq!(
        output.breed_values,
        vec![(
            "domain_breed".to_string(),
            Some("domain result".to_string())
        )]
    );
}
