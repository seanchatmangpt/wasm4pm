//! Nanosecond Classification Family — branchless k-NN for process mining.

use crate::models::{parse_timestamp_ms, AttributeValue, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

const MIN_SAMPLES: usize = 10;
const TRAIN_SPLIT_RATIO: f64 = 0.8;
const K_NEIGHBORS: usize = 3;
const SHORT_THRESHOLD: f64 = 10.0;
const MEDIUM_THRESHOLD: f64 = 30.0;
const TIME_KEY: &str = "time:timestamp";

/// Number of per-trace features produced by [`extract_features`].
pub const N_FEATURES: usize = 5;
/// Per-trace feature vector:
/// `[event_count, unique_activities, duration_secs, mean_gap_secs, max_activity_repetition]`.
pub type FeatureVec = [f64; N_FEATURES];

#[derive(Copy, Clone, Debug)]
struct Neighbor {
    dist: f64,
    label: u8,
}

#[inline(always)]
fn sq_dist<const D: usize>(a: &[f64; D], b: &[f64; D]) -> f64 {
    let mut acc = 0.0;
    for d in 0..D {
        let diff = a[d] - b[d];
        acc += diff * diff;
    }
    acc
}

/// Per-dimension min-max normalization. Fits min/range on `fit_on` (train data)
/// and applies to `data`. Constant dimensions (range == 0) map to 0.0 so that
/// uninformative features carry zero distance weight. Deterministic.
pub fn normalize_features<const D: usize>(fit_on: &[[f64; D]], data: &[[f64; D]]) -> Vec<[f64; D]> {
    let mut min = [f64::INFINITY; D];
    let mut max = [f64::NEG_INFINITY; D];
    for f in fit_on {
        for d in 0..D {
            min[d] = min[d].min(f[d]);
            max[d] = max[d].max(f[d]);
        }
    }
    data.iter()
        .map(|f| {
            let mut out = [0.0f64; D];
            for d in 0..D {
                let range = max[d] - min[d];
                out[d] = if range > 0.0 && range.is_finite() {
                    (f[d] - min[d]) / range
                } else {
                    0.0
                };
            }
            out
        })
        .collect()
}

#[wasm_bindgen]
pub fn discover_ml_classify(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let (features, labels) = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(extract_features(log, activity_key)),
        _ => Err(crate::error::js_val("not_found")),
    })?;

    if features.len() < MIN_SAMPLES {
        return to_js_val(&json!({
            "algorithm": "ml_classify",
            "error": "Insufficient data for classification",
            "accuracy": 0.0
        }));
    }

    let train_size = (features.len() as f64 * TRAIN_SPLIT_RATIO) as usize;
    // Mixed magnitudes (seconds vs counts) — min-max normalize, fit on train only.
    let normalized = normalize_features(&features[..train_size], &features);
    let train_features = &normalized[..train_size];
    let train_labels = &labels[..train_size];
    let test_features = &normalized[train_size..];
    let test_labels = &labels[train_size..];

    // Compute full classification metrics, not just accuracy. A single accuracy
    // figure cannot reveal class imbalance — see `knn_internal_metrics`.
    let metrics = knn_internal_metrics(
        train_features,
        train_labels,
        test_features,
        test_labels,
        K_NEIGHBORS,
    );

    to_js_val(&json!({
        "algorithm": "ml_classify",
        "accuracy": metrics.accuracy,
        "macro_f1": metrics.macro_f1,
        "macro_precision": metrics.macro_precision,
        "macro_recall": metrics.macro_recall,
        "per_class_f1": metrics.per_class_f1,
        "test_samples": test_features.len(),
        "classes": ["short", "medium", "long"]
    }))
}

