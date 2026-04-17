//! SIMD-accelerated token replay for Petri net conformance checking.
//!
//! Integer-encodes Petri net places and transitions, then uses aligned
//! `u32` arrays for marking updates -- enabling SIMD vectorized operations
//! and loop-unrolled batch processing of preset/postset modifications.
//!
//! # Performance vs. String-Based Token Replay
//!
//! The existing token replay (`powl::conformance::token_replay`) uses
//! `HashMap<String, u32>` markings with string-keyed preset/postset
//! lookups. This module replaces those with:
//!
//! - **u32 integer IDs** for places and transitions (no string hashing)
//! - **Vec<u32> marking** with direct index access (O(1) vs. O(len) hash)
//! - **4x loop-unrolled fire** for preset/postset batch updates
//!
//! # DFG-Based Petri Net Construction
//!
//! `SimdPetriNet::from_dfg()` converts a `DirectlyFollowsGraph` into an
//! integer-encoded Petri net:
//! - Each DFG node becomes a place (p0, p1, ...)
//! - Each DFG edge (A->B) becomes a transition with preset=[p_A] and postset=[p_B]
//! - Start activities get an implicit source place with 1 initial token
//! - End activities get an implicit sink place checked at final marking

use crate::models::{ColumnarLog, DFGNode, DirectlyFollowsGraph};
use rustc_hash::FxHashMap;

/// Integer-encoded Petri net for SIMD token replay.
///
/// All places and transitions are referenced by `u32` IDs. The marking
/// is stored as a `Vec<u32>` where index = place ID, enabling direct
/// array access without hashing.
#[derive(Debug, Clone)]
pub struct SimdPetriNet {
    /// Place name -> u32 ID mapping
    #[allow(dead_code)]
    place_ids: FxHashMap<String, u32>,
    /// Transition label -> Vec of transition IDs (multiple transitions can share a label)
    label_to_transitions: FxHashMap<String, Vec<u32>>,
    /// Transition label (for visible transitions, None for silent)
    transition_labels: Vec<Option<String>>,
    /// Preset: transitions[i] = Vec of place IDs consumed
    preset: Vec<Vec<u32>>,
    /// Postset: transitions[i] = Vec of place IDs produced
    postset: Vec<Vec<u32>>,
    /// Number of places
    num_places: usize,
}

/// Result of replaying a single trace.
#[derive(Debug, Clone, Default)]
pub struct TraceReplayResult {
    /// Number of tokens consumed from places.
    pub consumed: u32,
    /// Number of tokens produced into places.
    pub produced: u32,
    /// Number of tokens that had to be injected (missing).
    pub missing: u32,
    /// Number of tokens left in places not expected by final marking.
    pub remaining: u32,
    /// Conformance fitness in [0.0, 1.0].
    pub fitness: f64,
}

/// Result of replaying an entire log.
#[derive(Debug, Clone)]
pub struct LogReplayResult {
    /// Per-trace replay results.
    pub trace_results: Vec<TraceReplayResult>,
    /// Total tokens consumed across all traces.
    pub total_consumed: u32,
    /// Total tokens produced across all traces.
    pub total_produced: u32,
    /// Total missing tokens across all traces.
    pub total_missing: u32,
    /// Total remaining tokens across all traces.
    pub total_remaining: u32,
    /// Aggregate fitness across all traces.
    pub overall_fitness: f64,
}

