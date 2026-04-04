/// Priority 6 — N-gram next-activity predictor.
///
/// Builds a predictive model from the traces in an event log.  Given a
/// sequence of recent activities (the prefix), the model returns the most
/// likely next activities with probabilities.
///
/// Model: n-gram Markov chain where n=2 means "bigram" (predict from the
/// last 1 activity), n=3 means "trigram" (predict from the last 2), etc.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::NGramPredictor;
use serde_json::json;

/// Build an n-gram predictor from an event log.
///
/// `n` controls how many preceding activities are used as context (default 2).
///
/// Returns a handle to the predictor stored in state.
///
/// ```javascript
/// const predHandle = pm.build_ngram_predictor(logHandle, 'concept:name', 2);
/// const preds = JSON.parse(pm.predict_next_activity(predHandle,
///                 JSON.stringify(['Register', 'Check'])));
/// ```
#[wasm_bindgen]
pub fn build_ngram_predictor(
    log_handle: &str,
    activity_key: &str,
    n: usize,
) -> Result<JsValue, JsValue> {
    let n = n.max(2); // minimum bigram
    let predictor = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut counts: std::collections::HashMap<Vec<String>, std::collections::HashMap<String, usize>> =
                std::collections::HashMap::new();

            for trace in &log.traces {
                let acts: Vec<String> = trace.events.iter()
                    .filter_map(|e| e.attributes.get(activity_key)
                        .and_then(|v| v.as_string())
                        .map(str::to_owned))
                    .collect();

                if acts.len() < 2 { continue; }

                // For each position, record prefix → next_activity
                for i in 0..acts.len() - 1 {
                    let context_len = (n - 1).min(i + 1);
                    let prefix: Vec<String> = acts[i + 1 - context_len..=i].to_vec();
                    let next = acts[i + 1].clone();
                    *counts.entry(prefix).or_default().entry(next).or_insert(0) += 1;
                }
            }

            Ok(NGramPredictor { n, counts })
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    let handle = get_or_init_state().store_object(StoredObject::NGramPredictor(predictor))?;
    Ok(JsValue::from_str(&handle))
}

/// Predict the most likely next activities given a prefix sequence.
///
/// `prefix_json` — JSON array of activity strings (recent history).
///
/// Returns a JSON string:
/// ```json
/// [
///   {"activity": "Approve", "probability": 0.75},
///   {"activity": "Reject",  "probability": 0.25}
/// ]
/// ```
/// Sorted descending by probability.  Returns empty array if the prefix is
/// not in the model.
#[wasm_bindgen]
pub fn predict_next_activity(
    predictor_handle: &str,
    prefix_json: &str,
) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid prefix JSON: {}", e)))?;

    let result_json = get_or_init_state().with_object(predictor_handle, |obj| match obj {
        Some(StoredObject::NGramPredictor(predictor)) => {
            let predictions = predictor.predict(&prefix);
            let arr: Vec<serde_json::Value> = predictions.iter()
                .map(|(act, prob)| json!({"activity": act, "probability": prob}))
                .collect();
            serde_json::to_string(&arr).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an NGramPredictor")),
        None => Err(JsValue::from_str("NGramPredictor handle not found")),
    })?;

    Ok(JsValue::from_str(&result_json))
}

/// Score how likely a complete trace is according to the n-gram model.
///
/// Returns log-probability (negative; higher = more likely).
/// Returns 0.0 for empty traces.
#[wasm_bindgen]
pub fn score_trace_likelihood(
    predictor_handle: &str,
    activities_json: &str,
) -> Result<JsValue, JsValue> {
    let acts: Vec<String> = serde_json::from_str(activities_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid activities JSON: {}", e)))?;

    get_or_init_state().with_object(predictor_handle, |obj| match obj {
        Some(StoredObject::NGramPredictor(predictor)) => {
            if acts.len() < 2 {
                return Ok(JsValue::from_f64(0.0));
            }
            let mut log_prob = 0.0_f64;
            for i in 0..acts.len() - 1 {
                let context_len = (predictor.n - 1).min(i + 1);
                let prefix = acts[i + 1 - context_len..=i].to_vec();
                let preds = predictor.predict(&prefix);
                let prob = preds.iter()
                    .find(|(a, _)| a == &acts[i + 1])
                    .map(|(_, p)| *p)
                    .unwrap_or(1e-10);
                log_prob += prob.ln();
            }
            Ok(JsValue::from_f64(log_prob))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an NGramPredictor")),
        None => Err(JsValue::from_str("NGramPredictor handle not found")),
    })
}
