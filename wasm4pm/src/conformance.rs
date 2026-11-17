//! Token-replay conformance checking: fitness and precision measurement.
//!
//! ## Fitness formula
//!
//! Corrected 2026-08-12: this doc comment previously stated
//! `fitness = 1.0 - (missing + consumed) / (produced + remaining)`, which
//! does not match what the code below actually computes and never did --
//! per this repo's own AGENTS.md rule that documentation is subordinate to
//! executable source when they disagree, the code (see `replay_log`'s
//! `trace_fitness` computation) is correct and this doc is what was wrong.
//! The real, executed formula is the standard van der Aalst token-replay
//! fitness, per-trace and then averaged:
//!
//! ```text
//! fitness = 0.5 * (1 - missing / consumed) + 0.5 * (1 - remaining / produced)
//! ```
//!
//! where `consumed`/`produced` are real tokens consumed/produced during
//! replay, `missing` is tokens that had to be artificially inserted because
//! a transition needed to fire but its input token wasn't present, and
//! `remaining` is tokens left over after replay that are not part of the
//! final marking. This is the same formula pm4py implements
//! (`pm4py.algo.evaluation.replay_fitness.variants.token_replay`),
//! confirmed against pm4py's real source this session.
//!
//! A value ≥ 0.85 is considered acceptable for real-world logs (van der Aalst 2016).
//! A value of 1.0 means every trace replayed without missing tokens.
//!
//! ## Via WASM handle
//!
//! ```no_run
//! // JavaScript (Node.js / browser):
//! // const result = JSON.parse(check_conformance(handle, "concept:name"));
//! // result.fitness    → 0.0–1.0
//! // result.precision  → 0.0–1.0
//! ```

use crate::conformance_guards;
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use hashbrown::{HashMap, HashSet};
use serde_json::json;
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Fix C — shared lookup struct: eliminates duplicated HashMap-building code
// ---------------------------------------------------------------------------

struct PetriNetLookup {
    /// visible label → transition indices, sorted for O(log n) binary search
    sorted_label_index: Vec<(String, Vec<usize>)>,
    /// pre-filtered indices of invisible transitions for fixpoint firing
    invisible_indices: Vec<usize>,
    /// per-transition input token bitmask (for bitmask replay path)
    trans_in_masks: Vec<u64>,
    /// per-transition output token bitmask (for bitmask replay path)
    trans_out_masks: Vec<u64>,
    /// transition id → [(place_id, weight)]  (input arcs)
    transition_inputs: HashMap<String, Vec<(String, usize)>>,
    /// transition id → [(place_id, weight)]  (output arcs)
    transition_outputs: HashMap<String, Vec<(String, usize)>>,
    /// place id → index into marking Vec
    place_idx: HashMap<String, usize>,
}

