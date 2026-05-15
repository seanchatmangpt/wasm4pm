//! Nanosecond Clustering Family — branchless K-Means for process mining.
#![allow(clippy::needless_range_loop)] // branchless argmin: index carries centroid identity

use crate::state::{get_or_init_state, StoredObject};
use crate::ml::classification::extract_features;
use serde_json::json;
use wasm_bindgen::prelude::*;

const MAX_ITERATIONS: usize = 10;
const K_CLUSTERS: usize = 3;

#[wasm_bindgen]
pub fn discover_ml_cluster(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();
    
    let features = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let (f, _) = extract_features(log, activity_key);
            Ok(f)
        }
        _ => Err(crate::error::js_val("not_found")),
    })?;

    if features.is_empty() {
        // SAFETY: to_js_str required here; to_js(&json!()) silently returns {} on wasm32.
        return crate::utilities::to_js_str(&json!({
            "algorithm": "ml_cluster",
            "error": "Insufficient data",
            "clusters": []
        }));
    }

    let n = features.len();
    let k = K_CLUSTERS.min(n);
    
    // Initialize centroids evenly spaced
    let mut centroids = vec![[0.0, 0.0]; k];
    for i in 0..k {
        centroids[i] = features[i * (n / k)];
    }

    let mut assignments = vec![0; n];
    
    for _ in 0..MAX_ITERATIONS {
        let mut changed = false;
        
        for i in 0..n {
            let f = features[i];
            let mut best_dist = f64::MAX;
            let mut best_c = 0;
            
            for j in 0..k {
                let c = centroids[j];
                let dist = (f[0] - c[0])*(f[0] - c[0]) + (f[1] - c[1])*(f[1] - c[1]);
                // Branchless argmin: select j when dist < best_dist, else keep best_c.
                let is_better = (dist < best_dist) as usize;
                best_c    = j    * is_better + best_c * (1 - is_better);
                best_dist = best_dist.min(dist); // maps to fmin — no branch
            }
            
            if assignments[i] != best_c {
                assignments[i] = best_c;
                changed = true;
            }
        }
        
        if !changed { break; }
        
        let mut new_centroids = vec![[0.0, 0.0]; k];
        let mut counts = vec![0; k];
        
        for i in 0..n {
            let c = assignments[i];
            new_centroids[c][0] += features[i][0];
            new_centroids[c][1] += features[i][1];
            counts[c] += 1;
        }
        
        for j in 0..k {
            if counts[j] > 0 {
                centroids[j][0] /= counts[j] as f64;
                centroids[j][1] /= counts[j] as f64;
            }
        }
    }

    // SAFETY: to_js_str required here; to_js(&json!()) silently returns {} on wasm32.
    crate::utilities::to_js_str(&json!({
        "algorithm": "ml_cluster",
        "k": k,
        "centroids": centroids,
        "assignments": assignments
    }))
}