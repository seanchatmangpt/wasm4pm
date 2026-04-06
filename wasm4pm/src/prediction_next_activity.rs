/// Next-Activity Prediction — Van der Aalst perspective
///
/// In process mining, "next activity prediction" answers the question:
/// *Given the activities observed so far in a running case (the prefix),
/// which activity is most likely to occur next?*
///
/// This module consolidates all WASM-exported functions for next-activity
/// prediction, including:
///
/// - **Top-k prediction** (`predict_next_k`): returns the k most probable
///   successor activities with probabilities and a confidence/entropy score.
/// - **Beam-search paths** (`predict_beam_paths`): explores the most likely
///   future continuations of a case prefix using beam search over the n-gram
///   transition model.
///
/// Both functions operate on an `NGramPredictor` handle that was previously
/// built via `build_ngram_predictor`.  The predictor encodes an n-gram Markov
/// chain learned from completed traces — a lightweight but effective baseline
/// that Van der Aalst and colleagues use as a reference in predictive process
/// monitoring research.

use wasm_bindgen::prelude::*;
use serde_json::json;

use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;

/// Return the top-k most likely next activities for a given prefix.
///
/// `model_handle` — handle returned by `build_ngram_predictor`.
/// `prefix_json`  — JSON array of activity name strings, e.g. `["A","B"]`.
/// `k`            — how many candidates to return.
///
/// Returns a JSON object:
/// ```json
/// {
///   "activities":    ["C", "D"],
///   "probabilities": [0.75, 0.25],
///   "confidence":    0.75,
///   "entropy":       0.56
/// }
/// ```
/// `confidence` is the probability of the top-1 prediction.
/// `entropy` is the normalised Shannon entropy of the distribution (0 = certain,
/// 1 = uniform).
#[wasm_bindgen]
pub fn predict_next_k(
    model_handle: &str,
    prefix_json: &str,
    k: usize,
) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid prefix JSON: {}", e)))?;

    get_or_init_state().with_object(model_handle, |obj| match obj {
        Some(StoredObject::NGramPredictor(predictor)) => {
            // Get full ranked predictions from the predictor
            let all_preds = predictor.predict(&prefix);
            let top_k: Vec<_> = all_preds.into_iter().take(k).collect();

            let activities: Vec<&str> = top_k.iter().map(|(a, _)| a.as_str()).collect();
            let probabilities: Vec<f64> = top_k.iter().map(|(_, p)| *p).collect();

            let confidence = probabilities.first().copied().unwrap_or(0.0);
            let entropy_val = normalised_entropy(&probabilities);

            let result = json!({
                "activities": activities,
                "probabilities": probabilities,
                "confidence": confidence,
                "entropy": entropy_val,
            });
            to_js(&result)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an NGramPredictor")),
        None => Err(JsValue::from_str("NGramPredictor handle not found")),
    })
}

/// Beam-search future paths from a case prefix.
///
/// `model_handle` — handle returned by `build_ngram_predictor`.
/// `prefix_json`  — JSON array of activity name strings.
/// `beam_width`   — number of beams (candidate paths) to keep at each step.
/// `max_steps`    — maximum number of future activities to predict.
///
/// Returns a JSON array of paths:
/// ```json
/// [
///   { "sequence": ["C","D","E"], "probability": 0.42, "length": 3 },
///   { "sequence": ["C","F"],     "probability": 0.18, "length": 2 }
/// ]
/// ```
/// Paths are sorted descending by probability.
#[wasm_bindgen]
pub fn predict_beam_paths(
    model_handle: &str,
    prefix_json: &str,
    beam_width: usize,
    max_steps: usize,
) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid prefix JSON: {}", e)))?;

    get_or_init_state().with_object(model_handle, |obj| match obj {
        Some(StoredObject::NGramPredictor(predictor)) => {
            let paths = beam_search_on_ngram(predictor, &prefix, beam_width, max_steps);
            to_js(&paths)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an NGramPredictor")),
        None => Err(JsValue::from_str("NGramPredictor handle not found")),
    })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Shannon entropy normalised to [0, 1].
fn normalised_entropy(probs: &[f64]) -> f64 {
    if probs.is_empty() {
        return 0.0;
    }
    let ent: f64 = probs
        .iter()
        .filter(|&&p| p > 0.0)
        .map(|&p| -p * p.ln())
        .sum();
    let max_ent = (probs.len() as f64).ln();
    if max_ent > 0.0 { ent / max_ent } else { 0.0 }
}

/// Beam search over a string-keyed `NGramPredictor`.
///
/// Each beam is a `(Vec<String>, f64)` — the full activity sequence (prefix +
/// predicted suffix) and its cumulative probability.  At every step we expand
/// each beam by querying `predictor.predict(...)` and keep the top
/// `beam_width` candidates.
fn beam_search_on_ngram(
    predictor: &crate::models::NGramPredictor,
    prefix: &[String],
    beam_width: usize,
    max_steps: usize,
) -> Vec<serde_json::Value> {
    // Each beam: (full_sequence, cumulative_probability)
    let mut beams: Vec<(Vec<String>, f64)> = vec![(prefix.to_vec(), 1.0)];

    for _ in 0..max_steps {
        let mut next_beams: Vec<(Vec<String>, f64)> = Vec::new();

        for (seq, prob) in &beams {
            let preds = predictor.predict(seq);
            if preds.is_empty() {
                // Dead end — keep beam as-is so it appears in results
                next_beams.push((seq.clone(), *prob));
                continue;
            }
            for (act, trans_prob) in &preds {
                let new_prob = prob * trans_prob;
                let mut new_seq = seq.clone();
                new_seq.push(act.clone());
                next_beams.push((new_seq, new_prob));
            }
        }

        if next_beams.is_empty() {
            break;
        }

        next_beams.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        // Deduplicate beams that are identical (keep highest prob)
        beams = next_beams.into_iter().take(beam_width).collect();
    }

    // Build output — only include the predicted suffix (after the original prefix)
    let prefix_len = prefix.len();
    beams
        .into_iter()
        .filter(|(seq, _)| seq.len() > prefix_len) // exclude empty extensions
        .map(|(seq, prob)| {
            let suffix: Vec<&str> = seq[prefix_len..].iter().map(|s| s.as_str()).collect();
            json!({
                "sequence": suffix,
                "probability": prob,
                "length": suffix.len(),
            })
        })
        .collect()
}
