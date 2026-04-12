//! Incremental Directly-Follows Graph (DFG) for O(1) per-event processing.
//!
//! Two-level design:
//! - **IncrementalDFG** — low-level state machine: integer-activity events,
//!   explicit trace-boundary control, O(1) amortized update per event.
//! - **StreamingDFG** — higher-level wrapper with automatic trace-boundary
//!   tracking and string-activity interning.
//!
//! Both support infinite event streams with bounded memory: edge and node
//! counts grow proportionally to the number of *unique* activities and edges,
//! not to the total event count.
//!
//! # WASM bindings
//!
//! `new_streaming_dfg`, `streaming_dfg_process_event`, `streaming_dfg_end_trace`,
//! `streaming_dfg_snapshot`, `streaming_dfg_stats` are exported for JavaScript
//! consumption. Internally they store an `IncrementalDFG` in the global
//! `AppState` via the `StoredObject::IncrementalDFG` variant.

use rustc_hash::{FxHashMap, FxHashSet};
use serde::Serialize;
use serde_json::json;
use wasm_bindgen::prelude::*;

use crate::error::{self, codes};
use crate::models::{DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation};
use crate::state;

// ---------------------------------------------------------------------------
// IncrementalDFG
// ---------------------------------------------------------------------------

/// Incremental DFG operating on integer-encoded activities.
///
/// Each call to [`process_event`](IncrementalDFG::process_event) is O(1)
/// amortized (two `FxHashMap` lookups/inserts). Callers are responsible for
/// signalling trace boundaries via [`end_trace`](IncrementalDFG::end_trace).
#[derive(Debug, Clone)]
pub struct IncrementalDFG {
    /// (from_activity, to_activity) -> occurrence count
    pub edges: FxHashMap<(u32, u32), u64>,
    /// activity -> occurrence count
    pub node_counts: FxHashMap<u32, u64>,
    /// Total number of events processed
    pub total_events: u64,
    /// Activities that started a trace
    pub start_activities: FxHashSet<u32>,
    /// Activities that ended a trace
    pub end_activities: FxHashSet<u32>,
    /// Previous event's activity within the current trace
    pub last_activity: Option<u32>,
}

impl IncrementalDFG {
    /// Create an empty incremental DFG.
    pub fn new() -> Self {
        IncrementalDFG {
            edges: FxHashMap::default(),
            node_counts: FxHashMap::default(),
            total_events: 0,
            start_activities: FxHashSet::default(),
            end_activities: FxHashSet::default(),
            last_activity: None,
        }
    }

    /// Process a single event. O(1) amortized.
    ///
    /// - If `is_trace_start` is `true` the activity is recorded as a start
    ///   activity and no edge is created (even if a previous activity exists
    ///   from a prior unclosed trace).
    /// - Otherwise an edge `last_activity -> activity` is recorded.
    pub fn process_event(&mut self, activity: u32, is_trace_start: bool) {
        if is_trace_start {
            // Mark as start activity; no edge from previous trace
            self.start_activities.insert(activity);
            self.last_activity = Some(activity);
        } else if let Some(prev) = self.last_activity {
            // Record directly-follows edge
            *self.edges.entry((prev, activity)).or_insert(0) += 1;
            self.last_activity = Some(activity);
        } else {
            // No previous activity and not explicitly a start — treat as start
            self.start_activities.insert(activity);
            self.last_activity = Some(activity);
        }

        *self.node_counts.entry(activity).or_insert(0) += 1;
        self.total_events += 1;
    }

    /// End the current trace: record the last activity as an end activity
    /// and reset the per-trace cursor.
    pub fn end_trace(&mut self) {
        if let Some(last) = self.last_activity.take() {
            self.end_activities.insert(last);
        }
    }