impl PetriNetLookup {
    fn build(petri_net: &PetriNet) -> Self {
        // Fix A — capacity hints on every HashMap
        let mut transition_inputs: HashMap<String, Vec<(String, usize)>> =
            HashMap::with_capacity(petri_net.arcs.len());
        let mut transition_outputs: HashMap<String, Vec<(String, usize)>> =
            HashMap::with_capacity(petri_net.arcs.len());
        let mut place_idx: HashMap<String, usize> = HashMap::with_capacity(petri_net.places.len());

        // Build sorted label index (replaces activity_to_transition HashMap)
        let mut label_map: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for (idx, trans) in petri_net.transitions.iter().enumerate() {
            if !trans.is_invisible.unwrap_or(false) && !trans.label.is_empty() {
                label_map.entry(trans.label.clone()).or_default().push(idx);
            }
        }
        let sorted_label_index: Vec<(String, Vec<usize>)> = label_map.into_iter().collect();

        // Pre-filter invisible transitions for fixpoint firing
        let invisible_indices: Vec<usize> = petri_net
            .transitions
            .iter()
            .enumerate()
            .filter(|(_, t)| t.is_invisible.unwrap_or(false) || t.label.is_empty())
            .map(|(i, _)| i)
            .collect();

        // Fix B — pre-build HashSet of transition IDs to avoid O(n) scan per arc
        let transition_ids: HashSet<&str> = petri_net
            .transitions
            .iter()
            .map(|t| t.id.as_str())
            .collect();

        for arc in &petri_net.arcs {
            let weight = arc.weight.unwrap_or(1);
            if transition_ids.contains(arc.from.as_str()) {
                // Transition → Place (output arc)
                transition_outputs
                    .entry(arc.from.clone())
                    .or_default()
                    .push((arc.to.clone(), weight));
            } else {
                // Place → Transition (input arc)
                transition_inputs
                    .entry(arc.to.clone())
                    .or_default()
                    .push((arc.from.clone(), weight));
            }
        }

        for (i, place) in petri_net.places.iter().enumerate() {
            place_idx.insert(place.id.clone(), i);
        }

        let n_trans = petri_net.transitions.len();
        let mut trans_in_masks = vec![0u64; n_trans];
        let mut trans_out_masks = vec![0u64; n_trans];
        for (i, trans) in petri_net.transitions.iter().enumerate() {
            if let Some(inputs) = transition_inputs.get(&trans.id) {
                for (place_id, _) in inputs {
                    if let Some(&idx) = place_idx.get(place_id) {
                        // Only places 0..64 are representable in the u64
                        // bitmask fast path; nets with more places always run
                        // the Vec engine, so higher bits are never read.
                        if idx < 64 {
                            trans_in_masks[i] |= 1u64 << idx;
                        }
                    }
                }
            }
            if let Some(outputs) = transition_outputs.get(&trans.id) {
                for (place_id, _) in outputs {
                    if let Some(&idx) = place_idx.get(place_id) {
                        if idx < 64 {
                            trans_out_masks[i] |= 1u64 << idx;
                        }
                    }
                }
            }
        }

        PetriNetLookup {
            sorted_label_index,
            invisible_indices,
            trans_in_masks,
            trans_out_masks,
            transition_inputs,
            transition_outputs,
            place_idx,
        }
    }
}

// ---------------------------------------------------------------------------
// Bitmask helpers
// ---------------------------------------------------------------------------

/// POPCNT-based prefix rank: set bits in `marking` at positions 0..=pos.
#[inline]
fn rank_u64(marking: u64, pos: usize) -> usize {
    let mask = if pos >= 63 {
        u64::MAX
    } else {
        (1u64 << (pos + 1)) - 1
    };
    (marking & mask).count_ones() as usize
}

#[inline]
fn fire_invisible_bitmask(
    invisible_indices: &[usize],
    trans_in_masks: &[u64],
    trans_out_masks: &[u64],
    marking: &mut u64,
) {
    let mut changed = true;
    while changed {
        changed = false;
        for &i in invisible_indices {
            let in_m = trans_in_masks[i];
            if (*marking & in_m) == in_m {
                *marking = (*marking & !in_m) | trans_out_masks[i];
                changed = true;
                break;
            }
        }
    }
}

/// pm4py-parity invisible-transition handling: instead of firing every enabled
/// invisible transition greedily to fixpoint (which can consume tokens a later
/// visible transition needs — the sepsis fitness-0.0045 divergence), search
/// breadth-first over invisible-only firings for a minimal sequence that makes
/// `target_in_mask` enabled, and apply only that sequence. Returns `None` if
/// the target cannot be enabled by invisible firings alone (caller then counts
/// missing tokens as usual).
fn enable_via_invisible_bitmask(
    invisible_indices: &[usize],
    trans_in_masks: &[u64],
    trans_out_masks: &[u64],
    marking: u64,
    target_in_mask: u64,
) -> Option<u64> {
    if (marking & target_in_mask) == target_in_mask {
        return Some(marking);
    }
    let mut visited: HashSet<u64> = HashSet::new();
    let mut frontier: Vec<u64> = vec![marking];
    visited.insert(marking);
    let mut depth = 0usize;
    while !frontier.is_empty() && depth < 64 {
        let mut next: Vec<u64> = Vec::new();
        for &m in &frontier {
            for &i in invisible_indices {
                let in_m = trans_in_masks[i];
                if (m & in_m) == in_m {
                    let m2 = (m & !in_m) | trans_out_masks[i];
                    if (m2 & target_in_mask) == target_in_mask {
                        return Some(m2);
                    }
                    if visited.insert(m2) {
                        next.push(m2);
                    }
                }
            }
        }
        frontier = next;
        depth += 1;
    }
    None
}

