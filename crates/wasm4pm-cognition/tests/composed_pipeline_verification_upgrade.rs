use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    BreedProposal, ClosureBreed, CognitivePipelineBuilder, PipelineInput,
};
use wasm4pm_cognition::interview::verification::VerificationStatus;

#[test]
fn later_breed_can_raise_but_not_weaken_verification_standing() {
    let example = ClosureBreed::new(
        "example_check",
        vec!["explain:q-verify".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                verification: Some(("candidate".to_string(), VerificationStatus::ExamplePass)),
                ..BreedProposal::default()
            })
        },
    );
    let visible = ClosureBreed::new(
        "visible_tests",
        vec!["explain:q-verify".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                verification: Some((
                    "candidate".to_string(),
                    VerificationStatus::VisibleTestsPass,
                )),
                ..BreedProposal::default()
            })
        },
    );
    let downgrade_attempt = ClosureBreed::new(
        "repeat_example",
        vec!["explain:q-verify".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                verification: Some(("candidate".to_string(), VerificationStatus::ExamplePass)),
                ..BreedProposal::default()
            })
        },
    );

    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(example)
        .breed(visible)
        .breed(downgrade_attempt)
        .require_verification("candidate", VerificationStatus::VisibleTestsPass)
        .build();

    pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-verify".to_string(),
                source: "transcript".to_string(),
                text: "Verify candidate".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: None,
            projection_options: Vec::new(),
        })
        .expect("strongest verification should be retained");
}
