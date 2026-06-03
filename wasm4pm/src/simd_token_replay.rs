//! SIMD-accelerated token replay for Petri net conformance checking.
//!
//! Integer-encodes Petri net places and transitions, then uses aligned
//! `[u32; 64]` arrays for marking updates -- enabling SIMD vectorized operations
//! and loop-unrolled batch processing of preset/postset modifications.
//!
//! # Performance vs. String-Based Token Replay
//!
//! The existing token replay (`powl::conformance::token_replay`) uses
//! `HashMap<String, u32>` markings with string-keyed preset/postset
//! lookups. This module replaces those with:
//!
//! - **u32 integer IDs** for places and transitions (no string hashing)
//! - **[u32; 64] fixed array** for markings (zero allocation per trace)
//! - **Branchless fire** for preset/postset batch updates

use crate::models::{ColumnarLog, DFGNode, DirectlyFollowsGraph};
use rustc_hash::FxHashMap;

/// Integer-encoded Petri net for SIMD token replay.
#[derive(Debug, Clone)]
pub struct SimdPetriNet {
    #[allow(dead_code)]
    place_ids: FxHashMap<String, u32>,
    label_to_transitions: FxHashMap<String, Vec<u32>>,
    transition_labels: Vec<Option<String>>,
    preset: Vec<Vec<u32>>,
    postset: Vec<Vec<u32>>,
    num_places: usize,
}

#[derive(Debug, Clone, Default)]
pub struct TraceReplayResult {
    pub consumed: u32,
    pub produced: u32,
    pub missing: u32,
    pub remaining: u32,
    pub fitness: f64,
    /// Enabled activity count summed across all replay steps (ETC precision numerator basis).
    pub total_enabled: u32,
    /// Enabled activities NOT executed at each step (escaping arcs for ETC precision).
    pub total_escaping: u32,
    /// ETC precision for this trace: 1 - (total_escaping / total_enabled).
    pub precision: f64,
}

#[derive(Debug, Clone)]
pub struct LogReplayResult {
    pub trace_results: Vec<TraceReplayResult>,
    pub total_consumed: u32,
    pub total_produced: u32,
    pub total_missing: u32,
    pub total_remaining: u32,
    pub overall_fitness: f64,
    /// ETC precision across all traces: 1 - (Σescaping / Σenabled).
    pub overall_precision: f64,
    /// Generalization proxy: 1 - (unique_fitness_paths / total_traces), clamped [0,1].
    /// Measures diversity of execution paths observed in the log.
    pub overall_generalization: f64,
    pub total_enabled: u32,
    pub total_escaping: u32,
}

impl SimdPetriNet {
    pub fn from_dfg(dfg: &DirectlyFollowsGraph) -> Result<Self, String> {
        let mut place_ids: FxHashMap<String, u32> = FxHashMap::default();
        let mut label_to_transitions: FxHashMap<String, Vec<u32>> = FxHashMap::default();
        let mut transition_labels: Vec<Option<String>> = Vec::new();
        let mut preset: Vec<Vec<u32>> = Vec::new();
        let mut postset: Vec<Vec<u32>> = Vec::new();

        for node in &dfg.nodes {
            let id = place_ids.len() as u32;
            if id >= 64 {
                return Err("Petri net exceeds 64 places limit".to_string());
            }
            place_ids.entry(node.id.clone()).or_insert(id);
        }

        // Track which places have outgoing transitions (appear in any edge.from)
        let mut places_with_outgoing: std::collections::HashSet<u32> =
            std::collections::HashSet::default();

        for edge in &dfg.edges {
            let trans_id = transition_labels.len() as u32;
            let label = Some(edge.from.clone());
            transition_labels.push(label.clone());

            let from_id = *place_ids.get(&edge.from).unwrap_or(&0);
            let to_id = *place_ids.get(&edge.to).unwrap_or(&0);

            places_with_outgoing.insert(from_id);

            preset.push(vec![from_id]);
            postset.push(vec![to_id]);

            if let Some(ref lbl) = label {
                label_to_transitions
                    .entry(lbl.clone())
                    .or_default()
                    .push(trans_id);
            }
        }

        // Add a "consume" (sink) transition for every sink place — places that have no
        // outgoing edge in the DFG.  Without this, the last activity in any trace has
        // no transition to fire, which causes forced-fire / missing:+1 even for perfect
        // traces.
        for node in &dfg.nodes {
            let node_id = *place_ids.get(&node.id).unwrap_or(&0);
            if !places_with_outgoing.contains(&node_id) {
                let trans_id = transition_labels.len() as u32;
                transition_labels.push(Some(node.id.clone()));
                // Preset = the sink place itself; postset = empty (token consumed)
                preset.push(vec![node_id]);
                postset.push(vec![]);
                label_to_transitions
                    .entry(node.id.clone())
                    .or_default()
                    .push(trans_id);
            }
        }

        let num_places = place_ids.len();

        Ok(SimdPetriNet {
            place_ids,
            label_to_transitions,
            transition_labels,
            preset,
            postset,
            num_places,
        })
    }

