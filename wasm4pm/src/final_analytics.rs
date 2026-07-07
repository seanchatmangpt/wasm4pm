use crate::models::*;
use crate::state::get_or_init_state;
use crate::utilities::to_js_str;
use hashbrown::HashMap;
use itertools::Itertools;
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::BTreeMap;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// Measure variant entropy and diversity in event log.
#[wasm_bindgen]
pub fn analyze_variant_complexity(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let total = log.traces.len() as f64;

        // Single-pass: build variant counts with itertools::counts()
        let variants = log
            .traces
            .iter()
            .map(|trace| {
                trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(activity_key)?
                            .as_string()
                            .map(str::to_owned)
                    })
                    .collect::<Vec<String>>()
            })
            .counts();

        // Shannon entropy — use mul_add to reduce rounding error (enables FMA)
        let entropy: f64 = variants.values().fold(0.0_f64, |acc, &count| {
            let p = count as f64 / total;
            // acc + (- p * log2(p))  =>  p.log2().mul_add(-p, acc)
            p.log2().mul_add(-p, acc)
        });

        let mut variant_counts: Vec<usize> = variants.values().copied().collect();
        variant_counts.sort_unstable_by(|a, b| b.cmp(a));
        let coverage_top_10: f64 = variant_counts
            .iter()
            .take(10)
            .map(|&v| v as f64 / total)
            .sum();

        let max_entropy = if variants.len() > 1 {
            (variants.len() as f64).log2()
        } else {
            0.0
        };

        to_js_str(&json!({
            "total_variants": variants.len(),
            "entropy": entropy,
            "max_entropy": max_entropy,
            "normalized_entropy": if variants.len() <= 1 { 0.0 } else { entropy / max_entropy },
            "top_10_coverage": coverage_top_10,
            "predominant_variant_size": variant_counts.first().copied().unwrap_or(0),
        }))
    })
}

/// Compute activity transition matrix (Markov chain).
#[wasm_bindgen]
pub fn compute_activity_transition_matrix(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let activities = log.get_activities(activity_key);

        // Build activity vocabulary
        let vocab: HashMap<String, u32> = activities
            .iter()
            .enumerate()
            .map(|(i, a)| {
                (
                    a.clone(),
                    u32::try_from(i).expect("activity vocab index fits u32"),
                )
            })
            .collect();

        let mut transitions: BTreeMap<(u32, u32), usize> = BTreeMap::new();
        let mut activity_total: FxHashMap<u32, usize> = FxHashMap::default();

        for activity_id in vocab.values() {
            activity_total.insert(*activity_id, 0);
        }

        for trace in &log.traces {
            trace.events.windows(2).for_each(|w| {
                if let (Some(AttributeValue::String(a1)), Some(AttributeValue::String(a2))) = (
                    w[0].attributes.get(activity_key),
                    w[1].attributes.get(activity_key),
                ) {
                    if let (Some(&a1_id), Some(&a2_id)) = (vocab.get(a1), vocab.get(a2)) {
                        *transitions.entry((a1_id, a2_id)).or_default() += 1;
                        *activity_total.entry(a1_id).or_default() += 1;
                    }
                }
            });
        }

        // Compute transition probabilities
        let matrix_data: Vec<_> = transitions
            .iter()
            .filter_map(|((from, to), count)| {
                activities.get(*from as usize).and_then(|from_name| {
                    activities.get(*to as usize).map(|to_name| {
                        let prob =
                            *count as f64 / activity_total.get(from).copied().unwrap_or(1) as f64;
                        json!({
                            "from": from_name,
                            "to": to_name,
                            "count": count,
                            "probability": prob
                        })
                    })
                })
            })
            .collect();

        to_js_str(&json!({
            "matrix": matrix_data,
            "num_activities": activities.len(),
        }))
    })
}

/// Identify where the process accelerates/decelerates over time.
///
/// Orders traces by their first timestamp, groups them into consecutive
/// windows of `window_size` traces, computes each window's mean inter-event
/// gap, and fits an OLS trend of mean gap over window index. A negative slope
/// means gaps are shrinking over time (speedup); positive means slowdown.
#[wasm_bindgen]
pub fn analyze_process_speedup(
    eventlog_handle: &str,
    timestamp_key: &str,
    window_size: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        to_js_str(&analyze_process_speedup_from_log(log, timestamp_key, window_size))
    })
}

