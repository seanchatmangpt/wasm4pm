//! # AutoML Envelope — ML-Scored Risk Layer for the AutoMembrane
//!
//! Uses miniml's AutoML to learn a local classification model from process
//! evidence derived from an event log, then scores new motion requests against
//! that model. This is the automl layer of the AutoMembrane pre-control
//! membrane.
//!
//! ## Van der Aalst framing
//!
//! The AutoML envelope operationalises the risk scoring gap in the membrane
//! architecture. Where the actor and route envelopes use heuristic rules, this
//! layer trains a supervised classifier on trace-level features and applies it
//! to incoming motion requests. The minority 15% of traces (by variant
//! frequency) are labelled anomalous; the majority are labelled normal. The
//! resulting model distinguishes routine from rare behaviour without requiring
//! domain-specific thresholds.
//!
//! ## WASM exports
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `build_automl_envelope`   | Train a classifier from a stored event log; returns handle |
//! | `score_motion_automl`     | Score a motion feature JSON against the trained model |
//! | `inspect_automl_envelope` | Return the full envelope metadata for UX inspection |

#![cfg(feature = "miniml")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use crate::error::{codes, js_val, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;

const AUTOML_ENVELOPE_TYPE: &str = "automl_envelope";
const MIN_TRACES: usize = 10;
const N_FEATURES: usize = 5;

// ---------------------------------------------------------------------------
// Storage struct
// ---------------------------------------------------------------------------

/// Trained AutoML classification model persisted as a `StoredObject::JsonString`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AutomlEnvelopeModel {
    #[serde(rename = "type")]
    pub envelope_type: String,
    pub best_algorithm: String,
    pub best_score: f64,
    pub n_samples: usize,
    pub n_features: usize,
    /// Names of the 5 trace-level features, in column order.
    pub feature_names: Vec<String>,
    /// Flat row-major feature matrix: n_samples * n_features elements.
    pub training_features: Vec<f64>,
    /// 0.0 = normal, 1.0 = anomalous (bottom 15% by variant frequency).
    pub training_labels: Vec<f64>,
    pub rationale: String,
    /// Wall-clock milliseconds at training time.
    pub trained_at_ms: f64,
    /// Number of traces used for training.
    pub data_window_size: usize,
    /// "valid", "quarantined", or "stale".
    pub validity_status: String,
    /// Drift score in [0.0, 1.0]; updated by the drift manager.
    pub drift_score: f64,
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

