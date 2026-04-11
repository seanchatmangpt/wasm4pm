// pictl – High-Performance Process Mining in WebAssembly
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

/// Causal graph discovery from directly-follows graphs.
///
/// Ports `pm4py.algo.discovery.causal`.
///
/// A causal graph identifies which activities have a causal relationship:
/// - A → B is causal if A always precedes B (B never precedes A)
/// - This is the alpha miner's definition of causality

use crate::error::{codes, wasm_err};
use crate::models::EventLog;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Causal relation result.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CausalGraph {
    /// Causal relations: list of {source, target, strength}
    pub relations: Vec<CausalRelation>,
    /// All activities in the graph
    pub activities: Vec<String>,
}

/// A single causal relation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CausalRelation {
    /// Source activity
    pub source: String,
    /// Target activity
    pub target: String,
    /// Causal strength (0-1000; 1000 = binary causal, lower = heuristic strength)
    pub strength: usize,
}

/// Discover causal relations using the alpha miner variant.
///
/// Ports `pm4py.algo.discovery.causal.variants.alpha.apply()`.
///
/// A relation (A, B) is causal if:
/// - A directly follows B in the log (frequency > 0)
/// - B never directly follows A (either absent or frequency = 0)
#[wasm_bindgen]
pub fn discover_causal_alpha(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let result = build_causal_alpha(log, activity_key)?;
            to_js(&result)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, "EventLog not found")),
    })
}

/// Discover causal relations using the heuristic variant.
///
/// Ports `pm4py.algo.discovery.causal.variants.heuristic.apply()`.
///
/// The heuristic variant uses a threshold-based approach:
/// - Relation (A, B) is causal if its frequency is significantly higher
///   than the reverse frequency (B, A).
#[wasm_bindgen]
pub fn discover_causal_heuristic(
    eventlog_handle: &str,
    activity_key: &str,
    threshold: f64,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let result = build_causal_heuristic(log, activity_key, threshold)?;
            to_js(&result)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, "EventLog not found")),
    })
}

/// Internal: Build causal graph using alpha miner variant.
fn build_causal_alpha(log: &EventLog, activity_key: &str) -> Result<CausalGraph, JsValue> {
    let mut edge_freq: FxHashMap<(String, String), usize> = FxHashMap::default();
    let mut activities: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Build frequency map from directly-follows relations
    for trace in &log.traces {
        for pair in trace.events.windows(2) {
            if let (
                Some(crate::models::AttributeValue::String(from)),
                Some(crate::models::AttributeValue::String(to)),
            ) = (
                pair[0].attributes.get(activity_key),
                pair[1].attributes.get(activity_key),
            ) {
                *edge_freq.entry((from.clone(), to.clone())).or_insert(0) += 1;
                activities.insert(from.clone());
                activities.insert(to.clone());
            }
        }
    }

    let mut causal_relations = Vec::new();

    for ((from, to), freq) in &edge_freq {
        if *freq > 0 {
            // Check reverse relation
            let reverse_key = (to.clone(), from.clone());
            let is_causal = if let Some(reverse_freq) = edge_freq.get(&reverse_key) {
                // Causal if reverse frequency is 0
                *reverse_freq == 0
            } else {
                // Causal if reverse relation doesn't exist
                true
            };

            if is_causal {
                causal_relations.push(CausalRelation {
                    source: from.clone(),
                    target: to.clone(),
                    strength: 1000, // Binary causal: full strength
                });
            }
        }
    }

    let mut activities_vec: Vec<String> = activities.into_iter().collect();
    activities_vec.sort();

    Ok(CausalGraph {
        relations: causal_relations,
        activities: activities_vec,
    })
}

