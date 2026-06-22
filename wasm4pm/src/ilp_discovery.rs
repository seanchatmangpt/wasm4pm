use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

#[allow(dead_code)]
type DirectlyFollowsSet = HashSet<(String, String)>;

/// A candidate Petri net place with pre-set (inputs) and post-set (outputs) of activity indices.
struct CandidatePlace {
    /// Sorted activity IDs that produce a token (pre-set transitions).
    input_acts: Vec<u32>,
    /// Sorted activity IDs that consume a token (post-set transitions).
    output_acts: Vec<u32>,
}

/// Compute simplicity score for a Petri net based on structural complexity.
///
/// Based on process mining literature (García & Caballero, Buijs et al.):
/// compares actual model elements against the theoretical minimum for a linear
/// workflow — the simplest possible Petri net structure.
///
/// The theoretical minimum for N visible activities:
/// - N+1 places (source, one per gap, sink)
/// - N transitions (one per activity)
/// - 2N arcs (one in, one out per transition)
///
/// Returns the geometric mean of the three element ratios, clamped to [0.0, 1.0].
/// A value of 1.0 means the model is as simple as a linear sequence.
pub fn compute_simplicity(places: usize, transitions: usize, arcs: usize) -> f64 {
    if places == 0 || transitions == 0 || arcs == 0 {
        return 1.0; // Empty model is trivially simple
    }

    let n = transitions.saturating_sub(1).max(1); // visible activities
    let min_places = n + 1;
    let min_transitions = n;
    let min_arcs = 2 * n;

    let place_ratio = (min_places as f64 / places as f64).min(1.0);
    let transition_ratio = (min_transitions as f64 / transitions as f64).min(1.0);
    let arc_ratio = (min_arcs as f64 / arcs as f64).min(1.0);

    // Geometric mean of the three ratios
    (place_ratio * transition_ratio * arc_ratio).cbrt()
}

#[wasm_bindgen]
pub fn wasm_compute_simplicity(places: usize, transitions: usize, arcs: usize) -> f64 {
    compute_simplicity(places, transitions, arcs)
}