/// Feature extraction from event log — separated for AutoML use.
///
/// Walks `log.traces` directly (columnar form drops timestamps) and emits one
/// [`FeatureVec`] plus a trace-length class label per trace.
pub fn extract_features(log: &EventLog, activity_key: &str) -> (Vec<FeatureVec>, Vec<u8>) {
    let mut features = Vec::with_capacity(log.traces.len());
    let mut labels = Vec::with_capacity(log.traces.len());

    for trace in &log.traces {
        let len = trace.events.len() as f64;

        let mut activity_counts: BTreeMap<&str, u64> = BTreeMap::new();
        let mut timestamps: Vec<i64> = Vec::new();
        for event in &trace.events {
            if let Some(AttributeValue::String(s)) = event.attributes.get(activity_key) {
                *activity_counts.entry(s.as_str()).or_insert(0) += 1;
            }
            if let Some(val) = event.attributes.get(TIME_KEY) {
                let ms = match val {
                    AttributeValue::Date(d) => parse_timestamp_ms(d),
                    AttributeValue::String(s) => parse_timestamp_ms(s),
                    _ => None,
                };
                if let Some(ms) = ms {
                    timestamps.push(ms);
                }
            }
        }

        let unique = activity_counts.len() as f64;
        let max_repetition = activity_counts.values().max().copied().unwrap_or(0) as f64;

        let (duration_secs, mean_gap_secs) = if timestamps.len() >= 2 {
            let first = timestamps[0];
            let last = timestamps[timestamps.len() - 1];
            let dur = ((last - first) as f64 / 1000.0).max(0.0);
            (dur, dur / (timestamps.len() - 1) as f64)
        } else {
            (0.0, 0.0)
        };

        features.push([len, unique, duration_secs, mean_gap_secs, max_repetition]);
        let label = if len < SHORT_THRESHOLD {
            0
        } else if len <= MEDIUM_THRESHOLD {
            1
        } else {
            2
        };
        labels.push(label);
    }
    (features, labels)
}

/// Nanosecond Sweep: Multi-K Cross-Validation in a single pass over distances.
#[allow(clippy::needless_range_loop)] // branchless top-k insertion: index is the slot position
pub fn knn_sweep_cv<const D: usize>(
    features: &[[f64; D]],
    labels: &[u8],
    folds: usize,
    max_k: usize,
) -> Vec<f64> {
    let n = features.len();
    if n == 0 {
        return vec![0.0; max_k + 1];
    }
    let fold_size = n / folds;
    let max_k_eff = max_k.clamp(1, 32);
    let mut k_correct = vec![0usize; max_k_eff + 1];

    for fold in 0..folds {
        let test_start = fold * fold_size;
        let test_end = if fold == folds - 1 {
            n
        } else {
            (fold + 1) * fold_size
        };

        for i in test_start..test_end {
            let test_f = &features[i];
            let mut top_k = [Neighbor {
                dist: f64::MAX,
                label: 0,
            }; 32];
            let mut current_max_dist = f64::MAX;

            let train_ranges = [0..test_start, test_end..n];
            for range in train_ranges {
                for j in range {
                    let dist = sq_dist(test_f, &features[j]);

                    if dist < current_max_dist {
                        let mut d = dist;
                        let mut l = labels[j];
                        for n_idx in 0..max_k_eff {
                            let current = &mut top_k[n_idx];
                            let smaller = d < current.dist;
                            let old_d = current.dist;
                            let old_l = current.label;
                            current.dist = if smaller { d } else { old_d };
                            current.label = if smaller { l } else { old_l };
                            d = if smaller { old_d } else { d };
                            l = if smaller { old_l } else { l };
                        }
                        current_max_dist = top_k[max_k_eff - 1].dist;
                    }
                }
            }

            for k in 1..=max_k_eff {
                let mut votes = [0u16; 4];
                for n_idx in 0..k {
                    votes[top_k[n_idx].label as usize & 3] += 1;
                }
                let mut predicted = 0u8;
                let mut max_v = 0u16;
                for (label, &v) in votes.iter().enumerate() {
                    if v > max_v {
                        max_v = v;
                        predicted = label as u8;
                    }
                }
                if predicted == labels[i] {
                    k_correct[k] += 1;
                }
            }
        }
    }

    k_correct.into_iter().map(|c| c as f64 / n as f64).collect()
}

/// Classification metrics computed over the full confusion matrix for the
/// three trace-length classes (`short`, `medium`, `long`). All scores are in
/// `[0.0, 1.0]`. Macro-averaging treats classes equally regardless of support.
#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct KnnMetrics {
    pub accuracy: f64,
    pub macro_precision: f64,
    pub macro_recall: f64,
    pub macro_f1: f64,
    pub per_class_f1: [f64; 3],
}

