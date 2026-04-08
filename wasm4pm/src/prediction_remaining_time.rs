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
    /// Shape parameter (k). k < 1 → decreasing hazard, k > 1 → increasing.
    shape: f64,
    /// Scale parameter (λ) in milliseconds.
    scale: f64,
}

/// Serializable remaining-time model.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemainingTimeModel {
    /// (last_activity, prefix_length) → bucket statistics
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

/// Approximate Weibull shape *k* from coefficient of variation (cv = σ/μ).
/// Uses the Newton-Raphson-safe closed-form approximation:
///   k ≈ (cv)^{-1.086}   (accurate to ~2 % for 0.2 ≤ cv ≤ 5)
fn weibull_shape_from_cv(cv: f64) -> f64 {
    if cv <= 0.0 || !cv.is_finite() {
        return 1.0; // degenerate → exponential
    }
    cv.powf(-1.086).max(0.1).min(20.0)
}

/// Weibull scale λ from mean and shape: λ = mean / Γ(1 + 1/k).
/// Uses Stirling-like approximation for Γ since `std` has no gamma fn.
fn weibull_scale(mean: f64, k: f64) -> f64 {
    let g = gamma_approx(1.0 + 1.0 / k);
    if g > 0.0 {
        mean / g
    } else {
        mean
    }
}

/// Lanczos approximation of Γ(x) for x > 0.
fn gamma_approx(x: f64) -> f64 {
    // Lanczos coefficients (g=7)
    const P: [f64; 8] = [
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];
    if x < 0.5 {
        std::f64::consts::PI / ((std::f64::consts::PI * x).sin() * gamma_approx(1.0 - x))
    } else {
        let x = x - 1.0;
        let mut a = 0.99999999999980993_f64;
        for (i, &p) in P.iter().enumerate() {
            a += p / (x + i as f64 + 1.0);
        }
        let t = x + 7.5; // g + 0.5
        (2.0 * std::f64::consts::PI).sqrt() * t.powf(x + 0.5) * (-t).exp() * a
    }
}

// ---------------------------------------------------------------------------
// Model building
// ---------------------------------------------------------------------------

