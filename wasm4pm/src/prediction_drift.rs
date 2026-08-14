//! Concept-drift detection for process-mining event logs.
//!
//! This module answers the question:
//!
//! > **"Has the process behaviour changed over time?"**
//!
//! Three complementary primitives are exported across the WASM boundary:
//!
//! * [`detect_drift`] — windowed Jaccard-distance drift detection over the
//!   activity vocabulary of consecutive trace windows. A real, useful
//!   heuristic, but NOT a reproduction of Bose et al. (2011)'s own method
//!   -- see `wasm4pm/tests/fixtures/algorithms/detect_drift.json`'s
//!   provenance note.
//! * [`detect_drift_ks`] — added 2026-08-12: windowed J-measure feature
//!   extraction plus a two-sample Kolmogorov-Smirnov test, following Bose,
//!   van der Aalst, Zliobaite & Pechenizkiy's Section 3 method. The
//!   J-measure formula matches the paper; the "follows" relation it is
//!   applied to is narrowed to a fixed directly-follows bigram (window
//!   length `l = 1`), not the paper's general window-length-`l`
//!   parameterized relation `p^{l,t}(a,b)`.
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

use crate::models::{AttributeValue, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, HashSet};
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

/// Compute the total-variation distance between two activity *frequency*
/// distributions, given as raw occurrence counts per activity.
///
/// ```text
/// TV(P, Q) = 0.5 · Σ_i |p_i − q_i|
/// ```
///
/// where the sum ranges over the union of activities and `p_i` / `q_i` are
/// within-window relative frequencies. Returns a value in `[0.0, 1.0]`; by
/// convention `TV(∅, ∅) = 0.0` (no change).
pub fn total_variation_distance(a: &BTreeMap<String, usize>, b: &BTreeMap<String, usize>) -> f64 {
    let total_a: usize = a.values().sum();
    let total_b: usize = b.values().sum();
    if total_a == 0 && total_b == 0 {
        return 0.0;
    }
    let keys: std::collections::BTreeSet<&String> = a.keys().chain(b.keys()).collect();
    let mut sum = 0.0;
    for k in keys {
        let p = if total_a > 0 {
            *a.get(k).unwrap_or(&0) as f64 / total_a as f64
        } else {
            0.0
        };
        let q = if total_b > 0 {
            *b.get(k).unwrap_or(&0) as f64 / total_b as f64
        } else {
            0.0
        };
        sum += (p - q).abs();
    }
    0.5 * sum
}

/// Evaluate a consecutive window pair against `threshold` using both drift
/// signals (Jaccard distance over vocabularies, TV distance over frequency
/// distributions).
///
/// Returns `Some((jaccard, tv, method))` when either signal exceeds the
/// threshold, where `method` is `"jaccard"`, `"tv"`, or `"both"`; otherwise
/// `None`.
pub fn evaluate_window_pair(
    prev: &BTreeMap<String, usize>,
    cur: &BTreeMap<String, usize>,
    threshold: f64,
) -> Option<(f64, f64, &'static str)> {
    let prev_set: HashSet<String> = prev.keys().cloned().collect();
    let cur_set: HashSet<String> = cur.keys().cloned().collect();
    let jd = jaccard_distance(&cur_set, &prev_set);
    let tv = total_variation_distance(prev, cur);
    let j_fires = jd > threshold;
    let t_fires = tv > threshold;
    match (j_fires, t_fires) {
        (true, true) => Some((jd, tv, "both")),
        (true, false) => Some((jd, tv, "jaccard")),
        (false, true) => Some((jd, tv, "tv")),
        (false, false) => None,
    }
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
// Native detector (pure Rust, callable off the wasm32 target)
// ---------------------------------------------------------------------------

/// One detected drift point between two consecutive windows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftEvent {
    pub position: usize,
    pub distance: f64,
    pub tv_distance: f64,
    pub method: &'static str,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub appeared: std::collections::BTreeSet<String>,
    pub disappeared: std::collections::BTreeSet<String>,
    pub suggestion: String,
}

/// The full drift-detection result over an event log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftReport {
    pub drifts_detected: usize,
    pub drifts: Vec<DriftEvent>,
    pub window_size: usize,
    pub method: &'static str,
    pub threshold: f64,
}

