//! Concept-drift detection for process-mining event logs.
//!
//! This module answers the question:
//!
//! > **"Has the process behaviour changed over time?"**
//!
//! Two complementary primitives are exported across the WASM boundary:
//!
//! * [`detect_drift`] — windowed Jaccard-distance drift detection over the
//!   activity vocabulary of consecutive trace windows.
//! * [`compute_ewma`] — exponentially weighted moving average over a numeric
//!   series, with a coarse trend classification (`rising` / `falling` /
//!   `stable`).
//!
//! In addition, two pure-Rust helpers are exposed (`pub`) so that they can be
//! unit-tested without crossing the wasm-bindgen boundary:
//!
//! * [`jaccard_distance`] — set-distance in `[0.0, 1.0]`.
//! * [`ewma_series`] — recurrence-based EWMA over a slice of `f64`.
//!
//! ## Theory
//!
//! ### Jaccard distance
//!
//! Given two finite sets `A` and `B`, the Jaccard *similarity* is
//!
//! ```text
//! J(A, B) = |A ∩ B| / |A ∪ B|
//! ```
//!
//! and the Jaccard *distance* is `1 − J(A, B)`. Both are well-defined for
//! `A ∪ B ≠ ∅`. By convention, `jaccard_distance(∅, ∅) = 0.0` (no change).
//!
//! ### EWMA
//!
//! Given a series `x[0..n]` and smoothing factor `α ∈ (0, 1]`, the EWMA is
//! defined recursively as:
//!
//! ```text
//! s[0]   = x[0]
//! s[i+1] = α · x[i+1] + (1 − α) · s[i]
//! ```
//!
//! Higher `α` weights recent samples more heavily; `α → 0` approaches a
//! cumulative running mean.
//!
//! ## Public API stability
//!
//! All `#[wasm_bindgen]` exports preserve their existing signatures and JSON
//! response shape. Internal helpers (`jaccard_distance`, `ewma_series`,
//! `classify_trend`) are additive.

use crate::models::AttributeValue;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// Default Jaccard-distance threshold above which a window-pair is reported as
/// a drift point. Calibrated empirically against synthetic logs with injected
/// activity-vocabulary changes.
pub const DEFAULT_DRIFT_THRESHOLD: f64 = 0.3;

/// Threshold for classifying an EWMA trend as `stable` rather than
/// `rising` / `falling`. Expressed as a fraction of `max(|first|, |last|)`.
pub const TREND_STABILITY_FRACTION: f64 = 0.05;

// ---------------------------------------------------------------------------
// Pure helpers (testable on native targets)
// ---------------------------------------------------------------------------

/// Compute the Jaccard distance between two sets of strings.
///
/// Returns a value in `[0.0, 1.0]`:
///
/// * `0.0` ⇒ identical (or both empty)
/// * `1.0` ⇒ disjoint and at least one is non-empty
///
/// The convention `jaccard_distance(∅, ∅) = 0.0` is chosen so that an
/// observation of "no activities, then still no activities" is reported as
/// "no change" rather than as undefined.
///
/// # Example
///
/// ```
/// # use std::collections::HashSet;
/// use wasm4pm::prediction_drift::jaccard_distance;
///
/// // Identical sets → distance 0 (Rank 1: J(A,A) = 1 → distance = 0)
/// let a: HashSet<String> = ["A", "B"].iter().map(|s| s.to_string()).collect();
/// assert_eq!(jaccard_distance(&a, &a.clone()), 0.0);
///
/// // Disjoint sets → distance 1 (Rank 1: J(A,B) = 0 → distance = 1)
/// let b: HashSet<String> = ["C", "D"].iter().map(|s| s.to_string()).collect();
/// assert_eq!(jaccard_distance(&a, &b), 1.0);
///
/// // Both empty → 0.0 by convention (no change)
/// let empty: HashSet<String> = HashSet::new();
/// assert_eq!(jaccard_distance(&empty, &empty), 0.0);
/// ```
pub fn jaccard_distance(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    let union = a.union(b).count();
    if union == 0 {
        return 0.0;
    }
    let inter = a.intersection(b).count();
    1.0 - (inter as f64 / union as f64)
}

