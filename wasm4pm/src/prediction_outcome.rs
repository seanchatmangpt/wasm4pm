use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
/// Outcome Prediction — answers "Will this case complete normally?"
///
/// Consolidates anomaly scoring, trace likelihood, and boundary coverage
/// into WASM-exported functions for outcome prediction use cases.
use wasm_bindgen::prelude::*;

/// Quality metrics produced by [`anomaly_score_from_edge_probs`].
#[derive(Debug, Clone, PartialEq)]
pub struct AnomalyScore {
    pub score: f64,
    pub raw_cost: f64,
    pub missing_edge_ratio: f64,
    pub steps: usize,
}

/// Compute the per-step anomaly cost and squashed score for a trace.
/// `edge_probs[i]` is the model probability of the i-th transition, or
/// `None` if absent. Cost is `-log2(p)` bits per step; absent / zero
/// edges incur `missing_penalty_bits`. Score = `1 - exp(-raw / scale)`.
pub fn anomaly_score_from_edge_probs(
    edge_probs: &[Option<f64>],
    missing_penalty_bits: f64,
    scale: f64,
) -> AnomalyScore {
    let steps = edge_probs.len();
    if steps == 0 {
        return AnomalyScore { score: 0.0, raw_cost: 0.0, missing_edge_ratio: 0.0, steps: 0 };
    }
    let mut cost_sum = 0.0_f64;
    let mut missing = 0usize;
    for p in edge_probs {
        cost_sum += match *p {
            None => { missing += 1; missing_penalty_bits }
            Some(prob) if prob > 0.0 => -prob.log2(),
            Some(_) => { missing += 1; missing_penalty_bits }
        };
    }
    let raw = cost_sum / steps as f64;
    AnomalyScore {
        score: 1.0 - (-raw / scale).exp(),
        raw_cost: raw,
        missing_edge_ratio: missing as f64 / steps as f64,
        steps,
    }
}

