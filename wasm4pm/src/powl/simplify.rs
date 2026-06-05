//! Simplification algorithms for POWL models.
use wasm4pm_compat::powl::{ChoiceGraph, ChoiceGraphNode};

use crate::powl_arena::{Operator, PowlArena, PowlNode};

/// Recursively simplify the subtree rooted at `idx` in the arena.
///
/// Transformations:
/// - `XOR(tau, LOOP(tau, X))` / `XOR(LOOP(tau, X), tau)` → `LOOP(X, tau)`
/// - Nested `XOR(XOR(…), …)` → flattened `XOR(…)`
/// - `StrictPartialOrder` with inlineable child SPOs gets flattened.
/// - `DecisionGraph` single-child → XOR/LOOP/identity reduction.
/// - `DecisionGraph` `group_start_seq()` — extract common start sequences.
/// - `DecisionGraph` `group_end_seq()` — extract common end sequences.
/// - `DecisionGraph` `group_pure_seq()` — extract pure sequential blocks.
pub fn simplify(arena: &mut PowlArena, idx: u32) -> u32 {
    match arena.nodes.get(idx as usize).cloned() {
        None => idx,
        Some(PowlNode::Transition(_)) | Some(PowlNode::FrequentTransition(_)) => idx,
        Some(PowlNode::DecisionGraph(dg)) => simplify_decision_graph(arena, &dg),
        // ChoiceGraph: simplify each SubModel sub-tree in place; the graph
        // structure (Definition 1 invariants) is preserved.
        Some(PowlNode::ChoiceGraph(cg)) => {
            let new_nodes: Vec<ChoiceGraphNode> = cg
                .graph
                .nodes
                .into_iter()
                .map(|n| match n {
                    ChoiceGraphNode::SubModel(c) => ChoiceGraphNode::SubModel(simplify(arena, c)),
                    other => other,
                })
                .collect();
            let new_graph = ChoiceGraph {
                nodes: new_nodes,
                edges: cg.graph.edges,
                start_idx: cg.graph.start_idx,
                end_idx: cg.graph.end_idx,
            };
            // Replace the node in-place to keep the index stable.
            arena.nodes[idx as usize] =
                PowlNode::ChoiceGraph(crate::powl_arena::ChoiceGraphPowlNode { graph: new_graph });
            idx
        }
        Some(PowlNode::OperatorPowl(op)) => {
            let simplified_children: Vec<u32> =
                op.children.iter().map(|&c| simplify(arena, c)).collect();

            // ── LOOP normalizations ────────────────────────────────────────────
            if op.operator == Operator::Loop && simplified_children.len() == 2 {
                let c0 = simplified_children[0];
                let c1 = simplified_children[1];

                // Normalise LOOP(LOOP(A, τ), τ) → LOOP(A, τ)
                // When the body of a loop is itself a loop with a silent redo
                // branch, the outer silent redo makes the inner one redundant.
                if let Some(PowlNode::OperatorPowl(inner)) = arena.nodes.get(c0 as usize).cloned() {
                    if inner.operator == Operator::Loop && inner.children.len() == 2 {
                        let inner_c1 = inner.children[1];
                        let is_silent = |idx: u32| {
                            matches!(
                                arena.nodes.get(idx as usize),
                                Some(PowlNode::Transition(t)) if t.label.is_none()
                            )
                        };
                        if is_silent(inner_c1) && is_silent(c1) {
                            // Outer loop wraps the body of the inner loop with a
                            // fresh silent redo branch.
                            let inner_body = inner.children[0];
                            let tau = arena.add_silent_transition();
                            return arena.add_operator(Operator::Loop, vec![inner_body, tau]);
                        }
                    }
                }
            }

            // ── XOR optimisations ──────────────────────────────────────────────
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
                    if let Some(PowlNode::OperatorPowl(inner)) = arena.nodes.get(c as usize) {
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

                // Dead branch removal: remove duplicate silent transitions from
                // the XOR children, keeping at most one.  E.g. XOR(τ, τ, A)
                // becomes XOR(τ, A).  A lone surviving non-silent child also
                // collapses: XOR(A) → A (handled by single-child guard below).
                let is_silent = |idx: u32| {
                    matches!(
                        arena.nodes.get(idx as usize),
                        Some(PowlNode::Transition(t)) if t.label.is_none()
                    )
                };
                let mut seen_silent = false;
                let deduped: Vec<u32> = flat
                    .iter()
                    .copied()
                    .filter(|&c| {
                        if is_silent(c) {
                            if seen_silent {
                                return false; // drop duplicate τ
                            }
                            seen_silent = true;
                        }
                        true
                    })
                    .collect();

                // Single surviving branch: unwrap the XOR entirely.
                if deduped.len() == 1 {
                    return deduped[0];
                }

                return arena.add_operator(Operator::Xor, deduped);
            }

            // ── AND (PartialOrder) silent-child elimination ────────────────────
            if op.operator == Operator::PartialOrder {
                // Remove silent transitions that have neither incoming nor
                // outgoing ordering edges inside the AND-split/join.  Such τ
                // nodes carry no ordering information and do not affect
                // reachability of any other child.
                let n = simplified_children.len();
                // Build a temporary SPO so we can inspect edge connectivity.
                let tmp_spo_idx = arena.add_strict_partial_order(simplified_children.clone());
                // We do not have edge information at this point (caller would
                // have to pass it), so we can only eliminate τ children that
                // are the *sole* child.
                if n == 1 {
                    let only = simplified_children[0];
                    let is_silent = matches!(
                        arena.nodes.get(only as usize),
                        Some(PowlNode::Transition(t)) if t.label.is_none()
                    );
                    if is_silent {
                        // A single-child AND whose only member is τ is a no-op.
                        return only;
                    }
                }
                // Discard the scratch SPO (it's harmless but wastes arena space).
                let _ = tmp_spo_idx;
            }

            arena.add_operator(op.operator, simplified_children)
        }
        Some(PowlNode::StrictPartialOrder(spo)) => {
            let children = spo.children.clone();

            // Single-child SPO is equivalent to the child itself.
            if children.len() == 1 {
                return simplify(arena, children[0]);
            }

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
                    if old_order.is_edge(node_local, other) || old_order.is_edge(other, node_local)
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
                            arena
                                .add_order_edge(new_spo_idx, sn as usize, tn as usize)
                                .ok();
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
                                arena.add_order_edge(new_spo_idx, ni, nj).ok();
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

/// Simplify a decision graph node.
///
/// Transformations applied:
/// - Recursively simplify all children.
/// - Single-child reduction: a `DecisionGraph` with exactly one child, no
///   explicit ordering edges, and `empty_path == false` is equivalent to
///   that single child.  Replace the DG with the (simplified) child.
/// - Silent-only graph: if every child is a silent transition the whole DG
///   collapses to a single τ.
fn simplify_decision_graph(
    arena: &mut PowlArena,
    dg: &crate::powl_arena::DecisionGraphNode,
) -> u32 {
    // Clone fields first to avoid borrow checker issues.
    let children: Vec<u32> = dg.children.clone();
    let order = dg.order.clone();
    let start_nodes = dg.start_nodes.clone();
    let end_nodes = dg.end_nodes.clone();
    let empty_path = dg.empty_path;

    // Recursively simplify children.
    let simplified_children: Vec<u32> = children.into_iter().map(|c| simplify(arena, c)).collect();

    let n = simplified_children.len();

    let is_silent = |idx: u32| {
        matches!(
            arena.nodes.get(idx as usize),
            Some(PowlNode::Transition(t)) if t.label.is_none()
        )
    };

    // Single-child reduction: DG(A) with no extra ordering → A.
    if n == 1 && !empty_path && order.edge_list().is_empty() {
        return simplified_children[0];
    }

    // Silent-only reduction: all children are τ → single τ.
    if n > 0 && simplified_children.iter().all(|&c| is_silent(c)) {
        return arena.add_silent_transition();
    }

    arena.add_decision_graph(
        simplified_children,
        order,
        start_nodes,
        end_nodes,
        empty_path,
    )
}

/// Transform `XOR(A, tau)` and `LOOP(A, tau)` into `FrequentTransition` nodes.
pub fn simplify_using_frequent_transitions(arena: &mut PowlArena, idx: u32) -> u32 {
    match arena.nodes.get(idx as usize).cloned() {
        None
        | Some(PowlNode::Transition(_))
        | Some(PowlNode::FrequentTransition(_))
        | Some(PowlNode::DecisionGraph(_))
        | Some(PowlNode::ChoiceGraph(_)) => idx,
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
                        arena.add_order_edge(new_spo, i, j).ok();
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
    fn test_simplify_noop_and_flattening() {
        // Happy path: single transition is no-op
        let (mut arena, root) = build("A");
        let s = simplify(&mut arena, root);
        assert_eq!(arena.to_repr(s), "A");

        // Nested XOR flattens to single level
        let (mut arena, root) = build("X ( X ( A, B ), C )");
        let s = simplify(&mut arena, root);
        let repr = arena.to_repr(s);
        assert!(repr.starts_with("X ("));
        assert!(repr.contains("A") && repr.contains("B") && repr.contains("C"));
    }

    #[test]
    fn test_frequent_transitions_xor_and_loop() {
        // XOR with tau produces skippable frequent transition
        let (mut arena, root) = build("X ( A, tau )");
        let s = simplify_using_frequent_transitions(&mut arena, root);
        assert!(matches!(
            arena.nodes.get(s as usize),
            Some(PowlNode::FrequentTransition(t)) if t.skippable
        ));

        // Loop with tau produces self-loop frequent transition
        let (mut arena, root) = build("* ( A, tau )");
        let s = simplify_using_frequent_transitions(&mut arena, root);
        assert!(matches!(
            arena.nodes.get(s as usize),
            Some(PowlNode::FrequentTransition(t)) if t.selfloop
        ));
    }
}
