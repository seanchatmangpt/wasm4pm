//! Remaining Time Prediction — answers "When will this case complete?"
//!
//! Builds a statistical model from completed traces in an event log. For each
//! combination of (last activity, prefix length) the model records the empirical
//! distribution of remaining time (milliseconds from the current event to trace
//! completion). A Weibull survival model is fitted to overall case durations for
//! hazard-rate estimation.
//!
//! ## WASM exports
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `build_remaining_time_model` | Train model from a completed event log |
//! | `predict_case_duration` | Point estimate for a running case prefix |
//! | `predict_hazard_rate` | Instantaneous hazard at elapsed time *t* |

use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use crate::error::{codes, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue};
use crate::state::{get_or_init_state, StoredObject};

// ---------------------------------------------------------------------------
// Internal model types (serialized to JSON for handle storage)
// ---------------------------------------------------------------------------

/// Per-bucket (last_activity, prefix_length) statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct BucketStats {
    mean_ms: f64,
    std_ms: f64,
    count: usize,
}

/// Weibull distribution parameters fitted via method-of-moments.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WeibullParams {
    /// Shape parameter (k). k < 1 -> decreasing hazard, k > 1 -> increasing.
    shape: f64,
    /// Scale parameter (lambda) in milliseconds.
    scale: f64,
}

/// Serializable remaining-time model.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemainingTimeModel {
    /// (last_activity, prefix_length) -> bucket statistics
    buckets: HashMap<String, BucketStats>, // key = "activity|prefix_len"
    /// Fallback: global remaining-time stats (all prefixes combined)
    global: BucketStats,
    /// Weibull params fitted to complete case durations
    weibull: WeibullParams,
    /// Median case duration in ms (used as fallback)
    median_duration_ms: f64,
}

fn bucket_key(activity: &str, prefix_len: usize) -> String {
    format!("{}|{}", activity, prefix_len)
}

// ---------------------------------------------------------------------------
// Weibull fitting (method of moments)
// ---------------------------------------------------------------------------

/// Approximate Weibull shape *k* from coefficient of variation (cv = sigma/mu).
fn weibull_shape_from_cv(cv: f64) -> f64 {
    if cv <= 0.0 || !cv.is_finite() {
        return 1.0; // degenerate -> exponential
    }
    cv.powf(-1.086).clamp(0.1, 20.0)
}

/// Weibull scale lambda from mean and shape.
fn weibull_scale(mean: f64, k: f64) -> f64 {
    let g = gamma_approx(1.0 + 1.0 / k);
    if g > 0.0 {
        mean / g
    } else {
        mean
    }
}

/// Lanczos approximation of Gamma(x) for x > 0.
fn gamma_approx(x: f64) -> f64 {
    const P: [f64; 8] = [
        676.5203681218851,
        -1259.1392167224028,
        771.323_428_777_653_1,
        -176.615_029_162_140_6,
        12.507343278686905,
        -0.13857109526572012,
        9.984_369_578_019_572e-6,
        1.5056327351493116e-7,
    ];
    if x < 0.5 {
        std::f64::consts::PI / ((std::f64::consts::PI * x).sin() * gamma_approx(1.0 - x))
    } else {
        let x = x - 1.0;
        let mut a = 0.999_999_999_999_809_9_f64;
        for (i, &p) in P.iter().enumerate() {
            a += p / (x + i as f64 + 1.0);
        }
        let t = x + 7.5;
        (2.0 * std::f64::consts::PI).sqrt() * t.powf(x + 0.5) * (-t).exp() * a
    }
}

// ---------------------------------------------------------------------------
// Model building
// ---------------------------------------------------------------------------

