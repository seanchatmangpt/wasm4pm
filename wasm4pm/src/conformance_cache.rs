//! Conformance result memoization.
//!
//! Caches conformance checking results keyed by (log_handle, model_hash).
//! Same log + same model = instant cache hit.  Useful for `wpm compare`
//! which runs multiple algorithms against the same log, triggering repeated
//! conformance checks on identical log+model pairs.

use serde::{Deserialize, Serialize};
use serde_json::json;
use wasm_bindgen::prelude::*;

use crate::utilities::to_js_str;

/// A cached conformance result (lightweight summary).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedConformanceResult {
    pub fitness: f64,
    pub precision: f64,
    pub generalization: f64,
    pub trace_count: usize,
}

/// Conformance cache: (log_handle, model_hash) -> CachedConformanceResult.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ConformanceCache {
    cache: std::collections::BTreeMap<(String, u64), CachedConformanceResult>,
    hits: u64,
    misses: u64,
}

impl ConformanceCache {
    /// Create an empty cache.
    pub fn new() -> Self {
        ConformanceCache {
            cache: std::collections::BTreeMap::new(),
            hits: 0,
            misses: 0,
        }
    }

    /// Look up a cached result.  Returns `None` on cache miss.
    pub fn get(&mut self, log_handle: &str, model_hash: u64) -> Option<&CachedConformanceResult> {
        if let Some(result) = self.cache.get(&(log_handle.to_string(), model_hash)) {
            self.hits += 1;
            return Some(result);
        }
        self.misses += 1;
        None
    }

    /// Insert a conformance result into the cache.
    pub fn insert(&mut self, log_handle: String, model_hash: u64, result: CachedConformanceResult) {
        self.cache.insert((log_handle, model_hash), result);
    }

    /// Hash a DFG model (nodes + edges + start/end activities) into a `u64`
    /// cache key.
    ///
    /// All four DFG components are sorted by canonical key before hashing so
    /// that two structurally-identical DFGs produce the same hash regardless
    /// of their internal `Vec`/`HashMap` insertion order. The previous
    /// implementation iterated `dfg.nodes` in insertion order (defeating
    /// cache hits for the same DFG built two different ways) and silently
    /// ignored `start_activities` / `end_activities` entirely — causing two
    /// semantically-different DFGs to collide on the same key and return
    /// the wrong cached conformance result.
    ///
    /// # Determinism contract
    ///
    /// `hash_model(a) == hash_model(b)` iff `a` and `b` represent the same
    /// DFG (same node ids/labels/frequencies, same edges, same start/end
    /// activities).
    pub fn hash_model(dfg: &crate::models::DFG) -> u64 {
        use rustc_hash::FxHasher;
        use std::hash::{Hash, Hasher};

        let mut h = FxHasher::default();

        // Hash nodes (sorted by id for determinism). `label` is part of the
        // semantic identity of a node, so include it in the hash.
        let mut nodes: Vec<_> = dfg.nodes.iter().collect();
        nodes.sort_by(|a, b| a.id.cmp(&b.id));
        for node in &nodes {
            node.id.hash(&mut h);
            node.label.hash(&mut h);
            node.frequency.hash(&mut h);
        }

        // Hash edges (sorted for determinism).
        let mut edges: Vec<_> = dfg.edges.iter().collect();
        edges.sort_by(|a, b| a.from.cmp(&b.from).then(a.to.cmp(&b.to)));
        for edge in &edges {
            edge.from.hash(&mut h);
            edge.to.hash(&mut h);
            edge.frequency.hash(&mut h);
        }

        // Hash start/end activities (sorted by key for determinism).
        // HashMap iteration order is randomized, so we MUST sort before
        // hashing or the same DFG produces different cache keys across runs.
        let mut starts: Vec<_> = dfg.start_activities.iter().collect();
        starts.sort_by(|a, b| a.0.cmp(b.0));
        for (k, v) in &starts {
            "start".hash(&mut h);
            k.hash(&mut h);
            v.hash(&mut h);
        }

        let mut ends: Vec<_> = dfg.end_activities.iter().collect();
        ends.sort_by(|a, b| a.0.cmp(b.0));
        for (k, v) in &ends {
            "end".hash(&mut h);
            k.hash(&mut h);
            v.hash(&mut h);
        }

        h.finish()
    }

    /// Return (hits, misses, number_of_cached_entries).
    pub fn stats(&self) -> (u64, u64, usize) {
        (self.hits, self.misses, self.cache.len())
    }

