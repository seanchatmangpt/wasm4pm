//! Process discovery algorithms: DFG, OCEL, Declare, and related utilities.
//!
//! All WASM exports follow the **handle pattern**: call `load_eventlog_from_xes()`
//! to obtain an opaque handle string, then pass it to any `discover_*` function.
//!
//! [`discover_dfg_from_log`] is the pure-Rust variant (no WASM boundary) used
//! directly by integration tests in `wasm4pm/tests/`.
//!
//! ## Output shapes (JSON string — JS caller must `JSON.parse()`)
//!
//! | Function | Top-level keys |
//! |---|---|
//! | `discover_dfg` | `nodes[]`, `edges[]`, `start_activities[]`, `end_activities[]` |
//! | `discover_declare` | `constraints[]` |
//! | `discover_ocel_dfg` | per-type DFG maps |

use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use rustc_hash::{FxHashMap, FxHashSet};
use serde_json::json;
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

/// Pure-Rust DFG discovery without wasm-bindgen. Used by integration tests.
#[must_use]
pub fn discover_dfg_from_log<W>(log: &AdmittedEventLog<W>, activity_key: &str) -> DFG {
    let mut dfg = DFG::new();
    let col_owned = log.value.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
        id: act.to_owned(),
        label: act.to_owned(),
        frequency: 0,
    }));

    let mut edge_counts: BTreeMap<(u32, u32), usize> = BTreeMap::new();

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        if start >= end {
            continue;
        }
        for &id in &col.events[start..end] {
            dfg.nodes[id as usize].frequency += 1;
        }
        for i in start..end - 1 {
            *edge_counts
                .entry((col.events[i], col.events[i + 1]))
                .or_default() += 1;
        }
        *dfg.start_activities
            .entry(col.vocab[col.events[start] as usize].to_owned())
            .or_default() += 1;
        *dfg.end_activities
            .entry(col.vocab[col.events[end - 1] as usize].to_owned())
            .or_default() += 1;
    }

    // BTreeMap iterates in ascending key order — deterministic by contract (Gap-1).
    dfg.edges.extend(
        edge_counts
            .into_iter()
            .map(|((f, t), freq)| DirectlyFollowsRelation {
                from: col.vocab[f as usize].to_owned(),
                to: col.vocab[t as usize].to_owned(),
                frequency: freq,
            }),
    );

    dfg
}

/// Discover a Directly-Follows Graph (DFG) from an event log.
///
/// # Parameters
/// * `eventlog_handle` — Handle string returned by `load_eventlog_from_xes` or `load_eventlog_from_json`.
/// * `activity_key` — XES attribute name to use as activity label (e.g. `"concept:name"`).
///
/// # Returns
/// `Result<JsValue, JsValue>` — On success, a JS value (parse with `JSON.parse` if it is a
/// string) containing:
/// ```json
/// {
///   "nodes": [{"id": "...", "label": "...", "frequency": 42}],
///   "edges": [{"from": "A", "to": "B", "frequency": 17}],
///   "start_activities": {"A": 10},
///   "end_activities":   {"C": 5}
/// }
/// ```
///
/// # Note
/// DFG construction is always successful for any valid event log (empty or otherwise).
/// The function never returns `None` and never panics.
/// For a sound process tree, use `discover_inductive_miner` instead.
#[wasm_bindgen]
pub fn discover_dfg(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    // Use with_object to borrow the log in place — avoids a full EventLog clone.
    // discover_dfg_from_log builds its own columnar view internally, so we only
    // need a shared reference, not an owned copy.
    get_or_init_state().with_event_log(eventlog_handle, |log| {
            let log_size = log.traces.len();

            tracing::info!(
                target: "wasm4pm.discovery.dfg",
                algorithm = "dfg",
                log_size = log_size,
                activity_key = activity_key,
                "DFG discovery started"
            );

            let admitted =
                wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
            let dfg = discover_dfg_from_log(&admitted, activity_key);

            // Derive activity_count from the already-built DFG nodes — avoids
            // a second full columnar pass that was previously done by get_activities().
            let node_count = dfg.nodes.len();
            let edge_count = dfg.edges.len();
            let complexity = if node_count > 0 {
                edge_count as f64 / node_count as f64
            } else {
                0.0
            };

            tracing::info!(
                target: "wasm4pm.discovery.dfg",
                checkpoint = "feature_extraction",
                activity_count = node_count,
                "Activity vocabulary extracted"
            );

            tracing::info!(
                target: "wasm4pm.discovery.dfg",
                checkpoint = "result_generation",
                node_count = node_count,
                edge_count = edge_count,
                complexity = complexity,
                "DFG discovery completed"
            );

            to_js_str(&dfg)
    })
}

