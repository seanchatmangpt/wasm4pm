// PM4Py – A Process Mining Library for Python (POWL v2 WASM)
// Copyright (C) 2024 Process Intelligence Solutions
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

//! Generalization quality metric for process models.
//!
//! **Reference**: Buijs, J. C. A. M., van der Aalst, W. M. P., et al. (2012).
//! "A Genetic Perspective on Process Discovery: Towards Quality-Aware Process Mining."
//! International Journal of Business Process Integration and Management, 1(2), 63-76.
//! DOI: 10.1504/IJBPIM.2012.048807
//!
//! Measures how well a Petri net generalises to unseen behaviour, avoiding
//! overfitting to the observed log. The algorithm mirrors the pm4py
//! token-based generalization: transitions that fire rarely or not at all
//! contribute a penalty of `1 / sqrt(count)`. A model where every transition
//! fires frequently scores close to 1.0; a model with many unused transitions
//! scores close to 0.0.

use crate::error::{codes, wasm_err};
use crate::models::{EventLog, PetriNet};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ─── Public types ───────────────────────────────────────────────────────────

/// Quality metrics for a process model evaluated against an event log.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QualityMetrics {
    /// Generalization score in [0, 1].
    pub generalization: f64,
    /// Number of places in the model.
    pub num_places: usize,
    /// Number of transitions in the model.
    pub num_transitions: usize,
    /// Number of visible transitions (non-silent).
    pub num_visible_transitions: usize,
    /// Number of arcs in the model.
    pub num_arcs: usize,
    /// Sum of penalties applied (for debugging).
    pub penalty: f64,
}

/// Simplified Petri net structure for token replay.
///
/// Uses integer IDs for efficient marking updates during replay.
#[derive(Debug, Clone)]
struct ReplayNet {
    /// Place ID -> token count
    marking: Vec<u32>,
    /// Transition ID -> (label, preset place IDs, postset place IDs)
    transitions: Vec<(Option<String>, Vec<usize>, Vec<usize>)>,
    /// Label -> list of transition IDs with that label
    label_to_transitions: FxHashMap<String, Vec<usize>>,
    /// Initial marking (cloned for each trace replay)
    initial_marking: Vec<u32>,
}

impl ReplayNet {
    /// Build a replay network from a pictl PetriNet.
    fn from_petri_net(net: &PetriNet) -> Result<Self, JsValue> {
        // Build place ID mapping
        let mut place_ids: FxHashMap<String, usize> = FxHashMap::default();
        for (i, place) in net.places.iter().enumerate() {
            place_ids.insert(place.id.clone(), i);
        }

        let num_places = net.places.len();
        let mut transitions: Vec<(Option<String>, Vec<usize>, Vec<usize>)> = Vec::new();
        let mut label_to_transitions: FxHashMap<String, Vec<usize>> = FxHashMap::default();

        // Build transition data
        for (trans_id, trans) in net.transitions.iter().enumerate() {
            // Silent transitions have is_invisible = Some(true)
            let label = if trans.is_invisible.unwrap_or(false) {
                None // Silent transition
            } else {
                Some(trans.label.clone())
            };

            // Find preset (places with arcs to this transition)
            let mut preset: Vec<usize> = Vec::new();
            for arc in &net.arcs {
                if arc.to == trans.id {
                    if let Some(&pid) = place_ids.get(&arc.from) {
                        preset.push(pid);
                    }
                }
            }

            // Find postset (places with arcs from this transition)
            let mut postset: Vec<usize> = Vec::new();
            for arc in &net.arcs {
                if arc.from == trans.id {
                    if let Some(&pid) = place_ids.get(&arc.to) {
                        postset.push(pid);
                    }
                }
            }

            transitions.push((label.clone(), preset, postset));

            // Map label to transition ID for visible transitions
            if let Some(ref lbl) = label {
                label_to_transitions
                    .entry(lbl.clone())
                    .or_default()
                    .push(trans_id);
            }
        }

        // Build initial marking
        let mut initial_marking: Vec<u32> = vec![0; num_places];
        for (place_id, &count) in &net.initial_marking {
            if let Some(&pid) = place_ids.get(place_id) {
                initial_marking[pid] = count as u32;
            }
        }

        // Build final marking (use first final marking if multiple exist)
        // Note: final marking is not currently used in generalization computation
        let _final_marking = {
            let mut fm: Vec<u32> = vec![0; num_places];
            if let Some(first_final) = net.final_markings.first() {
                for (place_id, &count) in first_final {
                    if let Some(&pid) = place_ids.get(place_id) {
                        fm[pid] = count as u32;
                    }
                }
            }
            fm
        };

        Ok(ReplayNet {
            marking: initial_marking.clone(),
            transitions,
            label_to_transitions,
            initial_marking,
        })
    }

