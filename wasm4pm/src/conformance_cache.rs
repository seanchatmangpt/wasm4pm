//! Conformance result memoization.
//!
//! Caches conformance checking results keyed by (log_handle, model_hash).
//! Same log + same model = instant cache hit.  Useful for `pmctl compare`
//! which runs multiple algorithms against the same log, triggering repeated
//! conformance checks on identical log+model pairs.

use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use serde_json::json;
use wasm_bindgen::prelude::*;

/// A cached conformance result (lightweight summary).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedConformanceResult {
    pub fitness: f64,
    pub precision: f64,
    pub generalization: f64,
    pub trace_count: usize,
}

/// Conformance cache: (log_handle, model_hash) -> CachedConformanceResult.
#[derive(Debug, Serialize, Deserialize)]
pub struct ConformanceCache {
    cache: FxHashMap<(String, u64), CachedConformanceResult>,
    hits: u64,
    misses: u64,
}

impl ConformanceCache {
    /// Create an empty cache.
    pub fn new() -> Self {
        ConformanceCache {
            cache: FxHashMap::default(),
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

    /// Hash a DFG model (nodes + edges) into a `u64` cache key.
    ///
    /// Edges are sorted before hashing to ensure determinism regardless of
    /// insertion order.
    pub fn hash_model(dfg: &crate::models::DirectlyFollowsGraph) -> u64 {
        use rustc_hash::FxHasher;
        use std::hash::{Hash, Hasher};

        let mut h = FxHasher::default();

        // Hash nodes
        for node in &dfg.nodes {
            node.id.hash(&mut h);
            node.frequency.hash(&mut h);
        }

        // Hash edges (sorted for determinism)
        let mut edges: Vec<_> = dfg.edges.iter().collect();
        edges.sort_by(|a, b| a.from.cmp(&b.from).then(a.to.cmp(&b.to)));
        for edge in &edges {
            edge.from.hash(&mut h);
            edge.to.hash(&mut h);
            edge.frequency.hash(&mut h);
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

impl Default for ConformanceCache {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// WASM bindings
// ---------------------------------------------------------------------------

/// Create a new conformance cache.
#[wasm_bindgen]
pub fn conformance_cache_new() -> String {
    let cache = ConformanceCache::new();
    crate::state::get_or_init_state()
        .store_object(crate::state::StoredObject::JsonString(
            serde_json::to_string(&cache).unwrap_or_default(),
        ))
        .unwrap_or_default()
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
                Some(r) => {
                    serde_wasm_bindgen::to_value(&r).map_err(|e| JsValue::from_str(&e.to_string()))
                }
                None => Ok(JsValue::NULL),
            }
        }
        Some(_) => Err(JsValue::from_str("Object is not a ConformanceCache")),
        None => Err(JsValue::from_str(&format!("Cache '{}' not found", handle))),
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
            serde_wasm_bindgen::to_value(&json!({ "ok": true }))
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a ConformanceCache")),
        None => Err(JsValue::from_str(&format!("Cache '{}' not found", handle))),
    })
}

/// Get cache statistics: `{ hits, misses, entries }`.
#[wasm_bindgen]
pub fn conformance_cache_stats(handle: &str) -> Result<JsValue, JsValue> {
    crate::state::get_or_init_state().with_object(handle, |obj| match obj {
        Some(crate::state::StoredObject::JsonString(s)) => {
            let cache: ConformanceCache = serde_json::from_str(s).unwrap_or_default();
            let (hits, misses, entries) = cache.stats();
            serde_wasm_bindgen::to_value(&json!({
                "hits": hits,
                "misses": misses,
                "entries": entries,
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a ConformanceCache")),
        None => Err(JsValue::from_str(&format!("Cache '{}' not found", handle))),
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
            serde_wasm_bindgen::to_value(&json!({ "ok": true }))
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a ConformanceCache")),
        None => Err(JsValue::from_str(&format!("Cache '{}' not found", handle))),
    })
}

/// Hash a DFG model for use as a cache key.
#[wasm_bindgen]
pub fn conformance_cache_hash_model(dfg_json: &str) -> Result<JsValue, JsValue> {
    let dfg: crate::models::DirectlyFollowsGraph = serde_json::from_str(dfg_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid DFG JSON: {}", e)))?;
    let hash = ConformanceCache::hash_model(&dfg);
    serde_wasm_bindgen::to_value(&json!({ "hash": hash }))
        .map_err(|e| JsValue::from_str(&e.to_string()))
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
        let mut dfg = crate::models::DirectlyFollowsGraph::new();
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
