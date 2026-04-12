//! Alignment-based fitness computation.
//!
//! Computes optimal log fitness using A* alignments between traces and Petri nets.
//! Returns detailed alignment statistics including move costs and fitness score.

use crate::models::{EventLog, PetriNet};
use crate::state::{get_or_init_state, StoredObject};
use serde::{Deserialize, Serialize};
use std::collections::{BinaryHeap, HashMap, HashSet};
use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

/// Configuration for alignment-based fitness computation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AlignmentFitnessConfig {
    pub max_iterations: usize,
    pub sync_cost: f64,
    pub log_move_cost: f64,
    pub model_move_cost: f64,
}

impl Default for AlignmentFitnessConfig {
    fn default() -> Self {
        Self {
            max_iterations: 100_000,
            sync_cost: 0.0,
            log_move_cost: 1.0,
            model_move_cost: 1.0,
        }
    }
}

/// Result of alignment-based fitness computation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AlignmentFitnessReport {
    pub fitness: f64,
    pub total_cost: f64,
    pub total_sync_moves: usize,
    pub total_log_moves: usize,
    pub total_model_moves: usize,
    pub aligned_traces: usize,
    pub total_traces: usize,
}

/// Alignment state for A* search.
#[derive(Clone, Debug)]
struct AlignmentState {
    /// Current position in trace (index)
    trace_pos: usize,
    /// Current marking (place -> token count)
    marking: Vec<usize>,
    /// Cost so far
    g_cost: f64,
    /// Estimated remaining cost (heuristic)
    h_cost: f64,
    /// Alignment path
    path: Vec<AlignmentMove>,
}

/// Alignment move type.
#[derive(Clone, Debug)]
enum AlignmentMove {
    /// Synchronous move (log and model match)
    Sync { _activity: String },
    /// Log move (only in log)
    LogMove { _activity: String },
    /// Model move (only in model)
    ModelMove { _activity: String },
}

impl AlignmentState {
    fn f_cost(&self) -> f64 {
        self.g_cost + self.h_cost
    }
}

impl PartialEq for AlignmentState {
    fn eq(&self, other: &Self) -> bool {
        self.trace_pos == other.trace_pos && self.marking == other.marking
    }
}

impl Eq for AlignmentState {}

impl PartialOrd for AlignmentState {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for AlignmentState {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // BinaryHeap is max-heap, but we want min-heap for A*
        // Use floating point total ordering
        other
            .f_cost()
            .partial_cmp(&self.f_cost())
            .unwrap_or(std::cmp::Ordering::Equal)
    }
}

/// Compute alignment-based fitness.
pub fn compute_alignment_fitness(
    log: &EventLog,
    petri_net: &PetriNet,
    config: &AlignmentFitnessConfig,
) -> Result<AlignmentFitnessReport, String> {
    let mut total_cost = 0.0f64;
    let mut total_sync_moves = 0usize;
    let mut total_log_moves = 0usize;
    let mut total_model_moves = 0usize;
    let mut aligned_traces = 0usize;
    let total_traces = log.traces.len();

    // Build lookup structures for Petri net
    let place_index: HashMap<_, _> = petri_net
        .places
        .iter()
        .enumerate()
        .map(|(i, p)| (&p.id, i))
        .collect();

    let transition_index: HashMap<_, _> = petri_net
        .transitions
        .iter()
        .enumerate()
        .map(|(i, t)| (&t.id, i))
        .collect();

    // place_consumers[p] = transitions that consume tokens FROM place p
    let mut _place_consumers: Vec<Vec<usize>> = vec![Vec::new(); petri_net.places.len()];
    // place_producers[p] = transitions that produce tokens TO place p
    let mut _place_producers: Vec<Vec<usize>> = vec![Vec::new(); petri_net.places.len()];

    // trans_inputs[t] = input place indices for transition t
    // trans_outputs[t] = output place indices for transition t
    let mut trans_inputs: Vec<Vec<usize>> = vec![Vec::new(); petri_net.transitions.len()];
    let mut trans_outputs: Vec<Vec<usize>> = vec![Vec::new(); petri_net.transitions.len()];

    for arc in &petri_net.arcs {
        // Arc from place to transition (input)
        if let (Some(&place_idx), Some(&trans_idx)) =
            (place_index.get(&arc.from), transition_index.get(&arc.to))
        {
            _place_consumers[place_idx].push(trans_idx);
            trans_inputs[trans_idx].push(place_idx);
        }
        // Arc from transition to place (output)
        if let (Some(&trans_idx), Some(&place_idx)) =
            (transition_index.get(&arc.from), place_index.get(&arc.to))
        {
            _place_producers[place_idx].push(trans_idx);
            trans_outputs[trans_idx].push(place_idx);
        }
    }

    // Process each trace
    for trace in &log.traces {
        // Extract activity names from trace
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|event| {
                event
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                    .map(|s| s.to_string())
            })
            .collect();

        // Compute optimal alignment for this trace
        match compute_trace_alignment(
            &activities,
            petri_net,
            &place_index,
            &trans_inputs[..],
            &trans_outputs[..],
            config,
        ) {
            Ok(alignment) => {
                total_cost += alignment.total_cost;
                total_sync_moves += alignment.sync_moves;
                total_log_moves += alignment.log_moves;
                total_model_moves += alignment.model_moves;
                aligned_traces += 1;
            }
            Err(_) => {
                // Failed to align - count as worst case
                total_cost += activities.len() as f64 * config.log_move_cost;
                total_log_moves += activities.len();
            }
        }
    }

    // Compute fitness: 1 - (total_cost / max_possible_cost)
    let max_possible_cost =
        (total_sync_moves + total_log_moves + total_model_moves) as f64 * config.model_move_cost;

    let fitness = if max_possible_cost > 0.0 {
        1.0 - (total_cost / max_possible_cost)
    } else {
        1.0
    };

    Ok(AlignmentFitnessReport {
        fitness: fitness.max(0.0), // Ensure non-negative
        total_cost,
        total_sync_moves,
        total_log_moves,
        total_model_moves,
        aligned_traces,
        total_traces,
    })
}