    /// Convert the incremental state into a full [`DirectlyFollowsGraph`].
    ///
    /// Activities are rendered as `"activity_<id>"` strings because this
    /// struct operates on integer IDs. Use [`StreamingDFG`] for string
    /// labels.
    pub fn snapshot(&self) -> DirectlyFollowsGraph {
        let mut dfg = DirectlyFollowsGraph::new();

        // Nodes
        dfg.nodes = self
            .node_counts
            .iter()
            .map(|(&id, &count)| {
                let label = format!("activity_{}", id);
                DFGNode {
                    id: label.clone(),
                    label,
                    frequency: count as usize,
                }
            })
            .collect();

        // Edges
        dfg.edges = self
            .edges
            .iter()
            .map(|(&(from, to), &freq)| DirectlyFollowsRelation {
                from: format!("activity_{}", from),
                to: format!("activity_{}", to),
                frequency: freq as usize,
            })
            .collect();

        // Start / end activities
        for &id in &self.start_activities {
            dfg.start_activities.insert(format!("activity_{}", id), 0);
        }
        for &id in &self.end_activities {
            dfg.end_activities.insert(format!("activity_{}", id), 0);
        }

        dfg
    }

    /// Merge another `IncrementalDFG` into this one.
    ///
    /// Useful for parallel aggregation: split a stream across workers,
    /// build partial DFGs, then merge.
    pub fn merge(&mut self, other: &IncrementalDFG) {
        // Merge edges
        for (&key, &count) in &other.edges {
            *self.edges.entry(key).or_insert(0) += count;
        }
        // Merge node counts
        for (&key, &count) in &other.node_counts {
            *self.node_counts.entry(key).or_insert(0) += count;
        }
        // Merge start/end activities
        self.start_activities.extend(&other.start_activities);
        self.end_activities.extend(&other.end_activities);
        // Sum totals
        self.total_events += other.total_events;
        // last_activity is not merged — it is per-trace cursor state
    }

    /// Reset to empty state.
    pub fn clear(&mut self) {
        self.edges.clear();
        self.node_counts.clear();
        self.total_events = 0;
        self.start_activities.clear();
        self.end_activities.clear();
        self.last_activity = None;
    }

    /// Return (total_events, unique_activities, unique_edges).
    pub fn stats(&self) -> (u64, u64, u64) {
        (
            self.total_events,
            self.node_counts.len() as u64,
            self.edges.len() as u64,
        )
    }
}

impl Default for IncrementalDFG {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// StreamingDFG
// ---------------------------------------------------------------------------

/// Higher-level streaming DFG that manages activity interning and
/// automatic trace-boundary tracking.
///
/// Maintains a string-to-integer vocabulary so the inner [`IncrementalDFG`]
/// can operate on `u32` IDs for fast hashing.
#[derive(Debug, Clone)]
pub struct StreamingDFG {
    /// String activity name -> integer ID
    vocab_map: FxHashMap<String, u32>,
    /// Integer ID -> string activity name
    vocab: Vec<String>,
    /// The core incremental DFG
    inner: IncrementalDFG,
}

impl StreamingDFG {
    /// Create an empty streaming DFG.
    pub fn new() -> Self {
        StreamingDFG {
            vocab_map: FxHashMap::default(),
            vocab: Vec::new(),
            inner: IncrementalDFG::new(),
        }
    }

    /// Intern an activity string, returning its `u32` ID.
    #[inline]
    fn intern(&mut self, activity: &str) -> u32 {
        if let Some(&id) = self.vocab_map.get(activity) {
            return id;
        }
        let id = self.vocab.len() as u32;
        self.vocab.push(activity.to_owned());
        self.vocab_map.insert(activity.to_owned(), id);
        id
    }

    /// Process a single event by activity name.
    ///
    /// If this is the first event (no previous activity), it is treated as
    /// a trace start automatically.
    pub fn process_event(&mut self, activity: &str) {
        let id = self.intern(activity);
        let is_trace_start = self.inner.last_activity.is_none();
        self.inner.process_event(id, is_trace_start);
    }

    /// End the current trace.
    pub fn end_trace(&mut self) {
        self.inner.end_trace();
    }

