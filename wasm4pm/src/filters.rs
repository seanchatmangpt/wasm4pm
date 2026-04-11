use crate::models::{AttributeValue, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use std::collections::HashMap;
/// Priority 2 — Log filtering suite.
///
/// All filter functions create a new EventLog (subset of traces) and store it,
/// returning a fresh handle.  The original log is unchanged.
use wasm_bindgen::prelude::*;

fn store_filtered(log: EventLog) -> Result<JsValue, JsValue> {
    let handle = get_or_init_state().store_object(StoredObject::EventLog(log))?;
    Ok(JsValue::from_str(&handle))
}

/// Filter traces that start with one of the specified activities.
///
/// ```javascript
/// const h2 = pm.filter_by_start_activity(h, JSON.stringify(['Register']));
/// ```
#[wasm_bindgen]
pub fn filter_by_start_activity(
    log_handle: &str,
    activities_json: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let keep: std::collections::HashSet<String> = serde_json::from_str(activities_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|t| {
                    t.events
                        .first()
                        .and_then(|e| e.attributes.get(activity_key))
                        .and_then(|v| v.as_string())
                        .map(|a| keep.contains(a))
                        .unwrap_or(false)
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces that end with one of the specified activities.
#[wasm_bindgen]
pub fn filter_by_end_activity(
    log_handle: &str,
    activities_json: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let keep: std::collections::HashSet<String> = serde_json::from_str(activities_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|t| {
                    t.events
                        .last()
                        .and_then(|e| e.attributes.get(activity_key))
                        .and_then(|v| v.as_string())
                        .map(|a| keep.contains(a))
                        .unwrap_or(false)
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces by event count range.
/// Pass 0 for `min_events` or `usize::MAX` equivalent (999999) for no bound.
#[wasm_bindgen]
pub fn filter_by_case_size(
    log_handle: &str,
    min_events: usize,
    max_events: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|t| t.events.len() >= min_events && t.events.len() <= max_events)
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces containing specified directly-follows activity pairs.
/// `pairs_json` (JSON array of [from, to] arrays).
///
/// ```javascript
/// const h2 = pm.filter_by_directly_follows(h,
///   JSON.stringify([['Register','Approve']]), 'concept:name');
/// ```
#[wasm_bindgen]
pub fn filter_by_directly_follows(
    log_handle: &str,
    pairs_json: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let pairs: Vec<[String; 2]> = serde_json::from_str(pairs_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid pairs JSON: {}", e)))?;
    let pair_set: std::collections::HashSet<(String, String)> =
        pairs.into_iter().map(|[f, t]| (f, t)).collect();

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    let acts: Vec<&str> = trace
                        .events
                        .iter()
                        .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                        .collect();
                    acts.windows(2)
                        .any(|w| pair_set.contains(&(w[0].to_owned(), w[1].to_owned())))
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces by top variants covering specified percentage of traces.
/// traces are covered.  E.g. `coverage_pct = 80` keeps the variants that together
/// account for ≥80 % of traces.
#[wasm_bindgen]
pub fn filter_by_variant_coverage(
    log_handle: &str,
    coverage_pct: f64,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let total = log.traces.len();
            if total == 0 {
                let mut out = EventLog::new();
                out.attributes = log.attributes.clone();
                return store_filtered(out);
            }

            // Build variant → count map
            let mut variant_counts: HashMap<Vec<String>, usize> = HashMap::new();
            for trace in &log.traces {
                let variant: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                    .map(str::to_owned)
                    .collect();
                *variant_counts.entry(variant).or_insert(0) += 1;
            }

            // Sort variants descending by count
            let mut sorted: Vec<(Vec<String>, usize)> = variant_counts.into_iter().collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));

            // Accumulate until coverage_pct reached
            let target = (total as f64 * coverage_pct / 100.0).ceil() as usize;
            let mut keep_variants: std::collections::HashSet<Vec<String>> =
                std::collections::HashSet::new();
            let mut covered = 0usize;
            for (variant, cnt) in sorted {
                keep_variants.insert(variant);
                covered += cnt;
                if covered >= target {
                    break;
                }
            }

            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    let variant: Vec<String> = trace
                        .events
                        .iter()
                        .filter_map(|e| {
                            e.attributes.get(activity_key).and_then(|v| {
                                if let AttributeValue::String(s) = v {
                                    Some(s.as_str())
                                } else {
                                    v.as_string()
                                }
                            })
                        })
                        .map(str::to_owned)
                        .collect();
                    keep_variants.contains(&variant)
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces by top-k most frequent variants.
#[wasm_bindgen]
pub fn filter_by_variants_top_k(
    log_handle: &str,
    k: usize,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Build variant → count map
            let mut variant_counts: HashMap<Vec<String>, usize> = HashMap::new();
            for trace in &log.traces {
                let variant: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                    .map(str::to_owned)
                    .collect();
                *variant_counts.entry(variant).or_insert(0) += 1;
            }

            // Sort variants descending by count and keep top k
            let mut sorted: Vec<(Vec<String>, usize)> = variant_counts.into_iter().collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));
            let keep_variants: std::collections::HashSet<Vec<String>> =
                sorted.into_iter().take(k).map(|(v, _)| v).collect();

            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    let variant: Vec<String> = trace
                        .events
                        .iter()
                        .filter_map(|e| {
                            e.attributes.get(activity_key).and_then(|v| {
                                if let AttributeValue::String(s) = v {
                                    Some(s.as_str())
                                } else {
                                    v.as_string()
                                }
                            })
                        })
                        .map(str::to_owned)
                        .collect();
                    keep_variants.contains(&variant)
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces containing all specified activities.
#[wasm_bindgen]
pub fn filter_traces_containing_activities(
    log_handle: &str,
    activities_json: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let required: std::collections::HashSet<String> = serde_json::from_str(activities_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    let activities: std::collections::HashSet<String> = trace
                        .events
                        .iter()
                        .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                        .map(str::to_owned)
                        .collect();
                    required.is_subset(&activities)
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces excluding any of the specified activities.
#[wasm_bindgen]
pub fn filter_traces_excluding_activities(
    log_handle: &str,
    activities_json: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let excluded: std::collections::HashSet<String> = serde_json::from_str(activities_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    !trace.events.iter().any(|e| {
                        e.attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(|a| excluded.contains(a))
                            .unwrap_or(false)
                    })
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces by timestamp range.
/// Timestamps are ISO 8601 strings (e.g., "2023-01-01T00:00:00Z").
#[wasm_bindgen]
pub fn filter_by_time_range(
    log_handle: &str,
    min_dt: &str,
    max_dt: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    trace.events.iter().all(|e| {
                        if let Some(AttributeValue::String(ts)) = e.attributes.get(timestamp_key) {
                            // Simple string comparison for ISO timestamps (lexicographic works for ISO8601)
                            ts.as_str() >= min_dt && ts.as_str() <= max_dt
                        } else {
                            false
                        }
                    })
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces by case duration in milliseconds.
#[wasm_bindgen]
pub fn filter_by_case_performance(
    log_handle: &str,
    min_ms: i64,
    max_ms: i64,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    if let (Some(first), Some(last)) = (
                        trace
                            .events
                            .first()
                            .and_then(|e| e.attributes.get(timestamp_key)),
                        trace
                            .events
                            .last()
                            .and_then(|e| e.attributes.get(timestamp_key)),
                    ) {
                        if let (Some(start), Some(end)) = (first.as_string(), last.as_string()) {
                            // Parse ISO timestamps and compute duration
                            if let (Ok(start_dt), Ok(end_dt)) = (
                                chrono::DateTime::parse_from_rfc3339(start),
                                chrono::DateTime::parse_from_rfc3339(end),
                            ) {
                                let duration_ms =
                                    end_dt.timestamp_millis() - start_dt.timestamp_millis();
                                return duration_ms >= min_ms && duration_ms <= max_ms;
                            }
                        }
                    }
                    false
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces containing rework (repeated activities).
#[wasm_bindgen]
pub fn filter_rework_traces(log_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    let activities: Vec<String> = trace
                        .events
                        .iter()
                        .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                        .map(str::to_owned)
                        .collect();

                    // Check if any activity appears more than once
                    let mut seen = std::collections::HashSet::new();
                    for act in &activities {
                        if !seen.insert(act) {
                            return true; // Duplicate found
                        }
                    }
                    false
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces by trace attribute value.
#[wasm_bindgen]
pub fn filter_by_trace_attribute(
    log_handle: &str,
    attribute_key: &str,
    attribute_value: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    trace
                        .attributes
                        .get(attribute_key)
                        .and_then(|v| v.as_string())
                        .map(|val| val == attribute_value)
                        .unwrap_or(false)
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces containing an event with specified attribute value.
#[wasm_bindgen]
pub fn filter_by_event_attribute_value(
    log_handle: &str,
    attribute_key: &str,
    attribute_value: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    trace.events.iter().any(|e| {
                        e.attributes
                            .get(attribute_key)
                            .and_then(|v| v.as_string())
                            .map(|val| val == attribute_value)
                            .unwrap_or(false)
                    })
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces by case ID list.
#[wasm_bindgen]
pub fn filter_by_case_ids(
    log_handle: &str,
    case_ids_json: &str,
    case_id_key: &str,
) -> Result<JsValue, JsValue> {
    let keep_ids: std::collections::HashSet<String> = serde_json::from_str(case_ids_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    trace
                        .attributes
                        .get(case_id_key)
                        .and_then(|v| v.as_string())
                        .map(|id| keep_ids.contains(id))
                        .unwrap_or(false)
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces starting with specified activity sequence.
#[wasm_bindgen]
pub fn filter_traces_starting_with_sequence(
    log_handle: &str,
    sequence_json: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let sequence: Vec<String> = serde_json::from_str(sequence_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    if trace.events.len() < sequence.len() {
                        return false;
                    }
                    trace
                        .events
                        .iter()
                        .take(sequence.len())
                        .enumerate()
                        .all(|(i, e)| {
                            e.attributes
                                .get(activity_key)
                                .and_then(|v| v.as_string())
                                .map(|act| act == sequence[i])
                                .unwrap_or(false)
                        })
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Filter traces ending with specified activity sequence.
#[wasm_bindgen]
pub fn filter_traces_ending_with_sequence(
    log_handle: &str,
    sequence_json: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let sequence: Vec<String> = serde_json::from_str(sequence_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log
                .traces
                .iter()
                .filter(|trace| {
                    if trace.events.len() < sequence.len() {
                        return false;
                    }
                    let offset = trace.events.len() - sequence.len();
                    trace.events.iter().skip(offset).enumerate().all(|(i, e)| {
                        e.attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(|act| act == sequence[i])
                            .unwrap_or(false)
                    })
                })
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}
