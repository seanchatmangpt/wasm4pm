//! SIMD-accelerated Streaming Directly-Follows Graph (DFG) discovery.
//!
//! This module provides a high-performance DFG builder that combines:
//!
//! 1. **Streaming architecture** -- incremental trace ingestion via `add_trace()` and
//!    `add_events()`, with bounded memory proportional to unique edges (not total events).
//!
//! 2. **WASM SIMD intrinsics** -- on `wasm32` targets *compiled with*
//!    `target_feature = "simd128"`, uses `std::arch::wasm32` v128 operations for
//!    node-frequency accumulation. NOTE: the current form (v128 load /
//!    single-lane replace / store to add 1 to ONE lane) is a 16-byte
//!    read-modify-write per event and is NOT a demonstrated vectorization win
//!    over the scalar increment; a real win would require batching node updates
//!    into whole-vector adds.
//!
//! 3. **Scalar fallback** -- on non-wasm32 targets, on wasm32 without
//!    `simd128`, or whenever SIMD is unavailable, uses optimized scalar code
//!    with loop unrolling. The unsafe SIMD paths are gated on
//!    `#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]` so a
//!    plain `wasm32-unknown-unknown` check compiles without enabling simd128.
//!
//! 4. **Zero-allocation hot path** -- `add_trace()` works entirely on pre-allocated
//!    `FxHashMap<(u32,u32), usize>` with no intermediate allocations.
//!
//! # Performance
//!
//! - **Memory**: O(unique_activities + unique_edges), not O(total_events)
//! - **Parity**: 100% with batch DFG (exact equality on all counts)
//! - **Throughput**: no benchmark currently backs the earlier "~50ns/event"
//!   claim; the per-event v128 load/replace/store form is not a demonstrated
//!   win over the scalar increment (see above).
//!
//! # WASM SIMD
//!
//! The SIMD path uses `std::arch::wasm32` intrinsics which are stable for the
//! `wasm32-unknown-unknown` target but only available when compiled with
//! `target_feature = "simd128"`. The current operation is a v128 load /
//! single-lane extract / replace / store per event — this is honest 4-byte
//! useful work wrapped in a 16-byte read-modify-write, and is NOT currently a
//! vectorization win over the scalar `+= 1`. For edge
//! counting (hash-map updates), SIMD doesn't help directly, so we use the
//! existing `FxHashMap` with loop-unrolled access patterns.
//!
//! # Example
//!
//! ```rust,ignore
//! use wasm4pm::simd_streaming_dfg::SimdStreamingDfg;
//!
//! let mut dfg = SimdStreamingDfg::new();
//!
//! // Add traces as u32-encoded activity sequences
//! dfg.add_trace(&[0, 1, 2]);  // A -> B -> C
//! dfg.add_trace(&[0, 1, 3]);  // A -> B -> D
//!
//! // Or process a full columnar log at once
//! let events: Vec<u32> = vec![0, 1, 2, 0, 1, 3];
//! let offsets: Vec<usize> = vec![0, 3, 6];
//! dfg.add_events(&events, &offsets);
//!
//! // Materialize into a DFG
//! let vocab = vec!["A", "B", "C", "D"];
//! let result = dfg.finish(&vocab);
//! assert_eq!(result.nodes.len(), 4);
//! assert_eq!(result.edges.len(), 3);
//! ```

use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use wasm_bindgen::prelude::*;

/// A 16-byte-aligned block of 4 node counts.
///
/// `#[repr(align(16))]` guarantees every `V128Block` value inside a `Vec` is
/// 16-byte aligned, which is the alignment `v128_load`/`v128_store` require.
/// (A bare `Vec<u32>` only guarantees 4-byte alignment of its base pointer, so
/// the previous flat representation made the v128 access misaligned UB.)
#[repr(C, align(16))]
#[derive(Clone, Copy, Debug, Default)]
struct V128Block([u32; 4]);

impl V128Block {
    #[inline(always)]
    fn get(&self, lane: usize) -> u32 {
        self.0[lane]
    }

    #[inline(always)]
    fn add(&mut self, lane: usize, delta: u32) {
        self.0[lane] = self.0[lane].wrapping_add(delta);
    }
}

