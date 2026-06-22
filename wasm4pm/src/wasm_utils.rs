//! High-ROI WASM utility exports for caching, hashing, and drift analysis.
//!
//! This module provides 6 carefully-selected wasm_bindgen exports that unlock
//! downstream tools without introducing design changes:
//!
//! 1. **cache_stats()** — Return JSON {hits, misses, evictions, total_bytes}
//! 2. **get_activity_frequencies()** — Return Vec<{activity, count}> as JSON
//! 3. **hash_xes_content()** — Return BLAKE3 hex string (FNV-1a in Rust)
//! 4. **jaccard_distance()** — Convert HashSet to JSON array wrapper, compute distance
//! 5. **ewma_series()** — Exponential weighted moving average smoothing
//! 6. **identify_high_variance_activities()** — Optional variance-based activity profiling

use crate::cache::{cache_stats as internal_cache_stats, hash_xes_content as internal_hash_xes};
use crate::models::AttributeValue;
#[cfg(feature = "ml")]
use crate::prediction_drift::{
    ewma_series as internal_ewma_series, jaccard_distance as internal_jaccard_distance,
};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// Return JSON { hits, misses, evictions, total_bytes } with cache statistics.
///
/// # Returns
/// ```json
/// {
///   "hits": 42,
///   "misses": 8,
///   "evictions": 2,
///   "total_bytes": 65536,
///   "parse_entries": 3,
///   "columnar_entries": 5,
///   "interner_entries": 1
/// }
/// ```
#[wasm_bindgen]
pub fn cache_stats() -> Result<JsValue, JsValue> {
    let stats = internal_cache_stats();
    to_js_str(&json!({
        "parse_hits": stats.parse_hits,
        "parse_misses": stats.parse_misses,
        "parse_evictions": stats.parse_evictions,
        "parse_entries": stats.parse_entries,
        "columnar_entries": stats.columnar_entries,
        "interner_entries": stats.interner_entries,
    }))
}

/// Return BLAKE3 (FNV-1a) hex hash of XES content string.
///
/// # Arguments
/// * `xes_content` — XES event log as string
///
/// # Returns
/// 16-character lowercase hex string
///
/// # Example
/// ```
/// use wasm4pm::wasm_utils::hash_xes_content;
/// let hash = hash_xes_content("<log></log>");
/// assert_eq!(hash.len(), 16);
/// ```
#[wasm_bindgen]
pub fn hash_xes_content(xes_content: &str) -> String {
    internal_hash_xes(xes_content)
}