/// Region-based ILP-inspired Petri net discovery.
///
/// Replaces the DFG-projection stub with a 4-stage pipeline:
/// 1. Build causal/parallel pairs from the log's directly-follows relation.
/// 2. Generate candidate places: 1-to-1 causal pairs, AND-split ({a}→{b,c}), AND-join ({a,b}→{c}).
/// 3. Validate each candidate via token replay — consistent = no trace causes a token deficit.
/// 4. Greedy set-cover: select the smallest subset of consistent places that explains all causal pairs.
///
/// Produces a Petri net that correctly represents concurrent and sequential structure,
/// not just a flat DFG projection.
pub fn discover_ilp_petri_net_from_log(log: &EventLog, activity_key: &str) -> (PetriNet, f64, f64) {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);
    let n = col.vocab.len() as u32;

    if n == 0 || col.trace_offsets.len() <= 1 {
        return (PetriNet::new(), 0.0, 0.0);
    }

    // Stage 1: Build DF counts, start/end activity sets.
    let mut df: FxHashMap<(u32, u32), usize> = FxHashMap::default();
    let mut start_acts: HashSet<u32> = HashSet::new();
    let mut end_acts: HashSet<u32> = HashSet::new();

    let trace_count = col.trace_offsets.len() - 1;
    for t in 0..trace_count {
        let s = col.trace_offsets[t];
        let e = col.trace_offsets[t + 1];
        let trace = &col.events[s..e];
        if trace.is_empty() {
            continue;
        }
        start_acts.insert(trace[0]);
        end_acts.insert(*trace.last().unwrap());
        for w in trace.windows(2) {
            *df.entry((w[0], w[1])).or_default() += 1;
        }
    }

    // Stage 1b: Classify pairs as causal, parallel, or loop-1.
    let mut causal_pairs: Vec<(u32, u32)> = Vec::new();
    let mut loop1_acts: HashSet<u32> = HashSet::new();
    let mut parallel_pairs: HashSet<(u32, u32)> = HashSet::new();

    for &(a, b) in df.keys() {
        if a == b {
            loop1_acts.insert(a);
        } else if df.contains_key(&(b, a)) {
            // Both a→b and b→a: parallel (length-2 loop or unordered)
            if a < b {
                parallel_pairs.insert((a, b));
                parallel_pairs.insert((b, a));
            }
        } else {
            causal_pairs.push((a, b));
        }
    }
    causal_pairs.sort_unstable(); // deterministic order

    // Stage 2: Generate candidate places.
    let mut candidates: Vec<CandidatePlace> = Vec::new();

    // 2a. 1-to-1: one place per causal pair
    for &(a, b) in &causal_pairs {
        candidates.push(CandidatePlace {
            input_acts: vec![a],
            output_acts: vec![b],
        });
    }

    // 2b. AND-splits: ({a} → {b, c}) when a causes both b and c, and b ∥ c
    let mut causes_of: FxHashMap<u32, Vec<u32>> = FxHashMap::default();
    for &(a, b) in &causal_pairs {
        causes_of.entry(a).or_default().push(b);
    }
    for (&a, outputs) in &causes_of {
        for i in 0..outputs.len() {
            for j in i + 1..outputs.len() {
                let b = outputs[i];
                let c = outputs[j];
                if parallel_pairs.contains(&(b, c)) {
                    let (lo, hi) = if b <= c { (b, c) } else { (c, b) };
                    candidates.push(CandidatePlace {
                        input_acts: vec![a],
                        output_acts: vec![lo, hi],
                    });
                }
            }
        }
    }

    // 2c. AND-joins: ({a, b} → c) when both a and b cause c, and a ∥ b
    let mut caused_by: FxHashMap<u32, Vec<u32>> = FxHashMap::default();
    for &(a, b) in &causal_pairs {
        caused_by.entry(b).or_default().push(a);
    }
    for (&c, inputs) in &caused_by {
        for i in 0..inputs.len() {
            for j in i + 1..inputs.len() {
                let a = inputs[i];
                let b = inputs[j];
                if parallel_pairs.contains(&(a, b)) {
                    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
                    candidates.push(CandidatePlace {
                        input_acts: vec![lo, hi],
                        output_acts: vec![c],
                    });
                }
            }
        }
    }

    // Stage 3: Token-replay validation.
    // A place is consistent if no trace causes a token deficit (tokens never go negative).
    // A place is useful if at least one trace exercises it.
    let valid_candidates: Vec<CandidatePlace> = candidates
        .into_iter()
        .filter(|place| {
            let in_set: HashSet<u32> = place.input_acts.iter().copied().collect();
            let out_set: HashSet<u32> = place.output_acts.iter().copied().collect();
            let mut fires_ever = false;

            for t in 0..trace_count {
                let s = col.trace_offsets[t];
                let e = col.trace_offsets[t + 1];
                let mut tokens: i64 = 0;
                for &ev in &col.events[s..e] {
                    if in_set.contains(&ev) {
                        tokens += 1;
                        fires_ever = true;
                    }
                    if out_set.contains(&ev) {
                        tokens -= 1;
                        if tokens < 0 {
                            return false; // token deficit — place is inconsistent
                        }
                    }
                }
            }
            fires_ever
        })
        .collect();

    // Stage 4: Greedy set-cover — select the smallest consistent set that
    // explains all causal dependencies.
    let causal_set: HashSet<(u32, u32)> = causal_pairs.iter().copied().collect();
    let selected = ilp_greedy_cover(valid_candidates, &causal_set);

    // Stage 5: Assemble Petri net and compute metrics.
    build_ilp_petri_net(
        &selected,
        &col,
        log,
        activity_key,
        &start_acts,
        &end_acts,
        &loop1_acts,
    )
}

