use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use rustc_hash::FxHashMap;
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Discover a Directly-Follows Graph (DFG) from an EventLog
#[wasm_bindgen]
pub fn discover_dfg(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut dfg = DirectlyFollowsGraph::new();

            // Single-pass columnar DFG construction:
            //   1. to_columnar() encodes activities as u32 IDs into a flat Vec<u32>
            //   2. One sequential scan computes node freq, edge counts, start/end — all at once
            //   3. Integer-keyed HashMap<(u32,u32),usize> is ~6× smaller than (String,String)
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

            // Pre-allocate nodes from vocabulary (already deduplicated by to_columnar)
            dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
                id: act.to_owned(),
                label: act.to_owned(),
                frequency: 0,
            }));

            let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

            // Single sequential pass over flat integer array
            for t in 0..col.trace_offsets.len().saturating_sub(1) {
                let start = col.trace_offsets[t];
                let end = col.trace_offsets[t + 1];
                if start >= end {
                    continue;
                }

                // Node frequencies
                for &id in &col.events[start..end] {
                    dfg.nodes[id as usize].frequency += 1;
                }
                // Directly-follows edges
                for i in start..end - 1 {
                    *edge_counts
                        .entry((col.events[i], col.events[i + 1]))
                        .or_insert(0) += 1;
                }
                // Start / end activities
                *dfg.start_activities
                    .entry(col.vocab[col.events[start] as usize].to_owned())
                    .or_insert(0) += 1;
                *dfg.end_activities
                    .entry(col.vocab[col.events[end - 1] as usize].to_owned())
                    .or_insert(0) += 1;
            }

            // Materialise edges (integer IDs → string names)
            dfg.edges
                .extend(
                    edge_counts
                        .into_iter()
                        .map(|((f, t), freq)| DirectlyFollowsRelation {
                            from: col.vocab[f as usize].to_owned(),
                            to: col.vocab[t as usize].to_owned(),
                            frequency: freq,
                        }),
                );

            to_js_str(&dfg)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })
}

/// Discover a DFG and store it in WASM state, returning a handle string.
///
/// Identical to `discover_dfg` but stores the result internally so that
/// handle-based functions (e.g. `score_anomaly`) can reference it.
#[wasm_bindgen]
pub fn discover_dfg_handle(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let dfg =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let mut dfg = DirectlyFollowsGraph::new();

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

                dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
                    id: act.to_owned(),
                    label: act.to_owned(),
                    frequency: 0,
                }));

                let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

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
                            .or_insert(0) += 1;
                    }
                    *dfg.start_activities
                        .entry(col.vocab[col.events[start] as usize].to_owned())
                        .or_insert(0) += 1;
                    *dfg.end_activities
                        .entry(col.vocab[col.events[end - 1] as usize].to_owned())
                        .or_insert(0) += 1;
                }

                dfg.edges
                    .extend(edge_counts.into_iter().map(|((f, t), freq)| {
                        DirectlyFollowsRelation {
                            from: col.vocab[f as usize].to_owned(),
                            to: col.vocab[t as usize].to_owned(),
                            frequency: freq,
                        }
                    }));

                Ok(dfg)
            }
            Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
            None => Err(wasm_err(
                codes::INVALID_HANDLE,
                format!("EventLog '{}' not found", eventlog_handle),
            )),
        })?;

    let handle = get_or_init_state().store_object(StoredObject::DirectlyFollowsGraph(dfg))?;
    Ok(crate::error::js_val(&handle))
}

/// Pure-Rust OCEL DFG discovery: returns DirectlyFollowsGraph without wasm-bindgen.
///
/// This is the testable core of `discover_ocel_dfg`. Integration tests
/// on native targets cannot call `#[wasm_bindgen]` functions, so they use
/// this instead.
pub fn discover_ocel_dfg_pure(ocel: &OCEL) -> DirectlyFollowsGraph {
    let mut dfg = DirectlyFollowsGraph::new();

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

    // Sort events by timestamp (ISO 8601 sort works lexicographically for ISO format)
    for events in events_by_object.values_mut() {
        events.sort_by_key(|(idx, _)| ocel.events[*idx].timestamp.clone());
    }

    // Build an edge map for O(1) frequency updates instead of O(n)
    // Vec::find per pair, and use .windows(2) to eliminate bounds-check branches.
    let mut edge_map: FxHashMap<(String, String), usize> = FxHashMap::default();
    for events in events_by_object.values() {
        for pair in events.windows(2) {
            let from = pair[0].1;
            let to = pair[1].1;
            *edge_map
                .entry((from.to_string(), to.to_string()))
                .or_insert(0) += 1;
        }
    }
    for ((from, to), freq) in edge_map {
        dfg.edges.push(DirectlyFollowsRelation {
            from,
            to,
            frequency: freq,
        });
    }

    // Collect start/end event types using .first()/.last() to eliminate
    // manual bounds checks and the len()-1 index expression.
    for obj_id in events_by_object.keys() {
        if let Some(events) = events_by_object.get(obj_id) {
            if let Some(first) = events.first() {
                *dfg.start_activities.entry(first.1.to_string()).or_insert(0) += 1;
            }
            if let Some(last) = events.last() {
                *dfg.end_activities.entry(last.1.to_string()).or_insert(0) += 1;
            }
        }
    }

    dfg
}

/// Discover a Directly-Follows Graph (DFG) from an OCEL
#[wasm_bindgen]
pub fn discover_ocel_dfg(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let dfg = discover_ocel_dfg_pure(ocel);
            to_js_str(&dfg)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", ocel_handle),
        )),
    })
}