/// Pure core of [`analyze_process_speedup`], usable from native tests.
pub fn analyze_process_speedup_from_log(
    log: &crate::models::EventLog,
    timestamp_key: &str,
    window_size: usize,
) -> serde_json::Value {
    {
        // Per-trace: (first timestamp string for ordering, gaps within trace)
        let mut per_trace: Vec<(String, Vec<f64>)> = Vec::new();
        let mut time_gaps: Vec<f64> = Vec::new();

        for trace in &log.traces {
            let timestamps: Vec<&str> = trace
                .events
                .iter()
                .filter_map(|e| e.attributes.get(timestamp_key)?.as_string())
                .collect();
            if timestamps.is_empty() {
                continue;
            }
            let mut gaps = Vec::with_capacity(timestamps.len().saturating_sub(1));
            for pair in timestamps.windows(2) {
                let gap = crate::parse_iso8601_duration(&pair[0], &pair[1]).abs();
                gaps.push(gap);
                time_gaps.push(gap);
            }
            // ISO-8601 strings order lexicographically within a uniform offset.
            per_trace.push((timestamps[0].to_string(), gaps));
        }

        if time_gaps.is_empty() {
            return json!({
                "message": "No timestamps found",
                "gaps": [],
                "windows": [],
            });
        }

        // Windowed trend over traces ordered by start time.
        per_trace.sort_by(|a, b| a.0.cmp(&b.0));
        let w = window_size.max(1);
        let mut windows: Vec<serde_json::Value> = Vec::new();
        let mut window_means: Vec<f64> = Vec::new();
        for (wi, chunk) in per_trace.chunks(w).enumerate() {
            let gaps: Vec<f64> = chunk.iter().flat_map(|(_, g)| g.iter().copied()).collect();
            if gaps.is_empty() {
                continue;
            }
            let mean_gap = gaps.iter().sum::<f64>() / gaps.len() as f64;
            window_means.push(mean_gap);
            windows.push(json!({
                "window": wi,
                "traces": chunk.len(),
                "events_gaps": gaps.len(),
                "mean_gap": mean_gap,
                "start": chunk[0].0,
            }));
        }

        // OLS slope of mean gap over window index (normal equations).
        let k = window_means.len() as f64;
        let (slope, trend) = if window_means.len() >= 2 {
            let mean_x = (k - 1.0) / 2.0;
            let mean_y = window_means.iter().sum::<f64>() / k;
            let mut sxy = 0.0;
            let mut sxx = 0.0;
            for (i, &y) in window_means.iter().enumerate() {
                let dx = i as f64 - mean_x;
                sxy += dx * (y - mean_y);
                sxx += dx * dx;
            }
            let slope = if sxx > 0.0 { sxy / sxx } else { 0.0 };
            // Classify relative to the overall mean gap magnitude.
            let scale = mean_y.abs().max(f64::EPSILON);
            let trend = if slope < -0.01 * scale {
                "speedup"
            } else if slope > 0.01 * scale {
                "slowdown"
            } else {
                "stable"
            };
            (slope, trend)
        } else {
            (0.0, "insufficient_windows")
        };

        time_gaps.sort_unstable_by(f64::total_cmp);
        let mean: f64 = time_gaps.iter().sum::<f64>() / time_gaps.len() as f64;
        let p25_idx = ((time_gaps.len() as f64 - 1.0) * 0.25).round() as usize;
        let p75_idx = ((time_gaps.len() as f64 - 1.0) * 0.75).round() as usize;

        json!({
            "avg_gap": mean,
            "p25": time_gaps[p25_idx],
            "p75": time_gaps[p75_idx],
            "speedup_range": time_gaps[p75_idx] - time_gaps[p25_idx],
            "window_size": w,
            "windows": windows,
            "trend_slope": slope,
            "trend": trend,
        })
    }
}