/// Build a remaining-time prediction model from a completed event log.
///
/// # Parameters
/// - `log_handle` — handle to an `EventLog` in state
/// - `activity_key` — attribute name for activity labels (e.g. `"concept:name"`)
/// - `timestamp_key` — attribute name for event timestamps (e.g. `"time:timestamp"`)
///
/// # Returns
/// A string handle to the stored model (internally a `JsonString`).
///
/// ```javascript
/// const model = pm.build_remaining_time_model(logHandle, 'concept:name', 'time:timestamp');
/// ```
#[wasm_bindgen]
pub fn build_remaining_time_model(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    // Collect per-bucket samples and case durations from the log.
    let (bucket_samples, case_durations) = state.with_object(log_handle, |obj| {
        match obj {
            Some(StoredObject::EventLog(log)) => {
                let mut bucket_samples: HashMap<String, Vec<f64>> = HashMap::new();
                let mut case_durations: Vec<f64> = Vec::new();

                for trace in &log.traces {
                    // Extract (activity, timestamp_ms) pairs
                    let events: Vec<(&str, i64)> = trace
                        .events
                        .iter()
                        .filter_map(|e| {
                            let act = e.attributes.get(activity_key).and_then(|v| v.as_string())?;
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

                    let trace_start = events.first().unwrap().1;
                    let trace_end = events.last().unwrap().1;
                    let duration = (trace_end - trace_start) as f64;
                    if duration <= 0.0 {
                        continue;
                    }
                    case_durations.push(duration);

                    // For each prefix position, record remaining time
                    for (i, (act, ts)) in events.iter().enumerate() {
                        let remaining = (trace_end - ts) as f64;
                        let prefix_len = i + 1;
                        let key = bucket_key(act, prefix_len);
                        bucket_samples.entry(key).or_default().push(remaining);
                    }
                }

                Ok((bucket_samples, case_durations))
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

    // Compute bucket statistics
    let buckets: HashMap<String, BucketStats> = bucket_samples
        .into_iter()
        .map(|(key, samples)| {
            let stats = compute_stats(&samples);
            (key, stats)
        })
        .collect();

    // Global remaining-time stats (all samples flattened)
    let all_remaining: Vec<f64> = buckets
        .values()
        .flat_map(|b| std::iter::repeat_n(b.mean_ms, b.count))
        .collect();
    let global = if all_remaining.is_empty() {
        compute_stats(&case_durations)
    } else {
        // Weighted average from bucket means
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
            std_ms: weighted_var.max(0.0).sqrt(),
            count: total_count,
        }
    };

    // Fit Weibull to case durations
    let dur_stats = compute_stats(&case_durations);
    let cv = if dur_stats.mean_ms > 0.0 {
        dur_stats.std_ms / dur_stats.mean_ms
    } else {
        1.0
    };
    let shape = weibull_shape_from_cv(cv);
    let scale = weibull_scale(dur_stats.mean_ms, shape);

    // Median duration
    let median_duration_ms = {
        let mut sorted = case_durations.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        sorted[sorted.len() / 2]
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
    Ok(JsValue::from_str(&handle))
}

// ---------------------------------------------------------------------------
// Remaining-time prediction
// ---------------------------------------------------------------------------

/// Predict remaining time for a running case given its activity prefix.
///
/// # Parameters
/// - `model_handle` — handle returned by `build_remaining_time_model`
/// - `prefix_json` — JSON array of activity strings, e.g. `'["Register","Check"]'`
///
/// # Returns
/// JSON string:
/// ```json
/// {
///   "remaining_ms": 54000.0,
///   "confidence": 0.82,
///   "method": "bucket(Check|2)"
/// }
/// ```
///
/// Lookup strategy (most specific → least):
/// 1. Exact bucket match `(last_activity, prefix_length)`
/// 2. Same `last_activity`, any prefix length (weighted avg of matching buckets)
/// 3. Same `prefix_length`, any activity
/// 4. Global fallback
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

        let last_activity = prefix.last().unwrap();
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
            return Ok(JsValue::from_str(&result.to_string()));
        }

        // Strategy 2: same activity, any prefix length
        let activity_buckets: Vec<&BucketStats> = model
            .buckets
            .iter()
            .filter(|(k, _)| k.starts_with(&format!("{}|", last_activity)))
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
            return Ok(JsValue::from_str(&result.to_string()));
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
            return Ok(JsValue::from_str(&result.to_string()));
        }

        // Strategy 4: global fallback
        let result = serde_json::json!({
            "remaining_ms": model.global.mean_ms,
            "confidence": 0.3,
            "method": "global_fallback"
        });
        Ok(JsValue::from_str(&result.to_string()))
    })
}

// ---------------------------------------------------------------------------
// Hazard-rate estimation
// ---------------------------------------------------------------------------

/// Estimate the hazard rate at a given elapsed time using the Weibull survival
/// model fitted to historical case durations.
///
/// # Parameters
/// - `model_handle` — handle returned by `build_remaining_time_model`
/// - `elapsed_ms` — milliseconds elapsed since case start
///
/// # Returns
/// JSON string:
/// ```json
/// {
///   "hazard_rate": 0.00012,
///   "survival_probability": 0.43,
///   "cumulative_hazard": 0.844,
///   "median_remaining_ms": 25000.0,
///   "shape": 1.8,
///   "scale": 120000.0
/// }
/// ```
///
/// - `hazard_rate` h(t) = (k/λ)(t/λ)^{k-1} — instantaneous failure rate
/// - `survival_probability` S(t) = exp(-(t/λ)^k) — P(duration > t)
/// - `cumulative_hazard` H(t) = (t/λ)^k
/// - `median_remaining_ms` — estimated time until 50 % completion probability
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
                "Invalid Weibull scale (λ ≤ 0)",
            ));
        }

        let t = elapsed_ms.max(1.0); // avoid t=0 singularity when k < 1
        let t_over_lambda = t / lambda;

        // Cumulative hazard H(t) = (t/λ)^k
        let cumulative_hazard = t_over_lambda.powf(k);

        // Survival S(t) = exp(-H(t))
        let survival = (-cumulative_hazard).exp();

        // Hazard rate h(t) = (k/λ)(t/λ)^{k-1}
        let hazard_rate = (k / lambda) * t_over_lambda.powf(k - 1.0);

        // Conditional median remaining time:
        // P(T > t + r | T > t) = 0.5
        // S(t+r)/S(t) = 0.5
        // exp(-((t+r)/λ)^k + (t/λ)^k) = 0.5
        // ((t+r)/λ)^k = (t/λ)^k + ln(2)
        // t+r = λ * ((t/λ)^k + ln(2))^{1/k}
        let median_remaining =
            lambda * (cumulative_hazard + std::f64::consts::LN_2).powf(1.0 / k) - t;
        let median_remaining = median_remaining.max(0.0);

        let result = serde_json::json!({
            "hazard_rate": hazard_rate,
            "survival_probability": survival,
            "cumulative_hazard": cumulative_hazard,
            "median_remaining_ms": median_remaining,
            "shape": k,
            "scale": lambda
        });

        Ok(JsValue::from_str(&result.to_string()))
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

/// Confidence heuristic: higher when bucket has many samples and low variance
/// relative to the global distribution.
fn confidence_from_bucket(bucket: &BucketStats, global: &BucketStats) -> f64 {
    // Sample-size component: n / (n + 10) — saturates toward 1
    let size_factor = bucket.count as f64 / (bucket.count as f64 + 10.0);

    // Precision component: 1 - (bucket_cv / global_cv), clamped [0, 1]
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
        (1.0 - bucket_cv / global_cv).max(0.0).min(1.0)
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
        // cv=1 → k ≈ 1 (exponential)
        let k = weibull_shape_from_cv(1.0);
        assert!((k - 1.0).abs() < 0.1);
    }

    #[test]
    fn test_weibull_shape_increasing_hazard() {
        // cv < 1 → k > 1 (increasing hazard = aging)
        let k = weibull_shape_from_cv(0.5);
        assert!(k > 1.0);
    }

    #[test]
    fn test_gamma_approx() {
        // Γ(1) = 1, Γ(2) = 1, Γ(3) = 2
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