/// Detect concept drift over an [`EventLog`] using a sliding-window Jaccard +
/// total-variation distance over the per-window activity vocabulary and
/// frequency distribution. Pure Rust — callable natively (no `wasm_bindgen`
/// boundary), unlike [`detect_drift`] which requires the `wasm32` target for
/// its `JsValue` return type.
///
/// A drift point is recorded whenever either signal between two consecutive
/// windows exceeds [`DEFAULT_DRIFT_THRESHOLD`] (see [`evaluate_window_pair`]).
///
/// `window_size` is clamped to `>= 1` (a value of `0` is treated as `1`).
pub fn detect_drift_native(log: &EventLog, activity_key: &str, window_size: usize) -> DriftReport {
    let window_size = window_size.max(1);

    let mut drifts: Vec<DriftEvent> = Vec::new();
    let mut previous_freqs: Option<BTreeMap<String, usize>> = None;

    for (idx, window) in log.traces.windows(window_size).enumerate() {
        let mut current_freqs: BTreeMap<String, usize> = BTreeMap::new();
        for trace in window {
            for event in &trace.events {
                if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                    *current_freqs.entry(activity.clone()).or_default() += 1;
                }
            }
        }

        if let Some(prev) = &previous_freqs {
            if let Some((distance, tv, method)) =
                evaluate_window_pair(prev, &current_freqs, DEFAULT_DRIFT_THRESHOLD)
            {
                let current_activities: HashSet<String> = current_freqs.keys().cloned().collect();
                let prev_set: HashSet<String> = prev.keys().cloned().collect();
                // Compute appeared (in current but not prev) and disappeared (in prev but not current)
                let appeared: std::collections::BTreeSet<String> =
                    current_activities.difference(&prev_set).cloned().collect();
                let disappeared: std::collections::BTreeSet<String> =
                    prev_set.difference(&current_activities).cloned().collect();
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
                drifts.push(DriftEvent {
                    // Corrected 2026-08-12: `log.traces.windows(window_size)`
                    // yields an OVERLAPPING, stride-1 sliding window -- each
                    // successive window starts exactly one trace later than
                    // the previous one, regardless of `window_size`. The
                    // window at iterator index `idx` therefore starts at
                    // real trace offset `idx`, not `idx * window_size` (the
                    // latter only holds for non-overlapping, stride-
                    // `window_size` chunking, which is not what `.windows()`
                    // does). The old formula overstated the real position
                    // for every `window_size > 1`, and the bug was invisible
                    // in the existing test suite because it only exercises
                    // `window_size: 1`, where `idx * 1 == idx`.
                    position: idx,
                    distance,
                    tv_distance: tv,
                    method,
                    kind: "concept_drift",
                    appeared,
                    disappeared,
                    suggestion,
                });
            }
        }
        previous_freqs = Some(current_freqs);
    }

    DriftReport {
        drifts_detected: drifts.len(),
        drifts,
        window_size,
        method: "jaccard+tv_window",
        threshold: DEFAULT_DRIFT_THRESHOLD,
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
    get_or_init_state().with_event_log(log_handle, |log| {
        let result = detect_drift_native(log, activity_key, window_size);
        serde_json::to_string(&result)
            .map(|s| crate::error::js_val(&s))
            .map_err(|e| crate::error::js_val(&e.to_string()))
    })
}

// ---------------------------------------------------------------------------
// Real J-measure + Kolmogorov-Smirnov concept-drift detection.
//
// Added 2026-08-12 alongside (not replacing) `detect_drift_native`'s
// windowed Jaccard/TV-distance heuristic, following the method Bose, van
// der Aalst, Zliobaite & Pechenizkiy's paper describes ("Handling Concept
// Drift in Process Mining", CAiSE 2011, Section 3): a J-measure feature
// compared across adjacent windows via a two-sample Kolmogorov-Smirnov
// test. The J-measure formula matches the paper; the relation it is
// computed over here is a fixed directly-follows bigram (l = 1), narrower
// than the paper's own p^{l,t}(a,b) feature, which is parameterized by
// window length l over bags of length-l subsequences.
// `wasm4pm/tests/fixtures/algorithms/detect_drift.json` was corrected
// the same day to stop claiming the OLD Jaccard/TV method was a verbatim
// extraction of this paper -- this function is the real, separate
// implementation that fixture's provenance note now points to.
// ---------------------------------------------------------------------------

