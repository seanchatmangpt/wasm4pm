//! Statistical analysis functions backed by miniml-core's stats module.
//!
//! Provides formal hypothesis testing over event log data:
//! - Cohort duration comparison (two-sample t-test)
//! - Resource performance comparison (one-way ANOVA)
//! - Descriptive statistics for log attributes

#![cfg(all(feature = "ml", feature = "miniml"))]

use std::collections::HashMap;

use serde_json::json;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsError;

use crate::error::{codes, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue};
use crate::state::{get_or_init_state, StoredObject};

// ---------------------------------------------------------------------------
// Internal duration extraction helpers
// ---------------------------------------------------------------------------

/// Extract (trace_index, duration_ms) pairs from an EventLog using the given timestamp key.
///
/// Duration is computed as `max(ts) - min(ts)` rather than `last - first`,
/// because XES events are not guaranteed chronologically ordered. The
/// first/last reading is order-sensitive and can yield zero or negative
/// durations on permuted logs — a silent statistical-analysis defect.
fn extract_case_durations_internal(log: &crate::models::EventLog, timestamp_key: &str) -> Vec<f64> {
    let mut durations = Vec::new();
    for trace in &log.traces {
        let timestamps: Vec<i64> = trace
            .events
            .iter()
            .filter_map(|e| match e.attributes.get(timestamp_key) {
                Some(AttributeValue::Date(d)) => parse_timestamp_ms(d),
                Some(AttributeValue::String(s)) => parse_timestamp_ms(s),
                Some(AttributeValue::Int(ms)) => Some(*ms),
                _ => None,
            })
            .collect();
        if timestamps.len() < 2 {
            continue;
        }
        let start = *timestamps.iter().min().unwrap();
        let end = *timestamps.iter().max().unwrap();
        let dur = (end - start) as f64;
        if dur > 0.0 {
            durations.push(dur);
        }
    }
    durations
}

/// Group case durations by the value of a trace-level attribute.
fn extract_durations_by_case_attribute_internal(
    log: &crate::models::EventLog,
    cohort_attribute: &str,
    timestamp_key: &str,
) -> HashMap<String, Vec<f64>> {
    let mut groups: HashMap<String, Vec<f64>> = HashMap::new();

    for trace in &log.traces {
        // Determine cohort label from trace attributes
        let label = match trace.attributes.get(cohort_attribute) {
            Some(AttributeValue::String(s)) => s.clone(),
            Some(AttributeValue::Int(i)) => i.to_string(),
            Some(AttributeValue::Float(f)) => f.to_string(),
            Some(AttributeValue::Boolean(b)) => b.to_string(),
            _ => {
                // Also check first-event attributes as fallback
                trace
                    .events
                    .first()
                    .and_then(|e| e.attributes.get(cohort_attribute))
                    .and_then(|v| match v {
                        AttributeValue::String(s) => Some(s.clone()),
                        AttributeValue::Int(i) => Some(i.to_string()),
                        AttributeValue::Float(f) => Some(f.to_string()),
                        AttributeValue::Boolean(b) => Some(b.to_string()),
                        _ => None,
                    })
                    .unwrap_or_else(|| "(unknown)".to_string())
            }
        };

        // Compute case duration
        let timestamps: Vec<i64> = trace
            .events
            .iter()
            .filter_map(|e| match e.attributes.get(timestamp_key) {
                Some(AttributeValue::Date(d)) => parse_timestamp_ms(d),
                Some(AttributeValue::String(s)) => parse_timestamp_ms(s),
                Some(AttributeValue::Int(ms)) => Some(*ms),
                _ => None,
            })
            .collect();

        if timestamps.len() < 2 {
            continue;
        }
        // Use min/max for order-invariance — see note on extract_case_durations_internal.
        let start = *timestamps.iter().min().unwrap();
        let end = *timestamps.iter().max().unwrap();
        let dur = (end - start) as f64;
        if dur > 0.0 {
            groups.entry(label).or_default().push(dur);
        }
    }

    groups
}