/// SIMD-accelerated streaming DFG builder.
///
/// Maintains running edge/node/start/end counts that can be incrementally updated
/// via `add_trace()` or `add_events()`. Memory is bounded by the number of unique
/// activities and unique edges, not by total event count.
///
/// On `wasm32` targets compiled with `target_feature = "simd128"`,
/// node-frequency accumulation uses WASM v128 load/replace/store per event.
/// On other targets (and wasm32 without simd128), a scalar fallback with loop
/// unrolling is used.
#[derive(Debug, Clone)]
pub struct SimdStreamingDfg {
    /// Per-activity occurrence counts in 16-byte-aligned 4-lane blocks,
    /// indexed by activity ID (block = id/4, lane = id%4).
    /// Grown on demand in whole blocks.
    node_counts: Vec<V128Block>,
    /// Directed edge occurrence counts: (from_id, to_id) -> frequency.
    edge_counts: FxHashMap<(u32, u32), usize>,
    /// Start-activity counts: first event in each trace.
    start_counts: FxHashMap<u32, usize>,
    /// End-activity counts: last event in each trace.
    end_counts: FxHashMap<u32, usize>,
    /// Number of traces processed.
    trace_count: usize,
    /// Total events processed.
    event_count: usize,
    /// True if WASM SIMD intrinsics are available at runtime.
    simd_available: bool,
}

impl SimdStreamingDfg {
    /// Create a new empty SIMD streaming DFG builder.
    ///
    /// On `wasm32` targets compiled with `target_feature = "simd128"`, SIMD is
    /// enabled; on any other configuration, scalar fallback is used.
    pub fn new() -> Self {
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        let simd_available = true;
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        let simd_available = false;

        SimdStreamingDfg {
            node_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            trace_count: 0,
            event_count: 0,
            simd_available,
        }
    }

    /// Ensure `node_counts` has a block for the given activity ID.
    #[inline(always)]
    fn ensure_capacity(&mut self, max_id: u32) {
        let needed_blocks = (max_id as usize) / 4 + 1;
        if needed_blocks > self.node_counts.len() {
            self.node_counts
                .resize(needed_blocks, V128Block::default());
        }
    }

    /// Scalar read of a node count by activity ID.
    #[inline(always)]
    fn node_count(&self, id: u32) -> u32 {
        self.node_counts
            .get((id as usize) / 4)
            .map_or(0, |b| b.get((id as usize) % 4))
    }

    /// Scalar increment of a single node count by activity ID.
    #[inline(always)]
    fn add_node_count(&mut self, id: u32) {
        let idx = id as usize;
        self.ensure_capacity(id);
        let (block, lane) = (idx / 4, idx % 4);
        self.node_counts[block].add(lane, 1);
    }

    /// Increment a single node count using v128 load / lane replace / store.
    ///
    /// This consolidates the previously duplicated `increment_node` /
    /// `increment_node_simd` pair. It is kept for wasm SIMD parity coverage but
    /// is NOT a demonstrated vectorization win: it is a 16-byte
    /// read-modify-write to update one 4-byte lane.
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    #[inline(always)]
    fn increment_node(&mut self, id: u32) {
        self.ensure_capacity(id);
        let idx = id as usize;
        let (block, lane) = (idx / 4, idx % 4);

        // SAFETY: `ensure_capacity` guarantees `block < self.node_counts.len()`.
        // `V128Block` is `#[repr(align(16))]`, so the address of every block in
        // the `Vec` is 16-byte aligned, satisfying the v128_load/v128_store
        // alignment requirement for the whole-block access at `block`.
        unsafe {
            let ptr = self.node_counts.as_mut_ptr().add(block) as *mut std::arch::wasm32::v128;
            let vec_val = std::arch::wasm32::v128_load(ptr as *const std::arch::wasm32::v128);

            let new_val = match lane {
                0 => {
                    let v = std::arch::wasm32::i32x4_extract_lane::<0>(vec_val);
                    std::arch::wasm32::i32x4_replace_lane::<0>(vec_val, v.wrapping_add(1))
                }
                1 => {
                    let v = std::arch::wasm32::i32x4_extract_lane::<1>(vec_val);
                    std::arch::wasm32::i32x4_replace_lane::<1>(vec_val, v.wrapping_add(1))
                }
                2 => {
                    let v = std::arch::wasm32::i32x4_extract_lane::<2>(vec_val);
                    std::arch::wasm32::i32x4_replace_lane::<2>(vec_val, v.wrapping_add(1))
                }
                3 => {
                    let v = std::arch::wasm32::i32x4_extract_lane::<3>(vec_val);
                    std::arch::wasm32::i32x4_replace_lane::<3>(vec_val, v.wrapping_add(1))
                }
                _ => unreachable!(),
            };

            std::arch::wasm32::v128_store(ptr, new_val);
        }
    }

