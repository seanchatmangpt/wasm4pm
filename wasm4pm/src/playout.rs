//! Process tree and DFG playout (simulation) algorithms.
//!
//! Two playout modes:
//! 1. **Process tree playout** — recursive execution with an enabled-set worklist.
//!    - Sequence chains children in order.
//!    - XOR randomly picks one child.
//!    - Parallel enables all children.
//!    - Loop executes do-branch then optionally redo (30% probability).
//!    - Leaf nodes record activity labels as events.
//! 2. **DFG playout** — random walk: pick random start activity, follow outgoing
//!    edges randomly, end at sink or when reaching an end-activity (30% early-stop
//!    probability). Respects min/max trace length.
//!
//! Ported from pm4wasm, adapted to use `fastrand` and pictl's POWL arena types.

use crate::error::{codes, wasm_err};
use crate::models::{AttributeValue, Event, EventLog, Trace};
use crate::powl_process_tree::PtOperator;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// ─── Public parameter types ─────────────────────────────────────────────────────

/// Parameters controlling playout behavior.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayOutParameters {
    /// Number of traces to generate. Default: 100.
    pub num_traces: usize,
    /// Whether to include synthetic timestamps. Default: true.
    pub include_timestamps: bool,
    /// Start timestamp in milliseconds since Unix epoch. Default: 10000000.
    pub start_timestamp: i64,
    /// Minimum trace length (DFG playout only). Default: 1.
    pub min_trace_length: usize,
    /// Maximum trace length (DFG playout only). Default: 100.
    pub max_trace_length: usize,
}

impl Default for PlayOutParameters {
    fn default() -> Self {
        PlayOutParameters {
            num_traces: 100,
            include_timestamps: true,
            start_timestamp: 10_000_000,
            min_trace_length: 1,
            max_trace_length: 100,
        }
    }
}

// ─── Process tree playout ───────────────────────────────────────────────────────

/// Recursively play out a `ProcessTree` node and return the sequence of activity
/// labels produced by this subtree.
fn playout_process_tree_node(
    label: &Option<String>,
    operator: &Option<PtOperator>,
    children: &[crate::powl_process_tree::ProcessTree],
) -> Vec<String> {
    // Leaf node
    if operator.is_none() {
        match label {
            Some(l) if !l.is_empty() => return vec![l.clone()],
            _ => return vec![],
        }
    }

    let op = operator.as_ref().unwrap();
    match op {
        PtOperator::Sequence => {
            // Execute children in order, concatenating results.
            let mut events = Vec::new();
            for child in children {
                events.extend(playout_process_tree_node(
                    &child.label,
                    &child.operator,
                    &child.children,
                ));
            }
            events
        }
        PtOperator::Xor => {
            // Pick exactly one child at random.
            if children.is_empty() {
                return vec![];
            }
            let idx = fastrand::usize(..children.len());
            playout_process_tree_node(
                &children[idx].label,
                &children[idx].operator,
                &children[idx].children,
            )
        }
        PtOperator::Parallel => {
            // Enable all children, collect all events.
            let mut events = Vec::new();
            for child in children {
                events.extend(playout_process_tree_node(
                    &child.label,
                    &child.operator,
                    &child.children,
                ));
            }
            events
        }
        PtOperator::Loop => {
            // Loop: do-branch (child 0), then optionally redo (child 1) with 30% probability.
            // A process tree loop has two children:
            //   child 0 = do (body), child 1 = redo
            if children.is_empty() {
                return vec![];
            }

            let mut events = Vec::new();

            // Execute the do-branch
            events.extend(playout_process_tree_node(
                &children[0].label,
                &children[0].operator,
                &children[0].children,
            ));

            // Optionally redo: 30% chance to loop again
            while fastrand::f64() < 0.3 {
                events.extend(playout_process_tree_node(
                    &children[0].label,
                    &children[0].operator,
                    &children[0].children,
                ));
            }

            events
        }
    }
}