/// Group event transition durations by the value of an event-level attribute.
///
/// For each pair of consecutive events in each trace, the duration is attributed
/// to the *group* value of the first event.
fn extract_durations_by_event_attribute_internal(
    log: &crate::models::EventLog,
    group_attribute: &str,
    timestamp_key: &str,
) -> HashMap<String, Vec<f64>> {
    let mut groups: HashMap<String, Vec<f64>> = HashMap::new();

    for trace in &log.traces {
        let events = &trace.events;
        for i in 0..events.len().saturating_sub(1) {
            let ev = &events[i];
            let ev_next = &events[i + 1];

            let label = match ev.attributes.get(group_attribute) {
                Some(AttributeValue::String(s)) => s.clone(),
                Some(AttributeValue::Int(n)) => n.to_string(),
                Some(AttributeValue::Float(f)) => f.to_string(),
                Some(AttributeValue::Boolean(b)) => b.to_string(),
                _ => continue,
            };

            let ts_start = match ev.attributes.get(timestamp_key) {
                Some(AttributeValue::Date(d)) => parse_timestamp_ms(d),
                Some(AttributeValue::String(s)) => parse_timestamp_ms(s),
                Some(AttributeValue::Int(ms)) => Some(*ms),
                _ => None,
            };
            let ts_end = match ev_next.attributes.get(timestamp_key) {
                Some(AttributeValue::Date(d)) => parse_timestamp_ms(d),
                Some(AttributeValue::String(s)) => parse_timestamp_ms(s),
                Some(AttributeValue::Int(ms)) => Some(*ms),
                _ => None,
            };

            if let (Some(s), Some(e)) = (ts_start, ts_end) {
                let dur = (e - s) as f64;
                if dur > 0.0 {
                    groups.entry(label).or_default().push(dur);
                }
            }
        }
    }

    groups
}

// ---------------------------------------------------------------------------
// WASM exports
// ---------------------------------------------------------------------------

/// Compare case-duration distributions between two cohorts using a two-sample t-test.
///
/// `cohort_attribute` — name of the trace (or first-event) attribute that defines
/// the cohort label. The two alphabetically-first cohorts are compared for
/// determinism.
#[wasm_bindgen]
pub fn compare_cohort_durations(
    log_handle: &str,
    timestamp_key: &str,
    cohort_attribute: &str,
    alpha: f64,
) -> Result<JsValue, JsError> {
    let state = get_or_init_state();

    state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            Some(_) => return Err(wasm_err(codes::INVALID_HANDLE, "Handle is not an EventLog")),
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("EventLog handle not found: {}", log_handle),
                ))
            }
        };

        let groups =
            extract_durations_by_case_attribute_internal(log, cohort_attribute, timestamp_key);

        if groups.len() < 2 {
            let msg = json!({"error": "Need at least 2 cohorts"});
            return Err(JsValue::from_str(&msg.to_string()));
        }

        // Deterministic: sort keys and take first two. Each group must have at
        // least 2 observations for a t-test to be meaningful (df = n_a+n_b−2);
        // single-observation groups would give Inf variance under miniml.
        let mut sorted_keys: Vec<&String> = groups.keys().collect();
        sorted_keys.sort();
        let total_cohorts = sorted_keys.len();

        // Pick the first two alphabetically-sorted cohorts whose size ≥ 2.
        let mut chosen: Vec<&String> = Vec::with_capacity(2);
        let mut skipped_too_small: Vec<String> = Vec::new();
        for k in &sorted_keys {
            if groups[*k].len() >= 2 {
                chosen.push(*k);
                if chosen.len() == 2 {
                    break;
                }
            } else {
                skipped_too_small.push((*k).clone());
            }
        }
        if chosen.len() < 2 {
            let msg = json!({
                "error": "Need at least 2 cohorts with >=2 observations each",
                "cohorts_seen": total_cohorts,
                "skipped_too_small": skipped_too_small,
            });
            return Err(JsValue::from_str(&msg.to_string()));
        }

        let label_a = chosen[0].clone();
        let label_b = chosen[1].clone();
        let group_a = &groups[chosen[0]];
        let group_b = &groups[chosen[1]];

        // Report cohorts NOT included in the test so callers don't silently
        // miss a 3-cohort situation (e.g. A/B/C) where only A vs B was tested.
        let untested_cohorts: Vec<String> = sorted_keys
            .iter()
            .filter(|k| **k != &label_a && **k != &label_b)
            .map(|k| (*k).clone())
            .collect();

        let t_result = miniml::t_test_two_sample_impl(group_a, group_b, alpha)
            .map_err(|e| JsError::new(&e.message))?;

        let mean_a = group_a.iter().sum::<f64>() / group_a.len() as f64;
        let mean_b = group_b.iter().sum::<f64>() / group_b.len() as f64;
        let significant = t_result.p_value() < alpha;

        let result = json!({
            "t_stat": t_result.statistic(),
            "p_value": t_result.p_value(),
            "significant": significant,
            "cohort_a_label": label_a,
            "cohort_a_mean_ms": mean_a,
            "cohort_a_n": group_a.len(),
            "cohort_b_label": label_b,
            "cohort_b_mean_ms": mean_b,
            "cohort_b_n": group_b.len(),
            "mean_diff_ms": t_result.mean_diff(),
            "ci_lower": t_result.ci_lower(),
            "ci_upper": t_result.ci_upper(),
            "total_cohorts_seen": total_cohorts,
            "untested_cohorts": untested_cohorts,
            "interpretation": if significant {
                "Groups differ significantly"
            } else {
                "No significant difference"
            }
        });

        Ok(JsValue::from_str(&result.to_string()))
    })
}

