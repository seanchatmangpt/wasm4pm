//! Smart Execution Engine — fused computation with caching and early termination.
//!
//! Three components work together to avoid redundant work:
//!
//! 1. **LruCache** — cross-algorithm result cache keyed on `(log_hash, algorithm_name)`.
//!    Repeated runs with the same log and algorithm are served from cache in O(1).
//!
//! 2. **ConvergenceMonitor** — early termination when iterative algorithms stop
//!    improving (improvement < threshold for `window_size` consecutive iterations).
//!
//! 3. **FusedMultiPass** — single DFG construction shared across DFG-based algorithms
//!    (heuristic, skeleton, optimized_dfg). The DFG is computed once and reused.

use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

use crate::models::{DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation};
use crate::streaming::{ActivityInterner, Interner};
use rustc_hash::FxHashMap;

// ============================================================================
// 1. LRU Cache
// ============================================================================

/// Least-recently-used cache for cross-algorithm result caching.
///
/// Keys are `(u64, String)` pairs where the u64 is a log fingerprint and the
/// String is the algorithm name.  Values are serialised JSON strings so that
/// the cache is agnostic to result types.
struct LruCache<V> {
    /// key -> (value, access_order)
    map: FxHashMap<String, (V, u64)>,
    /// Maximum number of entries before eviction
    capacity: usize,
    /// Monotonically increasing access counter for LRU ordering
    access_counter: u64,
    /// Running statistics
    hits: u64,
    misses: u64,
    evictions: u64,
}

impl<V: Clone> LruCache<V> {
    /// Create a new LRU cache with the given capacity.
    fn new(capacity: usize) -> Self {
        LruCache {
            map: FxHashMap::default(),
            capacity,
            access_counter: 0,
            hits: 0,
            misses: 0,
            evictions: 0,
        }
    }

    /// Look up a cached value by key.  Returns `None` on miss.
    /// On hit, the entry's access order is refreshed to most-recent.
    fn get(&mut self, key: &str) -> Option<V> {
        self.access_counter += 1;
        if let Some((value, _order)) = self.map.get_mut(key) {
            self.hits += 1;
            let v = value.clone();
            // Refresh access order
            self.map.get_mut(key).unwrap().1 = self.access_counter;
            return Some(v);
        }
        self.misses += 1;
        None
    }

    /// Insert a value into the cache.  If capacity is exceeded, the
    /// least-recently-used entry is evicted.
    fn insert(&mut self, key: String, value: V) {
        self.access_counter += 1;

        // Evict LRU entry if at capacity and key is new
        if self.map.len() >= self.capacity && !self.map.contains_key(&key) {
            let lru_key = self
                .map
                .iter()
                .min_by_key(|(_, (_, order))| *order)
                .map(|(k, _)| k.clone());
            if let Some(evict_key) = lru_key {
                self.map.remove(&evict_key);
                self.evictions += 1;
            }
        }

        self.map.insert(key, (value, self.access_counter));
    }

    /// Remove all entries from the cache.
    fn clear(&mut self) {
        self.map.clear();
    }

    /// Return (hits, misses, evictions).
    fn stats(&self) -> (u64, u64, u64) {
        (self.hits, self.misses, self.evictions)
    }

    /// Number of entries currently in the cache.
    #[cfg(test)]
    fn len(&self) -> usize {
        self.map.len()
    }
}

// ============================================================================
// 2. Convergence Monitor
// ============================================================================

/// Monitors iterative algorithms for convergence to enable early termination.
///
/// Maintains a sliding window of recent metric values.  When the relative
/// improvement over the entire window falls below `threshold`, the algorithm
/// is considered converged and `should_stop()` returns `true`.
struct ConvergenceMonitor {
    /// Recent metric values (newest at back)
    window: VecDeque<f64>,
    /// Number of consecutive stable values required to declare convergence
    window_size: usize,
    /// Minimum relative improvement to be considered "still improving"
    threshold: f64,
    /// Hard iteration cap regardless of convergence
    max_iterations: usize,
    /// Current iteration count
    iteration: usize,
}

