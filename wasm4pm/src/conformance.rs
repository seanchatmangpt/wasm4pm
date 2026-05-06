use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use hashbrown::{HashMap, HashSet};
use serde_json::json;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Fix C — shared lookup struct: eliminates duplicated HashMap-building code
// ---------------------------------------------------------------------------

struct PetriNetLookup {
    /// visible activity label → transition index
    activity_to_transition: HashMap<String, usize>,
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
        let mut activity_to_transition: HashMap<String, usize> =
            HashMap::with_capacity(petri_net.transitions.len());
        let mut transition_inputs: HashMap<String, Vec<(String, usize)>> =
            HashMap::with_capacity(petri_net.arcs.len());
        let mut transition_outputs: HashMap<String, Vec<(String, usize)>> =
            HashMap::with_capacity(petri_net.arcs.len());
        let mut place_idx: HashMap<String, usize> =
            HashMap::with_capacity(petri_net.places.len());

        for (idx, trans) in petri_net.transitions.iter().enumerate() {
            if !trans.is_invisible.unwrap_or(false) {
                activity_to_transition.insert(trans.label.clone(), idx);
            }
        }

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

        PetriNetLookup {
            activity_to_transition,
            transition_inputs,
            transition_outputs,
            place_idx,
        }
    }
}

// ---------------------------------------------------------------------------
// Core replay logic (shared by token_replay_pure and check_token_based_replay)
// ---------------------------------------------------------------------------

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

    // Fix D — u64 bitmask fast path for ≤64 places
    let use_bitmask = petri_net.places.len() <= 64;

    for (case_id, trace) in log.traces.iter().enumerate() {
        let mut deviations: Vec<TokenReplayDeviation> = Vec::new();
        let mut consumed_tokens = 0usize;
        let mut produced_tokens = 0usize;
        let mut missing_tokens = 0usize;

        // ---- bitmask path ----
        if use_bitmask {
            let mut marking: u64 = 0u64;
            // Load initial marking into bitmask (each place holds 0 or 1 token for
            // the bitmask path; multi-token places fall back via the Vec path above).
            // We only use the bitmask when every initial count is ≤ 1.
            let all_single = petri_net
                .initial_marking
                .values()
                .all(|&c| c <= 1)
                && petri_net
                    .arcs
                    .iter()
                    .all(|a| a.weight.unwrap_or(1) == 1);

            if all_single {
                for (place_id, &count) in &petri_net.initial_marking {
                    if count == 1 {
                        if let Some(&idx) = lookup.place_idx.get(place_id) {
                            marking |= 1u64 << idx;
                        }
                    }
                }

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

                    let trans_idx = match lookup.activity_to_transition.get(activity_label) {
                        Some(&idx) => idx,
                        None => {
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
                }

                let tokens_remaining = marking.count_ones() as usize;

                let mut is_final_marking_reached = false;
                for final_marking in &petri_net.final_markings {
                    let mut matches = true;
                    for (place, expected) in final_marking {
                        let bit = lookup
                            .place_idx
                            .get(place)
                            .map(|&idx| (marking >> idx) & 1)
                            .unwrap_or(0) as usize;
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
            // fall through to Vec path if not all_single
        }

        // ---- Vec path (general case) ----
        let mut current_marking: Vec<usize> = initial_vec.clone();

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

            let trans_idx = match lookup.activity_to_transition.get(activity_label) {
                Some(&idx) => idx,
                None => {
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
            let mut enabled = true;

            if let Some(input_places) = inputs {
                for (place_id, weight) in input_places {
                    let available = lookup
                        .place_idx
                        .get(place_id)
                        .map(|&idx| current_marking[idx])
                        .unwrap_or(0);

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
        }

        let tokens_remaining: usize = current_marking.iter().sum();
        let mut is_final_marking_reached = false;

        for final_marking in &petri_net.final_markings {
            let mut matches = true;
            for (place, expected_tokens) in final_marking {
                let actual = lookup
                    .place_idx
                    .get(place)
                    .map(|&idx| current_marking[idx])
                    .unwrap_or(0);
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

    result.avg_fitness = if result.total_cases > 0 {
        total_fitness / result.total_cases as f64
    } else {
        0.0
    };

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
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let result = replay_log(log, &petri_net_cloned, activity_key, &lookup);
            to_js_str(&result)
        }
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
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