/// Discover a Directly-Follows Graph (DFG) per object type from an OCEL
#[wasm_bindgen]
pub fn discover_ocel_dfg_per_type(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let mut result: FxHashMap<String, DirectlyFollowsGraph> = FxHashMap::default();

            // For each object type, discover a separate DFG
            for obj_type in &ocel.object_types {
                let mut dfg = DirectlyFollowsGraph::new();

                // Initialize nodes for activities
                let mut activity_nodes: FxHashMap<String, bool> = FxHashMap::default();
                for event in &ocel.events {
                    activity_nodes.insert(event.event_type.clone(), false);
                }
                for activity in activity_nodes.keys() {
                    dfg.nodes.push(DFGNode {
                        id: activity.clone(),
                        label: activity.clone(),
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

                // Sort events by timestamp (ISO 8601 sort works lexicographically for ISO format)
                for events in events_by_object.values_mut() {
                    events.sort_by_key(|(idx, _)| ocel.events[*idx].timestamp.clone());
                }

                // Count activity frequencies only for relevant events of this object type
                let mut activity_counts: FxHashMap<String, usize> = FxHashMap::default();
                for events in events_by_object.values() {
                    for (_, event_type) in events {
                        *activity_counts.entry(event_type.to_string()).or_insert(0) += 1;
                    }
                }
                for node in &mut dfg.nodes {
                    if let Some(count) = activity_counts.get(&node.id) {
                        node.frequency = *count;
                    }
                }

                let mut edge_map: FxHashMap<(String, String), usize> = FxHashMap::default();
                for events in events_by_object.values() {
                    for pair in events.windows(2) {
                        let from = pair[0].1;
                        let to = pair[1].1;
                        *edge_map
                            .entry((from.to_string(), to.to_string()))
                            .or_insert(0) += 1;
                    }
                }
                for ((from, to), freq) in edge_map {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from,
                        to,
                        frequency: freq,
                    });
                }

                // Collect start/end activities (now correctly using events_by_object.keys())
                for obj_id in events_by_object.keys() {
                    if let Some(events) = events_by_object.get(obj_id) {
                        if let Some(first) = events.first() {
                            *dfg.start_activities.entry(first.1.to_string()).or_insert(0) += 1;
                        }
                        if let Some(last) = events.last() {
                            *dfg.end_activities.entry(last.1.to_string()).or_insert(0) += 1;
                        }
                    }
                }

                result.insert(obj_type.clone(), dfg);
            }

            // Return as JSON: { "Order": { ... DFG ... }, "Item": { ... } }
            to_js_str(&result)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", ocel_handle),
        )),
    })
}

struct TraceProfile {
    /// Bitmask of present activities (A <= 128).
    activity_mask: u128,
    /// first_position[a] = index of first occurrence of activity a in trace
    /// (or u8::MAX if not present).
    first_positions: Vec<u8>,
    /// last_position[a] = index of last occurrence of activity a in trace
    /// (or u8::MAX if not present).
    last_positions: Vec<u8>,
    /// immediate_follows[(a,b)] = true if a is immediately followed by b at least once
    immediate_follows: std::collections::HashSet<(u32, u32)>,
}

impl TraceProfile {
    fn new(n: usize) -> Self {
        TraceProfile {
            activity_mask: 0,
            first_positions: vec![u8::MAX; n],
            last_positions: vec![u8::MAX; n],
            immediate_follows: std::collections::HashSet::new(),
        }
    }

    /// Mark activity as present at given position.
    fn mark_activity(&mut self, activity_idx: usize, position: usize) {
        if activity_idx < 128 {
            self.activity_mask |= 1u128 << (activity_idx as u128);
        }
        if position < 256 {
            if self.first_positions[activity_idx] == u8::MAX {
                self.first_positions[activity_idx] = position as u8;
            }
            self.last_positions[activity_idx] = position as u8;
        }
    }

    /// Check if activity a appeared before activity b in this trace.
    #[inline(always)]
    fn appears_before(&self, a: usize, b: usize) -> bool {
        let fa = self.first_positions[a];
        let fb = self.first_positions[b];
        (fa != u8::MAX) & (fb != u8::MAX) & (fa < fb)
    }

    /// Check if activity a appeared after activity b in this trace.
    #[inline(always)]
    fn appears_after(&self, a: usize, b: usize) -> bool {
        let la = self.last_positions[a];
        let fb = self.first_positions[b];
        (la != u8::MAX) & (fb != u8::MAX) & (la > fb)
    }
}

/// Discover DECLARE constraints from an EventLog
#[wasm_bindgen]
pub fn discover_declare(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
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

            model.activities = col.vocab.iter().map(|s| s.to_string()).collect();

            if n == 0 || total_cases == 0 {
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

            // Phase 2: Iterate over activity pairs and count template matches
            let mut activity_counts = vec![0u32; n];
            for profile in &traces_profiles {
                for a in 0..n {
                    if profile.first_positions[a] != u8::MAX {
                        activity_counts[a] += 1;
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
                    let mut b_immediately_before_a_count = 0;
                    let mut only_one_count = 0;

                    for profile in &traces_profiles {
                        let has_a = profile.first_positions[a] != u8::MAX;
                        let has_b = profile.first_positions[b] != u8::MAX;

                        if has_a && has_b {
                            both_count += 1;
                            if profile.appears_before(a, b) {
                                a_before_b_count += 1;
                            }
                            if profile.immediate_follows.contains(&(a as u32, b as u32)) {
                                a_immediately_before_b_count += 1;
                            }
                            if profile.immediate_follows.contains(&(b as u32, a as u32)) {
                                b_immediately_before_a_count += 1;
                            }
                        } else if has_a || has_b {
                            only_one_count += 1;
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

            to_js_str(&model)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
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