/// Internal: Build causal graph using heuristic variant.
fn build_causal_heuristic(
    log: &EventLog,
    activity_key: &str,
    threshold: f64,
) -> Result<CausalGraph, JsValue> {
    let mut edge_freq: FxHashMap<(String, String), usize> = FxHashMap::default();
    let mut activities: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Build frequency map from directly-follows relations
    for trace in &log.traces {
        for pair in trace.events.windows(2) {
            if let (
                Some(crate::models::AttributeValue::String(from)),
                Some(crate::models::AttributeValue::String(to)),
            ) = (
                pair[0].attributes.get(activity_key),
                pair[1].attributes.get(activity_key),
            ) {
                *edge_freq.entry((from.clone(), to.clone())).or_insert(0) += 1;
                activities.insert(from.clone());
                activities.insert(to.clone());
            }
        }
    }

    let mut causal_relations = Vec::new();

    for ((from, to), freq) in &edge_freq {
        if *freq > 0 {
            // Check reverse relation
            let reverse_key = (to.clone(), from.clone());
            let strength = if let Some(reverse_freq) = edge_freq.get(&reverse_key) {
                let total = *freq + *reverse_freq;
                if total == 0 {
                    0.0
                } else {
                    (*freq as f64) / (total as f64)
                }
            } else {
                1.0 // No reverse relation = full causality
            };

            if strength >= threshold {
                causal_relations.push(CausalRelation {
                    source: from.clone(),
                    target: to.clone(),
                    strength: (strength * 1000.0) as usize,
                });
            }
        }
    }

    let mut activities_vec: Vec<String> = activities.into_iter().collect();
    activities_vec.sort();

    Ok(CausalGraph {
        relations: causal_relations,
        activities: activities_vec,
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
                // Linear trace: A → B → C
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("C".to_string()),
                            );
                            e
                        },
                    ],
                },
                // Another linear trace: A → B → C
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("C".to_string()),
                            );
                            e
                        },
                    ],
                },
            ],
        }
    }

    fn create_bidirectional_log() -> EventLog {
        EventLog {
            attributes: HashMap::new(),
            traces: vec![
                // A → B trace
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                    ],
                },
                // B → A trace (bidirectional)
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                    ],
                },
            ],
        }
    }

    fn create_heuristic_log() -> EventLog {
        EventLog {
            attributes: HashMap::new(),
            traces: vec![
                // 5 traces: A → B
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                    ],
                },
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                    ],
                },
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                    ],
                },
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                    ],
                },
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                    ],
                },
                // 1 trace: B → A
                Trace {
                    attributes: HashMap::new(),
                    events: vec![
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("B".to_string()),
                            );
                            e
                        },
                        {
                            let mut e = Event::new();
                            e.attributes.insert(
                                "concept:name".to_string(),
                                AttributeValue::String("A".to_string()),
                            );
                            e
                        },
                    ],
                },
            ],
        }
    }

    #[test]
    fn test_causal_alpha_simple() {
        let log = create_test_log();
        let result = build_causal_alpha(&log, "concept:name").unwrap();

        // Should have 2 causal relations: A→B and B→C
        assert_eq!(result.relations.len(), 2);

        // Check A→B relation
        let ab = result
            .relations
            .iter()
            .find(|r| r.source == "A" && r.target == "B");
        assert!(ab.is_some());
        assert_eq!(ab.unwrap().strength, 1000);

        // Check B→C relation
        let bc = result
            .relations
            .iter()
            .find(|r| r.source == "B" && r.target == "C");
        assert!(bc.is_some());
        assert_eq!(bc.unwrap().strength, 1000);

        // Activities should be sorted
        assert_eq!(result.activities, vec!["A", "B", "C"]);
    }

    #[test]
    fn test_causal_alpha_no_loop() {
        let log = create_bidirectional_log();
        let result = build_causal_alpha(&log, "concept:name").unwrap();

        // No causal relations since both directions exist
        assert_eq!(result.relations.len(), 0);
    }

    #[test]
    fn test_causal_heuristic_threshold() {
        let log = create_heuristic_log();
        let result = build_causal_heuristic(&log, "concept:name", 0.8).unwrap();

        // A→B should be causal (5/6 = 0.833 > 0.8)
        let ab = result
            .relations
            .iter()
            .find(|r| r.source == "A" && r.target == "B");
        assert!(ab.is_some());
        // Strength should be ~833 (0.833 * 1000)
        assert!((ab.unwrap().strength as f64 / 1000.0 - 0.833).abs() < 0.01);

        // B→A should NOT be causal (1/6 = 0.167 < 0.8)
        let ba = result
            .relations
            .iter()
            .find(|r| r.source == "B" && r.target == "A");
        assert!(ba.is_none());
    }

    #[test]
    fn test_causal_heuristic_low_threshold() {
        let log = create_heuristic_log();
        let result = build_causal_heuristic(&log, "concept:name", 0.1).unwrap();

        // Both A→B and B→A should be causal with low threshold
        assert_eq!(result.relations.len(), 2);
    }
}
