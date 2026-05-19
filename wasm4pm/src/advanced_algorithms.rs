use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use rustc_hash::FxHashMap;
use serde_json::json;
use smallvec::SmallVec;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

#[cfg(not(feature = "bcinr"))]
const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
#[cfg(not(feature = "bcinr"))]
const FNV_PRIME: u64 = 0x100000001b3;

/// Pure-Rust Heuristic Miner without wasm-bindgen. Used by integration tests.
pub fn discover_heuristic_miner_from_log(
    log: &EventLog,
    activity_key: &str,
    dependency_threshold: f64,
) -> DirectlyFollowsGraph {
    let mut dfg = DirectlyFollowsGraph::new();
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
        id: act.to_owned(),
        label: act.to_owned(),
        frequency: 0,
    }));

    let mut follows: FxHashMap<(u32, u32), usize> = FxHashMap::default();

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        if start >= end {
            continue;
        }
        for &id in &col.events[start..end] {
            dfg.nodes[id as usize].frequency += 1;
        }
        for i in start..end - 1 {
            let (a, b) = (col.events[i], col.events[i + 1]);
            *follows.entry((a, b)).or_insert(0) += 1;
        }
        *dfg.start_activities
            .entry(col.vocab[col.events[start] as usize].to_owned())
            .or_insert(0) += 1;
        *dfg.end_activities
            .entry(col.vocab[col.events[end - 1] as usize].to_owned())
            .or_insert(0) += 1;
    }

    for (&(a, b), &count) in &follows {
        // dep(a,b) = (|a>b| - |b>a|) / (|a>b| + |b>a| + 1) per Weijters et al.
        let reverse_count = follows.get(&(b, a)).copied().unwrap_or(0);
        let ab = f64::from(count as u32);
        let ba = f64::from(reverse_count as u32);
        if (ab - ba) / (ab + ba + 1.0) >= dependency_threshold {
            dfg.edges.push(DirectlyFollowsRelation {
                from: col.vocab[a as usize].to_owned(),
                to: col.vocab[b as usize].to_owned(),
                frequency: count,
            });
        }
    }

    dfg
}

/// Heuristic Miner - discovers process models from real-world logs
/// More lenient than Alpha++ for handling noise and incomplete data
#[wasm_bindgen]
pub fn discover_heuristic_miner(
    eventlog_handle: &str,
    activity_key: &str,
    dependency_threshold: f64,
) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;
    let dfg = discover_heuristic_miner_from_log(&log, activity_key, dependency_threshold);
    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "nodes": n_nodes,
        "edges": n_edges,
        "algorithm": "heuristic_miner",
        "dependency_threshold": dependency_threshold,
    }))
}

