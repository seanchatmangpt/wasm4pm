use crate::state::{get_or_init_state, StoredObject};
use rustc_hash::FxHashMap;
use serde_json::json;

/// Compute log-level distribution statistics over raw anomaly scores.
///
/// Returned tuple is (mean, std_dev). Used internally to derive per-trace
/// z-scores so that raw -log2(prob) costs become comparable across logs.
/// Returns (0.0, 0.0) for an empty input — callers should treat std_dev <= 1e-12
/// as "no spread" and default z-scores to 0.
pub(crate) fn score_distribution_stats(scores: &[f64]) -> (f64, f64) {
    if scores.is_empty() {
        return (0.0, 0.0);
    }
    let n = scores.len() as f64;
    let mean = scores.iter().sum::<f64>() / n;
    let var = scores.iter().map(|s| (s - mean) * (s - mean)).sum::<f64>() / n;
    (mean, var.sqrt())
}
/// Priority 7 — Trace anomaly scoring.
///
/// Scores each trace against a reference DFG.  Unusual traces (those that
/// traverse rare edges) receive high scores.  The score is the mean of
/// -log2(edge_frequency / total_edges) over every directly-follows step in the
/// trace; a step whose pair is absent from the DFG is penalised with a fixed
/// cost of 10.
use wasm_bindgen::prelude::*;

const MISSING_EDGE_COST: f64 = 10.0;

/// Score a single trace (given as a JSON array of activity strings) against a
/// reference DFG.
///
/// ```javascript
/// const dfgJson   = JSON.stringify(pm.discover_dfg(logHandle, 'concept:name'));
/// const dfgHandle = pm.store_dfg_from_json(dfgJson);
/// const score = pm.score_trace_anomaly(dfgHandle,
///                 JSON.stringify(['Register','Approve','Close']));
/// console.log(score); // 0.0 = perfectly normal
/// ```
#[wasm_bindgen]
pub fn score_trace_anomaly(dfg_handle: &str, activities_json: &str) -> Result<JsValue, JsValue> {
    let activities: Vec<String> = serde_json::from_str(activities_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid activities JSON: {}", e)))?;

    get_or_init_state().with_dfg(dfg_handle, |dfg| {
            if activities.len() < 2 {
                return Ok(JsValue::from_f64(0.0));
            }

            let mut cost_sum = 0.0_f64;
            let steps = activities.len() - 1;
            for i in 0..steps {
                let from_act = &activities[i];
                // Use per-source total for correct transition probability
                let from_total: usize = dfg
                    .edges
                    .iter()
                    .filter(|e| &e.from == from_act)
                    .map(|e| e.frequency)
                    .sum::<usize>()
                    .max(1);
                let edge_freq = dfg
                    .edges
                    .iter()
                    .find(|e| e.from == activities[i] && e.to == activities[i + 1])
                    .map_or(0, |e| e.frequency);
                cost_sum += if edge_freq == 0 {
                    MISSING_EDGE_COST
                } else {
                    -(edge_freq as f64 / from_total as f64).log2()
                };
            }
            Ok(JsValue::from_f64(cost_sum / steps as f64))
    })
}

#[wasm_bindgen]
pub fn discover_ml_anomaly(log_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    // 1. Generate DFG directly by accessing the stored EventLog in state
    let dfg = state.with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let admitted =
                wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
            let dfg = crate::discovery::discover_dfg_from_log(&admitted, activity_key);
            Ok(dfg)
        }
        Some(_) => Err(crate::error::js_val("log_handle is not an EventLog")),
        None => Err(crate::error::js_val("EventLog handle not found")),
    })?;

    // 2. Store it
    let dfg_handle = state
        .store_object(StoredObject::DFG(dfg))
        .map_err(|_| crate::error::js_val("Failed to store DFG"))?;

    // 3. Score anomalies
    let result = score_log_anomalies(log_handle, &dfg_handle, activity_key)?;

    // 4. Cleanup
    let _ = state.delete_object(&dfg_handle);

    Ok(result)
}

