/// Activity Ablation (Counterfactual-lite) — What happens if we remove an activity?
///
/// For each target activity: filter it from traces, re-discover the model,
/// and measure the complexity change compared to the original model.
///
/// Pure Rust/WASM — no ML/LLM dependencies. Uses DFG edge analysis.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::error::{wasm_err, codes};
use crate::utilities::to_js;
use std::collections::HashSet;

/// Run an ablation study: for each target activity, measure its impact on the process model.
///
/// For each activity:
/// 1. Filter out traces containing that activity
/// 2. Build DFG from remaining traces
/// 3. Compare DFG complexity against the original
///
/// ```javascript
/// const result = JSON.parse(pm.ablation_study(handle, 'concept:name', JSON.stringify(["Approve", "Reject"])));
/// // { results: [{activity: "Approve", severity: 0.3, ...}] }
/// ```
#[wasm_bindgen]
pub fn ablation_study(
    log_handle: &str,
    activity_key: &str,
    target_activities_json: &str,
) -> Result<JsValue, JsValue> {
    let targets: Vec<String> = serde_json::from_str(target_activities_json)
        .map_err(|e| wasm_err(codes::INVALID_JSON, format!("Invalid target activities JSON: {}", e)))?;

    if targets.is_empty() {
        return Err(wasm_err(codes::INVALID_INPUT, "Target activities list must not be empty"));
    }

    // Get original log data
    let (traces, _attributes) = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            Ok((log.traces.clone(), log.attributes.clone()))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    let total_traces = traces.len();

    // Build original DFG
    let (orig_edges, orig_nodes) = build_dfg(&traces, activity_key);
    let orig_edge_count = orig_edges.len();
    let orig_node_count = orig_nodes.len();
    let orig_fitness = compute_avg_fitness(&traces, activity_key, &orig_edges);

    // Ablate each target activity
    let mut results = Vec::with_capacity(targets.len());

    for target in &targets {
        // Filter: keep only traces that do NOT contain the target activity
        let filtered_traces: Vec<_> = traces.iter()
            .filter(|trace| {
                !trace.events.iter().any(|e| {
                    e.attributes.get(activity_key)
                        .and_then(|v| v.as_string())
                        .map(|a| a == target.as_str())
                        .unwrap_or(false)
                })
            })
            .cloned()
            .collect();

        let remaining_traces = filtered_traces.len();
        let removed_traces = total_traces - remaining_traces;

        if remaining_traces == 0 {
            results.push(serde_json::json!({
                "activity": target,
                "severity": 1.0,
                "removed_traces": removed_traces,
                "remaining_traces": 0,
                "edge_count_change": -(orig_edge_count as f64),
                "node_count_change": -(orig_node_count as f64),
                "fitness_change": 0.0,
                "complexity_delta": 0.0,
                "note": "all_traces_removed",
            }));
            continue;
        }

        // Build ablated DFG
        let (ablated_edges, ablated_nodes) = build_dfg(&filtered_traces, activity_key);
        let ablated_edge_count = ablated_edges.len();
        let ablated_node_count = ablated_nodes.len();

        // Compute ablated fitness
        let ablated_fitness = compute_avg_fitness(&filtered_traces, activity_key, &ablated_edges);

        // Edges that exist in original but not in ablated (lost due to removing activity)
        let lost_edges: HashSet<(String, String)> = orig_edges.difference(&ablated_edges).cloned().collect();

        // New edges that only appear in ablated (structural change)
        let new_edges: HashSet<(String, String)> = ablated_edges.difference(&orig_edges).cloned().collect();

        // Complexity delta: ratio of edges to nodes
        let orig_complexity = if orig_node_count > 0 {
            orig_edge_count as f64 / orig_node_count as f64
        } else {
            0.0
        };
        let ablated_complexity = if ablated_node_count > 0 {
            ablated_edge_count as f64 / ablated_node_count as f64
        } else {
            0.0
        };
        let complexity_delta = ablated_complexity - orig_complexity;

        // Severity: proportion of traces removed + structural impact
        let trace_impact = removed_traces as f64 / total_traces as f64;
        let edge_impact = if orig_edge_count > 0 {
            lost_edges.len() as f64 / orig_edge_count as f64
        } else {
            0.0
        };
        let severity = (trace_impact * 0.6 + edge_impact * 0.4).min(1.0);

        results.push(serde_json::json!({
            "activity": target,
            "severity": severity,
            "removed_traces": removed_traces,
            "remaining_traces": remaining_traces,
            "original_edges": orig_edge_count,
            "ablated_edges": ablated_edge_count,
            "edge_count_change": ablated_edge_count as f64 - orig_edge_count as f64,
            "original_nodes": orig_node_count,
            "ablated_nodes": ablated_node_count,
            "node_count_change": ablated_node_count as f64 - orig_node_count as f64,
            "lost_edges_count": lost_edges.len(),
            "new_edges_count": new_edges.len(),
            "original_fitness": orig_fitness,
            "ablated_fitness": ablated_fitness,
            "fitness_change": ablated_fitness - orig_fitness,
            "complexity_delta": complexity_delta,
        }));
    }

    // Sort by severity descending
    results.sort_by(|a, b| {
        b["severity"].as_f64().unwrap_or(0.0)
            .partial_cmp(&a["severity"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    to_js(&serde_json::json!({
        "results": results,
        "total_traces": total_traces,
        "original_edges": orig_edge_count,
        "original_nodes": orig_node_count,
        "original_fitness": orig_fitness,
        "method": "ablation_study",
    }))
}

/// Build DFG edge set and node set from traces.
fn build_dfg(
    traces: &[crate::models::Trace],
    activity_key: &str,
) -> (HashSet<(String, String)>, HashSet<String>) {
    let mut edges: HashSet<(String, String)> = HashSet::new();
    let mut nodes: HashSet<String> = HashSet::new();

    for trace in traces {
        let acts: Vec<String> = trace.events.iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()).map(str::to_owned))
            .collect();

        for act in &acts {
            nodes.insert(act.clone());
        }

        for window in acts.windows(2) {
            edges.insert((window[0].clone(), window[1].clone()));
        }
    }

    (edges, nodes)
}

/// Compute average trace fitness against a DFG edge set.
fn compute_avg_fitness(
    traces: &[crate::models::Trace],
    activity_key: &str,
    dfg_edges: &HashSet<(String, String)>,
) -> f64 {
    if traces.is_empty() {
        return 0.0;
    }

    let total: f64 = traces.iter().map(|trace| {
        let acts: Vec<&str> = trace.events.iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
            .collect();

        if acts.len() <= 1 {
            return 1.0;
        }

        let pairs = acts.len() - 1;
        let fit = acts.windows(2)
            .filter(|w| dfg_edges.contains(&(w[0].to_owned(), w[1].to_owned())))
            .count();

        fit as f64 / pairs as f64
    }).sum();

    total / traces.len() as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{EventLog, Trace, Event, AttributeValue};
    use std::collections::HashMap;

    fn make_test_log(traces: Vec<Vec<&str>>) -> EventLog {
        let mut log = EventLog::new();
        for activities in traces {
            let mut trace = Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            };
            for act in activities {
                let mut event = Event {
                    attributes: HashMap::new(),
                };
                event.attributes.insert("concept:name".to_string(), AttributeValue::String(act.to_string()));
                trace.events.push(event);
            }
            log.traces.push(trace);
        }
        log
    }

    #[test]
    fn test_build_dfg_basic() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "D"],
        ]);
        let (edges, nodes) = build_dfg(&log.traces, "concept:name");
        assert_eq!(nodes.len(), 4); // A, B, C, D
        assert!(edges.contains(&("A".into(), "B".into())));
        assert!(edges.contains(&("B".into(), "C".into())));
        assert!(edges.contains(&("B".into(), "D".into())));
        assert_eq!(edges.len(), 3);
    }

    #[test]
    fn test_ablation_removes_activity() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "X", "C"],
        ]);

        // Ablate "X" — should remove 1 trace
        let filtered: Vec<_> = log.traces.iter()
            .filter(|trace| {
                !trace.events.iter().any(|e| {
                    e.attributes.get("concept:name")
                        .and_then(|v| v.as_string())
                        .map(|a| a == "X")
                        .unwrap_or(false)
                })
            })
            .cloned()
            .collect();

        assert_eq!(filtered.len(), 2);
    }

    #[test]
    fn test_ablation_severity_critical() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
        ]);

        // Ablating "B" removes ALL traces (every trace has B)
        let filtered: Vec<_> = log.traces.iter()
            .filter(|trace| {
                !trace.events.iter().any(|e| {
                    e.attributes.get("concept:name")
                        .and_then(|v| v.as_string())
                        .map(|a| a == "B")
                        .unwrap_or(false)
                })
            })
            .cloned()
            .collect();

        assert_eq!(filtered.len(), 0);
    }

    #[test]
    fn test_compute_avg_fitness_perfect() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
        ]);
        let (edges, _) = build_dfg(&log.traces, "concept:name");
        let fitness = compute_avg_fitness(&log.traces, "concept:name", &edges);
        assert!((fitness - 1.0).abs() < 1e-9);
    }
}
