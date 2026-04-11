//! Basic Petri net playout via token replay.
//!
//! Simulates token flow through a Petri net to generate valid traces.
//! Supports configurable trace length and deadlock detection.

use crate::models::{PetriNet, Trace};
use crate::state::{get_or_init_state, StoredObject};
use rand::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

/// Configuration for Petri net playout.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayoutConfig {
    pub max_trace_length: usize,
    pub num_traces: usize,
    pub random_seed: u64,
}

impl Default for PlayoutConfig {
    fn default() -> Self {
        Self {
            max_trace_length: 50,
            num_traces: 100,
            random_seed: 42,
        }
    }
}

/// Result of Petri net playout.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayoutResult {
    pub traces: Vec<Trace>,
    pub states_visited: usize,
    pub deadlocks: usize,
    pub all_complete: bool,
}

/// Execute Petri net playout via token-replay simulation.
pub fn play_petri_net(
    petri_net: &PetriNet,
    config: &PlayoutConfig,
) -> Result<PlayoutResult, String> {
    let mut rng = StdRng::seed_from_u64(config.random_seed);
    let mut traces = Vec::new();
    let mut states_visited = 0;
    let mut deadlocks = 0;

    // Build adjacency structures for efficient traversal
    let preset = build_preset(petri_net);
    let postset = build_postset(petri_net);
    let transition_labels: HashMap<_, _> = petri_net
        .transitions
        .iter()
        .filter(|t| !t.is_invisible.unwrap_or(false))
        .map(|t| (&t.id, t.label.clone()))
        .collect();

    // Generate traces
    for _ in 0..config.num_traces {
        match simulate_trace(
            petri_net,
            &preset,
            &postset,
            &transition_labels,
            &mut rng,
            config.max_trace_length,
        ) {
            Ok((trace, visited, deadlocked)) => {
                traces.push(trace);
                states_visited += visited;
                if deadlocked {
                    deadlocks += 1;
                }
            }
            Err(_) => deadlocks += 1,
        }
    }

    // Check if all traces completed successfully
    let all_complete = deadlocks == 0;

    Ok(PlayoutResult {
        traces,
        states_visited,
        deadlocks,
        all_complete,
    })
}

/// Build preset (input places) for each transition.
fn build_preset(petri_net: &PetriNet) -> HashMap<String, Vec<String>> {
    let mut preset = HashMap::new();
    for arc in &petri_net.arcs {
        if let Some(transition) = petri_net.transitions.iter().find(|t| t.id == arc.to) {
            preset
                .entry(transition.id.clone())
                .or_insert_with(Vec::new)
                .push(arc.from.clone());
        }
    }
    preset
}

/// Build postset (output places) for each transition.
fn build_postset(petri_net: &PetriNet) -> HashMap<String, Vec<String>> {
    let mut postset = HashMap::new();
    for arc in &petri_net.arcs {
        if let Some(transition) = petri_net.transitions.iter().find(|t| t.id == arc.from) {
            postset
                .entry(transition.id.clone())
                .or_insert_with(Vec::new)
                .push(arc.to.clone());
        }
    }
    postset
}

/// Simulate a single trace through the Petri net.
fn simulate_trace(
    petri_net: &PetriNet,
    preset: &HashMap<String, Vec<String>>,
    postset: &HashMap<String, Vec<String>>,
    transition_labels: &HashMap<&String, String>,
    rng: &mut StdRng,
    max_length: usize,
) -> Result<(Trace, usize, bool), String> {
    let mut marking = petri_net.initial_marking.clone();
    let mut events = Vec::new();
    let mut states_visited = 0;
    let mut steps = 0;

    while steps < max_length {
        states_visited += 1;

        // Find enabled transitions (all input places have tokens)
        let mut enabled = Vec::new();
        for transition in &petri_net.transitions {
            if transition.is_invisible.unwrap_or(false) {
                continue;
            }

            if let Some(input_places) = preset.get(&transition.id) {
                let all_have_tokens = input_places
                    .iter()
                    .all(|place_id| marking.get(place_id).copied().unwrap_or(0) > 0);

                if all_have_tokens {
                    enabled.push(&transition.id);
                }
            }
        }

        if enabled.is_empty() {
            // Check if we're in a final marking
            let is_final = petri_net.final_markings.iter().any(|final_marking| {
                final_marking
                    .iter()
                    .all(|(place, count)| marking.get(place) == Some(count))
            });

            if is_final {
                break;
            } else {
                // Deadlock - no enabled transitions but not in final marking
                return Ok((
                    Trace {
                        attributes: HashMap::new(),
                        events,
                    },
                    states_visited,
                    true,
                ));
            }
        }

        // Randomly select an enabled transition
        let selected_id = enabled[rng.gen_range(0..enabled.len())];

        // Fire the transition: consume tokens from input places, produce to output places
        if let Some(input_places) = preset.get(selected_id) {
            for place_id in input_places {
                if let Some(count) = marking.get_mut(place_id) {
                    *count = count.saturating_sub(1);
                }
            }
        }

        if let Some(output_places) = postset.get(selected_id) {
            for place_id in output_places {
                *marking.entry(place_id.clone()).or_insert(0) += 1;
            }
        }

        // Add visible transition to trace
        if let Some(label) = transition_labels.get(selected_id) {
            let mut event_attrs = HashMap::new();
            event_attrs.insert(
                "concept:name".to_string(),
                crate::models::AttributeValue::String(label.clone()),
            );
            events.push(crate::models::Event {
                attributes: event_attrs,
            });
        }

        steps += 1;
    }

    Ok((
        Trace {
            attributes: HashMap::new(),
            events,
        },
        states_visited,
        false,
    ))
}

