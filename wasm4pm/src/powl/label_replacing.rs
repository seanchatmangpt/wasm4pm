//! Label replacement utility for POWL models.

use crate::powl_arena::{PowlArena, PowlNode};
use std::collections::HashMap;

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
            let min_freq = if t.skippable { 0 } else { 1 };
            let max_freq = if t.selfloop { None } else { Some(1) };
            dest_arena.add_frequent_transition(new_activity, min_freq, max_freq)
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
            let old_children = spo.children.clone();
            let old_order = spo.order.clone();
            let mut new_children: Vec<u32> = Vec::new();
            let n = old_children.len();

            for &c in &old_children {
                new_children.push(apply(arena, c, label_map, dest_arena));
            }

            let spo_idx = dest_arena.add_strict_partial_order(new_children);

            for i in 0..n {
                for j in 0..n {
                    if old_order.is_edge(i, j) {
                        dest_arena.add_order_edge(spo_idx, i, j);
                    }
                }
            }

            spo_idx
        }

        Some(PowlNode::DecisionGraph(dg)) => {
            // Treat as StrictPartialOrder for label replacement purposes
            let old_children = dg.children.clone();
            let old_order = dg.order.clone();
            let mut new_children: Vec<u32> = Vec::new();
            let n = old_children.len();

            for &c in &old_children {
                new_children.push(apply(arena, c, label_map, dest_arena));
            }

            let spo_idx = dest_arena.add_strict_partial_order(new_children);

            for i in 0..n {
                for j in 0..n {
                    if old_order.is_edge(i, j) {
                        dest_arena.add_order_edge(spo_idx, i, j);
                    }
                }
            }

            spo_idx
        }
    }
}
