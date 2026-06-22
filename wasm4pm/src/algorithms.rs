use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeSet, HashMap, HashSet};
use wasm_bindgen::prelude::*;

/// Footprint relation between two activities
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum FootprintRelation {
    DirectlyFollows, // >
    Causal,          // ->
    CausalInv,       // <-
    Parallel,        // ||
    NeverFollows,    // #
}

/// A complete footprint matrix for an event log
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FootprintMatrix {
    pub activities: Vec<String>,
    pub matrix: Vec<Vec<FootprintRelation>>,
}

/// Pure-Rust footprint discovery without wasm-bindgen. Used by integration tests.
pub fn discover_footprints_from_log<W>(
    log: &AdmittedEventLog<W>,
    activity_key: &str,
) -> FootprintMatrix {
    let col = log.value.to_columnar(activity_key);
    let n = col.vocab.len();
    let mut df = vec![vec![false; n]; n];

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end.saturating_sub(1) {
            let from = col.events[i] as usize;
            let to = col.events[i + 1] as usize;
            df[from][to] = true;
        }
    }

    let mut matrix = vec![vec![FootprintRelation::NeverFollows; n]; n];
    for i in 0..n {
        for j in 0..n {
            let i_j = df[i][j];
            let j_i = df[j][i];
            matrix[i][j] = if i_j && !j_i {
                FootprintRelation::Causal
            } else if !i_j && j_i {
                FootprintRelation::CausalInv
            } else if i_j && j_i {
                FootprintRelation::Parallel
            } else {
                FootprintRelation::NeverFollows
            };
        }
    }

    FootprintMatrix {
        activities: col.vocab.iter().map(|s| s.to_string()).collect(),
        matrix,
    }
}

/// Discover the Alpha-style footprint matrix from an event log.
///
/// Returns `{activities: string[], matrix: FootprintRelation[][]}`.
/// **`matrix[i][j]` is indexed by position**, not by activity name.
/// Use `activities.indexOf(name)` to map activity names to matrix indices.
///
/// `FootprintRelation` values: `"Causal"` (i→j), `"CausalInv"` (j→i),
/// `"Parallel"` (both directions), `"NeverFollows"` (no succession).
#[wasm_bindgen]
pub fn discover_footprints(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    to_js_str(&discover_footprints_from_log(&admitted, activity_key))
}

