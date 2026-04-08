use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
/// Outcome Prediction — answers "Will this case complete normally?"
///
/// Consolidates anomaly scoring, trace likelihood, and boundary coverage
/// into WASM-exported functions for outcome prediction use cases.
use wasm_bindgen::prelude::*;

/// Score a trace for anomaly against a reference DFG model.
///
/// Returns `{ score: number, is_anomalous: boolean, threshold: number }`.
/// Score is normalized 0-1 (>0.7 = anomalous).
///
/// The raw anomaly cost from the DFG is mapped to [0,1] via `1 - exp(-raw/5)`.
#[wasm_bindgen]
pub fn score_anomaly(model_handle: &str, trace_json: &str) -> Result<JsValue, JsValue> {
    let activities: Vec<String> = serde_json::from_str(trace_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid trace JSON: {}", e)))?;

    get_or_init_state().with_object(model_handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
            if activities.len() < 2 {
                let result = json!({
                    "score": 0.0,
                    "is_anomalous": false,
                    "threshold": 0.7
                });
                return Ok(JsValue::from_str(
                    &serde_json::to_string(&result)
                        .map_err(|e| JsValue::from_str(&e.to_string()))?,
                ));
            }

            let total_edges: usize = dfg.edges.iter().map(|e| e.frequency).sum();
            let total_f = total_edges.max(1) as f64;

            let mut cost_sum = 0.0_f64;
            let steps = activities.len() - 1;
            for i in 0..steps {
                let edge_freq = dfg
                    .edges
                    .iter()
                    .find(|e| e.from == activities[i] && e.to == activities[i + 1])
                    .map(|e| e.frequency)
                    .unwrap_or(0);
                cost_sum += if edge_freq == 0 {
                    10.0 // missing edge penalty
                } else {
                    -(edge_freq as f64 / total_f).log2()
                };
            }
            let raw = cost_sum / steps as f64;
            // Map to [0,1]: 1 - exp(-raw/5)
            let score = 1.0 - (-raw / 5.0_f64).exp();
            let threshold = 0.7;

            let result = json!({
                "score": score,
                "is_anomalous": score > threshold,
                "threshold": threshold
            });
            Ok(JsValue::from_str(
                &serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))?,
            ))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a DirectlyFollowsGraph")),
        None => Err(JsValue::from_str("DFG handle not found")),
    })
}

/// Compute boundary coverage for a prefix against an event log.
///
/// Returns `{ coverage: number, matching_traces: number, normal_completions: number }`.
/// Coverage is the fraction of matching completions that are "normal" (within 2 sigma of median length).
#[wasm_bindgen]
pub fn compute_boundary_coverage(
    log_handle: &str,
    prefix_json: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid prefix JSON: {}", e)))?;

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Extract complete traces as activity string vectors
            let all_traces: Vec<Vec<String>> = log
                .traces
                .iter()
                .map(|trace| {
                    trace
                        .events
                        .iter()
                        .filter_map(|e| {
                            e.attributes
                                .get(activity_key)
                                .and_then(|v| v.as_string())
                                .map(str::to_owned)
                        })
                        .collect()
                })
                .collect();

            let coverage = crate::prediction_additions::boundary_coverage(&prefix, &all_traces);

            // Count matching traces and normal completions for reporting
            let matching: Vec<&Vec<String>> = all_traces
                .iter()
                .filter(|t| t.len() >= prefix.len() && t[..prefix.len()] == prefix[..])
                .collect();

            let matching_count = matching.len();
            let normal_count = if matching.is_empty() {
                0
            } else {
                let mut lengths: Vec<usize> = matching.iter().map(|t| t.len()).collect();
                lengths.sort();
                let median = lengths[lengths.len() / 2];
                let variance: f64 = lengths
                    .iter()
                    .map(|&len| ((len as i64 - median as i64).pow(2)) as f64)
                    .sum::<f64>()
                    / lengths.len() as f64;
                let sigma = variance.sqrt();
                let threshold = median as f64 + 2.0 * sigma;
                lengths
                    .iter()
                    .filter(|&&len| (len as f64) <= threshold)
                    .count()
            };

            let result = json!({
                "coverage": coverage,
                "matching_traces": matching_count,
                "normal_completions": normal_count
            });
            Ok(JsValue::from_str(
                &serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))?,
            ))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Score the likelihood of a trace according to an n-gram predictor model.
///
/// Returns `{ log_likelihood: number, normalized: number }`.
/// `log_likelihood` is the raw sum of log-probabilities; `normalized` divides by the number of steps.
///
/// Unlike `score_trace_likelihood` in the base prediction module (which returns a plain float),
/// this returns a structured object with both raw and normalised values.
#[wasm_bindgen]
pub fn compute_trace_likelihood(model_handle: &str, trace_json: &str) -> Result<JsValue, JsValue> {
    let acts: Vec<String> = serde_json::from_str(trace_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid trace JSON: {}", e)))?;

    get_or_init_state().with_object(model_handle, |obj| match obj {
        Some(StoredObject::NGramPredictor(predictor)) => {
            if acts.len() < 2 {
                let result = json!({
                    "log_likelihood": 0.0,
                    "normalized": 0.0
                });
                return Ok(JsValue::from_str(
                    &serde_json::to_string(&result)
                        .map_err(|e| JsValue::from_str(&e.to_string()))?,
                ));
            }

            // Use the same logic as prediction_additions::trace_log_likelihood
            // but with the string-keyed NGramPredictor
            let mut log_prob = 0.0_f64;
            let steps = acts.len() - 1;
            for i in 0..steps {
                let context_len = (predictor.n - 1).min(i + 1);
                let prefix = acts[i + 1 - context_len..=i].to_vec();
                let preds = predictor.predict(&prefix);
                let prob = preds
                    .iter()
                    .find(|(a, _)| a == &acts[i + 1])
                    .map(|(_, p)| *p)
                    .unwrap_or(1e-10);
                log_prob += prob.ln();
            }

            let normalized = log_prob / steps as f64;

            let result = json!({
                "log_likelihood": log_prob,
                "normalized": normalized
            });
            Ok(JsValue::from_str(
                &serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))?,
            ))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an NGramPredictor")),
        None => Err(JsValue::from_str("NGramPredictor handle not found")),
    })
}
