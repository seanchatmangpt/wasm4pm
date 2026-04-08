//! Count-Min Sketch for approximate frequency counting.
//!
//! Provides bounded-memory frequency estimates for DFG edge and activity
//! counting. The estimate is always >= the true count (no underestimation).
//! Expected relative error is bounded by `e / (WIDTH * DEPTH)` where `e` is
//! the total count of all inserted keys.

/// Count-Min Sketch with compile-time dimensions.
///
/// `WIDTH` controls the bucket count per row (collision probability).
/// `DEPTH` controls the number of hash rows (error bound tightness).
///
/// Memory: `WIDTH * DEPTH * 4` bytes (u32 counters).
///
/// # Example
///
/// ```
/// let mut cms: CountMinSketch<4096, 8> = CountMinSketch::new();
/// for i in 0..1000 { cms.add(i as u64); }
/// assert!(cms.estimate(42) >= 1); // never underestimates
/// ```
pub struct CountMinSketch<const WIDTH: usize, const DEPTH: usize> {
    table: [[u32; WIDTH]; DEPTH],
    seeds: [u64; DEPTH],
}

impl<const WIDTH: usize, const DEPTH: usize> CountMinSketch<WIDTH, DEPTH> {
    /// Create a new sketch with deterministic seeds.
    pub fn new() -> Self {
        // Generate seeds using a simple LFSR so the sketch is deterministic
        // and reproducible across runs (important for testing parity).
        let mut seeds = [0u64; DEPTH];
        let mut state: u64 = 0xDEAD_BEEF_CAFE_BABE;
        for i in 0..DEPTH {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            seeds[i] = state;
        }
        CountMinSketch {
            table: [[0u32; WIDTH]; DEPTH],
            seeds,
        }
    }

    /// Hash a key with a per-row seed using multiplicative hashing.
    ///
    /// Uses the split-mix style approach: multiply and shift to distribute
    /// bits across the hash space. Returns a value in `[0, WIDTH)`.
    #[inline]
    fn hash(&self, key: u64, row: usize) -> usize {
        let seed = self.seeds[row];
        let mut h = key.wrapping_mul(seed).wrapping_add(seed.rotate_left(17));
        // Additional mixing
        h ^= h >> 33;
        h = h.wrapping_mul(0xff51afd7ed558ccd);
        h ^= h >> 33;
        h = h.wrapping_mul(0xc4ceb9fe1a85ec53);
        h ^= h >> 33;
        (h as usize) % WIDTH
    }

    /// Increment the count for a key by 1.
    #[inline]
    pub fn add(&mut self, key: u64) {
        for row in 0..DEPTH {
            let bucket = self.hash(key, row);
            self.table[row][bucket] = self.table[row][bucket].saturating_add(1);
        }
    }

    /// Increment the count for a key by a given amount.
    #[inline]
    pub fn add_count(&mut self, key: u64, count: u32) {
        for row in 0..DEPTH {
            let bucket = self.hash(key, row);
            self.table[row][bucket] = self.table[row][bucket].saturating_add(count);
        }
    }

    /// Estimate the frequency of a key.
    ///
    /// Returns the minimum across all rows, which is the least-biased
    /// upper bound on the true count.
    #[inline]
    pub fn estimate(&self, key: u64) -> u32 {
        let mut min_val = u32::MAX;
        for row in 0..DEPTH {
            let bucket = self.hash(key, row);
            let val = self.table[row][bucket];
            if val < min_val {
                min_val = val;
            }
        }
        min_val
    }

    /// Record a directly-follows pair `(from, to)`.
    ///
    /// Uses a mixing combiner to distribute small u32 activity IDs
    /// evenly across the hash table, avoiding the sparse-value problem
    /// of naive `(from << 32) | to` packing.
    #[inline]
    pub fn add_pair(&mut self, from: u32, to: u32) {
        let mut key = from as u64;
        key = key.wrapping_mul(0x9e3779b97f4a7c15);
        key ^= key >> 30;
        key ^= (to as u64).wrapping_mul(0xbf58476d1ce4e5b9);
        key ^= key >> 27;
        self.add(key);
    }

    /// Estimate the frequency of a directly-follows pair.
    #[inline]
    pub fn estimate_pair(&self, from: u32, to: u32) -> u32 {
        let mut key = from as u64;
        key = key.wrapping_mul(0x9e3779b97f4a7c15);
        key ^= key >> 30;
        key ^= (to as u64).wrapping_mul(0xbf58476d1ce4e5b9);
        key ^= key >> 27;
        self.estimate(key)
    }

    /// Return the total memory used by this sketch in bytes.
    pub fn memory_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
    }
}

impl<const WIDTH: usize, const DEPTH: usize> Default for CountMinSketch<WIDTH, DEPTH> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_key() {
        let mut cms: CountMinSketch<4096, 8> = CountMinSketch::new();
        cms.add(42);
        assert_eq!(cms.estimate(42), 1);
    }

    #[test]
    fn test_never_underestimates() {
        let mut cms: CountMinSketch<4096, 8> = CountMinSketch::new();
        for _ in 0..100 {
            cms.add(1);
        }
        assert!(cms.estimate(1) >= 100);
    }

    #[test]
    fn test_zero_for_missing_key() {
        let cms: CountMinSketch<4096, 8> = CountMinSketch::new();
        assert_eq!(cms.estimate(999), 0);
    }

    #[test]
    fn test_error_rate_10k_items() {
        let mut cms: CountMinSketch<4096, 8> = CountMinSketch::new();
        // Insert 10_000 items with skewed distribution
        for i in 0..10_000 {
            let key = (i % 100) as u64; // 100 unique keys, ~100 each
            cms.add(key);
        }

        let mut max_error = 0.0f64;
        for i in 0..100u64 {
            let true_count = 100u32;
            let est = cms.estimate(i);
            let error = (est as f64 - true_count as f64) / true_count as f64;
            max_error = max_error.max(error);
        }

        // With WIDTH=4096, DEPTH=8: expected error is total/width = 10000/4096 ≈ 2.4
        // So relative error for count=100 should be well under 5%
        assert!(
            max_error < 0.05,
            "Max relative error {} exceeds 5% threshold",
            max_error
        );
    }

    #[test]
    fn test_pair_operations() {
        let mut cms: CountMinSketch<4096, 8> = CountMinSketch::new();
        cms.add_pair(1, 2);
        cms.add_pair(1, 2);
        cms.add_pair(1, 3);

        assert!(cms.estimate_pair(1, 2) >= 2);
        assert!(cms.estimate_pair(1, 3) >= 1);
        assert_eq!(cms.estimate_pair(2, 3), 0);
    }

    #[test]
    fn test_memory_size() {
        let cms: CountMinSketch<4096, 8> = CountMinSketch::new();
        // 4096 * 8 * 4 bytes for table + 8 * 8 bytes for seeds
        assert!(cms.memory_bytes() >= 4096 * 8 * 4);
    }

    #[test]
    fn test_deterministic_hashes() {
        let cms1: CountMinSketch<4096, 8> = CountMinSketch::new();
        let cms2: CountMinSketch<4096, 8> = CountMinSketch::new();
        // Same seeds should produce same hashes
        for i in 0..100u64 {
            assert_eq!(cms1.hash(i, 0), cms2.hash(i, 0));
            assert_eq!(cms1.hash(i, 3), cms2.hash(i, 3));
        }
    }
}