    /// Convert to a full [`DirectlyFollowsGraph`] with human-readable labels.
    pub fn snapshot(&self) -> DirectlyFollowsGraph {
        let mut dfg = DirectlyFollowsGraph::new();

        // Nodes
        dfg.nodes = self
            .inner
            .node_counts
            .iter()
            .filter_map(|(&id, &count)| {
                let label = self.vocab.get(id as usize).cloned()?;
                Some(DFGNode {
                    id: label.clone(),
                    label,
                    frequency: count as usize,
                })
            })
            .collect();

        // Edges
        dfg.edges = self
            .inner
            .edges
            .iter()
            .filter_map(|(&(from, to), &freq)| {
                let from_label = self.vocab.get(from as usize).cloned()?;
                let to_label = self.vocab.get(to as usize).cloned()?;
                Some(DirectlyFollowsRelation {
                    from: from_label,
                    to: to_label,
                    frequency: freq as usize,
                })
            })
            .collect();

        // Start / end activities
        for &id in &self.inner.start_activities {
            if let Some(name) = self.vocab.get(id as usize) {
                dfg.start_activities.insert(name.clone(), 0);
            }
        }
        for &id in &self.inner.end_activities {
            if let Some(name) = self.vocab.get(id as usize) {
                dfg.end_activities.insert(name.clone(), 0);
            }
        }

        dfg
    }

    /// Total events processed.
    pub fn event_count(&self) -> u64 {
        self.inner.total_events
    }
}

impl Default for StreamingDFG {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// WASM bindings
// ---------------------------------------------------------------------------

/// Stats payload for JSON serialization.
#[derive(Debug, Serialize)]
struct StreamingDfgStats {
    total_events: u64,
    unique_activities: u64,
    unique_edges: u64,
}

/// Create a new streaming DFG, store it in global state, and return its handle.
#[wasm_bindgen]
pub fn new_streaming_dfg() -> Result<String, JsValue> {
    let app_state = state::get_or_init_state();
    let idfg = IncrementalDFG::new();
    app_state.store_object(state::StoredObject::IncrementalDFG(idfg))
}

/// Process a single event on the streaming DFG identified by `handle`.
///
/// `activity_id` is an integer activity identifier.
#[wasm_bindgen]
pub fn streaming_dfg_process_event(handle: &str, activity_id: u32) -> Result<(), JsValue> {
    let app_state = state::get_or_init_state();
    let aid = activity_id;

    app_state.with_object_mut(handle, |opt| match opt {
        Some(state::StoredObject::IncrementalDFG(idfg)) => {
            let is_trace_start = idfg.last_activity.is_none();
            idfg.process_event(aid, is_trace_start);
            Ok(())
        }
        Some(_) => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("Object {} is not an IncrementalDFG", handle),
        )),
        None => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("No object found for handle: {}", handle),
        )),
    })
}

/// End the current trace on the streaming DFG identified by `handle`.
#[wasm_bindgen]
pub fn streaming_dfg_end_trace(handle: &str) -> Result<(), JsValue> {
    let app_state = state::get_or_init_state();
    app_state.with_object_mut(handle, |opt| match opt {
        Some(state::StoredObject::IncrementalDFG(idfg)) => {
            idfg.end_trace();
            Ok(())
        }
        Some(_) => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("Object {} is not an IncrementalDFG", handle),
        )),
        None => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("No object found for handle: {}", handle),
        )),
    })
}

/// Get the current DFG snapshot as a JSON string.
#[wasm_bindgen]
pub fn incremental_dfg_snapshot(handle: &str) -> Result<String, JsValue> {
    let app_state = state::get_or_init_state();
    app_state.with_object(handle, |opt| match opt {
        Some(state::StoredObject::IncrementalDFG(idfg)) => {
            let dfg = idfg.snapshot();
            serde_json::to_string(&dfg).map_err(|e| {
                error::wasm_err(
                    codes::INTERNAL_ERROR,
                    format!("JSON serialization failed: {}", e),
                )
            })
        }
        Some(_) => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("Object {} is not an IncrementalDFG", handle),
        )),
        None => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("No object found for handle: {}", handle),
        )),
    })
}