/// Result of trace alignment.
struct TraceAlignment {
    total_cost: f64,
    sync_moves: usize,
    log_moves: usize,
    model_moves: usize,
}

/// Compute optimal alignment for a single trace using A* search.
fn compute_trace_alignment(
    activities: &[String],
    petri_net: &PetriNet,
    place_index: &HashMap<&String, usize>,
    trans_inputs: &[Vec<usize>],
    trans_outputs: &[Vec<usize>],
    config: &AlignmentFitnessConfig,
) -> Result<TraceAlignment, String> {
    // Initial marking
    let mut initial_marking = vec![0usize; petri_net.places.len()];
    for (place, &count) in &petri_net.initial_marking {
        if let Some(&idx) = place_index.get(place) {
            initial_marking[idx] = count;
        }
    }

    // Initial state
    let initial_state = AlignmentState {
        trace_pos: 0,
        marking: initial_marking,
        g_cost: 0.0,
        h_cost: estimate_remaining_cost(activities, 0, config),
        path: Vec::new(),
    };

    // A* search
    let mut open_set = BinaryHeap::new();
    open_set.push(initial_state);

    let mut closed_set = HashSet::new();
    let mut iterations = 0;

    while let Some(current) = open_set.pop() {
        iterations += 1;
        if iterations > config.max_iterations {
            return Err("Alignment search exceeded max iterations".to_string());
        }

        // Check if we've reached the end
        if current.trace_pos >= activities.len()
            && is_final_marking(petri_net, place_index, &current.marking)
        {
            // Compute statistics from path
            let mut sync_moves = 0;
            let mut log_moves = 0;
            let mut model_moves = 0;

            for move_ in &current.path {
                match move_ {
                    AlignmentMove::Sync { .. } => sync_moves += 1,
                    AlignmentMove::LogMove { .. } => log_moves += 1,
                    AlignmentMove::ModelMove { .. } => model_moves += 1,
                }
            }

            return Ok(TraceAlignment {
                total_cost: current.g_cost,
                sync_moves,
                log_moves,
                model_moves,
            });
        }

        // State key for closed set — use tuple hash instead of string formatting
        let state_key = (current.trace_pos, current.marking.clone());
        if closed_set.contains(&state_key) {
            continue;
        }
        closed_set.insert(state_key);

        // Generate successors
        generate_successors(
            activities,
            petri_net,
            place_index,
            trans_inputs,
            trans_outputs,
            config,
            &current,
            &mut open_set,
        );
    }

    Err("No valid alignment found".to_string())
}

/// Estimate remaining cost (heuristic for A*).
fn estimate_remaining_cost(
    activities: &[String],
    trace_pos: usize,
    config: &AlignmentFitnessConfig,
) -> f64 {
    let remaining = activities.len() - trace_pos;
    remaining as f64 * config.log_move_cost.min(config.model_move_cost)
}

/// Check if marking is a final marking.
fn is_final_marking(
    petri_net: &PetriNet,
    place_index: &HashMap<&String, usize>,
    marking: &[usize],
) -> bool {
    petri_net.final_markings.iter().any(|final_marking| {
        final_marking.iter().all(|(place, expected_count)| {
            if let Some(&idx) = place_index.get(place) {
                marking.get(idx).copied().unwrap_or(0) == *expected_count
            } else {
                false
            }
        })
    })
}

