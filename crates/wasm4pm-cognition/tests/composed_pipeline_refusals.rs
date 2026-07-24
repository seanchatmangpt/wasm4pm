use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::capability::PreconditionRefusal;
use wasm4pm_cognition::interview::composition::{
    BreedProposal, CapabilityRequestRefusal, ClosureBreed, CognitivePipelineBuilder,
    PipelineInput, PipelineRefusal,
};
use wasm4pm_cognition::interview::verification::VerificationStatus;

fn input() -> PipelineInput {
    PipelineInput {
        observation: RawObservation {
            id: "q-refusal".to_string(),
            source: "transcript".to_string(),
            text: "Explain the problem".to_string(),
        },
        confidence: 1.0,
        accessibility_profile: None,
        projection_options: Vec::new(),
    }
}

#[test]
fn pipeline_preserves_missing_precondition_refusal() {
    let breed = ClosureBreed::new(
        "requires_unavailable_fact",
        vec!["missing:fact".to_string()],
        AuthorityClass::Project,
        |_input| Ok(BreedProposal::default()),
    );
    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(breed)
        .build();

    let refusal = pipeline.run(input()).expect_err("precondition must refuse");
    assert!(matches!(
        refusal,
        PipelineRefusal::Capability {
            refusal: CapabilityRequestRefusal::Precondition(PreconditionRefusal::Unmet(_)),
            ..
        }
    ));
}

#[test]
fn pipeline_preserves_default_deny_authority_refusal() {
    let breed = ClosureBreed::new(
        "project_answer",
        vec!["explain:q-refusal".to_string()],
        AuthorityClass::Project,
        |_input| Ok(BreedProposal::default()),
    );
    let mut pipeline = CognitivePipelineBuilder::new(0.0).breed(breed).build();

    let refusal = pipeline.run(input()).expect_err("project authority was not granted");
    assert!(matches!(
        refusal,
        PipelineRefusal::Capability {
            refusal: CapabilityRequestRefusal::Authority(_),
            ..
        }
    ));
}

#[test]
fn pipeline_refuses_unearned_verification_standing() {
    let breed = ClosureBreed::new(
        "unverified_candidate",
        vec!["explain:q-refusal".to_string()],
        AuthorityClass::Project,
        |_input| Ok(BreedProposal::default()),
    );
    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(breed)
        .require_verification("candidate", VerificationStatus::VisibleTestsPass)
        .build();

    assert!(matches!(
        pipeline.run(input()),
        Err(PipelineRefusal::Verification(_))
    ));
}