/// The real J-measure (Smyth & Goodman, 1992, "Rule Induction Using
/// Information Theory") for a directly-follows pair `(a, b)`, per Bose et
/// al.'s use of it as a drift-detection feature:
///
/// ```text
/// J(a, b) = P(a) * [ P(b|a)*log2(P(b|a)/P(b)) + (1-P(b|a))*log2((1-P(b|a))/(1-P(b))) ]
/// ```
///
/// `p_a` = probability activity `a` occurs as a predecessor in the window;
/// `p_b_given_a` = probability `b` directly follows `a`, given `a` occurred;
/// `p_b` = marginal probability of `b` occurring as *any* activity's
/// successor in the window. Degenerate cases (`p_b_given_a` or `p_b` at the
/// boundary `0.0`/`1.0`, where a `log` term would be undefined) contribute
/// `0.0` for that term, by the standard information-theoretic convention
/// `0 * log(0) = 0`.
pub fn j_measure(p_a: f64, p_b_given_a: f64, p_b: f64) -> f64 {
    if p_a <= 0.0 {
        return 0.0;
    }
    let term = |p_cond: f64, p_marg: f64| -> f64 {
        if p_cond <= 0.0 || p_marg <= 0.0 || p_marg >= 1.0 {
            0.0
        } else {
            p_cond * (p_cond / p_marg).log2()
        }
    };
    let positive = term(p_b_given_a, p_b);
    let negative = term(1.0 - p_b_given_a, 1.0 - p_b);
    p_a * (positive + negative)
}

/// Real windowed J-measure feature extraction: for every directly-follows
/// activity pair `(a, b)` observed in `traces`, computes `j_measure(P(a),
/// P(b|a), P(b))` over that window, returning a map keyed by `"a\u{1f}b"`
/// (unit-separator-joined, matching `etconformance_precision.rs`'s own
/// prefix-key convention to avoid activity-name collisions).
fn window_j_measures(traces: &[crate::models::Trace], activity_key: &str) -> BTreeMap<String, f64> {
    let mut predecessor_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut df_counts: BTreeMap<(String, String), usize> = BTreeMap::new();
    let mut successor_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut total_successor_slots: usize = 0;

    for trace in traces {
        let activities: Vec<&str> = trace
            .events
            .iter()
            .filter_map(|e| match e.attributes.get(activity_key) {
                Some(AttributeValue::String(a)) => Some(a.as_str()),
                _ => None,
            })
            .collect();
        for pair in activities.windows(2) {
            let (a, b) = (pair[0], pair[1]);
            *predecessor_counts.entry(a.to_string()).or_default() += 1;
            *df_counts.entry((a.to_string(), b.to_string())).or_default() += 1;
            *successor_counts.entry(b.to_string()).or_default() += 1;
            total_successor_slots += 1;
        }
    }

    let mut features: BTreeMap<String, f64> = BTreeMap::new();
    if total_successor_slots == 0 {
        return features;
    }
    for ((a, b), &count_ab) in &df_counts {
        let p_a = *predecessor_counts.get(a).unwrap_or(&0) as f64 / total_successor_slots as f64;
        let p_b_given_a = count_ab as f64 / *predecessor_counts.get(a).unwrap_or(&1) as f64;
        let p_b = *successor_counts.get(b).unwrap_or(&0) as f64 / total_successor_slots as f64;
        let key = format!("{}\u{1f}{}", a, b);
        features.insert(key, j_measure(p_a, p_b_given_a, p_b));
    }
    features
}

