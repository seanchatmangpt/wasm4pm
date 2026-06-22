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
            // Treat as StrictPartialOrder for label replacement purposes
            let old_order = dg.order.clone();
            let n = dg.children.len();
            let new_children: Vec<u32> = dg
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

        Some(PowlNode::ChoiceGraph(cg)) => {
            // Recursively apply label replacement to every SubModel subtree;
            // preserve graph structure (Start/End/edges).
            let mut new_nodes = Vec::with_capacity(cg.graph.nodes.len());
            for n in &cg.graph.nodes {
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
            let new_graph = ChoiceGraph {
                nodes: new_nodes,
                edges: cg.graph.edges.clone(),
                start_idx: cg.graph.start_idx,
                end_idx: cg.graph.end_idx,
            };
            dest_arena.add_choice_graph(&new_graph)
        }
    }
}