/// Build a remaining-time prediction model from a completed event log.
#[wasm_bindgen]
pub fn build_remaining_time_model(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let (bucket_samples, mut case_durations) = state.with_object(log_handle, |obj| {
        match obj {
            Some(StoredObject::EventLog(log)) => {
                // Fix A+B: FxHashMap with integer tuple keys eliminates ~190K String
                // allocs on large logs. Activity names are interned to u32 IDs locally.
                let mut activity_ids: FxHashMap<&str, u32> = FxHashMap::default();
                let mut next_id = 0u32;
                let mut id_to_activity: Vec<&str> = Vec::new();
                let mut bucket_samples: FxHashMap<(u32, usize), Vec<f64>> =
                    FxHashMap::default();
                let mut case_durations: Vec<f64> = Vec::new();

                for trace in &log.traces {
                    let events: Vec<(&str, i64)> = trace
                        .events
                        .iter()
                        .filter_map(|e| {
                            let act =
                                e.attributes.get(activity_key).and_then(|v| v.as_string())?;
                            let ts = match e.attributes.get(timestamp_key) {
                                Some(AttributeValue::Date(d)) => parse_timestamp_ms(d),
                                Some(AttributeValue::String(s)) => parse_timestamp_ms(s),
                                Some(AttributeValue::Int(ms)) => Some(*ms),
                                _ => None,
                            }?;
                            Some((act, ts))
                        })
                        .collect();

                    if events.len() < 2 {
                        continue;
                    }

                    let trace_start = match events.first() {
                        Some((_, ts)) => *ts,
                        None => continue,
                    };
                    let trace_end = match events.last() {
                        Some((_, ts)) => *ts,
                        None => continue,
                    };
                    let duration = (trace_end - trace_start) as f64;
                    if duration <= 0.0 {
                        continue;
                    }
                    case_durations.push(duration);

                    for (i, (act, ts)) in events.iter().enumerate() {
                        let act_id = *activity_ids.entry(act).or_insert_with(|| {
                            let id = next_id;
                            next_id += 1;
                            id_to_activity.push(act);
                            id
                        });
                        let remaining = (trace_end - ts) as f64;
                        let prefix_len = i + 1;
                        bucket_samples
                            .entry((act_id, prefix_len))
                            .or_default()
                            .push(remaining);
                    }
                }

                // Convert integer tuple keys back to String keys for the serializable
                // model. Happens once at build time, not per event.
                let bucket_samples_str: HashMap<String, Vec<f64>> = bucket_samples
                    .into_iter()
                    .map(|((act_id, prefix_len), samples)| {
                        let act = id_to_activity[act_id as usize];
                        (bucket_key(act, prefix_len), samples)
                    })
                    .collect();

                Ok((bucket_samples_str, case_durations))
            }
            Some(_) => Err(wasm_err(codes::INVALID_HANDLE, "Handle is not an EventLog")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("EventLog handle not found: {}", log_handle),
            )),
        }
    })?;

    if case_durations.is_empty() {
        return Err(wasm_err(
            codes::INVALID_INPUT,
            "No valid completed traces with timestamps found",
        ));
    }

    let buckets: HashMap<String, BucketStats> = bucket_samples
        .into_iter()
        .map(|(key, samples)| {
            let stats = compute_stats(&samples);
            (key, stats)
        })
        .collect();

    let global = if buckets.is_empty() {
        compute_stats(&case_durations)
    } else {
        let total_count: usize = buckets.values().map(|b| b.count).sum();
        let weighted_mean: f64 = buckets
            .values()
            .map(|b| b.mean_ms * b.count as f64)
            .sum::<f64>()
            / total_count as f64;
        let weighted_var: f64 = buckets
            .values()
            .map(|b| (b.std_ms.powi(2) + b.mean_ms.powi(2)) * b.count as f64)
            .sum::<f64>()
            / total_count as f64
            - weighted_mean.powi(2);
        BucketStats {
            mean_ms: weighted_mean,
            // branchless non-neg floor: compiles to MAXSD on x86-64, f64.max on wasm32
            std_ms: weighted_var.max(0.0).sqrt(),
            count: total_count,
        }
    };

    let dur_stats = compute_stats(&case_durations);
    let cv = if dur_stats.mean_ms > 0.0 {
        dur_stats.std_ms / dur_stats.mean_ms
    } else {
        1.0
    };
    let shape = weibull_shape_from_cv(cv);
    let scale = weibull_scale(dur_stats.mean_ms, shape);

    // Fix C: sort in-place; case_durations is not used after this point.
    let median_duration_ms = {
        case_durations
            .sort_unstable_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        case_durations[case_durations.len() / 2]
    };

    let model = RemainingTimeModel {
        buckets,
        global,
        weibull: WeibullParams { shape, scale },
        median_duration_ms,
    };

    let json = serde_json::to_string(&model).map_err(|e| {
        wasm_err(
            codes::INTERNAL_ERROR,
            format!("Serialization failed: {}", e),
        )
    })?;
    let handle = state.store_object(StoredObject::JsonString(json))?;
    Ok(crate::error::js_val(&handle))
}

// ---------------------------------------------------------------------------
// Remaining-time prediction
// ---------------------------------------------------------------------------

