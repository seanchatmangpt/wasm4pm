use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    BreedProposal, ClosureBreed, CognitivePipelineBuilder, PipelineEvent, PipelineInput,
};

#[test]
fn composition_trace_records_the_lawful_order() {
    let breed = ClosureBreed::new(
        "explain",
        vec!["explain:q-trace".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                value: Some("explanation".to_string()),
                ..BreedProposal::default()
            })
        },
    );
    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(breed)
        .build();

    let output = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-trace".to_string(),
                source: "transcript".to_string(),
                text: "Explain this".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: None,
            projection_options: Vec::new(),
        })
        .expect("pipeline should succeed");

    assert_eq!(
        output.trace,
        vec![
            PipelineEvent::ObservationAdmitted("q-trace".to_string()),
            PipelineEvent::ObligationsDerived(1),
            PipelineEvent::BreedInvoked("explain".to_string()),
            PipelineEvent::ProposalApplied("explain".to_string()),
        ]
    );
}