/// Compute full classification metrics (accuracy, macro precision/recall/F1)
/// from a single pass of k-NN prediction. Mirrors the prediction logic of
/// [`knn_internal`] so the `accuracy` field is identical.
#[allow(clippy::needless_range_loop)] // branchless top-k insertion: index is the slot position
pub fn knn_internal_metrics<const D: usize>(
    train_x: &[[f64; D]],
    train_y: &[u8],
    test_x: &[[f64; D]],
    test_y: &[u8],
    k: usize,
) -> KnnMetrics {
    // 3x3 confusion matrix indexed [actual][predicted]. Labels are 0,1,2.
    let mut conf = [[0u64; 3]; 3];
    let k_eff = k.clamp(1, 32);

    for (i, test_f) in test_x.iter().enumerate() {
        let mut top_k = [Neighbor {
            dist: f64::MAX,
            label: 0,
        }; 32];
        let mut max_dist = f64::MAX;
        for (train_f, &label) in train_x.iter().zip(train_y.iter()) {
            let dist = sq_dist(test_f, train_f);
            if dist < max_dist {
                let mut d = dist;
                let mut l = label;
                for n in 0..k_eff {
                    let current = &mut top_k[n];
                    let smaller = d < current.dist;
                    let old_d = current.dist;
                    let old_l = current.label;
                    current.dist = if smaller { d } else { old_d };
                    current.label = if smaller { l } else { old_l };
                    d = if smaller { old_d } else { d };
                    l = if smaller { old_l } else { l };
                }
                max_dist = top_k[k_eff - 1].dist;
            }
        }
        let mut votes = [0u16; 4];
        for n in 0..k_eff {
            votes[top_k[n].label as usize & 3] += 1;
        }
        let mut predicted = 0u8;
        let mut max_v = 0u16;
        for (label, &v) in votes.iter().enumerate() {
            if v > max_v {
                max_v = v;
                predicted = label as u8;
            }
        }
        let actual = (test_y[i] as usize).min(2);
        let pred = (predicted as usize).min(2);
        conf[actual][pred] += 1;
    }

    let total: u64 = conf.iter().flatten().sum();
    let correct: u64 = (0..3).map(|c| conf[c][c]).sum();
    let accuracy = if total == 0 {
        0.0
    } else {
        correct as f64 / total as f64
    };

    let mut per_class_f1 = [0.0f64; 3];
    let mut sum_p = 0.0;
    let mut sum_r = 0.0;
    let mut sum_f = 0.0;
    let mut present = 0usize;
    for c in 0..3 {
        let tp = conf[c][c] as f64;
        let fp: f64 = (0..3).filter(|&r| r != c).map(|r| conf[r][c] as f64).sum();
        let fn_: f64 = (0..3).filter(|&p| p != c).map(|p| conf[c][p] as f64).sum();
        let support = tp + fn_;
        // Classes with zero support are skipped for macro-averaging — otherwise
        // a perfectly-predicted 2-class problem gets penalised for the absent third.
        if support == 0.0 {
            continue;
        }
        let precision = if tp + fp > 0.0 { tp / (tp + fp) } else { 0.0 };
        let recall = if tp + fn_ > 0.0 { tp / (tp + fn_) } else { 0.0 };
        let f1 = if precision + recall > 0.0 {
            2.0 * precision * recall / (precision + recall)
        } else {
            0.0
        };
        per_class_f1[c] = f1;
        sum_p += precision;
        sum_r += recall;
        sum_f += f1;
        present += 1;
    }
    let denom = present.max(1) as f64;
    KnnMetrics {
        accuracy,
        macro_precision: sum_p / denom,
        macro_recall: sum_r / denom,
        macro_f1: sum_f / denom,
        per_class_f1,
    }
}

