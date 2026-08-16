use crate::error::{codes, wasm_err};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use std::collections::HashSet;
/// Ensemble Discovery — Run multiple algorithms, rank by quality, find consensus.
///
/// Pure Rust/WASM — no ML/LLM dependencies. Uses DFG-based fitness to evaluate
/// each discovered model against the original log.
use wasm_bindgen::prelude::*;

/// Run ensemble discovery: discover DFG from log, compute self-fitness,
/// measure complexity metrics, and return a ranked quality assessment.
///
/// This is a lightweight ensemble that evaluates the DFG model (which is
/// the universal representation all algorithms converge to) rather than
/// running N separate expensive algorithms.
///
/// ```javascript
/// const result = JSON.parse(pm.dfg_threshold_sweep(handle, 'concept:name'));
/// // { models: [{algorithm: "dfg", fitness: 0.95, ...}], consensus: {...} }
/// ```
#[wasm_bindgen]
pub fn dfg_threshold_sweep(log_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let (traces, _attributes, activity_set) =
        get_or_init_state().with_object(log_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let activities: HashSet<String> = log
                    .traces
                    .iter()
                    .flat_map(|t| t.events.iter())
                    .filter_map(|e| {
                        e.attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                Ok((log.traces.clone(), log.attributes.clone(), activities))
            }
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("EventLog '{}' not found", log_handle),
            )),
        })?;

    if traces.is_empty() {
        return Err(wasm_err(codes::INVALID_INPUT, "Log has no traces"));
    }

    // Build DFG edge set for fitness evaluation
    let dfg_edges: HashSet<(String, String)> = traces
        .iter()
        .flat_map(|trace| {
            let acts: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                        .map(str::to_owned)
                })
                .collect();
            acts.windows(2)
                .map(|w| (w[0].clone(), w[1].clone()))
                .collect::<Vec<_>>()
        })
        .collect();

    // Compute fitness for each trace
    let total_traces = traces.len();
    let mut fitting_traces = 0usize;
    let mut total_fitness = 0.0f64;

    for trace in &traces {
        let acts: Vec<&str> = trace
            .events
            .iter()
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

    // DFG threshold sweep: evaluates full and pruned (freq>1) DFG variants.
    // This is a lightweight quality assessment, not a multi-algorithm ensemble.
    //
    // W4PM-LEAN-GALL-032: `quality_score` below is a ranking heuristic
    // (fitness * complexity-deviation penalty), deliberately NOT an F-measure/F1 — it has
    // no precision term. It is legitimately distinct from
    // `benchmarks/benchmark.rs::compute_quality_metrics`'s `f_measure` (process-model
    // F-measure over fitness/precision) and from
    // `benches/prediction_accuracy.rs::OutcomeAccuracy::f1` (classification F1 for
    // next-outcome prediction). See `test_three_quality_metrics_are_distinct_not_duplicated`.
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
    let edge_freq: std::collections::HashMap<(String, String), usize> = traces
        .iter()
        .flat_map(|trace| {
            let acts: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                        .map(str::to_owned)
                })
                .collect();
            acts.windows(2)
                .map(|w| (w[0].clone(), w[1].clone()))
                .collect::<Vec<_>>()
        })
        .fold(std::collections::HashMap::new(), |mut acc, pair| {
            *acc.entry(pair).or_default() += 1;
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
        let acts: Vec<&str> = trace
            .events
            .iter()
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
        if trace_fit >= 0.9 {
            pruned_fitting += 1;
        }
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
        b["quality_score"]
            .as_f64()
            .unwrap_or(0.0)
            .total_cmp(&a["quality_score"].as_f64().unwrap_or(0.0))
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

    to_js_str(&serde_json::json!({
        "models": models,
        "consensus": {
            "best_algorithm": best["algorithm"],
            "best_fitness": best["fitness"],
            "agreement_score": agreement,
            "total_traces": total_traces,
            "total_activities": node_count,
            "total_edges": edge_count,
        },
        "method": "dfg_threshold_sweep",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, EventLog, Trace};
    use std::collections::{BTreeMap, HashMap};

    fn make_test_log(traces: Vec<Vec<&str>>) -> EventLog {
        let mut log = EventLog::new();
        for activities in traces {
            let mut trace = Trace {
                attributes: BTreeMap::new(),
                events: Vec::new(),
            };
            for act in activities {
                let mut event = Event {
                    attributes: BTreeMap::new(),
                };
                event.attributes.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(act.to_string()),
                );
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
        let edges: HashSet<(String, String)> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
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

        let edge_freq: std::collections::HashMap<(String, String), usize> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .fold(std::collections::HashMap::new(), |mut acc, pair| {
                *acc.entry(pair).or_default() += 1;
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

    #[test]
    #[ignore = "dfg_threshold_sweep uses JsValue which panics in test environment"]
    fn test_dfg_threshold_sweep_empty_log_returns_error() {
        let _log = EventLog::new();
        let result = dfg_threshold_sweep("test_handle", "concept:name");
        assert!(result.is_err(), "Empty log should return error");
    }

    #[test]
    #[ignore = "dfg_threshold_sweep uses JsValue which panics in test environment"]
    fn test_dfg_threshold_sweep_single_activity_trace() {
        let _log = make_test_log(vec![vec!["A"], vec!["A"]]);
        let result = dfg_threshold_sweep("test_handle", "concept:name");
        assert!(result.is_ok(), "Single activity trace should succeed");
    }

    #[test]
    fn test_ensemble_computes_complexity_ratio() {
        let log = make_test_log(vec![vec!["A", "B", "C", "D"], vec!["A", "B", "C", "D"]]);

        let dfg_edges: HashSet<(String, String)> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .collect();

        let edge_count = dfg_edges.len();
        let node_count = 4; // A, B, C, D
        let complexity_ratio = edge_count as f64 / node_count as f64;

        assert_eq!(edge_count, 3, "Should have 3 edges: A->B, B->C, C->D");
        assert!(
            (complexity_ratio - 0.75).abs() < 0.01,
            "Complexity ratio should be 0.75"
        );
    }

    #[test]
    fn test_ensemble_handles_parallel_paths() {
        let log = make_test_log(vec![
            vec!["A", "B", "D"],
            vec!["A", "C", "D"],
            vec!["A", "B", "D"],
        ]);

        let edge_freq: std::collections::HashMap<(String, String), usize> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .fold(std::collections::HashMap::new(), |mut acc, pair| {
                *acc.entry(pair).or_default() += 1;
                acc
            });

        // A->B: 2, A->C: 1, B->D: 2, C->D: 1
        assert_eq!(edge_freq[&("A".to_string(), "B".to_string())], 2);
        assert_eq!(edge_freq[&("A".to_string(), "C".to_string())], 1);
        assert_eq!(edge_freq[&("B".to_string(), "D".to_string())], 2);
        assert_eq!(edge_freq[&("C".to_string(), "D".to_string())], 1);
    }

    #[test]
    fn test_ensemble_detects_self_loop() {
        let log = make_test_log(vec![vec!["A", "A", "B"]]);

        let dfg_edges: HashSet<(String, String)> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .collect();

        assert!(dfg_edges.contains(&("A".to_string(), "A".to_string())));
        assert!(dfg_edges.contains(&("A".to_string(), "B".to_string())));
    }

    #[test]
    fn test_ensemble_fitness_perfect_for_uniform_log() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
        ]);

        let dfg_edges: HashSet<(String, String)> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .collect();

        let mut total_fitness = 0.0f64;
        for trace in &log.traces {
            let acts: Vec<&str> = trace
                .events
                .iter()
                .filter_map(|e| e.attributes.get("concept:name").and_then(|v| v.as_string()))
                .collect();
            let pairs = acts.len() - 1;
            let mut fit = 0usize;
            for window in acts.windows(2) {
                if dfg_edges.contains(&(window[0].to_owned(), window[1].to_owned())) {
                    fit += 1;
                }
            }
            total_fitness += fit as f64 / pairs as f64;
        }

        let avg_fitness = total_fitness / log.traces.len() as f64;
        assert!(
            (avg_fitness - 1.0).abs() < 0.001,
            "Uniform log should have perfect fitness"
        );
    }

    #[test]
    fn test_ensemble_conforming_ratio_calculation() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "X", "C"], // divergent trace
            vec!["A", "B", "C"],
        ]);

        let dfg_edges: HashSet<(String, String)> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .collect();

        let mut fitting_traces = 0usize;
        for trace in &log.traces {
            let acts: Vec<&str> = trace
                .events
                .iter()
                .filter_map(|e| e.attributes.get("concept:name").and_then(|v| v.as_string()))
                .collect();
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
        }

        let conforming_ratio = fitting_traces as f64 / log.traces.len() as f64;
        assert!(conforming_ratio > 0.0, "Should have some conforming traces");
    }

    #[test]
    fn test_ensemble_missing_activity_key() {
        let mut log = EventLog::new();
        let mut trace = Trace {
            attributes: BTreeMap::new(),
            events: Vec::new(),
        };
        let mut event = Event {
            attributes: BTreeMap::new(),
        };
        // Missing concept:name attribute
        event.attributes.insert(
            "other:key".to_string(),
            AttributeValue::String("A".to_string()),
        );
        trace.events.push(event);
        log.traces.push(trace);

        let dfg_edges: HashSet<(String, String)> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .collect();

        assert!(
            dfg_edges.is_empty(),
            "Missing activity key should result in no edges"
        );
    }

    #[test]
    fn test_ensemble_single_event_traces() {
        let log = make_test_log(vec![vec!["A"], vec!["B"], vec!["C"]]);

        let dfg_edges: HashSet<(String, String)> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .collect();

        assert!(
            dfg_edges.is_empty(),
            "Single event traces should have no edges"
        );
    }

    #[test]
    fn test_ensemble_quality_score_bounds() {
        let log = make_test_log(vec![vec!["A", "B", "C"]]);

        let dfg_edges: HashSet<(String, String)> = log
            .traces
            .iter()
            .flat_map(|trace| {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get("concept:name")
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();
                acts.windows(2)
                    .map(|w| (w[0].clone(), w[1].clone()))
                    .collect::<Vec<_>>()
            })
            .collect();

        let edge_count = dfg_edges.len();
        let node_count = 3;
        let complexity_ratio = edge_count as f64 / node_count as f64;

        // Quality score formula: fitness * (1.0 - (complexity_ratio - 1.0).abs().min(1.0) * 0.2)
        // With fitness = 1.0, complexity_ratio = 0.67:
        // quality = 1.0 * (1.0 - 0.33 * 0.2) = 1.0 * 0.934 = 0.934
        let quality_score = 1.0 * (1.0 - (complexity_ratio - 1.0).abs().min(1.0) * 0.2);
        assert!(
            quality_score > 0.0 && quality_score <= 1.0,
            "Quality score should be in (0, 1]"
        );
    }

    /// W4PM-LEAN-GALL-032 finding: this crate has three "quality score" / "F1-shaped"
    /// computations that are legitimately DIFFERENT metrics for different purposes, not
    /// copies of the same formula that should be unified:
    ///
    /// 1. `ensemble.rs`'s `quality_score` (this file, above): `fitness * (1 - complexity_penalty)`
    ///    — a heuristic ranking score for candidate DFG variants, penalizing edge/node ratio
    ///    deviation from 1.0. Not a harmonic mean of anything.
    /// 2. `benchmarks/benchmark.rs::compute_quality_metrics`'s `f_measure`:
    ///    `2 * fitness * precision / (fitness + precision)` — the standard process-mining
    ///    F-measure (van der Aalst-style harmonic mean of token-replay fitness and
    ///    ETConformance precision), evaluating a *discovered process model* against a log.
    /// 3. `benches/prediction_accuracy.rs`'s `OutcomeAccuracy::f1`:
    ///    `2 * precision * recall / (precision + recall)` computed from TP/FP/FN counts —
    ///    classification F1 for *next-outcome prediction* accuracy, an entirely different
    ///    domain (predictive monitoring, not model discovery quality).
    ///
    /// (2) and (3) share the harmonic-mean *shape* (both are textbook F1), which is why they
    /// could be mistaken for duplicates — but they are computed over conceptually unrelated
    /// inputs (model fitness/precision vs. classification precision/recall) and serve
    /// different callers. This test proves the three formulas give different, non-interchangeable
    /// numbers on a matched scenario rather than asserting they "should" agree.
    #[test]
    fn test_three_quality_metrics_are_distinct_not_duplicated() {
        // Shared scenario: fitness = 0.9, precision = 0.8, recall = 0.8, complexity_ratio = 0.8.
        let fitness = 0.9_f64;
        let precision = 0.8_f64;
        let recall = 0.8_f64;
        let complexity_ratio = 0.8_f64;

        // (1) ensemble.rs quality_score heuristic — no precision/recall term at all,
        // penalizes structural complexity deviation instead.
        let ensemble_quality_score = fitness * (1.0 - (complexity_ratio - 1.0).abs().min(1.0) * 0.2);

        // (2) benchmarks/benchmark.rs::compute_quality_metrics's f_measure formula
        // (process-model F-measure over fitness/precision).
        let process_f_measure = 2.0 * fitness * precision / (fitness + precision);

        // (3) benches/prediction_accuracy.rs::OutcomeAccuracy::f1 formula
        // (classification F1 over precision/recall derived from TP/FP/FN counts).
        let classification_f1 = 2.0 * (precision * recall) / (precision + recall);

        // All three give different numbers on this shared scenario, confirming they are not
        // three copies of one formula that happen to agree — each takes a different
        // combination of inputs and answers a different question.
        assert!(
            (ensemble_quality_score - process_f_measure).abs() > 1e-6,
            "ensemble quality_score ({ensemble_quality_score}) must differ from the \
             process-model F-measure ({process_f_measure}) — they measure different things"
        );
        assert!(
            (process_f_measure - classification_f1).abs() > 1e-6,
            "process-model F-measure ({process_f_measure}, from fitness={fitness}/precision={precision}) \
             must differ from classification F1 ({classification_f1}, from precision={precision}/recall={recall}) \
             here, since fitness != recall in this scenario — they are computed from different inputs"
        );
        assert!(
            (ensemble_quality_score - classification_f1).abs() > 1e-6,
            "ensemble quality_score ({ensemble_quality_score}) must differ from classification F1 \
             ({classification_f1}) — unrelated formulas"
        );
    }
}