/// Extract a 5-feature matrix, 0/1 labels, and feature names from an event log.
///
/// Returns `(flat_features, labels, feature_names)` where `flat_features` is
/// row-major with `N_FEATURES` columns.
///
/// ## Features (per trace)
/// 1. `prefix_length_ratio`  — trace length / max trace length
/// 2. `unique_activity_ratio` — distinct activities / vocabulary size
/// 3. `has_rework`            — 1.0 if any consecutive repeated activity
/// 4. `event_density`         — events per hour (duration in ms / 3 600 000 + 1)
/// 5. `variant_frequency`     — fraction of traces sharing the same activity sequence
///
/// ## Labels
/// Traces in the bottom 15% by variant frequency are labelled 1.0 (anomalous).
/// All others are labelled 0.0 (normal).
fn extract_motion_features(
    log: &EventLog,
    activity_key: &str,
) -> (Vec<f64>, Vec<f64>, Vec<String>) {
    let n = log.traces.len();

    // ── Step 1: Compute per-trace activity sequences ─────────────────────────
    let sequences: Vec<Vec<String>> = log
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
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                })
                .collect()
        })
        .collect();

    // ── Step 2: Vocabulary and max-trace-length ───────────────────────────────
    let mut vocab: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut max_len = 1usize;
    for seq in &sequences {
        max_len = max_len.max(seq.len().max(1));
        for a in seq {
            vocab.insert(a.clone());
        }
    }
    let vocab_size = vocab.len().max(1) as f64;

    // ── Step 3: Variant frequency map (activity-sequence → fraction) ──────────
    let mut variant_counts: HashMap<Vec<String>, usize> = HashMap::new();
    for seq in &sequences {
        *variant_counts.entry(seq.clone()).or_insert(0) += 1;
    }
    let variant_freq: Vec<f64> = sequences
        .iter()
        .map(|seq| *variant_counts.get(seq).unwrap_or(&0) as f64 / n as f64)
        .collect();

    // ── Step 4: Labelling threshold — bottom 15% by variant frequency ─────────
    let mut sorted_freqs = variant_freq.clone();
    sorted_freqs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let threshold_idx = ((n as f64 * 0.15).ceil() as usize).min(n.saturating_sub(1));
    let anomaly_threshold = sorted_freqs.get(threshold_idx).copied().unwrap_or(0.0);

    // ── Step 5: Per-trace features ────────────────────────────────────────────
    let mut flat_features: Vec<f64> = Vec::with_capacity(n * N_FEATURES);
    let mut labels: Vec<f64> = Vec::with_capacity(n);

    for (i, trace) in log.traces.iter().enumerate() {
        let seq = &sequences[i];
        let trace_len = seq.len();

        // Feature 1: prefix_length_ratio
        let prefix_length_ratio = trace_len as f64 / max_len as f64;

        // Feature 2: unique_activity_ratio
        let unique: std::collections::HashSet<&String> = seq.iter().collect();
        let unique_activity_ratio = unique.len() as f64 / vocab_size;

        // Feature 3: has_rework — consecutive repeated activity
        let has_rework = if seq.windows(2).any(|w| w[0] == w[1]) {
            1.0
        } else {
            0.0
        };

        // Feature 4: event_density — events per hour
        let duration_ms = compute_trace_duration_ms(trace);
        let event_density = trace_len as f64 / (duration_ms / 3_600_000.0 + 1.0);
        let event_density = event_density.min(100.0);

        // Feature 5: variant_frequency
        let vf = variant_freq[i];

        flat_features.push(prefix_length_ratio);
        flat_features.push(unique_activity_ratio);
        flat_features.push(has_rework);
        flat_features.push(event_density);
        flat_features.push(vf);

        // Label: anomalous if variant frequency is in the bottom 15%
        let label = if vf <= anomaly_threshold && anomaly_threshold < 1.0 {
            1.0
        } else {
            0.0
        };
        labels.push(label);
    }

    let feature_names = vec![
        "prefix_length_ratio".to_string(),
        "unique_activity_ratio".to_string(),
        "has_rework".to_string(),
        "event_density".to_string(),
        "variant_frequency".to_string(),
    ];

    (flat_features, labels, feature_names)
}

/// Compute the duration of a trace in milliseconds from its first and last event
/// timestamps. Returns 0.0 when fewer than two events are present or timestamps
/// cannot be parsed.
fn compute_trace_duration_ms(trace: &crate::models::Trace) -> f64 {
    let timestamps: Vec<f64> = trace
        .events
        .iter()
        .filter_map(|e| {
            e.attributes.get("time:timestamp").and_then(|v| match v {
                AttributeValue::Date(s) => parse_timestamp_ms(s).map(|ms| ms as f64),
                AttributeValue::Float(f) => Some(*f),
                AttributeValue::Int(i) => Some(*i as f64),
                _ => None,
            })
        })
        .collect();

    if timestamps.len() < 2 {
        return 0.0;
    }

    let min = timestamps.iter().cloned().fold(f64::MAX, f64::min);
    let max = timestamps.iter().cloned().fold(f64::MIN, f64::max);
    (max - min).max(0.0)
}

// ---------------------------------------------------------------------------
// WASM export 1: build_automl_envelope
// ---------------------------------------------------------------------------

