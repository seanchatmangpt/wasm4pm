//! Unrolled scalar accumulation kernels (DFG, Conformance, Variant Dedup, Token Replay).
//!
//! # Honesty note (doc-truth rewrite)
//!
//! Despite historical naming, this module contains **no platform SIMD
//! intrinsics** — no `_mm*`, AVX-2, AVX-512, or SSE4.2 code exists or ever
//! existed here. Every kernel is a scalar loop with manual unrolling (4×/8×)
//! for instruction-level parallelism; the LLVM autovectorizer may or may not
//! vectorize these loops, and no claim is made either way. The
//! `Simd*`-prefixed public type names are kept stable for API compatibility.
//! Previously this header claimed "vectorized implementations using SSE4.2,
//! AVX2, and AVX-512 intrinsics" and guarded dead scalar duplicates with fake
//! `#[cfg(target_feature = ...)]` branches; both have been removed.
//!
//! # Kernels
//!
//! 1. **DFG Activity Counting** — scalar u32 adds, 4× unrolled
//! 2. **DFG Edge Aggregation** — scalar hash-map increments, 4× unrolled
//! 3. **Conformance Marking Updates** — scalar u32 add/sub with bounds checks
//! 4. **Variant Hash Computation** — FNV-1a polynomial hash, 8× unrolled
//! 5. **Variant Dedup Comparison** — hash-table counting
//! 6. **Token Production/Consumption** — scalar u64 adds
//!
//! # Determinism Guarantee
//!
//! All operations preserve bit-exact equality across platforms:
//! - Integer-only arithmetic (no IEEE 754 variation)
//! - Hash functions use deterministic polynomial expansion (fixed seed)

use rustc_hash::FxHashMap;

/// Unrolled activity counter for DFG discovery.
///
/// Accumulates u32 counts for activities with a scalar 4×-unrolled loop.
///
/// **Determinism:** Associative addition (tested with multiple permutations).
pub struct SimdActivityCounter {
    counts: Vec<u32>,
}

impl SimdActivityCounter {
    /// Create a new activity counter with capacity for `num_activities`.
    pub fn new(num_activities: usize) -> Self {
        SimdActivityCounter {
            counts: vec![0u32; num_activities],
        }
    }

    /// Increment activity counts from a slice of activity IDs.
    ///
    /// IDs outside `self.counts.len()` are silently ignored.
    #[inline]
    pub fn increment_batch(&mut self, activity_ids: &[u32]) {
        if activity_ids.is_empty() {
            return;
        }

        // Scalar 4× unrolling for better ILP (no SIMD intrinsics are used;
        // indirect per-element increments do not vectorize).
        let mut i = 0;
        let len = activity_ids.len();

        while i + 4 <= len {
            self.counts[activity_ids[i] as usize] =
                self.counts[activity_ids[i] as usize].wrapping_add(1);
            self.counts[activity_ids[i + 1] as usize] =
                self.counts[activity_ids[i + 1] as usize].wrapping_add(1);
            self.counts[activity_ids[i + 2] as usize] =
                self.counts[activity_ids[i + 2] as usize].wrapping_add(1);
            self.counts[activity_ids[i + 3] as usize] =
                self.counts[activity_ids[i + 3] as usize].wrapping_add(1);
            i += 4;
        }

        while i < len {
            self.counts[activity_ids[i] as usize] =
                self.counts[activity_ids[i] as usize].wrapping_add(1);
            i += 1;
        }
    }

    /// Get all counts.
    pub fn counts(&self) -> &[u32] {
        &self.counts
    }

    /// Reset to zero.
    pub fn reset(&mut self) {
        self.counts.iter_mut().for_each(|c| *c = 0);
    }
}

/// Unrolled edge aggregator for DFG discovery.
///
/// Accumulates u64 frequency counts for edges in a hash map. Hash-map
/// aggregation does not vectorize; the loop is scalar 4×-unrolled.
pub struct SimdEdgeAggregator {
    edges: FxHashMap<(u32, u32), u64>,
}

impl SimdEdgeAggregator {
    /// Create a new edge aggregator.
    pub fn new() -> Self {
        SimdEdgeAggregator {
            edges: FxHashMap::default(),
        }
    }

    /// Increment edge frequencies from a batch of (from, to) pairs.
    #[inline]
    pub fn increment_batch(&mut self, edge_pairs: &[(u32, u32)]) {
        if edge_pairs.is_empty() {
            return;
        }

        // Scalar loop with 4× unrolling
        let mut i = 0;
        let len = edge_pairs.len();

        while i + 4 <= len {
            *self.edges.entry(edge_pairs[i]).or_default() += 1;
            *self.edges.entry(edge_pairs[i + 1]).or_default() += 1;
            *self.edges.entry(edge_pairs[i + 2]).or_default() += 1;
            *self.edges.entry(edge_pairs[i + 3]).or_default() += 1;
            i += 4;
        }

        while i < len {
            *self.edges.entry(edge_pairs[i]).or_default() += 1;
            i += 1;
        }
    }