/// Pure-Rust OCEL DFG discovery: returns DFG without wasm-bindgen.
///
/// This is the testable core of `discover_ocel_dfg`. Integration tests
/// on native targets cannot call `#[wasm_bindgen]` functions, so they use
/// this instead.
#[must_use]
pub fn discover_ocel_dfg_pure(ocel: &OCEL) -> DFG {
    let mut dfg = DFG::new();

    // Get event types
    for event_type in &ocel.event_types {
        dfg.nodes.push(DFGNode {
            id: event_type.clone(),
            label: event_type.clone(),
            frequency: 0,
        });
    }

    // Count event type frequencies
    for event in &ocel.events {
        if let Some(node) = dfg.nodes.iter_mut().find(|n| n.id == event.event_type) {
            node.frequency += 1;
        }
    }

    // Get directly-follows relations within same objects
    let mut events_by_object: FxHashMap<String, Vec<(usize, &str)>> = FxHashMap::default();
    for (idx, event) in ocel.events.iter().enumerate() {
        for obj_id in event.all_object_ids() {
            events_by_object
                .entry(obj_id.to_string())
                .or_default()
                .push((idx, event.event_type.as_str()));
        }
    }

    // Sort events by timestamp (ISO 8601 sorts lexicographically without parsing).
    // Use sort_unstable_by + str comparison to avoid allocating a String per comparison.
    for events in events_by_object.values_mut() {
        events.sort_unstable_by(|(ai, _), (bi, _)| {
            ocel.events[*ai]
                .timestamp
                .as_str()
                .cmp(ocel.events[*bi].timestamp.as_str())
        });
    }

    // Build an edge map with &str keys — avoids one String allocation per DF pair.
    // The strings are borrowed from the OCEL event_type fields which outlive this scope.
    let mut edge_map: BTreeMap<(&str, &str), usize> = BTreeMap::new();
    for events in events_by_object.values() {
        for pair in events.windows(2) {
            let from = pair[0].1;
            let to = pair[1].1;
            *edge_map.entry((from, to)).or_default() += 1;
        }
    }

    // BTreeMap<(&str,&str)> iterates in ascending key order — no explicit sort needed.
    for ((from, to), frequency) in edge_map {
        dfg.edges.push(DirectlyFollowsRelation {
            from: from.to_owned(),
            to: to.to_owned(),
            frequency,
        });
    }
    // Collect start/end event types using .first()/.last() to eliminate
    // manual bounds checks and the len()-1 index expression.
    for obj_id in events_by_object.keys() {
        if let Some(events) = events_by_object.get(obj_id) {
            if let Some(first) = events.first() {
                *dfg.start_activities.entry(first.1.to_string()).or_default() += 1;
            }
            if let Some(last) = events.last() {
                *dfg.end_activities.entry(last.1.to_string()).or_default() += 1;
            }
        }
    }

    dfg
}

/// Discover a Directly-Follows Graph (DFG) from an OCEL
#[wasm_bindgen]
pub fn discover_ocel_dfg(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_ocel(ocel_handle, |ocel| {
            let dfg = discover_ocel_dfg_pure(ocel);
            to_js_str(&dfg)
    })
}