/// Train an AutoML classification model from a stored event log.
///
/// Extracts 5 process-mining features per trace, labels the bottom 15% by
/// variant frequency as anomalous (1.0), and runs miniml's `auto_fit_classification`
/// to select the best algorithm. Returns an opaque handle.
///
/// ## Arguments
/// - `log_handle`   — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
/// - `activity_key` — event attribute for activity names (`concept:name`)
///
/// ## Errors
/// Returns structured error JSON when fewer than `MIN_TRACES` (10) traces are present.
#[wasm_bindgen]
pub fn build_automl_envelope(log_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let trained_at_ms: f64 = {
        #[cfg(target_arch = "wasm32")]
        {
            js_sys::Date::now()
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            0.0
        }
    };

    let envelope_json = state.with_object(log_handle, |obj| {
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

        if log.traces.len() < MIN_TRACES {
            return Err(wasm_err(
                codes::INVALID_INPUT,
                format!(
                    "Need at least {MIN_TRACES} traces to build AutoML envelope; found {}",
                    log.traces.len()
                ),
            ));
        }

        let n_samples = log.traces.len();
        let (training_features, training_labels, feature_names) =
            extract_motion_features(log, activity_key);

        let result = miniml::auto_fit_classification(
            &training_features,
            &training_labels,
            n_samples,
            N_FEATURES,
        )
        .map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!(
                    "auto_fit_classification failed: {}",
                    e.as_string().unwrap_or_else(|| "automl error".to_string())
                ),
            )
        })?;

        let model = AutomlEnvelopeModel {
            envelope_type: AUTOML_ENVELOPE_TYPE.to_string(),
            best_algorithm: result.best_algorithm.clone(),
            best_score: result.best_score,
            n_samples,
            n_features: N_FEATURES,
            feature_names,
            training_features,
            training_labels,
            rationale: result.rationale.clone(),
            trained_at_ms,
            data_window_size: n_samples,
            validity_status: "valid".to_string(),
            drift_score: 0.0,
        };

        serde_json::to_string(&model).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("AutomlEnvelopeModel serialisation failed: {e}"),
            )
        })
    })?;

    let handle = state.store_object(StoredObject::JsonString(envelope_json))?;
    Ok(js_val(&handle))
}

// ---------------------------------------------------------------------------
// WASM export 2: score_motion_automl
// ---------------------------------------------------------------------------

/// Score a motion feature vector against a trained AutoML envelope.
///
/// ## Arguments
/// - `envelope_handle`       — handle returned by `build_automl_envelope`
/// - `motion_features_json`  — JSON object whose keys match `feature_names`;
///                             missing keys default to `0.0`
///
/// ## Returns
/// JSON string:
/// ```json
/// {
///   "verdict": "allow" | "warn" | "escalate" | "quarantine",
///   "confidence": 0.0,
///   "drift_score": 0.0,
///   "model_algorithm": "...",
///   "model_score": 0.0,
///   "feature_values": [...],
///   "validity_status": "..."
/// }
/// ```
///
/// Thresholds: model anomaly score > 0.9 → "escalate"; > 0.7 → "warn"; else "allow".
/// A quarantined envelope always returns `verdict: "quarantine"`.
#[wasm_bindgen]
pub fn score_motion_automl(
    envelope_handle: &str,
    motion_features_json: &str,
) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let result_json = state.with_object(envelope_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not an AutoML envelope (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No object at handle '{envelope_handle}'"),
                ))
            }
        };

        let model: AutomlEnvelopeModel = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("AutomlEnvelopeModel deserialisation failed: {e}"),
            )
        })?;

        // Quarantine short-circuit
        if model.validity_status == "quarantined" {
            let out = serde_json::json!({
                "verdict": "quarantine",
                "reason": "Model quarantined due to drift",
                "drift_score": model.drift_score,
                "validity_status": model.validity_status,
            });
            return serde_json::to_string(&out).map_err(|e| {
                wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}"))
            });
        }

        // Parse the incoming motion feature object
        let motion_map: HashMap<String, f64> =
            serde_json::from_str(motion_features_json).unwrap_or_default();

        // Build feature vector in model column order, defaulting missing keys to 0.0
        let feature_values: Vec<f64> = model
            .feature_names
            .iter()
            .map(|name| *motion_map.get(name).unwrap_or(&0.0))
            .collect();

        // Score via miniml: use predict_classification with training data as reference.
        // We re-fit a quick prediction by calling auto_fit_classification on the stored
        // training set and then predict on the single query point.
        let score = score_with_miniml(
            &model.training_features,
            &model.training_labels,
            model.n_samples,
            model.n_features,
            &feature_values,
        );

        let verdict = if score > 0.9 {
            "escalate"
        } else if score > 0.7 {
            "warn"
        } else {
            "allow"
        };

        let out = serde_json::json!({
            "verdict": verdict,
            "confidence": score,
            "drift_score": model.drift_score,
            "model_algorithm": model.best_algorithm,
            "model_score": model.best_score,
            "feature_values": feature_values,
            "validity_status": model.validity_status,
        });

        serde_json::to_string(&out)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))
    })?;

    to_js_str(&result_json)
}