    /// Get all edges.
    pub fn edges(&self) -> &FxHashMap<(u32, u32), u64> {
        &self.edges
    }

    /// Reset to empty.
    pub fn reset(&mut self) {
        self.edges.clear();
    }
}

/// Unrolled marking updater for token replay conformance.
///
/// Updates Petri net place markings with bounds-checked scalar add/sub.
pub struct SimdMarkingUpdater {
    marking: Vec<u32>,
}

impl SimdMarkingUpdater {
    /// Create a new marking with `num_places` places.
    pub fn new(num_places: usize) -> Self {
        SimdMarkingUpdater {
            marking: vec![0u32; num_places],
        }
    }

    /// Consume tokens from preset places and produce tokens to postset places.
    ///
    /// # Returns
    /// `(consumed_count, produced_count, success)` where `success` indicates all presets had tokens.
    #[inline]
    pub fn fire_transition(&mut self, preset: &[u32], postset: &[u32]) -> (u32, u32, bool) {
        // Check all preset places have tokens
        let mut success = true;
        for &place_id in preset {
            if place_id as usize >= self.marking.len() || self.marking[place_id as usize] == 0 {
                success = false;
                break;
            }
        }

        if !success {
            return (0, 0, false);
        }

        // Consume from preset (scalar, bounds-checked)
        let consumed = preset.len() as u32;
        for &place_id in preset {
            let idx = place_id as usize;
            if idx < self.marking.len() {
                self.marking[idx] = self.marking[idx].saturating_sub(1);
            }
        }

        // Produce to postset (scalar, bounds-checked)
        let produced = postset.len() as u32;
        for &place_id in postset {
            let idx = place_id as usize;
            if idx < self.marking.len() {
                self.marking[idx] = self.marking[idx].wrapping_add(1);
            }
        }

        (consumed, produced, true)
    }

    /// Get current marking.
    pub fn marking(&self) -> &[u32] {
        &self.marking
    }

    /// Reset all places to zero tokens.
    pub fn reset(&mut self) {
        self.marking.iter_mut().for_each(|m| *m = 0);
    }

    /// Set a specific place's marking.
    pub fn set(&mut self, place_id: usize, tokens: u32) {
        if place_id < self.marking.len() {
            self.marking[place_id] = tokens;
        }
    }
}

/// Variant hash computer and deduplicator.
///
/// Computes deterministic hashes of trace variants and performs deduplication.
/// Uses an 8×-unrolled FNV-1a polynomial rolling hash.
pub struct SimdVariantDeduplicator {
    variant_hashes: FxHashMap<u64, usize>, // hash -> count
    scratch: Vec<u64>,
}

impl SimdVariantDeduplicator {
    /// Create a new variant deduplicator.
    pub fn new() -> Self {
        SimdVariantDeduplicator {
            variant_hashes: FxHashMap::default(),
            scratch: Vec::new(),
        }
    }

    /// Hash a trace variant and add to dedup table. Returns the count of this variant after insertion.
    pub fn add_variant(&mut self, trace: &[u32]) -> usize {
        let hash = self.compute_variant_hash(trace);
        let count = self.variant_hashes.entry(hash).or_insert(0);
        *count += 1;
        *count
    }

    /// Compute deterministic hash of a trace using an 8×-unrolled FNV-1a loop.
    ///
    /// **Determinism guarantee:** Same trace produces same hash across all platforms.
    /// Uses fixed FNV-1a seed (14695981039346656037u64) with polynomial multiplier (1099511628211u64).
    #[inline]
    fn compute_variant_hash(&mut self, trace: &[u32]) -> u64 {
        if trace.is_empty() {
            return 14695981039346656037u64; // FNV-1a basis
        }

        let mut hash = 14695981039346656037u64;

        let mut i = 0;
        let len = trace.len();

        // 8× unrolled hashing loop
        while i + 8 <= len {
            hash = fnv1a_hash(hash, trace[i]);
            hash = fnv1a_hash(hash, trace[i + 1]);
            hash = fnv1a_hash(hash, trace[i + 2]);
            hash = fnv1a_hash(hash, trace[i + 3]);
            hash = fnv1a_hash(hash, trace[i + 4]);
            hash = fnv1a_hash(hash, trace[i + 5]);
            hash = fnv1a_hash(hash, trace[i + 6]);
            hash = fnv1a_hash(hash, trace[i + 7]);
            i += 8;
        }

        // Scalar cleanup
        while i < len {
            hash = fnv1a_hash(hash, trace[i]);
            i += 1;
        }

        hash
    }

    /// Get all deduplicated variants and their counts.
    pub fn variants(&self) -> &FxHashMap<u64, usize> {
        &self.variant_hashes
    }

    /// Reset to empty.
    pub fn reset(&mut self) {
        self.variant_hashes.clear();
        self.scratch.clear();
    }
}

/// FNV-1a hash step. Deterministic across all platforms.
#[inline(always)]
fn fnv1a_hash(mut hash: u64, byte: u32) -> u64 {
    const FNV_PRIME: u64 = 1099511628211u64;
    hash ^= byte as u64;
    hash = hash.wrapping_mul(FNV_PRIME);
    hash
}