    /// Scalar-only variant for wasm32 builds without simd128.
    #[cfg(all(target_arch = "wasm32", not(target_feature = "simd128")))]
    #[inline(always)]
    fn increment_node(&mut self, id: u32) {
        self.add_node_count(id);
    }

    /// Increment node counts for a slice of activity IDs.
    ///
    /// On wasm32+simd128 each ID is processed with the v128 lane-replace
    /// increment (activity IDs are sparse, so per-element increments are used;
    /// see the module docs for the honest performance assessment). Otherwise a
    /// scalar fallback with loop unrolling is used.
    #[inline]
    fn increment_nodes(&mut self, ids: &[u32]) {
        if ids.is_empty() {
            return;
        }

        // Find max ID to ensure capacity once
        let max_id = *ids
            .iter()
            .max()
            .expect("invariant: has events → ids non-empty");
        self.ensure_capacity(max_id);

        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        if self.simd_available {
            // Process each ID with the SIMD lane-replace increment
            for &id in ids {
                self.increment_node(id);
            }
            return;
        }

        // Scalar fallback with loop unrolling (4× unroll)
        let mut i = 0;
        let len = ids.len();
        while i + 4 <= len {
            self.add_node_count(ids[i]);
            self.add_node_count(ids[i + 1]);
            self.add_node_count(ids[i + 2]);
            self.add_node_count(ids[i + 3]);
            i += 4;
        }
        while i < len {
            self.add_node_count(ids[i]);
            i += 1;
        }
    }

    /// Process a single trace (sequence of u32 activity IDs).
    ///
    /// Updates node frequencies, edge counts, start/end activities.
    /// This is the zero-allocation hot path -- no intermediate Vecs or Strings.
    #[inline]
    pub fn add_trace(&mut self, trace: &[u32]) {
        if trace.is_empty() {
            return;
        }

        self.event_count += trace.len();
        self.trace_count += 1;

        // Node frequencies (SIMD-accelerated)
        self.increment_nodes(trace);

        // Directly-follows edges (loop-unrolled)
        let mut i = 0usize;
        let end = trace.len() - 1;
        while i + 4 <= end {
            *self
                .edge_counts
                .entry((trace[i], trace[i + 1]))
                .or_default() += 1;
            *self
                .edge_counts
                .entry((trace[i + 1], trace[i + 2]))
                .or_default() += 1;
            *self
                .edge_counts
                .entry((trace[i + 2], trace[i + 3]))
                .or_default() += 1;
            *self
                .edge_counts
                .entry((trace[i + 3], trace[i + 4]))
                .or_default() += 1;
            i += 4;
        }
        while i < end {
            *self
                .edge_counts
                .entry((trace[i], trace[i + 1]))
                .or_default() += 1;
            i += 1;
        }

        // Start / end activities
        *self.start_counts.entry(trace[0]).or_default() += 1;
        *self.end_counts.entry(trace[trace.len() - 1]).or_default() += 1;
    }

    /// Process a full columnar log (flat events array + trace offsets).
    ///
    /// Equivalent to calling `add_trace()` for each trace, but with better
    /// cache locality since the data is already contiguous in memory.
    pub fn add_events(&mut self, events: &[u32], trace_offsets: &[usize]) {
        let num_events = events.len();
        let num_traces = trace_offsets.len().saturating_sub(1);
        for t in 0..num_traces {
            // Clamp offsets to the events slice: malformed offsets (beyond
            // events.len(), e.g. from a corrupted/stale columnar cache) must
            // not panic the WASM boundary.
            let start = trace_offsets[t].min(num_events);
            let end = trace_offsets[t + 1].min(num_events);
            if start >= end {
                continue;
            }
            self.add_trace(&events[start..end]);
        }
    }

