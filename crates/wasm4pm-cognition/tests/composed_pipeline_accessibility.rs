use wasm4pm_cognition::interview::accessibility::{AccessibilityProfile, ProjectionOption};
use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{CognitivePipelineBuilder, PipelineInput};

#[test]
fn composed_pipeline_preserves_projection_stability_across_runs() {
    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .build();
    let profile = AccessibilityProfile {
        unusable: Vec::new(),
        preferred_default: "concise".to_string(),
        urgency_threshold: 0.9,
    };

    let first = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-a".to_string(),
                source: "transcript".to_string(),
                text: "First question".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: Some(profile.clone()),
            projection_options: vec![
                ProjectionOption {
                    id: "concise".to_string(),
                    urgency: 0.2,
                },
                ProjectionOption {
                    id: "detailed".to_string(),
                    urgency: 0.8,
                },
            ],
        })
        .expect("first projection should succeed");
    assert_eq!(first.projection.expect("projection").id, "concise");

    let second = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-b".to_string(),
                source: "transcript".to_string(),
                text: "Second question".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: Some(profile),
            projection_options: vec![
                ProjectionOption {
                    id: "concise".to_string(),
                    urgency: 0.2,
                },
                ProjectionOption {
                    id: "detailed".to_string(),
                    urgency: 0.8,
                },
            ],
        })
        .expect("stable projection should succeed");
    assert_eq!(second.projection.expect("projection").id, "concise");
}
