//! Random Forest next-activity predictor — Upgrade 1
//!
//! Provides RF-backed prediction as an alternative to the n-gram Markov chain
//! predictor in `prediction.rs`.  The RF model captures non-linear dependencies
//! across 7 structural prefix features and is robust to sparse activity
//! vocabularies where n-gram counts are unreliable.
//!
//! ## WASM exports
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `build_rf_predictor` | Train RF model from an event log; returns model handle |
//! | `predict_next_activity_rf` | Predict next activity given a prefix (RF model) |
//! | `predict_next_activity_unified` | Auto-dispatch: n-gram or RF based on handle type |
//!
//! ## Feature schema (7 columns per training sample)
//!
//! | Col | Feature | Range |
//! |-----|---------|-------|
//! | 0 | `prefix_len / max_trace_len` | [0, 1] |
//! | 1 | `unique_activities_in_prefix / vocab_size` | [0, 1] |
//! | 2 | `last_activity_id` | [0, vocab_size) |
//! | 3 | `second_last_activity_id` (-1.0 when prefix len = 1) | [-1, vocab_size) |
//! | 4 | `elapsed_ms / max_case_duration_ms` (0.0 if no timestamps) | [0, 1] |
//! | 5 | `rework_count / prefix_len` (consecutive repeats) | [0, 1] |
//! | 6 | `prefix_len / trace_len` | [0, 1] |

#![cfg(feature = "miniml")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use crate::error::{codes, js_val, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue};
use crate::state::{get_or_init_state, StoredObject};

const N_FEATURES: usize = 7;
const RF_SNAPSHOT_TYPE: &str = "rf_predictor";

// ---------------------------------------------------------------------------
// Snapshot — serialised training data + hyperparameters stored at the handle
// ---------------------------------------------------------------------------

/// Serialisable snapshot of training data and hyperparameters.
///
/// We store the raw training data rather than the fitted model because
/// `RandomForestModel` is not (de)serialisable — trees contain arbitrary depth.
/// Re-fitting at prediction time adds a one-time cost but keeps the storage
/// format simple and avoids a custom serialiser for decision trees.
#[derive(Serialize, Deserialize)]
struct RfPredictorSnapshot {
    #[serde(rename = "type")]
    snapshot_type: String, // always RF_SNAPSHOT_TYPE
    /// Vocabulary: `vocab[activity_id]` = activity name string.
    vocab: Vec<String>,
    /// Flat row-major training matrix: `n_samples × N_FEATURES`.
    training_data: Vec<f64>,
    /// Next-activity ID (f64) for each training sample.
    training_labels: Vec<f64>,
    n_trees: usize,
    max_depth: usize,
    min_samples_split: usize,
    activity_key: String,
    n_samples: usize,
    n_features: usize, // always N_FEATURES (7)
    /// Maximum trace length observed at training time. Persisted so that
    /// inference can use the same normalisation as training for col0
    /// (`prefix_len / max_trace_len`). Falls back to the prefix length when
    /// missing ( snapshots) — see `predict_next_activity_rf`.
    #[serde(default)]
    max_trace_len: usize,
    /// Maximum case duration in milliseconds observed at training time.
    /// Persisted for inference-side temporal normalisation when callers
    /// supply elapsed_ms in a future extension. Always ≥ 1.0 to avoid ÷0.
    #[serde(default = "default_max_case_ms")]
    max_case_ms: f64,
}

fn default_max_case_ms() -> f64 {
    1.0
}

// ---------------------------------------------------------------------------
// Feature extraction helpers
// ---------------------------------------------------------------------------

/// Count consecutive repeated activities in a prefix (rework proxy).
fn count_consecutive_repeats(prefix: &[u32]) -> usize {
    if prefix.len() < 2 {
        return 0;
    }
    let mut count = 0usize;
    for w in prefix.windows(2) {
        if w[0] == w[1] {
            count += 1;
        }
    }
    count
}

