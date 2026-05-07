//! Bounded receipt registry: TTL + LRU + size cap.
//!
//! WASM hosts cannot tolerate an unbounded `HashMap` keyed on
//! attacker-supplied run-ids. This registry caps insertion to
//! `MAX_ENTRIES` and purges entries older than `TTL`. Insertion order is
//! tracked via `IndexMap` so that LRU eviction is `shift_remove_index(0)`.

use indexmap::IndexMap;
use serde::Serialize;
use std::cell::RefCell;
use std::time::Duration;

const MAX_ENTRIES: usize = 4096;
const TTL: Duration = Duration::from_secs(3600);

/// Receipt entry kept in the registry.
#[derive(Debug, Clone, Serialize)]
pub struct CognitionReceipt {
    /// Unique run identifier.
    pub run_id: String,
    /// Output hash (BLAKE3 hex).
    pub output_hash: String,
    /// Replay pointer (16-hex prefix).
    pub replay_pointer: String,
}

/// Bounded TTL+LRU registry of [`CognitionReceipt`].
pub struct BoundedRegistry {
    inner: IndexMap<String, (u64, CognitionReceipt)>,
}

fn now_ms() -> u64 {
    #[cfg(all(target_arch = "wasm32", feature = "wasm"))]
    {
        js_sys::Date::now() as u64
    }
    #[cfg(not(all(target_arch = "wasm32", feature = "wasm")))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }
}

impl BoundedRegistry {
    /// Empty registry.
    pub fn new() -> Self {
        Self {
            inner: IndexMap::new(),
        }
    }

    /// Insert a receipt. Purges TTL-expired entries first, then evicts the
    /// least-recently inserted entries until below `MAX_ENTRIES`.
    pub fn insert(&mut self, id: String, receipt: CognitionReceipt) {
        let now = now_ms();
        let ttl_ms = TTL.as_millis() as u64;

        self.inner
            .retain(|_, (t, _)| now.saturating_sub(*t) < ttl_ms);

        while self.inner.len() >= MAX_ENTRIES {
            self.inner.shift_remove_index(0);
        }

        self.inner.insert(id, (now, receipt));
    }

    /// Retrieve a receipt by id, if present and not expired.
    pub fn get(&self, id: &str) -> Option<&CognitionReceipt> {
        let now = now_ms();
        let ttl_ms = TTL.as_millis() as u64;
        self.inner.get(id).and_then(|(t, r)| {
            if now.saturating_sub(*t) < ttl_ms {
                Some(r)
            } else {
                None
            }
        })
    }

    /// Number of entries currently stored.
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Maximum number of entries this registry will keep.
    pub const fn capacity_limit() -> usize {
        MAX_ENTRIES
    }
}

impl Default for BoundedRegistry {
    fn default() -> Self {
        Self::new()
    }
}

thread_local! {
    /// Thread-local registry (the only mutable state across WASM calls).
    pub static REGISTRY: RefCell<BoundedRegistry> = RefCell::new(BoundedRegistry::new());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(id: &str) -> CognitionReceipt {
        CognitionReceipt {
            run_id: id.into(),
            output_hash: "0".repeat(64),
            replay_pointer: "0".repeat(16),
        }
    }

    #[test]
    fn evicts_oldest_when_full() {
        let mut reg = BoundedRegistry::new();
        for i in 0..(MAX_ENTRIES + 10) {
            reg.insert(format!("id-{}", i), r(&format!("id-{}", i)));
        }
        assert!(reg.len() <= MAX_ENTRIES);
        // Oldest must be gone.
        assert!(reg.get("id-0").is_none());
        // Newest must be present.
        assert!(reg.get(&format!("id-{}", MAX_ENTRIES + 9)).is_some());
    }

    #[test]
    fn round_trip_simple() {
        let mut reg = BoundedRegistry::new();
        reg.insert("abc".into(), r("abc"));
        assert_eq!(reg.get("abc").unwrap().run_id, "abc");
    }
}
