//! Nanosecond Classification Family — branchless k-NN for process mining.

use crate::state::{get_or_init_state, StoredObject};
use crate::models::EventLog;
use serde_json::json;
use wasm_bindgen::prelude::*;

const MIN_SAMPLES: usize = 10;
const TRAIN_SPLIT_RATIO: f64 = 0.8;
const K_NEIGHBORS: usize = 3;
const SHORT_THRESHOLD: f64 = 10.0;
const MEDIUM_THRESHOLD: f64 = 30.0;

#[derive(Copy, Clone, Debug)]
struct Neighbor {
    dist: f64,
    label: u8,
}

#[wasm_bindgen]
pub fn discover_ml_classify(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();
    
    let (features, labels) = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            Ok(extract_features(log, activity_key))
        }
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
    let train_features = &features[..train_size];
    let train_labels = &labels[..train_size];
    let test_features = &features[train_size..];
    let test_labels = &labels[train_size..];

    // AutoML-ready internal call
    let accuracy = knn_internal(train_features, train_labels, test_features, test_labels, K_NEIGHBORS);

    to_js_val(&json!({
        "algorithm": "ml_classify",
        "accuracy": accuracy,
        "test_samples": test_features.len(),
        "classes": ["short", "medium", "long"]
    }))
}

/// Feature extraction from event log — separated for AutoML use.
pub fn extract_features(log: &EventLog, activity_key: &str) -> (Vec<[f64; 2]>, Vec<u8>) {
    let col = log.to_columnar(activity_key);

    let num_traces = col.trace_offsets.len().saturating_sub(1);
    let mut features = Vec::with_capacity(num_traces);
    let mut labels = Vec::with_capacity(num_traces);
    
    let vocab_size = col.vocab.len();
    let mut seen = vec![false; vocab_size];
    let mut seen_list = Vec::with_capacity(vocab_size);
    
    for i in 0..num_traces {
        let start = col.trace_offsets[i];
        let end = col.trace_offsets[i+1];
        let len = (end - start) as f64;
        
        let mut unique = 0;
        for &ev in &col.events[start..end] {
            let ev_idx = ev as usize;
            if ev_idx < vocab_size && !seen[ev_idx] {
                seen[ev_idx] = true;
                seen_list.push(ev_idx);
                unique += 1;
            }
        }
        
        // Reset seen for next trace
        for idx in seen_list.drain(..) {
            seen[idx] = false;
        }
        
        features.push([len, unique as f64]);
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
pub fn knn_sweep_cv(
    features: &[[f64; 2]],
    labels: &[u8],
    folds: usize,
    max_k: usize,
) -> Vec<f64> {
    let n = features.len();
    if n == 0 { return vec![0.0; max_k + 1]; }
    let fold_size = n / folds;
    let max_k_eff = max_k.clamp(1, 32);
    let mut k_correct = vec![0usize; max_k_eff + 1];

    for fold in 0..folds {
        let test_start = fold * fold_size;
        let test_end = if fold == folds - 1 { n } else { (fold + 1) * fold_size };
        
        for i in test_start..test_end {
            let test_f = &features[i];
            let mut top_k = [Neighbor { dist: f64::MAX, label: 0 }; 32];
            let mut current_max_dist = f64::MAX;

            let train_ranges = [0..test_start, test_end..n];
            for range in train_ranges {
                for j in range {
                    let dx = test_f[0] - features[j][0];
                    let dy = test_f[1] - features[j][1];
                    let dist = dx*dx + dy*dy;
                    
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

/// Core k-NN implementation optimized for Nanosecond Architecture.
/// 
/// - Squared Euclidean distance to avoid costly `sqrt`.
/// - Fixed-size stack array for neighbor list to avoid heap allocation.
/// - Branchless insertion logic for pipeline efficiency.
/// - Zero-copy sweep support for AutoML.
#[allow(clippy::needless_range_loop)] // branchless top-k insertion: index is the slot position
pub fn knn_internal(
    train_x: &[[f64; 2]],
    train_y: &[u8],
    test_x: &[[f64; 2]],
    test_y: &[u8],
    k: usize
) -> f64 {
    let mut correct = 0;
    let k_eff = k.clamp(1, 32);
    
    for (i, test_f) in test_x.iter().enumerate() {
        let mut top_k = [Neighbor { dist: f64::MAX, label: 0 }; 32];
        let mut max_dist = f64::MAX;
        
        let tx = test_f[0];
        let ty = test_f[1];

        let train_chunks = train_x.chunks_exact(4);
        let train_y_chunks = train_y.chunks_exact(4);
        let rem_x = train_chunks.remainder();
        let rem_y = train_y_chunks.remainder();

        for (tc, tyc) in train_chunks.zip(train_y_chunks) {
            // Unrolled distance calculation to saturate pipeline and allow auto-vectorization
            let d0 = { let dx = tx - tc[0][0]; let dy = ty - tc[0][1]; dx*dx + dy*dy };
            let d1 = { let dx = tx - tc[1][0]; let dy = ty - tc[1][1]; dx*dx + dy*dy };
            let d2 = { let dx = tx - tc[2][0]; let dy = ty - tc[2][1]; dx*dx + dy*dy };
            let d3 = { let dx = tx - tc[3][0]; let dy = ty - tc[3][1]; dx*dx + dy*dy };

            // We only enter the branchless insertion loop if at least one candidate is better
            // This preserves branchless throughput for the common case (far neighbors)
            if d0 < max_dist || d1 < max_dist || d2 < max_dist || d3 < max_dist {
                for (dist, label) in [(d0, tyc[0]), (d1, tyc[1]), (d2, tyc[2]), (d3, tyc[3])] {
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
            }
        }

        for (train_f, &label) in rem_x.iter().zip(rem_y.iter()) {
            let dx = tx - train_f[0];
            let dy = ty - train_f[1];
            let dist = dx*dx + dy*dy;
            
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
    
    if test_x.is_empty() { return 0.0; }
    correct as f64 / test_x.len() as f64
}

fn to_js_val(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|s| crate::error::js_val(&s))
        .map_err(|e| crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string()))
}