    #[must_use]
    pub fn replay_trace(
        &self,
        activities: impl Iterator<Item = u32>,
        vocab: &[&str],
    ) -> TraceReplayResult {
        let mut marking = [0u32; 64];
        // Seed source places with one token each — canonical token replay initialization.
        // Without this, the first activity in a finite trace always fires as a "forced fire"
        // (no token available), producing M:+1 even for perfectly conformant traces.
        for &p in &self.source_places() {
            if (p as usize) < 64 {
                marking[p as usize] = 1;
            }
        }
        let mut consumed: u32 = 0;
        let mut produced: u32 = 0;
        let mut missing: u32 = 0;
        // ETC precision tracking: count enabled activities and escaping activities per step.
        let mut total_enabled: u32 = 0;
        let mut total_escaping: u32 = 0;

        let max_transitions = self
            .label_to_transitions
            .values()
            .map(|v| v.len())
            .max()
            .unwrap_or(1)
            .min(8);

        for activity_idx in activities {
            let activity = vocab[activity_idx as usize];
            let candidates = self.label_to_transitions.get(activity);

            // --- ETC precision: count enabled activities BEFORE firing (pre-fire marking) ---
            // enabled_count = number of distinct activities that have ≥1 enabled transition.
            // current_enabled = true if the activity we're about to execute has an enabled transition.
            let current_activity_enabled: bool = candidates
                .map(|c| {
                    c.iter().any(|&tid| {
                        self.preset[tid as usize]
                            .iter()
                            .all(|&p| marking[p as usize] > 0)
                    })
                })
                .unwrap_or(false);
            let enabled_count: u32 = self
                .label_to_transitions
                .values()
                .filter(|transitions| {
                    transitions.iter().any(|&tid| {
                        self.preset[tid as usize]
                            .iter()
                            .all(|&p| marking[p as usize] > 0)
                    })
                })
                .count() as u32;
            total_enabled += enabled_count;
            // Escaping = enabled activities that were NOT executed.
            // If current activity was enabled, one slot is "used" → escaping = enabled - 1.
            // If force-fired (not enabled), none were executed → escaping = enabled.
            total_escaping += enabled_count.saturating_sub(current_activity_enabled as u32);

            let mut fired = 0u32;
            let mut transition_idx = 0;

            while transition_idx < max_transitions {
                if let Some(candidates) = candidates {
                    if transition_idx < candidates.len() {
                        let trans_id = candidates[transition_idx];
                        let pre = &self.preset[trans_id as usize];
                        let post = &self.postset[trans_id as usize];

                        let mut all_enabled = 1u32;
                        for &p in pre.iter() {
                            all_enabled &= (marking[p as usize] > 0) as u32;
                        }

                        let can_fire = all_enabled & (fired == 0) as u32;

                        consumed += can_fire * pre.len() as u32;
                        produced += can_fire * post.len() as u32;

                        for &p in pre.iter() {
                            let idx = p as usize;
                            let current = marking[idx];
                            marking[idx] = current - can_fire * ((current > 0) as u32);
                        }

                        for &p in post.iter() {
                            let idx = p as usize;
                            marking[idx] += can_fire;
                        }

                        fired |= can_fire;
                    }
                }
                transition_idx += 1;
            }

            if fired == 0 {
                if let Some(candidates) = candidates {
                    if !candidates.is_empty() {
                        let trans_id = candidates[0];
                        let pre = &self.preset[trans_id as usize];
                        let post = &self.postset[trans_id as usize];

                        for &p in pre {
                            let idx = p as usize;
                            let is_zero = (marking[idx] == 0) as u32;
                            marking[idx] += is_zero;
                            produced += is_zero;
                            missing += is_zero;
                        }

                        consumed += pre.len() as u32;
                        produced += post.len() as u32;

                        for &p in pre.iter() {
                            let idx = p as usize;
                            let current = marking[idx];
                            marking[idx] = current - ((current > 0) as u32);
                        }

                        for &p in post.iter() {
                            let idx = p as usize;
                            marking[idx] += 1;
                        }
                    }
                } else {
                    missing += 1;
                }
            }
        }

        let remaining: u32 = marking[..self.num_places].iter().sum();

        let fitness = compute_fitness(consumed, produced, missing, remaining);
        let precision = if total_enabled == 0 {
            1.0
        } else {
            (1.0 - (total_escaping as f64 / total_enabled as f64)).clamp(0.0, 1.0)
        };

        TraceReplayResult {
            consumed,
            produced,
            missing,
            remaining,
            fitness,
            total_enabled,
            total_escaping,
            precision,
        }
    }

