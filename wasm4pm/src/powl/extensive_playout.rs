//! Extensive (exhaustive) playout for process trees / POWL models.
//!
//! Enumerates all possible execution traces up to configured limits.
//! Supports loop bounds and trace length constraints for process discovery validation.

use crate::models::Trace;
use crate::powl_arena::{Operator, PowlArena, PowlNode};
use crate::powl_parser::parse_powl_model_string;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

/// Configuration for extensive playout.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExtensivePlayoutConfig {
    pub min_length: usize,
    pub max_length: usize,
    pub max_loops: usize,
    pub max_traces: usize,
}

impl Default for ExtensivePlayoutConfig {
    fn default() -> Self {
        Self {
            min_length: 0,
            max_length: 50,
            max_loops: 3,
            max_traces: 10000,
        }
    }
}

/// Result of extensive playout.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExtensivePlayoutResult {
    pub traces: Vec<Trace>,
    pub count: usize,
    pub limit_reached: bool,
}

/// Execute extensive playout on a POWL model.
pub fn extensive_playout(
    arena: &PowlArena,
    root: u32,
    config: &ExtensivePlayoutConfig,
) -> ExtensivePlayoutResult {
    let mut limit_reached = false;
    let traces_set = playout_node(arena, root, config, &mut limit_reached);

    // Sort and convert to Trace structs to ensure deterministic ordering
    let mut traces_vec: Vec<Vec<String>> = traces_set.into_iter().collect();
    traces_vec.sort_by(|a, b| {
        a.len().cmp(&b.len()).then_with(|| a.cmp(b))
    });

    let mut traces = Vec::new();
    let mut count = 0;
    for t in traces_vec {
        if traces.len() >= config.max_traces {
            limit_reached = true;
            break;
        }
        if t.len() >= config.min_length {
            traces.push(Trace {
                attributes: BTreeMap::new(),
                events: t
                    .iter()
                    .map(|lbl| {
                        let mut attrs = BTreeMap::new();
                        attrs.insert(
                            "concept:name".to_string(),
                            crate::models::AttributeValue::String(lbl.clone()),
                        );
                        crate::models::Event { attributes: attrs }
                    })
                    .collect(),
            });
            count += 1;
        }
    }

    ExtensivePlayoutResult {
        traces,
        count,
        limit_reached,
    }
}