/// Compute pairwise trace similarity matrix.
#[wasm_bindgen]
pub fn compute_trace_similarity_matrix(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut similarities = Vec::new();

        // Pre-compute HashSet<&str> per trace — O(n log n) once, O(1) per pair lookup
        let trace_sets: Vec<HashSet<&str>> = log
            .traces
            .iter()
            .map(|trace| {
                trace
                    .events
                    .iter()
                    .filter_map(|e| e.attributes.get(activity_key)?.as_string())
                    .collect()
            })
            .collect();

        for i in 0..log.traces.len() {
            for j in (i + 1)..log.traces.len() {
                // Jaccard via set intersection/union — O(min(|i|,|j|)) per pair
                let common = trace_sets[i].intersection(&trace_sets[j]).count();
                let union = trace_sets[i].len() + trace_sets[j].len() - common;
                // max(1) denominator guard — branchless cmov, no divide-by-zero
                let similarity = common as f64 / union.max(1) as f64;

                if similarity > 0.5 {
                    similarities.push(json!({
                        "trace_i": i,
                        "trace_j": j,
                        "similarity": similarity
                    }));
                }
            }
        }

        to_js_str(&json!({
            "similar_pairs": similarities,
            "total_pairs": (log.traces.len() * (log.traces.len() - 1)) / 2,
        }))
    })
}

/// Identify temporal bottlenecks by activity duration.
#[wasm_bindgen]
pub fn analyze_temporal_bottlenecks(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut activity_durations: std::collections::BTreeMap<String, Vec<f64>> =
            std::collections::BTreeMap::new();

        for trace in &log.traces {
            let activities: Vec<(String, String)> = trace
                .events
                .iter()
                .filter_map(|e| {
                    if let (Some(AttributeValue::String(act)), Some(AttributeValue::String(ts))) = (
                        e.attributes.get(activity_key),
                        e.attributes.get(timestamp_key),
                    ) {
                        Some((act.clone(), ts.clone()))
                    } else {
                        None
                    }
                })
                .collect();

            for i in 0..activities.len().saturating_sub(1) {
                let duration =
                    crate::parse_iso8601_duration(&activities[i].1, &activities[i + 1].1);
                activity_durations
                    .entry(activities[i].0.clone())
                    .or_default()
                    .push(duration.abs());
            }
        }

        let bottlenecks: Vec<_> = activity_durations
            .iter()
            .map(|(activity, durations)| {
                let avg: f64 = durations.iter().sum::<f64>() / durations.len() as f64;
                let max = durations.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                json!({
                    "activity": activity,
                    "avg_duration": avg,
                    "max_duration": max,
                })
            })
            .collect();

        to_js_str(&json!({
            "bottlenecks": bottlenecks,
        }))
    })
}

/// Extract mandatory activity ordering from event log.
#[wasm_bindgen]
pub fn extract_activity_ordering(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut mandatory_predecessors: std::collections::BTreeMap<
            String,
            std::collections::BTreeSet<String>,
        > = std::collections::BTreeMap::new();

        for trace in &log.traces {
            // Collect only events that carry the activity key, preserving order
            let activities: Vec<&str> = trace
                .events
                .iter()
                .filter_map(|e| e.attributes.get(activity_key)?.as_string())
                .collect();

            for (pos, &activity) in activities.iter().enumerate() {
                // All activities that appear before this position are predecessors
                let predecessors: std::collections::BTreeSet<String> =
                    activities.iter().take(pos).map(|&a| a.to_owned()).collect();
                // Mandatory predecessor = present before this activity in EVERY trace.
                // Vacant: seed with full predecessor set.
                // Occupied: intersect to keep only those seen in all traces so far.
                mandatory_predecessors
                    .entry(activity.to_owned())
                    .and_modify(|existing: &mut std::collections::BTreeSet<String>| {
                        existing.retain(|p| predecessors.contains(p.as_str()));
                    })
                    .or_insert(predecessors);
            }
        }

        // BTreeMap iterates in sorted key order; BTreeSet values also sorted.
        let result: Vec<_> = mandatory_predecessors
            .iter()
            .map(|(activity, preds)| {
                json!({
                    "activity": activity,
                    "mandatory_predecessors": preds
                })
            })
            .collect();

        to_js_str(&json!({
            "activity_ordering": result,
        }))
    })
}

#[wasm_bindgen]
pub fn final_analytics_info() -> String {
    json!({
        "status": "final_analytics_available",
        "functions": [
            {"name": "variant_complexity", "type": "entropy_analysis"},
            {"name": "transition_matrix", "type": "markov_chain"},
            {"name": "speedup_analysis", "type": "temporal"},
            {"name": "trace_similarity", "type": "distance_metric"},
            {"name": "temporal_bottlenecks", "type": "performance"},
            {"name": "activity_ordering", "type": "constraints"},
        ]
    })
    .to_string()
}