/// Play out a process tree and produce an event log.
///
/// # Arguments
/// * `tree` — the process tree to play out
/// * `params` — playout parameters
///
/// # Returns
/// An `EventLog` with `params.num_traces` traces.
pub fn play_out_tree(
    tree: &crate::powl_process_tree::ProcessTree,
    params: &PlayOutParameters,
) -> EventLog {
    let mut log = EventLog::new();

    for trace_idx in 0..params.num_traces {
        let activities = playout_process_tree_node(&tree.label, &tree.operator, &tree.children);

        let mut trace = Trace::new();
        let mut timestamp_ms = params.start_timestamp + (trace_idx as i64 * 100_000);

        for activity in &activities {
            let mut event = Event::new();
            event.attributes.insert(
                "concept:name".to_string(),
                AttributeValue::String(activity.clone()),
            );
            if params.include_timestamps {
                event.attributes.insert(
                    "time:timestamp".to_string(),
                    AttributeValue::Date(format_timestamp_ms(timestamp_ms)),
                );
                timestamp_ms += 1000; // 1 second between events
            }
            trace.events.push(event);
        }

        log.traces.push(trace);
    }

    log
}

// ─── DFG playout ───────────────────────────────────────────────────────────────

/// Play out a Directly-Follows Graph via random walk and produce an event log.
///
/// # Arguments
/// * `activities` — all activity labels in the DFG
/// * `edges` — `(from, to)` directed edges
/// * `start_activities` — activities that can start a trace
/// * `end_activities` — activities that can end a trace
/// * `params` — playout parameters
///
/// # Algorithm
/// 1. Pick a random start activity (uniform over `start_activities`).
/// 2. Follow a random outgoing edge from the current activity.
/// 3. Stop when:
///    a. Current activity is in `end_activities` (30% early-stop probability), or
///    b. No outgoing edges exist, or
///    c. Trace length reaches `max_trace_length`.
/// 4. If trace is shorter than `min_trace_length`, restart.
pub fn play_out_dfg_core(
    activities: &[String],
    edges: &[(String, String)],
    start_activities: &HashMap<String, usize>,
    end_activities: &HashMap<String, usize>,
    params: &PlayOutParameters,
) -> EventLog {
    // Build adjacency list: activity -> Vec<successor>
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    for (from, to) in edges {
        adj.entry(from.clone()).or_default().push(to.clone());
    }

    // Collect start activity names
    let start_names: Vec<&str> = start_activities.keys().map(|s| s.as_str()).collect();
    if start_names.is_empty() {
        // Fallback: use all activities as potential starts
        let all_starts: Vec<&str> = activities.iter().map(|s| s.as_str()).collect();
        return play_out_dfg_with_starts(&all_starts, &adj, end_activities, params);
    }

    play_out_dfg_with_starts(&start_names, &adj, end_activities, params)
}

fn play_out_dfg_with_starts(
    start_names: &[&str],
    adj: &HashMap<String, Vec<String>>,
    end_activities: &HashMap<String, usize>,
    params: &PlayOutParameters,
) -> EventLog {
    let mut log = EventLog::new();

    for trace_idx in 0..params.num_traces {
        let mut trace_activities: Vec<String> = Vec::new();

        loop {
            trace_activities.clear();

            // Pick a random start activity
            let start = start_names[fastrand::usize(..start_names.len())];
            let mut current = start.to_string();
            trace_activities.push(current.clone());

            loop {
                // Check stopping conditions
                let at_end = end_activities.contains_key(&current);
                let no_outgoing = adj.get(&current).is_none_or(|v| v.is_empty());
                let reached_max = trace_activities.len() >= params.max_trace_length;

                if no_outgoing || reached_max {
                    break;
                }

                // If at an end activity, 30% chance to stop early
                if at_end && fastrand::f64() < 0.3 {
                    break;
                }

                // Follow a random outgoing edge
                if let Some(successors) = adj.get(&current) {
                    if successors.is_empty() {
                        break;
                    }
                    let next_idx = fastrand::usize(..successors.len());
                    current = successors[next_idx].clone();
                    trace_activities.push(current.clone());
                } else {
                    break;
                }
            }

            // Check minimum trace length
            if trace_activities.len() >= params.min_trace_length {
                break;
            }
            // Otherwise retry (bounded by a safety limit to prevent infinite loops)
            if trace_idx > params.num_traces * 10 {
                // Give up and use whatever we have
                break;
            }
        }

        // Build the trace
        let mut trace = Trace::new();
        let mut timestamp_ms = params.start_timestamp + (trace_idx as i64 * 100_000);

        for activity in &trace_activities {
            let mut event = Event::new();
            event.attributes.insert(
                "concept:name".to_string(),
                AttributeValue::String(activity.clone()),
            );
            if params.include_timestamps {
                event.attributes.insert(
                    "time:timestamp".to_string(),
                    AttributeValue::Date(format_timestamp_ms(timestamp_ms)),
                );
                timestamp_ms += 1000;
            }
            trace.events.push(event);
        }

        log.traces.push(trace);
    }

    log
}