/// Compute the exponentially weighted moving average of `values`.
///
/// `alpha` is clamped into `(0.0, 1.0]` for numerical safety: any input
/// outside that range is replaced by the nearer bound (with `0.0` mapped to
/// the smallest representable positive `f64`). An empty input returns an
/// empty vector.
///
/// # Example
///
/// ```
/// use wasm4pm::prediction_drift::ewma_series;
///
/// // Constant series → EWMA equals that constant (for any valid alpha)
/// let result = ewma_series(&[3.0, 3.0, 3.0, 3.0], 0.5);
/// assert_eq!(result.len(), 4);
/// assert!(result.iter().all(|&v| (v - 3.0).abs() < 1e-10));
///
/// // Empty input → empty output
/// assert!(ewma_series(&[], 0.5).is_empty());
/// ```
pub fn ewma_series(values: &[f64], alpha: f64) -> Vec<f64> {
    if values.is_empty() {
        return Vec::new();
    }
    let alpha = alpha.clamp(f64::MIN_POSITIVE, 1.0);

    let mut out = Vec::with_capacity(values.len());
    out.push(values[0]);
    for i in 1..values.len() {
        let prev = out[i - 1];
        out.push(alpha * values[i] + (1.0 - alpha) * prev);
    }
    out
}

/// Classify the overall trend of a smoothed series.
///
/// Returns one of `"rising"`, `"falling"`, `"stable"`. A series shorter than
/// two samples is always `"stable"`.
///
/// # Example
///
/// ```
/// use wasm4pm::prediction_drift::{ewma_series, classify_trend};
///
/// // Rising trend (Rank 1: monotone input → classify must return "rising")
/// let rising = ewma_series(&[1.0, 2.0, 3.0, 4.0, 5.0], 0.9);
/// assert_eq!(classify_trend(&rising), "rising");
///
/// // Constant series → stable
/// assert_eq!(classify_trend(&[2.0, 2.0, 2.0]), "stable");
///
/// // Single sample → stable by definition
/// assert_eq!(classify_trend(&[42.0]), "stable");
/// ```
pub fn classify_trend(smoothed: &[f64]) -> &'static str {
    if smoothed.len() < 2 {
        return "stable";
    }
    let first = smoothed[0];
    let last = *smoothed.last().expect("len >= 2 checked above");
    let range = (last - first).abs();
    let scale = first.abs().max(last.abs()).max(1e-9);
    if range / scale < TREND_STABILITY_FRACTION {
        "stable"
    } else if last > first {
        "rising"
    } else {
        "falling"
    }
}

// ---------------------------------------------------------------------------
// WASM-exported API
// ---------------------------------------------------------------------------

