use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::json;
use hashbrown::HashMap;
use wasm_bindgen::prelude::*;

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
    let mut result = ConformanceResult {
        case_fitness: Vec::new(),
        avg_fitness: 0.0,
        conforming_cases: 0,
        total_cases: log.traces.len(),
    };

    let mut total_fitness = 0.0;

    // Build lookup: activity label -> transition index
    let mut activity_to_transition: HashMap<String, usize> = HashMap::new();
    for (idx, trans) in petri_net.transitions.iter().enumerate() {
        if !trans.is_invisible.unwrap_or(false) {
            activity_to_transition.insert(trans.label.clone(), idx);
        }
    }

    // Build adjacency maps for faster replay
    let mut transition_inputs: HashMap<String, Vec<(String, usize)>> = HashMap::new();
    let mut transition_outputs: HashMap<String, Vec<(String, usize)>> = HashMap::new();

    for arc in &petri_net.arcs {
        let weight = arc.weight.unwrap_or(1);
        if petri_net.transitions.iter().any(|t| t.id == arc.from) {
            transition_outputs
                .entry(arc.from.clone())
                .or_default()
                .push((arc.to.clone(), weight));
        } else {
            transition_inputs
                .entry(arc.to.clone())
                .or_default()
                .push((arc.from.clone(), weight));
        }
    }

    // Build place_idx once for Vec-based marking
    let mut place_idx: HashMap<String, usize> = HashMap::new();
    for (i, place) in petri_net.places.iter().enumerate() {
        place_idx.insert(place.id.clone(), i);
    }

    // Pre-build initial marking as Vec
    let mut initial_vec = vec![0usize; petri_net.places.len()];
    for (place_id, &count) in &petri_net.initial_marking {
        if let Some(&idx) = place_idx.get(place_id) {
            initial_vec[idx] = count;
        }
    }

    for (case_id, trace) in log.traces.iter().enumerate() {
        let mut current_marking: Vec<usize> = initial_vec.clone();

        let mut deviations: Vec<TokenReplayDeviation> = Vec::new();
        let mut consumed_tokens = 0usize;
        let mut produced_tokens = 0usize;
        let mut missing_tokens = 0usize;

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

            let trans_idx = match activity_to_transition.get(activity_label) {
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

            let inputs = transition_inputs.get(&transition.id);
            let mut enabled = true;

            if let Some(input_places) = inputs {
                for (place_id, weight) in input_places {
                    let available = place_idx
                        .get(place_id)
                        .map(|&idx| current_marking[idx])
                        .unwrap_or(0);
                    if available < *weight {
                        enabled = false;
                        missing_tokens += weight.saturating_sub(available);
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
                    if let Some(&idx) = place_idx.get(place_id) {
                        let available = current_marking[idx];
                        let consumed = available.min(*weight);
                        if consumed > 0 {
                            current_marking[idx] -= consumed;
                            consumed_tokens += consumed;
                        }
                    }
                }
            }

            if let Some(output_places) = transition_outputs.get(&transition.id) {
                for (place_id, weight) in output_places {
                    if let Some(&idx) = place_idx.get(place_id) {
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
                let actual = place_idx
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
        Some(_) => Err(JsValue::from_str("Handle is not a PetriNet")),
        None => Err(JsValue::from_str("PetriNet not found")),
    })?;

    // Perform conformance using borrowed EventLog — no clone.
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut result = ConformanceResult {
                case_fitness: Vec::new(),
                avg_fitness: 0.0,
                conforming_cases: 0,
                total_cases: log.traces.len(),
            };

            let mut total_fitness = 0.0;

            // Build lookup: activity label -> transition index
            let mut activity_to_transition: HashMap<String, usize> = HashMap::new();
            for (idx, trans) in petri_net_cloned.transitions.iter().enumerate() {
                if !trans.is_invisible.unwrap_or(false) {
                    activity_to_transition.insert(trans.label.clone(), idx);
                }
            }

            // Build adjacency maps for faster replay
            let mut transition_inputs: HashMap<String, Vec<(String, usize)>> = HashMap::new();
            let mut transition_outputs: HashMap<String, Vec<(String, usize)>> = HashMap::new();

            for arc in &petri_net_cloned.arcs {
                let weight = arc.weight.unwrap_or(1);
                if petri_net_cloned
                    .transitions
                    .iter()
                    .any(|t| t.id == arc.from)
                {
                    // Transition -> Place (output)
                    transition_outputs
                        .entry(arc.from.clone())
                        .or_default()
                        .push((arc.to.clone(), weight));
                } else {
                    // Place -> Transition (input)
                    transition_inputs
                        .entry(arc.to.clone())
                        .or_default()
                        .push((arc.from.clone(), weight));
                }
            }

            // Build place_idx once for Vec-based marking
            let mut place_idx: HashMap<String, usize> = HashMap::new();
            for (i, place) in petri_net_cloned.places.iter().enumerate() {
                place_idx.insert(place.id.clone(), i);
            }

            // Pre-build initial marking as Vec
            let mut initial_vec = vec![0usize; petri_net_cloned.places.len()];
            for (place_id, &count) in &petri_net_cloned.initial_marking {
                if let Some(&idx) = place_idx.get(place_id) {
                    initial_vec[idx] = count;
                }
            }

            for (case_id, trace) in log.traces.iter().enumerate() {
                // Start with initial marking
                let mut current_marking: Vec<usize> = initial_vec.clone();

                let mut deviations: Vec<TokenReplayDeviation> = Vec::new();
                let mut consumed_tokens = 0usize;
                let mut produced_tokens = 0usize;
                let mut missing_tokens = 0usize;

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

                    // Find matching transition
                    let trans_idx = match activity_to_transition.get(activity_label) {
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

                    let transition = &petri_net_cloned.transitions[trans_idx];

                    // Check if transition is enabled
                    let inputs = transition_inputs.get(&transition.id);
                    let mut enabled = true;
                    let mut required_tokens = 0usize;

                    if let Some(input_places) = inputs {
                        for (place_id, weight) in input_places {
                            let available = place_idx
                                .get(place_id)
                                .map(|&idx| current_marking[idx])
                                .unwrap_or(0);
                            required_tokens += weight;
                            if available < *weight {
                                enabled = false;
                                missing_tokens += weight.saturating_sub(available);
                            }
                        }
                    }

                    if !enabled {
                        deviations.push(TokenReplayDeviation {
                            event_index: event_idx,
                            activity: activity_label.to_string(),
                            deviation_type: "missing_tokens".to_string(),
                        });
                        // Still fire the transition (consume available tokens)
                    }

                    // Fire transition: consume from input places
                    if let Some(input_places) = inputs {
                        for (place_id, weight) in input_places {
                            if let Some(&idx) = place_idx.get(place_id) {
                                let available = current_marking[idx];
                                let consumed = available.min(*weight);
                                if consumed > 0 {
                                    current_marking[idx] -= consumed;
                                    consumed_tokens += consumed;
                                }
                            }
                        }
                    }

                    // Produce to output places
                    if let Some(output_places) = transition_outputs.get(&transition.id) {
                        for (place_id, weight) in output_places {
                            if let Some(&idx) = place_idx.get(place_id) {
                                current_marking[idx] += weight;
                                produced_tokens += weight;
                            }
                        }
                    }
                }

                // Check final marking against final markings
                let mut tokens_remaining = 0usize;
                let mut is_final_marking_reached = false;

                tokens_remaining = current_marking.iter().sum();

                // Check if current marking matches any final marking
                for final_marking in &petri_net_cloned.final_markings {
                    let mut matches = true;
                    for (place, expected_tokens) in final_marking {
                        let actual = place_idx
                            .get(place)
                            .map(|&idx| current_marking[idx])
                            .unwrap_or(0);
                        if actual != *expected_tokens {
                            matches = false;
                            break;
                        }
                    }
                    // Also check that we don't have extra tokens
                    for (i, &actual) in current_marking.iter().enumerate() {
                        let place_id = petri_net_cloned.places[i].id.clone();
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

                // Calculate trace fitness using van der Aalst token-replay formula
                // Branchless: max(1,denom) prevents div-by-zero, clamp ensures [0,1]
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

            to_js(&result)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
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
