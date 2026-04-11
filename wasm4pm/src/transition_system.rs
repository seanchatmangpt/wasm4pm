// pictl – Process Mining in TypeScript and WASM
// Copyright (C) 2024-2025 Sean Chatman
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! Transition system discovery from event logs.
//!
//! A transition system is a state machine that captures all observed
//! behavior in an event log. Each state represents a "view" of the trace
//! (a window of recent activities), and transitions represent activity
//! executions that move between states.

use crate::error::{codes, wasm_err};
use crate::models::EventLog;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// A state in the transition system.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TSState {
    /// Unique state identifier.
    pub id: usize,
    /// The activity sequence that defines this state (window of activities).
    pub name: String,
}

/// A transition between states.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TSTransition {
    /// Source state ID.
    pub from_state: usize,
    /// Target state ID.
    pub to_state: usize,
    /// Activity label that triggered this transition.
    pub activity: String,
    /// Number of times this transition occurs.
    pub count: usize,
}

/// A transition system with initial and final state tracking.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TransitionSystem {
    /// All states in the system.
    pub states: Vec<TSState>,
    /// All transitions in the system.
    pub transitions: Vec<TSTransition>,
    /// Mapping from state name to state ID.
    pub state_map: FxHashMap<String, usize>,
    /// Initial state ID (first state encountered).
    pub initial_state: Option<usize>,
    /// Final state IDs (states at the end of traces).
    pub final_states: HashSet<usize>,
}

/// Core algorithm: discover a transition system from an event log.
///
/// Ports `pm4py.algo.discovery.transition_system.algorithm.apply()`.
///
/// The algorithm builds a state machine where:
/// - Each state is defined by a "view" (window of recent activities)
/// - Transitions represent activity executions
///
/// # Arguments
/// * `log` - Event log to analyze
/// * `activity_key` - Key to extract activity name from event attributes
/// * `window` - Size of the lookback window (default: 2)
/// * `direction` - "forward" (default) or "backward" direction
///
/// # Returns
/// Transition system with states, transitions, initial state, and final states
pub fn discover_transition_system(
    log: &EventLog,
    activity_key: &str,
    window: usize,
    direction: &str,
) -> TransitionSystem {
    let mut states: Vec<TSState> = Vec::new();
    let mut transitions: Vec<TSTransition> = Vec::new();
    let mut state_map: FxHashMap<String, usize> = FxHashMap::default();
    let mut transition_map: FxHashMap<(usize, usize, String), usize> = FxHashMap::default();
    let mut initial_state: Option<usize> = None;
    let mut final_states: HashSet<usize> = HashSet::default();

    let is_forward = direction == "forward";

    for trace in &log.traces {
        // Extract activity names from event attributes
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(|s| s.to_owned())
            })
            .collect();

        if activities.is_empty() {
            continue;
        }

        // Build states based on window
        let mut current_state_id: Option<usize> = None;

        for i in 0..activities.len() {
            let start = i.saturating_sub(window);
            let state_activities: Vec<&str> = if is_forward {
                activities[start..=i].iter().map(|s| s.as_str()).collect()
            } else {
                activities[i..=(i + window).min(activities.len() - 1)]
                    .iter()
                    .map(|s| s.as_str())
                    .collect()
            };

            let state_name = state_activities.join(", ");

            // Get or create state
            let state_id = if let Some(&id) = state_map.get(&state_name) {
                id
            } else {
                let id = states.len();
                states.push(TSState {
                    id,
                    name: state_name.clone(),
                });
                state_map.insert(state_name, id);
                id
            };

            // Track first state encountered as initial state
            if initial_state.is_none() {
                initial_state = Some(state_id);
            }

            // Add transition from previous state
            if let Some(prev_id) = current_state_id {
                if i > 0 {
                    let activity = activities[i].clone();
                    let key = (prev_id, state_id, activity.clone());

                    *transition_map.entry(key).or_insert(0) += 1;
                }
            }

            current_state_id = Some(state_id);
        }

        // Track final state (last state in this trace)
        if let Some(last_id) = current_state_id {
            final_states.insert(last_id);
        }
    }

    // Convert transition map to transitions
    for ((from_state, to_state, activity), count) in transition_map {
        transitions.push(TSTransition {
            from_state,
            to_state,
            activity,
            count,
        });
    }

    TransitionSystem {
        states,
        transitions,
        state_map,
        initial_state,
        final_states,
    }
}