/// Detect concept drift over an event log using a sliding-window Jaccard
/// distance over the per-window activity vocabulary.
///
/// A drift point is recorded whenever the Jaccard distance between the
/// activity sets of two consecutive windows exceeds
/// [`DEFAULT_DRIFT_THRESHOLD`].
///
/// # Parameters
///
/// * `log_handle` — handle of an `EventLog` previously stored via
///   `load_eventlog_from_xes` / `load_eventlog_from_json`.
/// * `activity_key` — event-attribute key holding the activity name
///   (commonly `"concept:name"`).
/// * `window_size` — number of traces per window. Must be `>= 1`; a value of
///   `0` is silently treated as `1`.
///
/// # Returns
///
/// A JSON-serialised JS string of the form:
///
/// ```json
/// {
///   "drifts_detected": 2,
///   "drifts": [
///     { "position": 10, "distance": 0.45, "type": "concept_drift" }
///   ],
///   "window_size": 5,
///   "method": "jaccard_window",
///   "threshold": 0.3
/// }
/// ```
///
/// # Errors
///
/// Returns a `JsValue` error if the handle is missing or refers to a
/// non-`EventLog` object.
#[wasm_bindgen]
pub fn detect_drift(
    log_handle: &str,
    activity_key: &str,
    window_size: usize,
) -> Result<JsValue, JsValue> {
    let window_size = window_size.max(1);

    get_or_init_state().with_event_log(log_handle, |log| {
            let mut drifts: Vec<serde_json::Value> = Vec::new();
            let mut previous_activities: Option<HashSet<String>> = None;

            for (idx, window) in log.traces.windows(window_size).enumerate() {
                let mut current_activities: HashSet<String> = HashSet::new();
                for trace in window {
                    for event in &trace.events {
                        if let Some(AttributeValue::String(activity)) =
                            event.attributes.get(activity_key)
                        {
                            current_activities.insert(activity.clone());
                        }
                    }
                }

                if let Some(prev) = &previous_activities {
                    let distance = jaccard_distance(&current_activities, prev);
                    if distance > DEFAULT_DRIFT_THRESHOLD {
                        // Compute appeared (in current but not prev) and disappeared (in prev but not current)
                        let appeared: std::collections::BTreeSet<&str> = current_activities
                            .difference(prev)
                            .map(String::as_str)
                            .collect();
                        let disappeared: std::collections::BTreeSet<&str> = prev
                            .difference(&current_activities)
                            .map(String::as_str)
                            .collect();
                        let suggestion = if let Some(first) = disappeared.iter().next() {
                            format!(
                                "Activity '{}' disappeared — re-run discovery or check for process change",
                                first
                            )
                        } else if let Some(first) = appeared.iter().next() {
                            format!(
                                "Activity '{}' appeared — new path detected, consider model update",
                                first
                            )
                        } else {
                            "Frequency shift detected — inspect directly-follows graph".to_string()
                        };
                        drifts.push(json!({
                            "position": idx * window_size,
                            "distance": distance,
                            "type": "concept_drift",
                            "appeared": appeared,
                            "disappeared": disappeared,
                            "suggestion": suggestion,
                        }));
                    }
                }
                previous_activities = Some(current_activities);
            }

            let result = json!({
                "drifts_detected": drifts.len(),
                "drifts": drifts,
                "window_size": window_size,
                "method": "jaccard_window",
                "threshold": DEFAULT_DRIFT_THRESHOLD,
            });
            serde_json::to_string(&result)
                .map(|s| crate::error::js_val(&s))
                .map_err(|e| crate::error::js_val(&e.to_string()))
    })
}

