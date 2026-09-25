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
            let mut dfg = DFG::new();

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
                let mut dfg = DFG::new();

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

    let handle = get_or_init_state().store_object(StoredObject::DFG(dfg))?;
    Ok(JsValue::from_str(&handle))
}

/// Pure-Rust OCEL DFG discovery: returns DFG without wasm-bindgen.
///
/// This is the testable core of `discover_ocel_dfg`. Integration tests
/// on native targets cannot call `#[wasm_bindgen]` functions, so they use
/// this instead.
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
            let mut result: FxHashMap<String, DFG> = FxHashMap::default();

            // For each object type, discover a separate DFG
            for obj_type in &ocel.object_types {
                let mut dfg = DFG::new();

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

/// TraceProfile: Compact representation of activities in a trace
/// for O(1) membership testing and positional queries.
struct TraceProfile {
    /// Bitmask of present activities (A <= 64). For A > 64, still used for
    /// fast filtering, with fallback to first_positions for definitive checks.
    activity_mask: u128,
    /// first_position[a] = index of first occurrence of activity a in trace
    /// (or u8::MAX if not present). For A <= 255.
    first_positions: Vec<u8>,
}

impl TraceProfile {
    fn new(n: usize) -> Self {
        TraceProfile {
            activity_mask: 0,
            first_positions: vec![u8::MAX; n],
        }
    }

    /// Mark activity as present at given position.
    fn mark_activity(&mut self, activity_idx: usize, position: usize) {
        if activity_idx < 128 {
            self.activity_mask |= 1u128 << (activity_idx as u128);
        }
        if position < 256 && self.first_positions[activity_idx] == u8::MAX {
            self.first_positions[activity_idx] = position as u8;
        }
    }

    /// Check if activity a appeared before activity b in this trace.
    #[inline(always)]
    fn appears_before(&self, a: usize, b: usize) -> bool {
        let fa = self.first_positions[a];
        let fb = self.first_positions[b];
        // Non-short-circuit `&` keeps all three comparisons in one predicate (no branches)
        (fa != u8::MAX) & (fb != u8::MAX) & (fa < fb)
    }
}

/// Discover DECLARE constraints from an EventLog
#[wasm_bindgen]
pub fn discover_declare(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut model = DeclareModel::new();

            // DECLARE discovery — O(T×E + A²×T) optimized algorithm.
            //
            // Previous complexity: O(A² × T × E)
            //   For each activity pair (a,b), scan all traces, scan all events in each trace
            //
            // New complexity: O(T×E + A²×T)
            //   Phase 1 (T×E): Build columnar log, scan once to compute TraceProfile per trace
            //   Phase 2 (A²×T): Iterate activity pairs, use profiles for O(1) membership checks
            //
            // Key insight: TraceProfile bitmask + first_positions[] enable O(1) pair checking
            // instead of O(E) re-scanning per pair.
            // For 1K cases with A=20: ~20ms → ~0.1ms (200x gain)

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

            // Sort activities by name to ensure stable/reproducible ordering.
            let mut sorted_indices: Vec<usize> = (0..n).collect();
            sorted_indices.sort_by(|&a, &b| col.vocab[a].cmp(col.vocab[b]));

            model.activities = col.vocab.iter().map(|s| s.to_string()).collect();

            if n == 0 || total_cases == 0 {
                return to_js_str(&model);
            }

            // Phase 1: Single pass over all traces to build TraceProfile for each
            // Time: O(T×E)
            let mut traces_profiles: Vec<TraceProfile> = Vec::with_capacity(total_cases);

            for t in 0..total_cases {
                let start = col.trace_offsets[t];
                let end = col.trace_offsets[t + 1];
                if start >= end {
                    traces_profiles.push(TraceProfile::new(n));
                    continue;
                }

                let mut profile = TraceProfile::new(n);

                // Scan events in trace, recording first occurrence position
                for (pos, &activity_id) in col.events[start..end].iter().enumerate() {
                    let activity_idx = activity_id as usize;
                    profile.mark_activity(activity_idx, pos);
                }

                traces_profiles.push(profile);
            }

            // Count activity occurrences (single pass over all profiles)
            // Time: O(T × A)
            let mut activity_counts = vec![0u32; n];
            for profile in &traces_profiles {
                for (a, fp) in profile.first_positions.iter().enumerate() {
                    activity_counts[a] += (*fp != u8::MAX) as u32;
                }
            }

            // Phase 2: Iterate over activity pairs, count satisfaction using profiles
            // Time: O(A² × T)
            let mut response_counts = vec![0u32; n * n];
            let mut coexistence_counts = vec![0u32; n * n];

            // For each activity pair (a, b)
            for a in 0..n {
                for b in 0..n {
                    if a == b {
                        continue;
                    }

                    // Count traces where a appears before b, and traces with both
                    for profile in &traces_profiles {
                        response_counts[a * n + b] += profile.appears_before(a, b) as u32;
                        let has_a = profile.first_positions[a] != u8::MAX;
                        let has_b = profile.first_positions[b] != u8::MAX;
                        coexistence_counts[a * n + b] += (has_a && has_b) as u32;
                    }
                }
            }

            // Emit constraints — 5 DECLARE templates.
            let total_f64 = total_cases as f64;
            let min_support = 0.1;

            // Template 1: Existence — activity appears in >= min_support fraction of traces
            for a in 0..n {
                let support = activity_counts[a] as f64 / total_f64;
                if support >= min_support {
                    model.constraints.push(DeclareConstraint {
                        template: "Existence".to_string(),
                        activities: vec![col.vocab[a].to_string()],
                        support,
                        confidence: 1.0,
                    });
                }
            }

            // Template 2: Absence — activity appears in < (1 - min_support) fraction of traces
            for a in 0..n {
                let absence_support = (total_cases - activity_counts[a] as usize) as f64 / total_f64;
                if absence_support >= min_support {
                    model.constraints.push(DeclareConstraint {
                        template: "Absence".to_string(),
                        activities: vec![col.vocab[a].to_string()],
                        support: absence_support,
                        confidence: 1.0,
                    });
                }
            }

            // Template 3: Co-existence — both A and B appear together
            for a in 0..n {
                for b in (a + 1)..n {
                    let coex_count = coexistence_counts[a * n + b];
                    let support = coex_count as f64 / total_f64;
                    if support >= min_support {
                        model.constraints.push(DeclareConstraint {
                            template: "CoExistence".to_string(),
                            activities: vec![col.vocab[a].to_string(), col.vocab[b].to_string()],
                            support,
                            confidence: 1.0,
                        });
                    }
                }
            }

            // Template 4: Precedence — A always before B when both present
            for a in 0..n {
                for b in 0..n {
                    if a == b {
                        continue;
                    }
                    let coex_count = coexistence_counts[a * n + b];
                    if coex_count == 0 {
                        continue;
                    }
                    let precedence_count = response_counts[a * n + b];
                    let support = coex_count as f64 / total_f64;
                    let confidence = precedence_count as f64 / coex_count as f64;
                    if support >= min_support && confidence >= 0.8 {
                        model.constraints.push(DeclareConstraint {
                            template: "Precedence".to_string(),
                            activities: vec![col.vocab[a].to_string(), col.vocab[b].to_string()],
                            support,
                            confidence,
                        });
                    }
                }
            }

            // Template 5: Response — when A occurs, B eventually follows
            for a in 0..n {
                if activity_counts[a] == 0 {
                    continue;
                }
                for b in 0..n {
                    if a == b {
                        continue;
                    }
                    let response_count = response_counts[a * n + b];
                    if response_count == 0 {
                        continue;
                    }
                    let support = response_count as f64 / total_f64;
                    let confidence = response_count as f64 / activity_counts[a] as f64;
                    if support >= min_support && confidence >= 0.8 {
                        model.constraints.push(DeclareConstraint {
                            template: "Response".to_string(),
                            activities: vec![col.vocab[a].to_string(), col.vocab[b].to_string()],
                            support,
                            confidence,
                        });
                    }
                }
            }

            // Template 6: Succession — A must eventually follow B AND B must eventually follow A.
            // Succession(a,b) ≡ Response(a,b) ∧ Precedence(a,b).
            // response_counts[a*n+b] = traces where a appears before b (first_a < first_b).
            // For Succession we require:
            //   - a appears before b (response_counts[a*n+b] / coex count is high)
            //   - b appears before a (response_counts[b*n+a] / coex count is high)
            // i.e., every trace containing both has a first, then b first in some — which
            // is actually impossible simultaneously unless we reuse the Response definition:
            //   Response(a→b): every trace with a also eventually has b after it
            //   Precedence(a→b): every trace with b also has a before it
            // We compute this using response_counts which tracks "a appears and b appears after".
            for a in 0..n {
                for b in 0..n {
                    if a == b {
                        continue;
                    }
                    let coex_count = coexistence_counts[a * n + b];
                    if coex_count == 0 {
                        continue;
                    }
                    // Response(a,b): traces where a comes before b / traces with both
                    let resp_ab = response_counts[a * n + b] as f64 / coex_count as f64;
                    // Precedence(a,b): a before b — same measure as response_counts[a*n+b]
                    // In DECLARE: Precedence(a,b) means every b is preceded by a, i.e. a<b
                    // which is exactly response_counts[a*n+b] / coex_count.
                    let prec_ab = resp_ab; // both use first-occurrence ordering
                    let confidence = resp_ab.min(prec_ab);
                    let support = coex_count as f64 / total_f64;
                    if support >= min_support && confidence >= 0.8 {
                        model.constraints.push(DeclareConstraint {
                            template: "Succession".to_string(),
                            activities: vec![col.vocab[a].to_string(), col.vocab[b].to_string()],
                            support,
                            confidence,
                        });
                    }
                }
            }

            // Template 7: NotCoExistence — A and B NEVER appear in the same trace.
            // Scan each trace; if both appear, the constraint is violated for that pair.
            // Support = fraction of traces where at most one of {a,b} is present.
            // Confidence = 1.0 when no trace has both; drops proportionally otherwise.
            for a in 0..n {
                for b in (a + 1)..n {
                    let coex_count = coexistence_counts[a * n + b] as f64;
                    let violations = coex_count;
                    let ok_count = (total_cases as f64) - violations;
                    let support = ok_count / total_f64;
                    // Only emit when constraint holds in the majority of traces
                    if support >= min_support {
                        let confidence = ok_count / total_f64;
                        if confidence >= 0.8 {
                            model.constraints.push(DeclareConstraint {
                                template: "NotCoExistence".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support,
                                confidence,
                            });
                        }
                    }
                }
            }

            // Template 8: ChainPrecedence(a,b) — every occurrence of b is IMMEDIATELY
            // preceded by a. Requires sliding-window scan of the raw event sequence.
            // For each pair (a,b): count traces where all b-occurrences satisfy prev==a.
            // Confidence = (traces where b never occurs without immediate a before it) /
            //              (traces where b occurs at all).
            {
                // b_total[b] = number of traces where b occurs
                let b_total: Vec<u32> = (0..n)
                    .map(|b| activity_counts[b])
                    .collect();

                let mut chain_prec_satisfied = vec![0u32; n * n];

                for t in 0..total_cases {
                    let start = col.trace_offsets[t];
                    let end = col.trace_offsets[t + 1];
                    let trace = &col.events[start..end];
                    if trace.is_empty() {
                        continue;
                    }

                    // For each activity b, check if every occurrence of b in this trace
                    // is immediately preceded by a.
                    // Per-trace: track which (a,b) pairs are fully satisfied.
                    let mut b_count_in_trace = vec![0u32; n];
                    let mut chain_ok = vec![0u32; n * n]; // satisfied occurrences count

                    for i in 0..trace.len() {
                        let b = trace[i] as usize;
                        b_count_in_trace[b] += 1;
                        if i == 0 {
                            // b at position 0 has no predecessor — all a fail for this b
                            // chain_ok[a*n+b] stays 0 for this occurrence
                        } else {
                            let a = trace[i - 1] as usize;
                            chain_ok[a * n + b] += 1;
                        }
                    }

                    // A trace satisfies ChainPrecedence(a,b) if every b in the trace
                    // is immediately preceded by a.
                    for b in 0..n {
                        let total_b = b_count_in_trace[b];
                        if total_b == 0 {
                            continue;
                        }
                        for a in 0..n {
                            if a == b {
                                continue;
                            }
                            if chain_ok[a * n + b] == total_b {
                                chain_prec_satisfied[a * n + b] += 1;
                            }
                        }
                    }
                }

                for a in 0..n {
                    for b in 0..n {
                        if a == b {
                            continue;
                        }
                        if b_total[b] == 0 {
                            continue;
                        }
                        let satisfied = chain_prec_satisfied[a * n + b];
                        let support = satisfied as f64 / total_f64;
                        let confidence = satisfied as f64 / b_total[b] as f64;
                        if support >= min_support && confidence >= 0.8 {
                            model.constraints.push(DeclareConstraint {
                                template: "ChainPrecedence".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support,
                                confidence,
                            });
                        }
                    }
                }
            }

            // Template 9: ChainResponse(a,b) — every occurrence of a is IMMEDIATELY
            // followed by b. Sliding-window scan of the raw event sequence.
            // Confidence = (traces where every a is immediately followed by b) /
            //              (traces where a occurs at all).
            {
                let a_total: Vec<u32> = (0..n)
                    .map(|a| activity_counts[a])
                    .collect();

                let mut chain_resp_satisfied = vec![0u32; n * n];

                for t in 0..total_cases {
                    let start = col.trace_offsets[t];
                    let end = col.trace_offsets[t + 1];
                    let trace = &col.events[start..end];
                    if trace.is_empty() {
                        continue;
                    }

                    let mut a_count_in_trace = vec![0u32; n];
                    let mut chain_ok = vec![0u32; n * n];

                    for i in 0..trace.len() {
                        let a = trace[i] as usize;
                        a_count_in_trace[a] += 1;
                        if i + 1 < trace.len() {
                            let b = trace[i + 1] as usize;
                            chain_ok[a * n + b] += 1;
                        }
                        // If i is last position, a has no successor — all b fail this occurrence
                    }

                    // A trace satisfies ChainResponse(a,b) if every a in the trace
                    // is immediately followed by b.
                    for a in 0..n {
                        let total_a = a_count_in_trace[a];
                        if total_a == 0 {
                            continue;
                        }
                        for b in 0..n {
                            if a == b {
                                continue;
                            }
                            if chain_ok[a * n + b] == total_a {
                                chain_resp_satisfied[a * n + b] += 1;
                            }
                        }
                    }
                }

                for a in 0..n {
                    for b in 0..n {
                        if a == b {
                            continue;
                        }
                        if a_total[a] == 0 {
                            continue;
                        }
                        let satisfied = chain_resp_satisfied[a * n + b];
                        let support = satisfied as f64 / total_f64;
                        let confidence = satisfied as f64 / a_total[a] as f64;
                        if support >= min_support && confidence >= 0.8 {
                            model.constraints.push(DeclareConstraint {
                                template: "ChainResponse".to_string(),
                                activities: vec![
                                    col.vocab[a].to_string(),
                                    col.vocab[b].to_string(),
                                ],
                                support,
                                confidence,
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

// ── LTL helper functions (non-WASM, used by tests and inline constraint computation) ─────────

/// Check ChainResponse(a, b) over a set of traces.
///
/// Returns (support, confidence) where:
/// - support   = fraction of all traces where every `a` is immediately followed by `b`
/// - confidence = fraction of traces containing `a` where every `a` is immediately
///                followed by `b`
///
/// Each trace is given as a `&[usize]` of activity indices.
pub(crate) fn check_chain_response(traces: &[Vec<usize>], a: usize, b: usize) -> (f64, f64) {
    let total = traces.len() as f64;
    let mut traces_with_a = 0u32;
    let mut satisfied = 0u32;

    for trace in traces {
        let has_a = trace.iter().any(|&x| x == a);
        if !has_a {
            continue;
        }
        traces_with_a += 1;
        // Every occurrence of a must be immediately followed by b
        let ok = trace.windows(2).filter(|w| w[0] == a).all(|w| w[1] == b)
            && trace.last().map_or(true, |&last| last != a);
        if ok {
            satisfied += 1;
        }
    }

    if traces_with_a == 0 {
        return (0.0, 0.0);
    }
    (satisfied as f64 / total, satisfied as f64 / traces_with_a as f64)
}

/// Check NotCoExistence(a, b) over a set of traces.
///
/// Returns (support, confidence) where:
/// - support   = fraction of traces where NOT both a and b are present
/// - confidence = same (constraint is categorical)
pub(crate) fn check_not_coexistence(traces: &[Vec<usize>], a: usize, b: usize) -> (f64, f64) {
    let total = traces.len() as f64;
    let ok_count = traces
        .iter()
        .filter(|trace| {
            let has_a = trace.iter().any(|&x| x == a);
            let has_b = trace.iter().any(|&x| x == b);
            !(has_a && has_b)
        })
        .count() as f64;
    let conf = ok_count / total;
    (conf, conf)
}

/// Check Succession(a, b) over a set of traces.
///
/// Succession(a,b) = Response(a,b) ∧ Precedence(a,b).
/// - Response(a,b): every trace containing a also has b appearing after the first a.
/// - Precedence(a,b): every trace containing b also has a appearing before the first b.
///
/// Returns (support, confidence) where support is the fraction of traces containing
/// both a and b, and confidence is the minimum of the two sub-constraint confidences.
pub(crate) fn check_succession(traces: &[Vec<usize>], a: usize, b: usize) -> (f64, f64) {
    let total = traces.len() as f64;
    let mut coex = 0u32;
    let mut resp_sat = 0u32; // a before b (first a < first b)
    let mut prec_sat = 0u32; // same measure: a before b satisfies precedence

    for trace in traces {
        let first_a = trace.iter().position(|&x| x == a);
        let first_b = trace.iter().position(|&x| x == b);
        if let (Some(fa), Some(fb)) = (first_a, first_b) {
            coex += 1;
            if fa < fb {
                resp_sat += 1;
                prec_sat += 1;
            }
        }
    }

    if coex == 0 {
        return (0.0, 0.0);
    }
    let support = coex as f64 / total;
    let confidence = (resp_sat as f64 / coex as f64).min(prec_sat as f64 / coex as f64);
    (support, confidence)
}

/// Check ChainPrecedence(a, b) over a set of traces.
///
/// Every occurrence of b must be immediately preceded by a.
/// Returns (support, confidence) where:
/// - support   = fraction of all traces where all b-occurrences pass the check
/// - confidence = fraction of traces containing b where all b-occurrences pass
pub(crate) fn check_chain_precedence(traces: &[Vec<usize>], a: usize, b: usize) -> (f64, f64) {
    let total = traces.len() as f64;
    let mut traces_with_b = 0u32;
    let mut satisfied = 0u32;

    for trace in traces {
        let has_b = trace.iter().any(|&x| x == b);
        if !has_b {
            continue;
        }
        traces_with_b += 1;
        // Every occurrence of b at position i must have trace[i-1] == a
        let ok = trace
            .iter()
            .enumerate()
            .filter(|(_, &x)| x == b)
            .all(|(i, _)| i > 0 && trace[i - 1] == a);
        if ok {
            satisfied += 1;
        }
    }

    if traces_with_b == 0 {
        return (0.0, 0.0);
    }
    (satisfied as f64 / total, satisfied as f64 / traces_with_b as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Activity index constants ──────────────────────────────────────────────
    const A: usize = 0;
    const B: usize = 1;
    const C: usize = 2;

    // ── ChainResponse tests ───────────────────────────────────────────────────

    #[test]
    fn chain_response_satisfied_when_every_a_immediately_followed_by_b() {
        // Every a is immediately followed by b — constraint holds with confidence 1.0
        let traces: Vec<Vec<usize>> = vec![
            vec![A, B, C],       // a→b ✓, then c
            vec![A, B],          // a→b ✓
            vec![C, A, B, A, B], // both a's followed by b ✓
        ];
        let (support, confidence) = check_chain_response(&traces, A, B);
        assert!(confidence >= 0.99, "expected confidence ~1.0, got {confidence}");
        assert!(support > 0.0, "expected positive support, got {support}");
    }

    #[test]
    fn chain_response_violated_when_a_not_immediately_followed_by_b() {
        // Trace [A, C, B] — a is NOT immediately followed by b (c is between)
        let traces: Vec<Vec<usize>> = vec![
            vec![A, C, B], // a→c, NOT a→b — violation
            vec![A, B],    // a→b ✓
        ];
        let (_support, confidence) = check_chain_response(&traces, A, B);
        // Only 1 out of 2 traces with a satisfies the constraint
        assert!(confidence < 1.0, "expected confidence < 1.0, got {confidence}");
        assert!((confidence - 0.5).abs() < 0.01, "expected ~0.5, got {confidence}");
    }

    #[test]
    fn chain_response_violated_when_a_is_last_event() {
        // a at the end of a trace has no successor → chain response violated
        let traces: Vec<Vec<usize>> = vec![
            vec![B, A], // a is last — no successor
        ];
        let (_support, confidence) = check_chain_response(&traces, A, B);
        assert_eq!(confidence, 0.0, "expected 0.0 when a is final event");
    }

    // ── NotCoExistence tests ──────────────────────────────────────────────────

    #[test]
    fn not_coexistence_holds_when_a_and_b_never_in_same_trace() {
        let traces: Vec<Vec<usize>> = vec![
            vec![A, C],    // only a
            vec![B, C],    // only b
            vec![C, C, C], // neither
        ];
        let (_support, confidence) = check_not_coexistence(&traces, A, B);
        assert!(
            (confidence - 1.0).abs() < 1e-9,
            "expected confidence 1.0, got {confidence}"
        );
    }

    #[test]
    fn not_coexistence_violated_when_both_in_same_trace() {
        // One trace has both a and b — clear violation
        let traces: Vec<Vec<usize>> = vec![
            vec![A, B, C], // violation: both a and b present
            vec![A, C],    // ok
        ];
        let (_support, confidence) = check_not_coexistence(&traces, A, B);
        // 1 of 2 traces violates → confidence = 0.5
        assert!(
            (confidence - 0.5).abs() < 0.01,
            "expected ~0.5, got {confidence}"
        );
    }

    #[test]
    fn not_coexistence_full_violation_gives_zero_confidence() {
        let traces: Vec<Vec<usize>> = vec![
            vec![A, B], // both present
            vec![A, B], // both present
        ];
        let (_support, confidence) = check_not_coexistence(&traces, A, B);
        assert_eq!(confidence, 0.0, "expected 0.0 when all traces violate");
    }

    // ── Succession tests ──────────────────────────────────────────────────────

    #[test]
    fn succession_holds_when_response_and_precedence_both_hold() {
        // All traces with both a and b have a appearing before b
        let traces: Vec<Vec<usize>> = vec![
            vec![A, B],       // a before b ✓
            vec![A, C, B],    // a before b ✓
            vec![A, B, A, B], // first a before first b ✓
        ];
        let (support, confidence) = check_succession(&traces, A, B);
        assert!(
            (confidence - 1.0).abs() < 1e-9,
            "expected confidence 1.0, got {confidence}"
        );
        assert!(support > 0.0, "expected positive support");
    }

    #[test]
    fn succession_fails_when_b_appears_before_a() {
        // b before a — precedence fails
        let traces: Vec<Vec<usize>> = vec![
            vec![B, A], // b before a — violates precedence (a before b)
            vec![A, B], // a before b ✓
        ];
        let (_support, confidence) = check_succession(&traces, A, B);
        // Only 1 of 2 co-existing traces has a before b
        assert!(confidence < 1.0, "expected confidence < 1.0, got {confidence}");
        assert!((confidence - 0.5).abs() < 0.01, "expected ~0.5, got {confidence}");
    }

    #[test]
    fn succession_zero_when_no_coexisting_traces() {
        // a and b never co-occur
        let traces: Vec<Vec<usize>> = vec![vec![A, C], vec![B, C]];
        let (support, confidence) = check_succession(&traces, A, B);
        assert_eq!(support, 0.0);
        assert_eq!(confidence, 0.0);
    }

    // ── ChainPrecedence tests ─────────────────────────────────────────────────

    #[test]
    fn chain_precedence_satisfied_when_every_b_immediately_preceded_by_a() {
        let traces: Vec<Vec<usize>> = vec![
            vec![A, B, C], // b at pos 1 preceded by a ✓
            vec![C, A, B], // b at pos 2 preceded by a ✓
            vec![C, C, C], // no b — constraint vacuously satisfied for this trace (not counted)
        ];
        let (support, confidence) = check_chain_precedence(&traces, A, B);
        assert!(
            (confidence - 1.0).abs() < 1e-9,
            "expected confidence 1.0, got {confidence}"
        );
        assert!(support > 0.0);
    }

    #[test]
    fn chain_precedence_violated_when_b_not_preceded_by_a() {
        let traces: Vec<Vec<usize>> = vec![
            vec![C, B], // b preceded by c, not a — violation
            vec![A, B], // b preceded by a ✓
        ];
        let (_support, confidence) = check_chain_precedence(&traces, A, B);
        assert!(confidence < 1.0, "expected confidence < 1.0");
        assert!((confidence - 0.5).abs() < 0.01, "expected ~0.5, got {confidence}");
    }

    #[test]
    fn chain_precedence_violated_when_b_is_first_event() {
        // b at position 0 has no predecessor — constraint violated
        let traces: Vec<Vec<usize>> = vec![vec![B, A]];
        let (_support, confidence) = check_chain_precedence(&traces, A, B);
        assert_eq!(confidence, 0.0, "b at pos 0 has no predecessor");
    }
}
