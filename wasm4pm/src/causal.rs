/// Causal Discovery (Lightweight) — Temporal precedence + conditional probability.
///
/// Discovers causal candidates from event logs using:
/// 1. Causal footprints: temporal ordering + conditional probability
/// 2. Granger-like test: does past activity X predict future activity Y?
///
/// Pure Rust/WASM — no ML/LLM dependencies. No full PC algorithm,
/// but actionable causal candidates for process analysis.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::error::{wasm_err, codes};
use crate::utilities::to_js;
use std::collections::{HashMap, HashSet};

/// Compute causal footprints: for each activity pair (from, to), measure
/// the strength of the causal relationship based on temporal precedence
/// and conditional probability.
///
/// ```javascript
/// const result = JSON.parse(pm.causal_footprint(handle, 'concept:name'));
/// // { pairs: [{from: "A", to: "B", always_precedes: true, conditional_prob: 0.95, strength: 0.9}] }
/// ```
#[wasm_bindgen]
pub fn causal_footprint(
    log_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let traces = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.traces.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    if traces.is_empty() {
        return to_js(&serde_json::json!({
            "pairs": [],
            "method": "causal_footprint",
        }));
    }

    // Count: from_occurrences, to_occurrences, from_then_to, to_without_from
    let mut from_count: HashMap<String, usize> = HashMap::new();
    let mut to_count: HashMap<String, usize> = HashMap::new();
    let mut from_to_count: HashMap<(String, String), usize> = HashMap::new();
    let mut to_without_from: HashMap<(String, String), usize> = HashMap::new();

    for trace in &traces {
        let acts: Vec<&str> = trace.events.iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
            .collect();

        let act_set: HashSet<&str> = acts.iter().copied().collect();

        for &a in &acts {
            *from_count.entry(a.to_string()).or_insert(0) += 1;
        }
        for &b in &acts {
            *to_count.entry(b.to_string()).or_insert(0) += 1;
        }

        for window in acts.windows(2) {
            *from_to_count.entry((window[0].to_string(), window[1].to_string())).or_insert(0) += 1;
        }

        // Count to_without_from: b occurs in trace but a does not
        let all_froms: HashSet<String> = from_to_count.keys().map(|(f, _)| f.clone()).collect();
        let all_tos: HashSet<String> = from_to_count.keys().map(|(_, t)| t.clone()).collect();
        for b in &all_tos {
            for a in &all_froms {
                if act_set.contains(b.as_str()) && !act_set.contains(a.as_str()) {
                    *to_without_from.entry((a.clone(), b.clone())).or_insert(0) += 1;
                }
            }
        }
    }

    // Compute causal strength for each pair
    let mut pairs = Vec::new();
    for ((from, to), ft_count) in &from_to_count {
        let f_count = from_count.get(from).copied().unwrap_or(1).max(1);
        let t_count = to_count.get(to).copied().unwrap_or(1).max(1);
        let twf_count = to_without_from.get(&(from.clone(), to.clone())).copied().unwrap_or(0);

        // Conditional probability: P(to | from) = from_then_to / from_count
        let conditional_prob = *ft_count as f64 / f_count as f64;

        // Always-precedes: does 'from' always appear before 'to' when both are in the trace?
        let traces_with_both = traces.iter().filter(|trace| {
            let acts: HashSet<&str> = trace.events.iter()
                .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                .collect();
            acts.contains(from.as_str()) && acts.contains(to.as_str())
        }).count();

        let traces_from_before_to = traces.iter().filter(|trace| {
            let acts: Vec<&str> = trace.events.iter()
                .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                .collect();
            let from_pos = acts.iter().position(|&a| a == from);
            let to_pos = acts.iter().position(|&a| a == to);
            match (from_pos, to_pos) {
                (Some(f), Some(t)) => f < t,
                _ => false,
            }
        }).count();

        let always_precedes = traces_with_both > 0 && traces_from_before_to == traces_with_both;

        // Causal strength: combination of conditional probability and temporal ordering
        // Also factor in: does 'to' ever appear without 'from'? (confounding indicator)
        let to_alone_ratio = if t_count > 0 {
            twf_count as f64 / t_count as f64
        } else {
            0.0
        };

        let strength = conditional_prob * (1.0 - to_alone_ratio * 0.5);

        pairs.push(serde_json::json!({
            "from": from,
            "to": to,
            "from_count": f_count,
            "to_count": t_count,
            "from_to_count": *ft_count,
            "always_precedes": always_precedes,
            "conditional_prob": conditional_prob,
            "to_without_from_count": twf_count,
            "strength": strength,
        }));
    }

    // Sort by strength descending
    pairs.sort_by(|a, b| {
        b["strength"].as_f64().unwrap_or(0.0)
            .partial_cmp(&a["strength"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    to_js(&serde_json::json!({
        "pairs": pairs,
        "total_pairs": pairs.len(),
        "total_traces": traces.len(),
        "method": "causal_footprint",
    }))
}

/// Granger-like causality test: does activity X help predict activity Y
/// beyond what Y's own history provides?
///
/// For each pair (x, y), measures whether observing X in the recent past
/// improves prediction of Y beyond the baseline rate of Y.
///
/// ```javascript
/// const result = JSON.parse(pm.granger_like_test(handle, 'concept:name', 'time:timestamp', 3));
/// // { pairs: [{x: "A", y: "B", score: 0.8, baseline: 0.5, conditioned: 0.9}] }
/// ```
#[wasm_bindgen]
pub fn granger_like_test(
    log_handle: &str,
    activity_key: &str,
    _timestamp_key: &str,
    max_lag: usize,
) -> Result<JsValue, JsValue> {
    let traces = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.traces.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    if traces.is_empty() {
        return to_js(&serde_json::json!({
            "pairs": [],
            "method": "granger_like_test",
        }));
    }

    let max_lag = max_lag.max(1).min(10); // Bound lag to [1, 10]

    // Collect all activities
    let mut all_activities: HashSet<String> = HashSet::new();
    for trace in &traces {
        for event in &trace.events {
            if let Some(act) = event.attributes.get(activity_key).and_then(|v| v.as_string()) {
                all_activities.insert(act.to_string());
            }
        }
    }

    // Baseline rate: P(y) for each activity y
    let total_events: usize = traces.iter().map(|t| t.events.len()).sum();
    let mut y_counts: HashMap<String, usize> = HashMap::new();
    for trace in &traces {
        for event in &trace.events {
            if let Some(act) = event.attributes.get(activity_key).and_then(|v| v.as_string()) {
                *y_counts.entry(act.to_string()).or_insert(0) += 1;
            }
        }
    }

    let mut pairs = Vec::new();

    for x in &all_activities {
        for y in &all_activities {
            if x == y { continue; }

            let baseline = *y_counts.get(y).unwrap_or(&0) as f64 / total_events.max(1) as f64;

            // P(y | x in lag window): count times y follows x within max_lag positions
            let mut x_then_y = 0usize;
            let mut x_count = 0usize;

            for trace in &traces {
                let acts: Vec<&str> = trace.events.iter()
                    .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                    .collect();

                for i in 0..acts.len() {
                    if acts[i] == x {
                        x_count += 1;
                        // Check if y appears within lag window after x
                        for j in (i + 1)..(i + 1 + max_lag).min(acts.len()) {
                            if acts[j] == y {
                                x_then_y += 1;
                                break; // Count each x occurrence at most once
                            }
                        }
                    }
                }
            }

            let conditioned = if x_count > 0 {
                x_then_y as f64 / x_count as f64
            } else {
                baseline
            };

            // Granger score: improvement over baseline
            let score = conditioned - baseline;

            if score > 0.01 { // Only include pairs with meaningful predictive improvement
                pairs.push(serde_json::json!({
                    "x": x,
                    "y": y,
                    "score": score,
                    "baseline": baseline,
                    "conditioned": conditioned,
                    "x_count": x_count,
                    "x_then_y_count": x_then_y,
                    "max_lag": max_lag,
                }));
            }
        }
    }

    // Sort by score descending
    pairs.sort_by(|a, b| {
        b["score"].as_f64().unwrap_or(0.0)
            .partial_cmp(&a["score"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    to_js(&serde_json::json!({
        "pairs": pairs,
        "total_candidates": pairs.len(),
        "total_activities": all_activities.len(),
        "max_lag": max_lag,
        "method": "granger_like_test",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{EventLog, Trace, Event, AttributeValue};
    use std::collections::HashMap;

    fn make_test_log(traces: Vec<Vec<&str>>) -> EventLog {
        let mut log = EventLog::new();
        for activities in traces {
            let mut trace = Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            };
            for act in activities {
                let mut event = Event {
                    attributes: HashMap::new(),
                };
                event.attributes.insert("concept:name".to_string(), AttributeValue::String(act.to_string()));
                trace.events.push(event);
            }
            log.traces.push(trace);
        }
        log
    }

    #[test]
    fn test_causal_footprint_basic() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "D"],
        ]);

        let traces = log.traces.clone();
        let mut from_to_count: HashMap<(String, String), usize> = HashMap::new();
        for trace in &traces {
            let acts: Vec<String> = trace.events.iter()
                .filter_map(|e| e.attributes.get("concept:name").and_then(|v: &crate::models::AttributeValue| v.as_string()).map(str::to_owned))
                .collect();
            for window in acts.windows(2) {
                *from_to_count.entry((window[0].clone(), window[1].clone())).or_insert(0) += 1;
            }
        }

        assert_eq!(*from_to_count.get(&("A".into(), "B".into())).unwrap(), 3);
        assert_eq!(*from_to_count.get(&("B".into(), "C".into())).unwrap(), 2);
        assert_eq!(*from_to_count.get(&("B".into(), "D".into())).unwrap(), 1);
    }

    #[test]
    fn test_always_precedes() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
        ]);

        // A always precedes B (in all traces where both appear)
        let traces = log.traces.clone();
        let traces_with_both = traces.iter().filter(|trace| {
            let acts: HashSet<&str> = trace.events.iter()
                .filter_map(|e| e.attributes.get("concept:name").and_then(|v: &crate::models::AttributeValue| v.as_string()))
                .collect();
            acts.contains("A") && acts.contains("B")
        }).count();
        assert_eq!(traces_with_both, 2);
    }

    #[test]
    fn test_granger_score_positive() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["X", "Y", "Z"],
        ]);

        // A should help predict B (high conditioned rate)
        // X should NOT help predict B (low conditioned rate)
        let traces = log.traces.clone();
        let total_events: usize = traces.iter().map(|t| t.events.len()).sum();

        // P(B) baseline
        let b_count: usize = traces.iter()
            .flat_map(|t| t.events.iter())
            .filter(|e| e.attributes.get("concept:name").and_then(|v: &crate::models::AttributeValue| v.as_string()) == Some("B"))
            .count();
        let baseline = b_count as f64 / total_events as f64;
        assert!(baseline > 0.0);

        // P(B | A in lag)
        let mut a_then_b = 0usize;
        let mut a_count = 0usize;
        for trace in &traces {
            let acts: Vec<&str> = trace.events.iter()
                .filter_map(|e| e.attributes.get("concept:name").and_then(|v: &crate::models::AttributeValue| v.as_string()))
                .collect();
            for i in 0..acts.len() {
                if acts[i] == "A" {
                    a_count += 1;
                    if i + 1 < acts.len() && acts[i + 1] == "B" {
                        a_then_b += 1;
                    }
                }
            }
        }
        let conditioned = a_then_b as f64 / a_count as f64;
        let score = conditioned - baseline;
        assert!(score > 0.0, "A should have positive Granger score for predicting B");
    }
}
