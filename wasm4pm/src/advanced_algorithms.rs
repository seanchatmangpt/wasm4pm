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
) -> DFG {
    let mut dfg = DFG::new();
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
        id: act.to_owned(),
        label: act.to_owned(),
        frequency: 0,
    }));

    // Pre-size the follows map: n² / 4 is a practical upper bound for sparse DFGs.
    let n = col.vocab.len();
    let mut follows: FxHashMap<(u32, u32), usize> =
        FxHashMap::with_capacity_and_hasher(n.saturating_mul(n) / 4 + 1, Default::default());

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
            *follows.entry((a, b)).or_default() += 1;
        }
        *dfg.start_activities
            .entry(col.vocab[col.events[start] as usize].to_owned())
            .or_default() += 1;
        *dfg.end_activities
            .entry(col.vocab[col.events[end - 1] as usize].to_owned())
            .or_default() += 1;
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

/// Default AND-measure threshold for split/join classification, per the
/// Heuristics Miner AND/XOR measure (Weijters et al.).
pub const DEFAULT_AND_THRESHOLD: f64 = 0.65;

/// Classify AND/XOR splits and joins in the dependency graph mined by the
/// Heuristic Miner.
///
/// For an activity `a` with dependency-graph successors `b`, `c`:
///
/// ```text
/// a ⇒ (b ∧ c)  =  (|b>c| + |c>b|) / (|a>b| + |a>c| + 1)
/// ```
///
/// The split is `"AND"` when the measure is ≥ `and_threshold` for every
/// successor pair, else `"XOR"`. Joins use the mirrored measure over
/// predecessors. Only activities with ≥ 2 successors (resp. predecessors)
/// are reported. Output is sorted by activity name (deterministic).
pub fn classify_heuristic_splits_joins(
    log: &EventLog,
    activity_key: &str,
    dependency_threshold: f64,
    and_threshold: f64,
) -> (Vec<serde_json::Value>, Vec<serde_json::Value>) {
    use std::collections::{BTreeMap, BTreeSet};

    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut follows: FxHashMap<(u32, u32), usize> = FxHashMap::default();
    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end.saturating_sub(1) {
            *follows
                .entry((col.events[i], col.events[i + 1]))
                .or_default() += 1;
        }
    }
    let f = |a: u32, b: u32| -> f64 { follows.get(&(a, b)).copied().unwrap_or(0) as f64 };

    // Dependency-filtered graph (same edge criterion as the mined DFG).
    let mut successors: BTreeMap<u32, BTreeSet<u32>> = BTreeMap::new();
    let mut predecessors: BTreeMap<u32, BTreeSet<u32>> = BTreeMap::new();
    for &(a, b) in follows.keys() {
        let (ab, ba) = (f(a, b), f(b, a));
        if (ab - ba) / (ab + ba + 1.0) >= dependency_threshold {
            successors.entry(a).or_default().insert(b);
            predecessors.entry(b).or_default().insert(a);
        }
    }

    // AND iff the measure holds for every unordered target pair.
    let classify = |targets: &BTreeSet<u32>, measure: &dyn Fn(u32, u32) -> f64| -> &'static str {
        let ts: Vec<u32> = targets.iter().copied().collect();
        for i in 0..ts.len() {
            for j in (i + 1)..ts.len() {
                if measure(ts[i], ts[j]) < and_threshold {
                    return "XOR";
                }
            }
        }
        "AND"
    };

    let to_entries = |graph: &BTreeMap<u32, BTreeSet<u32>>,
                      measure_for: &dyn Fn(u32, u32, u32) -> f64|
     -> Vec<serde_json::Value> {
        let mut entries: Vec<(String, serde_json::Value)> = graph
            .iter()
            .filter(|(_, targets)| targets.len() >= 2)
            .map(|(&node, targets)| {
                let m = |b: u32, c: u32| measure_for(node, b, c);
                let split_type = classify(targets, &m);
                let mut names: Vec<&str> = targets.iter().map(|&t| col.vocab[t as usize]).collect();
                names.sort_unstable();
                let node_name = col.vocab[node as usize].to_owned();
                (
                    node_name.clone(),
                    json!({
                        "activity": node_name,
                        "type": split_type,
                        "targets": names,
                    }),
                )
            })
            .collect();
        entries.sort_unstable_by(|x, y| x.0.cmp(&y.0));
        entries.into_iter().map(|(_, v)| v).collect()
    };

    let splits = to_entries(&successors, &|a, b, c| {
        (f(b, c) + f(c, b)) / (f(a, b) + f(a, c) + 1.0)
    });
    let joins = to_entries(&predecessors, &|d, b, c| {
        (f(b, c) + f(c, b)) / (f(b, d) + f(c, d) + 1.0)
    });

    (splits, joins)
}