/// Compare processing durations across resources using one-way ANOVA.
///
/// `resource_key` — event attribute identifying the resource (e.g. `org:resource`).
/// Groups with fewer than 2 observations are excluded before testing.
#[wasm_bindgen]
pub fn compare_resource_performance(
    log_handle: &str,
    activity_key: &str,
    resource_key: &str,
    timestamp_key: &str,
    alpha: f64,
) -> Result<JsValue, JsError> {
    let _ = activity_key; // reserved for future per-activity filtering
    let state = get_or_init_state();

    state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            Some(_) => return Err(wasm_err(codes::INVALID_HANDLE, "Handle is not an EventLog")),
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("EventLog handle not found: {}", log_handle),
                ))
            }
        };

        let raw_groups =
            extract_durations_by_event_attribute_internal(log, resource_key, timestamp_key);

        // Filter groups with < 2 observations
        let mut filtered: Vec<(String, Vec<f64>)> = raw_groups
            .into_iter()
            .filter(|(_, v)| v.len() >= 2)
            .collect();

        if filtered.len() < 2 {
            let msg =
                json!({"error": "Need at least 2 resource groups with >=2 observations each"});
            return Err(JsValue::from_str(&msg.to_string()));
        }

        // Sort for determinism
        filtered.sort_by(|a, b| a.0.cmp(&b.0));

        // Build flat data + group_sizes for ANOVA
        let mut flat_data: Vec<f64> = Vec::new();
        let mut group_sizes: Vec<usize> = Vec::new();
        let mut group_means: Vec<serde_json::Value> = Vec::new();

        for (label, values) in &filtered {
            let mean = values.iter().sum::<f64>() / values.len() as f64;
            group_means.push(json!({
                "resource": label,
                "mean_duration_ms": mean,
                "n": values.len()
            }));
            group_sizes.push(values.len());
            flat_data.extend_from_slice(values);
        }

        let anova_result = miniml::one_way_anova_impl(&flat_data, &group_sizes)
            .map_err(|e| JsError::new(&e.message))?;

        let significant = anova_result.p_value() < alpha;

        let result = json!({
            "f_stat": anova_result.f_statistic(),
            "p_value": anova_result.p_value(),
            "significant": significant,
            "group_means": group_means,
            "interpretation": if significant {
                "Resource performance differs significantly"
            } else {
                "No significant difference in resource performance"
            }
        });

        Ok(JsValue::from_str(&result.to_string()))
    })
}