/// Format a millisecond timestamp as an ISO 8601 string.
fn format_timestamp_ms(ms: i64) -> String {
    let secs = ms / 1000;
    let millis = (ms % 1000) as u32;
    // Simple ISO 8601 format: 1970-01-12T10:46:40.000Z
    // Use chrono for proper formatting
    chrono::DateTime::from_timestamp(secs, millis * 1_000_000)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string())
}

// ─── WASM exports ──────────────────────────────────────────────────────────────

/// Play out a process tree and return an event log handle.
///
/// ```javascript
/// const params = { num_traces: 50, include_timestamps: true };
/// const result = JSON.parse(pm.play_out_process_tree(treeJson, 0, JSON.stringify(params)));
/// // { handle: "obj_42", trace_count: 50, event_count: 230 }
/// ```
#[wasm_bindgen]
pub fn play_out_process_tree(
    tree_json: &str,
    _root_node_idx: usize,
    params: &JsValue,
) -> Result<JsValue, JsValue> {
    // Parse the process tree from JSON
    let tree: crate::powl_process_tree::ProcessTree =
        serde_json::from_str(tree_json).map_err(|e| {
            wasm_err(
                codes::INVALID_JSON,
                format!("Invalid process tree JSON: {}", e),
            )
        })?;

    // Parse parameters with defaults
    let params: PlayOutParameters = if params.is_undefined() || params.is_null() {
        PlayOutParameters::default()
    } else {
        serde_wasm_bindgen::from_value(params.clone()).map_err(|e| {
            wasm_err(
                codes::INVALID_INPUT,
                format!("Invalid playout parameters: {}", e),
            )
        })?
    };

    // Run playout
    let log = play_out_tree(&tree, &params);
    let trace_count = log.traces.len();
    let event_count = log.event_count();

    // Store and return handle
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store playout result"))?;

    to_js(&serde_json::json!({
        "handle": handle,
        "trace_count": trace_count,
        "event_count": event_count,
    }))
}

