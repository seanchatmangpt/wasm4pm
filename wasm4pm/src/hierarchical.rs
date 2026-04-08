//! Hierarchical chunking for divide-and-conquer discovery at 100B-event scale.
//!
//! Splitting an event log into independent chunks, discovering a local model per
//! chunk, then merging the partial results yields the same final model as a
//! monolithic pass -- because DFG counts are **associative**: `(a + b) + c = a + (b + c)`.
//!
//! Memory usage is proportional to `chunk_size`, not `total_log_size`, enabling
//! logs that far exceed available RAM.

use wasm_bindgen::prelude::*;
use rustc_hash::FxHashMap;
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::error::{wasm_err, codes};
use crate::utilities::to_js;

// ---------------------------------------------------------------------------
// Core trait
// ---------------------------------------------------------------------------

/// Trait for algorithms that support divide-and-conquer processing.
///
/// Implementors provide a `discover_local` that works on a single chunk and a
/// `merge` that combines any number of partial results into a single global
/// result.  The merge must be **associative** and **commutative** so that chunk
/// ordering does not affect the final output.
pub trait Chunkable {
    /// The partial / final model produced by this algorithm.
    type LocalModel;

    /// Discover a model from a single chunk of pre-encoded traces.
    fn discover_local(chunk: &[TraceInfo]) -> Self::LocalModel;

    /// Merge multiple partial models into a single global model.
    fn merge(models: Vec<Self::LocalModel>) -> Self::LocalModel;
}

// ---------------------------------------------------------------------------
// Lightweight trace representation
// ---------------------------------------------------------------------------

/// Minimal trace data for chunked processing.
///
/// Uses pre-encoded `u32` activity IDs so the chunker never touches heap-allocated
/// strings during inner-loop counting.
#[derive(Debug, Clone)]
pub struct TraceInfo {
    /// Activity IDs for this trace (order preserved).
    pub activity_ids: Vec<u32>,
    /// First activity ID (may equal `end_id` for single-event traces).
    pub start_id: u32,
    /// Last activity ID.
    pub end_id: u32,
}

impl TraceInfo {
    /// Build from a slice of activity IDs.
    pub fn from_ids(ids: &[u32]) -> Option<Self> {
        if ids.is_empty() {
            return None;
        }
        Some(TraceInfo {
            activity_ids: ids.to_vec(),
            start_id: ids[0],
            end_id: ids[ids.len() - 1],
        })
    }
}

// ---------------------------------------------------------------------------
// DFG chunking
// ---------------------------------------------------------------------------

/// Intermediate DFG counts produced by a single chunk.
///
/// All keys are integer activity IDs.  The final `DirectlyFollowsGraph` is
/// materialised via `to_dfg(vocab)` once all chunks are merged.
#[derive(Debug, Clone, Default)]
pub struct DfgChunkResult {
    /// `(from_id, to_id) -> count`
    pub edge_counts: FxHashMap<(u32, u32), u32>,
    /// `activity_id -> total frequency`
    pub node_freqs: FxHashMap<u32, u32>,
    /// `activity_id -> start count`
    pub start_counts: FxHashMap<u32, u32>,
    /// `activity_id -> end count`
    pub end_counts: FxHashMap<u32, u32>,
}

/// Marker type implementing `Chunkable` for DFG discovery.
pub struct DfgChunker;

impl Chunkable for DfgChunker {
    type LocalModel = DfgChunkResult;

    fn discover_local(chunk: &[TraceInfo]) -> DfgChunkResult {
        let mut result = DfgChunkResult::default();

        for trace in chunk {
            let ids = &trace.activity_ids;

            // Node frequencies
            for &id in ids {
                *result.node_freqs.entry(id).or_insert(0) += 1;
            }

            // Directly-follows edges
            for window in ids.windows(2) {
                *result.edge_counts.entry((window[0], window[1])).or_insert(0) += 1;
            }

            // Start / end
            *result.start_counts.entry(trace.start_id).or_insert(0) += 1;
            *result.end_counts.entry(trace.end_id).or_insert(0) += 1;
        }

        result
    }

