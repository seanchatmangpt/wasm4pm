//! Three-layer cache for parsed logs, columnar representations, and interners.
//!
//! # Layers
//!
//! 1. **PARSE_CACHE** — `LruCache<String>` keyed by XES content hash (FNV-1a).
//!    Caches up to 10 parsed log handles to avoid re-parsing identical content.
//!
//! 2. **COLUMNAR_CACHE** — `FxHashMap<(log_handle, activity_key), OwnedColumnarLog>`.
//!    Caches owned columnar log representations for repeated algorithm runs.
//!
//! 3. **INTERNER_CACHE** — `FxHashMap<log_handle, Interner>`.
//!    Caches string interners so vocabulary mapping is shared across algorithms.
//!
//! # Thread safety
//!
//! Each layer is wrapped in `Lazy<Mutex<...>>` using `once_cell::sync::Lazy`
//! for safe concurrent access from WASM worker threads.

use once_cell::sync::Lazy;
use rustc_hash::FxHashMap;
use std::sync::Mutex;

#[cfg(feature = "streaming_basic")]
use crate::streaming::Interner;

// ---------------------------------------------------------------------------
// LruCache<V> — generic least-recently-used cache
// ---------------------------------------------------------------------------

/// Least-recently-used cache with hit/miss/eviction tracking.
///
/// Keys are `String`; values are generic `V: Clone`.  When the cache is at
/// capacity and a new key is inserted, the entry with the lowest access
/// counter is evicted.
pub struct LruCache<V> {
    map: FxHashMap<String, (V, u64)>,
    capacity: usize,
    access_counter: u64,
    hits: u64,
    misses: u64,
    evictions: u64,
}