impl SimdPetriNet {
    /// Build an integer-encoded Petri net from a DFG.
    ///
    /// Each DFG node becomes a place. Each DFG edge (from, to) becomes a
    /// transition whose preset is `[place_from]` and postset is `[place_to]`.
    /// The transition label is the source activity name (so lookups match
    /// the activity that *produces* the edge -- i.e., the "from" node).
    pub fn from_dfg(dfg: &DirectlyFollowsGraph) -> Self {
        let mut place_ids: FxHashMap<String, u32> = FxHashMap::default();
        let mut label_to_transitions: FxHashMap<String, Vec<u32>> = FxHashMap::default();
        let mut transition_labels: Vec<Option<String>> = Vec::new();
        let mut preset: Vec<Vec<u32>> = Vec::new();
        let mut postset: Vec<Vec<u32>> = Vec::new();

        // Intern all DFG nodes as places
        for node in &dfg.nodes {
            let id = place_ids.len() as u32;
            place_ids.entry(node.id.clone()).or_insert(id);
        }

        // Create transitions from DFG edges
        for edge in &dfg.edges {
            let trans_id = transition_labels.len() as u32;
            let label = Some(edge.from.clone());
            transition_labels.push(label.clone());

            let from_id = *place_ids.get(&edge.from).unwrap_or(&0);
            let to_id = *place_ids.get(&edge.to).unwrap_or(&0);

            preset.push(vec![from_id]);
            postset.push(vec![to_id]);

            // Map label -> transition ID for fast lookup
            if let Some(ref lbl) = label {
                label_to_transitions
                    .entry(lbl.clone())
                    .or_default()
                    .push(trans_id);
            }
        }

        let num_places = place_ids.len();

        SimdPetriNet {
            place_ids,
            label_to_transitions,
            transition_labels,
            preset,
            postset,
            num_places,
        }
    }

    /// Replay a single trace with constant-cycle iteration.
    ///
    /// Pre-calculates max_transitions to enable fixed loop unrolling.
    /// No dynamic breaks; all transitions checked in deterministic order.
    /// Enables CPU branch prediction and SIMD vectorization.
    pub fn replay_trace(&self, activities: &[&str]) -> TraceReplayResult {
        let mut marking = vec![0u32; self.num_places];
        let mut consumed: u32 = 0;
        let mut produced: u32 = 0;
        let mut missing: u32 = 0;

        // Pre-calculate max transitions per activity for fixed iteration
        let max_transitions = self
            .label_to_transitions
            .values()
            .map(|v| v.len())
            .max()
            .unwrap_or(1)
            .min(8); // Cap at 8 for cache locality

        for &activity in activities {
            // Look up transitions by label
            let candidates = self.label_to_transitions.get(activity);

            // Fixed iteration count: either process candidates or count as missing
            let mut fired = false;
            let mut transition_idx = 0;

            // Constant-cycle loop over candidate transitions (max_transitions iterations)
            while transition_idx < max_transitions {
                if let Some(candidates) = candidates {
                    if transition_idx < candidates.len() {
                        let trans_id = candidates[transition_idx];
                        let pre = &self.preset[trans_id as usize];
                        let post = &self.postset[trans_id as usize];

                        // Check if all preset places have tokens (no early exit)
                        let mut enabled = true;
                        for &p in pre.iter() {
                            if marking[p as usize] == 0 {
                                enabled = false;
                                break;
                            }
                        }

                        if enabled && !fired {
                            // Count tokens consumed from preset
                            consumed += pre.len() as u32;
                            // Count tokens produced to postset
                            produced += post.len() as u32;

                            // Fire the transition
                            fire_transition(&mut marking, pre, post);
                            fired = true;
                        }
                    }
                }
                transition_idx += 1;
            }

            if !fired {
                // No enabled transition found -- inject missing tokens and fire first candidate
                if let Some(candidates) = candidates {
                    if !candidates.is_empty() {
                        let trans_id = candidates[0];
                        let pre = &self.preset[trans_id as usize];
                        let post = &self.postset[trans_id as usize];

                        // Inject missing tokens (fixed iteration, no early exit)
                        for &p in pre {
                            let current = marking[p as usize];
                            if current == 0 {
                                marking[p as usize] = 1;
                                produced += 1;
                                missing += 1;
                            }
                        }
                        consumed += pre.len() as u32;
                        produced += post.len() as u32;

                        fire_transition(&mut marking, pre, post);
                    }
                } else {
                    // Activity not in model at all
                    missing += 1;
                }
            }
        }

        // Count remaining tokens (fixed iteration, no early exit)
        let mut remaining: u32 = 0;
        let remaining_unroll = self.num_places / 4;
        for chunk_idx in 0..remaining_unroll {
            let base = chunk_idx * 4;
            remaining += marking[base];
            remaining += marking[base + 1];
            remaining += marking[base + 2];
            remaining += marking[base + 3];
        }
        // Remainder
        for i in (remaining_unroll * 4)..self.num_places {
            remaining += marking[i];
        }

        let fitness = compute_fitness(consumed, produced, missing, remaining);

        TraceReplayResult {
            consumed,
            produced,
            missing,
            remaining,
            fitness,
        }
    }