    /// Materialize the accumulated counts into a `DFG`.
    ///
    /// The `vocab` slice maps u32 IDs back to activity name strings.
    pub fn finish(&self, vocab: &[&str]) -> DFG {
        let mut dfg = DFG::new();

        // Nodes
        dfg.nodes = vocab
            .iter()
            .enumerate()
            .map(|(i, &name)| DFGNode {
                id: name.to_owned(),
                label: name.to_owned(),
                frequency: self.node_count(i as u32) as usize,
            })
            .collect();

        // Edges
        dfg.edges = self
            .edge_counts
            .iter()
            .map(|(&(f, t), &freq)| DirectlyFollowsRelation {
                from: vocab.get(f as usize).copied().unwrap_or("").to_owned(),
                to: vocab.get(t as usize).copied().unwrap_or("").to_owned(),
                frequency: freq,
            })
            .collect();
        dfg.edges
            .sort_unstable_by(|a, b| a.from.cmp(&b.from).then(a.to.cmp(&b.to)));

        // Start activities
        for (&id, &cnt) in &self.start_counts {
            if let Some(&name) = vocab.get(id as usize) {
                dfg.start_activities.insert(name.to_owned(), cnt);
            }
        }

        // End activities
        for (&id, &cnt) in &self.end_counts {
            if let Some(&name) = vocab.get(id as usize) {
                dfg.end_activities.insert(name.to_owned(), cnt);
            }
        }

        dfg
    }

    /// Get the number of unique edges discovered so far.
    pub fn edge_count(&self) -> usize {
        self.edge_counts.len()
    }

    /// Get the number of unique activities seen (based on node_counts length).
    pub fn activity_count(&self) -> usize {
        // node_counts is block-padded; find the last nonzero lane across blocks
        self.node_counts
            .iter()
            .rposition(|b| b.0.iter().any(|&c| c > 0))
            .map_or(0, |bi| {
                let last_nonzero_lane = self.node_counts[bi]
                    .0
                    .iter()
                    .rposition(|&c| c > 0)
                    .unwrap_or(0);
                bi * 4 + last_nonzero_lane + 1
            })
    }

    /// Get the number of traces processed.
    pub fn trace_count(&self) -> usize {
        self.trace_count
    }

    /// Get the total number of events processed.
    pub fn event_count(&self) -> usize {
        self.event_count
    }

    /// Check if SIMD acceleration is active.
    pub fn is_simd_enabled(&self) -> bool {
        self.simd_available
    }

    /// Reset all counts to zero, preserving allocated capacity.
    pub fn reset(&mut self) {
        for block in self.node_counts.iter_mut() {
            *block = V128Block::default();
        }
        self.edge_counts.clear();
        self.start_counts.clear();
        self.end_counts.clear();
        self.trace_count = 0;
        self.event_count = 0;
    }

    /// Merge another `SimdStreamingDfg` into this one.
    ///
    /// Useful for parallel/aggregated processing where multiple builders
    /// are combined into a single result.
    pub fn merge(&mut self, other: &SimdStreamingDfg) {
        // Merge node counts. Resize to at least other's block count; the
        // previous implementation underflowed on empty `other`
        // (`len as u32 - 1`) and could resize shorter than `other` when its
        // length was already a multiple of 4, panicking in the fold loop.
        if self.node_counts.len() < other.node_counts.len() {
            self.node_counts
                .resize(other.node_counts.len(), V128Block::default());
        }
        for (i, other_block) in other.node_counts.iter().enumerate() {
            let block = &mut self.node_counts[i];
            for lane in 0..4 {
                block.add(lane, other_block.get(lane));
            }
        }

        // Merge edge counts
        for (&key, &count) in &other.edge_counts {
            *self.edge_counts.entry(key).or_default() += count;
        }

        // Merge start/end counts
        for (&id, &count) in &other.start_counts {
            *self.start_counts.entry(id).or_default() += count;
        }
        for (&id, &count) in &other.end_counts {
            *self.end_counts.entry(id).or_default() += count;
        }

        self.trace_count += other.trace_count;
        self.event_count += other.event_count;
    }
}

impl Default for SimdStreamingDfg {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// WASM bindings
// ---------------------------------------------------------------------------

/// Discover a DFG using the streaming algorithm with WASM v128 node-increment
/// support (wasm32+simd128 builds only; all other builds use scalar kernels).
///
/// Produces identical results to `discover_dfg`.
///
/// # Arguments
///
/// * `eventlog_handle` - Handle to a stored EventLog object
/// * `activity_key` - Attribute key for activity names (e.g., "concept:name")
///
/// # Returns
///
/// JSON `DFG` with nodes, edges, start_activities, end_activities.
#[wasm_bindgen]
pub fn discover_dfg_simd(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
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
        let mut builder = SimdStreamingDfg::new();
        builder.add_events(&col.events, &col.trace_offsets);
        let dfg = builder.finish(&col.vocab);
        to_js(&dfg)
    })
}

