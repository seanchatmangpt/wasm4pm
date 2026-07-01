//! Label replacement utility for POWL models.

use crate::powl_arena::{PowlArena, PowlNode};
use std::collections::HashMap;
use wasm4pm_compat::powl::{ChoiceGraph, ChoiceGraphNode};

/// Replace activity labels in a POWL subtree according to a dictionary.
pub fn apply(
    arena: &PowlArena,
    node_idx: u32,
    label_map: &HashMap<String, String>,
    dest_arena: &mut PowlArena,
) -> u32 {
    match arena.get(node_idx) {
        None => node_idx,

        Some(PowlNode::Transition(t)) => {
            let new_label = t
                .label
                .as_ref()
                .and_then(|l| label_map.get(l).cloned().or_else(|| Some(l.clone())));
            dest_arena.add_transition(new_label)
        }

        Some(PowlNode::FrequentTransition(t)) => {
            let new_activity = label_map
                .get(&t.activity)
                .cloned()
                .unwrap_or_else(|| t.activity.clone());
            dest_arena.add_frequent_transition(new_activity, t.min_freq, t.max_freq)
        }

        Some(PowlNode::OperatorPowl(op)) => {
            let new_children: Vec<u32> = op
                .children
                .iter()
                .map(|&c| apply(arena, c, label_map, dest_arena))
                .collect();
            dest_arena.add_operator(op.operator, new_children)
        }

        Some(PowlNode::StrictPartialOrder(spo)) => {
            let old_order = spo.order.clone();
            let n = spo.children.len();
            let new_children: Vec<u32> = spo
                .children
                .iter()
                .map(|&c| apply(arena, c, label_map, dest_arena))
                .collect();

            let spo_idx = dest_arena.add_strict_partial_order(new_children);

            for i in 0..n {
                for j in 0..n {
                    if old_order.is_edge(i, j) {
                        dest_arena.add_order_edge(spo_idx, i, j).ok();
                    }
                }
            }

            spo_idx
        }

        Some(PowlNode::DecisionGraph(dg)) => {
            let old_order = dg.order.clone();
            let new_children: Vec<u32> = dg
                .children
                .iter()
                .map(|&c| apply(arena, c, label_map, dest_arena))
                .collect();

            dest_arena.add_decision_graph(
                new_children,
                old_order,
                dg.start_nodes.clone(),
                dg.end_nodes.clone(),
                dg.empty_path,
            )
        }

        Some(PowlNode::ChoiceGraph(cg)) => {
            // Recursively apply label replacement to every SubModel subtree;
            // preserve graph structure (Start/End/edges).
            let mut new_nodes = Vec::with_capacity(cg.graph.nodes().len());
            for n in cg.graph.nodes() {
                match n {
                    ChoiceGraphNode::Start => new_nodes.push(ChoiceGraphNode::Start),
                    ChoiceGraphNode::End => new_nodes.push(ChoiceGraphNode::End),
                    ChoiceGraphNode::Activity(l) => {
                        let new_label = label_map
                            .get(l.as_str())
                            .cloned()
                            .unwrap_or_else(|| l.clone());
                        new_nodes.push(ChoiceGraphNode::Activity(new_label))
                    }
                    ChoiceGraphNode::SubModel(child) => {
                        let new_child = apply(arena, *child, label_map, dest_arena);
                        new_nodes.push(ChoiceGraphNode::SubModel(new_child));
                    }
                }
            }
            let new_graph = ChoiceGraph::new_raw(
                new_nodes,
                cg.graph.edges().to_vec(),
                cg.graph.start_idx(),
                cg.graph.end_idx(),
            )
            .unwrap();
            dest_arena.add_choice_graph(&new_graph)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_arena::BinaryRelation;

    #[test]
    fn test_label_replacing_preserves_decision_graph() {
        let mut arena = PowlArena::new();
        let child0 = arena.add_transition(Some("A".to_string()));
        let child1 = arena.add_transition(Some("B".to_string()));

        let mut order = BinaryRelation::new(2);
        order.add_edge(0, 1);

        let dg = arena.add_decision_graph(vec![child0, child1], order, vec![0], vec![1], false);

        let mut label_map = HashMap::new();
        label_map.insert("A".to_string(), "A_new".to_string());

        let mut dest_arena = PowlArena::new();
        let new_root = apply(&arena, dg, &label_map, &mut dest_arena);

        let new_node = dest_arena.get(new_root).unwrap();
        assert!(matches!(new_node, PowlNode::DecisionGraph(_)));

        if let PowlNode::DecisionGraph(new_dg) = new_node {
            assert_eq!(new_dg.children.len(), 2);
            let c0 = dest_arena.get(new_dg.children[0]).unwrap();
            let c1 = dest_arena.get(new_dg.children[1]).unwrap();

            if let PowlNode::Transition(t) = c0 {
                assert_eq!(t.label, Some("A_new".to_string()));
            } else {
                panic!("Expected transition");
            }

            if let PowlNode::Transition(t) = c1 {
                assert_eq!(t.label, Some("B".to_string()));
            } else {
                panic!("Expected transition");
            }
        } else {
            panic!("Expected DecisionGraph");
        }
    }
}