fn playout_node(
    arena: &PowlArena,
    node_id: u32,
    config: &ExtensivePlayoutConfig,
    limit_reached: &mut bool,
) -> HashSet<Vec<String>> {
    let mut result = HashSet::new();
    if *limit_reached {
        return result;
    }

    let node = match arena.nodes.get(node_id as usize) {
        Some(n) => n,
        None => return result,
    };

    match node {
        PowlNode::Transition(t) => {
            if let Some(label) = &t.label {
                result.insert(vec![label.clone()]);
            } else {
                result.insert(Vec::new()); // Silent transition
            }
        }
        PowlNode::FrequentTransition(t) => {
            result.insert(vec![t.activity.clone()]);
        }
        PowlNode::StrictPartialOrder(spo) => {
            let mut children_traces = Vec::new();
            for &child_id in &spo.children {
                let ct = playout_node(arena, child_id, config, limit_reached);
                children_traces.push(ct.into_iter().collect::<Vec<_>>());
            }

            let mut current_pick = vec![0; spo.children.len()];
            generate_shuffled_combinations(
                &children_traces,
                &spo.order,
                &mut current_pick,
                0,
                &mut result,
                config,
                limit_reached,
            );
        }
        PowlNode::OperatorPowl(op) => {
            match op.operator {
                Operator::Xor => {
                    for &child_id in &op.children {
                        if *limit_reached {
                            break;
                        }
                        let ct = playout_node(arena, child_id, config, limit_reached);
                        result.extend(ct);
                        if result.len() >= config.max_traces {
                            *limit_reached = true;
                            break;
                        }
                    }
                }
                Operator::Loop => {
                    if op.children.is_empty() {
                        return result;
                    }
                    let body_id = op.children[0];
                    let redo_id = op.children.get(1).copied();

                    let body_traces = playout_node(arena, body_id, config, limit_reached);
                    let redo_traces = if let Some(r_id) = redo_id {
                        playout_node(arena, r_id, config, limit_reached)
                    } else {
                        let mut hs = HashSet::new();
                        hs.insert(Vec::new());
                        hs
                    };

                    result.extend(body_traces.clone());
                    let mut current_loop_traces = body_traces.clone();

                    for _ in 0..config.max_loops {
                        if *limit_reached {
                            break;
                        }
                        let mut next_loop_traces = HashSet::new();
                        for t_b in &current_loop_traces {
                            for t_r in &redo_traces {
                                for t_body_first in &body_traces {
                                    let mut new_trace = t_b.clone();
                                    new_trace.extend(t_r.clone());
                                    new_trace.extend(t_body_first.clone());
                                    if new_trace.len() <= config.max_length {
                                        next_loop_traces.insert(new_trace);
                                    }
                                }
                            }
                        }
                        if next_loop_traces.is_empty() {
                            break;
                        }
                        result.extend(next_loop_traces.clone());
                        current_loop_traces = next_loop_traces;
                        if result.len() >= config.max_traces {
                            *limit_reached = true;
                            break;
                        }
                    }
                }
                Operator::PartialOrder => {
                    let mut children_traces = Vec::new();
                    for &child_id in &op.children {
                        let ct = playout_node(arena, child_id, config, limit_reached);
                        children_traces.push(ct.into_iter().collect::<Vec<_>>());
                    }

                    let empty_order = crate::powl_arena::BinaryRelation::new(op.children.len());
                    let mut current_pick = vec![0; op.children.len()];
                    generate_shuffled_combinations(
                        &children_traces,
                        &empty_order,
                        &mut current_pick,
                        0,
                        &mut result,
                        config,
                        limit_reached,
                    );
                }
            }
        }
        PowlNode::DecisionGraph(dg) => {
            let n = dg.children.len();
            let start_idx = n;
            let end_idx = n + 1;
            let paths = find_relation_paths(&dg.order, start_idx, end_idx);

            for path in paths {
                if *limit_reached {
                    break;
                }
                let mut path_children = Vec::new();
                for &idx in &path {
                    if idx < n {
                        path_children.push(dg.children[idx]);
                    }
                }

                let path_traces = playout_sequence(arena, &path_children, config, limit_reached);
                result.extend(path_traces);
                if result.len() >= config.max_traces {
                    *limit_reached = true;
                    break;
                }
            }
        }
        PowlNode::ChoiceGraph(cg) => {
            let start_idx = cg.graph.start_idx();
            let end_idx = cg.graph.end_idx();
            let paths = find_cg_paths(&cg.graph, start_idx, end_idx);

            for path in paths {
                if *limit_reached {
                    break;
                }
                let mut path_children = Vec::new();
                for &idx in &path {
                    if let wasm4pm_compat::powl::ChoiceGraphNode::SubModel(child_id) = &cg.graph.nodes()[idx] {
                        path_children.push(*child_id);
                    }
                }

                let path_traces = playout_sequence(arena, &path_children, config, limit_reached);
                result.extend(path_traces);
                if result.len() >= config.max_traces {
                    *limit_reached = true;
                    break;
                }
            }
        }
    }

    result.retain(|t| t.len() <= config.max_length);
    result
}

fn playout_sequence(
    arena: &PowlArena,
    children: &[u32],
    config: &ExtensivePlayoutConfig,
    limit_reached: &mut bool,
) -> HashSet<Vec<String>> {
    let mut current_traces = HashSet::new();
    current_traces.insert(Vec::new());

    for &child_id in children {
        if *limit_reached {
            break;
        }
        let child_traces = playout_node(arena, child_id, config, limit_reached);
        let mut next_traces = HashSet::new();
        for t1 in &current_traces {
            for t2 in &child_traces {
                let mut combined = t1.clone();
                combined.extend(t2.clone());
                if combined.len() <= config.max_length {
                    next_traces.insert(combined);
                }
            }
        }
        current_traces = next_traces;
    }
    current_traces
}

