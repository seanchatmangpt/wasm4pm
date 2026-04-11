use crate::models::{parse_timestamp_ms, AttributeValue, TemporalProfile};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
/// Priority 4 — Temporal profile discovery and conformance.
///
/// A temporal profile records, for every directly-follows pair (A→B) in an
/// event log, the mean and standard deviation of the elapsed time (ms).
/// Conformance checking flags edges whose observed duration deviates more than
/// `zeta` standard deviations from the mean.
use wasm_bindgen::prelude::*;

/// Discover a temporal profile from an event log.
///
/// Returns a handle to a `TemporalProfile` stored in global state.
///
/// ```javascript
/// const profHandle = pm.discover_temporal_profile(logHandle, 'concept:name', 'time:timestamp');
/// const result = pm.check_temporal_conformance(logHandle, profHandle,
///                  'concept:name', 'time:timestamp', 2.0);
/// ```
#[wasm_bindgen]
pub fn discover_temporal_profile(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    let profile = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Accumulate (sum, sum_sq, count) per (A, B) pair
            let mut acc: std::collections::HashMap<(String, String), (f64, f64, usize)> =
                std::collections::HashMap::new();

            for trace in &log.traces {
                let pairs: Vec<(String, Option<i64>)> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        let act = e
                            .attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)?;
                        let ts = e.attributes.get(timestamp_key).and_then(|v| {
                            if let AttributeValue::Date(s) = v {
                                parse_timestamp_ms(s)
                            } else {
                                None
                            }
                        });
                        Some((act, ts))
                    })
                    .collect();

                for i in 0..pairs.len().saturating_sub(1) {
                    if let (Some(t1), Some(t2)) = (pairs[i].1, pairs[i + 1].1) {
                        if t2 >= t1 {
                            let dur = (t2 - t1) as f64;
                            let key = (pairs[i].0.clone(), pairs[i + 1].0.clone());
                            let e = acc.entry(key).or_insert((0.0, 0.0, 0));
                            e.0 += dur;
                            e.1 += dur * dur;
                            e.2 += 1;
                        }
                    }
                }
            }

            // Convert to (mean, stdev) pairs
            let mut pairs_map = std::collections::HashMap::new();
            for ((a, b), (sum, sum_sq, cnt)) in acc {
                let mean = sum / cnt as f64;
                let variance = (sum_sq / cnt as f64) - mean * mean;
                let stdev = variance.max(0.0).sqrt();
                pairs_map.insert((a, b), (mean, stdev, cnt));
            }

            Ok(TemporalProfile { pairs: pairs_map })
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    let handle = get_or_init_state().store_object(StoredObject::TemporalProfile(profile))?;
    Ok(JsValue::from_str(&handle))
}

/// Check a log against a temporal profile.
///
/// Every directly-follows step in every trace is measured.  A step is flagged
/// as a deviation when `|duration - mean| > zeta * stdev`.
///
/// Returns a JSON string:
/// ```json
/// {
///   "total_traces": 10,
///   "total_steps": 50,
///   "deviations": 3,
///   "fitness": 0.94,
///   "details": [
///     {"case_id":"Case1","from":"A","to":"B","duration_ms":9000000,
///      "mean_ms":3600000,"stdev_ms":600000,"zeta":9.0,"deviation":true}
///   ]
/// }
/// ```
#[wasm_bindgen]
pub fn check_temporal_conformance(
    log_handle: &str,
    profile_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    zeta: f64,
) -> Result<JsValue, JsValue> {
    let profile_pairs = get_or_init_state().with_object(profile_handle, |obj| match obj {
        Some(StoredObject::TemporalProfile(p)) => Ok(p.pairs.clone()),
        Some(_) => Err(JsValue::from_str("Handle is not a TemporalProfile")),
        None => Err(JsValue::from_str("TemporalProfile handle not found")),
    })?;

    let result_json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut total_steps = 0usize;
            let mut total_deviations = 0usize;
            let mut details: Vec<serde_json::Value> = Vec::new();

            for trace in &log.traces {
                let case_id = trace
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                    .unwrap_or("unknown")
                    .to_string();

                let pairs: Vec<(String, Option<i64>)> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        let act = e
                            .attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)?;
                        let ts = e.attributes.get(timestamp_key).and_then(|v| {
                            if let AttributeValue::Date(s) = v {
                                parse_timestamp_ms(s)
                            } else {
                                None
                            }
                        });
                        Some((act, ts))
                    })
                    .collect();

                for i in 0..pairs.len().saturating_sub(1) {
                    total_steps += 1;
                    let key = (&pairs[i].0, &pairs[i + 1].0);
                    if let Some(&(mean, stdev, _)) =
                        profile_pairs.get(&(key.0.clone(), key.1.clone()))
                    {
                        if let (Some(t1), Some(t2)) = (pairs[i].1, pairs[i + 1].1) {
                            let dur = (t2 - t1).max(0) as f64;
                            let z = if stdev > 0.0 {
                                (dur - mean).abs() / stdev
                            } else {
                                0.0
                            };
                            let is_deviation = z > zeta;
                            if is_deviation {
                                total_deviations += 1;
                            }
                            details.push(json!({
                                "case_id": case_id,
                                "from": pairs[i].0,
                                "to": pairs[i + 1].0,
                                "duration_ms": dur,
                                "mean_ms": mean,
                                "stdev_ms": stdev,
                                "zeta": z,
                                "deviation": is_deviation,
                            }));
                        }
                    }
                }
            }

            let fitness = if total_steps == 0 {
                1.0
            } else {
                1.0 - total_deviations as f64 / total_steps as f64
            };

            serde_json::to_string(&json!({
                "total_traces": log.traces.len(),
                "total_steps": total_steps,
                "deviations": total_deviations,
                "fitness": fitness,
                "details": details,
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&result_json))
}