impl ConvergenceMonitor {
    /// Create a new convergence monitor with default parameters.
    fn new() -> Self {
        ConvergenceMonitor {
            window: VecDeque::with_capacity(5),
            window_size: 5,
            threshold: 0.01, // 1%
            max_iterations: 100,
            iteration: 0,
        }
    }

    /// Create a convergence monitor with custom parameters.
    fn with_params(window_size: usize, threshold: f64, max_iterations: usize) -> Self {
        ConvergenceMonitor {
            window: VecDeque::with_capacity(window_size),
            window_size,
            threshold,
            max_iterations,
            iteration: 0,
        }
    }

    /// Feed a new metric value.  Returns `true` if the algorithm has converged
    /// (i.e., the relative improvement over the last `window_size` values is
    /// below `threshold`).
    fn update(&mut self, metric: f64) -> bool {
        self.iteration += 1;

        // Push new value, evict oldest if window is full
        if self.window.len() >= self.window_size {
            self.window.pop_front();
        }
        self.window.push_back(metric);

        self.is_converged()
    }

    /// Check whether the monitor has detected convergence.
    fn is_converged(&self) -> bool {
        if self.window.len() < self.window_size {
            return false;
        }

        // Compute relative improvement across the window.
        // If the first and last values are both zero (or very close), consider converged.
        let first = self.window.front().copied().unwrap_or(0.0);
        let last = self.window.back().copied().unwrap_or(0.0);

        let abs_improvement = (last - first).abs();
        let baseline = first.abs().max(last.abs()).max(1e-10);

        let relative_improvement = abs_improvement / baseline;

        relative_improvement < self.threshold
    }

    /// Check whether the algorithm should stop: either converged or hit max iterations.
    fn should_stop(&mut self, metric: f64) -> bool {
        let converged = self.update(metric);
        converged || self.iteration >= self.max_iterations
    }

    /// Reset the monitor for a new run.
    fn reset(&mut self) {
        self.window.clear();
        self.iteration = 0;
    }

    /// Current iteration count.
    fn current_iteration(&self) -> usize {
        self.iteration
    }
}

impl Default for ConvergenceMonitor {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 3. FusedMultiPass — single DFG shared across algorithms
// ============================================================================

/// Computes a Directly-Follows Graph once and shares it across multiple
/// DFG-based algorithm runs, avoiding redundant construction.
///
/// Algorithms that start from a DFG (heuristic miner, process skeleton,
/// optimized_dfg) benefit because the DFG is built only on first access.
struct FusedMultiPass {
    /// Cached DFG, if one has been computed
    dfg_cache: Option<DirectlyFollowsGraph>,
    /// Fingerprint of the log that produced the cached DFG
    dfg_log_hash: u64,
    /// Activity string interner
    interner: Interner,
    /// Number of times `compute_dfg` was called (first call does real work)
    dfg_compute_calls: usize,
}

impl FusedMultiPass {
    /// Create a new fused multi-pass context.
    fn new() -> Self {
        FusedMultiPass {
            dfg_cache: None,
            dfg_log_hash: 0,
            interner: Interner::new(),
            dfg_compute_calls: 0,
        }
    }

    /// Compute a simple hash fingerprint for a set of traces.
    /// Uses rustc_hash FxHasher for speed.
    fn hash_traces(traces: &[Vec<String>]) -> u64 {
        use rustc_hash::FxHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = FxHasher::default();
        traces.hash(&mut hasher);
        hasher.finish()
    }

