use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::composition::{CognitivePipelineBuilder, PipelineInput};

#[test]
fn pipeline_can_admit_and_derive_without_any_downstream_breeds() {
    let mut pipeline = CognitivePipelineBuilder::new(0.0).build();
    let output = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-empty".to_string(),
                source: "transcript".to_string(),
                text: "Capture this question".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: None,
            projection_options: Vec::new(),
        })
        .expect("admission and derivation should not require a breed");

    assert!(output.breed_values.is_empty());
    assert!(pipeline
        .context()
        .blackboard()
        .obligations()
        .contains("explain:q-empty"));
}