    /// Clear all cached entries and reset hit/miss counters.
    pub fn clear(&mut self) {
        self.cache.clear();
        self.hits = 0;
        self.misses = 0;
    }
}

// ---------------------------------------------------------------------------
// WASM bindings
// ---------------------------------------------------------------------------

/// Create a new conformance cache.
#[wasm_bindgen]
pub fn conformance_cache_new() -> String {
    let cache = ConformanceCache::new();
    let json_str = serde_json::to_string(&cache).unwrap_or_else(|e| {
        eprintln!("Failed to serialize cache: {}", e);
        "{}".to_string()
    });

    crate::state::get_or_init_state()
        .store_object(crate::state::StoredObject::JsonString(json_str))
        .unwrap_or_else(|e| {
            eprintln!("Failed to store cache object: {:?}", e);
            "".to_string()
        })
}

/// Look up a cached conformance result.
///
/// Returns JSON `{ fitness, precision, generalization, trace_count }` on hit,
/// or `null` on miss.
#[wasm_bindgen]
pub fn conformance_cache_get(
    handle: &str,
    log_handle: &str,
    model_hash: u64,
) -> Result<JsValue, JsValue> {
    crate::state::get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(crate::state::StoredObject::JsonString(s)) => {
            let mut cache: ConformanceCache = serde_json::from_str(s).unwrap_or_default();
            let result = cache.get(log_handle, model_hash).cloned();
            *s = serde_json::to_string(&cache).unwrap_or_default();
            match result {
                Some(r) => serde_wasm_bindgen::to_value(&r)
                    .map_err(|e| crate::error::js_val(&e.to_string())),
                None => Ok(JsValue::NULL), // wasm4pm-s2-exclude: documented cache-miss return
            }
        }
        Some(_) => Err(crate::error::js_val("Object is not a ConformanceCache")),
        None => Err(crate::error::js_val(&format!(
            "Cache '{}' not found",
            handle
        ))),
    })
}

/// Insert a conformance result into the cache.
#[wasm_bindgen]
pub fn conformance_cache_insert(
    handle: &str,
    log_handle: &str,
    model_hash: u64,
    fitness: f64,
    precision: f64,
    generalization: f64,
    trace_count: usize,
) -> Result<JsValue, JsValue> {
    crate::state::get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(crate::state::StoredObject::JsonString(s)) => {
            let mut cache: ConformanceCache = serde_json::from_str(s).unwrap_or_default();
            cache.insert(
                log_handle.to_string(),
                model_hash,
                CachedConformanceResult {
                    fitness,
                    precision,
                    generalization,
                    trace_count,
                },
            );
            *s = serde_json::to_string(&cache).unwrap_or_default();
            to_js_str(&json!({ "ok": true }))
        }
        Some(_) => Err(crate::error::js_val("Object is not a ConformanceCache")),
        None => Err(crate::error::js_val(&format!(
            "Cache '{}' not found",
            handle
        ))),
    })
}

/// Get cache statistics: `{ hits, misses, entries }`.
#[wasm_bindgen]
pub fn conformance_cache_stats(handle: &str) -> Result<JsValue, JsValue> {
    crate::state::get_or_init_state().with_object(handle, |obj| match obj {
        Some(crate::state::StoredObject::JsonString(s)) => {
            let cache: ConformanceCache = serde_json::from_str(s).unwrap_or_default();
            let (hits, misses, entries) = cache.stats();
            to_js_str(&json!({
                "hits": hits,
                "misses": misses,
                "entries": entries,
            }))
        }
        Some(_) => Err(crate::error::js_val("Object is not a ConformanceCache")),
        None => Err(crate::error::js_val(&format!(
            "Cache '{}' not found",
            handle
        ))),
    })
}

/// Clear all cached entries.
#[wasm_bindgen]
pub fn conformance_cache_clear(handle: &str) -> Result<JsValue, JsValue> {
    crate::state::get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(crate::state::StoredObject::JsonString(s)) => {
            let mut cache: ConformanceCache = serde_json::from_str(s).unwrap_or_default();
            cache.clear();
            *s = serde_json::to_string(&cache).unwrap_or_default();
            to_js_str(&json!({ "ok": true }))
        }
        Some(_) => Err(crate::error::js_val("Object is not a ConformanceCache")),
        None => Err(crate::error::js_val(&format!(
            "Cache '{}' not found",
            handle
        ))),
    })
}

