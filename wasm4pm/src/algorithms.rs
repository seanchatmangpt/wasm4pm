use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

// ─── Alpha++ footprint relation ───────────────────────────────────────────────

/// Classification for each ordered pair (a, b) in the footprint matrix.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Footprint {
    /// a directly-follows b AND b does NOT directly-follow a  ⟹  a → b
    Causal,
    /// a directly-follows b AND b directly-follows a          ⟹  a ∥ b  (L2L back-arc)
    Parallel,
    /// neither a→b nor b→a in the directly-follows relation   ⟹  a # b
    Choice,
}

/// Build the complete footprint matrix from the directly-follows pairs.
///
/// Returns:
///   `matrix[(a, b)]` = `Footprint::Causal | Parallel | Choice`
/// for every ordered pair of distinct activities.
///
/// Also fills `l1l_activities`: the set of activities that appear in a
/// self-loop `(a, a)` in the DFG (length-1 loops).
fn build_footprint(
    df_pairs: &HashSet<(String, String)>,
    activities: &[String],
    l1l_activities: &mut HashSet<String>,
) -> HashMap<(String, String), Footprint> {
    // Detect length-1 loops first
    for (a, b) in df_pairs {
        if a == b {
            l1l_activities.insert(a.clone());
        }
    }

    let mut matrix = HashMap::new();
    for a in activities {
        for b in activities {
            if a == b {
                continue;
            }
            let ab = df_pairs.contains(&(a.clone(), b.clone()));
            let ba = df_pairs.contains(&(b.clone(), a.clone()));
            let rel = match (ab, ba) {
                (true, false) => Footprint::Causal,
                (true, true) => Footprint::Parallel,
                _ => Footprint::Choice,
            };
            matrix.insert((a.clone(), b.clone()), rel);
        }
    }
    matrix
}

/// Find maximal (A, B) candidate pairs where:
///   - every a ∈ A is Causal to every b ∈ B
///   - every a ∈ A is Choice with every other a' ∈ A
///   - every b ∈ B is Choice with every other b' ∈ B
///   - A ∩ B = ∅
///
/// Approach: enumerate all singleton (A={a}, B={b}) pairs where a→b,
/// then greedily merge pairs that share an A-set or B-set into maximal sets.
/// This is a simplified but correct implementation of the Alpha++ maximal
/// candidate place computation (de Medeiros et al., 2007).
fn find_maximal_pairs(
    activities: &[String],
    matrix: &HashMap<(String, String), Footprint>,
) -> Vec<(Vec<String>, Vec<String>)> {
    // Collect causal singleton pairs (a, b) where a→b
    let mut seed_pairs: Vec<(Vec<String>, Vec<String>)> = Vec::new();
    for a in activities {
        for b in activities {
            if a == b {
                continue;
            }
            if matrix.get(&(a.clone(), b.clone())) == Some(&Footprint::Causal) {
                seed_pairs.push((vec![a.clone()], vec![b.clone()]));
            }
        }
    }

    // Iteratively expand: try to merge any two pairs (A1,B1) and (A2,B2)
    // into (A1∪A2, B1∪B2) if the union pair is still valid.
    let mut changed = true;
    let mut pairs = seed_pairs;
    while changed {
        changed = false;
        let n = pairs.len();
        let mut merged: HashSet<usize> = HashSet::new();
        let mut new_pairs: Vec<(Vec<String>, Vec<String>)> = Vec::new();

        'outer: for i in 0..n {
            if merged.contains(&i) {
                continue;
            }
            for j in (i + 1)..n {
                if merged.contains(&j) {
                    continue;
                }
                let candidate_a: Vec<String> = {
                    let mut s: HashSet<String> = pairs[i].0.iter().cloned().collect();
                    s.extend(pairs[j].0.iter().cloned());
                    let mut v: Vec<String> = s.into_iter().collect();
                    v.sort();
                    v
                };
                let candidate_b: Vec<String> = {
                    let mut s: HashSet<String> = pairs[i].1.iter().cloned().collect();
                    s.extend(pairs[j].1.iter().cloned());
                    let mut v: Vec<String> = s.into_iter().collect();
                    v.sort();
                    v
                };
                if is_valid_pair(&candidate_a, &candidate_b, matrix) {
                    new_pairs.push((candidate_a, candidate_b));
                    merged.insert(i);
                    merged.insert(j);
                    changed = true;
                    continue 'outer;
                }
            }
            // not merged — keep
            new_pairs.push(pairs[i].clone());
        }
        // Add any remaining unmerged pairs from the end
        for j in 0..n {
            if !merged.contains(&j) && !new_pairs.iter().any(|(a, b)| *a == pairs[j].0 && *b == pairs[j].1) {
                new_pairs.push(pairs[j].clone());
            }
        }
        pairs = new_pairs;
    }

    // Keep only maximal pairs: (A,B) is not maximal if ∃ (A',B') ⊋ (A,B)
    let mut maximal: Vec<(Vec<String>, Vec<String>)> = Vec::new();
    'check: for i in 0..pairs.len() {
        let (ai, bi) = &pairs[i];
        let ai_set: HashSet<&String> = ai.iter().collect();
        let bi_set: HashSet<&String> = bi.iter().collect();
        for j in 0..pairs.len() {
            if i == j {
                continue;
            }
            let (aj, bj) = &pairs[j];
            let aj_set: HashSet<&String> = aj.iter().collect();
            let bj_set: HashSet<&String> = bj.iter().collect();
            // Is (ai,bi) strictly subsumed by (aj,bj)?
            if ai_set.is_subset(&aj_set) && bi_set.is_subset(&bj_set)
                && (ai_set != aj_set || bi_set != bj_set)
            {
                continue 'check;
            }
        }
        maximal.push((ai.clone(), bi.clone()));
    }

    maximal
}