#[inline(always)]
fn bitmask_mark(mask: &mut u64, id: usize) {
    *mask |= 1u64 << id;
}

#[inline(always)]
fn bitmask_check(mask: u64, id: usize) -> bool {
    (mask >> id) & 1 == 1
}

/// Discover a Directly-Follows Graph (DFG) per object type from an OCEL
#[wasm_bindgen]
pub fn discover_ocel_dfg_per_type(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_ocel(ocel_handle, |ocel| {
            let mut result: std::collections::BTreeMap<String, DFG> = std::collections::BTreeMap::new();

            // Build sorted activity vocabulary for stable index assignment
            let mut activity_vocab: Vec<String> = {
                let mut seen: FxHashSet<&str> = FxHashSet::default();
                ocel.events
                    .iter()
                    .filter_map(|e| {
                        if seen.insert(e.event_type.as_str()) {
                            Some(e.event_type.clone())
                        } else {
                            None
                        }
                    })
                    .collect()
            };
            activity_vocab.sort_unstable();
            let activity_count = activity_vocab.len();

            // Reverse lookup: activity name → index (used by bitmask fast path)
            let activity_index: FxHashMap<&str, usize> = activity_vocab
                .iter()
                .enumerate()
                .map(|(i, s)| (s.as_str(), i))
                .collect();

            let use_bitmask = activity_count <= 64;

            // Fix C: pre-compute global activity frequencies once, outside the per-type loop
            let global_activity_counts: FxHashMap<String, usize> = {
                let mut m: FxHashMap<String, usize> = FxHashMap::default();
                for event in &ocel.events {
                    *m.entry(event.event_type.clone()).or_default() += 1;
                }
                m
            };

            // For each object type, discover a separate DFG
            for obj_type in &ocel.object_types {
                let mut dfg = DFG::new();

                for name in &activity_vocab {
                    dfg.nodes.push(DFGNode {
                        id: name.clone(),
                        label: name.clone(),
                        frequency: 0,
                    });
                }

                // Get all events for objects of this type
                let mut events_by_object: FxHashMap<String, Vec<(usize, &str)>> =
                    FxHashMap::default();
                for obj in &ocel.objects {
                    if &obj.object_type == obj_type {
                        events_by_object.insert(obj.id.clone(), Vec::new());
                    }
                }

                // Collect events for each object of this type
                for (idx, event) in ocel.events.iter().enumerate() {
                    for obj_id in event.all_object_ids() {
                        if let Some(events) = events_by_object.get_mut(obj_id) {
                            events.push((idx, event.event_type.as_str()));
                        }
                    }
                }

                // Sort events by timestamp (ISO 8601 sorts lexicographically without parsing).
                // sort_unstable_by with str comparison avoids a String allocation per comparison.
                for events in events_by_object.values_mut() {
                    events.sort_unstable_by(|(ai, _), (bi, _)| {
                        ocel.events[*ai]
                            .timestamp
                            .as_str()
                            .cmp(ocel.events[*bi].timestamp.as_str())
                    });
                }

                // Fix C: use pre-computed global activity frequencies
                for node in &mut dfg.nodes {
                    if let Some(count) = global_activity_counts.get(&node.id) {
                        node.frequency = *count;
                    }
                }

                // Use &str keys to avoid one String allocation per DF pair in the hot loop.
                let mut edge_map: FxHashMap<(&str, &str), usize> = FxHashMap::default();
                for events in events_by_object.values() {
                    for pair in events.windows(2) {
                        let from = pair[0].1;
                        let to = pair[1].1;
                        *edge_map.entry((from, to)).or_default() += 1;
                    }
                }
                for ((from, to), freq) in edge_map {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from: from.to_owned(),
                        to: to.to_owned(),
                        frequency: freq,
                    });
                }

                // Collect start/end activities (now correctly using events_by_object.keys())
                let mut trace_seen_bitmask: u64 = 0u64;
                for obj_id in events_by_object.keys() {
                    if let Some(events) = events_by_object.get(obj_id) {
                        if let Some(first) = events.first() {
                            *dfg.start_activities.entry(first.1.to_string()).or_default() += 1;
                            if use_bitmask {
                                if let Some(&id) = activity_index.get(first.1) {
                                    bitmask_mark(&mut trace_seen_bitmask, id);
                                }
                            }
                        }
                        if let Some(last) = events.last() {
                            *dfg.end_activities.entry(last.1.to_string()).or_default() += 1;
                        }
                    }
                }
                let _ = (trace_seen_bitmask, bitmask_check);

                result.insert(obj_type.clone(), dfg);
            }

            // Return as JSON: { "Order": { ... DFG ... }, "Item": { ... } }
            to_js_str(&result)
    })
}