/// Hash a DFG model for use as a cache key.
#[wasm_bindgen]
pub fn conformance_cache_hash_model(dfg_json: &str) -> Result<JsValue, JsValue> {
    let dfg: crate::models::DFG = serde_json::from_str(dfg_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid DFG JSON: {}", e)))?;
    let hash = ConformanceCache::hash_model(&dfg);
    to_js_str(&json!({ "hash": hash }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_hit_miss() {
        let mut cache = ConformanceCache::new();

        // Miss
        assert!(cache.get("log1", 42).is_none());

        // Insert and hit
        let result = CachedConformanceResult {
            fitness: 0.95,
            precision: 0.88,
            generalization: 0.92,
            trace_count: 100,
        };
        cache.insert("log1".to_string(), 42, result.clone());

        let cached = cache.get("log1", 42).unwrap();
        assert_eq!(cached.fitness, 0.95);
    }

    #[test]
    fn test_different_keys() {
        let mut cache = ConformanceCache::new();
        cache.insert(
            "log1".to_string(),
            1,
            CachedConformanceResult {
                fitness: 0.9,
                precision: 0.8,
                generalization: 0.7,
                trace_count: 10,
            },
        );
        cache.insert(
            "log1".to_string(),
            2,
            CachedConformanceResult {
                fitness: 0.5,
                precision: 0.6,
                generalization: 0.7,
                trace_count: 20,
            },
        );

        assert_eq!(cache.get("log1", 1).unwrap().fitness, 0.9);
        assert_eq!(cache.get("log1", 2).unwrap().fitness, 0.5);
    }

    #[test]
    fn test_stats() {
        let mut cache = ConformanceCache::new();
        cache.get("log1", 1); // miss
        cache.get("log1", 1); // miss (nothing inserted yet)

        cache.insert(
            "log1".to_string(),
            1,
            CachedConformanceResult {
                fitness: 1.0,
                precision: 1.0,
                generalization: 1.0,
                trace_count: 1,
            },
        );
        cache.get("log1", 1); // hit

        let (hits, misses, entries) = cache.stats();
        assert_eq!(hits, 1);
        assert_eq!(misses, 2);
        assert_eq!(entries, 1);
    }

    #[test]
    fn test_hash_model_deterministic() {
        let mut dfg = crate::models::DFG::new();
        dfg.nodes.push(crate::models::DFGNode {
            id: "A".to_string(),
            label: "A".to_string(),
            frequency: 5,
        });
        dfg.nodes.push(crate::models::DFGNode {
            id: "B".to_string(),
            label: "B".to_string(),
            frequency: 3,
        });
        dfg.edges.push(crate::models::DirectlyFollowsRelation {
            from: "A".to_string(),
            to: "B".to_string(),
            frequency: 3,
        });

        let h1 = ConformanceCache::hash_model(&dfg);
        let h2 = ConformanceCache::hash_model(&dfg);
        assert_eq!(h1, h2); // Deterministic
    }

    /// Rank-1 (mathematical): node insertion order MUST NOT affect the hash.
    /// A DFG is a set of nodes; set equality is order-independent. Pre-fix,
    /// `dfg.nodes` was iterated in `Vec` order so the same DFG built two
    /// different ways produced different cache keys (causing cache misses
    /// that should have been hits — defeating the cache's purpose).
    #[test]
    fn test_hash_model_invariant_under_node_permutation() {
        let mut dfg_ab = crate::models::DFG::new();
        dfg_ab.nodes.push(crate::models::DFGNode {
            id: "A".into(),
            label: "A".into(),
            frequency: 5,
        });
        dfg_ab.nodes.push(crate::models::DFGNode {
            id: "B".into(),
            label: "B".into(),
            frequency: 3,
        });

        let mut dfg_ba = crate::models::DFG::new();
        dfg_ba.nodes.push(crate::models::DFGNode {
            id: "B".into(),
            label: "B".into(),
            frequency: 3,
        });
        dfg_ba.nodes.push(crate::models::DFGNode {
            id: "A".into(),
            label: "A".into(),
            frequency: 5,
        });

        assert_eq!(
            ConformanceCache::hash_model(&dfg_ab),
            ConformanceCache::hash_model(&dfg_ba),
            "hash_model must be invariant under node permutation"
        );
    }

    /// Rank-2 (domain): a node's `label` is part of its semantic identity in
    /// the process model. Two DFGs whose nodes share ids/frequencies but
    /// disagree on labels are DIFFERENT models and MUST hash differently —
    /// otherwise the cache returns the wrong conformance score.
    #[test]
    fn test_hash_model_sensitive_to_node_label() {
        let mut dfg1 = crate::models::DFG::new();
        dfg1.nodes.push(crate::models::DFGNode {
            id: "n1".into(),
            label: "Register".into(),
            frequency: 10,
        });

        let mut dfg2 = crate::models::DFG::new();
        dfg2.nodes.push(crate::models::DFGNode {
            id: "n1".into(),
            label: "Approve".into(), // different label, same id+freq
            frequency: 10,
        });

        assert_ne!(
            ConformanceCache::hash_model(&dfg1),
            ConformanceCache::hash_model(&dfg2),
            "differently-labeled nodes must produce different hashes"
        );
    }

    /// Rank-2 (domain): start/end activity sets are part of the DFG's
    /// process-mining semantics — they define which activities can begin or
    /// terminate a trace. Two DFGs with identical nodes/edges but distinct
    /// start sets describe different processes and MUST hash differently.
    #[test]
    fn test_hash_model_sensitive_to_start_end_activities() {
        let mk = |starts: &[(&str, usize)], ends: &[(&str, usize)]| {
            let mut dfg = crate::models::DFG::new();
            for (k, v) in starts {
                dfg.start_activities.insert((*k).to_string(), *v);
            }
            for (k, v) in ends {
                dfg.end_activities.insert((*k).to_string(), *v);
            }
            dfg
        };

        let dfg_start_a = mk(&[("A", 1)], &[("Z", 1)]);
        let dfg_start_b = mk(&[("B", 1)], &[("Z", 1)]);
        assert_ne!(
            ConformanceCache::hash_model(&dfg_start_a),
            ConformanceCache::hash_model(&dfg_start_b),
            "different start activities must hash differently"
        );

        let dfg_end_a = mk(&[("A", 1)], &[("Z", 1)]);
        let dfg_end_b = mk(&[("A", 1)], &[("Y", 1)]);
        assert_ne!(
            ConformanceCache::hash_model(&dfg_end_a),
            ConformanceCache::hash_model(&dfg_end_b),
            "different end activities must hash differently"
        );
    }

    /// Rank-1 (mathematical): HashMap iteration order is randomized in Rust,
    /// so any honest hash of start/end activities MUST sort the keys before
    /// hashing. Verify the hash is stable across distinct HashMap
    /// insertion orders for the same semantic content.
    #[test]
    fn test_hash_model_stable_across_hashmap_insertion_order() {
        let mut dfg1 = crate::models::DFG::new();
        dfg1.start_activities.insert("A".into(), 1);
        dfg1.start_activities.insert("B".into(), 2);
        dfg1.end_activities.insert("Y".into(), 3);
        dfg1.end_activities.insert("Z".into(), 4);

        let mut dfg2 = crate::models::DFG::new();
        dfg2.start_activities.insert("B".into(), 2);
        dfg2.start_activities.insert("A".into(), 1);
        dfg2.end_activities.insert("Z".into(), 4);
        dfg2.end_activities.insert("Y".into(), 3);

        assert_eq!(
            ConformanceCache::hash_model(&dfg1),
            ConformanceCache::hash_model(&dfg2),
            "hash must be stable across HashMap insertion order"
        );
    }

    /// Rank-2 (domain): cross-key isolation. A start activity "X" and an end
    /// activity "X" with the same count MUST NOT collide in the hash.
    /// Pre-fix, neither were hashed — post-fix, the `"start"` / `"end"` tag
    /// prefix prevents start/end key swaps from hashing to the same value.
    #[test]
    fn test_hash_model_start_and_end_are_distinct_namespaces() {
        let mut dfg1 = crate::models::DFG::new();
        dfg1.start_activities.insert("X".into(), 7);

        let mut dfg2 = crate::models::DFG::new();
        dfg2.end_activities.insert("X".into(), 7);

        assert_ne!(
            ConformanceCache::hash_model(&dfg1),
            ConformanceCache::hash_model(&dfg2),
            "start[X]=7 and end[X]=7 are semantically different DFGs"
        );
    }

    #[test]
    fn test_clear() {
        let mut cache = ConformanceCache::new();
        cache.insert(
            "log1".to_string(),
            1,
            CachedConformanceResult {
                fitness: 1.0,
                precision: 1.0,
                generalization: 1.0,
                trace_count: 1,
            },
        );
        cache.get("log1", 1); // hit

        cache.clear();
        assert!(cache.get("log1", 1).is_none()); // After clear = miss

        let (hits, _misses, entries) = cache.stats();
        assert_eq!(hits, 0);
        assert_eq!(entries, 0);
    }
}
