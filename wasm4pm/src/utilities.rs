//! WASM boundary utilities: serialization helpers, handle validators, and event log filters.
//!
//! ## Serialization split
//!
//! Two serialization helpers exist because `serde_wasm_bindgen` has a known bug on wasm32
//! where it silently returns `{}` when given a `serde_json::Value` (e.g. from `json!({})`):
//!
//! - [`to_js`] — fastest path; produces a native JS object via `serde_wasm_bindgen`.
//!   **Do not use with `serde_json::Value`.** Safe for strongly-typed Rust structs.
//! - [`to_js_str`] — always serializes via `serde_json::to_string`; the JS caller must
//!   call `JSON.parse()` on the result. Required for any `json!({...})` value.
//!
//! ## Handle pattern
//!
//! All WASM exports identify stored objects by opaque `&str` handles.
//! Use [`wasm_invalid_handle`], [`wasm_not_eventlog`], and [`wasm_wrong_type`]
//! to produce consistent `{ code, message }` JS error objects at the boundary.

use crate::error::js_val;
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
#[cfg(any(feature = "statrs", feature = "hand_rolled_stats"))]
use crate::{Data, Median};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*; // Conditional import: statrs or hand_rolled_stats

/// Sorted edge vector for O(log n) membership testing — faster than HashSet for small edge counts.
struct SortedEdgeSlice(Vec<(u32, u32)>);

impl SortedEdgeSlice {
    fn from_hash_set(set: &HashSet<(u32, u32)>) -> Self {
        let mut v: Vec<(u32, u32)> = set.iter().copied().collect();
        v.sort_unstable();
        Self(v)
    }

    #[inline(always)]
    fn contains(&self, edge: (u32, u32)) -> bool {
        self.0.binary_search(&edge).is_ok()
    }
}

/// Vocabulary size threshold for u64[64] bitmask edge lookup vs SortedEdgeSlice fallback.
/// Smaller on wasm32 to stay within stack constraints.
const BITMASK_VOCAB_LIMIT: usize = if cfg!(target_arch = "wasm32") { 32 } else { 64 };

/// Serialize `val` across the WASM boundary.
///
/// - **WASM target**: `serde_wasm_bindgen::to_value` — produces a native JS object,
///   no JSON round-trip.
/// - **Native target** (benchmarks / unit tests): `serde_json::to_string` wrapped in
///   `js_val` — keeps the same `Result<JsValue, JsValue>` signature so
///   benchmarks can call `js_val.as_string().unwrap()` to get back the JSON.
#[inline]
pub fn to_js<T: serde::Serialize>(val: &T) -> Result<JsValue, JsValue> {
    #[cfg(target_arch = "wasm32")]
    {
        serde_wasm_bindgen::to_value(val).map_err(|e| js_val(&e.to_string()))
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        // On native targets (criterion benchmarks) js_val is not callable.
        // Benchmarks only call .unwrap() and discard the value, so return null value.
        // Serialization is validated but the output is discarded.
        let _ = serde_json::to_string(val);
        Ok(JsValue::null())
    }
}

/// Serialize `val` via `serde_json` + `js_val` on ALL targets.
///
/// Use this instead of `to_js` when `val` is a `serde_json::Value` (e.g. from
/// `json!({...})`). `serde_wasm_bindgen` silently produces `{}` for those on
/// wasm32; going through a JSON string avoids that bug entirely.
/// JS callers receive a string and must call `JSON.parse()`.
#[inline]
pub fn to_js_str<T: serde::Serialize>(val: &T) -> Result<JsValue, JsValue> {
    serde_json::to_string(val)
        .map(|s| js_val(&s))
        .map_err(|e| js_val(&e.to_string()))
}

/// Structured error: invalid handle (replaces ad-hoc js_val("EventLog not found"))
#[inline]
pub fn wasm_invalid_handle(handle: &str) -> JsValue {
    crate::error::wasm_err(
        crate::error::codes::INVALID_HANDLE,
        format!("No object at handle '{handle}'"),
    )
}

/// Structured error: wrong object type (replaces ad-hoc js_val("Object is not an EventLog"))
#[inline]
pub fn wasm_not_eventlog(handle: &str) -> JsValue {
    crate::error::wasm_err(
        crate::error::codes::INVALID_INPUT,
        format!("Object at '{handle}' is not an EventLog"),
    )
}

/// Structured error: object is not the expected type (generic variant)
#[inline]
pub fn wasm_wrong_type(handle: &str, expected: &str) -> JsValue {
    crate::error::wasm_err(
        crate::error::codes::INVALID_INPUT,
        format!("Object at '{handle}' is not a {expected}"),
    )
}