/// Build a 7-element feature vector for a prefix of a trace.
///
/// * `prefix_ids`    — activity IDs for events `0..=i`
/// * `trace_len`     — total length of the source trace (events, not positions)
/// * `max_trace_len` — longest trace in the log
/// * `vocab_size`    — number of distinct activities
/// * `elapsed_ms`    — time from trace start to position i (0.0 if unavailable)
/// * `max_case_ms`   — longest observed case duration (1.0 fallback to avoid ÷0)
fn build_feature_vec(
    prefix_ids: &[u32],
    trace_len: usize,
    max_trace_len: usize,
    vocab_size: usize,
    elapsed_ms: f64,
    max_case_ms: f64,
) -> [f64; N_FEATURES] {
    let prefix_len = prefix_ids.len();

    // Col 0: prefix progress through trace length
    let col0 = if max_trace_len > 0 {
        prefix_len as f64 / max_trace_len as f64
    } else {
        0.0
    };

    // Col 1: activity diversity in prefix
    let unique: std::collections::HashSet<u32> = prefix_ids.iter().copied().collect();
    let col1 = if vocab_size > 0 {
        unique.len() as f64 / vocab_size as f64
    } else {
        0.0
    };

    // Col 2: last activity ID
    let col2 = prefix_ids.last().copied().unwrap_or(0) as f64;

    // Col 3: second-last activity ID (-1.0 when prefix has only 1 event)
    let col3 = if prefix_len >= 2 {
        prefix_ids[prefix_len - 2] as f64
    } else {
        -1.0
    };

    // Col 4: temporal progress
    let col4 = if max_case_ms > 0.0 {
        (elapsed_ms / max_case_ms).min(1.0)
    } else {
        0.0
    };

    // Col 5: rework rate (consecutive repeats in prefix)
    let col5 = if prefix_len > 0 {
        count_consecutive_repeats(prefix_ids) as f64 / prefix_len as f64
    } else {
        0.0
    };

    // Col 6: position within this trace
    let col6 = if trace_len > 0 {
        prefix_len as f64 / trace_len as f64
    } else {
        0.0
    };

    [col0, col1, col2, col3, col4, col5, col6]
}

// ---------------------------------------------------------------------------
// Function 1: build_rf_predictor
// ---------------------------------------------------------------------------

