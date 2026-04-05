/// Priority 2 — Log filtering suite.
///
/// All filter functions create a new EventLog (subset of traces) and store it,
/// returning a fresh handle.  The original log is unchanged.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::{EventLog, AttributeValue};
use std::collections::HashMap;

fn store_filtered(log: EventLog) -> Result<JsValue, JsValue> {
    let handle = get_or_init_state().store_object(StoredObject::EventLog(log))?;
    Ok(JsValue::from_str(&handle))
}

/// Keep only traces whose first activity is in `activities_json` (JSON array of strings).
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
            out.traces = log.traces.iter().filter(|t| {
                t.events.first()
                    .and_then(|e| e.attributes.get(activity_key))
                    .and_then(|v| v.as_string())
                    .map(|a| keep.contains(a))
                    .unwrap_or(false)
            }).cloned().collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Keep only traces whose last activity is in `activities_json`.
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
            out.traces = log.traces.iter().filter(|t| {
                t.events.last()
                    .and_then(|e| e.attributes.get(activity_key))
                    .and_then(|v| v.as_string())
                    .map(|a| keep.contains(a))
                    .unwrap_or(false)
            }).cloned().collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Keep only traces whose length (number of events) is in `[min_events, max_events]`.
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
            out.traces = log.traces.iter()
                .filter(|t| t.events.len() >= min_events && t.events.len() <= max_events)
                .cloned()
                .collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Keep only traces that contain at least one of the directly-follows pairs in
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
    let pair_set: std::collections::HashSet<(String, String)> = pairs.into_iter()
        .map(|[f, t]| (f, t))
        .collect();

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log.traces.iter().filter(|trace| {
                let acts: Vec<&str> = trace.events.iter()
                    .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                    .collect();
                acts.windows(2).any(|w| pair_set.contains(&(w[0].to_owned(), w[1].to_owned())))
            }).cloned().collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Keep only the top variants by frequency until `coverage_pct` (0–100) of all
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
                let variant: Vec<String> = trace.events.iter()
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
                if covered >= target { break; }
            }

            let mut out = EventLog::new();
            out.attributes = log.attributes.clone();
            out.traces = log.traces.iter().filter(|trace| {
                let variant: Vec<String> = trace.events.iter()
                    .filter_map(|e| e.attributes.get(activity_key)
                        .and_then(|v| {
                            if let AttributeValue::String(s) = v { Some(s.as_str()) } else { v.as_string() }
                        }))
                    .map(str::to_owned)
                    .collect();
                keep_variants.contains(&variant)
            }).cloned().collect();
            store_filtered(out)
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}
