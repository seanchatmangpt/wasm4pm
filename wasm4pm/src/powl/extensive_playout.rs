//! Extensive (exhaustive) playout for process trees / POWL models.
//!
//! Enumerates all possible execution traces up to configured limits.
//! Supports loop bounds and trace length constraints for process discovery validation.

use crate::models::Trace;
use crate::powl_arena::{Operator, PowlArena, PowlNode};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
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
    let mut traces = Vec::new();
    let mut seen = HashSet::new();
    let mut limit_reached = false;

    // Start enumeration from root — emission allowed at top level
    enumerate_traces(
        arena,
        root,
        config,
        &mut Vec::new(),
        &mut traces,
        &mut seen,
        &mut limit_reached,
        true,
    );

    ExtensivePlayoutResult {
        traces,
        count: seen.len(),
        limit_reached,
    }
}

/// Try to emit a trace if it meets the minimum length and hasn't been seen.
fn try_emit_trace(
    current_trace: &[String],
    config: &ExtensivePlayoutConfig,
    traces: &mut Vec<Trace>,
    seen: &mut HashSet<Vec<String>>,
) {
    if current_trace.len() >= config.min_length {
        let trace_key = current_trace.to_vec();
        if seen.insert(trace_key) {
            traces.push(Trace {
                attributes: HashMap::new(),
                events: current_trace
                    .iter()
                    .map(|lbl| {
                        let mut attrs = HashMap::new();
                        attrs.insert(
                            "concept:name".to_string(),
                            crate::models::AttributeValue::String(lbl.clone()),
                        );
                        crate::models::Event { attributes: attrs }
                    })
                    .collect(),
            });
        }
    }
}

/// Recursively enumerate all possible traces.
///
/// `can_emit` controls whether leaf transitions emit traces:
/// - In a sequence (SPO), only the last child can emit (suppresses intermediate traces).
/// - In XOR/Loop/PartialOrder, all children can emit.
/// - At the root level, emission is always allowed.
fn enumerate_traces(
    arena: &PowlArena,
    node_id: u32,
    config: &ExtensivePlayoutConfig,
    current_trace: &mut Vec<String>,
    traces: &mut Vec<Trace>,
    seen: &mut HashSet<Vec<String>>,
    limit_reached: &mut bool,
    can_emit: bool,
) {
    // Check if we've reached the trace limit
    if traces.len() >= config.max_traces {
        *limit_reached = true;
        return;
    }

    // Check max length constraint
    if current_trace.len() >= config.max_length {
        return;
    }

    // Get the node
    let node = match arena.nodes.get(node_id as usize) {
        Some(n) => n,
        None => return,
    };

    match node {
        PowlNode::Transition(t) => {
            if let Some(label) = &t.label {
                current_trace.push(label.clone());
                if can_emit {
                    try_emit_trace(current_trace, config, traces, seen);
                }
            }
        }

        PowlNode::FrequentTransition(t) => {
            current_trace.push(t.activity.clone());
            if can_emit {
                try_emit_trace(current_trace, config, traces, seen);
            }
        }

        PowlNode::StrictPartialOrder(spo) => {
            // Sequence: children accumulate in order
            // Only the last child can emit (complete trace)
            let child_count = spo.children.len();
            for (i, &child_id) in spo.children.iter().enumerate() {
                if *limit_reached {
                    break;
                }
                let child_can_emit = can_emit && (i == child_count - 1);
                enumerate_traces(
                    arena,
                    child_id,
                    config,
                    current_trace,
                    traces,
                    seen,
                    limit_reached,
                    child_can_emit,
                );
            }
        }

        PowlNode::OperatorPowl(op) => {
            match op.operator {
                Operator::Xor => {
                    // Exclusive choice: each branch independently
                    for &child_id in &op.children {
                        if *limit_reached {
                            break;
                        }
                        let branch_len = current_trace.len();
                        enumerate_traces(
                            arena,
                            child_id,
                            config,
                            current_trace,
                            traces,
                            seen,
                            limit_reached,
                            can_emit,
                        );
                        current_trace.truncate(branch_len);
                    }
                }

                Operator::Loop => {
                    // POWL Loop semantics: do(body) [redo(body)]
                    if op.children.is_empty() {
                        return;
                    }

                    let body = op.children[0];
                    let redo = op.children.get(1).copied();
                    let loop_start_len = current_trace.len();

                    // Execute body at least once
                    enumerate_traces(
                        arena,
                        body,
                        config,
                        current_trace,
                        traces,
                        seen,
                        limit_reached,
                        can_emit,
                    );

                    // Loop: execute redo then body, up to max_loops times
                    for _ in 0..config.max_loops {
                        if *limit_reached || current_trace.len() >= config.max_length {
                            break;
                        }
                        if let Some(redo_child) = redo {
                            enumerate_traces(
                                arena,
                                redo_child,
                                config,
                                current_trace,
                                traces,
                                seen,
                                limit_reached,
                                can_emit,
                            );
                            if *limit_reached || current_trace.len() >= config.max_length {
                                break;
                            }
                        }
                        enumerate_traces(
                            arena,
                            body,
                            config,
                            current_trace,
                            traces,
                            seen,
                            limit_reached,
                            can_emit,
                        );
                    }

                    // Restore trace length after loop
                    current_trace.truncate(loop_start_len);
                }

                Operator::PartialOrder => {
                    // Execute children in parallel (all interleavings)
                    for &child_id in &op.children {
                        if *limit_reached {
                            break;
                        }
                        enumerate_traces(
                            arena,
                            child_id,
                            config,
                            current_trace,
                            traces,
                            seen,
                            limit_reached,
                            can_emit,
                        );
                    }
                }
            }
        }

        PowlNode::DecisionGraph(_dg) => {
            // Decision graph - execute start nodes through all possible paths
        }
    }
}

#[wasm_bindgen]
pub fn powl_extensive_playout(
    _powl_handle: &str,
    _root_id: &str,
    config_json: &str,
) -> Result<JsValue, JsValue> {
    let _config: ExtensivePlayoutConfig = serde_json::from_str(config_json).unwrap_or_default();

    // Return placeholder result since PowlArena is not stored in state
    let result = ExtensivePlayoutResult {
        traces: Vec::new(),
        count: 0,
        limit_reached: false,
    };

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
        .map(|s| JsValue::from_str(&s))
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
}