/// Train a Random Forest next-activity predictor from an event log.
///
/// Returns a handle string pointing to the stored `RfPredictorSnapshot`.
/// Pass the handle to `predict_next_activity_rf` or `predict_next_activity_unified`.
///
/// # Parameters
/// * `log_handle`    — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
/// * `activity_key`  — attribute key for activity names (e.g. `"concept:name"`)
/// * `timestamp_key` — attribute key for timestamps; pass `""` to disable temporal features
/// * `n_trees`       — number of decision trees (suggest 10–50 for WASM)
/// * `max_depth`     — maximum tree depth (suggest 5–10)
///
/// # Errors
/// Returns `{error: "Need at least 5 traces for RF predictor"}` when the log
/// provides fewer than 5 training samples (prefix positions).
#[wasm_bindgen]
pub fn build_rf_predictor(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    n_trees: usize,
    max_depth: usize,
) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    // ── Phase 1: extract training data from the EventLog ──────────────────
    let snapshot = state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            Some(_) => return Err(wasm_err(codes::INVALID_HANDLE, "Handle is not an EventLog")),
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No EventLog at handle '{log_handle}'"),
                ))
            }
        };

        // Build global vocabulary (activity name → u32 ID)
        let mut vocab_map: HashMap<String, u32> = HashMap::new();
        let mut vocab: Vec<String> = Vec::new();

        // Pre-pass: collect vocabulary and compute max_trace_len / max_case_ms
        let mut max_trace_len = 0usize;
        let mut max_case_ms = 1.0f64; // avoid ÷0

        for trace in &log.traces {
            let len = trace.events.len();
            if len > max_trace_len {
                max_trace_len = len;
            }

            // Interning pass — build vocab_map
            for event in &trace.events {
                if let Some(act) = event
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                {
                    if !vocab_map.contains_key(act) {
                        let id = vocab.len() as u32;
                        vocab_map.insert(act.to_owned(), id);
                        vocab.push(act.to_owned());
                    }
                }
            }

            // Temporal pass — compute case duration when timestamp_key is set.
            // Use min/max instead of first/last because XES events are not guaranteed
            // chronologically ordered. Using first()/last() can yield negative
            // durations or under-estimate `max_case_ms`, which then poisons col4
            // (elapsed_ms / max_case_ms) for every training sample.
            if !timestamp_key.is_empty() {
                let timestamps: Vec<i64> = trace
                    .events
                    .iter()
                    .filter_map(|e| match e.attributes.get(timestamp_key) {
                        Some(AttributeValue::Date(d)) => parse_timestamp_ms(d),
                        Some(AttributeValue::String(s)) => parse_timestamp_ms(s),
                        Some(AttributeValue::Int(ms)) => Some(*ms),
                        _ => None,
                    })
                    .collect();

                if timestamps.len() >= 2 {
                    let ts_min = *timestamps.iter().min().unwrap();
                    let ts_max = *timestamps.iter().max().unwrap();
                    let dur = (ts_max - ts_min) as f64;
                    if dur > max_case_ms {
                        max_case_ms = dur;
                    }
                }
            }
        }

        let vocab_size = vocab.len();
        let mut training_data: Vec<f64> = Vec::new();
        let mut training_labels: Vec<f64> = Vec::new();

        // Second pass: generate one sample per prefix position i (predicting event[i+1])
        for trace in &log.traces {
            // Encode events to u32 IDs
            let ids: Vec<u32> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                        .and_then(|act| vocab_map.get(act))
                        .copied()
                })
                .collect();

            let trace_len = ids.len();
            if trace_len < 2 {
                continue; // need at least one prefix + one next activity
            }

            // Extract timestamps for temporal feature (if enabled)
            let timestamps: Vec<i64> = if !timestamp_key.is_empty() {
                trace
                    .events
                    .iter()
                    .filter_map(|e| match e.attributes.get(timestamp_key) {
                        Some(AttributeValue::Date(d)) => parse_timestamp_ms(d),
                        Some(AttributeValue::String(s)) => parse_timestamp_ms(s),
                        Some(AttributeValue::Int(ms)) => Some(*ms),
                        _ => None,
                    })
                    .collect()
            } else {
                Vec::new()
            };

            // Anchor on the minimum timestamp (case start) rather than the first
            // event, because events are not guaranteed chronologically ordered.
            // Clamp negative values to 0 so col4 stays non-negative even if the
            // i-th event happens to predate the case's earliest event.
            let trace_start_ms = timestamps.iter().min().copied().unwrap_or(0);

            for i in 0..trace_len - 1 {
                let prefix_ids = &ids[0..=i];

                let elapsed_ms = if !timestamps.is_empty() && i < timestamps.len() {
                    ((timestamps[i] - trace_start_ms) as f64).max(0.0)
                } else {
                    0.0
                };

                let features = build_feature_vec(
                    prefix_ids,
                    trace_len,
                    max_trace_len,
                    vocab_size,
                    elapsed_ms,
                    max_case_ms,
                );

                training_data.extend_from_slice(&features);
                training_labels.push(ids[i + 1] as f64);
            }
        }

        let n_samples = training_labels.len();

        if n_samples < 5 {
            // Return structured error as JSON string for JS compatibility
            let err_json = r#"{"error":"Need at least 5 traces for RF predictor"}"#;
            return Err(js_val(err_json));
        }

        Ok(RfPredictorSnapshot {
            snapshot_type: RF_SNAPSHOT_TYPE.to_owned(),
            vocab,
            training_data,
            training_labels,
            n_trees: n_trees.max(1),
            max_depth: max_depth.max(1),
            min_samples_split: 2,
            activity_key: activity_key.to_owned(),
            n_samples,
            n_features: N_FEATURES,
            max_trace_len,
            max_case_ms,
        })
    })?;

    // ── Phase 2: serialise and store ──────────────────────────────────────
    let json = serde_json::to_string(&snapshot).map_err(|e| {
        wasm_err(
            codes::INTERNAL_ERROR,
            format!("RF snapshot serialisation failed: {}", e),
        )
    })?;

    let handle = state.store_object(StoredObject::JsonString(json))?;
    Ok(js_val(&handle))
}

// ---------------------------------------------------------------------------
// Function 2: predict_next_activity_rf
// ---------------------------------------------------------------------------