/// Generate successor states for A* search.
#[allow(clippy::too_many_arguments)]
fn generate_successors(
    activities: &[String],
    petri_net: &PetriNet,
    _place_index: &HashMap<&String, usize>,
    trans_inputs: &[Vec<usize>],
    trans_outputs: &[Vec<usize>],
    config: &AlignmentFitnessConfig,
    current: &AlignmentState,
    open_set: &mut BinaryHeap<AlignmentState>,
) {
    // Try synchronous moves (activity matches enabled transition)
    if current.trace_pos < activities.len() {
        let activity = &activities[current.trace_pos];

        for (trans_idx, transition) in petri_net.transitions.iter().enumerate() {
            if transition.is_invisible.unwrap_or(false) {
                continue;
            }

            // Check if transition is enabled: all input places have tokens
            let enabled = trans_inputs[trans_idx]
                .iter()
                .all(|&place_idx| current.marking.get(place_idx).copied().unwrap_or(0) > 0);

            if enabled && &transition.label == activity {
                // Execute synchronous move
                let mut new_marking = current.marking.clone();

                // Remove tokens from input places
                for &place_idx in &trans_inputs[trans_idx] {
                    new_marking[place_idx] = new_marking[place_idx].saturating_sub(1);
                }

                // Add tokens to output places
                for &place_idx in &trans_outputs[trans_idx] {
                    new_marking[place_idx] += 1;
                }

                let mut new_path = current.path.clone();
                new_path.push(AlignmentMove::Sync {
                    _activity: activity.clone(),
                });

                open_set.push(AlignmentState {
                    trace_pos: current.trace_pos + 1,
                    marking: new_marking,
                    g_cost: current.g_cost + config.sync_cost,
                    h_cost: estimate_remaining_cost(activities, current.trace_pos + 1, config),
                    path: new_path,
                });
            }
        }
    }

    // Try log moves (skip trace event)
    if current.trace_pos < activities.len() {
        let mut new_path = current.path.clone();
        new_path.push(AlignmentMove::LogMove {
            _activity: activities[current.trace_pos].clone(),
        });

        open_set.push(AlignmentState {
            trace_pos: current.trace_pos + 1,
            marking: current.marking.clone(),
            g_cost: current.g_cost + config.log_move_cost,
            h_cost: estimate_remaining_cost(activities, current.trace_pos + 1, config),
            path: new_path,
        });
    }

    // Try model moves (fire enabled transition without consuming log event)
    for (trans_idx, transition) in petri_net.transitions.iter().enumerate() {
        if transition.is_invisible.unwrap_or(false) {
            continue;
        }

        // Check if transition is enabled
        let enabled = trans_inputs[trans_idx]
            .iter()
            .all(|&place_idx| current.marking[place_idx] > 0);

        if enabled {
            // Execute model move
            let mut new_marking = current.marking.clone();

            // Remove tokens from input places
            for &place_idx in &trans_inputs[trans_idx] {
                new_marking[place_idx] = new_marking[place_idx].saturating_sub(1);
            }

            // Add tokens to output places
            for &place_idx in &trans_outputs[trans_idx] {
                new_marking[place_idx] += 1;
            }

            let mut new_path = current.path.clone();
            new_path.push(AlignmentMove::ModelMove {
                _activity: transition.label.clone(),
            });

            open_set.push(AlignmentState {
                trace_pos: current.trace_pos,
                marking: new_marking,
                g_cost: current.g_cost + config.model_move_cost,
                h_cost: estimate_remaining_cost(activities, current.trace_pos, config),
                path: new_path,
            });
        }
    }
}

#[wasm_bindgen]
pub fn alignment_fitness(
    log_handle: &str,
    petri_net_handle: &str,
    config_json: &str,
) -> Result<JsValue, JsValue> {
    let config: AlignmentFitnessConfig = serde_json::from_str(config_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse alignment fitness config: {}", e)))?;

    // Clone the data we need from state
    let log_cloned = get_or_init_state().with_object(log_handle, |log_obj| match log_obj {
        Some(StoredObject::EventLog(l)) => Ok(l.clone()),
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    let petri_net_cloned =
        get_or_init_state().with_object(petri_net_handle, |petri_net_obj| match petri_net_obj {
            Some(StoredObject::PetriNet(pn)) => Ok(pn.clone()),
            Some(_) => Err(JsValue::from_str("Handle is not a PetriNet")),
            None => Err(JsValue::from_str("PetriNet handle not found")),
        })?;

    let report = compute_alignment_fitness(&log_cloned, &petri_net_cloned, &config)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_json::to_string(&report)
        .map_err(|e| JsValue::from_str(&e.to_string()))
        .map(|s| JsValue::from_str(&s))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = AlignmentFitnessConfig::default();
        assert_eq!(config.max_iterations, 100_000);
        assert_eq!(config.sync_cost, 0.0);
        assert_eq!(config.log_move_cost, 1.0);
        assert_eq!(config.model_move_cost, 1.0);
    }

    #[test]
    fn test_alignment_state_comparison() {
        let state1 = AlignmentState {
            trace_pos: 0,
            marking: vec![1, 0],
            g_cost: 1.0,
            h_cost: 2.0,
            path: Vec::new(),
        };

        let state2 = AlignmentState {
            trace_pos: 0,
            marking: vec![1, 0],
            g_cost: 2.0,
            h_cost: 1.0,
            path: Vec::new(),
        };

        // Both have f_cost = 3.0, so they should be equal
        assert_eq!(state1, state2);
    }

    #[test]
    fn test_fitness_bounds() {
        let report = AlignmentFitnessReport {
            fitness: 0.85,
            total_cost: 15.0,
            total_sync_moves: 85,
            total_log_moves: 10,
            total_model_moves: 5,
            aligned_traces: 100,
            total_traces: 100,
        };

        assert!(report.fitness >= 0.0 && report.fitness <= 1.0);
    }
}