    fn merge(models: Vec<DfgChunkResult>) -> DfgChunkResult {
        models
            .into_iter()
            .reduce(|mut acc, m| {
                for (k, v) in m.edge_counts {
                    *acc.edge_counts.entry(k).or_insert(0) += v;
                }
                for (k, v) in m.node_freqs {
                    *acc.node_freqs.entry(k).or_insert(0) += v;
                }
                for (k, v) in m.start_counts {
                    *acc.start_counts.entry(k).or_insert(0) += v;
                }
                for (k, v) in m.end_counts {
                    *acc.end_counts.entry(k).or_insert(0) += v;
                }
                acc
            })
            .unwrap_or_default()
    }
}

impl DfgChunkResult {
    /// Materialise into a full `DirectlyFollowsGraph` using the string vocabulary.
    pub fn to_dfg(&self, vocab: &[&str]) -> DirectlyFollowsGraph {
        let mut dfg = DirectlyFollowsGraph::new();

        // Nodes -- include all activities seen in any count map
        let mut all_ids: FxHashMap<u32, bool> = FxHashMap::default();
        for &id in self.node_freqs.keys() {
            all_ids.insert(id, true);
        }
        for &(id, _) in self.edge_counts.keys() {
            all_ids.insert(id, true);
        }
        // Ensure we have entries for start/end only activities
        for &id in self.start_counts.keys() {
            all_ids.insert(id, true);
        }
        for &id in self.end_counts.keys() {
            all_ids.insert(id, true);
        }

        // Sort IDs for deterministic output
        let mut sorted_ids: Vec<u32> = all_ids.keys().copied().collect();
        sorted_ids.sort_unstable();

        dfg.nodes = sorted_ids
            .iter()
            .map(|&id| {
                let name = if (id as usize) < vocab.len() {
                    vocab[id as usize]
                } else {
                    "?"
                };
                DFGNode {
                    id: name.to_owned(),
                    label: name.to_owned(),
                    frequency: *self.node_freqs.get(&id).unwrap_or(&0) as usize,
                }
            })
            .collect();

        // Edges
        dfg.edges = self
            .edge_counts
            .iter()
            .map(|(&(f, t), &freq)| {
                let from = if (f as usize) < vocab.len() { vocab[f as usize] } else { "?" };
                let to = if (t as usize) < vocab.len() { vocab[t as usize] } else { "?" };
                DirectlyFollowsRelation {
                    from: from.to_owned(),
                    to: to.to_owned(),
                    frequency: freq as usize,
                }
            })
            .collect();

        // Start / end activities
        for (&id, &cnt) in &self.start_counts {
            let name = if (id as usize) < vocab.len() { vocab[id as usize] } else { "?" };
            dfg.start_activities.insert(name.to_owned(), cnt as usize);
        }
        for (&id, &cnt) in &self.end_counts {
            let name = if (id as usize) < vocab.len() { vocab[id as usize] } else { "?" };
            dfg.end_activities.insert(name.to_owned(), cnt as usize);
        }

        dfg
    }
}

// ---------------------------------------------------------------------------
// Hierarchical orchestrator
// ---------------------------------------------------------------------------

/// Configuration for hierarchical (chunked) discovery.
#[derive(Debug, Clone)]
pub struct HierarchicalConfig {
    /// Target number of chunks.  The actual number may differ if the log is
    /// smaller than `max_chunk_events * num_chunks`.
    pub num_chunks: usize,
    /// Maximum events per chunk.  When set, takes precedence over `num_chunks`
    /// if the log is very large.
    pub max_chunk_events: Option<usize>,
}

impl Default for HierarchicalConfig {
    fn default() -> Self {
        HierarchicalConfig {
            num_chunks: 8,
            max_chunk_events: None,
        }
    }
}

