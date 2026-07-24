use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::composition::{CognitivePipelineBuilder, PipelineInput};

#[test]
fn pipeline_retains_admitted_state_across_distinct_runs() {
    let mut pipeline = CognitivePipelineBuilder::new(0.0).build();
    for (id, text) in [("q-1", "first"), ("q-2", "second")] {
        pipeline
            .run(PipelineInput {
                observation: RawObservation {
                    id: id.to_string(),
                    source: "transcript".to_string(),
                    text: text.to_string(),
                },
                confidence: 1.0,
                accessibility_profile: None,
                projection_options: Vec::new(),
            })
            .expect("distinct observations should compose");
    }

    assert_eq!(pipeline.context().blackboard().admitted().len(), 2);
    assert_eq!(pipeline.context().graph().len(), 2);
}
