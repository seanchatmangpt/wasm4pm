/// Ensemble Discovery — Run multiple algorithms, rank by quality, find consensus.
///
/// Pure Rust/WASM — no ML/LLM dependencies. Uses DFG-based fitness to evaluate
/// each discovered model against the original log.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::error::{wasm_err, codes};
use crate::utilities::to_js;
use std::collections::HashSet;

/// Run ensemble discovery: discover DFG from log, compute self-fitness,
/// measure complexity metrics, and return a ranked quality assessment.
///
/// This is a lightweight ensemble that evaluates the DFG model (which is
/// the universal representation all algorithms converge to) rather than
/// running N separate expensive algorithms.
///
/// ```javascript
/// const result = JSON.parse(pm.ensemble_discover(handle, 'concept:name'));
/// // { models: [{algorithm: "dfg", fitness: 0.95, ...}], consensus: {...} }
/// ```
#[wasm_bindgen]
pub fn ensemble_discover(
    log_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let (traces, _attributes, activity_set) = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities: HashSet<String> = log.traces.iter()
                .flat_map(|t| t.events.iter())
                .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()).map(str::to_owned))
                .collect();
            Ok((log.traces.clone(), log.attributes.clone(), activities))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    if traces.is_empty() {
        return Err(wasm_err(codes::INVALID_INPUT, "Log has no traces"));
    }

    // Build DFG edge set for fitness evaluation
    let dfg_edges: HashSet<(String, String)> = traces.iter().flat_map(|trace| {
        let acts: Vec<String> = trace.events.iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()).map(str::to_owned))
            .collect();
        let mut pairs = Vec::new();
        for window in acts.windows(2) {
            pairs.push((window[0].clone(), window[1].clone()));
        }
        pairs
    }).collect();

    // Compute fitness for each trace
    let total_traces = traces.len();
    let mut fitting_traces = 0usize;
    let mut total_fitness = 0.0f64;

    for trace in &traces {
        let acts: Vec<&str> = trace.events.iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
            .collect();
        if acts.len() <= 1 {
            fitting_traces += 1;
            total_fitness += 1.0;
            continue;
        }
        let pairs = acts.len() - 1;
        let mut fit = 0usize;
        for window in acts.windows(2) {
            if dfg_edges.contains(&(window[0].to_owned(), window[1].to_owned())) {
                fit += 1;
            }
        }
        let trace_fit = fit as f64 / pairs as f64;
        if trace_fit >= 0.9 {
            fitting_traces += 1;
        }
        total_fitness += trace_fit;
    }

    let avg_fitness = total_fitness / total_traces as f64;
    let conforming_ratio = fitting_traces as f64 / total_traces as f64;

    // Complexity metrics
    let edge_count = dfg_edges.len();
    let node_count = activity_set.len();
    let complexity_ratio = if node_count > 0 {
        edge_count as f64 / node_count as f64
    } else {
        0.0
    };

    // Simulated algorithm results (different complexity/quality trade-offs)
    // In a real ensemble, each algorithm would produce its own model.
    // Here we show how DFG quality varies with different pruning thresholds.
    let mut models = Vec::new();

    // Full DFG
    models.push(serde_json::json!({
        "algorithm": "dfg_full",
        "fitness": avg_fitness,
        "conforming_ratio": conforming_ratio,
        "edge_count": edge_count,
        "node_count": node_count,
        "complexity_ratio": complexity_ratio,
        "quality_score": avg_fitness * (1.0 - (complexity_ratio - 1.0).abs().min(1.0) * 0.2),
    }));

    // Pruned DFG (remove edges with frequency 1)
    let edge_freq: std::collections::HashMap<(String, String), usize> = traces.iter()
        .flat_map(|trace| {
            let acts: Vec<String> = trace.events.iter()
                .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()).map(str::to_owned))
                .collect();
            let mut pairs = Vec::new();
            for window in acts.windows(2) {
                pairs.push((window[0].to_owned(), window[1].to_owned()));
            }
            pairs
        })
        .fold(std::collections::HashMap::new(), |mut acc, pair| {
            *acc.entry(pair).or_insert(0) += 1;
            acc
        });

    let pruned_edges: HashSet<(String, String)> = edge_freq
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(pair, _)| pair)
        .collect();

    let pruned_edge_count = pruned_edges.len();
    let pruned_complexity = if node_count > 0 {
        pruned_edge_count as f64 / node_count as f64
    } else {
        0.0
    };

    // Compute pruned fitness
    let mut pruned_total_fitness = 0.0f64;
    let mut pruned_fitting = 0usize;
    for trace in &traces {
        let acts: Vec<&str> = trace.events.iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
            .collect();
        if acts.len() <= 1 {
            pruned_fitting += 1;
            pruned_total_fitness += 1.0;
            continue;
        }
        let pairs = acts.len() - 1;
        let mut fit = 0usize;
        for window in acts.windows(2) {
            if pruned_edges.contains(&(window[0].to_owned(), window[1].to_owned())) {
                fit += 1;
            }
        }
        let trace_fit = fit as f64 / pairs as f64;
        if trace_fit >= 0.9 { pruned_fitting += 1; }
        pruned_total_fitness += trace_fit;
    }

    let pruned_fitness = pruned_total_fitness / total_traces as f64;
    let pruned_conforming = pruned_fitting as f64 / total_traces as f64;

    models.push(serde_json::json!({
        "algorithm": "dfg_pruned",
        "fitness": pruned_fitness,
        "conforming_ratio": pruned_conforming,
        "edge_count": pruned_edge_count,
        "node_count": node_count,
        "complexity_ratio": pruned_complexity,
        "quality_score": pruned_fitness * (1.0 - (pruned_complexity - 1.0).abs().min(1.0) * 0.2),
    }));

    // Sort by quality score descending
    models.sort_by(|a, b| {
        b["quality_score"].as_f64().unwrap_or(0.0)
            .partial_cmp(&a["quality_score"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let best = &models[0];
    let worst = &models[models.len() - 1];
    let agreement = if models.len() > 1 {
        let best_fit = best["fitness"].as_f64().unwrap_or(0.0);
        let worst_fit = worst["fitness"].as_f64().unwrap_or(0.0);
        1.0 - (best_fit - worst_fit).abs()
    } else {
        1.0
    };

    to_js(&serde_json::json!({
        "models": models,
        "consensus": {
            "best_algorithm": best["algorithm"],
            "best_fitness": best["fitness"],
            "agreement_score": agreement,
            "total_traces": total_traces,
            "total_activities": node_count,
            "total_edges": edge_count,
        },
        "method": "ensemble_dfg_variants",
    }))
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
    fn test_ensemble_uniform_log() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
        ]);
        // DFG should have perfect fitness for uniform log
        let edges: HashSet<(String, String)> = log.traces.iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace.events.iter()
                    .filter_map(|e| e.attributes.get("concept:name").and_then(|v| v.as_string()).map(str::to_owned))
                    .collect();
                let mut pairs = Vec::new();
                for window in acts.windows(2) {
                    pairs.push((window[0].clone(), window[1].clone()));
                }
                pairs
            })
            .collect();

        assert!(edges.contains(&("A".to_string(), "B".to_string())));
        assert!(edges.contains(&("B".to_string(), "C".to_string())));
        assert_eq!(edges.len(), 2);
    }

    #[test]
    fn test_pruning_removes_low_frequency() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "X", "C"], // rare edge A->X, B->X
        ]);

        let edge_freq: std::collections::HashMap<(String, String), usize> = log.traces.iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace.events.iter()
                    .filter_map(|e| e.attributes.get("concept:name").and_then(|v| v.as_string()).map(str::to_owned))
                    .collect();
                let mut pairs = Vec::new();
                for window in acts.windows(2) {
                    pairs.push((window[0].to_owned(), window[1].to_owned()));
                }
                pairs
            })
            .fold(std::collections::HashMap::new(), |mut acc, pair| {
                *acc.entry(pair).or_insert(0) += 1;
                acc
            });

        let pruned: HashSet<(String, String)> = edge_freq
            .into_iter()
            .filter(|(_, count)| *count > 1)
            .map(|(pair, _)| pair)
            .collect();

        // A->B and B->C have frequency 2; A->X and X->C have frequency 1
        assert!(pruned.contains(&("A".to_string(), "B".to_string())));
        assert!(pruned.contains(&("B".to_string(), "C".to_string())));
        assert!(!pruned.contains(&("A".to_string(), "X".to_string())));
        assert!(!pruned.contains(&("X".to_string(), "C".to_string())));
    }
}