struct TraceProfile {
    /// Bitmask of present activities (A <= 128).
    activity_mask: u128,
    /// first_position[a] = index of first occurrence of activity a in trace
    /// (or usize::MAX if not present).
    first_positions: Vec<usize>,
    /// last_position[a] = index of last occurrence of activity a in trace
    /// (or usize::MAX if not present).
    last_positions: Vec<usize>,
    /// immediate_follows[(a,b)] = true if a is immediately followed by b at least once.
    /// FxHashSet is ~2× faster than std HashSet for small integer tuple keys because
    /// it skips the SipHash DoS-resistance overhead irrelevant for internal data.
    immediate_follows: FxHashSet<(u32, u32)>,
}

impl TraceProfile {
    fn new(n: usize) -> Self {
        TraceProfile {
            activity_mask: 0,
            first_positions: vec![usize::MAX; n],
            last_positions: vec![usize::MAX; n],
            immediate_follows: FxHashSet::default(),
        }
    }

    /// Mark activity as present at given position.
    fn mark_activity(&mut self, activity_idx: usize, position: usize) {
        if activity_idx < 128 {
            self.activity_mask |= 1u128 << (activity_idx as u128);
        }
        if self.first_positions[activity_idx] == usize::MAX {
            self.first_positions[activity_idx] = position;
        }
        self.last_positions[activity_idx] = position;
    }

    /// Check if activity a appeared before activity b in this trace.
    #[inline(always)]
    fn appears_before(&self, a: usize, b: usize) -> bool {
        let fa = self.first_positions[a];
        let fb = self.first_positions[b];
        (fa != usize::MAX) & (fb != usize::MAX) & (fa < fb)
    }

    /// Check if activity a appeared after activity b in this trace.
    #[allow(dead_code)]
    #[inline(always)]
    fn appears_after(&self, a: usize, b: usize) -> bool {
        let la = self.last_positions[a];
        let fb = self.first_positions[b];
        (la != usize::MAX) & (fb != usize::MAX) & (la > fb)
    }
}

