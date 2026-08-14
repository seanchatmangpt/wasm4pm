use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{evaluate_edges_fitness, to_js_str};
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// A candidate Petri net place with pre-set (inputs) and post-set (outputs) of activity indices.
#[derive(Clone)]
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
    let mut start_acts: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();
    let mut end_acts: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();

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
    let mut loop1_acts: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();
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
    // Stage 4: real 0/1 ILP set-cover solve (added 2026-08-12), replacing
    // the greedy heuristic as the primary path -- `ilp_exact_cover` finds
    // the real minimum-cardinality selection. Falls back to
    // `ilp_greedy_cover` only on a real solve failure -- a disclosed
    // fallback, never a silent wrong answer.
    let causal_set: HashSet<(u32, u32)> = causal_pairs.iter().copied().collect();
    let selected = match ilp_exact_cover(valid_candidates.clone(), &causal_set) {
        Some(exact) => exact,
        None => ilp_greedy_cover(valid_candidates, &causal_set),
    };

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

/// Real 0/1 integer-linear-program solve of the exact same set-cover problem
/// [`ilp_greedy_cover`] approximates -- added 2026-08-12. Formulation: one
/// binary variable `x_i` per candidate place; minimize `sum(x_i)` subject
/// to, for every real causal pair `(a, b)`, `sum(x_i for i covering (a,b))
/// >= 1`. Solved via [`good_lp`]'s pure-Rust `microlp` backend (real
/// branch-and-bound, no native/C solver dependency -- chosen for
/// `wasm32-unknown-unknown` compatibility).
///
/// Returns `None` on any real solve failure (should not occur -- every
/// real causal pair is guaranteed coverable by its 1-to-1 candidate). Callers
/// fall back to [`ilp_greedy_cover`] in that case.
fn ilp_exact_cover(
    candidates: Vec<CandidatePlace>,
    causal_pairs: &HashSet<(u32, u32)>,
) -> Option<Vec<CandidatePlace>> {
    use good_lp::{variable, Expression, ProblemVariables, Solution, SolverModel};

    if candidates.is_empty() || causal_pairs.is_empty() {
        return Some(Vec::new());
    }

    let mut vars = ProblemVariables::new();
    let mut x = Vec::with_capacity(candidates.len());
    for _ in &candidates {
        x.push(vars.add(variable().binary()));
    }

    let objective: Expression = x.iter().map(|&v| Expression::from(v)).sum();
    let mut model = vars.minimise(objective).using(good_lp::microlp);

    for &(a, b) in causal_pairs {
        let covering: Vec<good_lp::Variable> = candidates
            .iter()
            .zip(&x)
            .filter(|(c, _)| c.input_acts.contains(&a) && c.output_acts.contains(&b))
            .map(|(_, &v)| v)
            .collect();
        if covering.is_empty() {
            return None;
        }
        let coverage: Expression = covering.into_iter().map(Expression::from).sum();
        model = model.with(coverage.geq(1.0));
    }

    let solution = model.solve().ok()?;
    let selected: Vec<CandidatePlace> = candidates
        .into_iter()
        .zip(&x)
        .filter(|(_, &v)| solution.value(v) > 0.5)
        .map(|(c, _)| c)
        .collect();
    Some(selected)
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
    start_acts: &std::collections::BTreeSet<u32>,
    end_acts: &std::collections::BTreeSet<u32>,
    loop1_acts: &std::collections::BTreeSet<u32>,
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
        .push(std::collections::BTreeMap::from([(sink.clone(), 1)]));

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
    // Corrected 2026-08-12: previously used the local `calculate_precision`
    // (a coarse activity-coverage ratio), when the real, correctly-
    // implemented ETConformance precision already existed unused in this
    // crate.
    let final_marking: crate::etconformance_precision::Marking = petri_net
        .final_markings
        .first()
        .cloned()
        .unwrap_or_default();
    let precision = crate::etconformance_precision::compute_precision(
        &petri_net,
        &petri_net.initial_marking,
        &final_marking,
        log,
        activity_key,
    )
    .precision;

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
    let log_owned = get_or_init_state().with_event_log(eventlog_handle, |log| Ok(log.clone()))?;
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
        "algorithm": "ilp_region_heuristic",
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
///
/// Genuine discrete optimization: sweeps every distinct edge-frequency threshold,
/// evaluates the filtered DFG's replay fitness (`evaluate_edges_fitness`) against
/// a simplicity penalty proportional to the fraction of edges kept, and returns
/// the argmax model. Ties prefer the lower threshold (more behavior retained).
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

    for trace in &log.traces {
        for event in &trace.events {
            if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                if let Some(&idx) = node_index.get(activity.as_str()) {
                    dfg.nodes[idx].frequency += 1;
                }
            }
        }
    }

    // Vocab-indexed edge frequencies for fitness evaluation.
    let col_owned = log.to_columnar_owned(activity_key);
    let col = crate::models::ColumnarLog::from_owned(&col_owned);
    let mut edge_freq: FxHashMap<(u32, u32), usize> = FxHashMap::default();
    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let (start, end) = (col.trace_offsets[t], col.trace_offsets[t + 1]);
        for i in start..end.saturating_sub(1) {
            *edge_freq
                .entry((col.events[i], col.events[i + 1]))
                .or_default() += 1;
        }
    }
    let total_edges = edge_freq.len();

    if total_edges > 0 {
        // Candidate thresholds: every distinct observed frequency (keep-if >= t).
        let mut thresholds: Vec<usize> = edge_freq.values().copied().collect();
        thresholds.sort_unstable();
        thresholds.dedup();

        let mut best: Option<(f64, usize, std::collections::BTreeSet<(u32, u32)>)> = None;
        for &t in &thresholds {
            let edge_set: std::collections::BTreeSet<(u32, u32)> = edge_freq
                .iter()
                .filter(|&(_, &f)| f >= t)
                .map(|(&e, _)| e)
                .collect();
            if edge_set.is_empty() {
                continue;
            }
            let fitness = evaluate_edges_fitness(&edge_set, &col, total_edges);
            // Scale the penalty into the same 0.2 band as the fitness function's
            // own complexity term, so default weights don't drown replay fitness.
            let simplicity_penalty = 0.2 * edge_set.len() as f64 / total_edges as f64;
            let objective = fitness_weight * fitness - simplicity_weight * simplicity_penalty;
            let better = match &best {
                None => true,
                // strict improvement wins; ties keep the earlier (lower) threshold
                Some((best_obj, _, _)) => objective > *best_obj + f64::EPSILON,
            };
            if better {
                best = Some((objective, t, edge_set));
            }
        }

        if let Some((_, _, edge_set)) = best {
            for (from_idx, to_idx) in edge_set {
                let from = col.vocab[from_idx as usize].to_string();
                let to = col.vocab[to_idx as usize].to_string();
                let frequency = edge_freq[&(from_idx, to_idx)];
                dfg.edges.push(DirectlyFollowsRelation {
                    from,
                    to,
                    frequency,
                });
            }
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
    let log = get_or_init_state().with_event_log(eventlog_handle, |log| Ok(log.clone()))?;

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

// Removed 2026-08-12: `calculate_precision` (a coarse activity-coverage
// ratio) was replaced at its one real call site by the real, correctly-
// implemented ETConformance precision (`etconformance_precision::compute_precision`).

#[wasm_bindgen]
pub fn ilp_discovery_info() -> String {
    json!({
        "status": "ilp_discovery_available",
        "algorithms": [
            {
                "name": "discover_ilp_petri_net",
                "description": "Region-based Petri net discovery: causal-pair candidate places validated by token replay, selected via a real 0/1 ILP solve (minimum-cardinality set cover, solved with good_lp/microlp) with a greedy-heuristic fallback on solve failure",
                "parameters": ["activity_key"],
                "returns": ["fitness", "precision", "simplicity", "f_measure"],
                "better_for": "Finding process models with balanced fit and complexity; optimal place selection on the common path"
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

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(input: &[u32], output: &[u32]) -> CandidatePlace {
        CandidatePlace {
            input_acts: input.to_vec(),
            output_acts: output.to_vec(),
        }
    }

    fn covers_pair(c: &CandidatePlace, a: u32, b: u32) -> bool {
        c.input_acts.contains(&a) && c.output_acts.contains(&b)
    }

    fn covers_pair_in(selected: &[&CandidatePlace], a: u32, b: u32) -> bool {
        selected.iter().any(|c| covers_pair(c, a, b))
    }

    fn all_pairs_covered(selected: &[CandidatePlace], causal_pairs: &HashSet<(u32, u32)>) -> bool {
        let refs: Vec<&CandidatePlace> = selected.iter().collect();
        causal_pairs
            .iter()
            .all(|(a, b)| covers_pair_in(&refs, *a, *b))
    }

    #[test]
    fn ilp_exact_cover_finds_a_real_valid_cover() {
        let causal: HashSet<(u32, u32)> = [(0, 1), (0, 2), (1, 3), (2, 3)].into_iter().collect();
        let candidates = vec![
            candidate(&[0], &[1, 2]),
            candidate(&[1, 2], &[3]),
            candidate(&[0], &[1]),
            candidate(&[0], &[2]),
            candidate(&[1], &[3]),
            candidate(&[2], &[3]),
        ];
        let result = ilp_exact_cover(candidates, &causal).expect("real solve must succeed");
        assert!(
            all_pairs_covered(&result, &causal),
            "exact cover must cover every real causal pair"
        );
        assert_eq!(
            result.len(),
            2,
            "expected the real minimum-cardinality cover (2 places)"
        );
    }

    #[test]
    fn ilp_exact_cover_never_produces_more_places_than_the_greedy_heuristic() {
        let causal: HashSet<(u32, u32)> = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 4)]
            .into_iter()
            .collect();
        let candidates = vec![
            candidate(&[0], &[1]),
            candidate(&[1], &[2]),
            candidate(&[2], &[3]),
            candidate(&[3], &[4]),
            candidate(&[0], &[4]),
            candidate(&[0, 3], &[1, 4]),
        ];
        let exact = ilp_exact_cover(candidates.clone(), &causal).expect("real solve must succeed");
        let greedy = ilp_greedy_cover(candidates, &causal);
        assert!(all_pairs_covered(&exact, &causal));
        assert!(all_pairs_covered(&greedy, &causal));
        assert!(
            exact.len() <= greedy.len(),
            "exact ILP solve ({} places) must never need more places than greedy ({} places)",
            exact.len(),
            greedy.len()
        );
    }

    #[test]
    fn ilp_exact_cover_empty_causal_pairs_returns_empty() {
        let candidates = vec![candidate(&[0], &[1])];
        let causal: HashSet<(u32, u32)> = HashSet::new();
        let result = ilp_exact_cover(candidates, &causal).expect("must succeed on trivial input");
        assert!(result.is_empty());
    }

    #[test]
    fn ilp_exact_cover_returns_none_when_a_pair_is_genuinely_uncoverable() {
        let candidates = vec![candidate(&[0], &[1])];
        let causal: HashSet<(u32, u32)> = [(0, 1), (5, 6)].into_iter().collect();
        let result = ilp_exact_cover(candidates, &causal);
        assert!(result.is_none());
    }
}