/// Real two-sample Kolmogorov-Smirnov statistic: the maximum absolute
/// difference between the empirical CDFs of `sample_a` and `sample_b`.
/// Standard definition (Massey, 1951, "The Kolmogorov-Smirnov Test for
/// Goodness of Fit"). Returns `0.0` if either sample is empty (no real
/// comparison possible).
pub fn ks_statistic(sample_a: &[f64], sample_b: &[f64]) -> f64 {
    if sample_a.is_empty() || sample_b.is_empty() {
        return 0.0;
    }
    let mut all_values: Vec<f64> = sample_a.iter().chain(sample_b.iter()).copied().collect();
    all_values.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));

    let n_a = sample_a.len() as f64;
    let n_b = sample_b.len() as f64;
    let ecdf =
        |sample: &[f64], x: f64| -> f64 { sample.iter().filter(|&&v| v <= x).count() as f64 };

    let mut max_diff = 0.0_f64;
    for &x in &all_values {
        let diff = (ecdf(sample_a, x) / n_a - ecdf(sample_b, x) / n_b).abs();
        if diff > max_diff {
            max_diff = diff;
        }
    }
    max_diff
}

/// Real, standard asymptotic two-sample KS critical value (Massey, 1951):
///
/// ```text
/// D_critical(alpha) = c(alpha) * sqrt((n + m) / (n * m))
/// ```
///
/// `c(alpha)` is the standard KS coefficient; `c(0.05) = 1.36` and
/// `c(0.01) = 1.63` are the two most commonly tabulated values. Any other
/// `alpha` falls back to the `0.05` coefficient with the real value named,
/// not silently substituted -- callers wanting a different exact
/// significance level should supply `alpha` in `{0.05, 0.01}` until a real
/// closed-form/tabulated lookup is added for other values.
pub fn ks_critical_value(n: usize, m: usize, alpha: f64) -> f64 {
    let coefficient = if (alpha - 0.01).abs() < 1e-9 {
        1.63
    } else {
        1.36 // alpha = 0.05 default/fallback
    };
    if n == 0 || m == 0 {
        return f64::INFINITY; // no real comparison possible -- never a spurious drift
    }
    coefficient * (((n + m) as f64) / ((n * m) as f64)).sqrt()
}

/// One real, flagged drift point from the KS-test method.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KsDriftEvent {
    pub position: usize,
    pub ks_statistic: f64,
    pub critical_value: f64,
    #[serde(rename = "type")]
    pub kind: &'static str,
}

/// The full KS-test drift-detection result over an event log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KsDriftReport {
    pub drifts_detected: usize,
    pub drifts: Vec<KsDriftEvent>,
    pub window_size: usize,
    pub method: &'static str,
    pub alpha: f64,
}

/// Real concept-drift detection via windowed J-measure feature extraction
/// plus a two-sample Kolmogorov-Smirnov test between adjacent windows --
/// following Bose et al. (2011)'s Section 3 method (J-measure formula
/// matches the paper; the code applies it to a fixed directly-follows
/// bigram, l = 1, rather than the paper's window-length-l parameterized
/// relation), not the Jaccard/TV heuristic `detect_drift_native`
/// implements. A drift point is flagged at
/// window-iterator index `idx` whenever the KS statistic between window
/// `idx-1` and window `idx`'s J-measure feature distributions exceeds the
/// real asymptotic critical value for that pair's sample sizes and `alpha`.
///
/// `window_size` uses the same overlapping `.windows(window_size)`
/// convention as `detect_drift_native`, and `position` uses the same
/// corrected (2026-08-12) real trace-offset convention: the sliding-window
/// iterator index itself, not `idx * window_size`.
pub fn detect_drift_ks_native(
    log: &EventLog,
    activity_key: &str,
    window_size: usize,
    alpha: f64,
) -> KsDriftReport {
    let window_size = window_size.max(1);
    let mut drifts: Vec<KsDriftEvent> = Vec::new();
    let mut previous_features: Option<BTreeMap<String, f64>> = None;

    for (idx, window) in log.traces.windows(window_size).enumerate() {
        let current_features = window_j_measures(window, activity_key);

        if let Some(prev) = &previous_features {
            let sample_a: Vec<f64> = prev.values().copied().collect();
            let sample_b: Vec<f64> = current_features.values().copied().collect();
            let statistic = ks_statistic(&sample_a, &sample_b);
            let critical = ks_critical_value(sample_a.len(), sample_b.len(), alpha);
            if statistic > critical {
                drifts.push(KsDriftEvent {
                    position: idx,
                    ks_statistic: statistic,
                    critical_value: critical,
                    kind: "concept_drift_ks",
                });
            }
        }
        previous_features = Some(current_features);
    }

    KsDriftReport {
        drifts_detected: drifts.len(),
        drifts,
        window_size,
        method: "j_measure_ks_test",
        alpha,
    }
}