impl<V: Clone> LruCache<V> {
    /// Create a new LRU cache with the given maximum entry count.
    pub fn new(capacity: usize) -> Self {
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
    pub fn get(&mut self, key: &str) -> Option<V> {
        self.access_counter += 1;
        if let Some((value, _order)) = self.map.get_mut(key) {
            self.hits += 1;
            let v = value.clone();
            self.map.get_mut(key).unwrap().1 = self.access_counter;
            return Some(v);
        }
        self.misses += 1;
        None
    }

    /// Insert a value into the cache.  If capacity is exceeded, the
    /// least-recently-used entry is evicted.
    pub fn insert(&mut self, key: String, value: V) {
        self.access_counter += 1;
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

    /// Remove all entries and reset stats.
    pub fn clear(&mut self) {
        self.map.clear();
        self.hits = 0;
        self.misses = 0;
        self.evictions = 0;
        self.access_counter = 0;
    }

    /// Return (hits, misses, evictions).
    pub fn stats(&self) -> (u64, u64, u64) {
        (self.hits, self.misses, self.evictions)
    }

    /// Number of entries currently in the cache.
    pub fn len(&self) -> usize {
        self.map.len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}

// ---------------------------------------------------------------------------
// OwnedColumnarLog — lifetime-free columnar representation for caching
// ---------------------------------------------------------------------------

/// Owned version of `ColumnarLog` suitable for storing in a cache.
///
/// `ColumnarLog` borrows from its source event log, but cached entries must
/// own their data.  This struct holds the same three fields as owned `Vec`s.
#[derive(Clone, Debug)]
pub struct OwnedColumnarLog {
    /// Interned activity IDs for every event, concatenated across all traces.
    pub events: Vec<u32>,
    /// Offset into `events` where each trace starts; length is `num_traces + 1`.
    pub trace_offsets: Vec<usize>,
    /// Activity name for each interned ID (parallel to `events` IDs).
    pub vocab: Vec<String>,
}

// ---------------------------------------------------------------------------
// CacheStats — aggregate statistics across all three layers
// ---------------------------------------------------------------------------

/// Aggregated statistics from all three cache layers.
#[derive(Debug, Clone, Default)]
pub struct CacheStats {
    pub parse_hits: u64,
    pub parse_misses: u64,
    pub parse_evictions: u64,
    pub parse_entries: usize,
    pub columnar_entries: usize,
    pub interner_entries: usize,
}

// ---------------------------------------------------------------------------
// Layer 1: PARSE_CACHE
// ---------------------------------------------------------------------------

/// LRU cache of parsed log handles, keyed by XES content hash.
/// Capacity: 10 entries.
static PARSE_CACHE: Lazy<Mutex<LruCache<String>>> = Lazy::new(|| Mutex::new(LruCache::new(10)));

// ---------------------------------------------------------------------------
// Layer 2: COLUMNAR_CACHE
// ---------------------------------------------------------------------------

/// Cache of owned columnar logs, keyed by `(log_handle, activity_key)`.
static COLUMNAR_CACHE: Lazy<Mutex<FxHashMap<String, FxHashMap<String, OwnedColumnarLog>>>> =
    Lazy::new(|| Mutex::new(FxHashMap::default()));

// ---------------------------------------------------------------------------
// Layer 3: INTERNER_CACHE
// ---------------------------------------------------------------------------

#[cfg(feature = "streaming_basic")]
/// Cache of string interners, keyed by log handle.
static INTERNER_CACHE: Lazy<Mutex<FxHashMap<String, Interner>>> =
    Lazy::new(|| Mutex::new(FxHashMap::default()));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Clear all three cache layers.
pub fn cache_clear() {
    PARSE_CACHE.lock().unwrap().clear();
    COLUMNAR_CACHE.lock().unwrap().clear();
    #[cfg(feature = "streaming_basic")]
    {
        INTERNER_CACHE.lock().unwrap().clear();
    }
}

/// Return aggregate statistics from all three cache layers.
pub fn cache_stats() -> CacheStats {
    let parse = PARSE_CACHE.lock().unwrap();
    let (parse_hits, parse_misses, parse_evictions) = parse.stats();
    let parse_entries = parse.len();

    let columnar_entries = COLUMNAR_CACHE
        .lock()
        .unwrap()
        .values()
        .map(|inner| inner.len())
        .sum();

    #[cfg(feature = "streaming_basic")]
    let interner_entries = INTERNER_CACHE.lock().unwrap().len();
    #[cfg(not(feature = "streaming_basic"))]
    let interner_entries = 0;

    CacheStats {
        parse_hits,
        parse_misses,
        parse_evictions,
        parse_entries,
        columnar_entries,
        interner_entries,
    }
}

/// Look up a cached parsed log handle by XES content hash.
pub fn parse_cache_get(content_hash: &str) -> Option<String> {
    PARSE_CACHE.lock().unwrap().get(content_hash)
}

/// Insert a parsed log handle into the parse cache.
pub fn parse_cache_insert(content_hash: String, handle: String) {
    PARSE_CACHE.lock().unwrap().insert(content_hash, handle);
}

/// Look up a cached columnar log by `(log_handle, activity_key)`.
pub fn columnar_cache_get(log_handle: &str, activity_key: &str) -> Option<OwnedColumnarLog> {
    let outer = COLUMNAR_CACHE.lock().unwrap();
    outer
        .get(log_handle)
        .and_then(|inner| inner.get(activity_key).cloned())
}

/// Insert an owned columnar log into the columnar cache.
pub fn columnar_cache_insert(log_handle: String, activity_key: String, col: OwnedColumnarLog) {
    COLUMNAR_CACHE
        .lock()
        .unwrap()
        .entry(log_handle)
        .or_default()
        .insert(activity_key, col);
}

/// Look up a cached interner by log handle.  Returns a clone.
#[cfg(feature = "streaming_basic")]
pub fn interner_cache_get(log_handle: &str) -> Option<Interner> {
    INTERNER_CACHE.lock().unwrap().get(log_handle).cloned()
}

/// Insert an interner into the interner cache.
#[cfg(feature = "streaming_basic")]
pub fn interner_cache_insert(log_handle: String, interner: Interner) {
    INTERNER_CACHE.lock().unwrap().insert(log_handle, interner);
}

// ---------------------------------------------------------------------------
// FNV-1a content hashing
// ---------------------------------------------------------------------------

/// Compute a FNV-1a hash of the given XES content string, returned as a
/// lowercase hex string.
///
/// FNV-1a is chosen for its simplicity, speed, and acceptable distribution
/// for cache-key purposes (not cryptographic).
pub fn hash_xes_content(content: &str) -> String {
    // FNV-1a 64-bit parameters
    const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;

    let mut hash = FNV_OFFSET_BASIS;
    for byte in content.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    format!("{:016x}", hash)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(feature = "streaming_basic")]
    use crate::streaming::ActivityInterner;

    #[test]
    fn test_lru_cache_basic() {
        let mut cache: LruCache<String> = LruCache::new(5);
        assert!(cache.get("missing").is_none());

        cache.insert("key1".to_string(), "value1".to_string());
        assert_eq!(cache.get("key1"), Some("value1".to_string()));
        assert!(cache.get("key2").is_none());
    }

    #[test]
    fn test_lru_cache_eviction() {
        let mut cache: LruCache<i32> = LruCache::new(2);

        cache.insert("a".to_string(), 1);
        cache.insert("b".to_string(), 2);
        // Access "a" to make it most-recently-used
        let _ = cache.get("a");
        // Insert "c" — should evict "b" (LRU), not "a"
        cache.insert("c".to_string(), 3);

        assert_eq!(cache.get("a"), Some(1));
        assert!(cache.get("b").is_none(), "b should have been evicted");
        assert_eq!(cache.get("c"), Some(3));
    }

    #[test]
    fn test_lru_cache_stats() {
        let mut cache: LruCache<String> = LruCache::new(2);

        cache.insert("k1".to_string(), "v1".to_string());
        cache.insert("k2".to_string(), "v2".to_string());

        // 1 hit
        let _ = cache.get("k1");
        // 1 miss
        let _ = cache.get("missing");

        // Force eviction by inserting a 3rd key
        cache.insert("k3".to_string(), "v3".to_string());

        let (hits, misses, evictions) = cache.stats();
        assert_eq!(hits, 1);
        assert_eq!(misses, 1);
        assert_eq!(evictions, 1);
    }

    #[test]
    fn test_hash_deterministic() {
        let content =
            "<log><trace><event><string key=\"concept:name\" value=\"A\"/></event></trace></log>";
        let h1 = hash_xes_content(content);
        let h2 = hash_xes_content(content);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_different() {
        let h1 = hash_xes_content("content A");
        let h2 = hash_xes_content("content B");
        assert_ne!(h1, h2);
    }

    /// Helper: generate a unique test key to avoid collisions when tests run in parallel.
    fn unique_key(prefix: &str) -> String {
        use std::thread;
        format!("{}:{:?}", prefix, thread::current().id())
    }

    #[test]
    fn test_cache_clear() {
        let k = unique_key("tcc");
        let lk = unique_key("tcc-log");

        parse_cache_insert(k.clone(), "handle1".to_string());
        columnar_cache_insert(
            lk.clone(),
            "concept:name".to_string(),
            OwnedColumnarLog {
                events: vec![0, 1],
                trace_offsets: vec![0, 2],
                vocab: vec!["A".to_string(), "B".to_string()],
            },
        );
        #[cfg(feature = "streaming_basic")]
        interner_cache_insert(lk.clone(), Interner::new());

        assert!(parse_cache_get(&k).is_some());
        assert!(columnar_cache_get(&lk, "concept:name").is_some());
        #[cfg(feature = "streaming_basic")]
        assert!(interner_cache_get(&lk).is_some());

        cache_clear();

        assert!(parse_cache_get(&k).is_none());
        assert!(columnar_cache_get(&lk, "concept:name").is_none());
        #[cfg(feature = "streaming_basic")]
        assert!(interner_cache_get(&lk).is_none());
    }

    #[test]
    fn test_columnar_cache_roundtrip() {
        let k = unique_key("ccr");

        let col = OwnedColumnarLog {
            events: vec![0, 1, 2, 0, 1],
            trace_offsets: vec![0, 3, 5],
            vocab: vec!["A".to_string(), "B".to_string(), "C".to_string()],
        };

        columnar_cache_insert(
            k.clone(),
            "activity".to_string(),
            OwnedColumnarLog {
                events: col.events.clone(),
                trace_offsets: col.trace_offsets.clone(),
                vocab: col.vocab.clone(),
            },
        );

        let retrieved = columnar_cache_get(&k, "activity").expect("should be cached");
        assert_eq!(retrieved.events, col.events);
        assert_eq!(retrieved.trace_offsets, col.trace_offsets);
        assert_eq!(retrieved.vocab, col.vocab);
    }

    #[cfg(feature = "streaming_basic")]
    #[test]
    fn test_interner_cache_shared() {
        let k = unique_key("ics");

        let mut interner = Interner::new();
        interner.intern("login");
        interner.intern("logout");
        interner.intern("submit");

        interner_cache_insert(k.clone(), interner);

        let cached = interner_cache_get(&k).expect("should be cached");
        assert_eq!(cached.len(), 3);
        assert_eq!(cached.get(0), Some("login"));
        assert_eq!(cached.get(1), Some("logout"));
        assert_eq!(cached.get(2), Some("submit"));
        assert_eq!(
            cached.vocab(),
            &[
                "login".to_string(),
                "logout".to_string(),
                "submit".to_string()
            ]
        );
    }
}