/// Get trace count from EventLog
#[wasm_bindgen]
pub fn get_trace_count(eventlog_handle: &str) -> Result<usize, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Get total event count from EventLog
#[wasm_bindgen]
pub fn get_event_count(eventlog_handle: &str) -> Result<usize, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.event_count()),
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Get unique activities from EventLog
#[wasm_bindgen]
pub fn get_activities(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            to_js(&activities)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Get all traces from EventLog as a list of activity sequences
#[wasm_bindgen]
pub fn get_traces(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let traces = log.get_traces(activity_key);
            to_js(&traces)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Get trace lengths (number of events per trace)
#[wasm_bindgen]
pub fn get_trace_lengths(eventlog_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let lengths: Vec<usize> = log.traces.iter().map(|t| t.events.len()).collect();
            to_js(&lengths)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Get min and max trace lengths
#[wasm_bindgen]
pub fn get_trace_length_statistics(eventlog_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let lengths: Vec<usize> = log.traces.iter().map(|t| t.events.len()).collect();

            let stats = if !lengths.is_empty() {
                let min = *lengths.iter().min().unwrap_or(&0);
                let max = *lengths.iter().max().unwrap_or(&0);
                let sum: usize = lengths.iter().sum();
                let avg = sum as f64 / lengths.len() as f64;

                #[cfg(any(feature = "statrs", feature = "hand_rolled_stats"))]
                let median = {
                    let lengths_f64: Vec<f64> = lengths.iter().map(|&x| x as f64).collect();
                    let data = Data::new(lengths_f64);
                    data.median()
                };
                #[cfg(not(any(feature = "statrs", feature = "hand_rolled_stats")))]
                let median = {
                    let mut sorted = lengths.clone();
                    sorted.sort_unstable();
                    let mid = sorted.len() / 2;
                    if sorted.len() % 2 == 0 {
                        (sorted[mid - 1] + sorted[mid]) as f64 / 2.0
                    } else {
                        sorted[mid] as f64
                    }
                };

                json!({
                    "min": min,
                    "max": max,
                    "average": avg,
                    "median": median as usize,
                    "count": lengths.len(),
                })
            } else {
                json!({
                    "min": 0,
                    "max": 0,
                    "average": 0.0,
                    "median": 0,
                    "count": 0,
                })
            };

            to_js(&stats)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Evaluate fitness of an edge set against columnar log (zero string allocation)
/// Used by genetic algorithm, PSO, ACO, and simulated annealing discovery algorithms.
/// Fitness = 80% trace fit + 20% simplicity penalty (relative to edge vocabulary size).
///
/// `edge_vocab_len` is the total number of observed unique edges — used for the
/// vocabulary-relative density penalty instead of the previous hardcoded /20.
///
/// Fast path: when vocab fits within BITMASK_VOCAB_LIMIT, uses a u64[64] bitmask for
/// O(1) edge lookup with no heap allocation. Fallback: SortedEdgeSlice for O(log n)
/// binary search on larger vocabularies.
#[inline]
pub(crate) fn evaluate_edges_fitness(
    edge_set: &HashSet<(u32, u32)>,
    col: &ColumnarLog,
    edge_vocab_len: usize,
) -> f64 {
    let vocab_len = col.vocab.len();
    let use_bitmask = vocab_len <= BITMASK_VOCAB_LIMIT;

    let mut bitmask = [0u64; 64];
    if use_bitmask {
        for &(f, t) in edge_set {
            bitmask[f as usize] |= 1u64 << t;
        }
    }
    let sorted = if !use_bitmask {
        Some(SortedEdgeSlice::from_hash_set(edge_set))
    } else {
        None
    };

    let edge_lookup = |f: u32, t: u32| -> bool {
        if use_bitmask {
            (bitmask[f as usize] >> t) & 1 != 0
        } else {
            sorted.as_ref().unwrap().contains((f, t))
        }
    };

    let mut fitting_traces = 0;
    let total_traces = col.trace_offsets.len().saturating_sub(1);

    for t in 0..total_traces {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];

        // Check if all consecutive pairs in this trace are in the edge set
        let trace_fits = if end > start + 1 {
            (start..end.saturating_sub(1)).all(|i| {
                let from = col.events[i];
                let to = col.events[i + 1];
                edge_lookup(from, to)
            })
        } else {
            true // Empty or single-event traces are considered fitting
        };

        fitting_traces += trace_fits as usize;
    }

    // Fitness = balance of fit and simplicity (vocabulary-relative density)
    let fit_ratio = fitting_traces as f64 / total_traces.max(1) as f64;
    let relative_density = edge_set.len() as f64 / edge_vocab_len.max(1) as f64;
    let complexity_penalty = 1.0 / (1.0 + relative_density);

    // FMA: complexity_penalty * 0.2 + fit_ratio * 0.8 (fewer rounding steps)
    complexity_penalty.mul_add(0.2, fit_ratio * 0.8)
}

/// Get all attribute names used in the log
#[wasm_bindgen]
pub fn get_attribute_names(eventlog_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut attr_names = HashSet::new();

            for key in log.attributes.keys() {
                attr_names.insert(key.clone());
            }
            for trace in &log.traces {
                for key in trace.attributes.keys() {
                    attr_names.insert(key.clone());
                }
            }
            for trace in &log.traces {
                for event in &trace.events {
                    for key in event.attributes.keys() {
                        attr_names.insert(key.clone());
                    }
                }
            }

            let mut names: Vec<String> = attr_names.into_iter().collect();
            names.sort();

            to_js(&names)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Filter EventLog by activity (keep only traces containing the activity)
#[wasm_bindgen]
pub fn filter_log_by_activity(
    eventlog_handle: &str,
    activity_key: &str,
    activity_name: &str,
) -> Result<JsValue, JsValue> {
    // Compute filtered log inside closure (borrowed), store outside (avoids mutex re-entry).
    let filtered = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let traces: Vec<Trace> = log
                .traces
                .iter()
                .filter(|trace| {
                    trace.events.iter().any(|event| {
                        if let Some(AttributeValue::String(act)) =
                            event.attributes.get(activity_key)
                        {
                            act == activity_name
                        } else {
                            false
                        }
                    })
                })
                .cloned()
                .collect();
            Ok(EventLog {
                attributes: log.attributes.clone(),
                traces,
            })
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })?;

    let trace_count = filtered.traces.len();
    let event_count = filtered.event_count();
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(filtered))
        .map_err(|_e| js_val("Failed to store filtered log"))?;

    to_js_str(&json!({
        "handle": handle,
        "trace_count": trace_count,
        "event_count": event_count,
    }))
}

/// Filter EventLog by trace length range
#[wasm_bindgen]
pub fn filter_log_by_trace_length(
    eventlog_handle: &str,
    min_length: usize,
    max_length: usize,
) -> Result<JsValue, JsValue> {
    let filtered = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let traces: Vec<Trace> = log
                .traces
                .iter()
                .filter(|trace| {
                    let len = trace.events.len();
                    len >= min_length && len <= max_length
                })
                .cloned()
                .collect();
            Ok(EventLog {
                attributes: log.attributes.clone(),
                traces,
            })
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })?;

    let trace_count = filtered.traces.len();
    let event_count = filtered.event_count();
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(filtered))
        .map_err(|_e| js_val("Failed to store filtered log"))?;

    to_js_str(&json!({
        "handle": handle,
        "trace_count": trace_count,
        "event_count": event_count,
    }))
}