/// Internal Alpha++ implementation operating on a plain `EventLog`.
///
/// Steps:
/// 1. Compute directly-follows (DF) set and frequency counts from the log.
/// 2. Build L1L = { a | (a,a) ∈ DF } (length-1 loop activities).
/// 3. Build L2L = { (a,b) | (a,b) ∈ DF ∧ (b,a) ∈ DF } (length-2 loop pairs).
/// 4. Build Alpha++-aware footprint: for pairs (a,b) ∉ L2L, the standard Alpha rules apply.
///    For L2L pairs the relation is reclassified as Causal rather than Parallel.
/// 5. Collect place candidates (A,B) where all a∈A causally precede all b∈B and
///    activities within A (and within B) are in # (never-follow) relation.
/// 6. Retain only maximal (A,B) pairs.
/// 7. Construct Petri net: source → start-transitions → places → end-transitions → sink.
///    L1L activities get a self-loop place.
pub(crate) fn alpha_plus_plus_inner<W>(
    log: &AdmittedEventLog<W>,
    activity_key: &str,
    min_support: f64,
) -> Result<PetriNet, JsValue> {
    // ── Step 1: DF relations ──────────────────────────────────────────────────
    let all_relations = log.value.get_directly_follows(activity_key);
    let threshold = (log.value.traces.len() as f64 * min_support).max(1.0) as usize;

    // DF set filtered by support threshold
    let df_set: HashSet<(String, String)> = all_relations
        .iter()
        .filter(|(_, _, freq)| *freq >= threshold)
        .map(|(f, t, _)| (f.clone(), t.clone()))
        .collect();

    // ── Step 2: L1L — length-1 loop activities ────────────────────────────────
    let l1l: BTreeSet<String> = df_set
        .iter()
        .filter(|(a, b)| a == b)
        .map(|(a, _)| a.clone())
        .collect();

    // ── Step 3: L2L — length-2 loop pairs ────────────────────────────────────
    // (a,b) ∈ L2L iff (a,b) ∈ DF ∧ (b,a) ∈ DF ∧ a ≠ b
    let l2l: BTreeSet<(String, String)> = df_set
        .iter()
        .filter(|(a, b)| a != b && df_set.contains(&(b.clone(), a.clone())))
        .map(|(a, b)| (a.clone(), b.clone()))
        .collect();

    // ── Step 4: Alpha++-aware causal relation ─────────────────────────────────
    // a →++ b  iff  (a,b) ∈ DF  ∧  (b,a) ∉ DF  (same as Alpha causal)
    //           OR  (a,b) ∈ L2L  (reclassify parallel as causal for short loops)
    let activities = log.value.get_activities(activity_key);

    // Build DF without self-loops for footprint construction
    let df_no_self: HashSet<(&str, &str)> = df_set
        .iter()
        .filter(|(a, b)| a != b)
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();

    // causal(a,b): a causally precedes b (Alpha++ definition)
    let causal = |a: &str, b: &str| -> bool {
        let ab = df_no_self.contains(&(a, b));
        let ba = df_no_self.contains(&(b, a));
        // Standard causal: ab and not ba
        // OR it is an L2L pair (both exist but we treat it as causal)
        (ab && !ba) || l2l.contains(&(a.to_string(), b.to_string()))
    };

    // never_follow(a,b): neither (a,b) nor (b,a) in DF (excluding self and L2L)
    let never_follow = |a: &str, b: &str| -> bool {
        if a == b {
            return false;
        }
        !df_no_self.contains(&(a, b)) && !df_no_self.contains(&(b, a))
    };

    // ── Step 5: Collect place candidates (A,B) ───────────────────────────────
    // Activities eligible for place candidates exclude L1L members (they get self-loops).
    // For simplicity we use singleton A and B sets and then merge.
    // For full generality we use the Alpha relation: find all (A,B) such that
    //   ∀ a∈A, b∈B: causal(a,b)
    //   ∀ a1,a2 ∈ A: never_follow(a1,a2)
    //   ∀ b1,b2 ∈ B: never_follow(b1,b2)
    //
    // We start from singleton pairs and expand greedily (standard Alpha approach).

    // Non-loop activities only for place candidates
    let non_loop_acts: Vec<&str> = activities
        .iter()
        .filter(|a| !l1l.contains(*a))
        .map(|a| a.as_str())
        .collect();

    // Candidate pairs: start from all (a,b) where causal(a,b) holds
    let mut candidates: Vec<(Vec<String>, Vec<String>)> = Vec::new();

    for &a in &non_loop_acts {
        for &b in &non_loop_acts {
            if causal(a, b) {
                candidates.push((vec![a.to_string()], vec![b.to_string()]));
            }
        }
    }

    // Expand candidates by merging compatible pairs
    // A pair (A1,B1) and (A2,B2) can merge into (A1∪A2, B1) if B1==B2 and
    // all a∈A1∪A2 are in # relation with each other.
    let mut merged = true;
    while merged {
        merged = false;
        let len = candidates.len();
        let mut to_add: Vec<(Vec<String>, Vec<String>)> = Vec::new();
        for i in 0..len {
            for j in (i + 1)..len {
                let (a1, b1) = &candidates[i];
                let (a2, b2) = &candidates[j];

                // Try to merge on the A side (same B)
                if b1 == b2 {
                    let mut new_a: Vec<String> = a1.clone();
                    for x in a2 {
                        if !new_a.contains(x) {
                            new_a.push(x.clone());
                        }
                    }
                    new_a.sort_unstable();
                    // Check: all pairs in new_a are in # relation
                    let a_ok = (0..new_a.len()).all(|p| {
                        (p + 1..new_a.len())
                            .all(|q| never_follow(new_a[p].as_str(), new_a[q].as_str()))
                    });
                    // Check: all a ∈ new_a causally precede all b ∈ b1
                    let ab_ok = new_a
                        .iter()
                        .all(|a| b1.iter().all(|b| causal(a.as_str(), b.as_str())));
                    if a_ok && ab_ok {
                        let candidate = (new_a, b1.clone());
                        if !candidates.contains(&candidate) && !to_add.contains(&candidate) {
                            to_add.push(candidate);
                            merged = true;
                        }
                    }
                }

                // Try to merge on the B side (same A)
                if a1 == a2 {
                    let mut new_b: Vec<String> = b1.clone();
                    for x in b2 {
                        if !new_b.contains(x) {
                            new_b.push(x.clone());
                        }
                    }
                    new_b.sort_unstable();
                    // Check: all pairs in new_b are in # relation
                    let b_ok = (0..new_b.len()).all(|p| {
                        (p + 1..new_b.len())
                            .all(|q| never_follow(new_b[p].as_str(), new_b[q].as_str()))
                    });
                    // Check: all a ∈ a1 causally precede all b ∈ new_b
                    let ab_ok = a1
                        .iter()
                        .all(|a| new_b.iter().all(|b| causal(a.as_str(), b.as_str())));
                    if b_ok && ab_ok {
                        let candidate = (a1.clone(), new_b);
                        if !candidates.contains(&candidate) && !to_add.contains(&candidate) {
                            to_add.push(candidate);
                            merged = true;
                        }
                    }
                }
            }
        }
        candidates.extend(to_add);
    }

    // ── Step 6: Retain maximal pairs ─────────────────────────────────────────
    let n = candidates.len();
    let mut is_maximal = vec![true; n];
    for i in 0..n {
        for j in 0..n {
            if i == j || !is_maximal[i] {
                continue;
            }
            let (ai, bi) = &candidates[i];
            let (aj, bj) = &candidates[j];
            // i is subsumed by j if aj ⊇ ai and bj ⊇ bi (and j ≠ i strictly larger)
            let a_sub = ai.iter().all(|x| aj.contains(x));
            let b_sub = bi.iter().all(|x| bj.contains(x));
            let strictly_larger = aj.len() > ai.len() || bj.len() > bi.len();
            if a_sub && b_sub && strictly_larger {
                is_maximal[i] = false;
            }
        }
    }
    let maximal: Vec<&(Vec<String>, Vec<String>)> = candidates
        .iter()
        .enumerate()
        .filter(|(i, _)| is_maximal[*i])
        .map(|(_, c)| c)
        .collect();

    // ── Step 7: Collect start and end activities ──────────────────────────────
    let mut start_acts: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    let mut end_acts: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for trace in &log.value.traces {
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

    // ── Step 8: Build Petri net ───────────────────────────────────────────────
    let mut pn = PetriNet::new();

    // Source and sink places
    pn.places.push(PetriNetPlace {
        id: "p_source".to_string(),
        label: "source".to_string(),
        marking: Some(1),
    });
    pn.places.push(PetriNetPlace {
        id: "p_sink".to_string(),
        label: "sink".to_string(),
        marking: None,
    });
    pn.initial_marking.insert("p_source".to_string(), 1);
    pn.final_markings.push({
        let mut m = std::collections::BTreeMap::new();
        m.insert("p_sink".to_string(), 1);
        m
    });

    // Transitions for each activity
    for activity in &activities {
        pn.transitions.push(PetriNetTransition {
            id: format!("t_{}", activity),
            label: activity.clone(),
            is_invisible: None,
        });
    }

    // Source → start-activity transitions
    for act in &start_acts {
        pn.arcs.push(PetriNetArc {
            from: "p_source".to_string(),
            to: format!("t_{}", act),
            weight: Some(1),
        });
    }

    // End-activity transitions → sink
    for act in &end_acts {
        pn.arcs.push(PetriNetArc {
            from: format!("t_{}", act),
            to: "p_sink".to_string(),
            weight: Some(1),
        });
    }

    // Places for each maximal (A,B) candidate
    for (idx, (a_set, b_set)) in maximal.iter().enumerate() {
        let place_id = format!("p_place_{}", idx);
        let label = format!("({} → {})", a_set.join(","), b_set.join(","));
        pn.places.push(PetriNetPlace {
            id: place_id.clone(),
            label,
            marking: None,
        });
        // Arcs: all a ∈ A → place
        for a in a_set.iter() {
            pn.arcs.push(PetriNetArc {
                from: format!("t_{}", a),
                to: place_id.clone(),
                weight: Some(1),
            });
        }
        // Arcs: place → all b ∈ B
        for b in b_set.iter() {
            pn.arcs.push(PetriNetArc {
                from: place_id.clone(),
                to: format!("t_{}", b),
                weight: Some(1),
            });
        }
    }

    // Self-loop places for L1L activities
    for act in &l1l {
        let loop_place_id = format!("p_loop_{}", act);
        pn.places.push(PetriNetPlace {
            id: loop_place_id.clone(),
            label: format!("loop({})", act),
            marking: None,
        });
        // t_act → loop_place → t_act  (self-loop in the net)
        pn.arcs.push(PetriNetArc {
            from: format!("t_{}", act),
            to: loop_place_id.clone(),
            weight: Some(1),
        });
        pn.arcs.push(PetriNetArc {
            from: loop_place_id.clone(),
            to: format!("t_{}", act),
            weight: Some(1),
        });
    }

    // L2L short-loop places: for each (a,b) ∈ L2L, add a place p_l2l_{a}_{b}
    // that handles the back-arc from b to a.
    let mut seen_l2l: HashSet<String> = HashSet::new();
    for (a, b) in &l2l {
        // Avoid duplicating the symmetric pair
        let key = if a < b {
            format!("{}_{}", a, b)
        } else {
            format!("{}_{}", b, a)
        };
        if seen_l2l.insert(key) {
            // Forward arc: t_a → place → t_b is handled by maximal candidate places.
            // Back-arc: t_b → p_back_{a}_{b} → t_a
            let back_id = format!("p_back_{}_{}", a, b);
            pn.places.push(PetriNetPlace {
                id: back_id.clone(),
                label: format!("back({},{})", a, b),
                marking: None,
            });
            pn.arcs.push(PetriNetArc {
                from: format!("t_{}", b),
                to: back_id.clone(),
                weight: Some(1),
            });
            pn.arcs.push(PetriNetArc {
                from: back_id.clone(),
                to: format!("t_{}", a),
                weight: Some(1),
            });
        }
    }

    Ok(pn)
}

/// Discover a Petri net using the Alpha++ algorithm.
///
/// Implements Alpha++ (de Medeiros et al.) extending Alpha Miner with:
///   - L1L set: activities `a` where `(a,a)` is in directly-follows (length-1 loops)
///   - L2L set: activity pairs `(a,b)` where both `(a,b)` and `(b,a)` are in DF (length-2 loops)
///   - Short-loop-aware footprint matrix: reclassifies Parallel relations from length-1/2 loops as Causal
///   - Place candidates `(A,B)` where A×B ⊆ causal relation (maximal pairs only)
///
/// # Parameters
/// * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
/// * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
/// * `min_support` — Minimum frequency threshold `[0.0, 1.0]` for directly-follows edges.
///   `0.0` = no filtering (include all edges). Use `0.0` for small logs to avoid empty models.
///
/// # Returns
/// `Result<JsValue, JsValue>` — On success:
/// ```json
/// { "handle": "...", "places": 5, "transitions": 4, "arcs": 12 }
/// ```
/// Use the returned `handle` with `export_petri_net_to_json` or conformance functions.
///
/// # Note
/// Alpha++ handles length-1 and length-2 loops correctly. For heavily noisy logs,
/// prefer `discover_heuristic_miner` which is more tolerant of noise.
#[wasm_bindgen]
pub fn discover_alpha_plus_plus(
    eventlog_handle: &str,
    activity_key: &str,
    min_support: f64,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.alpha_plus_plus",
        algorithm = "alpha_plus_plus",
        activity_key = activity_key,
        min_support = min_support,
        "Alpha++ discovery started"
    );

    // Compute inside closure (no store — avoids mutex re-entry), store outside.
    let pn = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            tracing::info!(
                target: "wasm4pm.discovery.alpha_plus_plus",
                checkpoint = "feature_extraction",
                log_size = log.traces.len(),
                activity_count = log.get_activities(activity_key).len(),
                "Log loaded and analyzed"
            );
            let admitted =
                wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
            alpha_plus_plus_inner(&admitted, activity_key, min_support)
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

    tracing::info!(
        target: "wasm4pm.discovery.alpha_plus_plus",
        checkpoint = "result_generation",
        place_count = n_places,
        transition_count = n_transitions,
        arc_count = n_arcs,
        "Petri net model constructed"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(pn))
        .map_err(|_e| wasm_err(codes::INTERNAL_ERROR, "Failed to store PetriNet"))?;

    to_js_str(&json!({
        "handle": handle,
        "places": n_places,
        "transitions": n_transitions,
        "arcs": n_arcs,
    }))
}

