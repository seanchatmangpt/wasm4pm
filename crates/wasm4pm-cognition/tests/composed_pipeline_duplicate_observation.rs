use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::composition::{
    CognitivePipelineBuilder, PipelineInput, PipelineRefusal,
};

#[test]
fn repeated_observation_id_is_refused_on_later_run() {
    let mut pipeline = CognitivePipelineBuilder::new(0.0).build();
    let make_input = || PipelineInput {
        observation: RawObservation {
            id: "duplicate".to_string(),
            source: "transcript".to_string(),
            text: "same identity".to_string(),
        },
        confidence: 1.0,
        accessibility_profile: None,
        projection_options: Vec::new(),
    };

    pipeline.run(make_input()).expect("first observation should pass");
    assert!(matches!(
        pipeline.run(make_input()),
        Err(PipelineRefusal::Admission(_))
    ));
}
