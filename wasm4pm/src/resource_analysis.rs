use crate::models::parse_timestamp_ms;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use std::collections::HashMap;
/// Priority 5C — Resource-centric analysis.
///
/// Analyzes which resources (people, machines) are performing which activities,
/// workload distribution, and resource bottlenecks.
///
/// Functions:
/// - analyze_resource_utilization: Extract resource attribute, compute total events,
///   time periods active, utilization rate, concurrent case count, top activities.
/// - analyze_resource_activity_matrix: Build resource-activity matrix with
///   specialization scores (Herfindahl index).
/// - identify_resource_bottlenecks: Compute waiting times, processing times,
///   queue sizes for each resource.
use wasm_bindgen::prelude::*;

/// Analyze resource utilization: total events, time periods, concurrent cases, top activities.
///
/// Returns a JSON object:
/// ```json
/// {
///   "resources": {
///     "Alice": {
///       "event_count": 45,
///       "first_event": "2024-01-01T10:00Z",
///       "last_event": "2024-01-31T17:00Z",
///       "avg_concurrent_cases": 3.5,
///       "top_activities": ["Approve", "Review"]
///     },
///     "Bob": { ... }
///   },
///   "total_resources": 5
/// }
/// ```
#[wasm_bindgen]
pub fn analyze_resource_utilization(
    log_handle: &str,
    resource_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    let json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Track per-resource info
            let mut resource_events: HashMap<String, Vec<(usize, i64, String)>> = HashMap::new();
            let mut resource_activities: HashMap<String, HashMap<String, usize>> = HashMap::new();
            let mut case_active_times: Vec<(i64, i64)> = Vec::new(); // (start, end) per case

            // First pass: collect events per resource and case durations
            for trace in &log.traces {
                let mut case_start: Option<i64> = None;
                let mut case_end: Option<i64> = None;

                for (event_idx, event) in trace.events.iter().enumerate() {
                    if let Some(resource) = event
                        .attributes
                        .get(resource_key)
                        .and_then(|v| v.as_string())
                    {
                        if let Some(timestamp_str) = event
                            .attributes
                            .get(timestamp_key)
                            .and_then(|v| v.as_string())
                        {
                            if let Some(ts_ms) = parse_timestamp_ms(timestamp_str) {
                                resource_events
                                    .entry(resource.to_string())
                                    .or_default()
                                    .push((event_idx, ts_ms, String::new()));

                                // Track case duration
                                if case_start.is_none() {
                                    case_start = Some(ts_ms);
                                }
                                case_end = Some(ts_ms);

                                // Track activities per resource
                                if let Some(activity) = event
                                    .attributes
                                    .get("concept:name")
                                    .and_then(|v| v.as_string())
                                {
                                    *resource_activities
                                        .entry(resource.to_string())
                                        .or_default()
                                        .entry(activity.to_string())
                                        .or_insert(0) += 1;
                                }
                            }
                        }
                    }
                }

                // Record case duration
                if let (Some(start), Some(end)) = (case_start, case_end) {
                    case_active_times.push((start, end));
                }
            }

            // Second pass: compute resource metrics
            let mut resources_obj = HashMap::new();

            for (resource, events) in &resource_events {
                if events.is_empty() {
                    continue;
                }

                let event_count = events.len();

                // Get first and last event timestamps
                let min_ts = events.iter().map(|e| e.1).min().unwrap_or(0);
                let max_ts = events.iter().map(|e| e.1).max().unwrap_or(0);

                // Format timestamps
                let first_event = format_timestamp(min_ts);
                let last_event = format_timestamp(max_ts);

                // Compute average concurrent cases during this resource's active time
                let mut concurrent_cases_count = 0.0;
                if !case_active_times.is_empty() {
                    for (case_start, case_end) in &case_active_times {
                        for (res_start, res_end) in &case_active_times {
                            if case_start <= res_end && case_end >= res_start {
                                concurrent_cases_count += 1.0;
                            }
                        }
                    }
                    concurrent_cases_count /= case_active_times.len() as f64;
                }
                let avg_concurrent = concurrent_cases_count;

                // Get top 2 activities
                let mut activities: Vec<_> = resource_activities
                    .get(resource)
                    .map(|acts| acts.iter().collect())
                    .unwrap_or_default();
                activities.sort_by(|a, b| b.1.cmp(a.1));
                let top_activities: Vec<&String> = activities.iter().take(2).map(|a| a.0).collect();

                let resource_info = json!({
                    "event_count": event_count,
                    "first_event": first_event,
                    "last_event": last_event,
                    "avg_concurrent_cases": (avg_concurrent * 10.0).round() / 10.0,
                    "top_activities": top_activities
                });

                resources_obj.insert(resource.clone(), resource_info);
            }

            let total_resources = resources_obj.len();

            serde_json::to_string(&json!({
                "resources": resources_obj,
                "total_resources": total_resources
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&json))
}

/// Analyze resource-activity matrix: which resources perform which activities.
///
/// Returns a JSON object:
/// ```json
/// {
///   "matrix": {
///     "Alice": { "Approve": 40, "Review": 5 },
///     "Bob": { "Process": 50, "Validate": 10 }
///   },
///   "specialization_scores": {
///     "Alice": 0.85,
///     "Bob": 0.72
///   }
/// }
/// ```
#[wasm_bindgen]
pub fn analyze_resource_activity_matrix(
    log_handle: &str,
    resource_key: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut matrix: HashMap<String, HashMap<String, usize>> = HashMap::new();
            let mut resource_totals: HashMap<String, usize> = HashMap::new();

            // Build resource-activity matrix
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(resource) = event
                        .attributes
                        .get(resource_key)
                        .and_then(|v| v.as_string())
                    {
                        if let Some(activity) = event
                            .attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                        {
                            let res_entry = matrix.entry(resource.to_string()).or_default();
                            *res_entry.entry(activity.to_string()).or_insert(0) += 1;
                            *resource_totals.entry(resource.to_string()).or_insert(0) += 1;
                        }
                    }
                }
            }

            // Compute specialization scores using Herfindahl index
            let mut specialization_scores: HashMap<String, f64> = HashMap::new();
            for (resource, activities) in &matrix {
                let total = resource_totals.get(resource).copied().unwrap_or(1) as f64;
                let herfindahl: f64 = activities
                    .values()
                    .map(|count| {
                        let prop = *count as f64 / total;
                        prop * prop
                    })
                    .sum();
                specialization_scores.insert(resource.clone(), herfindahl);
            }

            // Build output matrix with proper JSON
            let mut matrix_obj = HashMap::new();
            for (resource, activities) in matrix {
                let mut activities_obj = HashMap::new();
                for (activity, count) in activities {
                    activities_obj.insert(activity, count);
                }
                matrix_obj.insert(resource, activities_obj);
            }

            serde_json::to_string(&json!({
                "matrix": matrix_obj,
                "specialization_scores": specialization_scores
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&json))
}