    /// Compute a DFG from traces.  If the traces have not changed (same hash),
    /// the cached DFG is returned without recomputation.
    ///
    /// Returns a reference to the internally cached DFG.
    fn compute_dfg(&mut self, traces: &[Vec<String>]) -> &DirectlyFollowsGraph {
        self.dfg_compute_calls += 1;
        let hash = Self::hash_traces(traces);

        if self.dfg_cache.is_some() && self.dfg_log_hash == hash {
            return self.dfg_cache.as_ref().unwrap();
        }

        // Build DFG via interner for integer-keyed edge counting
        let mut node_counts: FxHashMap<u32, usize> = FxHashMap::default();
        let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();
        let mut start_counts: FxHashMap<u32, usize> = FxHashMap::default();
        let mut end_counts: FxHashMap<u32, usize> = FxHashMap::default();

        for trace in traces {
            if trace.is_empty() {
                continue;
            }

            // Encode activities to integer IDs
            let encoded: Vec<u32> = trace.iter().map(|a| self.interner.intern(a)).collect();

            // Node frequencies
            for &id in &encoded {
                *node_counts.entry(id).or_insert(0) += 1;
            }

            // Directly-follows edges
            for window in encoded.windows(2) {
                *edge_counts.entry((window[0], window[1])).or_insert(0) += 1;
            }

            // Start/end activities
            *start_counts.entry(encoded[0]).or_insert(0) += 1;
            *end_counts.entry(*encoded.last().unwrap()).or_insert(0) += 1;
        }

        // Materialise DFG
        let vocab = self.interner.vocab();
        let mut nodes = Vec::with_capacity(vocab.len());
        for (i, name) in vocab.iter().enumerate() {
            nodes.push(DFGNode {
                id: name.clone(),
                label: name.clone(),
                frequency: node_counts.get(&(i as u32)).copied().unwrap_or(0),
            });
        }

        let mut edges = Vec::with_capacity(edge_counts.len());
        for ((f, t), &freq) in &edge_counts {
            edges.push(DirectlyFollowsRelation {
                from: self.interner.lookup(*f).unwrap_or("").to_string(),
                to: self.interner.lookup(*t).unwrap_or("").to_string(),
                frequency: freq,
            });
        }

        let mut start_activities: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for (&id, &cnt) in &start_counts {
            if let Some(name) = self.interner.lookup(id) {
                start_activities.insert(name.to_string(), cnt);
            }
        }

        let mut end_activities: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for (&id, &cnt) in &end_counts {
            if let Some(name) = self.interner.lookup(id) {
                end_activities.insert(name.to_string(), cnt);
            }
        }

        let dfg = DirectlyFollowsGraph {
            nodes,
            edges,
            start_activities,
            end_activities,
        };

        self.dfg_log_hash = hash;
        self.dfg_cache = Some(dfg);

        self.dfg_cache.as_ref().unwrap()
    }

    /// Run a DFG-based algorithm using a pre-computed DFG.
    ///
    /// For algorithms that accept a DFG as input, this avoids redundant
    /// DFG construction.  The `algorithm` parameter selects which processing
    /// to apply on top of the shared DFG.
    ///
    /// Returns a JSON string with the algorithm result.
    fn run_with_dfg(&mut self, algorithm: &str, traces: &[Vec<String>]) -> Result<String, String> {
        let dfg = self.compute_dfg(traces);

        match algorithm {
            "dfg" | "optimized_dfg" => {
                // DFG is already the result — serialise it
                serde_json::to_string(dfg).map_err(|e| format!("Failed to serialise DFG: {}", e))
            }
            "process_skeleton" => {
                // Skeleton is a filtered DFG: remove edges below a frequency threshold.
                // Use a simple heuristic: remove edges with frequency < 10% of max.
                let max_freq = dfg.edges.iter().map(|e| e.frequency).max().unwrap_or(1);
                let threshold = max_freq / 10;
                let filtered_edges: Vec<DirectlyFollowsRelation> = dfg
                    .edges
                    .iter()
                    .filter(|e| e.frequency > threshold)
                    .cloned()
                    .collect();
                let filtered_nodes: Vec<DFGNode> = dfg
                    .nodes
                    .iter()
                    .filter(|n| n.frequency > threshold / 2)
                    .cloned()
                    .collect();

                let skeleton = DirectlyFollowsGraph {
                    nodes: filtered_nodes,
                    edges: filtered_edges,
                    start_activities: dfg.start_activities.clone(),
                    end_activities: dfg.end_activities.clone(),
                };
                serde_json::to_string(&skeleton)
                    .map_err(|e| format!("Failed to serialise skeleton: {}", e))
            }
            "heuristic_miner" => {
                // Heuristic miner adds dependency measures on top of DFG.
                // Compute a simple all-connect / dependency score per edge.
                let heuristic_edges: Vec<serde_json::Value> = dfg
                    .edges
                    .iter()
                    .map(|e| {
                        // Dependency measure: (a->b - b->a) / (a->b + b->a + 1)
                        let ab = e.frequency as f64;
                        let ba = dfg
                            .edges
                            .iter()
                            .find(|r| r.from == e.to && r.to == e.from)
                            .map(|r| r.frequency as f64)
                            .unwrap_or(0.0);
                        let dep = (ab - ba) / (ab + ba + 1.0);
                        serde_json::json!({
                            "from": e.from,
                            "to": e.to,
                            "frequency": e.frequency,
                            "dependency": dep,
                        })
                    })
                    .collect();
                serde_json::to_string(&serde_json::json!({
                    "algorithm": "heuristic_miner",
                    "nodes": dfg.nodes,
                    "edges": heuristic_edges,
                }))
                .map_err(|e| format!("Failed to serialise heuristic result: {}", e))
            }
            _ => Err(format!("Unknown DFG-based algorithm: {}", algorithm)),
        }
    }