    #[must_use]
    pub fn replay_log(&self, col: &ColumnarLog) -> LogReplayResult {
        let mut trace_results = Vec::with_capacity(col.trace_offsets.len().saturating_sub(1));

        for t in 0..col.trace_offsets.len().saturating_sub(1) {
            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];
            let activities = col.events[start..end].iter().copied();
            trace_results.push(self.replay_trace(activities, &col.vocab));
        }

        let total_consumed: u32 = trace_results.iter().map(|r| r.consumed).sum();
        let total_produced: u32 = trace_results.iter().map(|r| r.produced).sum();
        let total_missing: u32 = trace_results.iter().map(|r| r.missing).sum();
        let total_remaining: u32 = trace_results.iter().map(|r| r.remaining).sum();
        let total_enabled: u32 = trace_results.iter().map(|r| r.total_enabled).sum();
        let total_escaping: u32 = trace_results.iter().map(|r| r.total_escaping).sum();

        let overall_fitness = compute_fitness(
            total_consumed,
            total_produced,
            total_missing,
            total_remaining,
        );
        let overall_precision = if total_enabled == 0 {
            1.0
        } else {
            (1.0 - (total_escaping as f64 / total_enabled as f64)).clamp(0.0, 1.0)
        };

        let total_traces = trace_results.len() as f64;
        // Generalization proxy: diverse fitness values indicate diverse execution paths.
        // unique_paths approximated by distinct fitness values (same fitness ≈ same path shape).
        let unique_paths: std::collections::HashSet<String> = trace_results
            .iter()
            .map(|t| format!("{:.6}", t.fitness))
            .collect();
        let overall_generalization = if total_traces == 0.0 {
            0.0_f64
        } else {
            (1.0_f64 - (unique_paths.len() as f64 / total_traces)).clamp(0.0, 1.0)
        };