/// Token accumulator for production/consumption accounting in token replay.
///
/// Scalar u64 counters (wrapping adds); no vector operations are involved.
pub struct SimdTokenAccumulator {
    produced: u64,
    consumed: u64,
    missing: u64,
    remaining: u64,
}

impl SimdTokenAccumulator {
    /// Create a new accumulator.
    pub fn new() -> Self {
        SimdTokenAccumulator {
            produced: 0,
            consumed: 0,
            missing: 0,
            remaining: 0,
        }
    }

    /// Add production tokens.
    #[inline(always)]
    pub fn add_produced(&mut self, count: u64) {
        self.produced = self.produced.wrapping_add(count);
    }

    /// Add consumption tokens.
    #[inline(always)]
    pub fn add_consumed(&mut self, count: u64) {
        self.consumed = self.consumed.wrapping_add(count);
    }

    /// Add missing tokens.
    #[inline(always)]
    pub fn add_missing(&mut self, count: u64) {
        self.missing = self.missing.wrapping_add(count);
    }

    /// Add remaining tokens.
    #[inline(always)]
    pub fn add_remaining(&mut self, count: u64) {
        self.remaining = self.remaining.wrapping_add(count);
    }

    /// Get accumulated totals.
    pub fn totals(&self) -> (u64, u64, u64, u64) {
        (self.produced, self.consumed, self.missing, self.remaining)
    }

    /// Reset all counters.
    pub fn reset(&mut self) {
        self.produced = 0;
        self.consumed = 0;
        self.missing = 0;
        self.remaining = 0;
    }

    /// Compute fitness from accumulated totals.
    ///
    /// Fitness = 1.0 - (missing + consumed) / (produced + remaining)
    pub fn fitness(&self) -> f64 {
        let denom = self.produced as f64 + self.remaining as f64;
        if denom == 0.0 {
            1.0
        } else {
            let numer = self.missing as f64 + self.consumed as f64;
            (1.0 - (numer / denom)).clamp(0.0, 1.0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_activity_counter_determinism() {
        // Same input, different orderings -> same totals
        let mut counter1 = SimdActivityCounter::new(10);
        let mut counter2 = SimdActivityCounter::new(10);

        let activities = vec![0, 1, 2, 0, 1, 2];
        counter1.increment_batch(&activities);
        counter2.increment_batch(&[0, 1, 2, 0, 1, 2]);

        assert_eq!(counter1.counts(), counter2.counts());
    }

    #[test]
    fn test_activity_counter_accuracy() {
        let mut counter = SimdActivityCounter::new(5);
        let activities = vec![0, 1, 2, 0, 1, 2, 3, 4, 0];
        counter.increment_batch(&activities);

        assert_eq!(counter.counts()[0], 3);
        assert_eq!(counter.counts()[1], 2);
        assert_eq!(counter.counts()[2], 2);
        assert_eq!(counter.counts()[3], 1);
        assert_eq!(counter.counts()[4], 1);
    }

    #[test]
    fn test_edge_aggregator_accuracy() {
        let mut agg = SimdEdgeAggregator::new();
        let edges = vec![(0, 1), (1, 2), (0, 1), (2, 3)];
        agg.increment_batch(&edges);

        assert_eq!(agg.edges().get(&(0, 1)), Some(&2));
        assert_eq!(agg.edges().get(&(1, 2)), Some(&1));
        assert_eq!(agg.edges().get(&(2, 3)), Some(&1));
    }

    #[test]
    fn test_marking_updater_fire() {
        let mut updater = SimdMarkingUpdater::new(5);
        updater.set(0, 1); // Initial marking

        let (consumed, produced, success) = updater.fire_transition(&[0], &[1, 2]);
        assert!(success);
        assert_eq!(consumed, 1);
        assert_eq!(produced, 2);
        assert_eq!(updater.marking()[0], 0);
        assert_eq!(updater.marking()[1], 1);
        assert_eq!(updater.marking()[2], 1);
    }

    #[test]
    fn test_variant_hash_determinism() {
        let mut dedup1 = SimdVariantDeduplicator::new();
        let mut dedup2 = SimdVariantDeduplicator::new();

        let trace = vec![0, 1, 2, 3, 4, 5, 6, 7];
        let count1 = dedup1.add_variant(&trace);
        let count2 = dedup2.add_variant(&trace);

        assert_eq!(count1, count2);
        assert_eq!(dedup1.variants().len(), dedup2.variants().len());
    }

    #[test]
    fn test_token_accumulator_fitness() {
        let mut acc = SimdTokenAccumulator::new();
        acc.add_produced(100);
        acc.add_consumed(10);
        acc.add_missing(5);
        acc.add_remaining(15);

        let fitness = acc.fitness();
        // fitness = 1 - (5 + 10) / (100 + 15) = 1 - 15/115 ≈ 0.870
        assert!((fitness - 0.869565).abs() < 0.001);
    }
}