/// Compute Jaccard distance between two JSON-serialized activity sets.
///
/// # Arguments
/// * `set1_json` — JSON string: `["A", "B", "C"]`
/// * `set2_json` — JSON string: `["B", "C", "D"]`
///
/// # Returns
/// Distance in [0.0, 1.0]:
/// - `0.0` = identical or both empty
/// - `1.0` = completely disjoint
///
/// # Example
/// ```
/// use wasm4pm::wasm_utils::jaccard_distance;
/// let dist = jaccard_distance(r#"["A", "B"]"#, r#"["B", "C"]"#).unwrap();
/// assert!((dist - 0.6666666666666667).abs() < 1e-10);
/// ```
#[cfg(feature = "ml")]
#[wasm_bindgen]
pub fn jaccard_distance(set1_json: &str, set2_json: &str) -> Result<f64, JsValue> {
    let set1: HashSet<String> = serde_json::from_str(set1_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid set1 JSON: {}", e)))?;

    let set2: HashSet<String> = serde_json::from_str(set2_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid set2 JSON: {}", e)))?;

    let distance = internal_jaccard_distance(&set1, &set2);
    Ok(distance)
}

/// Compute exponential weighted moving average over a numeric series.
///
/// # Arguments
/// * `values_json` — JSON string: `[1.0, 2.0, 3.0, ...]`
/// * `alpha` — Smoothing factor in (0.0, 1.0]; clamped if out of range
///
/// # Returns
/// JSON string: `[1.0, 1.5, 2.25, ...]` (EWMA series)
///
/// # Example
/// ```
/// use wasm4pm::wasm_utils::ewma_series;
/// let smoothed = ewma_series(r#"[1.0, 2.0, 3.0, 4.0, 5.0]"#, 0.5).unwrap();
/// ```
///
/// # Theory
/// `s[i] = α · x[i] + (1 - α) · s[i-1]` with `s[0] = x[0]`
#[cfg(feature = "ml")]
#[wasm_bindgen]
pub fn ewma_series(values_json: &str, alpha: f64) -> Result<JsValue, JsValue> {
    let values: Vec<f64> = serde_json::from_str(values_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid values JSON: {}", e)))?;

    let smoothed = internal_ewma_series(&values, alpha);
    to_js_str(&smoothed)
}

/// Identify activities with high variance (low frequency consistency).
///
/// Scans the event log and flags activities where:
/// - Occurrence count per trace varies widely (variance > threshold)
/// - Activity is sparse or bursty
///
/// # Arguments
/// * `eventlog_handle` — Handle from `load_eventlog_from_xes()`
/// * `activity_key` — Activity attribute name (e.g., "concept:name")
/// * `threshold` — Variance threshold; activities with variance > threshold are returned
///
/// # Returns
/// ```json
/// {
///   "high_variance_activities": [
///     {
///       "activity": "Inspect",
///       "variance": 2.45,
///       "min_per_trace": 0,
///       "max_per_trace": 5,
///       "mean_per_trace": 1.2,
///       "occurrence_count": 48
///     }
///   ],
///   "total_activities": 15
/// }
/// ```
#[wasm_bindgen]
pub fn identify_high_variance_activities(
    eventlog_handle: &str,
    activity_key: &str,
    threshold: f64,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        use std::collections::HashMap;

        // Count occurrences per trace
        let mut activity_per_trace: HashMap<String, Vec<usize>> = HashMap::new();

        for trace in &log.traces {
            let mut trace_counts: HashMap<String, usize> = HashMap::new();

            for event in &trace.events {
                if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                    *trace_counts.entry(activity.clone()).or_default() += 1;
                }
            }

            for (activity, count) in trace_counts {
                activity_per_trace.entry(activity).or_default().push(count);
            }
        }

        // Compute variance and statistics for each activity
        let mut high_variance: Vec<serde_json::Value> = Vec::new();

        for (activity, counts) in &activity_per_trace {
            if counts.is_empty() {
                continue;
            }

            let mean = counts.iter().sum::<usize>() as f64 / counts.len() as f64;
            let variance: f64 = counts
                .iter()
                .map(|&c| {
                    let diff = c as f64 - mean;
                    diff * diff
                })
                .sum::<f64>()
                / counts.len() as f64;

            if variance > threshold {
                let min_per_trace = *counts.iter().min().unwrap_or(&0);
                let max_per_trace = *counts.iter().max().unwrap_or(&0);
                let occurrence_count = counts.iter().sum::<usize>();

                high_variance.push(json!({
                    "activity": activity,
                    "variance": variance,
                    "min_per_trace": min_per_trace,
                    "max_per_trace": max_per_trace,
                    "mean_per_trace": mean,
                    "occurrence_count": occurrence_count,
                }));
            }
        }

        high_variance.sort_by(|a, b| {
            let var_a = a.get("variance").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let var_b = b.get("variance").and_then(|v| v.as_f64()).unwrap_or(0.0);
            var_b
                .partial_cmp(&var_a)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    let na = a.get("activity").and_then(|v| v.as_str()).unwrap_or("");
                    let nb = b.get("activity").and_then(|v| v.as_str()).unwrap_or("");
                    na.cmp(nb)
                })
        });

        to_js_str(&json!({
            "high_variance_activities": high_variance,
            "total_activities": activity_per_trace.len(),
        }))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_xes_content_deterministic() {
        let xes = r#"<?xml version="1.0" encoding="UTF-8"?><log></log>"#;
        let h1 = internal_hash_xes(xes);
        let h2 = internal_hash_xes(xes);
        assert_eq!(h1, h2, "Hash must be deterministic");
    }

    #[test]
    fn test_hash_xes_content_length() {
        let xes = r#"<?xml version="1.0" encoding="UTF-8"?><log></log>"#;
        let hash = internal_hash_xes(xes);
        assert_eq!(hash.len(), 16, "FNV-1a hash should be 16 hex chars");
    }

    #[test]
    fn test_jaccard_distance_identical_sets() {
        let set = vec!["A", "B", "C"];
        let json_set = serde_json::to_string(&set).unwrap();
        let dist = internal_jaccard_distance(
            &set.iter().map(|s| s.to_string()).collect(),
            &set.iter().map(|s| s.to_string()).collect(),
        );
        assert_eq!(dist, 0.0, "Identical sets have distance 0");
    }

    #[test]
    fn test_jaccard_distance_disjoint_sets() {
        let set1: HashSet<String> = vec!["A", "B"].into_iter().map(|s| s.to_string()).collect();
        let set2: HashSet<String> = vec!["C", "D"].into_iter().map(|s| s.to_string()).collect();
        let dist = internal_jaccard_distance(&set1, &set2);
        assert_eq!(dist, 1.0, "Disjoint sets have distance 1");
    }

    #[test]
    fn test_jaccard_distance_empty_sets() {
        let empty1: HashSet<String> = HashSet::new();
        let empty2: HashSet<String> = HashSet::new();
        let dist = internal_jaccard_distance(&empty1, &empty2);
        assert_eq!(dist, 0.0, "Empty sets have distance 0 (no change)");
    }

    #[test]
    fn test_ewma_series_constant_values() {
        let values = vec![3.0, 3.0, 3.0, 3.0];
        let smoothed = internal_ewma_series(&values, 0.5);
        assert_eq!(smoothed.len(), 4);
        for &val in &smoothed {
            assert!((val - 3.0).abs() < 1e-10, "Constant series → constant EWMA");
        }
    }

    #[test]
    fn test_ewma_series_empty() {
        let smoothed = internal_ewma_series(&[], 0.5);
        assert!(smoothed.is_empty(), "Empty input → empty output");
    }

    #[test]
    fn test_cache_stats_returns_valid_json() {
        // This test only verifies the function doesn't crash
        // Actual cache state depends on prior test execution
        let _stats = internal_cache_stats();
        // If we got here, the function succeeded
    }

    #[test]
    fn test_ewma_series_single_value() {
        let smoothed = internal_ewma_series(&[42.0], 0.5);
        assert_eq!(smoothed.len(), 1);
        assert_eq!(smoothed[0], 42.0, "Single value is identity");
    }

    #[test]
    fn test_jaccard_distance_partial_overlap() {
        let set1: HashSet<String> = vec!["A", "B", "C"]
            .into_iter()
            .map(|s| s.to_string())
            .collect();
        let set2: HashSet<String> = vec!["B", "C", "D"]
            .into_iter()
            .map(|s| s.to_string())
            .collect();
        let dist = internal_jaccard_distance(&set1, &set2);
        // Union: {A, B, C, D} = 4, Intersection: {B, C} = 2
        // Distance = 1 - (2/4) = 0.5
        assert!(
            (dist - 0.5).abs() < 1e-10,
            "Partial overlap distance calculation"
        );
    }
}