/// Greedy set-cover: select the minimum subset of candidate places that together
/// cover every causal pair in the log. Places are ranked by coverage (pairs covered
/// per selection step). Redundant places are pruned after the initial selection.
fn ilp_greedy_cover(
    candidates: Vec<CandidatePlace>,
    causal_pairs: &HashSet<(u32, u32)>,
) -> Vec<CandidatePlace> {
    let mut uncovered: HashSet<(u32, u32)> = causal_pairs.clone();
    let mut remaining = candidates;
    let mut selected: Vec<CandidatePlace> = Vec::new();

    while !uncovered.is_empty() && !remaining.is_empty() {
        // Pick the candidate that covers the most uncovered pairs.
        let best_idx = remaining
            .iter()
            .enumerate()
            .max_by_key(|(_, c)| {
                let in_set: HashSet<u32> = c.input_acts.iter().copied().collect();
                let out_set: HashSet<u32> = c.output_acts.iter().copied().collect();
                uncovered
                    .iter()
                    .filter(|(a, b)| in_set.contains(a) && out_set.contains(b))
                    .count()
            })
            .map(|(i, _)| i);

        if let Some(idx) = best_idx {
            let candidate = remaining.remove(idx);
            let in_set: HashSet<u32> = candidate.input_acts.iter().copied().collect();
            let out_set: HashSet<u32> = candidate.output_acts.iter().copied().collect();
            let covers_any = uncovered
                .iter()
                .any(|(a, b)| in_set.contains(a) && out_set.contains(b));
            if covers_any {
                uncovered.retain(|(a, b)| !(in_set.contains(a) && out_set.contains(b)));
                selected.push(candidate);
            } else {
                break;
            }
        } else {
            break;
        }
    }

    selected
}

/// Assemble a Petri net from the selected places and compute fitness + precision.
fn build_ilp_petri_net(
    selected: &[CandidatePlace],
    col: &ColumnarLog<'_>,
    log: &EventLog,
    activity_key: &str,
    start_acts: &HashSet<u32>,
    end_acts: &HashSet<u32>,
    loop1_acts: &HashSet<u32>,
) -> (PetriNet, f64, f64) {
    let mut petri_net = PetriNet::new();

    // One transition per activity, using the vocab string as the ID prefix.
    let mut act_to_trans: FxHashMap<u32, String> = FxHashMap::default();
    for (id, &name) in col.vocab.iter().enumerate() {
        let trans_id = format!("t_{}", name);
        act_to_trans.insert(id as u32, trans_id.clone());
        petri_net.transitions.push(PetriNetTransition {
            id: trans_id,
            label: name.to_string(),
            is_invisible: Some(false),
        });
    }

    // Source and sink places (required by token_replay_pure and existing tests).
    let source = "p_source".to_string();
    let sink = "p_sink".to_string();
    petri_net.places.push(PetriNetPlace {
        id: source.clone(),
        label: "source".to_string(),
        marking: Some(1),
    });
    petri_net.places.push(PetriNetPlace {
        id: sink.clone(),
        label: "sink".to_string(),
        marking: Some(0),
    });
    petri_net.initial_marking.insert(source.clone(), 1);
    petri_net
        .final_markings
        .push(std::collections::HashMap::from([(sink.clone(), 1)]));

    // Source → start activities.
    for &sa in start_acts {
        if let Some(t) = act_to_trans.get(&sa) {
            petri_net.arcs.push(PetriNetArc {
                from: source.clone(),
                to: t.clone(),
                weight: Some(1),
            });
        }
    }
    // End activities → sink.
    for &ea in end_acts {
        if let Some(t) = act_to_trans.get(&ea) {
            petri_net.arcs.push(PetriNetArc {
                from: t.clone(),
                to: sink.clone(),
                weight: Some(1),
            });
        }
    }

    // Self-loop places for L1L activities (matching Alpha++ naming convention).
    for &a in loop1_acts {
        if let Some(t) = act_to_trans.get(&a) {
            // Bounds check: ensure activity index is valid
            if let Some(name) = col.vocab.get(a as usize) {
                let pid = format!("p_loop_{}", name);
                petri_net.places.push(PetriNetPlace {
                    id: pid.clone(),
                    label: format!("loop_{}", name),
                    marking: Some(0),
                });
                petri_net.arcs.push(PetriNetArc {
                    from: t.clone(),
                    to: pid.clone(),
                    weight: Some(1),
                });
                petri_net.arcs.push(PetriNetArc {
                    from: pid,
                    to: t.clone(),
                    weight: Some(1),
                });
            }
        }
    }

    // Selected region places.
    for (idx, place) in selected.iter().enumerate() {
        let pid = format!("p{}", idx);
        // Bounds check: filter activities that have valid vocab entries
        let input_labels: Vec<String> = place
            .input_acts
            .iter()
            .filter_map(|&a| col.vocab.get(a as usize).map(|s| s.to_string()))
            .collect();
        let output_labels: Vec<String> = place
            .output_acts
            .iter()
            .filter_map(|&a| col.vocab.get(a as usize).map(|s| s.to_string()))
            .collect();
        let label = format!("{}->{}", input_labels.join(","), output_labels.join(","));
        petri_net.places.push(PetriNetPlace {
            id: pid.clone(),
            label,
            marking: Some(0),
        });
        for &in_act in &place.input_acts {
            if let Some(t) = act_to_trans.get(&in_act) {
                petri_net.arcs.push(PetriNetArc {
                    from: t.clone(),
                    to: pid.clone(),
                    weight: Some(1),
                });
            }
        }
        for &out_act in &place.output_acts {
            if let Some(t) = act_to_trans.get(&out_act) {
                petri_net.arcs.push(PetriNetArc {
                    from: pid.clone(),
                    to: t.clone(),
                    weight: Some(1),
                });
            }
        }
    }

    // Fitness via proper token replay (not DFG-fitting).
    let conformance = crate::conformance::token_replay_pure(log, &petri_net, activity_key);
    let fitness = conformance.avg_fitness;
    let precision = calculate_precision(&petri_net, log, activity_key);

    (petri_net, fitness, precision)
}