/// Discover infrequent behavior patterns (deviations from main process)
#[wasm_bindgen]
pub fn analyze_infrequent_paths(
    eventlog_handle: &str,
    activity_key: &str,
    frequency_threshold: f64,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let total_traces = log.traces.len() as f64;

            // Build activity vocabulary
            let mut vocab: std::collections::HashMap<&str, u32> =
                std::collections::HashMap::default();
            let mut vocab_len: u32 = 0;
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        vocab.entry(activity.as_str()).or_insert_with(|| {
                            let id = vocab_len;
                            vocab_len += 1;
                            id
                        });
                    }
                }
            }

            let mut path_frequencies: FxHashMap<u64, (Vec<String>, usize)> = FxHashMap::default();

            // Hoisted outside the loop — reused across every trace via .clear().
            // SmallVec<[u32; 16]> covers the common case (≤16 activities) without
            // heap allocation; longer traces spill transparently.
            let mut trace_ids: SmallVec<[u32; 16]> = SmallVec::new();

            // Extract activity sequences (paths) and hash them
            for trace in &log.traces {
                trace_ids.clear();
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        if let Some(&id) = vocab.get(activity.as_str()) {
                            trace_ids.push(id);
                        }
                    }
                }

                // Hash the u32 sequence
                #[cfg(feature = "bcinr")]
                let path_hash: u64 = trace_ids.iter().fold(0u64, |h, &id| {
                    crate::bcinr_compat::sketch::fnv1a_64(&(h ^ (id as u64)).to_le_bytes())
                });

                #[cfg(not(feature = "bcinr"))]
                let path_hash: u64 = trace_ids.iter().fold(FNV_OFFSET_BASIS, |h, &id| {
                    (h ^ (id as u64)).wrapping_mul(FNV_PRIME)
                });

                path_frequencies
                    .entry(path_hash)
                    .and_modify(|(_, count)| *count += 1)
                    .or_insert_with(|| {
                        // Cold path: first time we see this variant.  Build path_str
                        // only here — skipped entirely for every subsequent occurrence.
                        let path_str = trace
                            .events
                            .iter()
                            .filter_map(|e| match e.attributes.get(activity_key) {
                                Some(AttributeValue::String(s)) => Some(s.clone()),
                                _ => None,
                            })
                            .collect::<Vec<String>>();
                        (path_str, 1)
                    });
            }

            // Find infrequent paths
            let total_distinct_paths = path_frequencies.len();
            let mut infrequent_paths = Vec::new();
            for (_hash, (path, count)) in path_frequencies {
                let frequency = count as f64 / total_traces;
                if frequency < frequency_threshold {
                    infrequent_paths.push(json!({
                        "path": path,
                        "count": count,
                        "frequency": frequency,
                    }));
                }
            }

            infrequent_paths.sort_by(|a, b| {
                let freq_a = a["frequency"].as_f64().unwrap_or(0.0);
                let freq_b = b["frequency"].as_f64().unwrap_or(0.0);
                freq_b
                    .partial_cmp(&freq_a)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            to_js_str(&json!({
                "infrequent_paths": infrequent_paths,
                "total_distinct_paths": total_distinct_paths,
                "frequency_threshold": frequency_threshold,
            }))
        }
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
}

/// Detect rework patterns (activities that are repeated in same trace)
#[wasm_bindgen]
pub fn detect_rework(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut rework_stats: FxHashMap<String, usize> = FxHashMap::default();
            let mut traces_with_rework = 0;
            let mut total_rework_count = 0;

            for trace in &log.traces {
                // Collect all activity names present in this trace into a sorted vec.
                // Sorting groups identical activities together so a single .windows(2)
                // pass can identify duplicates without a per-trace HashMap allocation.
                let mut activities: Vec<&str> = trace
                    .events
                    .iter()
                    .filter_map(|e| match e.attributes.get(activity_key) {
                        Some(AttributeValue::String(s)) => Some(s.as_str()),
                        _ => None,
                    })
                    .collect();

                activities.sort_unstable();

                // Each consecutive equal pair in the sorted list represents one extra
                // occurrence (rework).  Counting them gives the rework contribution of
                // this trace without any HashMap or explicit `if` inside the loop.
                let trace_rework: usize = activities
                    .windows(2)
                    .filter(|w| w[0] == w[1])
                    .inspect(|w| {
                        *rework_stats.entry(w[0].to_owned()).or_insert(0) += 1;
                    })
                    .count();

                if trace_rework > 0 {
                    traces_with_rework += 1;
                    total_rework_count += trace_rework;
                }
            }

            let mut rework_vec: Vec<(String, usize)> = rework_stats.into_iter().collect();
            rework_vec.sort_by_key(|b| std::cmp::Reverse(b.1));

            to_js_str(&json!({
                "traces_with_rework": traces_with_rework,
                "rework_percentage": (traces_with_rework as f64 / log.traces.len() as f64) * 100.0,
                "total_rework_instances": total_rework_count,
                "rework_by_activity": rework_vec,
            }))
        }
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
}