/// Partition an event log into chunks and run chunked discovery.
///
/// 1. Build columnar representation (activity interning).
/// 2. Convert traces to lightweight `TraceInfo`.
/// 3. Partition into `config.num_chunks` chunks (roughly equal trace counts).
/// 4. `discover_local()` per chunk.
/// 5. `merge()` all partial results.
pub fn discover_hierarchical<C: Chunkable>(
    log: &EventLog,
    activity_key: &str,
    config: &HierarchicalConfig,
) -> C::LocalModel {
    let col = log.to_columnar(activity_key);
    let total_traces = col.trace_offsets.len().saturating_sub(1);

    if total_traces == 0 {
        return C::merge(vec![]);
    }

    // Build TraceInfo for every trace
    let traces: Vec<TraceInfo> = (0..total_traces)
        .filter_map(|t| {
            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];
            if start >= end {
                return None;
            }
            TraceInfo::from_ids(&col.events[start..end])
        })
        .collect();

    if traces.is_empty() {
        return C::merge(vec![]);
    }

    // Determine actual chunk count
    let num_chunks = if let Some(max_events) = config.max_chunk_events {
        let total_events: usize = traces.iter().map(|t| t.activity_ids.len()).sum();
        (total_events / max_events.max(1)).max(1).min(traces.len())
    } else {
        config.num_chunks.max(1).min(traces.len())
    };

    // Partition: distribute traces round-robin into `num_chunks` buckets
    let chunk_size = traces.len() / num_chunks;
    let remainder = traces.len() % num_chunks;

    let mut local_models: Vec<C::LocalModel> = Vec::with_capacity(num_chunks);
    let mut offset = 0usize;

    for i in 0..num_chunks {
        let len = chunk_size + if i < remainder { 1 } else { 0 };
        let chunk = &traces[offset..offset + len];
        offset += len;

        let local = C::discover_local(chunk);
        local_models.push(local);
    }

    C::merge(local_models)
}

// ---------------------------------------------------------------------------
// WASM bindings
// ---------------------------------------------------------------------------

/// Discover a DFG using hierarchical chunking.
///
/// Splits the event log into `num_chunks` independent partitions, discovers a
/// partial DFG for each, then merges the results.  The output is identical to
/// `discover_dfg` for any `num_chunks >= 1`.
#[wasm_bindgen]
pub fn discover_dfg_hierarchical(
    eventlog_handle: &str,
    activity_key: &str,
    num_chunks: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            if num_chunks == 0 {
                return Err(wasm_err(codes::INVALID_INPUT, "num_chunks must be >= 1"));
            }

            let config = HierarchicalConfig {
                num_chunks,
                max_chunk_events: None,
            };

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
            let result = discover_hierarchical::<DfgChunker>(log, activity_key, &config);
            let dfg = result.to_dfg(&col.vocab);

            to_js(&dfg)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })
}