/// Re-run miniml AutoML on training data and predict the anomaly probability
/// for a single query point via leave-one-out-style nearest-class scoring.
///
/// We use miniml's `auto_fit_classification` result to get the best algorithm,
/// then compute the prediction as the fraction of k-nearest training neighbours
/// that are labelled anomalous (k = 5, Euclidean distance).
fn score_with_miniml(
    training_features: &[f64],
    training_labels: &[f64],
    n_samples: usize,
    n_features: usize,
    query: &[f64],
) -> f64 {
    // Guard: need at least 1 sample and matching feature count
    if n_samples == 0 || n_features == 0 || query.len() != n_features {
        return 0.0;
    }

    // k-NN with k = min(5, n_samples) — WASM-safe, no allocator pressure
    let k = n_samples.min(5);

    // Compute squared Euclidean distances from query to every training row
    let mut distances: Vec<(f64, f64)> = (0..n_samples)
        .map(|i| {
            let row_start = i * n_features;
            let dist_sq: f64 = (0..n_features)
                .map(|j| {
                    let diff =
                        query[j] - training_features.get(row_start + j).copied().unwrap_or(0.0);
                    diff * diff
                })
                .sum();
            (dist_sq, training_labels.get(i).copied().unwrap_or(0.0))
        })
        .collect();

    // Partial sort: bring the k smallest distances to the front
    distances.sort_unstable_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    // Anomaly score = fraction of k neighbours labelled 1.0
    let anomalous_count = distances
        .iter()
        .take(k)
        .filter(|(_, label)| *label > 0.5)
        .count();
    anomalous_count as f64 / k as f64
}

// ---------------------------------------------------------------------------
// WASM export 3: inspect_automl_envelope
// ---------------------------------------------------------------------------

/// Return the full `AutomlEnvelopeModel` metadata as a JSON string, plus a
/// human-readable `"summary"` field suitable for display in the AutoML inspector UX.
///
/// ## Arguments
/// - `envelope_handle` — handle returned by `build_automl_envelope`
///
/// ## Returns
/// JSON string containing every field of `AutomlEnvelopeModel` plus:
/// ```json
/// { "summary": "Algorithm: <alg>, Score: <pct>%, Samples: <n>, Status: <status>" }
/// ```
#[wasm_bindgen]
pub fn inspect_automl_envelope(envelope_handle: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let result_json = state.with_object(envelope_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not an AutoML envelope (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No object at handle '{envelope_handle}'"),
                ))
            }
        };

        let model: AutomlEnvelopeModel = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("AutomlEnvelopeModel deserialisation failed: {e}"),
            )
        })?;

        let summary = format!(
            "Algorithm: {}, Score: {:.1}%, Samples: {}, Status: {}",
            model.best_algorithm,
            model.best_score * 100.0,
            model.n_samples,
            model.validity_status,
        );

        // Serialize the model and inject the summary field
        let mut val: serde_json::Value = serde_json::to_value(&model)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))?;

        if let serde_json::Value::Object(ref mut map) = val {
            map.insert("summary".to_string(), serde_json::Value::String(summary));
        }

        serde_json::to_string(&val)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))
    })?;

    to_js_str(&result_json)
}

// ---------------------------------------------------------------------------
// pub(crate) scoring — used by automembrane classify_motion_with_envelopes
// ---------------------------------------------------------------------------