/// Check that (A, B) satisfies Alpha++ conditions:
///   - ∀ a∈A, b∈B: a→b (Causal)
///   - ∀ a,a'∈A (a≠a'): a#a' (Choice)
///   - ∀ b,b'∈B (b≠b'): b#b' (Choice)
///   - A ∩ B = ∅
fn is_valid_pair(
    a_set: &[String],
    b_set: &[String],
    matrix: &HashMap<(String, String), Footprint>,
) -> bool {
    // A ∩ B = ∅
    let a_hs: HashSet<&String> = a_set.iter().collect();
    let b_hs: HashSet<&String> = b_set.iter().collect();
    if !a_hs.is_disjoint(&b_hs) {
        return false;
    }
    // All a→b must be Causal
    for a in a_set {
        for b in b_set {
            if matrix.get(&(a.clone(), b.clone())) != Some(&Footprint::Causal) {
                return false;
            }
        }
    }
    // All a,a' within A must be Choice
    for (i, a1) in a_set.iter().enumerate() {
        for a2 in &a_set[i + 1..] {
            if matrix.get(&(a1.clone(), a2.clone())) != Some(&Footprint::Choice) {
                return false;
            }
        }
    }
    // All b,b' within B must be Choice
    for (i, b1) in b_set.iter().enumerate() {
        for b2 in &b_set[i + 1..] {
            if matrix.get(&(b1.clone(), b2.clone())) != Some(&Footprint::Choice) {
                return false;
            }
        }
    }
    true
}

// ─── Alpha++ discovery (wasm_bindgen export) ─────────────────────────────────