/// Get streaming DFG stats as JSON: `{"total_events":N,"unique_activities":N,"unique_edges":N}`.
#[wasm_bindgen]
pub fn incremental_dfg_stats(handle: &str) -> Result<String, JsValue> {
    let app_state = state::get_or_init_state();
    app_state.with_object(handle, |opt| match opt {
        Some(state::StoredObject::IncrementalDFG(idfg)) => {
            let (total, activities, edges) = idfg.stats();
            let stats = StreamingDfgStats {
                total_events: total,
                unique_activities: activities,
                unique_edges: edges,
            };
            serde_json::to_string(&stats).map_err(|e| {
                error::wasm_err(
                    codes::INTERNAL_ERROR,
                    format!("JSON serialization failed: {}", e),
                )
            })
        }
        Some(_) => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("Object {} is not an IncrementalDFG", handle),
        )),
        None => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("No object found for handle: {}", handle),
        )),
    })
}

// ---------------------------------------------------------------------------
// StreamingDFG (string-based) WASM bindings
// ---------------------------------------------------------------------------

/// Create a new string-based StreamingDFG, store it in global state, return handle.
#[wasm_bindgen]
pub fn streaming_dfg_string_new() -> Result<String, JsValue> {
    let app_state = state::get_or_init_state();
    let sdfg = StreamingDFG::new();
    app_state.store_object(state::StoredObject::StreamingDFG(sdfg))
}

/// Process a single event by activity name (auto-interns strings).
#[wasm_bindgen]
pub fn streaming_dfg_string_event(handle: &str, activity: &str) -> Result<JsValue, JsValue> {
    state::get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(state::StoredObject::StreamingDFG(sdfg)) => {
            sdfg.process_event(activity);
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "event_count": sdfg.event_count(),
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a StreamingDFG")),
        None => Err(JsValue::from_str(&format!(
            "StreamingDFG '{}' not found",
            handle
        ))),
    })
}

/// End the current trace.
#[wasm_bindgen]
pub fn streaming_dfg_string_end_trace(handle: &str) -> Result<JsValue, JsValue> {
    state::get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(state::StoredObject::StreamingDFG(sdfg)) => {
            sdfg.end_trace();
            serde_wasm_bindgen::to_value(&json!({ "ok": true }))
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a StreamingDFG")),
        None => Err(JsValue::from_str(&format!(
            "StreamingDFG '{}' not found",
            handle
        ))),
    })
}