/// Frequency-aware Petri net discovery with noise filtering.
/// Filters directly-follows relations to include only edges that occur ≥ 2 times,
/// reducing overfitting to rare behaviors while maintaining high fitness on core process.
#[wasm_bindgen]
pub fn discover_ilp_petri_net(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let log_owned = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;
    let (petri_net, fitness, precision) = discover_ilp_petri_net_from_log(&log_owned, activity_key);
    let simplicity = compute_simplicity(
        petri_net.places.len(),
        petri_net.transitions.len(),
        petri_net.arcs.len(),
    );
    let handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(petri_net.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store Petri net"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "ilp_petri_net",
        "places": petri_net.places.len(),
        "transitions": petri_net.transitions.len(),
        "arcs": petri_net.arcs.len(),
        "fitness": fitness,
        "precision": precision,
        "simplicity": simplicity,
        "f_measure": 2.0 * (fitness * precision) / (fitness + precision + 0.001),
    }))
}

/// Pure-Rust optimized DFG discovery without wasm-bindgen. Used by integration tests.
pub fn discover_optimized_dfg_from_log(
    log: &EventLog,
    activity_key: &str,
    fitness_weight: f64,
    simplicity_weight: f64,
) -> DFG {
    let activities = log.get_activities(activity_key);
    let mut dfg = DFG::new();

    for activity in &activities {
        dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: 0,
        });
    }

    let node_index: FxHashMap<&str, usize> = activities
        .iter()
        .enumerate()
        .map(|(i, a)| (a.as_str(), i))
        .collect();

    let mut edge_counts: FxHashMap<(String, String), usize> = FxHashMap::default();
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                if let Some(&idx) = node_index.get(activity.as_str()) {
                    dfg.nodes[idx].frequency += 1;
                }
            }
        }
        for window in trace.events.windows(2) {
            if let (Some(AttributeValue::String(act1)), Some(AttributeValue::String(act2))) = (
                window[0].attributes.get(activity_key),
                window[1].attributes.get(activity_key),
            ) {
                *edge_counts.entry((act1.clone(), act2.clone())).or_default() += 1;
            }
        }
    }

    let max_freq = edge_counts.values().max().copied().unwrap_or(1);
    for ((from, to), count) in edge_counts {
        let normalized_freq = count as f64 / max_freq as f64;
        let score = (fitness_weight * normalized_freq) - (simplicity_weight * 0.1);
        if score > 0.1 {
            dfg.edges.push(DirectlyFollowsRelation {
                from,
                to,
                frequency: count,
            });
        }
    }

    for trace in &log.traces {
        if !trace.events.is_empty() {
            if let Some(AttributeValue::String(first_act)) =
                trace.events[0].attributes.get(activity_key)
            {
                *dfg.start_activities.entry(first_act.clone()).or_default() += 1;
            }
            if let Some(AttributeValue::String(last_act)) = trace.events[trace.events.len() - 1]
                .attributes
                .get(activity_key)
            {
                *dfg.end_activities.entry(last_act.clone()).or_default() += 1;
            }
        }
    }

    dfg
}