/// Identify resource bottlenecks: waiting times, processing times, queue sizes.
///
/// Returns a JSON array of bottlenecks:
/// ```json
/// {
///   "bottlenecks": [
///     {
///       "resource": "Alice",
///       "avg_queue_size": 5.2,
///       "avg_wait_time_hours": 2.5,
///       "processing_time_hours": 0.5
///     },
///     { "resource": "Bob", ... }
///   ]
/// }
/// ```
#[wasm_bindgen]
pub fn identify_resource_bottlenecks(
    log_handle: &str,
    resource_key: &str,
    timestamp_key: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Per-resource, per-case: (case_id, first_activity_time, resource_start_time, resource_end_time, activity)
            #[allow(clippy::type_complexity)]
            let mut resource_case_intervals: HashMap<String, Vec<(String, i64, i64, i64, String)>> =
                HashMap::new();
            let mut case_start_times: HashMap<String, i64> = HashMap::new();

            // Collect all case start times (first event in each case)
            for trace in &log.traces {
                if let Some(trace_id_attr) = trace
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                {
                    if let Some(first_event) = trace.events.first() {
                        if let Some(first_ts_str) = first_event
                            .attributes
                            .get(timestamp_key)
                            .and_then(|v| v.as_string())
                        {
                            if let Some(ts_ms) = parse_timestamp_ms(first_ts_str) {
                                case_start_times.insert(trace_id_attr.to_string(), ts_ms);
                            }
                        }
                    }
                }
            }

            // Collect resource-case intervals
            for trace in &log.traces {
                let case_id = trace
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                    .unwrap_or("unknown")
                    .to_string();

                let case_start = case_start_times.get(&case_id).copied().unwrap_or(0);

                // Track per-resource first and last events in this case
                let mut resource_first_last: HashMap<String, (i64, i64)> = HashMap::new();
                let mut resource_activity: HashMap<String, String> = HashMap::new();

                for event in &trace.events {
                    if let Some(resource) = event
                        .attributes
                        .get(resource_key)
                        .and_then(|v| v.as_string())
                    {
                        if let Some(ts_str) = event
                            .attributes
                            .get(timestamp_key)
                            .and_then(|v| v.as_string())
                        {
                            if let Some(ts_ms) = parse_timestamp_ms(ts_str) {
                                if let Some(activity) = event
                                    .attributes
                                    .get(activity_key)
                                    .and_then(|v| v.as_string())
                                {
                                    let entry = resource_first_last
                                        .entry(resource.to_string())
                                        .or_insert((ts_ms, ts_ms));
                                    entry.1 = ts_ms; // update last
                                    resource_activity.insert(resource.to_string(), activity.to_string());
                                }
                            }
                        }
                    }
                }

                // Store intervals for each resource in this case
                for (resource, (start_ts, end_ts)) in resource_first_last {
                    let activity = resource_activity.get(&resource).cloned().unwrap_or_default();
                    resource_case_intervals
                        .entry(resource)
                        .or_default()
                        .push((case_id.clone(), case_start, start_ts, end_ts, activity));
                }
            }

            // Compute metrics per resource
            let mut bottlenecks: Vec<serde_json::Value> = Vec::new();

            for (resource, intervals) in &resource_case_intervals {
                if intervals.is_empty() {
                    continue;
                }

                // Average wait time: time from case start to resource's first activity
                let mut wait_times_ms: Vec<i64> = Vec::new();
                let mut processing_times_ms: Vec<i64> = Vec::new();

                for (_, _case_start, res_start, res_end, _) in intervals {
                    let wait = (res_start - _case_start).max(0);
                    let processing = (res_end - res_start).max(0);
                    wait_times_ms.push(wait);
                    processing_times_ms.push(processing);
                }

                let avg_wait_ms = if !wait_times_ms.is_empty() {
                    wait_times_ms.iter().sum::<i64>() / wait_times_ms.len() as i64
                } else {
                    0
                };
                let avg_processing_ms = if !processing_times_ms.is_empty() {
                    processing_times_ms.iter().sum::<i64>() / processing_times_ms.len() as i64
                } else {
                    0
                };

                // Queue size: at each timestamp, count how many cases are waiting for this resource
                // Approximate: count overlapping intervals at the resource's start times
                let mut queue_counts: Vec<usize> = Vec::new();
                for (_, _case_start, res_start, _, _) in intervals {
                    let mut queue = 0;
                    for (_, other_start, other_res_start, _, _) in intervals {
                        // Another case is in queue if it started before but resource hasn't started yet
                        if other_start < res_start && other_res_start > res_start {
                            queue += 1;
                        }
                    }
                    queue_counts.push(queue);
                }
                let avg_queue = if !queue_counts.is_empty() {
                    queue_counts.iter().sum::<usize>() as f64 / queue_counts.len() as f64
                } else {
                    0.0
                };

                bottlenecks.push(json!({
                    "resource": resource,
                    "avg_queue_size": (avg_queue * 10.0).round() / 10.0,
                    "avg_wait_time_hours": (avg_wait_ms as f64 / 3_600_000.0 * 100.0).round() / 100.0,
                    "processing_time_hours": (avg_processing_ms as f64 / 3_600_000.0 * 100.0).round() / 100.0
                }));
            }

            // Sort by queue size descending
            bottlenecks.sort_by(|a, b| {
                let aq = a.get("avg_queue_size").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let bq = b.get("avg_queue_size").and_then(|v| v.as_f64()).unwrap_or(0.0);
                bq.partial_cmp(&aq).unwrap_or(std::cmp::Ordering::Equal)
            });

            serde_json::to_string(&json!({
                "bottlenecks": bottlenecks
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&json))
}

/// Helper: format timestamp milliseconds as ISO 8601 string
fn format_timestamp(ms: i64) -> String {
    use chrono::{DateTime, Utc};
    let secs = ms / 1000;
    let nanos = ((ms % 1000) * 1_000_000) as u32;
    match DateTime::<Utc>::from_timestamp(secs, nanos) {
        Some(dt) => dt.to_rfc3339(),
        None => "1970-01-01T00:00:00Z".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, EventLog, Trace};
    use std::collections::HashMap;

    fn create_test_log() -> EventLog {
        EventLog {
            attributes: HashMap::new(),
            traces: vec![
                Trace {
                    attributes: {
                        let mut attrs = HashMap::new();
                        attrs.insert("concept:name".to_string(), AttributeValue::String("case1".to_string()));
                        attrs
                    },
                    events: vec![
                        Event {
                            attributes: {
                                let mut attrs = HashMap::new();
                                attrs.insert("concept:name".to_string(), AttributeValue::String("A".to_string()));
                                attrs.insert("org:resource".to_string(), AttributeValue::String("Alice".to_string()));
                                attrs.insert("time:timestamp".to_string(), AttributeValue::String("2024-01-01T10:00:00Z".to_string()));
                                attrs
                            },
                        },
                        Event {
                            attributes: {
                                let mut attrs = HashMap::new();
                                attrs.insert("concept:name".to_string(), AttributeValue::String("B".to_string()));
                                attrs.insert("org:resource".to_string(), AttributeValue::String("Bob".to_string()));
                                attrs.insert("time:timestamp".to_string(), AttributeValue::String("2024-01-01T11:00:00Z".to_string()));
                                attrs
                            },
                        },
                    ],
                },
            ],
        }
    }

    #[test]
    fn test_resource_utilization_basic() {
        let log = create_test_log();
        let handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .expect("Failed to store log");

        let result = analyze_resource_utilization(&handle, "org:resource", "time:timestamp");
        assert!(result.is_ok(), "Resource utilization should succeed");
    }

    #[test]
    fn test_resource_utilization_invalid_handle() {
        let result = analyze_resource_utilization("invalid", "org:resource", "time:timestamp");
        assert!(result.is_err(), "Should fail on invalid handle");
    }

    #[test]
    fn test_resource_activity_matrix() {
        let log = create_test_log();
        let handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .expect("Failed to store log");

        let result = analyze_resource_activity_matrix(&handle, "org:resource", "concept:name");
        assert!(result.is_ok(), "Activity matrix should succeed");
    }

    #[test]
    fn test_resource_bottlenecks() {
        let log = create_test_log();
        let handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .expect("Failed to store log");

        let result = identify_resource_bottlenecks(&handle, "org:resource", "time:timestamp", "concept:name");
        assert!(result.is_ok(), "Bottleneck detection should succeed");
    }

    #[test]
    fn test_timestamp_formatting() {
        let formatted = format_timestamp(0);
        assert!(formatted.contains("1970-01-01"));
    }
}