/// Public thin wrapper around `alpha_plus_plus_inner` for integration tests and
/// external callers that cannot access `pub(crate)` items.
pub fn discover_alpha_plus_plus_from_log<W>(
    log: &AdmittedEventLog<W>,
    activity_key: &str,
    min_support: f64,
) -> Result<PetriNet, String> {
    alpha_plus_plus_inner(log, activity_key, min_support)
        .map_err(|e| e.as_string().unwrap_or_else(|| "alpha++ error".to_string()))
}

/// Pure-Rust DFG filtered discovery without wasm-bindgen. Used by integration tests.
pub fn discover_dfg_filtered_from_log<W>(
    log: &AdmittedEventLog<W>,
    activity_key: &str,
    min_frequency: usize,
) -> DFG {
    let mut dfg = DFG::new();

    let all_activities = log.value.get_activities(activity_key);
    for activity in &all_activities {
        dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: 0,
        });
    }

    let node_index: FxHashMap<&str, usize> = all_activities
        .iter()
        .enumerate()
        .map(|(i, a)| (a.as_str(), i))
        .collect();

    for trace in &log.value.traces {
        for event in &trace.events {
            if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                if let Some(&idx) = node_index.get(activity.as_str()) {
                    dfg.nodes[idx].frequency += 1;
                }
            }
        }
    }

    let all_relations = log.value.get_directly_follows(activity_key);
    for (from, to, freq) in all_relations {
        if freq >= min_frequency {
            dfg.edges.push(DirectlyFollowsRelation {
                from,
                to,
                frequency: freq,
            });
        }
    }

    for trace in &log.value.traces {
        if let Some(act) = trace
            .events
            .first()
            .and_then(|e| e.attributes.get(activity_key))
            .and_then(|v| v.as_string())
        {
            *dfg.start_activities.entry(act.to_owned()).or_default() += 1;
        }
        if let Some(act) = trace
            .events
            .last()
            .and_then(|e| e.attributes.get(activity_key))
            .and_then(|v| v.as_string())
        {
            *dfg.end_activities.entry(act.to_owned()).or_default() += 1;
        }
    }

    dfg
}