/// Compute an exponentially weighted moving average (EWMA) over a JSON
/// numeric series, plus a coarse trend classification.
///
/// # Parameters
///
/// * `values_json` — JSON array of numbers, e.g. `"[1.0, 2.0, 3.5]"`.
/// * `alpha` — smoothing factor; clamped into `(0.0, 1.0]`. Higher values
///   weight recent samples more heavily.
///
/// # Returns
///
/// A JSON-serialised JS string of the form:
///
/// ```json
/// {
///   "smoothed": [1.0, 1.3, 1.96],
///   "trend": "rising",
///   "last_value": 1.96,
///   "alpha": 0.3
/// }
/// ```
///
/// On empty input, `smoothed` is `[]`, `trend` is `"stable"`, and
/// `last_value` is `null`.
///
/// # Errors
///
/// Returns a `JsValue` error if `values_json` is not a valid JSON array of
/// numbers.
#[wasm_bindgen]
pub fn compute_ewma(values_json: &str, alpha: f64) -> Result<JsValue, JsValue> {
    let values: Vec<f64> = serde_json::from_str(values_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid values JSON: {}", e)))?;

    let smoothed = ewma_series(&values, alpha);

    let (trend, last_value): (&'static str, serde_json::Value) = if smoothed.is_empty() {
        ("stable", serde_json::Value::Null)
    } else {
        let last = *smoothed.last().expect("non-empty checked");
        (classify_trend(&smoothed), json!(last))
    };

    let result = json!({
        "smoothed": smoothed,
        "trend": trend,
        "last_value": last_value,
        "alpha": alpha.clamp(f64::MIN_POSITIVE, 1.0),
    });
    serde_json::to_string(&result)
        .map(|s| crate::error::js_val(&s))
        .map_err(|e| crate::error::js_val(&e.to_string()))
}

// ---------------------------------------------------------------------------
// Native-target unit tests for the pure helpers.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    fn set(items: &[&str]) -> HashSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn jaccard_identical_is_zero() {
        let a = set(&["A", "B", "C"]);
        assert_eq!(jaccard_distance(&a, &a), 0.0);
    }

    #[test]
    fn jaccard_disjoint_is_one() {
        let a = set(&["A", "B"]);
        let b = set(&["X", "Y"]);
        assert_eq!(jaccard_distance(&a, &b), 1.0);
    }

    #[test]
    fn jaccard_both_empty_is_zero_by_convention() {
        let a: HashSet<String> = HashSet::new();
        assert_eq!(jaccard_distance(&a, &a), 0.0);
    }

    #[test]
    fn jaccard_partial_overlap() {
        // |A ∩ B| = 1, |A ∪ B| = 3 → distance = 2/3
        let a = set(&["A", "B"]);
        let b = set(&["B", "C"]);
        let d = jaccard_distance(&a, &b);
        assert!((d - 2.0 / 3.0).abs() < 1e-12);
    }

    #[test]
    fn jaccard_symmetry() {
        let a = set(&["A", "B", "C", "D"]);
        let b = set(&["C", "D", "E"]);
        assert!((jaccard_distance(&a, &b) - jaccard_distance(&b, &a)).abs() < 1e-12);
    }

    #[test]
    fn ewma_empty_input() {
        assert!(ewma_series(&[], 0.5).is_empty());
    }

    #[test]
    fn ewma_single_value_is_identity() {
        assert_eq!(ewma_series(&[42.0], 0.5), vec![42.0]);
    }

    #[test]
    fn ewma_constant_series_is_constant() {
        let v = vec![5.0; 10];
        let s = ewma_series(&v, 0.3);
        for x in s {
            assert!((x - 5.0).abs() < 1e-12);
        }
    }

    #[test]
    fn ewma_alpha_one_tracks_input_with_one_step_lag() {
        // s[0] = x[0]; s[i] = x[i] for i >= 1 when α = 1
        let v = vec![1.0, 2.0, 3.0, 4.0];
        let s = ewma_series(&v, 1.0);
        assert_eq!(s, v);
    }

    #[test]
    fn ewma_alpha_clamped_below() {
        // α = 0 must not collapse the series; clamped to MIN_POSITIVE.
        let v = vec![1.0, 2.0, 3.0];
        let s = ewma_series(&v, 0.0);
        assert_eq!(s.len(), 3);
        // With α near 0, the smoothed series stays close to the first sample.
        assert!((s[1] - 1.0).abs() < 1e-9);
        assert!((s[2] - 1.0).abs() < 1e-9);
    }

    #[test]
    fn ewma_alpha_clamped_above() {
        // α > 1 is clamped to 1.0 (identity-with-lag semantics).
        let v = vec![1.0, 2.0, 3.0];
        let s = ewma_series(&v, 5.0);
        assert_eq!(s, v);
    }

    #[test]
    fn ewma_recurrence_holds() {
        // Mathematical theorem: s[i] = α x[i] + (1−α) s[i−1].
        let v = vec![1.0, 4.0, 9.0, 16.0, 25.0];
        let alpha = 0.4;
        let s = ewma_series(&v, alpha);
        for i in 1..v.len() {
            let expected = alpha * v[i] + (1.0 - alpha) * s[i - 1];
            assert!((s[i] - expected).abs() < 1e-12);
        }
    }

    #[test]
    fn ewma_convergence_to_constant() {
        // For x[i] = c (i >= k) and any α ∈ (0,1], s[i] → c geometrically.
        let mut v = vec![0.0];
        v.extend(std::iter::repeat(10.0).take(200));
        let s = ewma_series(&v, 0.3);
        let last = *s.last().unwrap();
        assert!((last - 10.0).abs() < 1e-6, "last = {}", last);
    }

    #[test]
    fn classify_trend_short_series() {
        assert_eq!(classify_trend(&[]), "stable");
        assert_eq!(classify_trend(&[1.0]), "stable");
    }

    #[test]
    fn classify_trend_rising_falling_stable() {
        assert_eq!(classify_trend(&[1.0, 2.0, 3.0, 4.0]), "rising");
        assert_eq!(classify_trend(&[10.0, 8.0, 6.0]), "falling");
        assert_eq!(classify_trend(&[5.0, 5.001, 5.0, 4.999]), "stable");
    }
}