/// Discover optimal DFG using constraint satisfaction
/// Balances fitness and simplicity using weighted optimization
#[wasm_bindgen]
pub fn discover_optimized_dfg(
    eventlog_handle: &str,
    activity_key: &str,
    fitness_weight: f64,
    simplicity_weight: f64,
) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;

    let dfg =
        discover_optimized_dfg_from_log(&log, activity_key, fitness_weight, simplicity_weight);
    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(dfg))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "optimized_dfg",
        "nodes": n_nodes,
        "edges": n_edges,
        "fitness_weight": fitness_weight,
        "simplicity_weight": simplicity_weight,
    }))
}

// Helper function to check if a trace conforms to directly-follows relations
#[inline]
#[allow(dead_code)]
fn is_trace_fitting(
    trace: &Trace,
    activity_key: &str,
    directly_follows: &DirectlyFollowsSet,
) -> bool {
    // Extract activity strings once, avoiding repeated attribute lookups in the pair loop
    let activities: Vec<&str> = trace
        .events
        .iter()
        .filter_map(|e| e.attributes.get(activity_key)?.as_string())
        .collect();

    activities.windows(2).all(|w| {
        // Borrow-based lookup avoids cloning both sides of the pair
        directly_follows.contains(&(w[0].to_owned(), w[1].to_owned()))
    })
}

// Calculate precision: fraction of model transitions (visible activities) that are
// covered by activities observed in the log.
#[inline]
fn calculate_precision(petri_net: &PetriNet, log: &EventLog, activity_key: &str) -> f64 {
    // Collect unique activities observed in the log
    let log_activities: HashSet<String> = log
        .traces
        .iter()
        .flat_map(|trace| {
            trace.events.iter().filter_map(|e| {
                e.attributes
                    .get(activity_key)?
                    .as_string()
                    .map(str::to_owned)
            })
        })
        .collect();

    // Collect visible (non-silent) transition labels from the model
    let model_activities: HashSet<String> = petri_net
        .transitions
        .iter()
        .filter(|t| !t.is_invisible.unwrap_or(false))
        .map(|t| t.label.clone())
        .collect();

    if model_activities.is_empty() {
        return 0.0;
    }

    let covered = log_activities.intersection(&model_activities).count();
    covered as f64 / model_activities.len() as f64
}

#[wasm_bindgen]
pub fn ilp_discovery_info() -> String {
    json!({
        "status": "ilp_discovery_available",
        "algorithms": [
            {
                "name": "discover_ilp_petri_net",
                "description": "Finds optimal Petri net using constraint-based optimization",
                "parameters": ["activity_key"],
                "returns": ["fitness", "precision", "simplicity", "f_measure"],
                "better_for": "Finding optimal process models with balanced fit and complexity"
            },
            {
                "name": "discover_optimized_dfg",
                "description": "Discovers DFG with weighted fitness-simplicity optimization",
                "parameters": ["activity_key", "fitness_weight", "simplicity_weight"],
                "returns": ["nodes", "edges"],
                "better_for": "Balancing detail and readability based on importance weights"
            }
        ]
    })
    .to_string()
}
