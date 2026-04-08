//! Simplification algorithms for POWL models.
//!
//! Ports `StrictPartialOrder.simplify()` and
//! `OperatorPOWL.simplify_using_frequent_transitions()` from pm4py.

use crate::powl_arena::{Operator, PowlArena, PowlNode};

/// Recursively simplify the subtree rooted at `idx` in the arena.
///
/// Transformations:
/// - `XOR(tau, LOOP(tau, X))` / `XOR(LOOP(tau, X), tau)` → `LOOP(X, tau)`
/// - Nested `XOR(XOR(…), …)` → flattened `XOR(…)`
/// - `StrictPartialOrder` with inlineable child SPOs gets flattened.
pub fn simplify(arena: &mut PowlArena, idx: u32) -> u32 {
    match arena.nodes.get(idx as usize).cloned() {
        None => idx,
        Some(PowlNode::Transition(_)) | Some(PowlNode::FrequentTransition(_)) | Some(PowlNode::DecisionGraph(_)) => idx,
        Some(PowlNode::OperatorPowl(op)) => {
            let simplified_children: Vec<u32> = op
                .children
                .iter()
                .map(|&c| simplify(arena, c))
                .collect();

            if op.operator == Operator::Xor && simplified_children.len() == 2 {
                let c0 = simplified_children[0];
                let c1 = simplified_children[1];
                if let Some(new_idx) = try_merge_xor_loop(arena, c0, c1) {
                    return new_idx;
                }
                if let Some(new_idx) = try_merge_xor_loop(arena, c1, c0) {
                    return new_idx;
                }
            }

            if op.operator == Operator::Xor {
                // Flatten nested XORs
                let mut flat: Vec<u32> = Vec::new();
                for &c in &simplified_children {
                    if let Some(PowlNode::OperatorPowl(inner)) =
                        arena.nodes.get(c as usize)
                    {
                        if inner.operator == Operator::Xor {
                            let inner_children = inner.children.clone();
                            for ic in inner_children {
                                flat.push(simplify(arena, ic));
                            }
                            continue;
                        }
                    }
                    flat.push(c);
                }
                return arena.add_operator(Operator::Xor, flat);
            }

            arena.add_operator(op.operator, simplified_children)
        }
        Some(PowlNode::StrictPartialOrder(spo)) => {
            let children = spo.children.clone();
            let mut simplified: Vec<(u32, u32)> = Vec::new();
            for &c in &children {
                simplified.push((c, simplify(arena, c)));
            }

            let old_order = spo.order.clone();
            let n = children.len();

            struct ChildInfo {
                simplified: u32,
                inline: bool,
                start_local: Option<usize>,
                end_local: Option<usize>,
            }

            let is_connected = |node_local: usize| -> bool {
                for other in 0..n {
                    if other == node_local {
                        continue;
                    }
                    if old_order.is_edge(node_local, other)
                        || old_order.is_edge(other, node_local)
                    {
                        return true;
                    }
                }
                false
            };

            let child_infos: Vec<ChildInfo> = simplified
                .iter()
                .enumerate()
                .map(|(local, &(_orig, simp))| {
                    let connected = is_connected(local);
                    if let Some(PowlNode::StrictPartialOrder(inner)) =
                        arena.nodes.get(simp as usize)
                    {
                        let starts = inner.order.get_start_nodes();
                        let ends = inner.order.get_end_nodes();
                        if connected && starts.len() == 1 && ends.len() == 1 {
                            return ChildInfo {
                                simplified: simp,
                                inline: true,
                                start_local: Some(starts[0]),
                                end_local: Some(ends[0]),
                            };
                        }
                    }
                    ChildInfo {
                        simplified: simp,
                        inline: false,
                        start_local: None,
                        end_local: None,
                    }
                })
                .collect();

            let mut new_children: Vec<u32> = Vec::new();
            let mut child_map: Vec<Vec<u32>> = vec![Vec::new(); n];

            for (local, info) in child_infos.iter().enumerate() {
                if info.inline {
                    if let Some(PowlNode::StrictPartialOrder(inner)) =
                        arena.nodes.get(info.simplified as usize)
                    {
                        let sub_children = inner.children.clone();
                        for &sc in &sub_children {
                            child_map[local].push(new_children.len() as u32);
                            new_children.push(sc);
                        }
                    }
                } else {
                    child_map[local].push(new_children.len() as u32);
                    new_children.push(info.simplified);
                }
            }

            let new_spo_idx = arena.add_strict_partial_order(new_children.clone());

            for src_local in 0..n {
                for tgt_local in 0..n {
                    if !old_order.is_edge(src_local, tgt_local) {
                        continue;
                    }
                    let src_info = &child_infos[src_local];
                    let tgt_info = &child_infos[tgt_local];

                    let src_new_indices: Vec<u32> = if src_info.inline {
                        if let Some(end_l) = src_info.end_local {
                            vec![child_map[src_local][end_l]]
                        } else {
                            child_map[src_local].clone()
                        }
                    } else {
                        child_map[src_local].clone()
                    };

                    let tgt_new_indices: Vec<u32> = if tgt_info.inline {
                        if let Some(start_l) = tgt_info.start_local {
                            vec![child_map[tgt_local][start_l]]
                        } else {
                            child_map[tgt_local].clone()
                        }
                    } else {
                        child_map[tgt_local].clone()
                    };

                    for &sn in &src_new_indices {
                        for &tn in &tgt_new_indices {
                            arena.add_order_edge(new_spo_idx, sn as usize, tn as usize);
                        }
                    }
                }
            }

            for (local, info) in child_infos.iter().enumerate() {
                if !info.inline {
                    continue;
                }
                if let Some(PowlNode::StrictPartialOrder(inner)) =
                    arena.nodes.get(info.simplified as usize).cloned()
                {
                    let inner_n = inner.children.len();
                    for i in 0..inner_n {
                        for j in 0..inner_n {
                            if inner.order.is_edge(i, j) {
                                let ni = child_map[local][i] as usize;
                                let nj = child_map[local][j] as usize;
                                arena.add_order_edge(new_spo_idx, ni, nj);
                            }
                        }
                    }
                }
            }

            new_spo_idx
        }
    }
}

