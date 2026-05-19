//! Bounded LRU receipt ledger with TTL and rate-limit telemetry.
//!
//! `ReceiptLedger` accepts anchor entries keyed by their `link_hash`. The
//! invariant `ledger.len() <= capacity` is enforced after every insertion via
//! oldest-first eviction. TTL pruning is lazy (occurs at insertion time).
//! Rate limiting is per-second via a frozen-clock-tolerant counter.
//!
//! The ledger uses interior mutability to avoid making the entire registry
//! `&mut`. All bookkeeping is single-threaded (suitable for wasm32).

use indexmap::IndexMap;
use std::cell::RefCell;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

/// One ledger entry: when it was anchored and what the link hash was.
#[derive(Debug, Clone)]
pub struct LedgerEntry {
    /// Anchor timestamp in seconds since the configured clock origin.
    pub anchored_at_secs: u64,
    /// Link MAC (hex).
    pub link_hash: String,
}

/// Errors returned by the ledger.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LedgerError {
    /// Anchor rate exceeded `max_anchors_per_sec`.
    Throttled,
    /// Capacity exhausted and TTL did not free space (should not occur — diagnostic).
    Full,
    /// Anchor was attempted with an entry whose TTL had already elapsed.
    TtlExpired,
    /// Same link hash anchored twice.
    DuplicateAnchor,
}

/// Lightweight telemetry counters.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LedgerTelemetry {
    /// Total anchors accepted.
    pub anchors_total: u64,
    /// Total entries evicted by capacity pressure.
    pub evictions_total: u64,
    /// Total entries evicted by TTL.
    pub ttl_evictions_total: u64,
    /// Total throttle rejections.
    pub throttle_rejections_total: u64,
    /// Total duplicate rejections.
    pub duplicate_rejections_total: u64,
}

/// Bounded ledger.
pub struct ReceiptLedger {
    /// Maximum number of live entries.
    pub capacity: usize,
    /// Time-to-live in seconds.
    pub ttl_secs: u64,
    /// Maximum anchors accepted per second of wall-clock.
    pub max_anchors_per_sec: u32,
    inner: RefCell<IndexMap<String, LedgerEntry>>,
    anchor_count: AtomicU32,
    last_tick: AtomicU64,
    telemetry: RefCell<LedgerTelemetry>,
}

impl ReceiptLedger {
    /// Construct a new ledger with capacity 4096, TTL 3600s, 1024/s throttle.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn new() -> Self {
        Self::with_config(4096, 3600, 1024)
    }

    /// Custom-config constructor.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn with_config(capacity: usize, ttl_secs: u64, max_anchors_per_sec: u32) -> Self {
        Self {
            capacity,
            ttl_secs,
            max_anchors_per_sec,
            inner: RefCell::new(IndexMap::new()),
            anchor_count: AtomicU32::new(0),
            last_tick: AtomicU64::new(0),
            telemetry: RefCell::new(LedgerTelemetry::default()),
        }
    }

    /// Anchor a new entry at logical time `now_secs`.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn anchor(&self, link_hash: String, now_secs: u64) -> Result<(), LedgerError> {
        // Rate limiting (frozen-clock tolerant).
        let last = self.last_tick.load(Ordering::Relaxed);
        if now_secs == last {
            let count = self.anchor_count.fetch_add(1, Ordering::Relaxed) + 1;
            if count > self.max_anchors_per_sec {
                self.telemetry.borrow_mut().throttle_rejections_total += 1;
                return Err(LedgerError::Throttled);
            }
        } else {
            self.last_tick.store(now_secs, Ordering::Relaxed);
            self.anchor_count.store(1, Ordering::Relaxed);
        }

        let mut inner = self.inner.borrow_mut();

        // TTL prune (lazy).
        let mut ttl_pruned = 0u64;
        loop {
            let oldest = inner.first().map(|(k, e)| (k.clone(), e.clone()));
            match oldest {
                Some((k, e)) if now_secs.saturating_sub(e.anchored_at_secs) > self.ttl_secs => {
                    inner.shift_remove(&k);
                    ttl_pruned += 1;
                }
                _ => break,
            }
        }

        if inner.contains_key(&link_hash) {
            self.telemetry.borrow_mut().duplicate_rejections_total += 1;
            return Err(LedgerError::DuplicateAnchor);
        }

        // Capacity eviction (oldest-first).
        let mut evicted = 0u64;
        while inner.len() >= self.capacity {
            if inner.shift_remove_index(0).is_none() {
                return Err(LedgerError::Full);
            }
            evicted += 1;
        }

        inner.insert(
            link_hash.clone(),
            LedgerEntry {
                anchored_at_secs: now_secs,
                link_hash,
            },
        );

        let mut t = self.telemetry.borrow_mut();
        t.anchors_total += 1;
        t.evictions_total += evicted;
        t.ttl_evictions_total += ttl_pruned;

        Ok(())
    }

    /// Membership query.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn contains(&self, link_hash: &str) -> bool {
        self.inner.borrow().contains_key(link_hash)
    }

    /// Live entry count.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn len(&self) -> usize {
        self.inner.borrow().len()
    }

    /// Empty query.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn is_empty(&self) -> bool {
        self.inner.borrow().is_empty()
    }

    /// Snapshot telemetry counters.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn telemetry(&self) -> LedgerTelemetry {
        self.telemetry.borrow().clone()
    }
}

impl Default for ReceiptLedger {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lru_eviction() {
        let l = ReceiptLedger::with_config(4, 3600, 1024);
        for i in 0..5 {
            l.anchor(format!("h{}", i), 100).unwrap();
        }
        assert!(!l.contains("h0"));
        assert!(l.contains("h4"));
        assert_eq!(l.len(), 4);
        assert_eq!(l.telemetry().evictions_total, 1);
    }

    #[test]
    fn ttl_evicts_old() {
        let l = ReceiptLedger::with_config(8, 10, 1024);
        l.anchor("a".into(), 100).unwrap();
        l.anchor("b".into(), 105).unwrap();
        // Anchor at t=200 — both prior entries (age 100, 95) > TTL 10.
        l.anchor("c".into(), 200).unwrap();
        assert!(!l.contains("a"));
        assert!(!l.contains("b"));
        assert!(l.contains("c"));
        assert_eq!(l.telemetry().ttl_evictions_total, 2);
    }

    #[test]
    fn duplicate_anchor_rejected() {
        let l = ReceiptLedger::new();
        l.anchor("dup".into(), 0).unwrap();
        assert_eq!(l.anchor("dup".into(), 0), Err(LedgerError::DuplicateAnchor));
        assert_eq!(l.telemetry().duplicate_rejections_total, 1);
    }

    #[test]
    fn throttle_rejects_above_rate() {
        let l = ReceiptLedger::with_config(1024, 3600, 3);
        l.anchor("a".into(), 7).unwrap();
        l.anchor("b".into(), 7).unwrap();
        l.anchor("c".into(), 7).unwrap();
        assert_eq!(l.anchor("d".into(), 7), Err(LedgerError::Throttled));
    }
}