/// Discover DECLARE constraints from an EventLog
#[wasm_bindgen]
pub fn discover_declare(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.declare",
        algorithm = "declare",
        activity_key = activity_key,
        "DECLARE discovery started"
    );

    get_or_init_state().with_event_log(eventlog_handle, |log| {
            let mut model = DeclareModel::new();

            let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
                .unwrap_or_else(|| {
                    let owned = log.to_columnar_owned(activity_key);
                    crate::cache::columnar_cache_insert(
                        eventlog_handle.to_string(),
                        activity_key.to_string(),
                        owned.clone(),
                    );
                    owned
                });
            let col = ColumnarLog::from_owned(&col_owned);
            let n = col.vocab.len();
            let total_cases = col.trace_offsets.len().saturating_sub(1);

            tracing::info!(
                target: "wasm4pm.discovery.declare",
                checkpoint = "feature_extraction",
                activity_count = n,
                trace_count = total_cases,
                "Activity vocabulary and case counts extracted"
            );

            model.activities = col.vocab.iter().map(|s| s.to_string()).collect();

            if n == 0 || total_cases == 0 {
                tracing::info!(
                    target: "wasm4pm.discovery.declare",
                    checkpoint = "empty_log",
                    activity_count = n,
                    trace_count = total_cases,
                    "Empty log detected"
                );
                return to_js_str(&model);
            }

            // Phase 1: Build TraceProfile for each trace
            let mut traces_profiles: Vec<TraceProfile> = Vec::with_capacity(total_cases);
            for t in 0..total_cases {
                let start = col.trace_offsets[t];
                let end = col.trace_offsets[t + 1];
                let mut profile = TraceProfile::new(n);
                if start < end {
                    for pos in 0..(end - start) {
                        let activity_id = col.events[start + pos];
                        profile.mark_activity(activity_id as usize, pos);
                        if pos < (end - start - 1) {
                            profile
                                .immediate_follows
                                .insert((activity_id, col.events[start + pos + 1]));
                        }
                    }
                }
                traces_profiles.push(profile);
            }

            tracing::info!(
                target: "wasm4pm.discovery.declare",
                checkpoint = "profile_building",
                profiles_count = traces_profiles.len(),
                "Trace profiles built"
            );

            // Phase 2: Iterate over activity pairs and count template matches
            let mut activity_counts = vec![0u32; n];
            for profile in &traces_profiles {
                for (a, count) in activity_counts.iter_mut().enumerate() {
                    if profile.first_positions[a] != usize::MAX {
                        *count += 1;
                    }
                }
            }

            let total_f64 = total_cases as f64;
            let min_support = 0.1;
            let min_confidence = 0.8;

            for a in 0..n {
                let support = activity_counts[a] as f64 / total_f64;
                if support >= min_support {
                    model.constraints.push(DeclareConstraint {
                        template: "Existence".to_string(),
                        activities: vec![col.vocab[a].to_string()],
                        support,
                        confidence: 1.0,
                    });
                } else if (1.0 - support) >= min_support {
                    model.constraints.push(DeclareConstraint {
                        template: "Absence".to_string(),
                        activities: vec![col.vocab[a].to_string()],
                        support: 1.0 - support,
                        confidence: 1.0,
                    });
                }

                for b in 0..n {
                    if a == b {
                        continue;
                    }

                    let mut both_count = 0;
                    let mut a_before_b_count = 0;
                    let mut a_immediately_before_b_count = 0;
                    for profile in &traces_profiles {
                        let has_a = profile.first_positions[a] != usize::MAX;
                        let has_b = profile.first_positions[b] != usize::MAX;

                        if has_a && has_b {
                            both_count += 1;
                            if profile.appears_before(a, b) {
                                a_before_b_count += 1;
                            }
                            if profile.immediate_follows.contains(&(a as u32, b as u32)) {
                                a_immediately_before_b_count += 1;
                            }
                        }
                    }

                    // CoExistence
                    if a < b {
                        let coex_support = both_count as f64 / total_f64;
                        if coex_support >= min_support {
                            model.constraints.push(DeclareConstraint {
                                template: "CoExistence".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support: coex_support,
                                confidence: 1.0,
                            });
                        }

                        // NotCoExistence
                        let not_coex_support = (total_cases - both_count) as f64 / total_f64;
                        if not_coex_support >= 0.9 {
                            model.constraints.push(DeclareConstraint {
                                template: "NotCoExistence".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support: not_coex_support,
                                confidence: 1.0,
                            });
                        }
                    }

                    // Response: A -> eventually B
                    if activity_counts[a] > 0 {
                        let conf = a_before_b_count as f64 / activity_counts[a] as f64;
                        if conf >= min_confidence {
                            model.constraints.push(DeclareConstraint {
                                template: "Response".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support: a_before_b_count as f64 / total_f64,
                                confidence: conf,
                            });
                        }
                    }

                    // Precedence: B -> always preceded by A
                    if activity_counts[b] > 0 {
                        let conf = a_before_b_count as f64 / activity_counts[b] as f64;
                        if conf >= min_confidence {
                            model.constraints.push(DeclareConstraint {
                                template: "Precedence".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support: a_before_b_count as f64 / total_f64,
                                confidence: conf,
                            });
                        }
                    }

                    // Succession: Response + Precedence
                    if activity_counts[a] > 0 && activity_counts[b] > 0 {
                        let conf_a = a_before_b_count as f64 / activity_counts[a] as f64;
                        let conf_b = a_before_b_count as f64 / activity_counts[b] as f64;
                        if conf_a >= min_confidence && conf_b >= min_confidence {
                            model.constraints.push(DeclareConstraint {
                                template: "Succession".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support: a_before_b_count as f64 / total_f64,
                                confidence: (conf_a + conf_b) / 2.0,
                            });
                        }
                    }

                    // ChainResponse: A -> immediately B
                    if activity_counts[a] > 0 {
                        let conf = a_immediately_before_b_count as f64 / activity_counts[a] as f64;
                        if conf >= min_confidence {
                            model.constraints.push(DeclareConstraint {
                                template: "ChainResponse".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support: a_immediately_before_b_count as f64 / total_f64,
                                confidence: conf,
                            });
                        }
                    }

                    // ChainPrecedence: B -> always immediately preceded by A
                    if activity_counts[b] > 0 {
                        let conf = a_immediately_before_b_count as f64 / activity_counts[b] as f64;
                        if conf >= min_confidence {
                            model.constraints.push(DeclareConstraint {
                                template: "ChainPrecedence".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support: a_immediately_before_b_count as f64 / total_f64,
                                confidence: conf,
                            });
                        }
                    }
                }
            }

            let constraint_count = model.constraints.len();
            tracing::info!(
                target: "wasm4pm.discovery.declare",
                checkpoint = "result_generation",
                constraint_count = constraint_count,
                activity_count = n,
                "DECLARE discovery completed"
            );

            to_js_str(&model)
    })
}