/// Weight-aware Vec-path analog of [`enable_via_invisible_bitmask`].
fn enable_via_invisible_vec(
    invisible_indices: &[usize],
    transition_inputs: &HashMap<String, Vec<(String, usize)>>,
    transition_outputs: &HashMap<String, Vec<(String, usize)>>,
    place_idx: &HashMap<String, usize>,
    marking: &[usize],
    target_transition_id: &str,
) -> Option<Vec<usize>> {
    let target_inputs = transition_inputs.get(target_transition_id);
    let target_needs: Vec<(usize, usize)> = target_inputs
        .map(|ins| {
            ins.iter()
                .filter_map(|(pid, w)| place_idx.get(pid).map(|&idx| (idx, *w)))
                .collect()
        })
        .unwrap_or_default();
    let enabled_on = |m: &[usize]| -> bool {
        target_needs
            .iter()
            .all(|&(idx, w)| m.get(idx).copied().unwrap_or(0) >= w)
    };
    let m0: Vec<usize> = marking.to_vec();
    if enabled_on(&m0) {
        return Some(m0);
    }
    let fire = |m: &mut Vec<usize>, i: usize| -> bool {
        let tid = i.to_string();
        if let Some(ins) = transition_inputs.get(&tid) {
            for (pid, w) in ins {
                let idx = match place_idx.get(pid) {
                    Some(&idx) => idx,
                    None => return false,
                };
                if m.get(idx).copied().unwrap_or(0) < *w {
                    return false;
                }
            }
            for (pid, w) in ins {
                if let Some(&idx) = place_idx.get(pid) {
                    m[idx] -= w;
                }
            }
        }
        if let Some(outs) = transition_outputs.get(&tid) {
            for (pid, w) in outs {
                if let Some(&idx) = place_idx.get(pid) {
                    m[idx] += w;
                }
            }
        }
        true
    };
    let mut visited: HashSet<Vec<usize>> = HashSet::with_capacity(64);
    let mut frontier: Vec<Vec<usize>> = vec![m0.clone()];
    visited.insert(m0);
    let mut depth = 0usize;
    while !frontier.is_empty() && depth < 32 {
        let mut next: Vec<Vec<usize>> = Vec::new();
        for m in &frontier {
            for &i in invisible_indices {
                let mut m2 = m.clone();
                if fire(&mut m2, i) && visited.insert(m2.clone()) {
                    if enabled_on(&m2) {
                        return Some(m2);
                    }
                    next.push(m2);
                }
            }
        }
        frontier = next;
        depth += 1;
    }
    None
}

/// End-of-trace drain: BFS over invisible-only firings to reach exactly the
/// final marking `fm` (equality on every place). Returns `None` if unreachable.
fn reach_final_via_invisible_vec(
    invisible_indices: &[usize],
    transition_inputs: &HashMap<String, Vec<(String, usize)>>,
    transition_outputs: &HashMap<String, Vec<(String, usize)>>,
    place_idx: &HashMap<String, usize>,
    marking: &[usize],
    fm: &BTreeMap<String, usize>,
) -> Option<Vec<usize>> {
    let mut visited: HashSet<Vec<usize>> = HashSet::with_capacity(64);
    let mut frontier: Vec<Vec<usize>> = vec![marking.to_vec()];
    visited.insert(marking.to_vec());
    let mut depth = 0usize;
    while !frontier.is_empty() && depth < 32 {
        let mut next: Vec<Vec<usize>> = Vec::new();
        for m in &frontier {
            for &i in invisible_indices {
                let mut m2 = m.clone();
                let fired = (|| {
                    let tid = i.to_string();
                    if let Some(ins) = transition_inputs.get(&tid) {
                        for (pid, w) in ins {
                            let idx = match place_idx.get(pid) {
                                Some(&idx) => idx,
                                None => return false,
                            };
                            if m2.get(idx).copied().unwrap_or(0) < *w {
                                return false;
                            }
                        }
                        for (pid, w) in ins {
                            if let Some(&idx) = place_idx.get(pid) {
                                m2[idx] -= w;
                            }
                        }
                    }
                    if let Some(outs) = transition_outputs.get(&tid) {
                        for (pid, w) in outs {
                            if let Some(&idx) = place_idx.get(pid) {
                                m2[idx] += w;
                            }
                        }
                    }
                    true
                })();
                let is_final = place_idx.iter().all(|(pid, &idx)| {
                    let c = m2.get(idx).copied().unwrap_or(0);
                    match fm.get(pid) {
                        Some(&n) => c == n,
                        None => c == 0,
                    }
                });
                if fired && visited.insert(m2.clone()) {
                    if is_final {
                        return Some(m2);
                    }
                    next.push(m2);
                }
            }
        }
        frontier = next;
        depth += 1;
    }
    None
}