fn shuffle_sequences(
    traces: &[Vec<String>],
    order: &crate::powl_arena::BinaryRelation,
    consumed: &mut [usize],
    current: &mut Vec<String>,
    results: &mut HashSet<Vec<String>>,
    config: &ExtensivePlayoutConfig,
    limit_reached: &mut bool,
) {
    if *limit_reached {
        return;
    }
    if current.len() > config.max_length {
        return;
    }

    let all_consumed = (0..traces.len()).all(|i| consumed[i] == traces[i].len());
    if all_consumed {
        if results.len() >= config.max_traces {
            *limit_reached = true;
            return;
        }
        results.insert(current.clone());
        return;
    }

    for i in 0..traces.len() {
        if consumed[i] >= traces[i].len() {
            continue;
        }
        let mut predecessors_done = true;
        for p in 0..traces.len() {
            if order.is_edge(p, i) && consumed[p] < traces[p].len() {
                predecessors_done = false;
                break;
            }
        }
        if !predecessors_done {
            continue;
        }

        let val = &traces[i][consumed[i]];
        current.push(val.clone());
        consumed[i] += 1;

        shuffle_sequences(traces, order, consumed, current, results, config, limit_reached);

        consumed[i] -= 1;
        current.pop();
    }
}

fn generate_shuffled_combinations(
    children_traces: &[Vec<Vec<String>>],
    order: &crate::powl_arena::BinaryRelation,
    current_pick: &mut [usize],
    index: usize,
    results: &mut HashSet<Vec<String>>,
    config: &ExtensivePlayoutConfig,
    limit_reached: &mut bool,
) {
    if *limit_reached {
        return;
    }
    if index == children_traces.len() {
        let selected_traces: Vec<Vec<String>> = (0..children_traces.len())
            .map(|i| {
                if children_traces[i].is_empty() {
                    Vec::new()
                } else {
                    children_traces[i][current_pick[i]].clone()
                }
            })
            .collect();

        let mut consumed = vec![0; selected_traces.len()];
        let mut current_trace = Vec::new();
        shuffle_sequences(
            &selected_traces,
            order,
            &mut consumed,
            &mut current_trace,
            results,
            config,
            limit_reached,
        );
        return;
    }

    if children_traces[index].is_empty() {
        generate_shuffled_combinations(
            children_traces,
            order,
            current_pick,
            index + 1,
            results,
            config,
            limit_reached,
        );
    } else {
        for val_idx in 0..children_traces[index].len() {
            if *limit_reached {
                break;
            }
            current_pick[index] = val_idx;
            generate_shuffled_combinations(
                children_traces,
                order,
                current_pick,
                index + 1,
                results,
                config,
                limit_reached,
            );
        }
    }
}

fn find_cg_paths(
    graph: &wasm4pm_compat::powl::ChoiceGraph,
    start_idx: usize,
    end_idx: usize,
) -> Vec<Vec<usize>> {
    let mut paths = Vec::new();
    let mut current_path = vec![start_idx];
    let mut visited = HashSet::new();
    visited.insert(start_idx);

    fn dfs(
        graph: &wasm4pm_compat::powl::ChoiceGraph,
        curr: usize,
        end: usize,
        path: &mut Vec<usize>,
        visited: &mut HashSet<usize>,
        paths: &mut Vec<Vec<usize>>,
    ) {
        if curr == end {
            paths.push(path.clone());
            return;
        }
        for successor in graph.successors(curr) {
            if !visited.contains(&successor) {
                visited.insert(successor);
                path.push(successor);
                dfs(graph, successor, end, path, visited, paths);
                path.pop();
                visited.remove(&successor);
            }
        }
    }

    dfs(graph, start_idx, end_idx, &mut current_path, &mut visited, &mut paths);
    paths
}