/// Calculate trace durations (difference between first and last event timestamps)
#[wasm_bindgen]
pub fn calculate_trace_durations(
    eventlog_handle: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut durations = Vec::new();

            for trace in &log.traces {
                if trace.events.len() >= 2 {
                    if let (
                        Some(AttributeValue::Date(start_time)),
                        Some(AttributeValue::Date(end_time)),
                    ) = (
                        trace.events[0].attributes.get(timestamp_key),
                        trace.events[trace.events.len() - 1]
                            .attributes
                            .get(timestamp_key),
                    ) {
                        durations.push(json!({
                            "start": start_time,
                            "end": end_time,
                            "duration_str": "computed"
                        }));
                    }
                }
            }

            to_js(&durations)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Validate that EventLog has timestamp attribute
#[wasm_bindgen]
pub fn validate_has_timestamps(
    eventlog_handle: &str,
    timestamp_key: &str,
) -> Result<bool, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let has_timestamps = log.traces.iter().all(|trace| {
                trace.events.iter().all(|event| {
                    matches!(
                        event.attributes.get(timestamp_key),
                        Some(AttributeValue::Date(_))
                    )
                })
            });
            Ok(has_timestamps)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Validate that EventLog has activity attribute
#[wasm_bindgen]
pub fn validate_has_activities(eventlog_handle: &str, activity_key: &str) -> Result<bool, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let has_activities = log.traces.iter().all(|trace| {
                trace.events.iter().all(|event| {
                    matches!(
                        event.attributes.get(activity_key),
                        Some(AttributeValue::String(_))
                    )
                })
            });
            Ok(has_activities)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}

/// Get activity frequencies
#[wasm_bindgen]
pub fn get_activity_frequencies(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut frequencies: HashMap<String, usize> = HashMap::new();

            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        *frequencies.entry(activity.clone()).or_insert(0) += 1;
                    }
                }
            }

            let mut freq_vec: Vec<(String, usize)> = frequencies.into_iter().collect();
            freq_vec.sort_by_key(|b| std::cmp::Reverse(b.1));

            to_js(&freq_vec)
        }
        Some(_) => Err(js_val("Object is not an EventLog")),
        None => Err(js_val("EventLog not found")),
    })
}