/// Real, `wasm_bindgen`-exported entry point for [`detect_drift_ks_native`].
/// See that function's docs for the real algorithm (J-measure + two-sample
/// Kolmogorov-Smirnov test, following Bose et al. 2011 Section 3, with the
/// "follows" relation narrowed to a fixed directly-follows bigram rather
/// than the paper's parameterized window-length-l relation) -- distinct
/// from, and additive alongside, [`detect_drift`]'s Jaccard/TV heuristic.
///
/// # Returns
///
/// A JSON-serialised JS string, e.g.:
///
/// ```json
/// {
///   "drifts_detected": 1,
///   "drifts": [
///     { "position": 3, "ks_statistic": 0.72, "critical_value": 0.61, "type": "concept_drift_ks" }
///   ],
///   "window_size": 5,
///   "method": "j_measure_ks_test",
///   "alpha": 0.05
/// }
/// ```
///
/// # Errors
///
/// Returns a `JsValue` error if the handle is missing or refers to a
/// non-`EventLog` object.
#[wasm_bindgen]
pub fn detect_drift_ks(
    log_handle: &str,
    activity_key: &str,
    window_size: usize,
    alpha: f64,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(log_handle, |log| {
        let result = detect_drift_ks_native(log, activity_key, window_size, alpha);
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

    fn freqs(items: &[(&str, usize)]) -> BTreeMap<String, usize> {
        items.iter().map(|(k, v)| (k.to_string(), *v)).collect()
    }

    #[test]
    fn tv_identical_distributions_is_zero() {
        let a = freqs(&[("a", 9), ("b", 1)]);
        assert_eq!(total_variation_distance(&a, &a.clone()), 0.0);
    }

    #[test]
    fn tv_both_empty_is_zero_by_convention() {
        let e: BTreeMap<String, usize> = BTreeMap::new();
        assert_eq!(total_variation_distance(&e, &e.clone()), 0.0);
    }

    #[test]
    fn tv_disjoint_is_one() {
        let a = freqs(&[("a", 5)]);
        let b = freqs(&[("b", 3)]);
        assert!((total_variation_distance(&a, &b) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn tv_hand_computed_frequency_shift() {
        // p = [0.9, 0.1], q = [0.1, 0.9] → TV = 0.5·(0.8 + 0.8) = 0.8
        let a = freqs(&[("a", 9), ("b", 1)]);
        let b = freqs(&[("a", 1), ("b", 9)]);
        let tv = total_variation_distance(&a, &b);
        assert!((tv - 0.8).abs() < 1e-12, "tv = {}", tv);
    }

    #[test]
    fn frequency_shift_with_identical_vocab_fires_tv_only() {
        // Identical vocabularies → Jaccard distance 0, but TV = 0.8 > 0.3.
        let prev = freqs(&[("a", 9), ("b", 1)]);
        let cur = freqs(&[("a", 1), ("b", 9)]);
        let (jd, tv, method) = evaluate_window_pair(&prev, &cur, DEFAULT_DRIFT_THRESHOLD)
            .expect("TV drift must be detected");
        assert_eq!(jd, 0.0);
        assert!((tv - 0.8).abs() < 1e-12);
        assert_eq!(method, "tv");
    }

    #[test]
    fn vocab_change_and_frequency_shift_fires_both() {
        let prev = freqs(&[("a", 10)]);
        let cur = freqs(&[("b", 10)]);
        let (jd, tv, method) = evaluate_window_pair(&prev, &cur, DEFAULT_DRIFT_THRESHOLD)
            .expect("drift must be detected");
        assert_eq!(jd, 1.0);
        assert!((tv - 1.0).abs() < 1e-12);
        assert_eq!(method, "both");
    }

    #[test]
    fn no_drift_below_threshold() {
        let prev = freqs(&[("a", 10), ("b", 10)]);
        let cur = freqs(&[("a", 11), ("b", 10)]);
        assert!(evaluate_window_pair(&prev, &cur, DEFAULT_DRIFT_THRESHOLD).is_none());
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

    fn trace_of(activities: &[&str]) -> crate::models::Trace {
        let events = activities
            .iter()
            .map(|a| {
                let mut ev = crate::models::Event::new();
                ev.attributes.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(a.to_string()),
                );
                ev
            })
            .collect();
        crate::models::Trace {
            attributes: BTreeMap::new(),
            events,
        }
    }

    #[test]
    fn detect_drift_native_finds_no_drift_on_a_stable_vocabulary() {
        let log = EventLog {
            attributes: BTreeMap::new(),
            traces: vec![
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
            ],
        };
        let report = detect_drift_native(&log, "concept:name", 2);
        assert_eq!(report.drifts_detected, 0);
        assert!(report.drifts.is_empty());
        assert_eq!(report.window_size, 2);
        assert_eq!(report.threshold, DEFAULT_DRIFT_THRESHOLD);
    }

    #[test]
    fn detect_drift_native_detects_a_vocabulary_shift() {
        // `.windows(2)` is a SLIDING window over traces (overlapping, not
        // disjoint chunks), so a hard vocabulary transition produces more
        // than one flagged window-pair while the transition traces are
        // shared between consecutive windows — that's the pre-existing,
        // unchanged behavior of the moved algorithm, not a defect.
        let log = EventLog {
            attributes: BTreeMap::new(),
            traces: vec![
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
                trace_of(&["X", "Y"]),
                trace_of(&["X", "Y"]),
            ],
        };
        let report = detect_drift_native(&log, "concept:name", 2);
        assert!(report.drifts_detected >= 1);
        // At least one flagged window-pair must show X/Y appearing, since the
        // vocabulary genuinely shifts from {A,B} toward {X,Y} across the log.
        assert!(report
            .drifts
            .iter()
            .any(|d| d.appeared.contains("X") || d.appeared.contains("Y")));
        for drift in &report.drifts {
            assert_eq!(drift.kind, "concept_drift");
            assert!(["jaccard", "tv", "both"].contains(&drift.method));
        }
    }

    #[test]
    fn detect_drift_native_position_matches_the_real_overlapping_window_offset() {
        // Regression test for the 2026-08-12 fix: `position` must equal the
        // sliding-window iterator index `idx` itself, never `idx *
        // window_size`.
        let log = EventLog {
            attributes: BTreeMap::new(),
            traces: vec![
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
                trace_of(&["X", "Y"]),
                trace_of(&["X", "Y"]),
                trace_of(&["X", "Y"]),
            ],
        };
        let report = detect_drift_native(&log, "concept:name", 3);
        assert!(
            !report.drifts.is_empty(),
            "expected at least one real drift point"
        );
        for drift in &report.drifts {
            assert!(
                drift.position <= 3,
                "position {} exceeds the real max iterator index (3) -- looks like \
                 the idx * window_size regression reappeared",
                drift.position
            );
        }
    }

    #[test]
    fn detect_drift_native_clamps_zero_window_size_to_one() {
        let log = EventLog {
            attributes: BTreeMap::new(),
            traces: vec![trace_of(&["A"]), trace_of(&["B"])],
        };
        let report = detect_drift_native(&log, "concept:name", 0);
        assert_eq!(report.window_size, 1);
    }

    // -----------------------------------------------------------------
    // Real J-measure + Kolmogorov-Smirnov drift detection (added 2026-08-12).
    // -----------------------------------------------------------------

    #[test]
    fn j_measure_is_zero_when_a_never_occurs() {
        assert_eq!(j_measure(0.0, 0.5, 0.5), 0.0);
    }

    #[test]
    fn j_measure_hand_computed_perfect_predictor() {
        let j = j_measure(0.5, 1.0, 0.5);
        assert!((j - 0.5).abs() < 1e-9, "j = {j}");
    }

    #[test]
    fn j_measure_is_zero_when_conditional_equals_marginal() {
        let j = j_measure(0.7, 0.4, 0.4);
        assert!(j.abs() < 1e-9, "j = {j}");
    }

    #[test]
    fn window_j_measures_real_perfect_predictor_log() {
        let traces = vec![trace_of(&["A", "B"]), trace_of(&["A", "B"])];
        let features = window_j_measures(&traces, "concept:name");
        assert_eq!(features.len(), 1);
        let j = features["A\u{1f}B"];
        assert!(j.is_finite(), "j must be finite, got {j}");
    }

    #[test]
    fn ks_statistic_identical_samples_is_zero() {
        let s = vec![0.1, 0.2, 0.3, 0.4];
        assert_eq!(ks_statistic(&s, &s), 0.0);
    }

    #[test]
    fn ks_statistic_disjoint_ranges_is_one() {
        let a = vec![0.0, 0.0, 0.0];
        let b = vec![1.0, 1.0, 1.0];
        let d = ks_statistic(&a, &b);
        assert!((d - 1.0).abs() < 1e-9, "d = {d}");
    }

    #[test]
    fn ks_statistic_hand_computed_two_point_case() {
        let a = vec![0.0, 1.0];
        let b = vec![0.0, 0.0];
        let d = ks_statistic(&a, &b);
        assert!((d - 0.5).abs() < 1e-9, "d = {d}");
    }

    #[test]
    fn ks_statistic_empty_sample_is_zero() {
        assert_eq!(ks_statistic(&[], &[1.0]), 0.0);
        assert_eq!(ks_statistic(&[1.0], &[]), 0.0);
    }

    #[test]
    fn ks_critical_value_real_massey_1951_coefficients() {
        let d05 = ks_critical_value(10, 10, 0.05);
        let expected05 = 1.36 * ((20.0_f64) / 100.0).sqrt();
        assert!((d05 - expected05).abs() < 1e-9, "d05 = {d05}");

        let d01 = ks_critical_value(10, 10, 0.01);
        let expected01 = 1.63 * ((20.0_f64) / 100.0).sqrt();
        assert!((d01 - expected01).abs() < 1e-9, "d01 = {d01}");
        assert!(d01 > d05);
    }

    #[test]
    fn ks_critical_value_empty_sample_is_infinite() {
        assert!(ks_critical_value(0, 5, 0.05).is_infinite());
        assert!(ks_critical_value(5, 0, 0.05).is_infinite());
    }

    #[test]
    fn detect_drift_ks_native_finds_no_drift_on_a_stable_vocabulary() {
        let log = EventLog {
            attributes: BTreeMap::new(),
            traces: vec![
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
                trace_of(&["A", "B"]),
            ],
        };
        let report = detect_drift_ks_native(&log, "concept:name", 2, 0.05);
        assert_eq!(report.drifts_detected, 0);
        assert_eq!(report.method, "j_measure_ks_test");
        assert_eq!(report.window_size, 2);
        assert!((report.alpha - 0.05).abs() < 1e-12);
    }

    #[test]
    fn detect_drift_ks_native_detects_a_real_vocabulary_shift() {
        // A pure two-activity chain always yields J=0.0 (only one distinct
        // predecessor role); real informativeness needs >=2 distinct
        // predecessor roles per window. Chain length 3 (2 pairs) gives
        // J=log2(2)/2=0.5 per pair; chain length 6 (5 pairs) gives
        // J=log2(5)/5≈0.4644 per pair -- a real, numerically distinct
        // constant even though every individual transition is deterministic
        // in both regimes.
        let mut traces = Vec::new();
        for _ in 0..8 {
            traces.push(trace_of(&["A", "B", "C"]));
        }
        for _ in 0..8 {
            traces.push(trace_of(&["X1", "X2", "X3", "X4", "X5", "X6"]));
        }
        let log = EventLog {
            attributes: BTreeMap::new(),
            traces,
        };
        let report = detect_drift_ks_native(&log, "concept:name", 8, 0.05);
        assert!(
            !report.drifts.is_empty(),
            "expected at least one real KS-flagged drift point"
        );
        for drift in &report.drifts {
            assert_eq!(drift.kind, "concept_drift_ks");
            assert!(drift.ks_statistic > drift.critical_value);
            assert!(drift.ks_statistic.is_finite() && drift.critical_value.is_finite());
        }
    }

    #[test]
    fn detect_drift_ks_native_clamps_zero_window_size_to_one() {
        let log = EventLog {
            attributes: BTreeMap::new(),
            traces: vec![trace_of(&["A"]), trace_of(&["B"])],
        };
        let report = detect_drift_ks_native(&log, "concept:name", 0, 0.05);
        assert_eq!(report.window_size, 1);
    }
}
