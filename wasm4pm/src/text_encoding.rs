use crate::state::{get_or_init_state, StoredObject};
use serde_json::Value;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Convert a DirectlyFollowsGraph to human-readable English text
/// Describes activities, start/end activities, and edge paths with percentages
#[wasm_bindgen]
pub fn encode_dfg_as_text(dfg_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(dfg_handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
            let mut text = String::new();

            // Activity count and list
            let activity_count = dfg.nodes.len();
            text.push_str(&format!(
                "The process contains {} activities: ",
                activity_count
            ));
            let activities: Vec<String> = dfg.nodes.iter().map(|n| n.label.clone()).collect();
            text.push_str(&activities.join(", "));
            text.push_str(".\n");

            // Calculate total start count
            let total_starts: usize = dfg.start_activities.values().sum();

            // Start activities
            if !dfg.start_activities.is_empty() {
                text.push_str("- Process starts with ");
                let starts: Vec<String> = dfg
                    .start_activities
                    .iter()
                    .map(|(activity, count)| {
                        let pct = if total_starts > 0 {
                            (*count as f64 / total_starts as f64) * 100.0
                        } else {
                            0.0
                        };
                        format!("{} ({} cases, {:.1}%)", activity, count, pct)
                    })
                    .collect();
                text.push_str(&starts.join("; "));
                text.push_str(".\n");
            }

            // Edges (directly-follows relations)
            let mut edges_by_from: HashMap<String, Vec<(String, usize)>> = HashMap::new();
            for edge in &dfg.edges {
                edges_by_from
                    .entry(edge.from.clone())
                    .or_insert_with(Vec::new)
                    .push((edge.to.clone(), edge.frequency));
            }

            for (from_activity, outgoing) in edges_by_from.iter() {
                let total_outgoing: usize = outgoing.iter().map(|(_, freq)| freq).sum();
                text.push_str(&format!("- From {}: ", from_activity));

                let paths: Vec<String> = outgoing
                    .iter()
                    .map(|(to, freq)| {
                        let pct = if total_outgoing > 0 {
                            (*freq as f64 / total_outgoing as f64) * 100.0
                        } else {
                            0.0
                        };
                        format!("{} cases ({:.1}%) proceed to {}", freq, pct, to)
                    })
                    .collect();
                text.push_str(&paths.join(", "));
                text.push_str(".\n");
            }

            // End activities
            if !dfg.end_activities.is_empty() {
                let total_ends: usize = dfg.end_activities.values().sum();
                text.push_str("- Process ends with ");
                let ends: Vec<String> = dfg
                    .end_activities
                    .iter()
                    .map(|(activity, count)| {
                        let pct = if total_ends > 0 {
                            (*count as f64 / total_ends as f64) * 100.0
                        } else {
                            0.0
                        };
                        format!("{} ({:.1}% of cases)", activity, pct)
                    })
                    .collect();
                text.push_str(&ends.join("; "));
                text.push_str(".");
            }

            Ok(text)
        }
        Some(_) => Err(JsValue::from_str("Object is not a DirectlyFollowsGraph")),
        None => Err(JsValue::from_str("DirectlyFollowsGraph not found")),
    })
}

/// Convert top process variants to human-readable text
/// Lists the most common execution sequences with case counts and percentages
#[wasm_bindgen]
pub fn encode_variants_as_text(
    log_handle: &str,
    activity_key: &str,
    top_n: usize,
) -> Result<String, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Extract trace sequences
            let mut variants: HashMap<Vec<String>, usize> = HashMap::new();
            for trace in &log.traces {
                let mut sequence = Vec::new();
                for event in &trace.events {
                    if let Some(activity) = event
                        .attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                    {
                        sequence.push(activity.to_string());
                    }
                }
                if !sequence.is_empty() {
                    *variants.entry(sequence).or_insert(0) += 1;
                }
            }

            let total_cases = log.traces.len() as f64;
            let mut sorted_variants: Vec<_> = variants.into_iter().collect();
            sorted_variants.sort_by(|a, b| b.1.cmp(&a.1)); // Sort by frequency descending

            let mut text = format!(
                "Top {} process variants:\n",
                top_n.min(sorted_variants.len())
            );

            for (idx, (sequence, count)) in sorted_variants.iter().take(top_n).enumerate() {
                let pct = (*count as f64 / total_cases) * 100.0;
                let variant_str = sequence.join(" → ");
                text.push_str(&format!(
                    "{}. {} ({} cases, {:.1}%)\n",
                    idx + 1,
                    variant_str,
                    count,
                    pct
                ));
            }

            Ok(text.trim_end().to_string())
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Convert event log statistics to human-readable summary text
#[wasm_bindgen]
pub fn encode_statistics_as_text(log_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let case_count = log.case_count();
            let event_count = log.event_count();
            let avg_events_per_case = if case_count > 0 {
                event_count as f64 / case_count as f64
            } else {
                0.0
            };

            // Get activity frequencies (using a default activity key)
            let activity_key = "concept:name";
            let activities = log.get_activities(activity_key);
            let unique_activities = activities.len();

            // Count frequency per activity
            let mut activity_freqs: HashMap<String, usize> = HashMap::new();
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(activity) = event
                        .attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                    {
                        *activity_freqs.entry(activity.to_string()).or_insert(0) += 1;
                    }
                }
            }

            let mut freq_pairs: Vec<_> = activity_freqs.into_iter().collect();
            freq_pairs.sort_by(|a, b| b.1.cmp(&a.1)); // Sort by frequency descending

            let mut text = String::from("Process log summary:\n");
            text.push_str(&format!("- Total cases: {}\n", case_count));
            text.push_str(&format!("- Total events: {}\n", event_count));
            text.push_str(&format!(
                "- Average events per case: {:.2}\n",
                avg_events_per_case
            ));
            text.push_str(&format!("- Unique activities: {}\n", unique_activities));

            text.push_str("- Activity frequencies: ");
            let freq_strs: Vec<String> = freq_pairs
                .iter()
                .map(|(activity, freq)| format!("{} ({})", activity, freq))
                .collect();
            text.push_str(&freq_strs.join(", "));

            Ok(text)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Convert conformance check results (as JSON string) to human-readable text