/// Core k-NN implementation optimized for Nanosecond Architecture.
///
/// - Squared Euclidean distance over all `D` dimensions to avoid costly `sqrt`.
/// - Fixed-size stack array for neighbor list to avoid heap allocation.
/// - Branchless insertion logic for pipeline efficiency.
/// - Zero-copy sweep support for AutoML.
#[allow(clippy::needless_range_loop)] // branchless top-k insertion: index is the slot position
pub fn knn_internal<const D: usize>(
    train_x: &[[f64; D]],
    train_y: &[u8],
    test_x: &[[f64; D]],
    test_y: &[u8],
    k: usize,
) -> f64 {
    let mut correct = 0;
    let k_eff = k.clamp(1, 32);

    for (i, test_f) in test_x.iter().enumerate() {
        let mut top_k = [Neighbor {
            dist: f64::MAX,
            label: 0,
        }; 32];
        let mut max_dist = f64::MAX;

        for (train_f, &label) in train_x.iter().zip(train_y.iter()) {
            let dist = sq_dist(test_f, train_f);

            if dist < max_dist {
                let mut d = dist;
                let mut l = label;
                for n in 0..k_eff {
                    let current = &mut top_k[n];
                    let smaller = d < current.dist;
                    let old_d = current.dist;
                    let old_l = current.label;
                    current.dist = if smaller { d } else { old_d };
                    current.label = if smaller { l } else { old_l };
                    d = if smaller { old_d } else { d };
                    l = if smaller { old_l } else { l };
                }
                max_dist = top_k[k_eff - 1].dist;
            }
        }

        // Majority vote (labels 0, 1, 2)
        let mut votes = [0u16; 4];
        for n in 0..k_eff {
            let label = top_k[n].label as usize;
            votes[label & 3] += 1;
        }

        let mut predicted = 0u8;
        let mut max_v = 0u16;
        for (label, &v) in votes.iter().enumerate() {
            if v > max_v {
                max_v = v;
                predicted = label as u8;
            }
        }

        if predicted == test_y[i] {
            correct += 1;
        }
    }

    if test_x.is_empty() {
        return 0.0;
    }
    correct as f64 / test_x.len() as f64
}

fn to_js_val(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|s| crate::error::js_val(&s))
        .map_err(|e| crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string()))
}

#[cfg(test)]
mod feature_tests {
    use super::*;
    use crate::models::{Event, Trace};

    fn trace_with(activities: &[&str], timestamps: &[&str]) -> Trace {
        let mut trace = Trace::new();
        for (i, &a) in activities.iter().enumerate() {
            let mut ev = Event::new();
            ev.attributes
                .insert("concept:name".into(), AttributeValue::String(a.into()));
            if let Some(&ts) = timestamps.get(i) {
                ev.attributes
                    .insert(TIME_KEY.into(), AttributeValue::String(ts.into()));
            }
            trace.events.push(ev);
        }
        trace
    }

    #[test]
    fn extract_features_five_dims_hand_computed() {
        let mut log = EventLog::default();
        // 3 events, activities A,B,A → unique=2, max_rep=2.
        // Timestamps span 60s over 3 events → duration=60, mean gap=30.
        log.traces.push(trace_with(
            &["A", "B", "A"],
            &[
                "2024-01-01T00:00:00Z",
                "2024-01-01T00:00:30Z",
                "2024-01-01T00:01:00Z",
            ],
        ));
        let (features, labels) = extract_features(&log, "concept:name");
        assert_eq!(features.len(), 1);
        assert_eq!(features[0], [3.0, 2.0, 60.0, 30.0, 2.0]);
        assert_eq!(labels, vec![0]);
    }

    #[test]
    fn extract_features_no_timestamps_yields_zero_time_features() {
        let mut log = EventLog::default();
        log.traces.push(trace_with(&["A", "A", "A", "B"], &[]));
        let (features, _) = extract_features(&log, "concept:name");
        assert_eq!(features[0], [4.0, 2.0, 0.0, 0.0, 3.0]);
    }

    #[test]
    fn normalize_features_maps_train_extremes_to_unit_range() {
        let train = vec![[0.0, 10.0, 5.0, 1.0, 2.0], [10.0, 20.0, 5.0, 3.0, 4.0]];
        let normalized = normalize_features(&train, &train);
        assert_eq!(normalized[0], [0.0, 0.0, 0.0, 0.0, 0.0]);
        // Constant dimension (index 2) must map to 0.0, not NaN.
        assert_eq!(normalized[1], [1.0, 1.0, 0.0, 1.0, 1.0]);
    }
}