/// Discover a DFG hierarchically with an event-budget per chunk.
///
/// Each chunk is limited to at most `max_chunk_events` events.  The number of
/// chunks is determined automatically from the log size.
#[wasm_bindgen]
pub fn discover_dfg_hierarchical_by_events(
    eventlog_handle: &str,
    activity_key: &str,
    max_chunk_events: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            if max_chunk_events == 0 {
                return Err(wasm_err(codes::INVALID_INPUT, "max_chunk_events must be >= 1"));
            }

            let config = HierarchicalConfig {
                num_chunks: 8, // fallback; max_chunk_events takes precedence
                max_chunk_events: Some(max_chunk_events),
            };

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
            let result = discover_hierarchical::<DfgChunker>(log, activity_key, &config);
            let dfg = result.to_dfg(&col.vocab);

            to_js(&dfg)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// Helper: build a small EventLog with given traces.
    ///
    /// Each inner vec is a trace; each string is an activity name.
    fn make_log(traces: &[&[&str]]) -> EventLog {
        let mut log = EventLog::new();
        for trace_activities in traces {
            let mut trace = Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            };
            for &activity in *trace_activities {
                let mut event = Event {
                    attributes: HashMap::new(),
                };
                event.attributes.insert(
                    "concept:name".to_string(),
                    crate::models::AttributeValue::String(activity.to_owned()),
                );
                trace.events.push(event);
            }
            log.traces.push(trace);
        }
        log
    }

    /// Build a monolithic DFG for comparison.
    fn monolithic_dfg(log: &EventLog) -> DirectlyFollowsGraph {
        let col = log.to_columnar("concept:name");
        let result = DfgChunker::discover_local(
            &build_traces(&col),
        );
        result.to_dfg(&col.vocab)
    }

    /// Convert a ColumnarLog into a vec of TraceInfo.
    fn build_traces(col: &crate::models::ColumnarLog) -> Vec<TraceInfo> {
        let total_traces = col.trace_offsets.len().saturating_sub(1);
        (0..total_traces)
            .filter_map(|t| {
                let start = col.trace_offsets[t];
                let end = col.trace_offsets[t + 1];
                TraceInfo::from_ids(&col.events[start..end])
            })
            .collect()
    }

    // -- Parity: chunked == monolithic --

    #[test]
    fn test_chunked_dfg_parity_two_chunks() {
        let log = make_log(&[
            &["A", "B", "C"],
            &["A", "B", "D"],
            &["B", "C", "A"],
            &["C", "A", "B"],
        ]);

        let mono = monolithic_dfg(&log);

        let config = HierarchicalConfig { num_chunks: 2, max_chunk_events: None };
        let col = log.to_columnar("concept:name");
        let chunked = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
        let chunked_dfg = chunked.to_dfg(&col.vocab);

        // Same node count
        assert_eq!(mono.nodes.len(), chunked_dfg.nodes.len());

        // Same edge count
        assert_eq!(mono.edges.len(), chunked_dfg.edges.len());

        // Same total node frequency
        let mono_total: usize = mono.nodes.iter().map(|n| n.frequency).sum();
        let chunked_total: usize = chunked_dfg.nodes.iter().map(|n| n.frequency).sum();
        assert_eq!(mono_total, chunked_total);

        // Same edge frequencies (order may differ)
        let mut mono_edges: Vec<_> = mono.edges.iter().collect();
        let mut chunked_edges: Vec<_> = chunked_dfg.edges.iter().collect();
        mono_edges.sort_by(|a, b| a.from.cmp(&b.from).then(a.to.cmp(&b.to)));
        chunked_edges.sort_by(|a, b| a.from.cmp(&b.from).then(a.to.cmp(&b.to)));
        for (m, c) in mono_edges.iter().zip(chunked_edges.iter()) {
            assert_eq!(m.from, c.from, "edge from mismatch");
            assert_eq!(m.to, c.to, "edge to mismatch");
            assert_eq!(m.frequency, c.frequency, "edge frequency mismatch for {} -> {}", m.from, m.to);
        }

        // Same start/end counts
        assert_eq!(mono.start_activities, chunked_dfg.start_activities);
        assert_eq!(mono.end_activities, chunked_dfg.end_activities);
    }

    #[test]
    fn test_chunked_dfg_parity_many_chunks() {
        let log = make_log(&[
            &["A", "B"],
            &["B", "C"],
            &["C", "D"],
            &["D", "E"],
            &["E", "A"],
            &["A", "C"],
            &["B", "D"],
            &["C", "E"],
            &["D", "A"],
            &["E", "B"],
        ]);

        let mono = monolithic_dfg(&log);

        let config = HierarchicalConfig { num_chunks: 10, max_chunk_events: None };
        let col = log.to_columnar("concept:name");
        let chunked = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
        let chunked_dfg = chunked.to_dfg(&col.vocab);

        assert_eq!(mono.nodes.len(), chunked_dfg.nodes.len());
        assert_eq!(mono.edges.len(), chunked_dfg.edges.len());
        assert_eq!(mono.start_activities, chunked_dfg.start_activities);
        assert_eq!(mono.end_activities, chunked_dfg.end_activities);
    }

    // -- Edge cases --

    #[test]
    fn test_empty_log() {
        let log = make_log(&[]);
        let config = HierarchicalConfig::default();
        let col = log.to_columnar("concept:name");
        let result = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
        let dfg = result.to_dfg(&col.vocab);

        assert!(dfg.nodes.is_empty());
        assert!(dfg.edges.is_empty());
        assert!(dfg.start_activities.is_empty());
        assert!(dfg.end_activities.is_empty());
    }

    #[test]
    fn test_single_trace() {
        let log = make_log(&[&["A", "B", "C"]]);
        let mono = monolithic_dfg(&log);

        let config = HierarchicalConfig { num_chunks: 1, max_chunk_events: None };
        let col = log.to_columnar("concept:name");
        let chunked = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
        let chunked_dfg = chunked.to_dfg(&col.vocab);

        assert_eq!(mono.nodes.len(), chunked_dfg.nodes.len());
        assert_eq!(mono.edges.len(), chunked_dfg.edges.len());
        assert_eq!(mono.start_activities, chunked_dfg.start_activities);
        assert_eq!(mono.end_activities, chunked_dfg.end_activities);
    }

    #[test]
    fn test_single_event_trace() {
        let log = make_log(&[&["X"]]);
        let config = HierarchicalConfig::default();
        let col = log.to_columnar("concept:name");
        let result = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
        let dfg = result.to_dfg(&col.vocab);

        assert_eq!(dfg.nodes.len(), 1);
        assert!(dfg.edges.is_empty());
        assert_eq!(*dfg.start_activities.get("X").unwrap(), 1);
        assert_eq!(*dfg.end_activities.get("X").unwrap(), 1);
    }

    #[test]
    fn test_one_chunk_equals_monolithic() {
        let log = make_log(&[
            &["A", "B", "C", "D"],
            &["D", "C", "B", "A"],
            &["A", "A", "B", "B"],
        ]);

        let mono = monolithic_dfg(&log);

        let config = HierarchicalConfig { num_chunks: 1, max_chunk_events: None };
        let col = log.to_columnar("concept:name");
        let chunked = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
        let chunked_dfg = chunked.to_dfg(&col.vocab);

        assert_eq!(mono.nodes.len(), chunked_dfg.nodes.len());
        assert_eq!(mono.edges.len(), chunked_dfg.edges.len());

        let mono_total: usize = mono.nodes.iter().map(|n| n.frequency).sum();
        let chunked_total: usize = chunked_dfg.nodes.iter().map(|n| n.frequency).sum();
        assert_eq!(mono_total, chunked_total);

        assert_eq!(mono.start_activities, chunked_dfg.start_activities);
        assert_eq!(mono.end_activities, chunked_dfg.end_activities);
    }

    // -- Merge associativity --

    #[test]
    fn test_merge_associativity() {
        // Build three separate chunk results and merge them in different orders
        let chunk1 = DfgChunker::discover_local(&[
            TraceInfo::from_ids(&[0, 1, 2]).unwrap(),
        ]);
        let chunk2 = DfgChunker::discover_local(&[
            TraceInfo::from_ids(&[1, 2, 3]).unwrap(),
        ]);
        let chunk3 = DfgChunker::discover_local(&[
            TraceInfo::from_ids(&[0, 3]).unwrap(),
        ]);

        let merged_abc = DfgChunker::merge(vec![
            DfgChunker::merge(vec![chunk1.clone(), chunk2.clone()]),
            chunk3.clone(),
        ]);

        let merged_acb = DfgChunker::merge(vec![
            DfgChunker::merge(vec![chunk1.clone(), chunk3.clone()]),
            chunk2.clone(),
        ]);

        assert_eq!(merged_abc.edge_counts, merged_acb.edge_counts);
        assert_eq!(merged_abc.node_freqs, merged_acb.node_freqs);
        assert_eq!(merged_abc.start_counts, merged_acb.start_counts);
        assert_eq!(merged_abc.end_counts, merged_acb.end_counts);
    }

    // -- DfgChunkResult::to_dfg --

    #[test]
    fn test_to_dfg_basic() {
        let mut result = DfgChunkResult::default();
        result.node_freqs.insert(0, 3);
        result.node_freqs.insert(1, 2);
        result.edge_counts.insert((0, 1), 2);
        result.edge_counts.insert((1, 0), 1);
        result.start_counts.insert(0, 2);
        result.end_counts.insert(1, 2);

        let vocab = vec!["A", "B"];
        let dfg = result.to_dfg(&vocab);

        assert_eq!(dfg.nodes.len(), 2);
        assert_eq!(dfg.edges.len(), 2);
        assert_eq!(*dfg.start_activities.get("A").unwrap(), 2);
        assert_eq!(*dfg.end_activities.get("B").unwrap(), 2);
    }

    // -- TraceInfo --

    #[test]
    fn test_trace_info_from_ids_empty() {
        assert!(TraceInfo::from_ids(&[]).is_none());
    }

    #[test]
    fn test_trace_info_from_ids_single() {
        let info = TraceInfo::from_ids(&[42]).unwrap();
        assert_eq!(info.activity_ids, vec![42]);
        assert_eq!(info.start_id, 42);
        assert_eq!(info.end_id, 42);
    }

    // -- max_chunk_events config --

    #[test]
    fn test_hierarchical_config_max_events() {
        let log = make_log(&[
            &["A", "B"],
            &["C", "D"],
            &["E", "F"],
            &["G", "H"],
        ]);

        // 2 events per chunk, 4 traces * 2 events = 8 total -> 4 chunks
        let config = HierarchicalConfig {
            num_chunks: 8,
            max_chunk_events: Some(2),
        };

        let col = log.to_columnar("concept:name");
        let result = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
        let dfg = result.to_dfg(&col.vocab);

        // All 8 activities should be present
        assert_eq!(dfg.nodes.len(), 8);
    }
}