fn find_relation_paths(
    order: &crate::powl_arena::BinaryRelation,
    start_idx: usize,
    end_idx: usize,
) -> Vec<Vec<usize>> {
    let mut paths = Vec::new();
    let mut current_path = vec![start_idx];
    let mut visited = HashSet::new();
    visited.insert(start_idx);

    fn dfs(
        order: &crate::powl_arena::BinaryRelation,
        curr: usize,
        end: usize,
        path: &mut Vec<usize>,
        visited: &mut HashSet<usize>,
        paths: &mut Vec<Vec<usize>>,
    ) {
        if curr == end {
            paths.push(path.clone());
            return;
        }
        for successor in 0..order.n {
            if order.is_edge(curr, successor) {
                if !visited.contains(&successor) {
                    visited.insert(successor);
                    path.push(successor);
                    dfs(order, successor, end, path, visited, paths);
                    path.pop();
                    visited.remove(&successor);
                }
            }
        }
    }

    dfs(order, start_idx, end_idx, &mut current_path, &mut visited, &mut paths);
    paths
}

#[wasm_bindgen]
pub fn powl_extensive_playout(
    powl_model_str: &str,
    _root_id: &str,
    config_json: &str,
) -> Result<JsValue, JsValue> {
    let config: ExtensivePlayoutConfig = serde_json::from_str(config_json).unwrap_or_default();

    // Parse the POWL model string into an arena (same pattern as all other POWL WASM functions)
    let mut arena = PowlArena::new();
    let root = parse_powl_model_string(powl_model_str.trim(), &mut arena)
        .map_err(|e| crate::error::js_val(&format!("parse error: {}", e)))?;

    let result = extensive_playout(&arena, root, &config);

    serde_json::to_string(&result)
        .map_err(|e| crate::error::js_val(&e.to_string()))
        .map(|s| crate::error::js_val(&s))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = ExtensivePlayoutConfig::default();
        assert_eq!(config.min_length, 0);
        assert_eq!(config.max_length, 50);
        assert_eq!(config.max_loops, 3);
        assert_eq!(config.max_traces, 10000);
    }

    #[test]
    fn test_result_serialization() {
        let result = ExtensivePlayoutResult {
            traces: Vec::new(),
            count: 0,
            limit_reached: false,
        };

        let json = serde_json::to_string(&result);
        assert!(json.is_ok());
    }

    #[test]
    fn test_simple_arena_playout() {
        let mut arena = PowlArena::new();

        // Add a simple sequence: A -> B
        let a = arena.add_transition(Some("A".to_string()));
        let b = arena.add_transition(Some("B".to_string()));
        let root = arena.add_sequence(vec![a, b]);

        let config = ExtensivePlayoutConfig {
            min_length: 1,
            max_length: 10,
            max_loops: 1,
            max_traces: 100,
        };

        let result = extensive_playout(&arena, root, &config);

        // Should have exactly 1 trace: [A, B]
        assert_eq!(result.traces.len(), 1);
        assert_eq!(result.traces[0].events.len(), 2);
    }

    #[test]
    fn test_xor_playout() {
        let mut arena = PowlArena::new();

        // Add an XOR: A xor B
        let a = arena.add_transition(Some("A".to_string()));
        let b = arena.add_transition(Some("B".to_string()));
        let root = arena.add_operator(Operator::Xor, vec![a, b]);

        let config = ExtensivePlayoutConfig {
            min_length: 1,
            max_length: 10,
            max_loops: 1,
            max_traces: 100,
        };

        let result = extensive_playout(&arena, root, &config);

        // Should have 2 traces: [A] and [B]
        assert_eq!(result.traces.len(), 2);
    }

    #[test]
    fn test_choice_graph_playout() {
        let mut arena = PowlArena::new();
        // CG: Start -> {A, B} -> End
        let cg = wasm4pm_compat::powl::ChoiceGraph::new(
            vec![
                wasm4pm_compat::powl::StandaloneChoiceGraphNode::Start,
                wasm4pm_compat::powl::StandaloneChoiceGraphNode::Activity("A".into()),
                wasm4pm_compat::powl::StandaloneChoiceGraphNode::Activity("B".into()),
                wasm4pm_compat::powl::StandaloneChoiceGraphNode::End,
            ],
            vec![(0, 1), (0, 2), (1, 3), (2, 3)],
        ).unwrap();

        let root = arena.add_choice_graph(&cg);

        let config = ExtensivePlayoutConfig {
            min_length: 1,
            max_length: 10,
            max_loops: 1,
            max_traces: 100,
        };

        let result = extensive_playout(&arena, root, &config);

        // Traces should be: ["A"] and ["B"]
        assert_eq!(result.traces.len(), 2);

        let mut trace_strings: Vec<Vec<String>> = result.traces.iter().map(|tr| {
            tr.events.iter().map(|ev| {
                match &ev.attributes.get("concept:name").unwrap() {
                    crate::models::AttributeValue::String(s) => s.clone(),
                    _ => panic!("Expected string value"),
                }
            }).collect()
        }).collect();
        trace_strings.sort();

        assert_eq!(trace_strings, vec![vec!["A".to_string()], vec!["B".to_string()]]);
    }

    #[test]
    fn test_strict_partial_order_shuffle_playout() {
        let mut arena = PowlArena::new();

        let a = arena.add_transition(Some("A".to_string()));
        let b = arena.add_transition(Some("B".to_string()));

        // Add StrictPartialOrder with A and B, and NO order edges (so they are concurrent)
        let root = arena.add_strict_partial_order(vec![a, b]);

        let config = ExtensivePlayoutConfig {
            min_length: 1,
            max_length: 10,
            max_loops: 1,
            max_traces: 100,
        };

        let result = extensive_playout(&arena, root, &config);

        // Traces should be: ["A", "B"] and ["B", "A"]
        assert_eq!(result.traces.len(), 2);

        let mut trace_strings: Vec<Vec<String>> = result.traces.iter().map(|tr| {
            tr.events.iter().map(|ev| {
                match &ev.attributes.get("concept:name").unwrap() {
                    crate::models::AttributeValue::String(s) => s.clone(),
                    _ => panic!("Expected string value"),
                }
            }).collect()
        }).collect();
        trace_strings.sort();

        assert_eq!(trace_strings, vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "A".to_string()]
        ]);
    }

    #[test]
    fn test_strict_partial_order_ordered_playout() {
        let mut arena = PowlArena::new();

        let a = arena.add_transition(Some("A".to_string()));
        let b = arena.add_transition(Some("B".to_string()));

        // Add StrictPartialOrder with A and B
        let root = arena.add_strict_partial_order(vec![a, b]);
        // Add order edge: 0 -> 1 (A must finish before B starts)
        arena.add_order_edge(root, 0, 1).unwrap();

        let config = ExtensivePlayoutConfig {
            min_length: 1,
            max_length: 10,
            max_loops: 1,
            max_traces: 100,
        };

        let result = extensive_playout(&arena, root, &config);

        // Traces should be: only ["A", "B"]
        assert_eq!(result.traces.len(), 1);

        let mut trace_strings: Vec<Vec<String>> = result.traces.iter().map(|tr| {
            tr.events.iter().map(|ev| {
                match &ev.attributes.get("concept:name").unwrap() {
                    crate::models::AttributeValue::String(s) => s.clone(),
                    _ => panic!("Expected string value"),
                }
            }).collect()
        }).collect();
        trace_strings.sort();

        assert_eq!(trace_strings, vec![
            vec!["A".to_string(), "B".to_string()]
        ]);
    }
}