/// Detect bottlenecks - activities with high duration or long waiting times
#[wasm_bindgen]
pub fn detect_bottlenecks(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    duration_threshold_seconds: u64,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut activity_durations: FxHashMap<String, Vec<u64>> = FxHashMap::default();

            for trace in &log.traces {
                for i in 0..trace.events.len() - 1 {
                    if let (
                        Some(AttributeValue::String(activity)),
                        Some(AttributeValue::Date(start_time)),
                        Some(AttributeValue::Date(end_time)),
                    ) = (
                        trace.events[i].attributes.get(activity_key),
                        trace.events[i].attributes.get(timestamp_key),
                        trace.events[i + 1].attributes.get(timestamp_key),
                    ) {
                        let duration =
                            crate::parse_iso8601_duration(start_time, end_time).abs() as u64;

                        if duration > duration_threshold_seconds {
                            activity_durations
                                .entry(activity.clone())
                                .or_default()
                                .push(duration);
                        }
                    }
                }
            }

            let mut bottlenecks = Vec::new();
            for (activity, durations) in activity_durations {
                if !durations.is_empty() {
                    let avg = durations.iter().sum::<u64>() as f64 / durations.len() as f64;
                    let max = *durations.iter().max().unwrap_or(&0);

                    bottlenecks.push(json!({
                        "activity": activity,
                        "occurrences": durations.len(),
                        "avg_duration": avg,
                        "max_duration": max,
                    }));
                }
            }

            bottlenecks.sort_by(|a, b| {
                let avg_a = a["avg_duration"].as_f64().unwrap_or(0.0);
                let avg_b = b["avg_duration"].as_f64().unwrap_or(0.0);
                avg_b
                    .partial_cmp(&avg_a)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            to_js_str(&json!({
                "bottlenecks": bottlenecks,
                "duration_threshold": duration_threshold_seconds,
            }))
        }
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
}

/// Get process model complexity metrics
#[wasm_bindgen]
pub fn compute_model_metrics(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let relations = log.get_directly_follows(activity_key);

            // Calculate metrics
            let avg_degree = if !activities.is_empty() {
                (relations.len() as f64 * 2.0) / activities.len() as f64
            } else {
                0.0
            };

            // Density: ratio of actual to possible edges
            let max_edges = activities.len() * (activities.len() - 1);
            let density = if max_edges > 0 {
                relations.len() as f64 / max_edges as f64
            } else {
                0.0
            };

            // Variant count (number of unique case traces)
            let mut variants = HashSet::new();
            for trace in &log.traces {
                let mut path = Vec::new();
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        path.push(activity.clone());
                    }
                }
                variants.insert(path);
            }

            to_js_str(&json!({
                "num_activities": activities.len(),
                "num_edges": relations.len(),
                "num_variants": variants.len(),
                "avg_degree": avg_degree,
                "density": density,
                "complexity_score": (activities.len() as f64 * variants.len() as f64).sqrt(),
            }))
        }
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
}

#[wasm_bindgen]
pub fn advanced_algorithms_info() -> String {
    json!({
        "status": "advanced_algorithms_available",
        "algorithms": [
            {
                "name": "heuristic_miner",
                "description": "Discovers process models with configurable dependency threshold",
                "better_for": "Real-world logs with noise and incomplete data"
            },
            {
                "name": "analyze_infrequent_paths",
                "description": "Identifies rare or exceptional process variants",
                "better_for": "Detecting outliers and uncommon behaviors"
            },
            {
                "name": "detect_rework",
                "description": "Finds activities that are repeated in the same case",
                "better_for": "Process optimization and quality assurance"
            },
            {
                "name": "detect_bottlenecks",
                "description": "Identifies slow activities with high duration",
                "better_for": "Performance analysis and optimization"
            },
            {
                "name": "compute_model_metrics",
                "description": "Calculates complexity and structure metrics",
                "better_for": "Model quality assessment"
            }
        ]
    })
    .to_string()
}