/// Predict the most likely next activities given a prefix and an RF model handle.
///
/// Returns a JSON string (same format as `predict_next_activity`):
/// ```json
/// [{"activity": "Approve", "probability": 1.0}]
/// ```
///
/// # Notes
/// The RF model is re-fitted from stored training data on each call.  This is
/// intentional — `RandomForestModel` is not serialisable.  For latency-sensitive
/// workloads, cache the fitted model on the JS side.
///
/// Probabilities are per-tree vote fractions: each tree votes for one class and the
/// fraction of trees voting for each class is returned as its probability.  Results
/// are sorted by probability descending so the top prediction is first in the array.
#[wasm_bindgen]
pub fn predict_next_activity_rf(model_handle: &str, prefix_json: &str) -> Result<JsValue, JsValue> {
    // ── 1. Parse prefix ───────────────────────────────────────────────────
    let prefix_names: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| wasm_err(codes::INVALID_INPUT, format!("Invalid prefix JSON: {}", e)))?;

    // ── 2. Load snapshot ──────────────────────────────────────────────────
    let state = get_or_init_state();

    let result_json = state.with_object(model_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not an RF predictor (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No model at handle '{model_handle}'"),
                ))
            }
        };

        let snapshot: RfPredictorSnapshot = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Snapshot deserialisation failed: {}", e),
            )
        })?;

        if snapshot.snapshot_type != RF_SNAPSHOT_TYPE {
            return Err(wasm_err(
                codes::INVALID_HANDLE,
                format!(
                    "Expected type '{}', got '{}'",
                    RF_SNAPSHOT_TYPE, snapshot.snapshot_type
                ),
            ));
        }

        // ── 3. Encode prefix ─────────────────────────────────────────────
        let vocab_map: HashMap<&str, u32> = snapshot
            .vocab
            .iter()
            .enumerate()
            .map(|(i, name)| (name.as_str(), i as u32))
            .collect();

        let prefix_ids: Vec<u32> = prefix_names
            .iter()
            .filter_map(|name| vocab_map.get(name.as_str()).copied())
            .collect();

        if prefix_ids.is_empty() {
            // Prefix contains no known activities — return empty predictions
            return Ok("[]".to_owned());
        }

        // ── 4. Build query feature vector ────────────────────────────────
        // For inference we don't know the full trace length, so col6 (position
        // within trace) is necessarily underdetermined. But col0 (prefix progress
        // through the *log's* longest trace) is well-defined when we persisted
        // `max_trace_len` at training time — using prefix_len here would force
        // col0 = 1.0 at every inference call, drifting away from the training
        // distribution.  snapshots (max_trace_len == 0) fall back to the
        // conservative pre-fix behaviour.
        let vocab_size = snapshot.vocab.len();
        let prefix_len = prefix_ids.len();
        let train_max_trace_len = if snapshot.max_trace_len > 0 {
            snapshot.max_trace_len
        } else {
            prefix_len.max(1)
        };
        // trace_len for col6: we still don't know the full trace at inference,
        // so use prefix_len. col6 will therefore equal prefix_len/prefix_len = 1.0,
        // documented behaviour: col6 means "we're observing the current tip".
        let query_features = build_feature_vec(
            &prefix_ids,
            prefix_len,          // col6 denominator
            train_max_trace_len, // col0 denominator (from training)
            vocab_size,
            0.0, // temporal feature unavailable without timestamps at inference
            snapshot.max_case_ms.max(1.0),
        );

        // ── 5. Re-fit RF model from stored training data ──────────────────
        use miniml::random_forest_impl;

        let model = random_forest_impl(
            &snapshot.training_data,
            snapshot.n_features,
            &snapshot.training_labels,
            snapshot.n_trees,
            snapshot.max_depth,
            snapshot.min_samples_split,
            true, // is_classifier
        )
        .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("RF fit failed: {}", e)))?;

        // ── 6. Predict with per-tree vote fractions ──────────────────────
        // predict_proba_single returns [class_id, fraction, class_id, fraction, ...]
        // sorted by class_id.  We map class IDs back to activity names and sort by
        // vote fraction descending so the top prediction is first.
        let proba_flat = model.predict_proba_single(&query_features);

        if proba_flat.is_empty() {
            return Ok("[]".to_owned());
        }

        let mut candidates: Vec<serde_json::Value> = proba_flat
            .chunks_exact(2)
            .filter_map(|chunk| {
                let class_id = chunk[0].round() as usize;
                let fraction = chunk[1];
                let name = snapshot.vocab.get(class_id)?.clone();
                Some(serde_json::json!({"activity": name, "probability": fraction}))
            })
            .collect();

        // Sort descending by probability so top prediction is first
        candidates.sort_by(|a, b| {
            let pa = a["probability"].as_f64().unwrap_or(0.0);
            let pb = b["probability"].as_f64().unwrap_or(0.0);
            pb.partial_cmp(&pa).unwrap_or(std::cmp::Ordering::Equal)
        });

        let result_arr = serde_json::Value::Array(candidates);

        serde_json::to_string(&result_arr).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Result serialisation failed: {}", e),
            )
        })
    })?;

    Ok(js_val(&result_json))
}

// ---------------------------------------------------------------------------
// Function 3: predict_next_activity_unified
// ---------------------------------------------------------------------------

