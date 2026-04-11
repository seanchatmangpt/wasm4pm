use crate::models::PetriNet;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
/// Priority 5 — A* Search-based optimal alignment conformance checking.
///
/// Computes per-trace alignments against a Petri Net using A* search.
/// Each trace step is classified as:
/// - Synchronous move: trace activity matches fired transition (cost 0)
/// - Log move: activity in trace but no matching transition fired (cost 1)
/// - Model move: transition fires but no corresponding trace event (cost 1)
///
/// Uses A* search with heuristic to find optimal cost alignment.
use wasm_bindgen::prelude::*;

/// Represents a state in the A* alignment search.
#[derive(Clone, Debug, PartialEq)]
struct AlignmentState {
    trace_index: usize,              // Position in the trace (0..len)
    marking: HashMap<String, usize>, // Current marking of petri net
    cost: f64,                       // Cumulative cost to reach this state
    path: Vec<String>,               // Sequence of moves: "sync:A", "log:B", "model:C"
}

/// Wrapper for priority queue (min-heap by f_score).
#[derive(Clone)]
struct PriorityAlignmentState {
    f_score: f64,
    state: AlignmentState,
}

impl PartialEq for PriorityAlignmentState {
    fn eq(&self, other: &Self) -> bool {
        (self.f_score - other.f_score).abs() < 1e-9 && self.state == other.state
    }
}
impl Eq for PriorityAlignmentState {}
impl Ord for PriorityAlignmentState {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse for min-heap (BinaryHeap is max-heap by default)
        other
            .f_score
            .partial_cmp(&self.f_score)
            .unwrap_or(Ordering::Equal)
    }
}
impl PartialOrd for PriorityAlignmentState {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Get activities that transition can fire for.
/// For simplicity, transition label is treated as the activity name.
#[allow(dead_code)]
fn get_transition_activities(petri_net: &PetriNet, transition_id: &str) -> Vec<String> {
    petri_net
        .transitions
        .iter()
        .find(|t| t.id == transition_id)
        .map(|t| vec![t.label.clone()])
        .unwrap_or_default()
}

/// Check if a transition can fire with current marking.
fn can_fire(petri_net: &PetriNet, marking: &HashMap<String, usize>, transition_id: &str) -> bool {
    // For each arc from a place to this transition, check if place has sufficient tokens
    for arc in &petri_net.arcs {
        if arc.to == transition_id {
            let weight = arc.weight.unwrap_or(1);
            let current = marking.get(&arc.from).copied().unwrap_or(0);
            if current < weight {
                return false;
            }
        }
    }
    true
}

/// Fire a transition and compute new marking.
fn fire_transition(
    petri_net: &PetriNet,
    marking: &HashMap<String, usize>,
    transition_id: &str,
) -> Option<HashMap<String, usize>> {
    if !can_fire(petri_net, marking, transition_id) {
        return None;
    }

    let mut new_marking = marking.clone();

    // Remove tokens from input places
    for arc in &petri_net.arcs {
        if arc.to == transition_id {
            let weight = arc.weight.unwrap_or(1);
            *new_marking.entry(arc.from.clone()).or_insert(0) -= weight;
        }
    }

    // Add tokens to output places
    for arc in &petri_net.arcs {
        if arc.from == transition_id {
            let weight = arc.weight.unwrap_or(1);
            *new_marking.entry(arc.to.clone()).or_insert(0) += weight;
        }
    }

    Some(new_marking)
}

/// Heuristic: admissible (but uninformed) estimate for weighted costs.
/// Using 0 ensures A* optimality even with variable cost weights.
/// A more sophisticated heuristic would estimate remaining cost,
/// but that requires domain-specific knowledge.
fn heuristic(_trace_len: usize, _current_trace_index: usize) -> f64 {
    0.0
}

/// Compute optimal alignment for a single trace using A*.
fn compute_trace_alignment(
    trace_activities: &[String],
    petri_net: &PetriNet,
    sync_cost: f64,
    log_move_cost: f64,
    model_move_cost: f64,
) -> (f64, Vec<String>, usize, usize, usize) {
    let trace_len = trace_activities.len();
    let mut open_set = BinaryHeap::new();
    let mut closed_set = HashSet::new();

    let initial_state = AlignmentState {
        trace_index: 0,
        marking: petri_net.initial_marking.clone(),
        cost: 0.0,
        path: Vec::new(),
    };

    let h0 = heuristic(trace_len, 0);
    open_set.push(PriorityAlignmentState {
        f_score: h0,
        state: initial_state,
    });

    let mut best_solution: Option<(f64, Vec<String>, usize, usize, usize)> = None;
    let mut iterations = 0;
    let max_iterations = 100_000;

    while let Some(PriorityAlignmentState { f_score: _, state }) = open_set.pop() {
        iterations += 1;
        if iterations > max_iterations {
            break;
        }

        // Create deterministic state key by sorting marking entries
        let mut marking_vec: Vec<_> = state.marking.iter().collect();
        marking_vec.sort_by_key(|(k, _)| k.as_str());
        let state_key = (state.trace_index, format!("{:?}", marking_vec));
        if closed_set.contains(&state_key) {
            continue;
        }
        closed_set.insert(state_key);

        // Check if goal reached (all trace consumed and marking is a final marking)
        if state.trace_index == trace_len
            && (petri_net.final_markings.is_empty()
                || petri_net
                    .final_markings
                    .iter()
                    .any(|fm| fm == &state.marking))
        {
            let (sync_count, log_count, model_count) = count_moves(&state.path);
            best_solution = Some((
                state.cost,
                state.path.clone(),
                sync_count,
                log_count,
                model_count,
            ));
            break;
        }

        // Generate successors: sync, log move, model move
        let mut successors = Vec::new();

        // 1. Log move: consume next trace event without firing any transition
        if state.trace_index < trace_len {
            let activity = &trace_activities[state.trace_index];
            let mut new_path = state.path.clone();
            new_path.push(format!("log:{}", activity));
            successors.push((
                AlignmentState {
                    trace_index: state.trace_index + 1,
                    marking: state.marking.clone(),
                    cost: state.cost + log_move_cost,
                    path: new_path,
                },
                log_move_cost,
            ));
        }

        // 2. Synchronous move: fire transition matching next activity
        if state.trace_index < trace_len {
            let next_activity = &trace_activities[state.trace_index];
            for transition in &petri_net.transitions {
                if transition.label == *next_activity {
                    if let Some(new_marking) =
                        fire_transition(petri_net, &state.marking, &transition.id)
                    {
                        let mut new_path = state.path.clone();
                        new_path.push(format!("sync:{}", next_activity));
                        successors.push((
                            AlignmentState {
                                trace_index: state.trace_index + 1,
                                marking: new_marking,
                                cost: state.cost + sync_cost,
                                path: new_path,
                            },
                            sync_cost,
                        ));
                    }
                }
            }
        }

        // 3. Model move: fire any transition (invisible transitions have cost 0)
        for transition in &petri_net.transitions {
            if let Some(new_marking) = fire_transition(petri_net, &state.marking, &transition.id) {
                // Invisible transitions (empty label) or marked as invisible have cost 0
                let move_cost =
                    if transition.is_invisible.unwrap_or(false) || transition.label.is_empty() {
                        0.0
                    } else {
                        model_move_cost
                    };
                let mut new_path = state.path.clone();
                new_path.push(format!("model:{}", transition.label));
                successors.push((
                    AlignmentState {
                        trace_index: state.trace_index,
                        marking: new_marking,
                        cost: state.cost + move_cost,
                        path: new_path,
                    },
                    move_cost,
                ));
            }
        }

        // Add successors to open set
        for (succ_state, _edge_cost) in successors {
            let h = heuristic(trace_len, succ_state.trace_index);
            let f = succ_state.cost + h;
            open_set.push(PriorityAlignmentState {
                f_score: f,
                state: succ_state,
            });
        }
    }

    best_solution.unwrap_or((f64::INFINITY, vec![], 0, 0, 0))
}

fn count_moves(path: &[String]) -> (usize, usize, usize) {
    let mut sync = 0;
    let mut log = 0;
    let mut model = 0;
    for move_str in path {
        if move_str.starts_with("sync:") {
            sync += 1;
        } else if move_str.starts_with("log:") {
            log += 1;
        } else if move_str.starts_with("model:") {
            model += 1;
        }
    }
    (sync, log, model)
}

/// Compute optimal alignments for all traces in a log against a Petri Net using A*.
///
/// Returns a JSON string:
/// ```json
/// {
///   "total_traces": 10,
///   "avg_cost": 0.5,
///   "alignments": [
///     {
///       "case_id": "Case1",
///       "cost": 0.0,
///       "sync_moves": 5,
///       "log_moves": 0,
///       "model_moves": 0,
///       "path": ["sync:A", "sync:B", "model:C"]
///     }
///   ]
/// }
/// ```
#[wasm_bindgen]
pub fn compute_optimal_alignments(
    log_handle: &str,
    petri_net_handle: &str,
    activity_key: &str,
    cost_config_json: &str, // {"sync_cost": 0, "log_move_cost": 1, "model_move_cost": 1}
) -> Result<JsValue, JsValue> {
    // Parse cost config
    let cost_config: HashMap<String, f64> = serde_json::from_str(cost_config_json)
        .map_err(|_| JsValue::from_str("Invalid cost_config_json"))?;

    let sync_cost = cost_config.get("sync_cost").copied().unwrap_or(0.0);
    let log_move_cost = cost_config.get("log_move_cost").copied().unwrap_or(1.0);
    let model_move_cost = cost_config.get("model_move_cost").copied().unwrap_or(1.0);

    let petri_net = get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => Ok(pn.clone()),
        Some(_) => Err(JsValue::from_str("Handle is not a PetriNet")),
        None => Err(JsValue::from_str("PetriNet handle not found")),
    })?;

    let result_json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut alignments: Vec<serde_json::Value> = Vec::new();
            let mut total_cost = 0.0;

            for trace in &log.traces {
                let case_id = trace
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                    .unwrap_or("unknown")
                    .to_string();

                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();

                let (cost, path, sync_count, log_count, model_count) = compute_trace_alignment(
                    &acts,
                    &petri_net,
                    sync_cost,
                    log_move_cost,
                    model_move_cost,
                );

                // Only include in total if alignment was found (cost is finite)
                if cost.is_finite() {
                    total_cost += cost;
                }

                alignments.push(json!({
                    "case_id": case_id,
                    "alignment_found": cost.is_finite(),
                    "cost": if cost.is_finite() { cost } else { -1.0 }, // Use -1 as marker for no alignment
                    "sync_moves": sync_count,
                    "log_moves": log_count,
                    "model_moves": model_count,
                    "path": path,
                }));
            }

            let avg_cost = if alignments.is_empty() {
                0.0
            } else {
                total_cost / alignments.len() as f64
            };

            serde_json::to_string(&json!({
                "total_traces": log.traces.len(),
                "avg_cost": avg_cost,
                "alignments": alignments,
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&result_json))
}