/// Shared invisible-transition firing for the Vec marking path — the exact
/// analog of [`fire_invisible_bitmask`] (same fixpoint, same call sites:
/// after initial-marking load and after every visible event). Invisible
/// firings do not touch consumed/produced/missing counters in either path.
fn fire_invisible_vec(
    invisible_indices: &[usize],
    transition_inputs: &HashMap<String, Vec<(String, usize)>>,
    transition_outputs: &HashMap<String, Vec<(String, usize)>>,
    place_idx: &HashMap<String, usize>,
    marking: &mut [usize],
) {
    let mut changed = true;
    while changed {
        changed = false;
        for &i in invisible_indices {
            let tid = i.to_string();
            let inputs = transition_inputs.get(&tid);
            let enabled = inputs.map_or(true, |ins| {
                ins.iter().all(|(place_id, weight)| {
                    place_idx
                        .get(place_id)
                        .map_or(false, |&idx| marking[idx] >= *weight)
                })
            });
            if enabled {
                if let Some(ins) = inputs {
                    for (place_id, weight) in ins {
                        if let Some(&idx) = place_idx.get(place_id) {
                            marking[idx] -= weight;
                        }
                    }
                }
                if let Some(outs) = transition_outputs.get(&tid) {
                    for (place_id, weight) in outs {
                        if let Some(&idx) = place_idx.get(place_id) {
                            marking[idx] += weight;
                        }
                    }
                }
                changed = true;
                break;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Core replay logic (shared by token_replay_pure and check_token_based_replay)
// ---------------------------------------------------------------------------

/// Engine eligibility: the u64 bitmask fast path is used only when every
/// place is representable as at most one token bit — ≤64 places, unit arc
/// weights, single-token initial marking. Otherwise the weight-aware Vec
/// engine runs. Single source of truth for both the replay routing and the
/// `"engine"` field in the WASM payload.
/// Public for parity regression tests (engine-coverage pinning); stable.
pub fn uses_bitmask_engine(petri_net: &PetriNet) -> bool {
    petri_net.places.len() <= 64
        && petri_net.arcs.iter().all(|a| a.weight.unwrap_or(1) == 1)
        && petri_net.initial_marking.values().all(|&c| c <= 1)
}

fn replay_log(
    log: &EventLog,
    petri_net: &PetriNet,
    activity_key: &str,
    lookup: &PetriNetLookup,
) -> ConformanceResult {
    let mut result = ConformanceResult {
        case_fitness: Vec::new(),
        avg_fitness: 0.0,
        conforming_cases: 0,
        total_cases: log.traces.len(),
    };

    let mut total_fitness = 0.0;

    // Pre-build initial marking as Vec
    let mut initial_vec = vec![0usize; petri_net.places.len()];
    for (place_id, &count) in &petri_net.initial_marking {
        if let Some(&idx) = lookup.place_idx.get(place_id) {
            initial_vec[idx] = count;
        }
    }

    // Fix D — u64 bitmask fast path: ≤64 places AND unit arc weights AND
    // single-token initial marking. Nets with non-unit weights or multi-token
    // initial markings cannot be represented faithfully at 1 bit/place and
    // are routed to the Vec path (pm4py-faithful weight-aware accounting).
    let use_bitmask = uses_bitmask_engine(petri_net);

    for (case_id, trace) in log.traces.iter().enumerate() {
        let mut deviations: Vec<TokenReplayDeviation> = Vec::new();
        let mut consumed_tokens = 0usize;
        let mut produced_tokens = 0usize;
        let mut missing_tokens = 0usize;

        // ---- bitmask path ----
        if use_bitmask {
            let mut marking: u64 = 0u64;
            {
                for (place_id, &count) in &petri_net.initial_marking {
                    if count == 1 {
                        if let Some(&idx) = lookup.place_idx.get(place_id) {
                            marking |= 1u64 << idx;
                        }
                    }
                }
                // pm4py parity: no blanket eager invisible firing at start;
                // taus fire only when needed, via the per-event BFS below.

                for (event_idx, event) in trace.events.iter().enumerate() {
                    let activity = event
                        .attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string());

                    let activity_label = match activity {
                        Some(a) => a,
                        None => {
                            deviations.push(TokenReplayDeviation {
                                event_index: event_idx,
                                activity: "unknown".to_string(),
                                deviation_type: "missing_activity".to_string(),
                            });
                            continue;
                        }
                    };

                    let trans_idx = match lookup
                        .sorted_label_index
                        .binary_search_by_key(&activity_label, |(l, _)| l.as_str())
                    {
                        Ok(pos) => lookup.sorted_label_index[pos].1[0],
                        Err(_) => {
                            deviations.push(TokenReplayDeviation {
                                event_index: event_idx,
                                activity: activity_label.to_string(),
                                deviation_type: "transition_not_found".to_string(),
                            });
                            missing_tokens += 1;
                            continue;
                        }
                    };

                    let transition = &petri_net.transitions[trans_idx];
                    let inputs = lookup.transition_inputs.get(&transition.id);

                    // pm4py-parity: try to enable the target transition via a
                    // minimal sequence of invisible firings before declaring
                    // missing tokens. (Blanket greedy firing could consume
                    // tokens this transition needs.)
                    let target_in_mask = lookup.trans_in_masks[trans_idx];
                    if let Some(m2) = enable_via_invisible_bitmask(
                        &lookup.invisible_indices,
                        &lookup.trans_in_masks,
                        &lookup.trans_out_masks,
                        marking,
                        target_in_mask,
                    ) {
                        marking = m2;
                    }

                    let mut enabled = true;

                    if let Some(input_places) = inputs {
                        for (place_id, _weight) in input_places {
                            if let Some(&idx) = lookup.place_idx.get(place_id) {
                                if (marking >> idx) & 1 == 0 {
                                    enabled = false;
                                    missing_tokens += 1;
                                }
                            }
                        }
                    }

                    if !enabled {
                        deviations.push(TokenReplayDeviation {
                            event_index: event_idx,
                            activity: activity_label.to_string(),
                            deviation_type: "missing_tokens".to_string(),
                        });
                    }

                    if let Some(input_places) = inputs {
                        for (place_id, _weight) in input_places {
                            if let Some(&idx) = lookup.place_idx.get(place_id) {
                                if (marking >> idx) & 1 == 1 {
                                    marking &= !(1u64 << idx);
                                    consumed_tokens += 1;
                                }
                            }
                        }
                    }

                    if let Some(output_places) = lookup.transition_outputs.get(&transition.id) {
                        for (place_id, _weight) in output_places {
                            if let Some(&idx) = lookup.place_idx.get(place_id) {
                                marking |= 1u64 << idx;
                                produced_tokens += 1;
                            }
                        }
                    }
                    // pm4py parity: no eager invisible fixpoint after firing;
                    // the next event's BFS enables what it needs.
                }

                // pm4py token-replay parity: tokens sitting in final-marking
                // places are the ACCEPTED end state, not a deviation. Only
                // tokens in places outside the final marking count as
                // "remaining". Without a final marking, all end tokens count
                // (pm4py's behavior with no accepting marking).
                // pm4py parity: end-of-trace invisible drain toward a final
                // marking before remaining-token accounting.
                if !petri_net.final_markings.is_empty() {
                    let mut drain_target: Option<u64> = None;
                    for fm in &petri_net.final_markings {
                        let mut need = 0u64;
                        let mut forbid = 0u64;
                        for (i, place) in petri_net.places.iter().enumerate() {
                            match fm.get(&place.id) {
                                Some(&n) => {
                                    if n == 1 {
                                        need |= 1u64 << i;
                                    }
                                }
                                None => forbid |= 1u64 << i,
                            }
                        }
                        if marking & forbid == 0 && (marking & need) == need {
                            drain_target = Some(marking);
                            break;
                        }
                        // BFS: invisible firings to reach this final marking
                        if let Some(m2) = enable_via_invisible_bitmask(
                            &lookup.invisible_indices,
                            &lookup.trans_in_masks,
                            &lookup.trans_out_masks,
                            marking,
                            need,
                        ) {
                            if m2 & forbid == 0 {
                                drain_target = Some(m2);
                                break;
                            }
                        }
                    }
                    if let Some(m2) = drain_target {
                        marking = m2;
                    }
                }

                let tokens_remaining = if petri_net.final_markings.is_empty() {
                    rank_u64(marking, petri_net.places.len().saturating_sub(1))
                } else {
                    petri_net
                        .final_markings
                        .iter()
                        .map(|fm| {
                            let mut r = 0usize;
                            for (i, place) in petri_net.places.iter().enumerate() {
                                if !fm.contains_key(&place.id) && (marking >> i) & 1 == 1 {
                                    r += 1;
                                }
                            }
                            r
                        })
                        .min()
                        .unwrap_or(0)
                };

                let mut is_final_marking_reached = false;
                for final_marking in &petri_net.final_markings {
                    let mut matches = true;
                    for (place, expected) in final_marking {
                        let bit = lookup
                            .place_idx
                            .get(place)
                            .map_or(0, |&idx| (marking >> idx) & 1)
                            as usize;
                        if bit != *expected {
                            matches = false;
                            break;
                        }
                    }
                    if matches {
                        for (i, place) in petri_net.places.iter().enumerate() {
                            let bit = (marking >> i) & 1;
                            if !final_marking.contains_key(&place.id) && bit == 1 {
                                matches = false;
                                break;
                            }
                        }
                    }
                    if matches {
                        is_final_marking_reached = true;
                        break;
                    }
                }

                let c = consumed_tokens.max(1) as f64;
                let p = produced_tokens.max(1) as f64;
                let trace_fitness = (0.5 * (1.0 - missing_tokens as f64 / c)
                    + 0.5 * (1.0 - tokens_remaining as f64 / p))
                    .clamp(0.0, 1.0);

                let is_conforming = is_final_marking_reached && deviations.is_empty();
                if is_conforming {
                    result.conforming_cases += 1;
                }
                total_fitness += trace_fitness;
                result.case_fitness.push(TokenReplayResult {
                    case_id: case_id.to_string(),
                    is_conforming,
                    trace_fitness,
                    tokens_missing: missing_tokens,
                    tokens_remaining,
                    deviations,
                });
                continue; // next trace
            }
            // (use_bitmask nets always take the bitmask branch above)
        }

        // ---- Vec path (general case) ----
        let mut current_marking: Vec<usize> = initial_vec.clone();
        // pm4py parity: no eager invisible firing at start (see bitmask path).

        for (event_idx, event) in trace.events.iter().enumerate() {
            let activity = event
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string());

            let activity_label = match activity {
                Some(a) => a,
                None => {
                    deviations.push(TokenReplayDeviation {
                        event_index: event_idx,
                        activity: "unknown".to_string(),
                        deviation_type: "missing_activity".to_string(),
                    });
                    continue;
                }
            };

            let trans_idx = match lookup
                .sorted_label_index
                .binary_search_by_key(&activity_label, |(l, _)| l.as_str())
            {
                Ok(pos) => lookup.sorted_label_index[pos].1[0],
                Err(_) => {
                    deviations.push(TokenReplayDeviation {
                        event_index: event_idx,
                        activity: activity_label.to_string(),
                        deviation_type: "transition_not_found".to_string(),
                    });
                    missing_tokens += 1;
                    continue;
                }
            };

            let transition = &petri_net.transitions[trans_idx];

            let inputs = lookup.transition_inputs.get(&transition.id);

            // pm4py-parity: minimal invisible-firing search to enable the
            // target before declaring missing tokens (see bitmask path).
            if let Some(m2) = enable_via_invisible_vec(
                &lookup.invisible_indices,
                &lookup.transition_inputs,
                &lookup.transition_outputs,
                &lookup.place_idx,
                &current_marking,
                &transition.id,
            ) {
                current_marking = m2;
            }

            let mut enabled = true;

            if let Some(input_places) = inputs {
                for (place_id, weight) in input_places {
                    let available = lookup
                        .place_idx
                        .get(place_id)
                        .map_or(0, |&idx| current_marking[idx]);

                    #[cfg(feature = "bcinr")]
                    {
                        let is_short = (available < *weight) as u64;
                        let mask = bcinr::mask::select_u64(is_short, 1, 0);
                        if mask != 0 {
                            enabled = false;
                            missing_tokens += weight.saturating_sub(available);
                        }
                    }
                    #[cfg(not(feature = "bcinr"))]
                    {
                        if available < *weight {
                            enabled = false;
                            missing_tokens += weight.saturating_sub(available);
                        }
                    }
                }
            }

            if !enabled {
                deviations.push(TokenReplayDeviation {
                    event_index: event_idx,
                    activity: activity_label.to_string(),
                    deviation_type: "missing_tokens".to_string(),
                });
            }

            if let Some(input_places) = inputs {
                for (place_id, weight) in input_places {
                    if let Some(&idx) = lookup.place_idx.get(place_id) {
                        let available = current_marking[idx];
                        let consumed = available.min(*weight);
                        if consumed > 0 {
                            current_marking[idx] -= consumed;
                            consumed_tokens += consumed;
                        }
                    }
                }
            }

            if let Some(output_places) = lookup.transition_outputs.get(&transition.id) {
                for (place_id, weight) in output_places {
                    if let Some(&idx) = lookup.place_idx.get(place_id) {
                        current_marking[idx] += weight;
                        produced_tokens += weight;
                    }
                }
            }

            // pm4py parity: no eager invisible fixpoint after firing.
        }

        // pm4py parity (same convention as the bitmask path above): tokens in
        // final-marking places are the accepted end state, not "remaining".
        // pm4py parity: end-of-trace invisible drain toward a final marking
        // before remaining-token accounting (mirrors the bitmask path).
        if !petri_net.final_markings.is_empty() {
            let matches_fm = |m: &[usize], fm: &BTreeMap<String, usize>| -> bool {
                petri_net.places.iter().enumerate().all(|(i, p)| {
                    let c = m.get(i).copied().unwrap_or(0);
                    match fm.get(&p.id) {
                        Some(&n) => c == n,
                        None => c == 0,
                    }
                })
            };
            let mut drain: Option<Vec<usize>> = None;
            for fm in &petri_net.final_markings {
                if matches_fm(&current_marking, fm) {
                    drain = Some(current_marking.clone());
                    break;
                }
                if let Some(m2) = reach_final_via_invisible_vec(
                    &lookup.invisible_indices,
                    &lookup.transition_inputs,
                    &lookup.transition_outputs,
                    &lookup.place_idx,
                    &current_marking,
                    fm,
                ) {
                    drain = Some(m2);
                    break;
                }
            }
            if let Some(m2) = drain {
                current_marking = m2;
            }
        }

        let tokens_remaining: usize = if petri_net.final_markings.is_empty() {
            current_marking.iter().sum()
        } else {
            petri_net
                .final_markings
                .iter()
                .map(|fm| {
                    current_marking
                        .iter()
                        .zip(petri_net.places.iter())
                        .filter(|(_, p)| !fm.contains_key(&p.id))
                        .map(|(&c, _)| c)
                        .sum::<usize>()
                })
                .min()
                .unwrap_or(0)
        };
        let mut is_final_marking_reached = false;

        for final_marking in &petri_net.final_markings {
            let mut matches = true;
            for (place, expected_tokens) in final_marking {
                let actual = lookup
                    .place_idx
                    .get(place)
                    .map_or(0, |&idx| current_marking[idx]);
                if actual != *expected_tokens {
                    matches = false;
                    break;
                }
            }
            for (i, &actual) in current_marking.iter().enumerate() {
                let place_id = petri_net.places[i].id.clone();
                if !final_marking.contains_key(&place_id) && actual > 0 {
                    matches = false;
                    break;
                }
            }
            if matches {
                is_final_marking_reached = true;
                break;
            }
        }

        // Branchless van der Aalst fitness: max(1,denom) prevents div-by-zero,
        // then clamp to [0,1] handles the all-zero identity (0/1 terms → 0.5+0.5=1 → correct).
        let c = consumed_tokens.max(1) as f64;
        let p = produced_tokens.max(1) as f64;
        let trace_fitness = (0.5 * (1.0 - missing_tokens as f64 / c)
            + 0.5 * (1.0 - tokens_remaining as f64 / p))
            .clamp(0.0, 1.0);

        let is_conforming = is_final_marking_reached && deviations.is_empty();
        if is_conforming {
            result.conforming_cases += 1;
        }

        total_fitness += trace_fitness;

        result.case_fitness.push(TokenReplayResult {
            case_id: case_id.to_string(),
            is_conforming,
            trace_fitness,
            tokens_missing: missing_tokens,
            tokens_remaining,
            deviations,
        });
    }

    // Guard 1: Empty log returns 1.0 (vacuous truth), not 0.0
    result.avg_fitness = conformance_guards::guard_empty_log(result.total_cases, total_fitness);

    result
}

// ---------------------------------------------------------------------------
// Public API — signatures unchanged
// ---------------------------------------------------------------------------

/// Pure-Rust token-based replay: returns ConformanceResult without wasm-bindgen.
///
/// This is the testable core of `check_token_based_replay`. Integration tests
/// on native targets cannot call `#[wasm_bindgen]` functions, so they use
/// this instead and then store the result in state manually if needed.
pub fn token_replay_pure(
    log: &EventLog,
    petri_net: &PetriNet,
    activity_key: &str,
) -> ConformanceResult {
    let lookup = PetriNetLookup::build(petri_net);
    replay_log(log, petri_net, activity_key, &lookup)
}

/// Check conformance using token-based replay.
///
/// Performs actual token replay on the Petri net:
/// 1. Start with initial marking
/// 2. For each event in trace, find matching visible transition
/// 3. Check if transition is enabled (all input places have sufficient tokens)
/// 4. Fire transition (consume from input, produce to output)
/// 5. After all events, check if final marking matches any final marking
/// 6. Track consumed/produced/missing/remaining tokens
#[wasm_bindgen]
pub fn check_token_based_replay(
    eventlog_handle: &str,
    petri_net_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Clone PetriNet data for replay (sequential access, no deadlock).
    let petri_net_cloned = get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => Ok(pn.clone()),
        Some(_) => Err(crate::error::js_val("Handle is not a PetriNet")),
        None => Err(crate::error::js_val("PetriNet not found")),
    })?;

    // Build lookup once outside the EventLog closure
    let lookup = PetriNetLookup::build(&petri_net_cloned);

    // Perform conformance using borrowed EventLog — no clone.
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let result = replay_log(log, &petri_net_cloned, activity_key, &lookup);
        // Honesty field: which replay engine actually ran. `bitmask` (u64
        // fast path) only when ≤64 places, unit arc weights, and single-token
        // initial marking; otherwise the weight-aware `vec` engine. Both now
        // share invisible-transition firing semantics.
        let engine = if uses_bitmask_engine(&petri_net_cloned) {
            "bitmask"
        } else {
            "vec"
        };
        let mut value =
            serde_json::to_value(&result).map_err(|e| crate::error::js_val(&e.to_string()))?;
        if let Some(obj) = value.as_object_mut() {
            obj.insert("engine".to_string(), serde_json::json!(engine));
        }
        to_js_str(&value)
    })
}

/// Get conformance checking info
#[wasm_bindgen]
pub fn conformance_info() -> String {
    json!({
        "status": "conformance_module_operational",
        "algorithms": [
            {
                "name": "token_based_replay",
                "description": "Token-based replay conformance checking",
                "status": "implemented"
            }
        ],
        "note": "Simplified implementation for WASM"
    })
    .to_string()
}