    /// Reset marking to initial state.
    fn reset(&mut self) {
        self.marking.clone_from(&self.initial_marking);
    }

    /// Check if a transition is enabled (all preset places have >= 1 token).
    fn is_enabled(&self, preset: &[usize]) -> bool {
        preset.iter().all(|&pid| self.marking[pid] > 0)
    }

    /// Fire a transition: consume from preset, produce to postset.
    fn fire(&mut self, preset: &[usize], postset: &[usize]) {
        for &pid in preset {
            self.marking[pid] = self.marking[pid].saturating_sub(1);
        }
        for &pid in postset {
            self.marking[pid] = self.marking[pid].saturating_add(1);
        }
    }

    /// Replay a single trace and return transition firing counts.
    fn replay_trace(&mut self, activities: &[String]) -> FxHashMap<usize, u64> {
        self.reset();
        let mut firing_counts: FxHashMap<usize, u64> = FxHashMap::default();

        for activity in activities {
            // Find transitions with this label
            let candidates: Vec<usize> = self
                .label_to_transitions
                .get(activity)
                .cloned()
                .unwrap_or_default();

            if candidates.is_empty() {
                continue;
            }

            // Try to fire the first enabled transition
            let mut fired = false;
            for trans_id in candidates.iter().copied() {
                let (_, preset, postset) = &self.transitions[trans_id];
                // Clone preset/postset to avoid borrow issues
                let preset_clone = preset.clone();
                let postset_clone = postset.clone();
                if self.is_enabled(&preset_clone) {
                    self.fire(&preset_clone, &postset_clone);
                    *firing_counts.entry(trans_id).or_insert(0) += 1;
                    fired = true;
                    break;
                }
            }

            // If no transition enabled, fire first candidate anyway (inject tokens)
            if !fired {
                if let Some(&trans_id) = candidates.first() {
                    let (_, preset, postset) = &self.transitions[trans_id];
                    // Clone preset/postset to avoid borrow issues
                    let preset_clone = preset.clone();
                    let postset_clone = postset.clone();
                    // Inject missing tokens
                    for &pid in &preset_clone {
                        if self.marking[pid] == 0 {
                            self.marking[pid] = 1;
                        }
                    }
                    self.fire(&preset_clone, &postset_clone);
                    *firing_counts.entry(trans_id).or_insert(0) += 1;
                }
            }
        }

        firing_counts
    }
}

// ─── Core algorithm ─────────────────────────────────────────────────────────

