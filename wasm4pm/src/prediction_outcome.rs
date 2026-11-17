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
        return AnomalyScore {
            score: 0.0,
            raw_cost: 0.0,
            missing_edge_ratio: 0.0,
            steps: 0,
        };
    }
    let mut cost_sum = 0.0_f64;
    let mut missing = 0usize;
    for p in edge_probs {
        cost_sum += match *p {
            None => {
                missing += 1;
                missing_penalty_bits
            }
            Some(prob) if prob > 0.0 => -prob.log2(),
            Some(_) => {
                missing += 1;
                missing_penalty_bits
            }
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
        Some(StoredObject::DFG(dfg)) => {
            let total_edges: usize = dfg.edges.iter().map(|e| e.frequency).sum();
            let total_f = total_edges.max(1) as f64;

            // Project each consecutive activity pair to its model
            // probability, or `None` if absent.
            let edge_probs: Vec<Option<f64>> = if activities.len() < 2 {
                Vec::new()
            } else {
                activities
                    .windows(2)
                    .map(|w| {
                        dfg.edges
                            .iter()
                            .find(|e| e.from == w[0] && e.to == w[1])
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
        Some(_) => Err(crate::error::js_val("Handle is not a DFG")),
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

    get_or_init_state().with_event_log(log_handle, |log| {
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
            &serde_json::to_string(&result).map_err(|e| crate::error::js_val(&e.to_string()))?,
        ))
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
                    .map_or(1e-10, |(_, p)| *p);
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

/// Context key for the last-k activities of a prefix (unit separator joined).
fn context_key(prefix: &[String], k: usize) -> String {
    let start = prefix.len().saturating_sub(k);
    prefix[start..].join("\u{1f}")
}

/// Train P(outcome | prefix context) from completed traces and predict the
/// outcome (final activity) of a running prefix. Pure core — used by the
/// `predict_outcome_wasm` export and by native tests.
///
/// Contexts are the last k activities (k = 2, backoff to k = 1, then to the
/// global outcome prior); counts are Laplace-smoothed over the outcome
/// vocabulary. Deterministic: BTreeMap counting, name-ordered tie-break.
/// Trained outcome-model counts (context-keyed, Laplace-smoothed at predict
/// time). Split out of [`predict_outcome_from_log`] so holdout evaluation can
/// train once and score many prefixes.
pub struct OutcomeModel {
    prior: std::collections::BTreeMap<String, usize>,
    by_context: std::collections::BTreeMap<String, std::collections::BTreeMap<String, usize>>,
    trained_traces: usize,
}

/// Train the outcome model on a log (see [`predict_outcome_from_log`]).
pub fn train_outcome_model(
    log: &crate::models::EventLog,
    activity_key: &str,
) -> Result<OutcomeModel, String> {
    let mut prior: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    let mut by_context: std::collections::BTreeMap<String, std::collections::BTreeMap<String, usize>> =
        std::collections::BTreeMap::new();
    let mut trained_traces = 0usize;

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
        let Some(outcome) = acts.last().cloned() else {
            continue;
        };
        trained_traces += 1;
        *prior.entry(outcome.clone()).or_default() += 1;
        // Every proper prefix of the trace is a training context.
        for i in 1..acts.len() {
            let seen = &acts[..i];
            for k in 1..=2usize.min(seen.len()) {
                let key = format!("{k}\u{1e}{}", context_key(seen, k));
                *by_context
                    .entry(key)
                    .or_default()
                    .entry(outcome.clone())
                    .or_default() += 1;
            }
        }
    }

    if trained_traces == 0 {
        return Err("No traces with activities to train on".to_string());
    }
    Ok(OutcomeModel {
        prior,
        by_context,
        trained_traces,
    })
}

/// Predict the outcome distribution for a prefix from a trained
/// [`OutcomeModel`]. Returns the ranked distribution (best first).
pub fn predict_outcome_distribution(
    model: &OutcomeModel,
    prefix: &[String],
) -> Vec<(String, f64)> {
    // Backoff: k=2 context → k=1 context → global prior.
    let mut counts: &std::collections::BTreeMap<String, usize> = &model.prior;
    for k in [2usize, 1] {
        if !prefix.is_empty() && k <= prefix.len() {
            let key = format!("{k}\u{1e}{}", context_key(prefix, k));
            if let Some(c) = model.by_context.get(&key) {
                counts = c;
                break;
            }
        }
    }

    // Laplace smoothing over the outcome vocabulary.
    let total: usize = counts.values().sum();
    let denom = (total + model.prior.len()) as f64;
    let mut distribution: Vec<(String, f64)> = model
        .prior
        .keys()
        .map(|o| {
            let c = counts.get(o).copied().unwrap_or(0);
            (o.clone(), (c + 1) as f64 / denom)
        })
        .collect();
    distribution.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    distribution
}

pub fn predict_outcome_from_log(
    log: &crate::models::EventLog,
    activity_key: &str,
    prefix: &[String],
) -> Result<serde_json::Value, String> {
    let model = train_outcome_model(log, activity_key)?;

    // Backoff: k=2 context → k=1 context → global prior.
    let mut context_used = "prior";
    for k in [2usize, 1] {
        if !prefix.is_empty() && k <= prefix.len() {
            let key = format!("{k}\u{1e}{}", context_key(prefix, k));
            if model.by_context.contains_key(&key) {
                context_used = if k == 2 { "last_2" } else { "last_1" };
                break;
            }
        }
    }

    let distribution = predict_outcome_distribution(&model, prefix);
    let (outcome, probability) = distribution[0].clone();
    Ok(json!({
        "algorithm": "predict_outcome",
        "outcome": outcome,
        "probability": probability,
        "context_used": context_used,
        "distribution": distribution
            .iter()
            .map(|(o, p)| json!({"outcome": o, "p": p}))
            .collect::<Vec<_>>(),
        "trained_traces": model.trained_traces,
    }))
}

/// Honest holdout evaluation of the outcome predictor: train on the first
/// [`DEFAULT_TRAIN_RATIO`] of traces, score every proper prefix of every
/// held-out trace (predict the trace's final outcome from the prefix, compare
/// with the actual final activity). Top-1/2/3 accuracy + macro-F1 via
/// [`classification_metrics_from_ranked`].
///
/// Returns `Ok(None)` when the held-out side has fewer than
/// [`MIN_EVAL_SAMPLES`] scoring samples.
pub fn evaluate_outcome_holdout(
    log: &crate::models::EventLog,
    activity_key: &str,
) -> Result<Option<crate::ml::evaluation::HoldoutClassificationMetrics>, String> {
    use crate::ml::evaluation::{
        classification_metrics_from_ranked, DEFAULT_TRAIN_RATIO, MIN_EVAL_SAMPLES,
    };

    let (train_len, _) = prefix_split_traces(log.traces.len());
    let model = train_outcome_model(
        &crate::models::EventLog {
            attributes: log.attributes.clone(),
            traces: log.traces[..train_len].to_vec(),
        },
        activity_key,
    )?;

    let mut ranked: Vec<Vec<String>> = Vec::new();
    let mut truth: Vec<String> = Vec::new();
    for trace in &log.traces[train_len..] {
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
        if acts.len() < 2 {
            continue;
        }
        let actual = acts.last().cloned().expect("len >= 2 checked");
        for i in 1..acts.len() {
            let dist = predict_outcome_distribution(&model, &acts[..i]);
            ranked.push(dist.into_iter().map(|(o, _)| o).collect());
            truth.push(actual.clone());
        }
    }

    if ranked.len() < MIN_EVAL_SAMPLES {
        return Ok(None);
    }
    Ok(Some(classification_metrics_from_ranked(
        &ranked,
        &truth,
        train_len,
    )))
}

/// Prefix (chronological) trace split honoring
/// [`crate::ml::evaluation::DEFAULT_TRAIN_RATIO`].
fn prefix_split_traces(n: usize) -> (usize, usize) {
    crate::ml::evaluation::prefix_split(n, crate::ml::evaluation::DEFAULT_TRAIN_RATIO)
}

/// WASM export: train on the referenced event log and predict the outcome of
/// the given prefix. See [`predict_outcome_from_log`].
#[wasm_bindgen]
pub fn predict_outcome_wasm(
    eventlog_handle: &str,
    activity_key: &str,
    prefix_json: &str,
) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid prefix JSON: {}", e)))?;

    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let result = predict_outcome_from_log(log, activity_key, &prefix)
            .map_err(|e| crate::error::js_val(&e))?;
        Ok(crate::error::js_val(
            &serde_json::to_string(&result).map_err(|e| crate::error::js_val(&e.to_string()))?,
        ))
    })
}

/// Twin export of [`predict_outcome_wasm`] with honest evaluation: when
/// `evaluate` is true, the model is additionally trained on the first 80% of
/// traces and scored on held-out prefixes (top-1/2/3 accuracy + macro-F1),
/// reported under `"evaluation"`. With `evaluate: false` the output is
/// identical to [`predict_outcome_wasm`]. When the log is too small for
/// honest evaluation (`MIN_EVAL_SAMPLES`), `evaluation` is `null` and
/// `insufficient_data` is true.
#[wasm_bindgen]
pub fn predict_outcome_evaluated_wasm(
    eventlog_handle: &str,
    activity_key: &str,
    prefix_json: &str,
    evaluate: bool,
) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid prefix JSON: {}", e)))?;

    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let result = predict_outcome_from_log(log, activity_key, &prefix)
            .map_err(|e| crate::error::js_val(&e))?;

        let (evaluation, insufficient_data) = if evaluate {
            match evaluate_outcome_holdout(log, activity_key) {
                Ok(Some(m)) => (
                    Some(serde_json::to_value(&m).map_err(|e| {
                        crate::error::js_val(&e.to_string())
                    })?),
                    false,
                ),
                Ok(None) => (None, true),
                Err(e) => return Err(crate::error::js_val(&e)),
            }
        } else {
            (None, false)
        };

        let mut out = result;
        if let Some(eval) = evaluation {
            out["evaluation"] = eval;
            out["insufficient_data"] = json!(false);
        } else if insufficient_data {
            out["evaluation"] = json!(null);
            out["insufficient_data"] = json!(true);
        }

        Ok(crate::error::js_val(
            &serde_json::to_string(&out).map_err(|e| crate::error::js_val(&e.to_string()))?,
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn act_trace(acts: &[&str]) -> crate::models::Trace {
        let events = acts
            .iter()
            .map(|a| {
                let mut ev = crate::models::Event::new();
                ev.attributes.insert(
                    "concept:name".to_string(),
                    crate::models::AttributeValue::String(a.to_string()),
                );
                ev
            })
            .collect();
        crate::models::Trace {
            attributes: std::collections::BTreeMap::new(),
            events,
        }
    }

    /// Holdout evaluation on a learnable log: 20 traces ending in "End"
    /// (16 train / 4 test, 4 scoring prefixes per held-out trace = 16 ≥
    /// MIN_EVAL_SAMPLES — n_test = 16). Metrics must be well-formed; perfect
    /// structure gives top1 = 1.0.
    #[test]
    fn evaluate_outcome_holdout_on_learnable_log() {
        let traces: Vec<_> = (0..20)
            .map(|_| act_trace(&["A", "B", "C", "D", "End"]))
            .collect();
        let log = crate::models::EventLog {
            attributes: std::collections::BTreeMap::new(),
            traces,
        };
        let m = evaluate_outcome_holdout(&log, "concept:name")
            .expect("evaluation succeeds")
            .expect("enough samples");
        assert!((m.top1 - 1.0).abs() < 1e-9, "top1 = {}", m.top1);
        assert!((m.top2 - 1.0).abs() < 1e-9);
        assert!((m.macro_f1 - 1.0).abs() < 1e-9);
        assert_eq!(m.n_test, 16);
        assert_eq!(m.n_train, 16);
    }

    /// Honesty guard: below MIN_EVAL_SAMPLES scoring samples → None, not a
    /// number fabricated from a handful of prefixes.
    #[test]
    fn evaluate_outcome_holdout_refuses_small_logs() {
        let traces: Vec<_> = (0..4).map(|_| act_trace(&["A", "End"])).collect();
        let log = crate::models::EventLog {
            attributes: std::collections::BTreeMap::new(),
            traces,
        };
        let m = evaluate_outcome_holdout(&log, "concept:name").expect("evaluation succeeds");
        assert!(m.is_none(), "expected insufficient_data None");
    }

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