/// Discover a process model using the Heuristic Miner algorithm.
///
/// More robust than Alpha++ for noisy, real-world logs. Filters low-frequency
/// directly-follows relations based on a dependency threshold.
///
/// # Parameters
/// * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
/// * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
/// * `dependency_threshold` — Minimum dependency score `[0.0, 1.0]` for an edge to be included.
///   Use `0.2`–`0.4` for real-world logs; `0.8` filters out most edges.
///   **Do not use `0.8` on small logs** — it will produce empty or near-empty models.
///
/// # Returns
/// `Result<JsValue, JsValue>` — On success, a DFG JSON with `{nodes, edges}`.
///
/// # Note
/// The function uses a dependency measure rather than raw frequency. An edge `A→B` is
/// kept if `(freq(A,B) - freq(B,A)) / (freq(A,B) + freq(B,A) + 1) >= dependency_threshold`.
#[wasm_bindgen]
pub fn discover_heuristic_miner(
    eventlog_handle: &str,
    activity_key: &str,
    dependency_threshold: f64,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.heuristic_miner",
        algorithm = "heuristic_miner",
        activity_key = activity_key,
        dependency_threshold = dependency_threshold,
        "Heuristic Miner discovery started"
    );

    // Borrow the log in-place via with_object — avoids cloning the entire EventLog.
    // discover_heuristic_miner_from_log accepts &EventLog, so no ownership needed.
    // The log_size and activity_count for tracing are derived from the DFG result,
    // eliminating the extra get_activities() pass that previously ran before the clone.
    let (dfg, log_size) = get_or_init_state().with_event_log(eventlog_handle, |log| {
        let log_size = log.traces.len();
        tracing::info!(
            target: "wasm4pm.discovery.heuristic_miner",
            checkpoint = "feature_extraction",
            log_size = log_size,
            "Log loaded"
        );
        let dfg = discover_heuristic_miner_from_log(log, activity_key, dependency_threshold);
        Ok((dfg, log_size))
    })?;

    let (splits, joins) = get_or_init_state().with_event_log(eventlog_handle, |log| {
        Ok(classify_heuristic_splits_joins(
            log,
            activity_key,
            dependency_threshold,
            DEFAULT_AND_THRESHOLD,
        ))
    })?;

    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.heuristic_miner",
        checkpoint = "result_generation",
        log_size = log_size,
        node_count = n_nodes,
        edge_count = n_edges,
        complexity = if n_nodes > 0 { n_edges as f64 / n_nodes as f64 } else { 0.0 },
        "DFG model constructed"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(dfg))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "nodes": n_nodes,
        "edges": n_edges,
        "algorithm": "heuristic_miner",
        "dependency_threshold": dependency_threshold,
        "splits": splits,
        "joins": joins,
    }))
}

/// Discover infrequent behavior patterns (deviations from main process)
#[wasm_bindgen]
pub fn analyze_infrequent_paths(
    eventlog_handle: &str,
    activity_key: &str,
    frequency_threshold: f64,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let total_traces = log.traces.len() as f64;

        // Build activity vocabulary
        let mut vocab: std::collections::HashMap<&str, u32> = std::collections::HashMap::default();
        let mut vocab_len: u32 = 0;
        for trace in &log.traces {
            for event in &trace.events {
                if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
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
                if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
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
                        .filter_map(|e| {
                            e.attributes
                                .get(activity_key)?
                                .as_string()
                                .map(str::to_owned)
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

        infrequent_paths.sort_unstable_by(|a, b| {
            let freq_a = a["frequency"].as_f64().unwrap_or(0.0);
            let freq_b = b["frequency"].as_f64().unwrap_or(0.0);
            freq_b
                .partial_cmp(&freq_a)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    let pa = a["path"].as_array().map(|v| v.len()).unwrap_or(0);
                    let pb = b["path"].as_array().map(|v| v.len()).unwrap_or(0);
                    pa.cmp(&pb)
                })
        });

        to_js_str(&json!({
            "infrequent_paths": infrequent_paths,
            "total_distinct_paths": total_distinct_paths,
            "frequency_threshold": frequency_threshold,
        }))
    })
}