/// Compute generalization and structural quality metrics for a Petri net
/// against an event log.
///
/// The generalization score uses the token-replay approach from
/// `pm4py.algo.evaluation.generalization.variants.token_based`:
///
/// 1. Replay every trace to get activated transitions per trace.
/// 2. Count how often each transition fires across the entire log.
/// 3. For each transition: if it fired `n` times, add `1 / sqrt(n)`;
///    if it never fired, add `1`.
/// 4. `generalization = 1 - penalty_sum / num_visible_transitions`
///
/// This penalises models with many rarely-used or unused transitions
/// (overfitting) and rewards models where all transitions are exercised.
pub fn compute_quality(
    net: &PetriNet,
    log: &EventLog,
    activity_key: &str,
) -> Result<QualityMetrics, JsValue> {
    let num_transitions = net.transitions.len();
    let num_places = net.places.len();
    let num_arcs = net.arcs.len();

    // Count visible transitions (non-silent)
    let num_visible_transitions = net
        .transitions
        .iter()
        .filter(|t| !t.is_invisible.unwrap_or(false))
        .count();

    let (generalization, penalty) = if num_visible_transitions == 0 {
        (1.0, 0.0)
    } else {
        compute_generalization(net, log, activity_key)?
    };

    Ok(QualityMetrics {
        generalization,
        num_places,
        num_transitions,
        num_visible_transitions,
        num_arcs,
        penalty,
    })
}

/// Internal generalization computation.
fn compute_generalization(
    net: &PetriNet,
    log: &EventLog,
    activity_key: &str,
) -> Result<(f64, f64), JsValue> {
    let mut replay_net = ReplayNet::from_petri_net(net)?;

    // Count per-transition firing frequency across all traces.
    let mut trans_occ: FxHashMap<usize, u64> = FxHashMap::default();

    for trace in &log.traces {
        // Extract activities from trace events
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|event| {
                event
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(|s| s.to_owned())
            })
            .collect();

        let trace_counts = replay_net.replay_trace(&activities);
        for (trans_id, count) in trace_counts {
            *trans_occ.entry(trans_id).or_insert(0) += count;
        }
    }

    // Sum penalty: 1/sqrt(n) per visible transition (silent excluded).
    let mut penalty_sum = 0.0_f64;
    for (trans_id, trans) in net.transitions.iter().enumerate() {
        if trans.is_invisible.unwrap_or(false) {
            continue; // Skip silent transitions
        }
        let count = trans_occ.get(&trans_id).copied().unwrap_or(0);
        penalty_sum += if count > 0 {
            1.0 / (count as f64).sqrt()
        } else {
            1.0
        };
    }

    let visible_count = net
        .transitions
        .iter()
        .filter(|t| !t.is_invisible.unwrap_or(false))
        .count();

    if visible_count == 0 {
        return Ok((1.0, 0.0));
    }

    let generalization = 1.0 - penalty_sum / visible_count as f64;
    Ok((generalization, penalty_sum))
}

// ─── WASM export ────────────────────────────────────────────────────────────

