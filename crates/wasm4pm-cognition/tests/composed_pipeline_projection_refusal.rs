use wasm4pm_cognition::interview::accessibility::{AccessibilityProfile, ProjectionOption};
use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    CognitivePipelineBuilder, PipelineInput, PipelineRefusal,
};

#[test]
fn pipeline_refuses_when_every_projection_is_unusable() {
    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .build();
    let result = pipeline.run(PipelineInput {
        observation: RawObservation {
            id: "q-projection-refusal".to_string(),
            source: "transcript".to_string(),
            text: "Project this".to_string(),
        },
        confidence: 1.0,
        accessibility_profile: Some(AccessibilityProfile {
            unusable: vec!["only-option".to_string()],
            preferred_default: "only-option".to_string(),
            urgency_threshold: 0.5,
        }),
        projection_options: vec![ProjectionOption {
            id: "only-option".to_string(),
            urgency: 1.0,
        }],
    });

    assert!(matches!(result, Err(PipelineRefusal::Projection(_))));
}