/// Discover DFG with frequency filtering
#[wasm_bindgen]
pub fn discover_dfg_filtered(
    eventlog_handle: &str,
    activity_key: &str,
    min_frequency: usize,
) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;

    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let dfg = discover_dfg_filtered_from_log(&admitted, activity_key, min_frequency);
    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(dfg))
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
        Some(StoredObject::DFG(dfg)) => serde_json::to_string(dfg)
            .map_err(|e| crate::error::js_val(&format!("Serialization failed: {}", e))),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap as StdHashMap;

    fn make_log_wasm(traces: &[&[&str]], key: &str) -> EventLog {
        let trace_list = traces
            .iter()
            .map(|acts| {
                let events = acts
                    .iter()
                    .map(|a| {
                        let mut attrs = std::collections::BTreeMap::new();
                        attrs.insert(key.to_string(), AttributeValue::String(a.to_string()));
                        Event { attributes: attrs }
                    })
                    .collect();
                Trace {
                    attributes: std::collections::BTreeMap::new(),
                    events,
                }
            })
            .collect();
        EventLog {
            attributes: std::collections::BTreeMap::new(),
            traces: trace_list,
        }
    }

    #[test]
    fn test_alpha_plus_plus_linear_process() {
        // Simple linear log: A -> B -> C (no loops)
        let log = make_log_wasm(&[&["A", "B", "C"], &["A", "B", "C"]], "concept:name");
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
        let pn =
            alpha_plus_plus_inner(&admitted, "concept:name", 0.0).expect("alpha++ should succeed");

        // Should have transitions for A, B, C
        assert!(
            pn.transitions.iter().any(|t| t.label == "A"),
            "missing transition A"
        );
        assert!(
            pn.transitions.iter().any(|t| t.label == "B"),
            "missing transition B"
        );
        assert!(
            pn.transitions.iter().any(|t| t.label == "C"),
            "missing transition C"
        );

        // Should have source and sink places
        assert!(
            pn.places.iter().any(|p| p.id == "p_source"),
            "missing source place"
        );
        assert!(
            pn.places.iter().any(|p| p.id == "p_sink"),
            "missing sink place"
        );
    }

    #[test]
    fn test_alpha_plus_plus_length1_loop_detected() {
        // Log with length-1 loop: A -> A -> B
        let log = make_log_wasm(&[&["A", "A", "B"], &["A", "A", "B"]], "concept:name");
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
        let pn =
            alpha_plus_plus_inner(&admitted, "concept:name", 0.0).expect("alpha++ should succeed");

        // L1L should have detected A as a self-loop activity
        // There should be a self-loop place for A
        let has_loop_place = pn.places.iter().any(|p| p.label.contains("loop(A)"));
        assert!(
            has_loop_place,
            "Expected a self-loop place for activity A; places: {:?}",
            pn.places.iter().map(|p| &p.label).collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_alpha_plus_plus_length2_loop_detected() {
        // Log with length-2 loop: A -> B -> A -> B -> C
        // Both (A,B) and (B,A) appear in DF, so they form a length-2 loop
        let log = make_log_wasm(
            &[&["A", "B", "A", "B", "C"], &["A", "B", "A", "B", "C"]],
            "concept:name",
        );
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
        let pn =
            alpha_plus_plus_inner(&admitted, "concept:name", 0.0).expect("alpha++ should succeed");

        // Should have a back-arc place for the L2L pair (A,B) or (B,A)
        let has_back_place = pn
            .places
            .iter()
            .any(|p| p.label.contains("back(A,B)") || p.label.contains("back(B,A)"));
        assert!(
            has_back_place,
            "Expected a back-arc place for L2L pair (A,B); places: {:?}",
            pn.places.iter().map(|p| &p.label).collect::<Vec<_>>()
        );

        // Should still have transitions for A, B, C
        assert!(pn.transitions.iter().any(|t| t.label == "A"));
        assert!(pn.transitions.iter().any(|t| t.label == "B"));
        assert!(pn.transitions.iter().any(|t| t.label == "C"));
    }
}