/// WASM export: discover a transition system from an event log handle.
///
/// # Arguments
/// * `eventlog_handle` - Handle to the stored EventLog object
/// * `activity_key` - Key to extract activity name from event attributes (default: "concept:name")
/// * `window` - Size of the lookback window (default: 2)
/// * `direction` - "forward" (default) or "backward" direction
///
/// # Returns
/// JSON object with:
/// - `states`: list of {id, name} state objects
/// - `transitions`: list of {from_state, to_state, activity, count} transition objects
/// - `initial_state`: ID of the initial state (or null)
/// - `final_states`: list of final state IDs
#[wasm_bindgen]
pub fn discover_transition_system_from_handle(
    eventlog_handle: &str,
    activity_key: &str,
    window: usize,
    direction: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let ts = discover_transition_system(log, activity_key, window, direction);

            // Convert to output format
            let final_states_vec: Vec<usize> = ts.final_states.iter().copied().collect();

            let output = serde_json::json!({
                "states": ts.states,
                "transitions": ts.transitions,
                "initial_state": ts.initial_state,
                "final_states": final_states_vec,
            });

            to_js(&output)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, "EventLog not found")),
    })
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, Trace};
    use std::collections::HashMap;

    fn create_test_log() -> EventLog {
        EventLog {
            attributes: HashMap::new(),
            traces: vec![
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        Event {
                            attributes: {
                                let mut map = HashMap::new();
                                map.insert(
                                    "concept:name".to_string(),
                                    AttributeValue::String("A".to_string()),
                                );
                                map
                            },
                        },
                        Event {
                            attributes: {
                                let mut map = HashMap::new();
                                map.insert(
                                    "concept:name".to_string(),
                                    AttributeValue::String("B".to_string()),
                                );
                                map
                            },
                        },
                        Event {
                            attributes: {
                                let mut map = HashMap::new();
                                map.insert(
                                    "concept:name".to_string(),
                                    AttributeValue::String("C".to_string()),
                                );
                                map
                            },
                        },
                    ],
                },
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        Event {
                            attributes: {
                                let mut map = HashMap::new();
                                map.insert(
                                    "concept:name".to_string(),
                                    AttributeValue::String("A".to_string()),
                                );
                                map
                            },
                        },
                        Event {
                            attributes: {
                                let mut map = HashMap::new();
                                map.insert(
                                    "concept:name".to_string(),
                                    AttributeValue::String("B".to_string()),
                                );
                                map
                            },
                        },
                    ],
                },
            ],
        }
    }

    #[test]
    fn test_transition_system_simple() {
        let log = create_test_log();
        let ts = discover_transition_system(&log, "concept:name", 2, "forward");

        assert!(!ts.states.is_empty());
        assert!(!ts.transitions.is_empty());
        assert!(ts.initial_state.is_some());
        assert!(!ts.final_states.is_empty());
    }

    #[test]
    fn test_transition_system_window_size() {
        let log = create_test_log();
        let ts_small = discover_transition_system(&log, "concept:name", 1, "forward");
        let ts_large = discover_transition_system(&log, "concept:name", 3, "forward");

        // Larger window should create fewer states (more activities fit in each state)
        assert!(ts_large.states.len() <= ts_small.states.len());
    }

    #[test]
    fn test_transition_system_backward_direction() {
        let log = create_test_log();
        let ts_forward = discover_transition_system(&log, "concept:name", 2, "forward");
        let ts_backward = discover_transition_system(&log, "concept:name", 2, "backward");

        // Both should produce valid transition systems
        assert!(!ts_forward.states.is_empty());
        assert!(!ts_backward.states.is_empty());
    }

    #[test]
    fn test_transition_system_empty_log() {
        let log = EventLog {
            attributes: HashMap::new(),
            traces: vec![],
        };
        let ts = discover_transition_system(&log, "concept:name", 2, "forward");

        assert!(ts.states.is_empty());
        assert!(ts.transitions.is_empty());
        assert!(ts.initial_state.is_none());
        assert!(ts.final_states.is_empty());
    }

    #[test]
    fn test_transition_system_trace_with_no_activities() {
        let log = EventLog {
            attributes: HashMap::new(),
            traces: vec![Trace {
                attributes: HashMap::new(),
                events: vec![Event {
                    attributes: HashMap::new(), // No concept:name key
                }],
            }],
        };
        let ts = discover_transition_system(&log, "concept:name", 2, "forward");

        // Empty trace should be skipped
        assert!(ts.states.is_empty());
        assert!(ts.transitions.is_empty());
    }
}