/// Score a trace for anomaly against a reference DFG model.
///
/// Returns `{ score, is_anomalous, threshold, raw_cost, missing_edge_ratio,
/// edge_coverage, steps, scale }`. `score = 1 - exp(-raw_cost / scale)`
/// where `raw_cost` is the mean per-step Shannon self-information
/// `-log2(p)` in bits, and absent edges are charged a fixed 10-bit
/// penalty. `missing_edge_ratio` is the additive data-drift signal:
/// callers should monitor it independently of `score`.
#[wasm_bindgen]
pub fn score_anomaly(model_handle: &str, trace_json: &str) -> Result<JsValue, JsValue> {
    let activities: Vec<String> = serde_json::from_str(trace_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid trace JSON: {}", e)))?;

    const SCALE: f64 = 5.0;
    const THRESHOLD: f64 = 0.7;
    const MISSING_EDGE_PENALTY_BITS: f64 = 10.0;

    get_or_init_state().with_object(model_handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
            let total_edges: usize = dfg.edges.iter().map(|e| e.frequency).sum();
            let total_f = total_edges.max(1) as f64;

            // Project each consecutive activity pair to its model
            // probability, or `None` if absent.
            let edge_probs: Vec<Option<f64>> = if activities.len() < 2 {
                Vec::new()
            } else {
                (0..activities.len() - 1)
                    .map(|i| {
                        dfg.edges
                            .iter()
                            .find(|e| e.from == activities[i] && e.to == activities[i + 1])
                            .map(|e| e.frequency as f64 / total_f)
                    })
                    .collect()
            };

            let s = anomaly_score_from_edge_probs(&edge_probs, MISSING_EDGE_PENALTY_BITS, SCALE);
            let result = json!({
                "score": s.score,
                "is_anomalous": s.score > THRESHOLD,
                "threshold": THRESHOLD,
                "raw_cost": s.raw_cost,
                "missing_edge_ratio": s.missing_edge_ratio,
                "edge_coverage": 1.0 - s.missing_edge_ratio,
                "steps": s.steps,
                "scale": SCALE,
            });
            Ok(crate::error::js_val(
                &serde_json::to_string(&result)
                    .map_err(|e| crate::error::js_val(&e.to_string()))?,
            ))
        }
        Some(_) => Err(crate::error::js_val("Handle is not a DirectlyFollowsGraph")),
        None => Err(crate::error::js_val("DFG handle not found")),
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
        .map_err(|e| crate::error::js_val(&format!("Invalid prefix JSON: {}", e)))?;

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
            Ok(crate::error::js_val(
                &serde_json::to_string(&result)
                    .map_err(|e| crate::error::js_val(&e.to_string()))?,
            ))
        }
        Some(_) => Err(crate::error::js_val("Handle is not an EventLog")),
        None => Err(crate::error::js_val("EventLog handle not found")),
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
        .map_err(|e| crate::error::js_val(&format!("Invalid trace JSON: {}", e)))?;

    get_or_init_state().with_object(model_handle, |obj| match obj {
        Some(StoredObject::NGramPredictor(predictor)) => {
            if acts.len() < 2 {
                let result = json!({
                    "log_likelihood": 0.0,
                    "normalized": 0.0
                });
                return Ok(crate::error::js_val(
                    &serde_json::to_string(&result)
                        .map_err(|e| crate::error::js_val(&e.to_string()))?,
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
            Ok(crate::error::js_val(
                &serde_json::to_string(&result)
                    .map_err(|e| crate::error::js_val(&e.to_string()))?,
            ))
        }
        Some(_) => Err(crate::error::js_val("Handle is not an NGramPredictor")),
        None => Err(crate::error::js_val("NGramPredictor handle not found")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Rank-1: empty input → zero score, no missing edges.
    #[test]
    fn anomaly_score_empty_is_zero() {
        let s = anomaly_score_from_edge_probs(&[], 10.0, 5.0);
        assert_eq!(s.steps, 0);
        assert_eq!(s.score, 0.0);
        assert_eq!(s.missing_edge_ratio, 0.0);
    }

    /// Rank-1: p = 1.0 for every step → raw = -log2(1) = 0 → score = 0.
    #[test]
    fn anomaly_score_certain_path_is_zero() {
        let s = anomaly_score_from_edge_probs(&[Some(1.0); 3], 10.0, 5.0);
        assert!((s.raw_cost).abs() < 1e-12);
        assert!((s.score).abs() < 1e-12);
        assert_eq!(s.missing_edge_ratio, 0.0);
    }

    /// Rank-2: introducing a single missing edge strictly increases
    /// raw_cost, missing_edge_ratio, AND score. Metric-surfacing
    /// guarantee: drift signal moves monotonically with the actual drift.
    #[test]
    fn missing_edge_strictly_increases_drift_signal() {
        let base = anomaly_score_from_edge_probs(&[Some(0.5), Some(0.5), Some(0.5)], 10.0, 5.0);
        let miss = anomaly_score_from_edge_probs(&[Some(0.5), None, Some(0.5)], 10.0, 5.0);
        assert!(miss.raw_cost > base.raw_cost);
        assert!(miss.missing_edge_ratio > base.missing_edge_ratio);
        assert!(miss.score > base.score);
        assert!((miss.missing_edge_ratio - 1.0 / 3.0).abs() < 1e-12);
    }

    /// Rank-1: all edges missing → raw_cost == penalty, missing_ratio = 1.
    #[test]
    fn all_missing_pegs_drift_signal_to_one() {
        let s = anomaly_score_from_edge_probs(&[None; 4], 10.0, 5.0);
        assert_eq!(s.missing_edge_ratio, 1.0);
        assert!((s.raw_cost - 10.0).abs() < 1e-12);
        assert!((s.score - (1.0 - (-2.0_f64).exp())).abs() < 1e-12);
    }

    /// Rank-2: the squashing function is strictly monotone in raw_cost,
    /// so score and raw_cost rank traces identically.
    #[test]
    fn squash_is_monotone_in_raw_cost() {
        let lo = anomaly_score_from_edge_probs(&[Some(0.5)], 10.0, 5.0);
        let mid = anomaly_score_from_edge_probs(&[Some(0.25)], 10.0, 5.0);
        let hi = anomaly_score_from_edge_probs(&[Some(0.1)], 10.0, 5.0);
        assert!(lo.raw_cost < mid.raw_cost && mid.raw_cost < hi.raw_cost);
        assert!(lo.score < mid.score && mid.score < hi.score);
    }
}