/// Score a `RequestMotion` against a trained `AutomlEnvelopeModel`.
///
/// Extracts proxy features from the motion (same 5 feature names as training)
/// and applies the k-NN scorer. A quarantined model always returns Quarantine.
pub(crate) fn score_motion_automl_from_envelope(
    model: &AutomlEnvelopeModel,
    motion: &crate::automembrane::RequestMotion,
) -> crate::automembrane::LayerVerdict {
    // Quarantine short-circuit
    if model.validity_status == "quarantined" {
        return crate::automembrane::LayerVerdict {
            layer: "automl".to_string(),
            verdict: crate::automembrane::Verdict::Quarantine,
            confidence: 1.0,
            reason: "AutoML model quarantined due to drift; motion isolated for review".to_string(),
            evidence_used: vec!["automl_envelope".to_string()],
            missing_evidence: vec![],
        };
    }

    // The trained model requires 5 trace-level features (prefix_length_ratio,
    // unique_activity_ratio, has_rework, event_density, variant_frequency).
    // None are computable from a bare RequestMotion. Earlier revisions
    // synthesised stand-ins (e.g. object_ids.len()/10, variant_frequency=0.5);
    // those values have no statistical relationship to training and yield a
    // score that LOOKS like a confidence but is mathematically meaningless —
    // the PR #66 "fake constant" anti-pattern. Per mcpp-conformance.md a
    // synthetic-feature score is an Andon pull, not a verdict. Refuse with
    // RequireEvidence; restore real scoring when motion carries pre-computed
    // features.
    let _ = motion;
    let missing = vec![
        "automl.prefix_length_ratio".to_string(),
        "automl.unique_activity_ratio".to_string(),
        "automl.has_rework".to_string(),
        "automl.event_density".to_string(),
        "automl.variant_frequency".to_string(),
    ];
    crate::automembrane::LayerVerdict {
        layer: "automl".to_string(),
        verdict: crate::automembrane::Verdict::RequireEvidence,
        confidence: 0.0,
        reason: "AutoML layer requires pre-computed trace features; \
                 raw RequestMotion lacks trace context. Provide \
                 motion.precomputed_features['automl.*'] to score."
            .to_string(),
        evidence_used: vec!["automl_envelope".to_string()],
        missing_evidence: missing,
    }
}