#[wasm_bindgen]
pub fn petri_net_playout(petri_net_handle: &str, config_json: &str) -> Result<JsValue, JsValue> {
    let config: PlayoutConfig = serde_json::from_str(config_json).unwrap_or_default();

    let result: PlayoutResult =
        get_or_init_state().with_object(petri_net_handle, |obj| match obj {
            Some(StoredObject::PetriNet(petri_net)) => {
                play_petri_net(petri_net, &config).map_err(|e| JsValue::from_str(&e))
            }
            Some(_) => Err(JsValue::from_str("Handle is not a PetriNet")),
            None => Err(JsValue::from_str("PetriNet handle not found")),
        })?;

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
        .map(|s| JsValue::from_str(&s))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_simple_net() -> PetriNet {
        let mut net = PetriNet::new();

        // Create places: p1 -> t1 -> p2 -> t2 -> p3
        net.places.push(crate::models::PetriNetPlace {
            id: "p1".to_string(),
            label: "start".to_string(),
            marking: Some(1),
        });
        net.places.push(crate::models::PetriNetPlace {
            id: "p2".to_string(),
            label: "middle".to_string(),
            marking: Some(0),
        });
        net.places.push(crate::models::PetriNetPlace {
            id: "p3".to_string(),
            label: "end".to_string(),
            marking: Some(0),
        });

        net.transitions.push(crate::models::PetriNetTransition {
            id: "t1".to_string(),
            label: "A".to_string(),
            is_invisible: Some(false),
        });
        net.transitions.push(crate::models::PetriNetTransition {
            id: "t2".to_string(),
            label: "B".to_string(),
            is_invisible: Some(false),
        });

        // Arcs: p1 -> t1 -> p2 -> t2 -> p3
        net.arcs.push(crate::models::PetriNetArc {
            from: "p1".to_string(),
            to: "t1".to_string(),
            weight: Some(1),
        });
        net.arcs.push(crate::models::PetriNetArc {
            from: "t1".to_string(),
            to: "p2".to_string(),
            weight: Some(1),
        });
        net.arcs.push(crate::models::PetriNetArc {
            from: "p2".to_string(),
            to: "t2".to_string(),
            weight: Some(1),
        });
        net.arcs.push(crate::models::PetriNetArc {
            from: "t2".to_string(),
            to: "p3".to_string(),
            weight: Some(1),
        });

        net.initial_marking.insert("p1".to_string(), 1);
        net.final_markings.push({
            let mut m = HashMap::new();
            m.insert("p3".to_string(), 1);
            m
        });

        net
    }

    #[test]
    fn test_simple_net_playout() {
        let net = create_simple_net();
        let config = PlayoutConfig {
            max_trace_length: 10,
            num_traces: 5,
            random_seed: 42,
        };

        let result = play_petri_net(&net, &config).unwrap();
        assert_eq!(result.traces.len(), 5);
        assert!(result.all_complete);
        assert_eq!(result.deadlocks, 0);

        // Each trace should have exactly 2 events (A, B)
        for trace in &result.traces {
            assert_eq!(trace.events.len(), 2);
        }
    }

    #[test]
    fn test_deadlock_detection() {
        let mut net = create_simple_net();

        // Remove final marking to force deadlock
        net.final_markings.clear();

        let config = PlayoutConfig {
            max_trace_length: 10,
            num_traces: 1,
            random_seed: 42,
        };

        let result = play_petri_net(&net, &config).unwrap();
        assert!(!result.all_complete);
        assert_eq!(result.deadlocks, 1);
    }
}