/// Score every trace in an event log against a reference DFG.
///
/// Returns a JSON string:
/// ```json
/// [{"case_id": "Case1", "score": 0.0, "steps": 2},
///  {"case_id": "Case2", "score": 10.0, "steps": 3}]
/// ```
/// Sorted descending by score (most anomalous first).
#[wasm_bindgen]
pub fn score_log_anomalies(
    log_handle: &str,
    dfg_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Collect DFG edge frequencies
    let edge_data: Vec<(String, String, usize)> =
        get_or_init_state().with_object(dfg_handle, |obj| match obj {
            Some(StoredObject::DFG(dfg)) => Ok(dfg
                .edges
                .iter()
                .map(|e| (e.from.clone(), e.to.clone(), e.frequency))
                .collect()),
            Some(_) => Err(crate::error::js_val("dfg_handle is not a DFG")),
            None => Err(crate::error::js_val("DFG handle not found")),
        })?;

    let freq_map: FxHashMap<(&str, &str), usize> = edge_data
        .iter()
        .map(|(f, t, c)| ((f.as_str(), t.as_str()), *c))
        .collect();
    // Build per-source totals for correct transition probability
    let mut source_totals: FxHashMap<&str, usize> = FxHashMap::default();
    for (f, _, c) in &edge_data {
        *source_totals.entry(f.as_str()).or_default() += c;
    }

    let results_json = get_or_init_state().with_event_log(log_handle, |log| {
            let mut results: Vec<serde_json::Value> = Vec::new();
            for trace in &log.traces {
                let case_id = trace
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                    .unwrap_or("unknown")
                    .to_string();
                let acts: Vec<&str> = trace
                    .events
                    .iter()
                    .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                    .collect();
                if acts.len() < 2 {
                    results.push(json!({"case_id": case_id, "score": 0.0, "steps": 0}));
                    continue;
                }
                let steps = acts.len() - 1;
                let mut cost = 0.0_f64;
                for i in 0..steps {
                    let from_total = source_totals.get(acts[i]).copied().unwrap_or(1).max(1);
                    let freq = freq_map.get(&(acts[i], acts[i + 1])).copied().unwrap_or(0);
                    cost += if freq == 0 {
                        MISSING_EDGE_COST
                    } else {
                        -(freq as f64 / from_total as f64).log2()
                    };
                }
                results.push(
                    json!({"case_id": case_id, "score": cost / steps as f64, "steps": steps}),
                );
            }
            results.sort_by(|a, b| {
                b["score"]
                    .as_f64()
                    .unwrap_or(0.0)
                    .total_cmp(&a["score"].as_f64().unwrap_or(0.0))
            });

            // Per-trace z-score relative to the log-level distribution. This
            // turns a raw -log2(prob) cost into something comparable across
            // logs — `is_outlier` flags z > 2 (≈ outside 95th percentile under
            // a normal approximation). Counter to the upstream PR-50 pattern
            // for classification (where macro-F1 was added because accuracy
            // hid class imbalance), here a raw score hides distribution shape.
            let scores: Vec<f64> = results
                .iter()
                .filter_map(|r| r["score"].as_f64())
                .filter(|s| s.is_finite())
                .collect();
            if !scores.is_empty() {
                let (mean, std_dev) = score_distribution_stats(&scores);
                for r in results.iter_mut() {
                    if let Some(score) = r["score"].as_f64() {
                        let z = if std_dev > 1e-12 {
                            (score - mean) / std_dev
                        } else {
                            0.0
                        };
                        if let Some(obj) = r.as_object_mut() {
                            obj.insert("z_score".to_string(), json!(z));
                            obj.insert("is_outlier".to_string(), json!(z > 2.0));
                        }
                    }
                }
            }
            serde_json::to_string(&results).map_err(|e| crate::error::js_val(&e.to_string()))
    })?;

    Ok(crate::error::js_val(&results_json))
}

#[cfg(test)]
mod tests {
    use super::score_distribution_stats;

    /// Domain contract (definition of mean & population standard deviation):
    /// for a constant series, mean equals that constant and std is exactly 0.
    /// This is what guards the `std_dev > 1e-12` branch in score_log_anomalies.
    #[test]
    fn constant_scores_have_zero_std() {
        let (mean, std) = score_distribution_stats(&[3.0, 3.0, 3.0, 3.0]);
        assert!(
            (mean - 3.0).abs() < 1e-12,
            "mean of constant series = constant"
        );
        assert!(std.abs() < 1e-12, "std of constant series = 0, got {}", std);
    }

    /// Domain contract anchoring the z>2 outlier threshold: for uniform [0..4]
    /// no value reaches z=2 (max-z ≈ 1.414). Adding a true outlier at 12 must
    /// push that outlier above z=2 — the entire is_outlier contract.
    #[test]
    fn z_score_threshold_matches_sigma_distance() {
        let (mean, std) = score_distribution_stats(&[0.0, 1.0, 2.0, 3.0, 4.0]);
        assert!((mean - 2.0).abs() < 1e-12);
        let max_z = (4.0 - mean) / std;
        assert!(
            max_z < 2.0,
            "uniform [0..4] must not contain z>2 outliers; got {}",
            max_z
        );

        let (mean2, std2) = score_distribution_stats(&[0.0, 1.0, 2.0, 3.0, 4.0, 12.0]);
        let z = (12.0 - mean2) / std2;
        assert!(
            z > 2.0,
            "score 12 in [0..4, 12] must be z>2 outlier; got {}",
            z
        );
    }

    /// Empty input is the explicit caller-side guard: the score_log_anomalies
    /// outer code already early-returns before invoking us, but exposing a
    /// stable (0.0, 0.0) sentinel lets future callers reuse this helper safely.
    #[test]
    fn empty_scores_return_zero_zero() {
        let (mean, std) = score_distribution_stats(&[]);
        assert_eq!(mean, 0.0);
        assert_eq!(std, 0.0);
    }
}