/// Predict remaining time for a running case given its activity prefix.
#[wasm_bindgen]
pub fn predict_case_duration(model_handle: &str, prefix_json: &str) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| wasm_err(codes::INVALID_INPUT, format!("Invalid prefix JSON: {}", e)))?;

    if prefix.is_empty() {
        return Err(wasm_err(codes::INVALID_INPUT, "Prefix must be non-empty"));
    }

    let state = get_or_init_state();

    state.with_object(model_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not a RemainingTimeModel",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("Model handle not found: {}", model_handle),
                ))
            }
        };

        let model: RemainingTimeModel = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Model deserialization failed: {}", e),
            )
        })?;

        let last_activity = match prefix.last() {
            Some(act) => act,
            None => {
                return Err(crate::error::js_val("Cannot predict on empty prefix"));
            }
        };
        let prefix_len = prefix.len();

        // Strategy 1: exact bucket
        let exact_key = bucket_key(last_activity, prefix_len);
        if let Some(bucket) = model.buckets.get(&exact_key) {
            let confidence = confidence_from_bucket(bucket, &model.global);
            let result = serde_json::json!({
                "remaining_ms": bucket.mean_ms,
                "confidence": confidence,
                "method": format!("bucket({})", exact_key)
            });
            return Ok(crate::error::js_val(&result.to_string()));
        }

        // Strategy 2: same activity, any prefix length
        let activity_prefix = format!("{}|", last_activity); // one alloc before iter
        let activity_buckets: Vec<&BucketStats> = model
            .buckets
            .iter()
            .filter(|(k, _)| k.starts_with(activity_prefix.as_str()))
            .map(|(_, v)| v)
            .collect();

        if !activity_buckets.is_empty() {
            let total_count: usize = activity_buckets.iter().map(|b| b.count).sum();
            let weighted_mean: f64 = activity_buckets
                .iter()
                .map(|b| b.mean_ms * b.count as f64)
                .sum::<f64>()
                / total_count as f64;
            let bucket_avg = BucketStats {
                mean_ms: weighted_mean,
                std_ms: 0.0,
                count: total_count,
            };
            let confidence = confidence_from_bucket(&bucket_avg, &model.global) * 0.9;
            let result = serde_json::json!({
                "remaining_ms": weighted_mean,
                "confidence": confidence,
                "method": format!("activity_avg({})", last_activity)
            });
            return Ok(crate::error::js_val(&result.to_string()));
        }

        // Strategy 3: same prefix length, any activity
        let suffix = format!("|{}", prefix_len);
        let length_buckets: Vec<&BucketStats> = model
            .buckets
            .iter()
            .filter(|(k, _)| k.ends_with(&suffix))
            .map(|(_, v)| v)
            .collect();

        if !length_buckets.is_empty() {
            let total_count: usize = length_buckets.iter().map(|b| b.count).sum();
            let weighted_mean: f64 = length_buckets
                .iter()
                .map(|b| b.mean_ms * b.count as f64)
                .sum::<f64>()
                / total_count as f64;
            let confidence = (total_count as f64 / (total_count as f64 + 10.0)) * 0.6;
            let result = serde_json::json!({
                "remaining_ms": weighted_mean,
                "confidence": confidence,
                "method": format!("prefix_len_avg({})", prefix_len)
            });
            return Ok(crate::error::js_val(&result.to_string()));
        }

        // Strategy 4: global fallback
        // Confidence is derived from the coefficient of variation (cv = std / mean).
        // High spread → low confidence; low spread → higher confidence. Capped in [0, 1].
        let cv = model.global.std_ms / (model.global.mean_ms + 1.0);
        let fallback_confidence = (1.0 - cv.min(1.0)).max(0.0);
        let result = serde_json::json!({
            "remaining_ms": model.global.mean_ms,
            "confidence": fallback_confidence,
            "method": "global_fallback"
        });
        Ok(crate::error::js_val(&result.to_string()))
    })
}

// ---------------------------------------------------------------------------
// Hazard-rate estimation
// ---------------------------------------------------------------------------