/// Get list of available discovery algorithms
#[wasm_bindgen]
pub fn available_discovery_algorithms() -> JsValue {
    to_js_str(&json!({
        "algorithms": [
            {
                "name": "dfg",
                "description": "Directly-Follows Graph discovery from EventLog",
                "input": "EventLog",
                "parameters": ["activity_key"],
                "status": "implemented"
            },
            {
                "name": "ocel_dfg",
                "description": "Object-Centric Directly-Follows Graph discovery",
                "input": "OCEL",
                "parameters": [],
                "status": "implemented"
            },
            {
                "name": "declare",
                "description": "DECLARE constraint discovery",
                "input": "EventLog",
                "parameters": ["activity_key"],
                "status": "implemented"
            },
            {
                "name": "causal_alpha",
                "description": "Causal graph discovery using alpha miner variant (binary causality)",
                "input": "EventLog",
                "parameters": ["activity_key"],
                "status": "implemented"
            },
            {
                "name": "causal_heuristic",
                "description": "Causal graph discovery using heuristic variant (threshold-based)",
                "input": "EventLog",
                "parameters": ["activity_key", "threshold"],
                "status": "implemented"
            },
            {
                "name": "alpha_plus_plus",
                "description": "Alpha++ algorithm for Petri net discovery",
                "input": "EventLog",
                "parameters": ["activity_key", "min_support"],
                "status": "planned"
            }
        ]
    }))
    .unwrap_or(JsValue::NULL)
}

/// Get discovery module info
#[wasm_bindgen]
pub fn discovery_info() -> JsValue {
    to_js_str(&json!({
        "status": "discovery_module_operational",
        "implemented_algorithms": ["dfg", "ocel_dfg", "declare", "causal_alpha", "causal_heuristic"],
        "note": "Core discovery algorithms implemented as WASM-native code"
    }))
    .unwrap_or(JsValue::NULL)
}