/// Legacy function for backward compatibility: DFG-based alignment (greedy).
#[wasm_bindgen]
pub fn compute_alignments(
    log_handle: &str,
    dfg_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let edge_map: std::collections::HashMap<(String, String), usize> = get_or_init_state()
        .with_object(dfg_handle, |obj| match obj {
            Some(StoredObject::DirectlyFollowsGraph(dfg)) => Ok(dfg
                .edges
                .iter()
                .map(|e| ((e.from.clone(), e.to.clone()), e.frequency))
                .collect()),
            Some(_) => Err(JsValue::from_str("Handle is not a DirectlyFollowsGraph")),
            None => Err(JsValue::from_str("DFG handle not found")),
        })?;

    let start_activities: std::collections::HashSet<String> =
        get_or_init_state().with_object(dfg_handle, |obj| match obj {
            Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
                Ok(dfg.start_activities.keys().cloned().collect())
            }
            Some(_) => Err(JsValue::from_str("Handle is not a DirectlyFollowsGraph")),
            None => Err(JsValue::from_str("DFG handle not found")),
        })?;

    let result_json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut alignments: Vec<serde_json::Value> = Vec::new();

            for trace in &log.traces {
                let case_id = trace
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                    .unwrap_or("unknown")
                    .to_string();

                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();

                let mut moves: Vec<serde_json::Value> = Vec::new();
                let mut sync_count = 0usize;
                let mut log_move_count = 0usize;

                if acts.is_empty() {
                    alignments.push(json!({
                        "case_id": case_id,
                        "fitness": 1.0,
                        "moves": moves,
                    }));
                    continue;
                }

                if start_activities.is_empty() || start_activities.contains(&acts[0]) {
                    moves.push(json!({"type": "sync", "activity": acts[0]}));
                    sync_count += 1;
                } else {
                    moves.push(json!({"type": "log", "activity": acts[0]}));
                    log_move_count += 1;
                }

                for i in 1..acts.len() {
                    let edge = (acts[i - 1].clone(), acts[i].clone());
                    if edge_map.contains_key(&edge) {
                        moves.push(json!({"type": "sync", "activity": acts[i]}));
                        sync_count += 1;
                    } else {
                        moves.push(json!({"type": "log", "activity": acts[i]}));
                        log_move_count += 1;
                    }
                }

                let total_moves = sync_count + log_move_count;
                let fitness = if total_moves == 0 {
                    1.0
                } else {
                    sync_count as f64 / total_moves as f64
                };

                alignments.push(json!({
                    "case_id": case_id,
                    "fitness": fitness,
                    "moves": moves,
                }));
            }

            let avg_fitness = if alignments.is_empty() {
                1.0
            } else {
                alignments
                    .iter()
                    .map(|a| a["fitness"].as_f64().unwrap_or(1.0))
                    .sum::<f64>()
                    / alignments.len() as f64
            };

            serde_json::to_string(&json!({
                "total_traces": log.traces.len(),
                "avg_fitness": avg_fitness,
                "alignments": alignments,
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&result_json))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_moves() {
        let path = vec![
            "sync:A".to_string(),
            "sync:B".to_string(),
            "log:C".to_string(),
            "model:D".to_string(),
        ];

        let (sync, log, model) = count_moves(&path);
        assert_eq!(sync, 2);
        assert_eq!(log, 1);
        assert_eq!(model, 1);
    }

    #[test]
    fn test_count_moves_empty() {
        let path: Vec<String> = vec![];
        let (sync, log, model) = count_moves(&path);
        assert_eq!(sync, 0);
        assert_eq!(log, 0);
        assert_eq!(model, 0);
    }

    #[test]
    fn test_count_moves_only_sync() {
        let path = vec!["sync:A".to_string(), "sync:B".to_string()];
        let (sync, log, model) = count_moves(&path);
        assert_eq!(sync, 2);
        assert_eq!(log, 0);
        assert_eq!(model, 0);
    }

    #[test]
    fn test_heuristic_always_zero() {
        // The current heuristic is always 0 (admissible but uninformed)
        let h = heuristic(100, 50);
        assert_eq!(h, 0.0);
    }

    #[test]
    fn test_alignment_state_equality() {
        let state1 = AlignmentState {
            trace_index: 5,
            marking: HashMap::from([("p1".to_string(), 1)]),
            cost: 2.0,
            path: vec!["sync:A".to_string()],
        };

        let state2 = AlignmentState {
            trace_index: 5,
            marking: HashMap::from([("p1".to_string(), 1)]),
            cost: 2.0, // Same cost
            path: vec!["sync:A".to_string()],
        };

        // States with identical ALL fields are equal
        assert_eq!(state1, state2);

        let state3 = AlignmentState {
            trace_index: 5,
            marking: HashMap::from([("p1".to_string(), 1)]),
            cost: 3.0, // Different cost
            path: vec!["sync:A".to_string()],
        };

        // States with different cost are NOT equal
        assert_ne!(state1, state3);
    }
}