/// Compute generalization quality metrics for a Petri net against an event log.
///
/// # Arguments
///
/// * `eventlog_handle` - Handle to the stored EventLog object
/// * `petri_net_handle` - Handle to the stored PetriNet object
/// * `activity_key` - Attribute key for activity names (e.g., "concept:name")
///
/// # Returns
///
/// JSON object with:
/// - `generalization`: f64 score in [0, 1]
/// - `num_places`: number of places
/// - `num_transitions`: number of transitions
/// - `num_visible_transitions`: number of visible (non-silent) transitions
/// - `num_arcs`: number of arcs
/// - `penalty`: sum of penalties applied
#[wasm_bindgen]
pub fn generalization(
    eventlog_handle: &str,
    petri_net_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |log_obj| match log_obj {
        Some(StoredObject::EventLog(log)) => {
            get_or_init_state().with_object(petri_net_handle, |pn_obj| match pn_obj {
                Some(StoredObject::PetriNet(pn)) => {
                    let result = compute_quality(pn, log, activity_key)?;
                    to_js(&result)
                }
                Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a PetriNet")),
                None => Err(wasm_err(codes::INVALID_HANDLE, "PetriNet not found")),
            })
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, "EventLog not found")),
    })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        AttributeValue, Event, PetriNetArc, PetriNetPlace, PetriNetTransition, Trace,
    };
    use std::collections::HashMap;

    /// Create a simple sequential Petri net: source -> A -> p1 -> B -> sink.
    fn make_sequential_net() -> PetriNet {
        PetriNet {
            places: vec![
                PetriNetPlace {
                    id: "source".to_string(),
                    label: "source".to_string(),
                    marking: Some(1),
                },
                PetriNetPlace {
                    id: "p1".to_string(),
                    label: "p1".to_string(),
                    marking: None,
                },
                PetriNetPlace {
                    id: "sink".to_string(),
                    label: "sink".to_string(),
                    marking: None,
                },
            ],
            transitions: vec![
                PetriNetTransition {
                    id: "tA".to_string(),
                    label: "A".to_string(),
                    is_invisible: Some(false),
                },
                PetriNetTransition {
                    id: "tB".to_string(),
                    label: "B".to_string(),
                    is_invisible: Some(false),
                },
            ],
            arcs: vec![
                PetriNetArc {
                    from: "source".to_string(),
                    to: "tA".to_string(),
                    weight: Some(1),
                },
                PetriNetArc {
                    from: "tA".to_string(),
                    to: "p1".to_string(),
                    weight: Some(1),
                },
                PetriNetArc {
                    from: "p1".to_string(),
                    to: "tB".to_string(),
                    weight: Some(1),
                },
                PetriNetArc {
                    from: "tB".to_string(),
                    to: "sink".to_string(),
                    weight: Some(1),
                },
            ],
            initial_marking: {
                let mut m = HashMap::new();
                m.insert("source".to_string(), 1);
                m
            },
            final_markings: vec![{
                let mut m = HashMap::new();
                m.insert("sink".to_string(), 1);
                m
            }],
        }
    }

    /// Create a sequential net with an extra unused visible transition C.
    fn make_net_with_unused() -> PetriNet {
        PetriNet {
            places: vec![
                PetriNetPlace {
                    id: "source".to_string(),
                    label: "source".to_string(),
                    marking: Some(1),
                },
                PetriNetPlace {
                    id: "p1".to_string(),
                    label: "p1".to_string(),
                    marking: None,
                },
                PetriNetPlace {
                    id: "p2".to_string(),
                    label: "p2".to_string(),
                    marking: None,
                },
                PetriNetPlace {
                    id: "sink".to_string(),
                    label: "sink".to_string(),
                    marking: None,
                },
            ],
            transitions: vec![
                PetriNetTransition {
                    id: "tA".to_string(),
                    label: "A".to_string(),
                    is_invisible: Some(false),
                },
                PetriNetTransition {
                    id: "tB".to_string(),
                    label: "B".to_string(),
                    is_invisible: Some(false),
                },
                PetriNetTransition {
                    id: "tC".to_string(),
                    label: "C".to_string(),
                    is_invisible: Some(false),
                },
            ],
            arcs: vec![
                PetriNetArc {
                    from: "source".to_string(),
                    to: "tA".to_string(),
                    weight: Some(1),
                },
                PetriNetArc {
                    from: "tA".to_string(),
                    to: "p1".to_string(),
                    weight: Some(1),
                },
                PetriNetArc {
                    from: "p1".to_string(),
                    to: "tB".to_string(),
                    weight: Some(1),
                },
                PetriNetArc {
                    from: "tB".to_string(),
                    to: "p2".to_string(),
                    weight: Some(1),
                },
                PetriNetArc {
                    from: "p2".to_string(),
                    to: "sink".to_string(),
                    weight: Some(1),
                },
                // Extra path for C (unused in log)
                PetriNetArc {
                    from: "source".to_string(),
                    to: "tC".to_string(),
                    weight: Some(1),
                },
                PetriNetArc {
                    from: "tC".to_string(),
                    to: "sink".to_string(),
                    weight: Some(1),
                },
            ],
            initial_marking: {
                let mut m = HashMap::new();
                m.insert("source".to_string(), 1);
                m
            },
            final_markings: vec![{
                let mut m = HashMap::new();
                m.insert("sink".to_string(), 1);
                m
            }],
        }
    }

    /// Create a simple event log with A->B traces.
    fn make_log_ab(n: usize) -> EventLog {
        let mut traces = Vec::new();
        for _i in 0..n {
            traces.push(Trace {
                attributes: HashMap::new(),
                events: vec![
                    Event {
                        attributes: {
                            let mut attrs = HashMap::new();
                            attrs.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            attrs
                        },
                    },
                    Event {
                        attributes: {
                            let mut attrs = HashMap::new();
                            attrs.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            attrs
                        },
                    },
                ],
            });
        }
        EventLog {
            attributes: HashMap::new(),
            traces,
        }
    }

    #[test]
    fn test_replay_net_construction() {
        let net = make_sequential_net();
        let replay_net = ReplayNet::from_petri_net(&net).unwrap();

        assert_eq!(replay_net.transitions.len(), 2);
        assert_eq!(replay_net.label_to_transitions.len(), 2);
        assert!(replay_net.label_to_transitions.contains_key("A"));
        assert!(replay_net.label_to_transitions.contains_key("B"));
    }

    #[test]
    fn test_replay_trace() {
        let net = make_sequential_net();
        let mut replay_net = ReplayNet::from_petri_net(&net).unwrap();

        let activities = vec!["A".to_string(), "B".to_string()];
        let counts = replay_net.replay_trace(&activities);

        // Both transitions should fire once
        assert_eq!(counts.len(), 2);
        assert!(counts.values().all(|&c| c == 1));
    }

    #[test]
    fn test_generalization_perfect_fit() {
        let net = make_sequential_net();
        let log = make_log_ab(10);

        let result = compute_quality(&net, &log, "concept:name").unwrap();

        assert!(
            result.generalization > 0.5,
            "expected > 0.5, got {:.4}",
            result.generalization
        );
        assert_eq!(result.num_places, 3);
        assert_eq!(result.num_transitions, 2);
        assert_eq!(result.num_visible_transitions, 2);
        assert_eq!(result.num_arcs, 4);
    }

    #[test]
    fn test_generalization_unused_transition_lowers_score() {
        let net_ok = make_sequential_net();
        let net_extra = make_net_with_unused();
        let log = make_log_ab(10);

        let ok = compute_quality(&net_ok, &log, "concept:name").unwrap();
        let extra = compute_quality(&net_extra, &log, "concept:name").unwrap();

        assert!(
            ok.generalization > extra.generalization,
            "clean ({:.4}) should beat extra ({:.4})",
            ok.generalization,
            extra.generalization
        );

        // Extra net has 3 visible transitions (A, B, C) but C never fires
        assert_eq!(extra.num_visible_transitions, 3);
    }

    #[test]
    fn test_generalization_with_silent_transitions() {
        // Create a net with a silent transition
        let mut net = make_sequential_net();
        net.transitions.push(PetriNetTransition {
            id: "tau".to_string(),
            label: "tau".to_string(),
            is_invisible: Some(true), // Silent transition
        });

        let log = make_log_ab(5);
        let result = compute_quality(&net, &log, "concept:name").unwrap();

        // Silent transitions should not count in visible transitions
        assert_eq!(result.num_visible_transitions, 2);
        // Generalization should be computed only on visible transitions
        assert!(result.generalization > 0.0);
    }

    #[test]
    fn test_empty_log() {
        let net = make_sequential_net();
        let log = EventLog {
            attributes: HashMap::new(),
            traces: vec![],
        };

        let result = compute_quality(&net, &log, "concept:name").unwrap();

        // Empty log: no transitions fire, penalty = num_visible, generalization = 0
        assert_eq!(result.generalization, 0.0);
    }

    #[test]
    fn test_empty_net() {
        let net = PetriNet {
            places: vec![],
            transitions: vec![],
            arcs: vec![],
            initial_marking: HashMap::new(),
            final_markings: vec![],
        };

        let log = make_log_ab(5);
        let result = compute_quality(&net, &log, "concept:name").unwrap();

        // Empty net with no visible transitions: generalization = 1.0 (perfect by definition)
        assert_eq!(result.generalization, 1.0);
        assert_eq!(result.num_visible_transitions, 0);
    }
}
