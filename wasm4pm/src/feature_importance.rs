use crate::error::{codes, wasm_err};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
/// Feature Importance (SHAP-lite) — Permutation-based importance for process prediction.
///
/// Answers: "Which prefix activities matter most for predicting the next activity?"
///
/// Algorithm: For each position in the prefix, remove that activity, predict with
/// the shortened prefix, and measure the change in top-1 confidence. Activities
/// whose removal causes the largest confidence drop are the most important.
///
/// Pure Rust/WASM — no ML/LLM dependencies. Uses existing NGramPredictor.
use wasm_bindgen::prelude::*;

/// Compute permutation importance for each activity in a prefix.
///
/// For each position in the prefix, remove that activity and measure the
/// change in prediction confidence (top-1 probability). Activities whose
/// removal causes the largest drop are most important.
///
/// ```javascript
/// const result = JSON.parse(pm.compute_feature_importance(model_handle, JSON.stringify(["A","B","C"]), 3));
/// // { baseline: 0.85, importances: [{activity: "B", position: 1, delta: -0.3}, ...] }
/// ```
#[wasm_bindgen]
pub fn compute_feature_importance(
    model_handle: &str,
    prefix_json: &str,
    ngram_order: usize,
) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| wasm_err(codes::INVALID_JSON, format!("Invalid prefix JSON: {}", e)))?;

    if prefix.is_empty() {
        return Err(wasm_err(codes::INVALID_INPUT, "Prefix must not be empty"));
    }

    if prefix.len() < 2 {
        // With a single activity, removing it leaves nothing — importance is trivially the activity itself
        return to_js(&serde_json::json!({
            "baseline": 0.0,
            "importances": [{
                "activity": prefix[0],
                "position": 0,
                "delta": 0.0,
                "importance": 0.0,
                "note": "single_activity_prefix"
            }],
            "ngram_order": ngram_order,
            "method": "permutation_importance",
        }));
    }

    // Compute baseline prediction (full prefix)
    let baseline_confidence = get_or_init_state().with_object(model_handle, |obj| match obj {
        Some(StoredObject::NGramPredictor(predictor)) => {
            let preds = predictor.predict(&prefix);
            Ok(preds.first().map(|(_, p)| *p).unwrap_or(0.0))
        }
        Some(_) => Err(wasm_err(
            codes::INVALID_INPUT,
            "Handle is not an NGramPredictor",
        )),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            "NGramPredictor handle not found",
        )),
    })?;

    // For each position, compute importance by removing that activity
    let mut importances = Vec::with_capacity(prefix.len());

    for pos in 0..prefix.len() {
        // Build ablated prefix (remove activity at position pos)
        let ablated: Vec<String> = prefix
            .iter()
            .enumerate()
            .filter(|(i, _)| *i != pos)
            .map(|(_, s)| s.clone())
            .collect();

        let ablated_confidence = if ablated.is_empty() {
            0.0
        } else {
            get_or_init_state().with_object(model_handle, |obj| match obj {
                Some(StoredObject::NGramPredictor(predictor)) => {
                    let preds = predictor.predict(&ablated);
                    Ok(preds.first().map(|(_, p)| *p).unwrap_or(0.0))
                }
                Some(_) => Err(wasm_err(codes::INTERNAL_ERROR, "Handle type changed")),
                None => Err(wasm_err(
                    codes::INTERNAL_ERROR,
                    "NGramPredictor disappeared",
                )),
            })?
        };

        let delta = ablated_confidence - baseline_confidence; // negative = important (removal hurts)
        let importance = -delta; // positive = important

        importances.push(serde_json::json!({
            "activity": prefix[pos],
            "position": pos,
            "confidence_without": ablated_confidence,
            "delta": delta,
            "importance": importance,
        }));
    }

    // Sort by importance descending
    importances.sort_by(|a, b| {
        b["importance"]
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&a["importance"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Normalize importances to sum to 1.0
    let total_importance: f64 = importances
        .iter()
        .map(|v| v["importance"].as_f64().unwrap_or(0.0))
        .sum();

    if total_importance > 0.0 {
        for imp in &mut importances {
            let raw = imp["importance"].as_f64().unwrap_or(0.0);
            imp["importance"] = serde_json::json!(raw / total_importance);
        }
    }

    to_js(&serde_json::json!({
        "baseline": baseline_confidence,
        "importances": importances,
        "ngram_order": ngram_order,
        "method": "permutation_importance",
    }))
}

/// Compute global feature importance across all traces in an event log.
///
/// Aggregates permutation importance over all prefixes extracted from
/// completed traces. Returns average importance per activity.
///
/// ```javascript
/// const result = JSON.parse(pm.global_feature_importance(model_handle, log_handle, 'concept:name', 3));
/// // { activities: [{activity: "B", mean_importance: 0.35, count: 50}, ...] }
/// ```
#[wasm_bindgen]
pub fn global_feature_importance(
    model_handle: &str,
    log_handle: &str,
    activity_key: &str,
    ngram_order: usize,
) -> Result<JsValue, JsValue> {
    // Extract all prefixes from the event log
    let prefixes: Vec<Vec<String>> =
        get_or_init_state().with_object(log_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let mut all_prefixes = Vec::new();
                for trace in &log.traces {
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

                    // Extract all non-empty prefixes (except the full trace which has no "next")
                    for len in 1..acts.len() {
                        all_prefixes.push(acts[..len].to_vec());
                    }
                }
                Ok(all_prefixes)
            }
            Some(_) => Err(wasm_err(
                codes::INVALID_INPUT,
                "Log handle is not an EventLog",
            )),
            None => Err(wasm_err(codes::INVALID_HANDLE, "EventLog handle not found")),
        })?;

    if prefixes.is_empty() {
        return to_js(&serde_json::json!({
            "activities": [],
            "total_prefixes": 0,
            "ngram_order": ngram_order,
            "method": "global_permutation_importance",
        }));
    }

    // Accumulate importance per activity
    let mut activity_importance: std::collections::HashMap<String, (f64, usize)> =
        std::collections::HashMap::new();

    for prefix in &prefixes {
        // Get baseline
        let baseline = get_or_init_state().with_object(model_handle, |obj| match obj {
            Some(StoredObject::NGramPredictor(predictor)) => Ok(predictor
                .predict(prefix)
                .first()
                .map(|(_, p)| *p)
                .unwrap_or(0.0)),
            Some(_) => Err(wasm_err(codes::INTERNAL_ERROR, "Handle type changed")),
            None => Err(wasm_err(
                codes::INTERNAL_ERROR,
                "NGramPredictor disappeared",
            )),
        })?;

        for pos in 0..prefix.len() {
            let ablated: Vec<String> = prefix
                .iter()
                .enumerate()
                .filter(|(i, _)| *i != pos)
                .map(|(_, s)| s.clone())
                .collect();

            let ablated_conf = if ablated.is_empty() {
                0.0
            } else {
                get_or_init_state().with_object(model_handle, |obj| match obj {
                    Some(StoredObject::NGramPredictor(predictor)) => Ok(predictor
                        .predict(&ablated)
                        .first()
                        .map(|(_, p)| *p)
                        .unwrap_or(0.0)),
                    Some(_) => Err(wasm_err(codes::INTERNAL_ERROR, "Handle type changed")),
                    None => Err(wasm_err(
                        codes::INTERNAL_ERROR,
                        "NGramPredictor disappeared",
                    )),
                })?
            };

            let importance = -(ablated_conf - baseline); // positive = important
            let entry = activity_importance
                .entry(prefix[pos].clone())
                .or_insert((0.0, 0));
            entry.0 += importance;
            entry.1 += 1;
        }
    }

    // Build sorted result
    let mut activities: Vec<serde_json::Value> = activity_importance
        .into_iter()
        .map(|(act, (total_imp, count))| {
            serde_json::json!({
                "activity": act,
                "total_importance": total_imp,
                "count": count,
                "mean_importance": total_imp / count as f64,
            })
        })
        .collect();

    activities.sort_by(|a, b| {
        b["mean_importance"]
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&a["mean_importance"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    to_js(&serde_json::json!({
        "activities": activities,
        "total_prefixes": prefixes.len(),
        "ngram_order": ngram_order,
        "method": "global_permutation_importance",
    }))
}

#[cfg(test)]
mod tests {
    use crate::models::NGramPredictor;
    use std::collections::HashMap;

    fn make_ngram_predictor() -> NGramPredictor {
        // Build predictor from traces: A->B->C (3 times), A->B->D (2 times)
        let mut counts: HashMap<Vec<String>, HashMap<String, usize>> = HashMap::new();

        // A->B context: next is C (3x) or D (2x)
        let ab_dist = counts
            .entry(vec!["A".to_string(), "B".to_string()])
            .or_default();
        *ab_dist.entry("C".to_string()).or_insert(0) += 3;
        *ab_dist.entry("D".to_string()).or_insert(0) += 2;

        // B->C context: no continuation (end of trace)
        // B->D context: no continuation (end of trace)

        // A context: next is B (5x)
        let a_dist = counts.entry(vec!["A".to_string()]).or_default();
        *a_dist.entry("B".to_string()).or_insert(0) += 5;

        NGramPredictor { n: 2, counts }
    }

    #[test]
    fn test_baseline_prediction() {
        let predictor = make_ngram_predictor();
        let preds = predictor.predict(&["A".to_string(), "B".to_string()]);
        assert!(!preds.is_empty());
        // C should be more probable than D (3 vs 2)
        assert_eq!(preds[0].0, "C");
        assert!(preds[0].1 > preds[1].1);
    }

    #[test]
    fn test_importance_non_negative() {
        let predictor = make_ngram_predictor();

        let baseline = predictor
            .predict(&["A".to_string(), "B".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        // Remove A → prefix is ["B"]
        let without_a = predictor
            .predict(&["B".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        let imp_a = -(without_a - baseline);

        // Importance should be non-negative
        assert!(imp_a >= 0.0);
    }

    #[test]
    fn test_ablation_reduces_confidence() {
        let predictor = make_ngram_predictor();

        let baseline = predictor
            .predict(&["A".to_string(), "B".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        // Remove B → prefix is ["A"]
        let without_b = predictor
            .predict(&["A".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        // Removing B should reduce confidence (less context)
        assert!(without_b <= baseline);
    }

    #[test]
    fn test_importance_ordering() {
        let predictor = make_ngram_predictor();

        let baseline = predictor
            .predict(&["A".to_string(), "B".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        // Remove A → prefix is ["B"]
        let without_a = predictor
            .predict(&["B".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        // Remove B → prefix is ["A"]
        let without_b = predictor
            .predict(&["A".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        let imp_a = -(without_a - baseline);
        let imp_b = -(without_b - baseline);

        // A should be more important than B (provides more context)
        assert!(imp_a > imp_b);
    }

    #[test]
    fn test_single_activity_prefix() {
        let predictor = make_ngram_predictor();

        let baseline = predictor
            .predict(&["A".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        // With single activity, baseline is computed from that activity alone
        assert!(baseline >= 0.0);
    }

    #[test]
    fn test_empty_prefix_returns_error() {
        let predictor = make_ngram_predictor();
        let preds = predictor.predict(&[]);
        assert!(
            preds.is_empty(),
            "Empty prefix should return empty predictions"
        );
    }

    #[test]
    fn test_unknown_activity_has_zero_confidence() {
        let predictor = make_ngram_predictor();

        let preds = predictor.predict(&["UNKNOWN".to_string()]);
        let confidence = preds.first().map(|(_, p)| *p).unwrap_or(0.0);

        assert_eq!(
            confidence, 0.0,
            "Unknown activity should have zero confidence"
        );
    }

    #[test]
    fn test_importance_normalization() {
        let predictor = make_ngram_predictor();

        let baseline = predictor
            .predict(&["A".to_string(), "B".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        let mut importances = Vec::new();

        // Compute importance for A and B
        for pos in 0..2 {
            let prefix = vec!["A".to_string(), "B".to_string()];
            let ablated: Vec<String> = prefix
                .iter()
                .enumerate()
                .filter(|(i, _)| *i != pos)
                .map(|(_, s)| s.clone())
                .collect();

            let ablated_conf = if ablated.is_empty() {
                0.0
            } else {
                predictor
                    .predict(&ablated)
                    .first()
                    .map(|(_, p)| *p)
                    .unwrap_or(0.0)
            };

            let delta = ablated_conf - baseline;
            let importance = -delta;
            importances.push(importance);
        }

        // Normalize to sum to 1.0
        let total: f64 = importances.iter().sum();
        if total > 0.0 {
            let normalized: Vec<f64> = importances.iter().map(|v| v / total).collect();
            let sum_normalized: f64 = normalized.iter().sum();
            assert!(
                (sum_normalized - 1.0).abs() < 0.001,
                "Normalized importances should sum to 1.0"
            );
        }
    }

    #[test]
    fn test_ngram_order_affects_prediction() {
        let predictor = make_ngram_predictor();

        // With order-1: ["B"] should predict based on B alone
        let preds_order1 = predictor.predict(&["B".to_string()]);

        // With order-2: ["A", "B"] should predict based on A->B context
        let preds_order2 = predictor.predict(&["A".to_string(), "B".to_string()]);

        // Order-2 should have higher confidence (more context)
        let conf_order1 = preds_order1.first().map(|(_, p)| *p).unwrap_or(0.0);
        let conf_order2 = preds_order2.first().map(|(_, p)| *p).unwrap_or(0.0);

        assert!(conf_order2 >= conf_order1);
    }

    #[test]
    fn test_global_importance_aggregates_across_prefixes() {
        let predictor = make_ngram_predictor();

        // Simulate multiple prefixes
        let prefixes = vec![
            vec!["A".to_string()],
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string()],
        ];

        let mut activity_importance: std::collections::HashMap<String, (f64, usize)> =
            std::collections::HashMap::new();

        for prefix in &prefixes {
            let baseline = predictor
                .predict(prefix)
                .first()
                .map(|(_, p)| *p)
                .unwrap_or(0.0);

            for pos in 0..prefix.len() {
                let ablated: Vec<String> = prefix
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| *i != pos)
                    .map(|(_, s)| s.clone())
                    .collect();

                let ablated_conf = if ablated.is_empty() {
                    0.0
                } else {
                    predictor
                        .predict(&ablated)
                        .first()
                        .map(|(_, p)| *p)
                        .unwrap_or(0.0)
                };

                let importance = -(ablated_conf - baseline);
                let entry = activity_importance
                    .entry(prefix[pos].clone())
                    .or_insert((0.0, 0));
                entry.0 += importance;
                entry.1 += 1;
            }
        }

        // Both A and B should have some importance
        assert!(activity_importance.contains_key("A"));
        assert!(activity_importance.contains_key("B"));

        // Mean importance should be computed
        if let Some((total, count)) = activity_importance.get("A") {
            let mean = total / *count as f64;
            assert!(mean >= 0.0);
        }
    }

    #[test]
    fn test_ablated_empty_prefix_returns_zero() {
        let predictor = make_ngram_predictor();

        // Single activity prefix: removing it leaves empty
        let baseline = predictor
            .predict(&["A".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        // Ablated (empty) should return 0.0
        let ablated_preds = predictor.predict(&[]);
        let ablated_conf = ablated_preds.first().map(|(_, p)| *p).unwrap_or(0.0);

        assert_eq!(ablated_conf, 0.0);
    }

    #[test]
    fn test_prefix_with_repeated_activities() {
        let predictor = make_ngram_predictor();

        let baseline = predictor
            .predict(&["A".to_string(), "A".to_string(), "B".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        // Should not panic and should return some confidence
        assert!(baseline >= 0.0);
    }

    #[test]
    fn test_importance_delta_negative_for_important_features() {
        let predictor = make_ngram_predictor();

        let baseline = predictor
            .predict(&["A".to_string(), "B".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        let without_b = predictor
            .predict(&["A".to_string()])
            .first()
            .map(|(_, p)| *p)
            .unwrap_or(0.0);

        let delta = without_b - baseline;

        // Delta should be negative (removing B hurts prediction)
        assert!(delta <= 0.0);
    }

    #[test]
    fn test_mean_importance_computation() {
        let predictor = make_ngram_predictor();

        // Same activity appears in multiple positions
        let prefixes = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["A".to_string(), "C".to_string()],
        ];

        let mut a_total_importance = 0.0;
        let mut a_count = 0;

        for prefix in &prefixes {
            let baseline = predictor
                .predict(prefix)
                .first()
                .map(|(_, p)| *p)
                .unwrap_or(0.0);

            // Remove A at position 0
            let ablated = predictor
                .predict(&[prefix[1].clone()])
                .first()
                .map(|(_, p)| *p)
                .unwrap_or(0.0);
            let importance = -(ablated - baseline);

            a_total_importance += importance;
            a_count += 1;
        }

        let mean_a = a_total_importance / a_count as f64;
        assert!(mean_a >= 0.0, "Mean importance should be non-negative");
    }
}