fn try_merge_xor_loop(arena: &mut PowlArena, child0: u32, child1: u32) -> Option<u32> {
    let is_silent = |idx: u32| -> bool {
        matches!(arena.nodes.get(idx as usize), Some(PowlNode::Transition(t)) if t.label.is_none())
    };

    if !is_silent(child0) {
        return None;
    }

    if let Some(PowlNode::OperatorPowl(inner)) = arena.nodes.get(child1 as usize).cloned() {
        if inner.operator != Operator::Loop || inner.children.len() != 2 {
            return None;
        }
        let lc0 = inner.children[0];
        let lc1 = inner.children[1];

        if is_silent(lc0) {
            let simplified_lc1 = simplify(arena, lc1);
            let simplified_lc0 = simplify(arena, lc0);
            return Some(arena.add_operator(Operator::Loop, vec![simplified_lc0, simplified_lc1]));
        }
        if is_silent(lc1) {
            let simplified_lc0 = simplify(arena, lc0);
            let simplified_lc1 = simplify(arena, lc1);
            return Some(arena.add_operator(Operator::Loop, vec![simplified_lc1, simplified_lc0]));
        }
    }
    None
}

/// Transform `XOR(A, tau)` and `LOOP(A, tau)` into `FrequentTransition` nodes.
pub fn simplify_using_frequent_transitions(arena: &mut PowlArena, idx: u32) -> u32 {
    match arena.nodes.get(idx as usize).cloned() {
        None | Some(PowlNode::Transition(_)) | Some(PowlNode::FrequentTransition(_)) | Some(PowlNode::DecisionGraph(_)) => idx,
        Some(PowlNode::StrictPartialOrder(spo)) => {
            let children = spo.children.clone();
            let old_order = spo.order.clone();
            let new_children: Vec<u32> = children
                .iter()
                .map(|&c| simplify_using_frequent_transitions(arena, c))
                .collect();
            let new_spo = arena.add_strict_partial_order(new_children.clone());
            let n = children.len();
            for i in 0..n {
                for j in 0..n {
                    if old_order.is_edge(i, j) {
                        arena.add_order_edge(new_spo, i, j);
                    }
                }
            }
            new_spo
        }
        Some(PowlNode::OperatorPowl(op)) => {
            let children = op.children.clone();
            let operator = op.operator;

            let is_silent = |idx: u32| -> bool {
                matches!(
                    arena.nodes.get(idx as usize),
                    Some(PowlNode::Transition(t)) if t.label.is_none()
                )
            };

            if operator == Operator::Xor && children.len() == 2 {
                let c0 = children[0];
                let c1 = children[1];
                if let (false, true) = (is_silent(c0), is_silent(c1)) {
                    if let Some(PowlNode::Transition(t)) = arena.nodes.get(c0 as usize).cloned() {
                        if let Some(label) = t.label {
                            return arena.add_frequent_transition(label, 0, Some(1));
                        }
                    }
                }
                if let (true, false) = (is_silent(c0), is_silent(c1)) {
                    if let Some(PowlNode::Transition(t)) = arena.nodes.get(c1 as usize).cloned() {
                        if let Some(label) = t.label {
                            return arena.add_frequent_transition(label, 0, Some(1));
                        }
                    }
                }
            }

            if operator == Operator::Loop && children.len() == 2 {
                let c0 = children[0];
                let c1 = children[1];
                if let (false, true) = (is_silent(c0), is_silent(c1)) {
                    if let Some(PowlNode::Transition(t)) = arena.nodes.get(c0 as usize).cloned() {
                        if let Some(label) = t.label {
                            return arena.add_frequent_transition(label, 1, None);
                        }
                    }
                }
                if let (true, false) = (is_silent(c0), is_silent(c1)) {
                    if let Some(PowlNode::Transition(t)) = arena.nodes.get(c1 as usize).cloned() {
                        if let Some(label) = t.label {
                            return arena.add_frequent_transition(label, 0, None);
                        }
                    }
                }
            }

            let new_children: Vec<u32> = children
                .iter()
                .map(|&c| simplify_using_frequent_transitions(arena, c))
                .collect();
            arena.add_operator(operator, new_children)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    fn build(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    #[test]
    fn simplify_transition_noop() {
        let (mut arena, root) = build("A");
        let s = simplify(&mut arena, root);
        assert_eq!(arena.to_repr(s), "A");
    }

    #[test]
    fn simplify_nested_xor_flattens() {
        let (mut arena, root) = build("X ( X ( A, B ), C )");
        let s = simplify(&mut arena, root);
        let repr = arena.to_repr(s);
        assert!(repr.starts_with("X ("), "got: {}", repr);
        assert!(repr.contains("A"), "got: {}", repr);
        assert!(repr.contains("B"), "got: {}", repr);
        assert!(repr.contains("C"), "got: {}", repr);
    }

    #[test]
    fn frequent_transitions_xor_tau() {
        let (mut arena, root) = build("X ( A, tau )");
        let s = simplify_using_frequent_transitions(&mut arena, root);
        assert!(
            matches!(arena.nodes.get(s as usize), Some(PowlNode::FrequentTransition(t)) if t.skippable),
            "expected FrequentTransition(skippable), got: {:?}",
            arena.nodes.get(s as usize)
        );
    }

    #[test]
    fn frequent_transitions_loop_tau() {
        let (mut arena, root) = build("* ( A, tau )");
        let s = simplify_using_frequent_transitions(&mut arena, root);
        assert!(
            matches!(arena.nodes.get(s as usize), Some(PowlNode::FrequentTransition(t)) if t.selfloop),
            "expected FrequentTransition(selfloop), got: {:?}",
            arena.nodes.get(s as usize)
        );
    }
}