/// Detect rework patterns (activities that are repeated in same trace)
#[wasm_bindgen]
pub fn detect_rework(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
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
                .filter_map(|e| e.attributes.get(activity_key)?.as_string())
                .collect();

            activities.sort_unstable();

            // Each consecutive equal pair in the sorted list represents one extra
            // occurrence (rework).  Counting them gives the rework contribution of
            // this trace without any HashMap or explicit `if` inside the loop.
            let trace_rework: usize = activities
                .windows(2)
                .filter(|w| w[0] == w[1])
                .inspect(|w| {
                    *rework_stats.entry(w[0].to_owned()).or_default() += 1;
                })
                .count();

            if trace_rework > 0 {
                traces_with_rework += 1;
                total_rework_count += trace_rework;
            }
        }

        let mut rework_vec: Vec<(String, usize)> = rework_stats.into_iter().collect();
        rework_vec.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));

        to_js_str(&json!({
            "traces_with_rework": traces_with_rework,
            "rework_percentage": (traces_with_rework as f64 / log.traces.len() as f64) * 100.0,
            "total_rework_instances": total_rework_count,
            "rework_by_activity": rework_vec,
        }))
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
    get_or_init_state().with_event_log(eventlog_handle, |log| {
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
                    let duration = crate::parse_iso8601_duration(start_time, end_time).abs() as u64;

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

        bottlenecks.sort_unstable_by(|a, b| {
            let avg_a = a["avg_duration"].as_f64().unwrap_or(0.0);
            let avg_b = b["avg_duration"].as_f64().unwrap_or(0.0);
            avg_b
                .partial_cmp(&avg_a)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a["activity"].as_str().cmp(&b["activity"].as_str()))
        });

        to_js_str(&json!({
            "bottlenecks": bottlenecks,
            "duration_threshold": duration_threshold_seconds,
        }))
    })
}

/// Get process model complexity metrics
#[wasm_bindgen]
pub fn compute_model_metrics(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
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
                if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn make_log(variants: &[(&[&str], usize)]) -> EventLog {
        let mut log = EventLog::new();
        for &(acts, count) in variants {
            for _ in 0..count {
                let trace = Trace {
                    attributes: BTreeMap::new(),
                    events: acts
                        .iter()
                        .map(|&a| {
                            let mut attrs = BTreeMap::new();
                            attrs.insert(
                                "concept:name".to_string(),
                                AttributeValue::String(a.to_string()),
                            );
                            Event { attributes: attrs }
                        })
                        .collect(),
                };
                log.traces.push(trace);
            }
        }
        log
    }

    #[test]
    fn heuristic_and_split_join_detected_on_parallel_log() {
        // 10×⟨a,b,c,d⟩ + 10×⟨a,c,b,d⟩:
        // |b>c| = |c>b| = 10, |a>b| = |a>c| = 10
        // AND measure at a = (10+10)/(10+10+1) = 20/21 ≥ 0.65 ⇒ AND
        let log = make_log(&[(&["a", "b", "c", "d"], 10), (&["a", "c", "b", "d"], 10)]);
        let (splits, joins) =
            classify_heuristic_splits_joins(&log, "concept:name", 0.5, DEFAULT_AND_THRESHOLD);

        assert_eq!(splits.len(), 1, "only 'a' has ≥2 successors: {:?}", splits);
        assert_eq!(splits[0]["activity"], "a");
        assert_eq!(splits[0]["type"], "AND");
        assert_eq!(splits[0]["targets"], serde_json::json!(["b", "c"]));

        assert_eq!(joins.len(), 1, "only 'd' has ≥2 predecessors: {:?}", joins);
        assert_eq!(joins[0]["activity"], "d");
        assert_eq!(joins[0]["type"], "AND");
        assert_eq!(joins[0]["targets"], serde_json::json!(["b", "c"]));
    }

    #[test]
    fn heuristic_xor_split_join_detected_on_exclusive_log() {
        // 10×⟨a,b,d⟩ + 10×⟨a,c,d⟩: |b>c| = |c>b| = 0 → measure 0/21 ⇒ XOR
        let log = make_log(&[(&["a", "b", "d"], 10), (&["a", "c", "d"], 10)]);
        let (splits, joins) =
            classify_heuristic_splits_joins(&log, "concept:name", 0.5, DEFAULT_AND_THRESHOLD);

        assert_eq!(splits.len(), 1);
        assert_eq!(splits[0]["activity"], "a");
        assert_eq!(splits[0]["type"], "XOR");

        assert_eq!(joins.len(), 1);
        assert_eq!(joins[0]["activity"], "d");
        assert_eq!(joins[0]["type"], "XOR");
    }

    #[test]
    fn heuristic_no_splits_on_sequential_log() {
        let log = make_log(&[(&["a", "b", "c"], 10)]);
        let (splits, joins) =
            classify_heuristic_splits_joins(&log, "concept:name", 0.5, DEFAULT_AND_THRESHOLD);
        assert!(splits.is_empty());
        assert!(joins.is_empty());
    }
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
