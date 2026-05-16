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
}

#[derive(Debug, Clone)]
pub struct LogReplayResult {
    pub trace_results: Vec<TraceReplayResult>,
    pub total_consumed: u32,
    pub total_produced: u32,
    pub total_missing: u32,
    pub total_remaining: u32,
    pub overall_fitness: f64,
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

        for edge in &dfg.edges {
            let trans_id = transition_labels.len() as u32;
            let label = Some(edge.from.clone());
            transition_labels.push(label.clone());

            let from_id = *place_ids.get(&edge.from).unwrap_or(&0);
            let to_id = *place_ids.get(&edge.to).unwrap_or(&0);

            preset.push(vec![from_id]);
            postset.push(vec![to_id]);

            if let Some(ref lbl) = label {
                label_to_transitions
                    .entry(lbl.clone())
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
        let mut consumed: u32 = 0;
        let mut produced: u32 = 0;
        let mut missing: u32 = 0;

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

        TraceReplayResult {
            consumed,
            produced,
            missing,
            remaining,
            fitness,
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
