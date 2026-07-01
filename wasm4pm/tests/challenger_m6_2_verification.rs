use std::collections::HashSet;
use wasm4pm::powl::conversion::{from_petri_net::petri_net_to_powl, to_petri_net};
use wasm4pm::powl::extensive_playout::{extensive_playout, ExtensivePlayoutConfig};
use wasm4pm::powl_arena::{PowlArena, PowlNode};
use wasm4pm::powl_parser::parse_powl_model_string;

#[test]
fn test_strict_partial_order_interleaving_3_nodes() {
    let mut arena = PowlArena::new();

    let a = arena.add_transition(Some("A".to_string()));
    let b = arena.add_transition(Some("B".to_string()));
    let c = arena.add_transition(Some("C".to_string()));

    // Create StrictPartialOrder with A, B, C
    let root = arena.add_strict_partial_order(vec![a, b, c]);

    // Order edge: A -> B (local index 0 -> 1)
    arena.add_order_edge(root, 0, 1).unwrap();

    let config = ExtensivePlayoutConfig {
        min_length: 3,
        max_length: 3,
        max_loops: 1,
        max_traces: 100,
    };

    let result = extensive_playout(&arena, root, &config);

    // Expected traces:
    // ["A", "B", "C"]
    // ["A", "C", "B"]
    // ["C", "A", "B"]
    //
    // Invalid traces (violating A -> B):
    // ["B", "A", "C"]
    // ["B", "C", "A"]
    // ["C", "B", "A"]

    assert_eq!(result.traces.len(), 3);

    let mut trace_strings: Vec<Vec<String>> = result
        .traces
        .iter()
        .map(|tr| {
            tr.events
                .iter()
                .map(|ev| match &ev.attributes.get("concept:name").unwrap() {
                    wasm4pm::models::AttributeValue::String(s) => s.clone(),
                    _ => panic!("Expected string value"),
                })
                .collect()
        })
        .collect();
    trace_strings.sort();

    let expected = vec![
        vec!["A".to_string(), "B".to_string(), "C".to_string()],
        vec!["A".to_string(), "C".to_string(), "B".to_string()],
        vec!["C".to_string(), "A".to_string(), "B".to_string()],
    ];

    assert_eq!(trace_strings, expected);
}

#[test]
fn test_removal_of_old_xor_fallback() {
    // 1. Parse a simple model that represents a choice logic "X ( A, B )"
    let mut arena = PowlArena::new();
    let root = parse_powl_model_string("X ( A, B )", &mut arena).unwrap();

    // 2. Convert to Petri Net
    let pn_result = to_petri_net::apply(&arena, root);
    let pn_json = serde_json::to_string(&pn_result).unwrap();

    // 3. Convert Petri Net back to POWL
    let (arena2, root2) = petri_net_to_powl(&pn_json).unwrap();

    let repr = arena2.to_repr(root2);
    println!("Reconstructed repr: {}", repr);

    // 4. Verify that a ChoiceGraph node was created in the arena
    let mut has_choice_graph = false;
    let mut has_xor_operator = false;

    for node in &arena2.nodes {
        match node {
            PowlNode::ChoiceGraph(_) => {
                has_choice_graph = true;
            }
            PowlNode::OperatorPowl(op) => {
                if op.operator == wasm4pm::powl_arena::Operator::Xor {
                    has_xor_operator = true;
                }
            }
            _ => {}
        }
    }

    assert!(
        has_choice_graph,
        "Expected a ChoiceGraph node in the arena, but none was found"
    );
    assert!(
        !has_xor_operator,
        "Expected no OperatorPowl(Xor) in the arena, but one was found"
    );
}