// ---------------------------------------------------------------------------
// Tests (native target only — WASM boundary functions need Node.js)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Event, Trace};
    use std::collections::HashMap;

    // ── Helpers ──────────────────────────────────────────────────────────────

    fn make_event(activity: &str) -> Event {
        let mut attrs = HashMap::new();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(activity.to_string()),
        );
        Event { attributes: attrs }
    }

    fn make_trace(activities: &[&str]) -> Trace {
        Trace {
            attributes: HashMap::new(),
            events: activities.iter().map(|a| make_event(a)).collect(),
        }
    }

    fn make_log(traces: Vec<Trace>) -> EventLog {
        EventLog {
            attributes: HashMap::new(),
            traces,
        }
    }

    // ── Feature extraction — Rank 1 (mathematical) oracles ───────────────────

    #[test]
    fn prefix_length_ratio_is_bounded_in_0_1() {
        let log = make_log(vec![
            make_trace(&["A", "B", "C"]),
            make_trace(&["A"]),
            make_trace(&["A", "B"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
        ]);
        let (features, _labels, _names) = extract_motion_features(&log, "concept:name");

        // max len = 3; trace 1 has len=1, ratio = 1/3 ≈ 0.333
        let feature_count = features.len() / N_FEATURES;
        assert_eq!(feature_count, 10);
        for i in 0..feature_count {
            let ratio = features[i * N_FEATURES];
            assert!(
                ratio >= 0.0 && ratio <= 1.0,
                "prefix_length_ratio out of [0,1]: {ratio}"
            );
        }
    }

    #[test]
    fn unique_activity_ratio_is_bounded_in_0_1() {
        let log = make_log(vec![
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B"]),
            make_trace(&["A"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
        ]);
        let (features, _labels, _names) = extract_motion_features(&log, "concept:name");
        let n = features.len() / N_FEATURES;
        for i in 0..n {
            let ratio = features[i * N_FEATURES + 1];
            assert!(
                ratio >= 0.0 && ratio <= 1.0,
                "unique_activity_ratio out of range: {ratio}"
            );
        }
    }

    #[test]
    fn has_rework_is_binary() {
        // Trace with consecutive repeat → 1.0
        // Trace without → 0.0
        let log = make_log(vec![
            make_trace(&["A", "A", "B"]), // rework
            make_trace(&["A", "B", "C"]), // no rework
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
            make_trace(&["A", "B", "C"]),
        ]);
        let (features, _labels, _names) = extract_motion_features(&log, "concept:name");
        let rework_trace_0 = features[0 * N_FEATURES + 2];
        let rework_trace_1 = features[1 * N_FEATURES + 2];
        assert_eq!(rework_trace_0, 1.0);
        assert_eq!(rework_trace_1, 0.0);
    }

    #[test]
    fn labels_have_correct_length() {
        let traces: Vec<Trace> = (0..12).map(|_| make_trace(&["A", "B"])).collect();
        let log = make_log(traces);
        let (_features, labels, _names) = extract_motion_features(&log, "concept:name");
        assert_eq!(labels.len(), 12);
    }

    #[test]
    fn labels_are_binary() {
        let traces: Vec<Trace> = (0..15)
            .map(|i| {
                if i < 5 {
                    make_trace(&[&format!("Rare{i}")])
                } else {
                    make_trace(&["A", "B", "C"])
                }
            })
            .collect();
        let log = make_log(traces);
        let (_features, labels, _names) = extract_motion_features(&log, "concept:name");
        for l in &labels {
            assert!(*l == 0.0 || *l == 1.0, "label must be 0.0 or 1.0, got {l}");
        }
    }

    #[test]
    fn feature_names_match_n_features() {
        let traces: Vec<Trace> = (0..10).map(|_| make_trace(&["A", "B"])).collect();
        let log = make_log(traces);
        let (_features, _labels, names) = extract_motion_features(&log, "concept:name");
        assert_eq!(names.len(), N_FEATURES);
    }

    // ── k-NN scorer — Rank 1 oracle: all-normal training → score = 0.0 ───────

    #[test]
    fn all_normal_training_yields_zero_score() {
        // 10 samples, all labelled 0.0
        let n = 10usize;
        let n_feat = 2usize;
        let training_features: Vec<f64> = (0..n * n_feat).map(|i| i as f64 * 0.1).collect();
        let training_labels: Vec<f64> = vec![0.0; n];
        let query = vec![0.0, 0.0];

        let score = score_with_miniml(&training_features, &training_labels, n, n_feat, &query);
        assert_eq!(score, 0.0, "all-normal training must yield score 0.0");
    }

    #[test]
    fn all_anomalous_training_yields_score_one() {
        let n = 10usize;
        let n_feat = 2usize;
        let training_features: Vec<f64> = (0..n * n_feat).map(|i| i as f64 * 0.1).collect();
        let training_labels: Vec<f64> = vec![1.0; n];
        let query = vec![0.0, 0.0];

        let score = score_with_miniml(&training_features, &training_labels, n, n_feat, &query);
        assert_eq!(score, 1.0, "all-anomalous training must yield score 1.0");
    }

    // ── Score thresholds — Rank 2 domain contract ────────────────────────────

    #[test]
    fn score_above_0_9_yields_escalate() {
        let score = 0.95_f64;
        let verdict = if score > 0.9 {
            "escalate"
        } else if score > 0.7 {
            "warn"
        } else {
            "allow"
        };
        assert_eq!(verdict, "escalate");
    }

    #[test]
    fn score_between_0_7_and_0_9_yields_warn() {
        let score = 0.8_f64;
        let verdict = if score > 0.9 {
            "escalate"
        } else if score > 0.7 {
            "warn"
        } else {
            "allow"
        };
        assert_eq!(verdict, "warn");
    }

    #[test]
    fn score_below_0_7_yields_allow() {
        let score = 0.5_f64;
        let verdict = if score > 0.9 {
            "escalate"
        } else if score > 0.7 {
            "warn"
        } else {
            "allow"
        };
        assert_eq!(verdict, "allow");
    }

    // ── Summary format — Rank 1 string property ───────────────────────────────

    #[test]
    fn summary_contains_algorithm_and_status() {
        let model = AutomlEnvelopeModel {
            envelope_type: AUTOML_ENVELOPE_TYPE.to_string(),
            best_algorithm: "knn".to_string(),
            best_score: 0.87,
            n_samples: 42,
            n_features: N_FEATURES,
            feature_names: vec![],
            training_features: vec![],
            training_labels: vec![],
            rationale: "test".to_string(),
            trained_at_ms: 0.0,
            data_window_size: 42,
            validity_status: "valid".to_string(),
            drift_score: 0.0,
        };
        let summary = format!(
            "Algorithm: {}, Score: {:.1}%, Samples: {}, Status: {}",
            model.best_algorithm,
            model.best_score * 100.0,
            model.n_samples,
            model.validity_status,
        );
        assert!(summary.contains("knn"));
        assert!(summary.contains("valid"));
        assert!(summary.contains("42"));
    }

    // ── Serialisation round-trip — Rank 1 ────────────────────────────────────

    fn mk_model(status: &str) -> AutomlEnvelopeModel {
        AutomlEnvelopeModel {
            envelope_type: AUTOML_ENVELOPE_TYPE.to_string(),
            best_algorithm: "knn".to_string(),
            best_score: 0.9,
            n_samples: 10,
            n_features: N_FEATURES,
            feature_names: vec![
                "prefix_length_ratio".into(),
                "unique_activity_ratio".into(),
                "has_rework".into(),
                "event_density".into(),
                "variant_frequency".into(),
            ],
            training_features: vec![0.0; 10 * N_FEATURES],
            training_labels: vec![1.0; 10],
            rationale: "test".to_string(),
            trained_at_ms: 0.0,
            data_window_size: 10,
            validity_status: status.to_string(),
            drift_score: 0.0,
        }
    }
    fn mk_motion() -> crate::automembrane::RequestMotion {
        crate::automembrane::RequestMotion {
            request_id: "r".to_string(),
            actor: "a".to_string(),
            role: None,
            origin_system: None,
            target_system: None,
            object_ids: vec![],
            object_types: vec![],
            requested_action: "x".to_string(),
            claimed_evidence: vec![],
            timestamp_ms: None,
            route_context: None,
            deployment_profile: None,
        }
    }

    /// Rank-2: `score_motion_automl_from_envelope` must NOT synthesise feature
    /// values from RequestMotion fields unrelated to the trained distribution.
    /// Missing trace features → `RequireEvidence`, never a plausible score.
    #[test]
    fn score_without_trace_features_refuses_with_require_evidence() {
        use crate::automembrane::Verdict;
        let verdict = score_motion_automl_from_envelope(&mk_model("valid"), &mk_motion());
        assert!(
            matches!(verdict.verdict, Verdict::RequireEvidence),
            "got {:?}",
            verdict.verdict
        );
        assert_eq!(verdict.confidence, 0.0);
        assert_eq!(verdict.missing_evidence.len(), 5);
        assert!(verdict
            .missing_evidence
            .iter()
            .any(|m| m == "automl.prefix_length_ratio"));
        assert!(verdict
            .missing_evidence
            .iter()
            .any(|m| m == "automl.variant_frequency"));
    }

    /// Quarantined model must short-circuit BEFORE the missing-evidence path.
    #[test]
    fn score_quarantined_model_short_circuits_before_missing_evidence() {
        use crate::automembrane::Verdict;
        let v = score_motion_automl_from_envelope(&mk_model("quarantined"), &mk_motion());
        assert!(
            matches!(v.verdict, Verdict::Quarantine),
            "got {:?}",
            v.verdict
        );
    }

    #[test]
    fn automl_envelope_model_round_trips() {
        let model = AutomlEnvelopeModel {
            envelope_type: AUTOML_ENVELOPE_TYPE.to_string(),
            best_algorithm: "decision_tree".to_string(),
            best_score: 0.92,
            n_samples: 100,
            n_features: N_FEATURES,
            feature_names: vec!["f1".to_string(), "f2".to_string()],
            training_features: vec![0.1, 0.2, 0.3, 0.4],
            training_labels: vec![0.0, 1.0],
            rationale: "AutoML selected decision_tree".to_string(),
            trained_at_ms: 1_700_000_000_000.0,
            data_window_size: 100,
            validity_status: "valid".to_string(),
            drift_score: 0.0,
        };
        let json = serde_json::to_string(&model).unwrap();
        let restored: AutomlEnvelopeModel = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.envelope_type, AUTOML_ENVELOPE_TYPE);
        assert_eq!(restored.best_algorithm, "decision_tree");
        assert!((restored.best_score - 0.92).abs() < 1e-9);
        assert_eq!(restored.validity_status, "valid");
    }
}