/// Expected JSON format:
/// {
///   "conforming_cases": 95,
///   "non_conforming_cases": 5,
///   "total_cases": 100,
///   "average_fitness": 0.98
/// }
#[wasm_bindgen]
pub fn encode_conformance_as_text(result_json: &str) -> Result<String, JsValue> {
    let result: Value = serde_json::from_str(result_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;

    let conforming = result["conforming_cases"].as_u64().unwrap_or(0) as usize;
    let non_conforming = result["non_conforming_cases"].as_u64().unwrap_or(0) as usize;
    let total = result["total_cases"].as_u64().unwrap_or(1) as usize;
    let avg_fitness = result["average_fitness"].as_f64().unwrap_or(0.0);

    let conforming_pct = if total > 0 {
        (conforming as f64 / total as f64) * 100.0
    } else {
        0.0
    };
    let non_conforming_pct = 100.0 - conforming_pct;

    let mut text = String::from("Conformance analysis:\n");
    text.push_str(&format!("- Total cases checked: {}\n", total));
    text.push_str(&format!(
        "- Conforming cases: {} ({:.1}%)\n",
        conforming, conforming_pct
    ));
    text.push_str(&format!(
        "- Non-conforming cases: {} ({:.1}%)\n",
        non_conforming, non_conforming_pct
    ));
    text.push_str(&format!("- Average case fitness: {:.2}", avg_fitness));

    Ok(text)
}

/// Convert bottleneck analysis results (as JSON string) to human-readable text
/// Expected JSON format:
/// {
///   "bottlenecks": [
///     {"activity": "Approve", "avg_duration_hours": 2.5, "delayed_cases": 85},
///     {"activity": "Close", "avg_duration_hours": 1.2, "delayed_cases": 20},
///     {"activity": "Register", "avg_duration_hours": 0.1, "delayed_cases": 0}
///   ]
/// }
#[wasm_bindgen]
pub fn encode_bottlenecks_as_text(result_json: &str) -> Result<String, JsValue> {
    let result: Value = serde_json::from_str(result_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;

    let bottlenecks = result["bottlenecks"]
        .as_array()
        .ok_or_else(|| JsValue::from_str("Expected 'bottlenecks' array in JSON"))?;

    if bottlenecks.is_empty() {
        return Ok("Bottleneck analysis:\n- No bottlenecks detected.".to_string());
    }

    let mut text = String::from("Bottleneck analysis:\n");

    for (idx, bn) in bottlenecks.iter().enumerate() {
        let activity = bn["activity"].as_str().unwrap_or("Unknown");
        let duration = bn["avg_duration_hours"].as_f64().unwrap_or(0.0);
        let delayed = bn["delayed_cases"].as_u64().unwrap_or(0) as usize;

        if idx == 0 {
            text.push_str(&format!(
                "- Slowest activity: {} (avg {:.1} hours, {} cases delayed)\n",
                activity, duration, delayed
            ));
        } else if idx == 1 {
            text.push_str(&format!(
                "- Second slowest: {} (avg {:.1} hours, {} cases delayed)\n",
                activity, duration, delayed
            ));
        } else {
            text.push_str(&format!(
                "- {}: {} (avg {:.1} hours, {} cases delayed)\n",
                if delayed == 0 { "Fastest" } else { "Activity" },
                activity,
                duration,
                delayed
            ));
        }
    }

    Ok(text.trim_end().to_string())
}

/// Convert OCEL (Object-Centric Event Log) to human-readable summary text
#[wasm_bindgen]
pub fn encode_ocel_summary_as_text(ocel_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let mut text = String::from("Object-centric process log summary:\n");

            // Object types and counts
            let object_type_count = ocel.object_types.len();
            text.push_str(&format!(
                "- Object types: {} ({})\n",
                object_type_count,
                ocel.object_types.join(", ")
            ));

            // Count objects by type
            let mut object_counts: HashMap<String, usize> = HashMap::new();
            for obj in &ocel.objects {
                *object_counts.entry(obj.object_type.clone()).or_insert(0) += 1;
            }

            for obj_type in &ocel.object_types {
                let count = object_counts.get(obj_type).cloned().unwrap_or(0);
                text.push_str(&format!("- {} instances: {}\n", obj_type, count));
            }

            // Event types and count
            let event_type_count = ocel.event_types.len();
            text.push_str(&format!(
                "- Event types: {} ({})\n",
                event_type_count,
                ocel.event_types.join(", ")
            ));

            let total_events = ocel.event_count();
            text.push_str(&format!("- Total events: {}", total_events));

            Ok(text)
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}