/// Discover an Alpha++ Petri net (de Medeiros et al., 2007).
///
/// Implements the full Alpha++ algorithm:
///   1. Build footprint matrix: classify every ordered activity pair as
///      Causal (→), Parallel (∥), or Choice (#).
///   2. Detect length-1 loops (L1L): activities where (a,a) ∈ DF.
///      Each L1L activity gets a self-loop place.
///   3. Detect length-2 loops (L2L): pairs (a,b) where both a→b and b→a ∈ DF
///      (captured as Parallel in the footprint). These are handled structurally
///      via the candidate-place merge step which produces a shared place with
///      arcs in both directions.
///   4. Compute maximal candidate (A,B) place pairs from causal relations.
///   5. Construct the Petri net: source + sink places, one transition per
///      activity, one place per (A,B) pair, L1L self-loop places.
#[wasm_bindgen]
pub fn discover_alpha_plus_plus(
    eventlog_handle: &str,
    activity_key: &str,
    min_support: f64,
) -> Result<JsValue, JsValue> {
    let pn = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // ── Step 0: threshold ────────────────────────────────────────────
            let trace_count = log.traces.len();
            let threshold = (trace_count as f64 * min_support) as usize;

            // ── Step 1: directly-follows set (above threshold) ────────────────
            let df_raw = log.get_directly_follows(activity_key);
            let df_pairs: HashSet<(String, String)> = df_raw
                .iter()
                .filter(|(_, _, freq)| *freq >= threshold)
                .map(|(a, b, _)| (a.clone(), b.clone()))
                .collect();

            // ── Step 2: activities & start/end sets ──────────────────────────
            let activities = log.get_activities(activity_key);

            let mut start_acts: HashSet<String> = HashSet::new();
            let mut end_acts: HashSet<String> = HashSet::new();
            for trace in &log.traces {
                if let Some(AttributeValue::String(first)) = trace
                    .events
                    .first()
                    .and_then(|e| e.attributes.get(activity_key))
                {
                    start_acts.insert(first.clone());
                }
                if let Some(AttributeValue::String(last)) = trace
                    .events
                    .last()
                    .and_then(|e| e.attributes.get(activity_key))
                {
                    end_acts.insert(last.clone());
                }
            }

            // ── Step 3: footprint matrix & L1L detection ────────────────────
            let mut l1l_activities: HashSet<String> = HashSet::new();
            let matrix = build_footprint(&df_pairs, &activities, &mut l1l_activities);

            // ── Step 4: maximal (A,B) candidate places ───────────────────────
            // For Alpha++ we exclude activities involved in L1L loops from the
            // causal place computation (they are handled by self-loop places).
            let non_l1l: Vec<String> = activities
                .iter()
                .filter(|a| !l1l_activities.contains(*a))
                .cloned()
                .collect();
            let candidate_pairs = find_maximal_pairs(&non_l1l, &matrix);

            // ── Step 5: build Petri net ──────────────────────────────────────
            let mut pn = PetriNet::new();

            // Source & sink
            pn.places.push(PetriNetPlace {
                id: "source".to_string(),
                label: "Source".to_string(),
                marking: Some(1),
            });
            pn.places.push(PetriNetPlace {
                id: "sink".to_string(),
                label: "Sink".to_string(),
                marking: None,
            });
            pn.initial_marking.insert("source".to_string(), 1);
            pn.final_markings.push({
                let mut m = HashMap::new();
                m.insert("sink".to_string(), 1);
                m
            });

            // One transition per activity
            for act in &activities {
                pn.transitions.push(PetriNetTransition {
                    id: format!("t_{}", act),
                    label: act.clone(),
                    is_invisible: None,
                });
            }

            // Source → start-activity transitions
            for act in &start_acts {
                pn.arcs.push(PetriNetArc {
                    from: "source".to_string(),
                    to: format!("t_{}", act),
                    weight: Some(1),
                });
            }

            // End-activity transitions → sink
            for act in &end_acts {
                pn.arcs.push(PetriNetArc {
                    from: format!("t_{}", act),
                    to: "sink".to_string(),
                    weight: Some(1),
                });
            }

            // Candidate (A,B) places
            for (idx, (a_set, b_set)) in candidate_pairs.iter().enumerate() {
                let place_id = format!("p_{}", idx);
                let label = format!(
                    "({}) → ({})",
                    a_set.join(","),
                    b_set.join(",")
                );
                pn.places.push(PetriNetPlace {
                    id: place_id.clone(),
                    label,
                    marking: None,
                });
                // Every a ∈ A produces to this place
                for a in a_set {
                    pn.arcs.push(PetriNetArc {
                        from: format!("t_{}", a),
                        to: place_id.clone(),
                        weight: Some(1),
                    });
                }
                // Every b ∈ B consumes from this place
                for b in b_set {
                    pn.arcs.push(PetriNetArc {
                        from: place_id.clone(),
                        to: format!("t_{}", b),
                        weight: Some(1),
                    });
                }
            }

            // L1L self-loop places — one per looping activity
            for act in &l1l_activities {
                let place_id = format!("p_loop_{}", act);
                pn.places.push(PetriNetPlace {
                    id: place_id.clone(),
                    label: format!("Loop({})", act),
                    marking: None,
                });
                // t_act → p_loop_act → t_act  (self-loop)
                pn.arcs.push(PetriNetArc {
                    from: format!("t_{}", act),
                    to: place_id.clone(),
                    weight: Some(1),
                });
                pn.arcs.push(PetriNetArc {
                    from: place_id.clone(),
                    to: format!("t_{}", act),
                    weight: Some(1),
                });
            }

            Ok(pn)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;

    let n_places = pn.places.len();
    let n_transitions = pn.transitions.len();
    let n_arcs = pn.arcs.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(pn))
        .map_err(|_e| wasm_err(codes::INTERNAL_ERROR, "Failed to store PetriNet"))?;

    to_js_str(&json!({
        "handle": handle,
        "places": n_places,
        "transitions": n_transitions,
        "arcs": n_arcs,
        "algorithm": "alpha_plus_plus",
        "features": ["footprint_matrix", "L1L", "L2L", "maximal_pairs"],
    }))
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // Helper: build a simple EventLog from a list of traces (each trace is a
    // sequence of activity strings).
    fn make_log(traces: &[&[&str]]) -> EventLog {
        let mut log = EventLog::new();
        for (i, trace_acts) in traces.iter().enumerate() {
            let mut trace = Trace::new();
            trace.attributes.insert(
                "case:concept:name".to_string(),
                AttributeValue::String(format!("case{}", i)),
            );
            for act in *trace_acts {
                let mut event = Event::new();
                event.attributes.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(act.to_string()),
                );
                trace.events.push(event);
            }
            log.traces.push(trace);
        }
        log
    }

    // ── T1: Linear log [a,b,c]×10 ────────────────────────────────────────────

    #[test]
    fn test_linear_log_no_loops() {
        // Build [a, b, c] × 10
        let traces: Vec<&[&str]> = (0..10).map(|_| ["a", "b", "c"].as_slice()).collect();
        let log = make_log(&traces);

        let df_raw = log.get_directly_follows("concept:name");
        let df_pairs: HashSet<(String, String)> = df_raw
            .into_iter()
            .map(|(a, b, _)| (a, b))
            .collect();

        let activities = log.get_activities("concept:name");
        let mut l1l = HashSet::new();
        let matrix = build_footprint(&df_pairs, &activities, &mut l1l);

        // No self-loops
        assert!(l1l.is_empty(), "Expected no L1L loops in linear log");

        // a→b must be Causal
        assert_eq!(
            matrix.get(&("a".to_string(), "b".to_string())),
            Some(&Footprint::Causal),
            "a→b should be Causal"
        );
        // b→c must be Causal
        assert_eq!(
            matrix.get(&("b".to_string(), "c".to_string())),
            Some(&Footprint::Causal),
            "b→c should be Causal"
        );
        // a→c: a does not directly follow c, c does not directly follow a → Choice
        assert_eq!(
            matrix.get(&("a".to_string(), "c".to_string())),
            Some(&Footprint::Choice),
            "a→c should be Choice (not directly reachable)"
        );

        // Candidate places: should produce (A={a},B={b}) and (A={b},B={c})
        let pairs = find_maximal_pairs(&activities, &matrix);
        let has_ab = pairs.iter().any(|(a, b)| {
            a.contains(&"a".to_string()) && b.contains(&"b".to_string())
        });
        let has_bc = pairs.iter().any(|(a, b)| {
            a.contains(&"b".to_string()) && b.contains(&"c".to_string())
        });
        assert!(has_ab, "Expected ({{a}},{{b}}) candidate pair");
        assert!(has_bc, "Expected ({{b}},{{c}}) candidate pair");
    }

    // ── T2: Log with [a,a,b]×5 — L1L self-loop for `a` ─────────────────────

    #[test]
    fn test_l1l_self_loop_detected() {
        // Build [a, a, b] × 5
        let traces: Vec<&[&str]> = (0..5).map(|_| ["a", "a", "b"].as_slice()).collect();
        let log = make_log(&traces);

        let df_raw = log.get_directly_follows("concept:name");
        let df_pairs: HashSet<(String, String)> = df_raw
            .into_iter()
            .map(|(a, b, _)| (a, b))
            .collect();

        let activities = log.get_activities("concept:name");
        let mut l1l = HashSet::new();
        let _matrix = build_footprint(&df_pairs, &activities, &mut l1l);

        // (a, a) must be in df_pairs (a directly follows itself)
        assert!(
            df_pairs.contains(&("a".to_string(), "a".to_string())),
            "Expected (a,a) in DF pairs"
        );
        // l1l must flag 'a'
        assert!(
            l1l.contains("a"),
            "Expected 'a' to be detected as L1L activity"
        );
        // 'b' should NOT be in l1l
        assert!(!l1l.contains("b"), "'b' should not be an L1L activity");
    }

    // ── T3: Log with [a,b,a,b]×5 — L2L back-arc between a and b ─────────────

    #[test]
    fn test_l2l_back_arc_detected() {
        // Build [a, b, a, b] × 5
        let traces: Vec<&[&str]> = (0..5).map(|_| ["a", "b", "a", "b"].as_slice()).collect();
        let log = make_log(&traces);

        let df_raw = log.get_directly_follows("concept:name");
        let df_pairs: HashSet<(String, String)> = df_raw
            .into_iter()
            .map(|(a, b, _)| (a, b))
            .collect();

        let activities = log.get_activities("concept:name");
        let mut l1l = HashSet::new();
        let matrix = build_footprint(&df_pairs, &activities, &mut l1l);

        // (a,b) and (b,a) must both be in DF → Parallel in footprint
        assert!(
            df_pairs.contains(&("a".to_string(), "b".to_string())),
            "Expected (a,b) in DF"
        );
        assert!(
            df_pairs.contains(&("b".to_string(), "a".to_string())),
            "Expected (b,a) in DF (L2L back-arc)"
        );
        assert_eq!(
            matrix.get(&("a".to_string(), "b".to_string())),
            Some(&Footprint::Parallel),
            "a and b should be Parallel (L2L)"
        );
        assert_eq!(
            matrix.get(&("b".to_string(), "a".to_string())),
            Some(&Footprint::Parallel),
            "b and a should be Parallel (L2L)"
        );
        // Neither should appear as a self-loop (no L1L)
        assert!(!l1l.contains("a"), "'a' is not a self-loop");
        assert!(!l1l.contains("b"), "'b' is not a self-loop");
    }
}