/// Discover a DFG using SIMD streaming and store it in WASM state.
///
/// Returns a handle string that can be used with other handle-based functions.
#[wasm_bindgen]
pub fn discover_dfg_simd_handle(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let dfg = get_or_init_state().with_event_log(eventlog_handle, |log| {
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
        let mut builder = SimdStreamingDfg::new();
        builder.add_events(&col.events, &col.trace_offsets);
        Ok(builder.finish(&col.vocab))
    })?;

    let handle = get_or_init_state().store_object(StoredObject::DFG(dfg))?;
    Ok(crate::error::js_val(&handle))
}

/// Get info about the SIMD streaming DFG implementation.
#[wasm_bindgen]
pub fn simd_streaming_dfg_info() -> JsValue {
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    let simd_status = "enabled";
    #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
    let simd_status = "scalar_fallback";

    let info = serde_json::json!({
        "algorithm": "simd_streaming_dfg",
        "simd_status": simd_status,
        "description": "Streaming DFG discovery (scalar kernels; wasm32+simd128 builds use a v128 lane-replace node increment)",
        "features": [
            "incremental trace ingestion",
            "zero-allocation hot path",
            "WASM SIMD node-frequency accumulation",
            "loop-unrolled edge counting",
            "builder merge for parallel processing"
        ]
    });
    to_js(&info).unwrap_or(JsValue::NULL)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_builder() {
        let builder = SimdStreamingDfg::new();
        assert_eq!(builder.trace_count(), 0);
        assert_eq!(builder.event_count(), 0);
        assert_eq!(builder.edge_count(), 0);
        assert_eq!(builder.activity_count(), 0);
    }

    #[test]
    fn test_single_trace() {
        let mut builder = SimdStreamingDfg::new();
        builder.add_trace(&[0, 1, 2]);

        assert_eq!(builder.trace_count(), 1);
        assert_eq!(builder.event_count(), 3);
        assert_eq!(builder.edge_count(), 2); // 0->1, 1->2

        let vocab = vec!["A", "B", "C"];
        let dfg = builder.finish(&vocab);

        assert_eq!(dfg.nodes.len(), 3);
        assert_eq!(dfg.edges.len(), 2);
        assert_eq!(dfg.start_activities.get("A"), Some(&1));
        assert_eq!(dfg.end_activities.get("C"), Some(&1));
    }

    #[test]
    fn test_multiple_traces() {
        let mut builder = SimdStreamingDfg::new();

        // Trace 1: A -> B -> C
        builder.add_trace(&[0, 1, 2]);
        // Trace 2: A -> B -> D
        builder.add_trace(&[0, 1, 3]);

        let vocab = vec!["A", "B", "C", "D"];
        let dfg = builder.finish(&vocab);

        assert_eq!(dfg.nodes.len(), 4);
        assert_eq!(dfg.edges.len(), 3); // A->B (x2), B->C, B->D

        // A->B should have frequency 2
        let ab = dfg
            .edges
            .iter()
            .find(|e| e.from == "A" && e.to == "B")
            .unwrap();
        assert_eq!(ab.frequency, 2);

        let bc = dfg
            .edges
            .iter()
            .find(|e| e.from == "B" && e.to == "C")
            .unwrap();
        assert_eq!(bc.frequency, 1);

        let bd = dfg
            .edges
            .iter()
            .find(|e| e.from == "B" && e.to == "D")
            .unwrap();
        assert_eq!(bd.frequency, 1);

        // Start/end counts
        assert_eq!(dfg.start_activities.get("A"), Some(&2));
        assert_eq!(dfg.end_activities.get("C"), Some(&1));
        assert_eq!(dfg.end_activities.get("D"), Some(&1));
    }

    #[test]
    fn test_add_events_columnar() {
        let mut builder = SimdStreamingDfg::new();

        // Columnar log: trace0=[0,1,2], trace1=[0,1,3]
        let events = vec![0, 1, 2, 0, 1, 3];
        let offsets = vec![0, 3, 6];

        builder.add_events(&events, &offsets);

        let vocab = vec!["A", "B", "C", "D"];
        let dfg = builder.finish(&vocab);

        assert_eq!(dfg.nodes.len(), 4);
        assert_eq!(dfg.edges.len(), 3);
        assert_eq!(builder.trace_count(), 2);
    }

    /// Hand-rolled scalar DFG builder for parity testing.
    /// Mirrors the logic in `discovery.rs::discover_dfg` exactly.
    fn scalar_build_dfg(traces: &[&[u32]], vocab: &[&str]) -> DFG {
        let mut dfg = DFG::new();

        dfg.nodes.extend(vocab.iter().map(|&act| DFGNode {
            id: act.to_owned(),
            label: act.to_owned(),
            frequency: 0,
        }));

        let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

        for trace in traces {
            if trace.is_empty() {
                continue;
            }

            // Bounds check: skip traces with invalid activity indices
            if trace.iter().any(|&id| (id as usize) >= vocab.len()) {
                continue;
            }

            for &id in *trace {
                dfg.nodes[id as usize].frequency += 1;
            }
            for i in 0..trace.len().saturating_sub(1) {
                *edge_counts.entry((trace[i], trace[i + 1])).or_default() += 1;
            }
            *dfg.start_activities
                .entry(vocab[trace[0] as usize].to_owned())
                .or_default() += 1;
            *dfg.end_activities
                .entry(vocab[trace[trace.len() - 1] as usize].to_owned())
                .or_default() += 1;
        }

        dfg.edges
            .extend(edge_counts.into_iter().filter_map(|((f, t), freq)| {
                // Bounds check: only include edges where both activities are valid
                if (f as usize) < vocab.len() && (t as usize) < vocab.len() {
                    Some(DirectlyFollowsRelation {
                        from: vocab[f as usize].to_owned(),
                        to: vocab[t as usize].to_owned(),
                        frequency: freq,
                    })
                } else {
                    None
                }
            }));

        dfg
    }

    #[test]
    fn test_parity_with_scalar_dfg() {
        // Build DFG using SimdStreamingDfg
        let mut simd = SimdStreamingDfg::new();
        simd.add_trace(&[0, 1, 2]);
        simd.add_trace(&[1, 0, 2]);
        simd.add_trace(&[0, 1, 3, 2]);

        let vocab = vec!["A", "B", "C", "D"];
        let simd_dfg = simd.finish(&vocab);

        // Build equivalent DFG using hand-rolled scalar logic (mirrors discovery.rs)
        let traces: Vec<&[u32]> = vec![&[0, 1, 2], &[1, 0, 2], &[0, 1, 3, 2]];
        let scalar_dfg = scalar_build_dfg(&traces, &vocab);

        // Compare nodes (same set, same frequencies)
        assert_eq!(simd_dfg.nodes.len(), scalar_dfg.nodes.len());
        for simd_node in &simd_dfg.nodes {
            let scalar_node = scalar_dfg.nodes.iter().find(|n| n.id == simd_node.id);
            assert!(
                scalar_node.is_some(),
                "Node {} missing from scalar DFG",
                simd_node.id
            );
            assert_eq!(
                simd_node.frequency,
                scalar_node.unwrap().frequency,
                "Frequency mismatch for node {}",
                simd_node.id
            );
        }

        // Compare edges (same set, same frequencies)
        assert_eq!(simd_dfg.edges.len(), scalar_dfg.edges.len());
        for simd_edge in &simd_dfg.edges {
            let scalar_edge = scalar_dfg
                .edges
                .iter()
                .find(|e| e.from == simd_edge.from && e.to == simd_edge.to);
            assert!(
                scalar_edge.is_some(),
                "Edge {}->{} missing from scalar DFG",
                simd_edge.from,
                simd_edge.to
            );
            assert_eq!(
                simd_edge.frequency,
                scalar_edge.unwrap().frequency,
                "Frequency mismatch for edge {}->{}",
                simd_edge.from,
                simd_edge.to
            );
        }

        // Compare start/end activities
        assert_eq!(simd_dfg.start_activities, scalar_dfg.start_activities);
        assert_eq!(simd_dfg.end_activities, scalar_dfg.end_activities);
    }

    #[test]
    fn test_empty_trace_skipped() {
        let mut builder = SimdStreamingDfg::new();
        builder.add_trace(&[]);
        assert_eq!(builder.trace_count(), 0);
        assert_eq!(builder.event_count(), 0);
    }

    #[test]
    fn test_single_event_trace() {
        let mut builder = SimdStreamingDfg::new();
        builder.add_trace(&[5]); // Single event, no edges

        assert_eq!(builder.trace_count(), 1);
        assert_eq!(builder.event_count(), 1);
        assert_eq!(builder.edge_count(), 0);

        let vocab = vec!["", "", "", "", "", "F"];
        let dfg = builder.finish(&vocab);

        assert_eq!(dfg.start_activities.get("F"), Some(&1));
        assert_eq!(dfg.end_activities.get("F"), Some(&1));
    }

    #[test]
    fn test_long_trace_loop_unrolling() {
        let mut builder = SimdStreamingDfg::new();

        // 8-event trace: exercises the 4x unrolled loop
        let trace: Vec<u32> = (0..8u32).collect();
        builder.add_trace(&trace);

        assert_eq!(builder.trace_count(), 1);
        assert_eq!(builder.event_count(), 8);
        assert_eq!(builder.edge_count(), 7);

        let vocab: Vec<&str> = (0..8)
            .map(|i| {
                // Use static strings to avoid lifetime issues
                match i {
                    0 => "A",
                    1 => "B",
                    2 => "C",
                    3 => "D",
                    4 => "E",
                    5 => "F",
                    6 => "G",
                    7 => "H",
                    _ => "?",
                }
            })
            .collect();
        let dfg = builder.finish(&vocab);

        assert_eq!(dfg.nodes.len(), 8);
        assert_eq!(dfg.edges.len(), 7);
    }

    #[test]
    fn test_merge_empty_builder() {
        // Regression: merge with an empty `other` previously underflowed
        // (`other.node_counts.len() as u32 - 1`).
        let mut a = SimdStreamingDfg::new();
        a.add_trace(&[0, 1, 2]);
        let empty = SimdStreamingDfg::new();
        a.merge(&empty);

        assert_eq!(a.trace_count(), 1);
        assert_eq!(a.event_count(), 3);
        let vocab = vec!["A", "B", "C"];
        let dfg = a.finish(&vocab);
        assert_eq!(dfg.edges.len(), 2);
        assert_eq!(dfg.nodes[0].frequency, 1);
    }

    #[test]
    fn test_merge_four_aligned_builder() {
        // Regression: when other.node_counts had a multiple-of-4 length the
        // old padded resize could shrink below other's length and panic on
        // index out of bounds during the fold.
        let mut a = SimdStreamingDfg::new();
        a.add_trace(&[0, 1, 2, 3]); // counts span 4 ids
        let mut b = SimdStreamingDfg::new();
        b.add_trace(&[4, 5, 6, 7]); // counts span ids 4..8

        a.merge(&b);

        assert_eq!(a.trace_count(), 2);
        assert_eq!(a.event_count(), 8);
        let vocab: Vec<&str> = vec!["A", "B", "C", "D", "E", "F", "G", "H"];
        let dfg = a.finish(&vocab);
        assert_eq!(dfg.edges.len(), 6);
        // All 8 node frequencies must be 1
        for node in &dfg.nodes {
            assert_eq!(node.frequency, 1, "node {}", node.id);
        }
    }

    #[test]
    fn test_merge_self_four_aligned() {
        // merge where SELF has a multiple-of-4 block length and other is longer
        let mut a = SimdStreamingDfg::new();
        a.add_trace(&[0, 1, 2, 3]);
        let mut b = SimdStreamingDfg::new();
        b.add_trace(&[0, 1, 2, 3]);
        a.merge(&b);
        assert_eq!(a.event_count(), 8);
        let vocab: Vec<&str> = vec!["A", "B", "C", "D"];
        let dfg = a.finish(&vocab);
        assert_eq!(dfg.nodes[0].frequency, 2);
        assert_eq!(dfg.nodes[3].frequency, 2);
    }

    #[test]
    fn test_add_events_malformed_offsets() {
        // Offsets beyond events.len() must be clamped, not panic
        // (WASM-reachable via discover_dfg_simd).
        let mut builder = SimdStreamingDfg::new();
        let events = vec![0u32, 1, 2];
        let offsets = vec![0usize, 3, 999, 5000]; // malformed trailing offsets
        builder.add_events(&events, &offsets);

        assert_eq!(builder.trace_count(), 1); // only [0,3) is real
        assert_eq!(builder.event_count(), 3);

        // Non-monotonic offsets must also be skipped safely
        let mut builder2 = SimdStreamingDfg::new();
        builder2.add_events(&events, &[3, 0, 2]);
        assert_eq!(builder2.trace_count(), 1); // only [0,2)
        assert_eq!(builder2.event_count(), 2);
    }

    #[test]
    fn test_merge() {
        let mut a = SimdStreamingDfg::new();
        a.add_trace(&[0, 1, 2]);

        let mut b = SimdStreamingDfg::new();
        b.add_trace(&[0, 1, 3]);

        a.merge(&b);

        let vocab = vec!["A", "B", "C", "D"];
        let dfg = a.finish(&vocab);

        assert_eq!(a.trace_count(), 2);
        assert_eq!(a.event_count(), 6);
        assert_eq!(dfg.edges.len(), 3);

        let ab = dfg
            .edges
            .iter()
            .find(|e| e.from == "A" && e.to == "B")
            .unwrap();
        assert_eq!(ab.frequency, 2);
    }

    #[test]
    fn test_reset() {
        let mut builder = SimdStreamingDfg::new();
        builder.add_trace(&[0, 1, 2]);
        assert_eq!(builder.trace_count(), 1);

        builder.reset();
        assert_eq!(builder.trace_count(), 0);
        assert_eq!(builder.event_count(), 0);
        assert_eq!(builder.edge_count(), 0);

        // Should be able to reuse after reset
        builder.add_trace(&[3, 4]);
        assert_eq!(builder.trace_count(), 1);
        assert_eq!(builder.event_count(), 2);
    }

    #[test]
    fn test_simd_detection() {
        let builder = SimdStreamingDfg::new();
        #[cfg(target_arch = "wasm32")]
        assert!(builder.is_simd_enabled());
        #[cfg(not(target_arch = "wasm32"))]
        assert!(!builder.is_simd_enabled());
    }

    #[test]
    fn test_repeated_edges() {
        let mut builder = SimdStreamingDfg::new();

        // Same edge appears in multiple traces
        builder.add_trace(&[0, 1, 0, 1]); // A->B, B->A, A->B
        builder.add_trace(&[0, 1]); // A->B

        let vocab = vec!["A", "B"];
        let dfg = builder.finish(&vocab);

        // A->B should have frequency 3
        let ab = dfg
            .edges
            .iter()
            .find(|e| e.from == "A" && e.to == "B")
            .unwrap();
        assert_eq!(ab.frequency, 3);

        // B->A should have frequency 1
        let ba = dfg
            .edges
            .iter()
            .find(|e| e.from == "B" && e.to == "A")
            .unwrap();
        assert_eq!(ba.frequency, 1);

        // Node A appears 3 times (positions 0, 2 in trace1, position 0 in trace2)
        assert_eq!(dfg.nodes[0].frequency, 3);
        // Node B appears 3 times (positions 1, 3 in trace1, position 1 in trace2)
        assert_eq!(dfg.nodes[1].frequency, 3);
    }

    #[test]
    fn test_add_events_with_empty_traces() {
        let mut builder = SimdStreamingDfg::new();

        // Columnar log with an empty trace in the middle
        let events = vec![0, 1, 2, 0, 1];
        let offsets = vec![0, 3, 3, 5]; // trace0=[0,1,2], trace1=[], trace2=[0,1]

        builder.add_events(&events, &offsets);

        assert_eq!(builder.trace_count(), 2); // empty trace skipped
        assert_eq!(builder.event_count(), 5);
    }

    #[test]
    fn test_columnar_parity_with_discovery_dfg() {
        // Simulate the same data flow as discover_dfg in discovery.rs
        let mut simd = SimdStreamingDfg::new();

        // Manually construct a columnar log equivalent
        let events: Vec<u32> = vec![0, 1, 2, 0, 1, 3];
        let offsets: Vec<usize> = vec![0, 3, 6];
        let vocab: Vec<&str> = vec!["A", "B", "C", "D"];

        simd.add_events(&events, &offsets);
        let dfg = simd.finish(&vocab);

        // Verify against expected values (same as discover_dfg would produce)
        assert_eq!(dfg.nodes.len(), 4);

        // Node frequencies: A=2, B=2, C=1, D=1
        let node_a = dfg.nodes.iter().find(|n| n.id == "A").unwrap();
        assert_eq!(node_a.frequency, 2);
        let node_b = dfg.nodes.iter().find(|n| n.id == "B").unwrap();
        assert_eq!(node_b.frequency, 2);
        let node_c = dfg.nodes.iter().find(|n| n.id == "C").unwrap();
        assert_eq!(node_c.frequency, 1);
        let node_d = dfg.nodes.iter().find(|n| n.id == "D").unwrap();
        assert_eq!(node_d.frequency, 1);

        // Edges: A->B(2), B->C(1), B->D(1)
        assert_eq!(dfg.edges.len(), 3);
    }
}