/// Compute descriptive statistics for a numeric attribute across all traces or events.
///
/// `scope` — `"trace"` to read from trace-level attributes, `"event"` to read from
/// individual event attributes.
#[wasm_bindgen]
pub fn describe_attribute(
    log_handle: &str,
    attribute_key: &str,
    scope: &str,
) -> Result<JsValue, JsError> {
    let state = get_or_init_state();

    state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            Some(_) => {
                return Err(wasm_err(codes::INVALID_HANDLE, "Handle is not an EventLog"))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("EventLog handle not found: {}", log_handle),
                ))
            }
        };

        let use_trace_scope = scope != "event";

        let values: Vec<f64> = if use_trace_scope {
            log.traces
                .iter()
                .filter_map(|t| match t.attributes.get(attribute_key) {
                    Some(AttributeValue::Float(f)) => Some(*f),
                    Some(AttributeValue::Int(i)) => Some(*i as f64),
                    _ => None,
                })
                .collect()
        } else {
            log.traces
                .iter()
                .flat_map(|t| t.events.iter())
                .filter_map(|e| match e.attributes.get(attribute_key) {
                    Some(AttributeValue::Float(f)) => Some(*f),
                    Some(AttributeValue::Int(i)) => Some(*i as f64),
                    _ => None,
                })
                .collect()
        };

        if values.is_empty() {
            let msg = json!({"error": format!("No numeric values found for attribute '{}' in scope '{}'", attribute_key, scope)});
            return Err(JsValue::from_str(&msg.to_string()));
        }

        let stats = miniml::describe_impl(&values)
            .map_err(|e| JsError::new(&e.message))?;

        let result = json!({
            "mean": stats.mean(),
            "median": stats.median(),
            "std": stats.std(),
            "variance": stats.variance(),
            "min": stats.min(),
            "max": stats.max(),
            "skewness": stats.skewness(),
            "kurtosis": stats.kurtosis(),
            "n": stats.n()
        });

        Ok(JsValue::from_str(&result.to_string()))
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_case_durations_empty() {
        let log = crate::models::EventLog {
            traces: vec![],
            attributes: Default::default(),
        };
        let result = extract_case_durations_internal(&log, "time:timestamp");
        assert!(result.is_empty());
    }

    #[test]
    fn test_extract_durations_by_case_attribute_empty() {
        let log = crate::models::EventLog {
            traces: vec![],
            attributes: Default::default(),
        };
        let result = extract_durations_by_case_attribute_internal(&log, "cohort", "time:timestamp");
        assert!(result.is_empty());
    }

    use crate::models::{Event, Trace};
    use std::collections::HashMap;

    fn mk_ev(t: i64) -> Event {
        let mut a = HashMap::new();
        a.insert("time:timestamp".to_string(), AttributeValue::Int(t));
        Event { attributes: a }
    }
    fn mk_trace(ts: &[i64], cohort: Option<&str>) -> Trace {
        let mut tattrs = HashMap::new();
        if let Some(c) = cohort {
            tattrs.insert("cohort".to_string(), AttributeValue::String(c.to_string()));
        }
        Trace {
            attributes: tattrs,
            events: ts.iter().map(|&t| mk_ev(t)).collect(),
        }
    }

    /// Rank-1: case duration must be permutation-invariant. The pre-fix
    /// `first - last` reading depends on storage order.
    #[test]
    fn test_case_duration_order_invariant() {
        let sorted = crate::models::EventLog {
            traces: vec![mk_trace(&[1000, 3000, 5000], None)],
            attributes: Default::default(),
        };
        let permuted = crate::models::EventLog {
            traces: vec![mk_trace(&[5000, 1000, 3000], None)],
            attributes: Default::default(),
        };
        assert_eq!(
            extract_case_durations_internal(&sorted, "time:timestamp"),
            vec![4000.0]
        );
        assert_eq!(
            extract_case_durations_internal(&permuted, "time:timestamp"),
            vec![4000.0],
            "permuted log must yield same duration"
        );
    }

    /// Rank-2: cohort grouping must expose all groups; pre-fix WASM silently
    /// dropped 3rd+ cohorts when picking the alphabetic first two.
    #[test]
    fn test_cohort_grouping_preserves_all_groups() {
        let log = crate::models::EventLog {
            traces: vec![
                mk_trace(&[0, 1000], Some("A")),
                mk_trace(&[0, 1100], Some("A")),
                mk_trace(&[0, 2000], Some("B")),
                mk_trace(&[0, 2100], Some("B")),
                mk_trace(&[0, 3000], Some("C")),
                mk_trace(&[0, 3100], Some("C")),
            ],
            attributes: Default::default(),
        };
        let groups = extract_durations_by_case_attribute_internal(&log, "cohort", "time:timestamp");
        assert_eq!(groups.len(), 3);
        for k in &["A", "B", "C"] {
            assert_eq!(groups.get(*k).map(|v| v.len()), Some(2));
        }
    }
}