        LogReplayResult {
            trace_results,
            total_consumed,
            total_produced,
            total_missing,
            total_remaining,
            overall_fitness,
            overall_precision,
            overall_generalization,
            total_enabled,
            total_escaping,
        }
    }

    /// Returns the indices of all source places — places that have no incoming transition.
    /// In a DFG-derived Petri net, these are the "start" activities with no predecessor.
    pub fn source_places(&self) -> Vec<u32> {
        // Collect all places that appear in ANY postset (places receiving tokens from transitions)
        let places_with_incoming: std::collections::HashSet<u32> = self
            .postset
            .iter()
            .flat_map(|post| post.iter().copied())
            .collect();

        // Source places are all declared places NOT in places_with_incoming
        (0..self.num_places as u32)
            .filter(|p| !places_with_incoming.contains(p))
            .collect()
    }

    pub fn num_places(&self) -> usize {
        self.num_places
    }

    pub fn num_transitions(&self) -> usize {
        self.transition_labels.len()
    }
}

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

            let net = match SimdPetriNet::from_dfg(&dfg) {
                Ok(n) => n,
                Err(e) => return Ok(serde_json::json!({"error": e}).to_string()),
            };

            let result = net.replay_log(&col);

            Ok(serde_json::json!({
                "overall_fitness": result.overall_fitness,
                "overall_precision": result.overall_precision,
                "overall_generalization": result.overall_generalization,
                "total_consumed": result.total_consumed,
                "total_produced": result.total_produced,
                "total_missing": result.total_missing,
                "total_remaining": result.total_remaining,
                "total_enabled": result.total_enabled,
                "total_escaping": result.total_escaping,
                "trace_count": result.trace_results.len(),
                "trace_results": result.trace_results.iter().map(|tr| {
                    serde_json::json!({
                        "consumed": tr.consumed,
                        "produced": tr.produced,
                        "missing": tr.missing,
                        "remaining": tr.remaining,
                        "fitness": tr.fitness,
                        "precision": tr.precision,
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

#[cfg(test)]
mod source_place_tests {
    use super::*;

    #[test]
    fn test_perfect_sequential_trace_achieves_1_0_fitness() {
        // Build a simple DFG: A → B → C
        let dfg = make_dfg(&[("A", "B"), ("B", "C")]);
        let net = SimdPetriNet::from_dfg(&dfg).unwrap();

        // Verify source_places() returns exactly A (index 0 — insertion order)
        let sources = net.source_places();
        assert!(!sources.is_empty(), "must have at least one source place");

        // Build vocab and replay the exact sequence the model was built from
        // place_ids are assigned in node insertion order from make_dfg
        let vocab: Vec<&str> = net.place_ids.iter().collect::<Vec<_>>().into_iter().fold(
            vec![""; net.num_places],
            |mut v, (name, &id)| {
                if (id as usize) < v.len() {
                    v[id as usize] = name.as_str();
                }
                v
            },
        );

        // Find activity indices by name
        let idx_a = *net.place_ids.get("A").unwrap() as usize;
        let idx_b = *net.place_ids.get("B").unwrap() as usize;
        let idx_c = *net.place_ids.get("C").unwrap() as usize;

        let trace = vec![idx_a as u32, idx_b as u32, idx_c as u32];
        let vocab_refs: Vec<&str> = vocab.clone();
        let result = net.replay_trace(trace.into_iter(), &vocab_refs);

        assert_eq!(
            result.missing, 0,
            "perfect trace should have 0 missing tokens"
        );
        assert_eq!(
            result.remaining, 0,
            "perfect trace should have 0 remaining tokens"
        );
        assert!(
            (result.fitness - 1.0).abs() < 1e-9,
            "perfect trace fitness should be 1.0, got {}",
            result.fitness
        );
    }

    #[test]
    fn test_source_places_single_source() {
        // A→B→C: only A has no incoming edge
        let dfg = make_dfg(&[("A", "B"), ("B", "C")]);
        let net = SimdPetriNet::from_dfg(&dfg).unwrap();
        let sources = net.source_places();
        // A is the place with no incoming edges
        let a_id = *net.place_ids.get("A").unwrap();
        assert!(sources.contains(&a_id), "A must be a source place in A→B→C");
        assert_eq!(sources.len(), 1, "exactly one source in a linear chain");
    }

    #[test]
    fn test_source_places_parallel_start() {
        // Two independent paths: A→C and B→C
        let dfg = make_dfg(&[("A", "C"), ("B", "C")]);
        let net = SimdPetriNet::from_dfg(&dfg).unwrap();
        let sources = net.source_places();
        let a_id = *net.place_ids.get("A").unwrap();
        let b_id = *net.place_ids.get("B").unwrap();
        assert!(sources.contains(&a_id), "A must be source");
        assert!(sources.contains(&b_id), "B must be source");
        assert_eq!(sources.len(), 2, "two sources in parallel-start DFG");
    }
}

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
        start_activities: std::collections::BTreeMap::new(),
        end_activities: std::collections::BTreeMap::new(),
    }
}