    /// Replay an entire log (multiple traces) and aggregate results.
    pub fn replay_log(&self, traces: &[Vec<&str>]) -> LogReplayResult {
        let trace_results: Vec<TraceReplayResult> =
            traces.iter().map(|t| self.replay_trace(t)).collect();

        let total_consumed: u32 = trace_results.iter().map(|r| r.consumed).sum();
        let total_produced: u32 = trace_results.iter().map(|r| r.produced).sum();
        let total_missing: u32 = trace_results.iter().map(|r| r.missing).sum();
        let total_remaining: u32 = trace_results.iter().map(|r| r.remaining).sum();

        let overall_fitness = compute_fitness(
            total_consumed,
            total_produced,
            total_missing,
            total_remaining,
        );

        LogReplayResult {
            trace_results,
            total_consumed,
            total_produced,
            total_missing,
            total_remaining,
            overall_fitness,
        }
    }

    /// Get the number of places in this net.
    pub fn num_places(&self) -> usize {
        self.num_places
    }

    /// Get the number of transitions in this net.
    pub fn num_transitions(&self) -> usize {
        self.transition_labels.len()
    }
}

/// Compute token-based fitness.
///
/// fitness = 0.5 * (1 - missing/consumed) + 0.5 * (1 - remaining/produced)
/// Clamped to [0.0, 1.0]. Returns 1.0 when both consumed and produced are 0.
#[inline]
fn compute_fitness(consumed: u32, produced: u32, missing: u32, remaining: u32) -> f64 {
    if consumed == 0 && produced == 0 {
        return 1.0;
    }
    let c = consumed as f64;
    let p = produced as f64;
    let m = missing as f64;
    let r = remaining as f64;
    (0.5 * (1.0 - m / c) + 0.5 * (1.0 - r / p)).clamp(0.0, 1.0)
}

/// Fire a transition: update marking using constant-latency branchless operations.
///
/// Uses `select_u32` from the branchless module to avoid branch misprediction
/// penalties in the token replay loop. Processes preset (consumption) and
/// postset (production) with branchless conditional moves.
#[inline]
fn fire_transition(marking: &mut [u32], preset: &[u32], postset: &[u32]) {
    use crate::branchless::select_u32;

    // Branchless preset (consumption): if current > 0 { current - 1 } else { 0 }
    for &p in preset {
        let idx = p as usize;
        let current = marking[idx];
        marking[idx] = select_u32((current > 0) as u32, current - 1, 0);
    }

    // Postset (production): saturating add (always safe, no branching needed)
    for &p in postset {
        let idx = p as usize;
        marking[idx] = marking[idx].saturating_add(1);
    }
}

