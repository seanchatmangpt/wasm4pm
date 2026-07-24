use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::composition::{
    CognitivePipelineBuilder, PipelineInput, PipelineRefusal,
};

#[test]
fn pipeline_stops_before_breeds_when_admission_refuses() {
    let mut pipeline = CognitivePipelineBuilder::new(0.8).build();
    let result = pipeline.run(PipelineInput {
        observation: RawObservation {
            id: "q-low-confidence".to_string(),
            source: "transcript".to_string(),
            text: "uncertain transcript".to_string(),
        },
        confidence: 0.2,
        accessibility_profile: None,
        projection_options: Vec::new(),
    });

    assert!(matches!(result, Err(PipelineRefusal::Admission(_))));
    assert!(pipeline.context().blackboard().admitted().is_empty());
}