/// Estimate the hazard rate at a given elapsed time using the Weibull survival
/// model fitted to historical case durations.
#[wasm_bindgen]
pub fn predict_hazard_rate(model_handle: &str, elapsed_ms: f64) -> Result<JsValue, JsValue> {
    if elapsed_ms < 0.0 {
        return Err(wasm_err(
            codes::INVALID_INPUT,
            "elapsed_ms must be non-negative",
        ));
    }

    let state = get_or_init_state();

    state.with_object(model_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not a RemainingTimeModel",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("Model handle not found: {}", model_handle),
                ))
            }
        };

        let model: RemainingTimeModel = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Model deserialization failed: {}", e),
            )
        })?;

        let k = model.weibull.shape;
        let lambda = model.weibull.scale;

        if lambda <= 0.0 {
            return Err(wasm_err(
                codes::INTERNAL_ERROR,
                "Invalid Weibull scale (lambda <= 0)",
            ));
        }

        let t = elapsed_ms.max(1.0);
        let t_over_lambda = t / lambda;

        let cumulative_hazard = t_over_lambda.powf(k);
        let survival = (-cumulative_hazard).exp();
        let hazard_rate = (k / lambda) * t_over_lambda.powf(k - 1.0);

        let median_remaining =
            lambda * (cumulative_hazard + std::f64::consts::LN_2).powf(1.0 / k) - t;
        // branchless non-neg floor: compiles to MAXSD on x86-64, f64.max on wasm32
        let median_remaining = median_remaining.max(0.0);

        let result = serde_json::json!({
            "hazard_rate": hazard_rate,
            "survival_probability": survival,
            "cumulative_hazard": cumulative_hazard,
            "median_remaining_ms": median_remaining,
            "shape": k,
            "scale": lambda
        });

        Ok(crate::error::js_val(&result.to_string()))
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn compute_stats(samples: &[f64]) -> BucketStats {
    let n = samples.len();
    if n == 0 {
        return BucketStats {
            mean_ms: 0.0,
            std_ms: 0.0,
            count: 0,
        };
    }
    let mean = samples.iter().sum::<f64>() / n as f64;
    let variance = if n > 1 {
        samples.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1) as f64
    } else {
        0.0
    };
    BucketStats {
        mean_ms: mean,
        std_ms: variance.sqrt(),
        count: n,
    }
}

fn confidence_from_bucket(bucket: &BucketStats, global: &BucketStats) -> f64 {
    let size_factor = bucket.count as f64 / (bucket.count as f64 + 10.0);

    let bucket_cv = if bucket.mean_ms > 0.0 {
        bucket.std_ms / bucket.mean_ms
    } else {
        0.0
    };
    let global_cv = if global.mean_ms > 0.0 {
        global.std_ms / global.mean_ms
    } else {
        1.0
    };
    let precision_factor = if global_cv > 0.0 {
        (1.0 - bucket_cv / global_cv).clamp(0.0, 1.0)
    } else {
        0.5
    };

    (0.6 * size_factor + 0.4 * precision_factor).min(0.99)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_stats() {
        let samples = vec![10.0, 20.0, 30.0];
        let stats = compute_stats(&samples);
        assert!((stats.mean_ms - 20.0).abs() < 1e-9);
        assert!(stats.std_ms > 0.0);
        assert_eq!(stats.count, 3);
    }

    #[test]
    fn test_compute_stats_empty() {
        let stats = compute_stats(&[]);
        assert_eq!(stats.count, 0);
        assert_eq!(stats.mean_ms, 0.0);
    }

    #[test]
    fn test_weibull_shape_exponential() {
        let k = weibull_shape_from_cv(1.0);
        assert!((k - 1.0).abs() < 0.1);
    }

    #[test]
    fn test_weibull_shape_increasing_hazard() {
        let k = weibull_shape_from_cv(0.5);
        assert!(k > 1.0);
    }

    #[test]
    fn test_gamma_approx() {
        assert!((gamma_approx(1.0) - 1.0).abs() < 1e-6);
        assert!((gamma_approx(2.0) - 1.0).abs() < 1e-6);
        assert!((gamma_approx(3.0) - 2.0).abs() < 1e-6);
    }

    #[test]
    fn test_confidence_high_sample() {
        let bucket = BucketStats {
            mean_ms: 100.0,
            std_ms: 10.0,
            count: 100,
        };
        let global = BucketStats {
            mean_ms: 200.0,
            std_ms: 100.0,
            count: 1000,
        };
        let conf = confidence_from_bucket(&bucket, &global);
        assert!(conf > 0.5);
    }

    #[test]
    fn test_bucket_key_format() {
        assert_eq!(bucket_key("Approve", 3), "Approve|3");
    }
}