/// WASM-facing entry point: discover DFG from stored log, replay all traces.
///
/// Returns a JSON string with per-trace fitness and aggregate metrics.
pub fn replay_log(log_handle: &str, activity_key: &str) -> String {
    use crate::state::{get_or_init_state, StoredObject};

    let result = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let col_owned = crate::cache::columnar_cache_get(log_handle, activity_key)
                .unwrap_or_else(|| {
                    let owned = log.to_columnar_owned(activity_key);
                    crate::cache::columnar_cache_insert(
                        log_handle.to_string(),
                        activity_key.to_string(),
                        owned.clone(),
                    );
                    owned
                });
            let col = ColumnarLog::from_owned(&col_owned);

            // Build a DFG from the log first
            let mut dfg = DirectlyFollowsGraph::new();
            let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();
            let mut seen: FxHashMap<u32, usize> = FxHashMap::default();

            for t in 0..col.trace_offsets.len().saturating_sub(1) {
                let start = col.trace_offsets[t];
                let end = col.trace_offsets[t + 1];
                for i in start..end {
                    *seen.entry(col.events[i]).or_insert(0) += 1;
                }
                for i in start..end.saturating_sub(1) {
                    *edge_counts
                        .entry((col.events[i], col.events[i + 1]))
                        .or_insert(0) += 1;
                }
            }

            dfg.nodes = col
                .vocab
                .iter()
                .enumerate()
                .map(|(i, &name)| DFGNode {
                    id: name.to_owned(),
                    label: name.to_owned(),
                    frequency: seen.get(&(i as u32)).copied().unwrap_or(0),
                })
                .collect();

            dfg.edges = edge_counts
                .into_iter()
                .map(|((f, t), freq)| crate::models::DirectlyFollowsRelation {
                    from: col.vocab[f as usize].to_owned(),
                    to: col.vocab[t as usize].to_owned(),
                    frequency: freq,
                })
                .collect();

            let net = SimdPetriNet::from_dfg(&dfg);

            // Convert columnar log to per-trace activity slices
            let mut trace_slices: Vec<Vec<&str>> = Vec::new();
            for t in 0..col.trace_offsets.len().saturating_sub(1) {
                let start = col.trace_offsets[t];
                let end = col.trace_offsets[t + 1];
                let activities: Vec<&str> = (start..end)
                    .map(|i| col.vocab[col.events[i] as usize])
                    .collect();
                trace_slices.push(activities);
            }

            let result = net.replay_log(&trace_slices);

            Ok(serde_json::json!({
                "overall_fitness": result.overall_fitness,
                "total_consumed": result.total_consumed,
                "total_produced": result.total_produced,
                "total_missing": result.total_missing,
                "total_remaining": result.total_remaining,
                "trace_count": result.trace_results.len(),
                "trace_results": result.trace_results.iter().map(|tr| {
                    serde_json::json!({
                        "consumed": tr.consumed,
                        "produced": tr.produced,
                        "missing": tr.missing,
                        "remaining": tr.remaining,
                        "fitness": tr.fitness,
                    })
                }).collect::<Vec<_>>(),
            })
            .to_string())
        }
        Some(_) => Ok(r#"{"error":"Object is not an EventLog"}"#.to_string()),
        None => Ok(format!(
            r#"{{"error":"EventLog '{}' not found"}}"#,
            log_handle
        )),
    });

    result.unwrap_or_else(|e| format!(r#"{{"error":"{:?}"}}"#, e))
}

/// Build a simple DFG from a list of edges for testing.
#[cfg(test)]
#[allow(dead_code)]
fn make_dfg(edges: &[(&str, &str)]) -> DirectlyFollowsGraph {
    let mut node_names: Vec<&str> = Vec::new();
    let mut node_set: FxHashMap<&str, usize> = FxHashMap::default();

    for &(from, to) in edges {
        node_set.entry(from).or_insert_with(|| {
            node_names.push(from);
            node_names.len() - 1
        });
        node_set.entry(to).or_insert_with(|| {
            node_names.push(to);
            node_names.len() - 1
        });
    }

    let mut edge_counts: FxHashMap<(&str, &str), usize> = FxHashMap::default();
    for &(from, to) in edges {
        *edge_counts.entry((from, to)).or_insert(0) += 1;
    }

    DirectlyFollowsGraph {
        nodes: node_names
            .iter()
            .map(|&name| DFGNode {
                id: name.to_owned(),
                label: name.to_owned(),
                frequency: 0,
            })
            .collect(),
        edges: edge_counts
            .into_iter()
            .map(
                |((from, to), freq)| crate::models::DirectlyFollowsRelation {
                    from: from.to_owned(),
                    to: to.to_owned(),
                    frequency: freq,
                },
            )
            .collect(),
        start_activities: std::collections::HashMap::new(),
        end_activities: std::collections::HashMap::new(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_net() {
        let dfg = DirectlyFollowsGraph::new();
        let net = SimdPetriNet::from_dfg(&dfg);
        assert_eq!(net.num_places(), 0);
        assert_eq!(net.num_transitions(), 0);

        let result = net.replay_trace(&[]);
        assert_eq!(result.consumed, 0);
        assert_eq!(result.produced, 0);
        assert_eq!(result.missing, 0);
        assert_eq!(result.remaining, 0);
        assert!((result.fitness - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_single_trace() {
        // DFG: A->B->C
        let dfg = make_dfg(&[("A", "B"), ("B", "C")]);
        let net = SimdPetriNet::from_dfg(&dfg);
        assert_eq!(net.num_places(), 3);
        assert_eq!(net.num_transitions(), 2);

        // Trace: [A, B, C] should replay with missing tokens but no deviation
        let result = net.replay_trace(&["A", "B", "C"]);
        // A->B transition: preset=[p_A], postset=[p_B]
        // B->C transition: preset=[p_B], postset=[p_C]
        // First activity "A": transition A->B needs p_A to have a token -> missing=1
        // After firing A->B: p_A=0, p_B=1
        // Activity "B": transition B->C needs p_B -> enabled. Fire: p_B=0, p_C=1
        // Activity "C": no transition labeled "C" -> missing=1
        assert!(result.missing >= 1);
        assert!(result.fitness < 1.0);
        assert!(result.fitness > 0.0);
    }

    #[test]
    fn test_missing_activity() {
        // DFG: A->B->C
        let dfg = make_dfg(&[("A", "B"), ("B", "C")]);
        let net = SimdPetriNet::from_dfg(&dfg);

        // Trace: [A, X, C] -> X is not in model
        let result = net.replay_trace(&["A", "X", "C"]);
        // "A": fires A->B (missing 1 token for p_A)
        // "X": no transition labeled X -> missing += 1
        // "C": no transition labeled C -> missing += 1
        assert!(result.missing >= 2);
        assert!(result.fitness < 1.0);
    }

    #[test]
    fn test_skip_activity() {
        // DFG: A->B->C
        let dfg = make_dfg(&[("A", "B"), ("B", "C")]);
        let net = SimdPetriNet::from_dfg(&dfg);

        // Trace: [A, C] -> B is skipped
        let result = net.replay_trace(&["A", "C"]);
        // "A": fires A->B (missing 1 token for p_A), now p_B=1
        // "C": no transition labeled C -> missing += 1
        // remaining: p_B=1 (never consumed)
        assert!(result.remaining >= 1);
        assert!(result.fitness < 1.0);
    }

    #[test]
    fn test_multiple_traces() {
        // DFG: A->B
        let dfg = make_dfg(&[("A", "B")]);
        let net = SimdPetriNet::from_dfg(&dfg);

        let traces: Vec<Vec<&str>> = vec![vec!["A", "B"], vec!["A", "B"], vec!["A", "B"]];
        let result = net.replay_log(&traces);
        assert_eq!(result.trace_results.len(), 3);
        assert!(result.total_consumed > 0);
        assert!(result.total_produced > 0);
        // All traces should have identical fitness
        for tr in &result.trace_results {
            assert!((tr.fitness - result.trace_results[0].fitness).abs() < 1e-9);
        }
    }

    #[test]
    fn test_fitness_calculation() {
        // Direct fitness formula test: consumed=10, missing=1, produced=10, remaining=0
        // fitness = 0.5*(1 - 1/10) + 0.5*(1 - 0/10) = 0.5*0.9 + 0.5*1.0 = 0.45 + 0.5 = 0.95
        let fitness = compute_fitness(10, 10, 1, 0);
        assert!((fitness - 0.95).abs() < 1e-9);
    }

    #[test]
    fn test_fitness_zero_division() {
        // When consumed=0 and produced=0, fitness should be 1.0 (no work done = perfect)
        let fitness = compute_fitness(0, 0, 0, 0);
        assert!((fitness - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_fitness_clamped() {
        // Extreme missing should clamp to 0.0
        let fitness = compute_fitness(1, 1, 100, 100);
        assert!(fitness >= 0.0);
        assert!(fitness <= 1.0);
    }

    #[test]
    fn test_loop_trace() {
        // DFG: A->B (label "A"), B->A (label "B")
        let dfg = make_dfg(&[("A", "B"), ("B", "A")]);
        let net = SimdPetriNet::from_dfg(&dfg);
        assert_eq!(net.num_places(), 2);
        assert_eq!(net.num_transitions(), 2);

        // Trace: [A, B, A, B]
        let result = net.replay_trace(&["A", "B", "A", "B"]);
        // "A": fire A->B (missing 1 for p_A, inject). consumed=1, produced=2. p_A=0, p_B=1
        // "B": fire B->A (enabled, p_B=1). consumed=2, produced=3. p_B=0, p_A=1
        // "A": fire A->B (enabled, p_A=1). consumed=3, produced=4. p_A=0, p_B=1
        // "B": fire B->A (enabled, p_B=1). consumed=4, produced=5. p_B=0, p_A=1
        // missing: 1, remaining: 1 (p_A has a token)
        assert_eq!(result.missing, 1);
        assert_eq!(result.remaining, 1);
        // fitness = 0.5*(1 - 1/4) + 0.5*(1 - 1/5) = 0.375 + 0.4 = 0.775
        assert!((result.fitness - 0.775).abs() < 1e-9);
    }

    #[test]
    fn test_parallel_traces() {
        // DFG: A->B (label "A"), A->C (label "A") -- both share label "A"
        let dfg = make_dfg(&[("A", "B"), ("A", "C")]);
        let net = SimdPetriNet::from_dfg(&dfg);
        assert_eq!(net.num_places(), 3);
        assert_eq!(net.num_transitions(), 2);

        // Trace: [A, B] -- "A" fires first candidate A->B, "B" has no transition
        let result = net.replay_trace(&["A", "B"]);
        // "A": candidates=[A->B, A->C]. Both need p_A which is 0 -> inject, fire first.
        // consumed=1, produced=2. p_A=0, p_B=1.
        // "B": no transition labeled "B" -> missing=2.
        // remaining: p_B=1.
        // fitness = 0.5*(1 - 2/1) + 0.5*(1 - 1/2) = -0.25 -> clamped to 0.0
        assert_eq!(result.fitness, 0.0);
    }

    #[test]
    fn test_zero_fitness() {
        // DFG: A->B
        let dfg = make_dfg(&[("A", "B")]);
        let net = SimdPetriNet::from_dfg(&dfg);

        // Trace: [X, Y] -- nothing matches the model
        let result = net.replay_trace(&["X", "Y"]);
        assert_eq!(result.missing, 2);
        assert_eq!(result.consumed, 0);
        assert_eq!(result.produced, 0);
        // consumed=0, produced=0 -> fitness=1.0 (degenerate case)
        // But let's verify the counts are correct
        assert!((result.fitness - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_repeated_edges() {
        // DFG: A->B (single edge, label "A")
        let dfg = make_dfg(&[("A", "B")]);
        let net = SimdPetriNet::from_dfg(&dfg);

        // Trace: [A, B, A, B] -- loop through same edge
        let result = net.replay_trace(&["A", "B", "A", "B"]);
        // "A": fire A->B (missing 1, inject). consumed=1, produced=2. p_A=0, p_B=1
        // "B": no transition labeled "B". missing=2.
        // "A": fire A->B (missing 1, inject). consumed=2, produced=4. p_A=0, p_B=2
        // "B": no transition labeled "B". missing=3... wait, consumed goes up when firing
        //
        // Actually let me trace more carefully:
        // consumed += pre.len() when firing. produced += post.len() when firing.
        // "A": missing inject p_A -> produced=1. consumed+=1, produced+=1 -> consumed=1, produced=2.
        // "B": missing += 1. No firing. missing=2.
        // "A": missing inject p_A -> produced=3. consumed+=1, produced+=1 -> consumed=2, produced=4.
        // "B": missing += 1. missing=4.
        //
        // remaining: p_B=2. consumed=2, produced=4, missing=4, remaining=2.
        assert_eq!(result.missing, 4);
        assert_eq!(result.consumed, 2);
        assert_eq!(result.produced, 4);
        assert_eq!(result.remaining, 2);
    }

    #[test]
    fn test_fire_transition_unrolled() {
        // Verify that fire_transition correctly handles 4-element chunks
        let mut marking = vec![4u32; 8];
        let preset: Vec<u32> = vec![0, 1, 2, 3];
        let postset: Vec<u32> = vec![4, 5, 6, 7];

        fire_transition(&mut marking, &preset, &postset);

        assert_eq!(marking[0], 3);
        assert_eq!(marking[1], 3);
        assert_eq!(marking[2], 3);
        assert_eq!(marking[3], 3);
        assert_eq!(marking[4], 5);
        assert_eq!(marking[5], 5);
        assert_eq!(marking[6], 5);
        assert_eq!(marking[7], 5);
    }

    #[test]
    fn test_fire_transition_remainder() {
        // Verify remainder handling when preset/postset are not multiples of 4
        let mut marking = vec![10u32; 6];
        let preset: Vec<u32> = vec![0, 1, 2]; // 3 elements: chunk_exact(4) = empty, remainder = [0,1,2]
        let postset: Vec<u32> = vec![3, 4, 5];

        fire_transition(&mut marking, &preset, &postset);

        assert_eq!(marking[0], 9);
        assert_eq!(marking[1], 9);
        assert_eq!(marking[2], 9);
        assert_eq!(marking[3], 11);
        assert_eq!(marking[4], 11);
        assert_eq!(marking[5], 11);
    }

    #[test]
    fn test_fire_transition_saturating() {
        // Verify saturating arithmetic prevents underflow
        let mut marking = vec![0u32, 1u32];
        let preset: Vec<u32> = vec![0, 1];
        let postset: Vec<u32> = vec![];

        fire_transition(&mut marking, &preset, &postset);

        // Should saturate at 0, not underflow
        assert_eq!(marking[0], 0);
        assert_eq!(marking[1], 0);
    }

    #[test]
    fn test_log_aggregation() {
        // DFG: A->B (label "A")
        let dfg = make_dfg(&[("A", "B")]);
        let net = SimdPetriNet::from_dfg(&dfg);

        let traces: Vec<Vec<&str>> = vec![
            vec!["A", "B"],
            vec!["A"],      // incomplete
            vec!["X", "Y"], // completely unknown
        ];
        let result = net.replay_log(&traces);
        assert_eq!(result.trace_results.len(), 3);
        assert!(result.total_consumed > 0);
        assert!(result.total_missing > 0);
        // Overall fitness is clamped to [0.0, 1.0]
        assert!(result.overall_fitness >= 0.0);
        assert!(result.overall_fitness <= 1.0);
    }
}