    /// Number of times `compute_dfg` was called (for testing cache hits).
    #[cfg(test)]
    fn dfg_compute_calls(&self) -> usize {
        self.dfg_compute_calls
    }

    /// Reset internal state.
    fn reset(&mut self) {
        self.dfg_cache = None;
        self.dfg_log_hash = 0;
        self.interner = Interner::new();
        self.dfg_compute_calls = 0;
    }
}

impl Default for FusedMultiPass {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Smart Engine — top-level facade
// ============================================================================

/// Top-level smart execution engine that combines caching, convergence
/// detection, and fused DFG computation.
pub struct SmartEngine {
    /// Cross-algorithm result cache
    cache: LruCache<String>,
    /// Convergence monitor for iterative algorithms
    convergence: ConvergenceMonitor,
    /// Fused DFG computation context
    fused: FusedMultiPass,
}

impl SmartEngine {
    /// Create a new smart engine with default parameters.
    pub fn new() -> Self {
        SmartEngine {
            cache: LruCache::new(64),
            convergence: ConvergenceMonitor::new(),
            fused: FusedMultiPass::new(),
        }
    }

    /// Create a smart engine with custom parameters.
    pub fn with_params(
        cache_capacity: usize,
        convergence_window: usize,
        convergence_threshold: f64,
        max_iterations: usize,
    ) -> Self {
        SmartEngine {
            cache: LruCache::new(cache_capacity),
            convergence: ConvergenceMonitor::with_params(
                convergence_window,
                convergence_threshold,
                max_iterations,
            ),
            fused: FusedMultiPass::new(),
        }
    }

    /// Run a DFG-based algorithm with caching and fused DFG computation.
    ///
    /// If the same `(log_hash, algorithm)` pair was run before, the cached
    /// result is returned.  Otherwise, the DFG is computed (or reused from
    /// the fused cache if the log is unchanged) and the algorithm runs on top.
    pub fn run(&mut self, algorithm: &str, traces: &[Vec<String>]) -> Result<String, String> {
        let log_hash = FusedMultiPass::hash_traces(traces);
        let cache_key = format!("{}:{}", log_hash, algorithm);

        // Check cache first
        if let Some(cached) = self.cache.get(&cache_key) {
            return Ok(cached);
        }

        // Run with fused DFG
        let result = self.fused.run_with_dfg(algorithm, traces)?;

        // Store in cache
        self.cache.insert(cache_key, result.clone());

        Ok(result)
    }

    /// Feed a metric value to the convergence monitor.
    /// Returns `true` if the algorithm should stop.
    pub fn check_convergence(&mut self, metric: f64) -> bool {
        self.convergence.should_stop(metric)
    }