/// Unified dispatcher: routes to n-gram or RF predictor based on handle type.
///
/// * If the handle holds an `NGramPredictor` → delegates to `predict_next_activity`
/// * If the handle holds a `JsonString` whose `type` field is `"rf_predictor"` →
///   delegates to `predict_next_activity_rf`
/// * Otherwise returns an error
///
/// This lets callers switch between models without changing call sites.
#[wasm_bindgen]
pub fn predict_next_activity_unified(
    model_handle: &str,
    prefix_json: &str,
) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    // Determine which model type is stored at this handle
    let model_type = state.with_object(model_handle, |obj| {
        match obj {
            Some(StoredObject::NGramPredictor(_)) => Ok("ngram"),
            Some(StoredObject::JsonString(s)) => {
                // Quick prefix check — avoid full deserialisation just to dispatch
                if s.contains(r#""type":"rf_predictor""#) || s.contains(r#""type": "rf_predictor""#)
                {
                    Ok("rf")
                } else {
                    Err(wasm_err(
                        codes::INVALID_HANDLE,
                        "Handle is a JsonString but not an RF predictor snapshot",
                    ))
                }
            }
            Some(_) => Err(wasm_err(
                codes::INVALID_HANDLE,
                "Handle is not a recognisable predictor type",
            )),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("No object at handle '{model_handle}'"),
            )),
        }
    })?;

    match model_type {
        "ngram" => {
            // Delegate to the public n-gram prediction function
            crate::prediction::predict_next_activity(model_handle, prefix_json)
        }
        "rf" => predict_next_activity_rf(model_handle, prefix_json),
        _ => unreachable!("model_type can only be 'ngram' or 'rf'"),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a tiny prefix and verify feature vector invariants (Rank 1 oracle).
    #[test]
    fn test_feature_vec_invariants() {
        // prefix = [A(0), B(1), A(0)]  — one consecutive repeat (A→B not repeat, B→A not repeat)
        // Actually A(0),B(1),A(0): windows are (0,1) and (1,0) — zero consecutive repeats
        let prefix = [0u32, 1u32, 0u32];
        let features = build_feature_vec(&prefix, 5, 10, 3, 500.0, 1000.0);

        // All features must be finite
        for (i, &f) in features.iter().enumerate() {
            assert!(f.is_finite(), "feature[{i}] is not finite: {f}");
        }

        // Col 0: 3/10 = 0.3
        assert!(
            (features[0] - 0.3).abs() < 1e-10,
            "col0 expected 0.3, got {}",
            features[0]
        );

        // Col 1: 2 unique / 3 vocab = 0.666…
        assert!(
            (features[1] - 2.0 / 3.0).abs() < 1e-10,
            "col1 expected 2/3, got {}",
            features[1]
        );

        // Col 2: last activity = 0
        assert_eq!(features[2], 0.0, "col2 should be last activity id");

        // Col 3: second-last activity = 1
        assert_eq!(features[3], 1.0, "col3 should be second-last activity id");

        // Col 4: 500/1000 = 0.5
        assert!(
            (features[4] - 0.5).abs() < 1e-10,
            "col4 expected 0.5, got {}",
            features[4]
        );

        // Col 5: 0 consecutive repeats / 3 = 0.0
        assert_eq!(
            features[5], 0.0,
            "col5 should be 0 (no consecutive repeats)"
        );

        // Col 6: 3/5 = 0.6
        assert!(
            (features[6] - 0.6).abs() < 1e-10,
            "col6 expected 0.6, got {}",
            features[6]
        );
    }

    #[test]
    fn test_feature_vec_single_event_prefix() {
        let prefix = [2u32];
        let features = build_feature_vec(&prefix, 4, 8, 5, 0.0, 0.0);

        // Col 3: second-last should be -1.0 for prefix of length 1
        assert_eq!(
            features[3], -1.0,
            "col3 should be -1.0 for single-event prefix"
        );

        // Col 4: max_case_ms = 0 → col4 = 0.0
        assert_eq!(features[4], 0.0, "col4 should be 0 when max_case_ms=0");
    }

    #[test]
    fn test_consecutive_repeats() {
        assert_eq!(count_consecutive_repeats(&[]), 0);
        assert_eq!(count_consecutive_repeats(&[0]), 0);
        assert_eq!(count_consecutive_repeats(&[0, 0]), 1);
        assert_eq!(count_consecutive_repeats(&[0, 1, 0]), 0);
        assert_eq!(count_consecutive_repeats(&[0, 0, 0]), 2);
        assert_eq!(count_consecutive_repeats(&[0, 0, 1, 1]), 2);
    }

    #[test]
    fn test_snapshot_round_trip() {
        let snapshot = RfPredictorSnapshot {
            snapshot_type: RF_SNAPSHOT_TYPE.to_owned(),
            vocab: vec!["A".to_owned(), "B".to_owned(), "C".to_owned()],
            training_data: vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
            training_labels: vec![1.0],
            n_trees: 10,
            max_depth: 5,
            min_samples_split: 2,
            activity_key: "concept:name".to_owned(),
            n_samples: 1,
            n_features: N_FEATURES,
            max_trace_len: 12,
            max_case_ms: 86_400_000.0,
        };

        let json = serde_json::to_string(&snapshot).expect("serialise");
        let back: RfPredictorSnapshot = serde_json::from_str(&json).expect("deserialise");

        assert_eq!(back.snapshot_type, RF_SNAPSHOT_TYPE);
        assert_eq!(back.vocab, snapshot.vocab);
        assert_eq!(back.n_trees, 10);
        assert_eq!(back.n_features, N_FEATURES);
        assert_eq!(back.max_trace_len, 12);
        assert!((back.max_case_ms - 86_400_000.0).abs() < 1e-9);
        // Verify the JSON contains the expected type field for the unified dispatcher
        assert!(json.contains(r#""type":"rf_predictor""#));
    }

    /// Rank-1:  snapshots without `max_trace_len`/`max_case_ms` must
    /// deserialise; max_case_ms must default to 1.0 (not 0.0 → ÷0 in col4).
    #[test]
    fn test_snapshot_defaults() {
        let snapshot_json = r#"{"type":"rf_predictor","vocab":["A","B"],
            "training_data":[0.0,0.0,0.0,0.0,0.0,0.0,0.0],"training_labels":[0.0],
            "n_trees":3,"max_depth":3,"min_samples_split":2,
            "activity_key":"concept:name","n_samples":1,"n_features":7}"#;
        let snap: RfPredictorSnapshot = serde_json::from_str().expect("deserialise");
        assert_eq!(snap.max_trace_len, 0);
        assert!((snap.max_case_ms - 1.0).abs() < 1e-9);
    }

    /// Rank-2 domain contract: max_case_ms must use `max - min`, not
    /// `last - first` (depends on storage order, can yield negatives).
    /// This mirrors the per-trace pass in `build_rf_predictor`.
    #[test]
    fn test_max_case_ms_unsorted_timestamps() {
        // Unsorted: 5000, 1000, 3000 — first - last = +2000 (misleading),
        // max - min = 4000 (correct).
        let ts: Vec<i64> = vec![5000, 1000, 3000];
        let span = |v: &[i64]| (*v.iter().max().unwrap() - *v.iter().min().unwrap()) as f64;
        let buggy = (ts.last().unwrap() - ts.first().unwrap()) as f64;
        assert_eq!(span(&ts), 4000.0);
        assert_eq!(
            buggy, -2000.0,
            "buggy path produces negative span on this reordering"
        );
        // Metamorphic R3: permutation invariance.
        assert_eq!(span(&ts), span(&[1000, 3000, 5000]));
    }

    /// Rank-1 invariant: col0 must normalise by the *training* longest trace,
    /// not by prefix length. Pre-fix code forced col0 = 1.0 at every inference.
    #[test]
    fn test_inference_col0_uses_training_max_trace_len() {
        let prefix = [0u32, 1u32];
        let f_post = build_feature_vec(&prefix, prefix.len(), 10, 3, 0.0, 1.0);
        let f_pre = build_feature_vec(&prefix, prefix.len(), prefix.len(), 3, 0.0, 1.0);
        assert!(
            (f_post[0] - 0.2).abs() < 1e-10,
            "post-fix col0 = 2/10 = 0.2"
        );
        assert_eq!(f_pre[0], 1.0, "pre-fix col0 collapses to 1.0 (drift bug)");
    }

    #[test]
    fn test_feature_vec_temporal_clamping() {
        // elapsed > max_case_ms → col4 should clamp to 1.0
        let prefix = [0u32, 1u32];
        let features = build_feature_vec(&prefix, 3, 5, 4, 2000.0, 1000.0);
        assert_eq!(
            features[4], 1.0,
            "col4 should clamp to 1.0 when elapsed > max"
        );
    }
}