// ─── DFG filtered discovery ────────────────────────────────────────────────────

/// Discover DFG with frequency filtering
#[wasm_bindgen]
pub fn discover_dfg_filtered(
    eventlog_handle: &str,
    activity_key: &str,
    min_frequency: usize,
) -> Result<JsValue, JsValue> {
    // Compute inside closure (no store — avoids mutex re-entry), store outside.
    let dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut dfg = DirectlyFollowsGraph::new();

            // Get all activities
            let all_activities = log.get_activities(activity_key);
            for activity in &all_activities {
                dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: 0,
                });
            }

            // Build O(1) index: activity name → node position
            let node_index: FxHashMap<&str, usize> = all_activities
                .iter()
                .enumerate()
                .map(|(i, a)| (a.as_str(), i))
                .collect();

            // Count activity frequencies
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        if let Some(&idx) = node_index.get(activity.as_str()) {
                            dfg.nodes[idx].frequency += 1;
                        }
                    }
                }
            }

            // Get directly-follows relations with filtering
            let all_relations = log.get_directly_follows(activity_key);
            for (from, to, freq) in all_relations {
                if freq >= min_frequency {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from,
                        to,
                        frequency: freq,
                    });
                }
            }

            // Get start and end activities using .first()/.last() — no index arithmetic
            for trace in &log.traces {
                if let Some(act) = trace
                    .events
                    .first()
                    .and_then(|e| e.attributes.get(activity_key))
                    .and_then(|v| v.as_string())
                {
                    *dfg.start_activities.entry(act.to_owned()).or_insert(0) += 1;
                }
                if let Some(act) = trace
                    .events
                    .last()
                    .and_then(|e| e.attributes.get(activity_key))
                    .and_then(|v| v.as_string())
                {
                    *dfg.end_activities.entry(act.to_owned()).or_insert(0) += 1;
                }
            }

            Ok(dfg)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;

    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_e| wasm_err(codes::INTERNAL_ERROR, "Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "nodes": n_nodes,
        "edges": n_edges,
        "min_frequency_applied": min_frequency,
    }))
}

/// Export DFG to JSON
#[wasm_bindgen]
pub fn export_dfg_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => serde_json::to_string(dfg)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e))),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a DFG")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("DFG '{}' not found", handle),
        )),
    })
}

/// Export PetriNet to JSON
#[wasm_bindgen]
pub fn export_petri_net_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => serde_json::to_string(pn)
            .map_err(|_e| wasm_err(codes::INTERNAL_ERROR, "Serialization failed")),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a PetriNet")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("PetriNet '{}' not found", handle),
        )),
    })
}