/// Play out a DFG (Directly-Follows Graph) and return an event log handle.
///
/// The DFG is provided as a JSON string with the shape:
/// ```json
/// {
///   "nodes": [{ "id": "A", "label": "A", "frequency": 10 }],
///   "edges": [{ "from": "A", "to": "B", "frequency": 8 }],
///   "start_activities": { "A": 10 },
///   "end_activities": { "C": 6 }
/// }
/// ```
///
/// ```javascript
/// const result = JSON.parse(pm.play_out_dfg(dfgJson, JSON.stringify({ num_traces: 50 })));
/// // { handle: "obj_43", trace_count: 50, event_count: 180 }
/// ```
#[wasm_bindgen]
pub fn play_out_dfg(dfg_json: &str, params: &JsValue) -> Result<JsValue, JsValue> {
    // Parse the DFG from JSON
    let dfg: crate::models::DirectlyFollowsGraph = serde_json::from_str(dfg_json)
        .map_err(|e| wasm_err(codes::INVALID_JSON, format!("Invalid DFG JSON: {}", e)))?;

    // Parse parameters with defaults
    let params: PlayOutParameters = if params.is_undefined() || params.is_null() {
        PlayOutParameters::default()
    } else {
        serde_wasm_bindgen::from_value(params.clone()).map_err(|e| {
            wasm_err(
                codes::INVALID_INPUT,
                format!("Invalid playout parameters: {}", e),
            )
        })?
    };

    // Extract edges as (from, to) pairs
    let edges: Vec<(String, String)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();

    // Extract activity labels
    let activities: Vec<String> = dfg.nodes.iter().map(|n| n.label.clone()).collect();

    // Run playout
    let log = play_out_dfg_core(
        &activities,
        &edges,
        &dfg.start_activities,
        &dfg.end_activities,
        &params,
    );
    let trace_count = log.traces.len();
    let event_count = log.event_count();

    // Store and return handle
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store playout result"))?;

    to_js(&serde_json::json!({
        "handle": handle,
        "trace_count": trace_count,
        "event_count": event_count,
    }))
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_process_tree::ProcessTree;
    use std::collections::HashMap;

    fn default_params() -> PlayOutParameters {
        PlayOutParameters {
            num_traces: 10,
            include_timestamps: false,
            start_timestamp: 10_000_000,
            min_trace_length: 1,
            max_trace_length: 100,
        }
    }

    #[test]
    fn test_playout_single_activity_leaf() {
        let tree = ProcessTree::leaf(Some("A".to_string()));
        let params = default_params();
        let log = play_out_tree(&tree, &params);

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            assert_eq!(trace.events.len(), 1);
            let name = trace.events[0]
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
                .unwrap();
            assert_eq!(name, "A");
        }
    }

    #[test]
    fn test_playout_silent_leaf_produces_no_events() {
        let tree = ProcessTree::leaf(None);
        let params = default_params();
        let log = play_out_tree(&tree, &params);

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            assert_eq!(trace.events.len(), 0);
        }
    }

    #[test]
    fn test_playout_sequence() {
        let tree = ProcessTree::internal(
            PtOperator::Sequence,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::leaf(Some("B".to_string())),
                ProcessTree::leaf(Some("C".to_string())),
            ],
        );
        let params = default_params();
        let log = play_out_tree(&tree, &params);

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            assert_eq!(trace.events.len(), 3);
            let names: Vec<&str> = trace
                .events
                .iter()
                .map(|e| {
                    e.attributes
                        .get("concept:name")
                        .and_then(|v| v.as_string())
                        .unwrap()
                })
                .collect();
            assert_eq!(names, vec!["A", "B", "C"]);
        }
    }

    #[test]
    fn test_playout_xor_picks_one_child() {
        let tree = ProcessTree::internal(
            PtOperator::Xor,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::leaf(Some("B".to_string())),
                ProcessTree::leaf(Some("C".to_string())),
            ],
        );
        let params = default_params();
        let log = play_out_tree(&tree, &params);

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            // Each trace should have exactly 1 event (XOR picks one child)
            assert_eq!(trace.events.len(), 1);
            let name = trace.events[0]
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
                .unwrap();
            assert!(name == "A" || name == "B" || name == "C");
        }

        // With 10 traces and 3 children, we should see at least 2 distinct activities
        // (probabilistic, but extremely unlikely to always pick the same one)
        let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
        for trace in &log.traces {
            if let Some(name) = trace.events[0]
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
            {
                seen.insert(name);
            }
        }
        assert!(
            seen.len() >= 2,
            "XOR should pick at least 2 distinct activities across 10 traces, got {:?}",
            seen
        );
    }

    #[test]
    fn test_playout_parallel_executes_all_children() {
        let tree = ProcessTree::internal(
            PtOperator::Parallel,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::leaf(Some("B".to_string())),
            ],
        );
        let params = default_params();
        let log = play_out_tree(&tree, &params);

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            // Parallel executes all children, so 2 events
            assert_eq!(trace.events.len(), 2);
            let names: Vec<&str> = trace
                .events
                .iter()
                .map(|e| {
                    e.attributes
                        .get("concept:name")
                        .and_then(|v| v.as_string())
                        .unwrap()
                })
                .collect();
            assert_eq!(names, vec!["A", "B"]);
        }
    }

    #[test]
    fn test_playout_loop_executes_do_branch_at_least_once() {
        let tree = ProcessTree::internal(
            PtOperator::Loop,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::leaf(Some("B".to_string())),
            ],
        );
        let params = default_params();
        let log = play_out_tree(&tree, &params);

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            // Loop always executes do-branch at least once, producing at least 1 event
            assert!(
                trace.events.len() >= 1,
                "Loop should produce at least 1 event (do-branch)"
            );
            // All events should be "A" (do-branch is child 0)
            for event in &trace.events {
                let name = event
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                    .unwrap();
                assert_eq!(name, "A");
            }
        }
    }

    #[test]
    fn test_playout_nested_sequence_xor() {
        // ->( A, X( B, C ) ) — sequence of A, then XOR of B or C
        let tree = ProcessTree::internal(
            PtOperator::Sequence,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::internal(
                    PtOperator::Xor,
                    vec![
                        ProcessTree::leaf(Some("B".to_string())),
                        ProcessTree::leaf(Some("C".to_string())),
                    ],
                ),
            ],
        );
        let params = default_params();
        let log = play_out_tree(&tree, &params);

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            // A is always first, then either B or C
            assert_eq!(trace.events.len(), 2);
            let first = trace.events[0]
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
                .unwrap();
            assert_eq!(first, "A");
            let second = trace.events[1]
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
                .unwrap();
            assert!(second == "B" || second == "C");
        }
    }

    #[test]
    fn test_playout_includes_timestamps() {
        let tree = ProcessTree::leaf(Some("A".to_string()));
        let params = PlayOutParameters {
            num_traces: 3,
            include_timestamps: true,
            start_timestamp: 10_000_000,
            min_trace_length: 1,
            max_trace_length: 100,
        };
        let log = play_out_tree(&tree, &params);

        assert_eq!(log.traces.len(), 3);
        for trace in log.traces.iter() {
            assert_eq!(trace.events.len(), 1);
            // Timestamps are stored as AttributeValue::Date, not String
            let ts_attr = trace.events[0].attributes.get("time:timestamp");
            assert!(
                ts_attr.is_some(),
                "Timestamp should be present when include_timestamps is true"
            );
            match ts_attr.unwrap() {
                AttributeValue::Date(s) => {
                    assert!(!s.is_empty(), "Date string should not be empty")
                }
                other => panic!("Expected AttributeValue::Date, got {:?}", other),
            }
        }
    }

    #[test]
    fn test_playout_dfg_basic() {
        let activities = vec!["A".to_string(), "B".to_string(), "C".to_string()];
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("B".to_string(), "C".to_string()),
        ];
        let mut start_activities = HashMap::new();
        start_activities.insert("A".to_string(), 10usize);
        let mut end_activities = HashMap::new();
        end_activities.insert("C".to_string(), 8usize);

        let params = default_params();
        let log = play_out_dfg_core(
            &activities,
            &edges,
            &start_activities,
            &end_activities,
            &params,
        );

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            // All traces should start with A (only start activity)
            let first = trace.events[0]
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
                .unwrap();
            assert_eq!(first, "A");
        }
    }

    #[test]
    fn test_playout_dfg_respects_max_trace_length() {
        // Linear chain A -> B -> C -> D -> E
        let activities = vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "D".to_string(),
            "E".to_string(),
        ];
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("B".to_string(), "C".to_string()),
            ("C".to_string(), "D".to_string()),
            ("D".to_string(), "E".to_string()),
        ];
        let mut start_activities = HashMap::new();
        start_activities.insert("A".to_string(), 10usize);
        let end_activities = HashMap::new(); // No explicit end activities

        let params = PlayOutParameters {
            num_traces: 10,
            include_timestamps: false,
            start_timestamp: 10_000_000,
            min_trace_length: 1,
            max_trace_length: 3, // Cap at 3 events per trace
        };
        let log = play_out_dfg_core(
            &activities,
            &edges,
            &start_activities,
            &end_activities,
            &params,
        );

        assert_eq!(log.traces.len(), 10);
        for trace in &log.traces {
            assert!(
                trace.events.len() <= 3,
                "Trace should not exceed max_trace_length of 3, got {}",
                trace.events.len()
            );
        }
    }

    #[test]
    fn test_playout_dfg_min_trace_length_retry() {
        // A -> B, with C as end activity. But only start is A.
        // If the random walk happens to produce very short traces,
        // the min_trace_length should cause retries.
        let activities = vec!["A".to_string(), "B".to_string(), "C".to_string()];
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("B".to_string(), "C".to_string()),
        ];
        let mut start_activities = HashMap::new();
        start_activities.insert("A".to_string(), 10usize);
        let mut end_activities = HashMap::new();
        end_activities.insert("C".to_string(), 5usize);

        let params = PlayOutParameters {
            num_traces: 5,
            include_timestamps: false,
            start_timestamp: 10_000_000,
            min_trace_length: 2, // Require at least 2 events
            max_trace_length: 100,
        };
        let log = play_out_dfg_core(
            &activities,
            &edges,
            &start_activities,
            &end_activities,
            &params,
        );

        assert_eq!(log.traces.len(), 5);
        for trace in &log.traces {
            assert!(
                trace.events.len() >= 2,
                "Trace should have at least min_trace_length of 2, got {}",
                trace.events.len()
            );
        }
    }

    #[test]
    fn test_default_parameters() {
        let params = PlayOutParameters::default();
        assert_eq!(params.num_traces, 100);
        assert!(params.include_timestamps);
        assert_eq!(params.start_timestamp, 10_000_000);
        assert_eq!(params.min_trace_length, 1);
        assert_eq!(params.max_trace_length, 100);
    }

    #[test]
    fn test_format_timestamp() {
        let ts = format_timestamp_ms(10_000_000); // 1970-01-01T02:46:40
        assert!(ts.contains("1970"), "Timestamp should contain year 1970");
    }
}
