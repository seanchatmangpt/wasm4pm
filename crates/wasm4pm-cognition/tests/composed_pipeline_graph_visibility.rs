use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::AuthorityClass;
use wasm4pm_cognition::interview::composition::{
    BreedProposal, ClosureBreed, CognitivePipelineBuilder, PipelineInput,
};
use wasm4pm_cognition::interview::graph::Triple;

#[test]
fn later_breed_reads_graph_proposals_admitted_from_earlier_breed() {
    let producer = ClosureBreed::new(
        "producer",
        vec!["explain:q-graph".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                triples: vec![Triple {
                    subject: "problem".to_string(),
                    predicate: "classified_as".to_string(),
                    object: "graph".to_string(),
                }],
                add_obligations: vec!["consume:classification".to_string()],
                ..BreedProposal::default()
            })
        },
    );
    let consumer = ClosureBreed::new(
        "consumer",
        vec!["consume:classification".to_string()],
        AuthorityClass::Project,
        |input| {
            let visible = input
                .graph
                .query(Some("problem"), Some("classified_as"), Some("graph"));
            assert_eq!(visible.len(), 1);
            Ok(BreedProposal {
                value: Some("classification observed".to_string()),
                ..BreedProposal::default()
            })
        },
    );

    let mut pipeline = CognitivePipelineBuilder::new(0.0)
        .grant(AuthorityClass::Project)
        .breed(producer)
        .breed(consumer)
        .build();
    let output = pipeline
        .run(PipelineInput {
            observation: RawObservation {
                id: "q-graph".to_string(),
                source: "transcript".to_string(),
                text: "Classify this problem".to_string(),
            },
            confidence: 1.0,
            accessibility_profile: None,
            projection_options: Vec::new(),
        })
        .expect("proposal should be visible to later breeds");

    assert_eq!(
        output.breed_values.last().expect("consumer result").1,
        Some("classification observed".to_string())
    );
}