/// Get the current DFG snapshot as JSON (with human-readable activity labels).
#[wasm_bindgen]
pub fn streaming_dfg_string_snapshot(handle: &str) -> Result<String, JsValue> {
    let app_state = state::get_or_init_state();
    app_state.with_object(handle, |opt| match opt {
        Some(state::StoredObject::StreamingDFG(sdfg)) => {
            let dfg = sdfg.snapshot();
            serde_json::to_string(&dfg).map_err(|e| {
                error::wasm_err(
                    codes::INTERNAL_ERROR,
                    format!("JSON serialization failed: {}", e),
                )
            })
        }
        Some(_) => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("Object {} is not a StreamingDFG", handle),
        )),
        None => Err(error::wasm_err(
            codes::INVALID_HANDLE,
            format!("No object found for handle: {}", handle),
        )),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Generate a unique key to avoid global state collisions in parallel tests.
    fn unique_key(prefix: &str) -> String {
        format!("{}:{:?}", prefix, std::thread::current().id())
    }

    #[test]
    fn test_empty_dfg() {
        let _key = unique_key("test_empty_dfg");
        let idfg = IncrementalDFG::new();
        let (events, activities, edges) = idfg.stats();
        assert_eq!(events, 0, "new DFG should have 0 total events");
        assert_eq!(activities, 0, "new DFG should have 0 unique activities");
        assert_eq!(edges, 0, "new DFG should have 0 unique edges");
    }

    #[test]
    fn test_single_event() {
        let _key = unique_key("test_single_event");
        let mut idfg = IncrementalDFG::new();
        idfg.process_event(1, true);

        let (events, activities, edges) = idfg.stats();
        assert_eq!(events, 1, "should have 1 total event");
        assert_eq!(activities, 1, "should have 1 unique activity");
        assert_eq!(edges, 0, "single event should have 0 edges");
        assert_eq!(idfg.node_counts.get(&1), Some(&1));
        assert!(idfg.start_activities.contains(&1));
    }

    #[test]
    fn test_edge_creation() {
        let _key = unique_key("test_edge_creation");
        let mut idfg = IncrementalDFG::new();
        idfg.process_event(1, true);
        idfg.process_event(2, false);
        idfg.end_trace();

        let (events, activities, edges) = idfg.stats();
        assert_eq!(events, 2);
        assert_eq!(activities, 2);
        assert_eq!(edges, 1, "two events in same trace should create 1 edge");
        assert_eq!(idfg.edges.get(&(1, 2)), Some(&1));
        assert!(idfg.start_activities.contains(&1));
        assert!(idfg.end_activities.contains(&2));
    }

    #[test]
    fn test_trace_boundaries() {
        let _key = unique_key("test_trace_boundaries");
        let mut idfg = IncrementalDFG::new();

        // Trace 1: A -> B
        idfg.process_event(1, true);
        idfg.process_event(2, false);
        idfg.end_trace();

        // Trace 2: C -> D
        idfg.process_event(3, true);
        idfg.process_event(4, false);
        idfg.end_trace();

        let (_events, _activities, edges) = idfg.stats();
        assert_eq!(edges, 2, "should have exactly 2 edges");
        assert_eq!(idfg.edges.get(&(1, 2)), Some(&1));
        assert_eq!(idfg.edges.get(&(3, 4)), Some(&1));

        // No cross-trace edges
        assert_eq!(
            idfg.edges.get(&(2, 3)),
            None,
            "B->C should not exist (different traces)"
        );
        assert_eq!(idfg.edges.get(&(2, 4)), None);

        // Start/end activities
        assert!(idfg.start_activities.contains(&1));
        assert!(idfg.start_activities.contains(&3));
        assert!(idfg.end_activities.contains(&2));
        assert!(idfg.end_activities.contains(&4));
    }

    #[test]
    fn test_merge() {
        let _key = unique_key("test_merge");
        let mut a = IncrementalDFG::new();
        a.process_event(1, true);
        a.process_event(2, false);
        a.end_trace();

        let mut b = IncrementalDFG::new();
        b.process_event(1, true);
        b.process_event(3, false);
        b.end_trace();

        a.merge(&b);

        let (events, activities, edges) = a.stats();
        assert_eq!(events, 4, "merged should have 4 total events");
        assert_eq!(
            activities, 3,
            "merged should have 3 unique activities (1, 2, 3)"
        );
        assert_eq!(edges, 2, "merged should have 2 unique edges (1->2, 1->3)");
        assert_eq!(a.edges.get(&(1, 2)), Some(&1));
        assert_eq!(a.edges.get(&(1, 3)), Some(&1));
        assert!(a.start_activities.contains(&1));
        assert!(a.end_activities.contains(&2));
        assert!(a.end_activities.contains(&3));
    }

    #[test]
    fn test_start_end_activities() {
        let _key = unique_key("test_start_end_activities");
        let mut idfg = IncrementalDFG::new();

        // Trace 1: A -> B -> C
        idfg.process_event(1, true);
        idfg.process_event(2, false);
        idfg.process_event(3, false);
        idfg.end_trace();

        // Trace 2: A -> C -> B
        idfg.process_event(1, true);
        idfg.process_event(3, false);
        idfg.process_event(2, false);
        idfg.end_trace();

        // A is always start, never end
        assert!(idfg.start_activities.contains(&1));
        assert!(
            !idfg.end_activities.contains(&1),
            "A is never the last activity"
        );

        // B and C are both start and end across traces
        assert!(!idfg.start_activities.contains(&2), "B is never first");
        assert!(idfg.end_activities.contains(&2));

        assert!(!idfg.start_activities.contains(&3), "C is never first");
        assert!(idfg.end_activities.contains(&3));

        // Node counts
        assert_eq!(idfg.node_counts.get(&1), Some(&2), "A appears twice");
        assert_eq!(idfg.node_counts.get(&2), Some(&2), "B appears twice");
        assert_eq!(idfg.node_counts.get(&3), Some(&2), "C appears twice");
    }

    #[test]
    fn test_streaming_wrapper() {
        let _key = unique_key("test_streaming_wrapper");
        let mut sdfg = StreamingDFG::new();

        sdfg.process_event("A");
        sdfg.process_event("B");
        sdfg.process_event("C");
        sdfg.end_trace();

        sdfg.process_event("A");
        sdfg.process_event("D");
        sdfg.end_trace();

        assert_eq!(sdfg.event_count(), 5);

        let dfg = sdfg.snapshot();
        assert_eq!(dfg.nodes.len(), 4, "should have 4 unique activities");

        // Check node labels
        let labels: Vec<&str> = dfg.nodes.iter().map(|n| n.label.as_str()).collect();
        assert!(labels.contains(&"A"));
        assert!(labels.contains(&"B"));
        assert!(labels.contains(&"C"));
        assert!(labels.contains(&"D"));

        // Check edges: A->B, B->C, A->D
        assert_eq!(dfg.edges.len(), 3);
        assert!(dfg.edges.iter().any(|e| e.from == "A" && e.to == "B"));
        assert!(dfg.edges.iter().any(|e| e.from == "B" && e.to == "C"));
        assert!(dfg.edges.iter().any(|e| e.from == "A" && e.to == "D"));

        // Start/end activities
        assert!(dfg.start_activities.contains_key("A"));
        assert!(dfg.end_activities.contains_key("C"));
        assert!(dfg.end_activities.contains_key("D"));
    }

    #[test]
    fn test_large_stream() {
        let _key = unique_key("test_large_stream");
        let mut idfg = IncrementalDFG::new();
        const N: u32 = 10_000;

        // Feed N events in a single trace: 0, 1, 2, ..., N-1
        idfg.process_event(0, true);
        for i in 1..N {
            idfg.process_event(i, false);
        }
        idfg.end_trace();

        let (events, activities, edges) = idfg.stats();
        assert_eq!(events, N as u64, "should have exactly 10K events");
        assert_eq!(activities, N as u64, "should have 10K unique activities");
        assert_eq!(edges, (N - 1) as u64, "should have 9999 edges");

        // Verify first and last edges
        assert_eq!(idfg.edges.get(&(0, 1)), Some(&1));
        assert_eq!(idfg.edges.get(&((N - 2), (N - 1))), Some(&1));

        // Start/end activities
        assert!(idfg.start_activities.contains(&0));
        assert!(idfg.end_activities.contains(&(N - 1)));
        assert!(!idfg.end_activities.contains(&0));
        assert!(!idfg.start_activities.contains(&(N - 1)));
    }

    #[test]
    fn test_clear() {
        let _key = unique_key("test_clear");
        let mut idfg = IncrementalDFG::new();
        idfg.process_event(1, true);
        idfg.process_event(2, false);
        idfg.end_trace();

        assert_eq!(idfg.total_events, 2);

        idfg.clear();
        let (events, activities, edges) = idfg.stats();
        assert_eq!(events, 0);
        assert_eq!(activities, 0);
        assert_eq!(edges, 0);
        assert!(idfg.last_activity.is_none());
    }

    #[test]
    fn test_multiple_traces_same_activity() {
        let _key = unique_key("test_multiple_traces_same_activity");
        let mut idfg = IncrementalDFG::new();

        // Three traces of A -> A (self-loop)
        for _ in 0..3 {
            idfg.process_event(1, true);
            idfg.process_event(1, false);
            idfg.end_trace();
        }

        let (events, activities, edges) = idfg.stats();
        assert_eq!(events, 6, "3 traces * 2 events = 6");
        assert_eq!(activities, 1, "only activity 1");
        assert_eq!(edges, 1, "only one unique edge: 1->1");
        assert_eq!(
            idfg.edges.get(&(1, 1)),
            Some(&3),
            "edge 1->1 should have count 3"
        );
        assert_eq!(idfg.node_counts.get(&1), Some(&6));
    }
}
