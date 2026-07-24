use wasm4pm_cognition::interview::accessibility::{AccessibilityProfile, ProjectionOption};
use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::composition::{
    CognitivePipelineBuilder, PipelineInput, PipelineRefusal,
};

#[test]
fn requesting_projection_without_project_authority_refuses() {
    let mut pipeline = CognitivePipelineBuilder::new(0.0).build();
    let result = pipeline.run(PipelineInput {
        observation: RawObservation {
            id: "q-no-project".to_string(),
            source: "transcript".to_string(),
            text: "Present this".to_string(),
        },
        confidence: 1.0,
        accessibility_profile: Some(AccessibilityProfile {
            unusable: Vec::new(),
            preferred_default: "concise".to_string(),
            urgency_threshold: 0.9,
        }),
        projection_options: vec![ProjectionOption {
            id: "concise".to_string(),
            urgency: 0.1,
        }],
    });

    assert!(matches!(result, Err(PipelineRefusal::Projection(_))));
}