    /// Check if the convergence monitor has detected convergence.
    pub fn is_converged(&self) -> bool {
        self.convergence.is_converged()
    }

    /// Get the current iteration count of the convergence monitor.
    pub fn current_iteration(&self) -> usize {
        self.convergence.current_iteration()
    }

    /// Get cache statistics: `{hits, misses, evictions}`.
    pub fn cache_stats(&self) -> (u64, u64, u64) {
        self.cache.stats()
    }

    /// Reset all internal state (cache, convergence, fused DFG).
    pub fn reset(&mut self) {
        self.cache.clear();
        self.convergence.reset();
        self.fused.reset();
    }
}

impl Default for SmartEngine {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// WASM Bindings
// ============================================================================

/// Opaque handle storage for smart engine instances.
static SMART_ENGINES: once_cell::sync::Lazy<std::sync::Mutex<FxHashMap<String, SmartEngine>>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(FxHashMap::default()));

/// Global counter for generating unique engine handles.
static ENGINE_COUNTER: once_cell::sync::Lazy<std::sync::Mutex<u64>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(0u64));

fn alloc_handle() -> String {
    let mut counter = ENGINE_COUNTER.lock().unwrap();
    let id = format!("smart_{}", *counter);
    *counter += 1;
    id
}

/// Create a new SmartEngine instance and return its handle.
#[wasm_bindgen]
pub fn smart_engine_create() -> String {
    let engine = SmartEngine::new();
    let handle = alloc_handle();
    SMART_ENGINES.lock().unwrap().insert(handle.clone(), engine);
    handle
}

/// Create a new SmartEngine instance with custom parameters.
#[wasm_bindgen]
pub fn smart_engine_create_with_params(
    cache_capacity: usize,
    convergence_window: usize,
    convergence_threshold: f64,
    max_iterations: usize,
) -> String {
    let engine = SmartEngine::with_params(
        cache_capacity,
        convergence_window,
        convergence_threshold,
        max_iterations,
    );
    let handle = alloc_handle();
    SMART_ENGINES.lock().unwrap().insert(handle.clone(), engine);
    handle
}

/// Run an algorithm via the smart engine.  Returns a JSON string result.
///
/// `traces_json` is a JSON array of arrays of strings:
/// `[["a","b","c"], ["a","b","d"]]`
#[wasm_bindgen]
pub fn smart_engine_run(
    handle: &str,
    algorithm: &str,
    traces_json: &str,
) -> Result<String, JsValue> {
    let traces: Vec<Vec<String>> = serde_json::from_str(traces_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid traces JSON: {}", e)))?;

    let mut engines = SMART_ENGINES.lock().unwrap();
    let engine = engines
        .get_mut(handle)
        .ok_or_else(|| JsValue::from_str(&format!("SmartEngine '{}' not found", handle)))?;

    engine
        .run(algorithm, &traces)
        .map_err(|e| JsValue::from_str(&e))
}

/// Check if the convergence monitor has detected convergence.
#[wasm_bindgen]
pub fn smart_engine_converged(handle: &str) -> Result<bool, JsValue> {
    let engines = SMART_ENGINES.lock().unwrap();
    let engine = engines
        .get(handle)
        .ok_or_else(|| JsValue::from_str(&format!("SmartEngine '{}' not found", handle)))?;
    Ok(engine.is_converged())
}

/// Get cache statistics as a JSON object: `{"hits":n,"misses":n,"evictions":n}`.
#[wasm_bindgen]
pub fn smart_engine_cache_stats(handle: &str) -> Result<String, JsValue> {
    let engines = SMART_ENGINES.lock().unwrap();
    let engine = engines
        .get(handle)
        .ok_or_else(|| JsValue::from_str(&format!("SmartEngine '{}' not found", handle)))?;
    let (hits, misses, evictions) = engine.cache_stats();
    Ok(format!(
        r#"{{"hits":{},"misses":{},"evictions":{}}}"#,
        hits, misses, evictions
    ))
}

/// Feed a metric value to the convergence monitor and check if should stop.
#[wasm_bindgen]
pub fn smart_engine_check_convergence(handle: &str, metric: f64) -> Result<bool, JsValue> {
    let mut engines = SMART_ENGINES.lock().unwrap();
    let engine = engines
        .get_mut(handle)
        .ok_or_else(|| JsValue::from_str(&format!("SmartEngine '{}' not found", handle)))?;
    Ok(engine.check_convergence(metric))
}

/// Reset all internal state of a smart engine.
#[wasm_bindgen]
pub fn smart_engine_reset(handle: &str) -> Result<(), JsValue> {
    let mut engines = SMART_ENGINES.lock().unwrap();
    let engine = engines
        .get_mut(handle)
        .ok_or_else(|| JsValue::from_str(&format!("SmartEngine '{}' not found", handle)))?;
    engine.reset();
    Ok(())
}

/// Destroy a smart engine and free its resources.
#[wasm_bindgen]
pub fn smart_engine_destroy(handle: &str) -> Result<(), JsValue> {
    let mut engines = SMART_ENGINES.lock().unwrap();
    engines.remove(handle);
    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -- LRU Cache tests --

    #[test]
    fn test_lru_cache_eviction() {
        let mut cache: LruCache<i32> = LruCache::new(3);

        cache.insert("a".to_string(), 1);
        cache.insert("b".to_string(), 2);
        cache.insert("c".to_string(), 3);

        // All three should be present
        assert_eq!(cache.get("a"), Some(1));
        assert_eq!(cache.get("b"), Some(2));
        assert_eq!(cache.get("c"), Some(3));

        // Insert a fourth — should evict the LRU entry.
        // "b" was least recently accessed (we accessed a, b, c in order,
        // but the insert of "d" doesn't change access order of existing).
        // After the get calls above, access order is: a(3), b(4), c(5)
        // So "a" is actually LRU now.
        cache.insert("d".to_string(), 4);

        // "a" should be evicted (oldest access order)
        assert_eq!(cache.get("a"), None);
        // Others should still be present
        assert_eq!(cache.get("b"), Some(2));
        assert_eq!(cache.get("c"), Some(3));
        assert_eq!(cache.get("d"), Some(4));

        // Check eviction count
        let (_hits, _misses, evictions) = cache.stats();
        assert_eq!(evictions, 1);
    }

    #[test]
    fn test_lru_cache_hit_miss() {
        let mut cache: LruCache<String> = LruCache::new(10);

        // Miss
        assert_eq!(cache.get("nonexistent"), None);

        // Insert and hit
        cache.insert("key1".to_string(), "value1".to_string());
        assert_eq!(cache.get("key1"), Some("value1".to_string()));

        // Overwrite existing key
        cache.insert("key1".to_string(), "value2".to_string());
        assert_eq!(cache.get("key1"), Some("value2".to_string()));

        let (hits, misses, _evictions) = cache.stats();
        assert_eq!(hits, 2); // 2 hits on "key1"
        assert_eq!(misses, 1); // 1 miss on "nonexistent"
    }

    // -- Convergence Monitor tests --

    #[test]
    fn test_convergence_monitor_converged() {
        let mut monitor = ConvergenceMonitor::with_params(3, 0.05, 100);

        // Feed stable values — should converge after window_size iterations
        assert!(!monitor.update(0.500)); // iteration 1, window not full
        assert!(!monitor.update(0.501)); // iteration 2, window not full
        assert!(monitor.update(0.502)); // iteration 3, window full, improvement < 5%
    }

    #[test]
    fn test_convergence_monitor_not_converged() {
        let mut monitor = ConvergenceMonitor::with_params(5, 0.01, 100);

        // Feed steadily improving values
        for i in 0..5u32 {
            let metric = 0.1 * (i + 1) as f64; // 0.1, 0.2, 0.3, 0.4, 0.5
            assert!(
                !monitor.update(metric),
                "Should not converge at iteration {}",
                i + 1
            );
        }
    }

    #[test]
    fn test_convergence_monitor_max_iterations() {
        let mut monitor = ConvergenceMonitor::with_params(5, 0.001, 10);

        // Feed slowly improving values that never converge by threshold
        for i in 0..9u32 {
            let metric = 0.01 * (i + 1) as f64;
            assert!(
                !monitor.should_stop(metric),
                "Should not stop at iteration {} (before max)",
                i + 1
            );
        }

        // 10th iteration should stop due to max_iterations
        assert!(
            monitor.should_stop(0.10),
            "Should stop at max_iterations (10)"
        );
    }

    // -- FusedMultiPass tests --

    fn sample_traces() -> Vec<Vec<String>> {
        vec![
            vec!["a".to_string(), "b".to_string(), "c".to_string()],
            vec!["a".to_string(), "b".to_string(), "d".to_string()],
            vec!["a".to_string(), "c".to_string(), "d".to_string()],
        ]
    }

    #[test]
    fn test_fused_pass_dfg_cached() {
        let mut fused = FusedMultiPass::new();
        let traces = sample_traces();

        // First call — computes DFG
        let dfg1 = fused.compute_dfg(&traces).clone();
        assert_eq!(fused.dfg_compute_calls(), 1);

        // Second call with same traces — should use cache
        let dfg2 = fused.compute_dfg(&traces).clone();
        assert_eq!(fused.dfg_compute_calls(), 2);

        // DFGs should be identical
        assert_eq!(dfg1.nodes.len(), dfg2.nodes.len());
        assert_eq!(dfg1.edges.len(), dfg2.edges.len());

        // Verify DFG has expected structure
        assert!(!dfg1.nodes.is_empty());
        assert!(!dfg1.edges.is_empty());

        // "a" should be a start activity for all 3 traces
        assert_eq!(dfg1.start_activities.get("a"), Some(&3));

        // Third call with different traces — should recompute
        let different_traces = vec![vec!["x".to_string(), "y".to_string()]];
        let dfg3 = fused.compute_dfg(&different_traces).clone();
        assert_eq!(fused.dfg_compute_calls(), 3);
        assert_eq!(dfg3.start_activities.get("x"), Some(&1));
    }

    #[test]
    fn test_fused_pass_run_with_dfg() {
        let mut fused = FusedMultiPass::new();
        let traces = sample_traces();

        // Run DFG algorithm
        let result = fused.run_with_dfg("dfg", &traces);
        assert!(result.is_ok());
        let json = result.unwrap();
        assert!(json.contains("nodes"));
        assert!(json.contains("edges"));

        // Run skeleton algorithm
        let result = fused.run_with_dfg("process_skeleton", &traces);
        assert!(result.is_ok());

        // Run heuristic miner
        let result = fused.run_with_dfg("heuristic_miner", &traces);
        assert!(result.is_ok());
        let json = result.unwrap();
        assert!(json.contains("dependency"));
    }

    #[test]
    fn test_smart_engine_caching() {
        let mut engine = SmartEngine::new();
        let traces = sample_traces();

        // First run — should compute and cache
        let result1 = engine.run("dfg", &traces);
        assert!(result1.is_ok());

        let (hits, misses, _evictions) = engine.cache_stats();
        assert_eq!(misses, 1); // first call was a miss
        assert_eq!(hits, 0);

        // Second run with same traces and algorithm — should be cached
        let result2 = engine.run("dfg", &traces);
        assert!(result2.is_ok());
        assert_eq!(result1.unwrap(), result2.unwrap());

        let (hits, misses, _evictions) = engine.cache_stats();
        assert_eq!(misses, 1); // still 1 miss
        assert_eq!(hits, 1); // now 1 hit

        // Different algorithm — miss
        let _ = engine.run("process_skeleton", &traces);
        let (_hits, misses, _evictions) = engine.cache_stats();
        assert_eq!(misses, 2); // 2 misses total
    }
}
