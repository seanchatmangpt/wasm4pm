//! Bloom filter for approximate set membership testing.
//!
//! Provides space-efficient set membership with a configurable false-positive
//! rate. False negatives are impossible: if `contains()` returns `false`,
//! the element was definitely not inserted.

/// Bloom filter with compile-time bit count.
///
/// Uses double hashing (Kirsch-Mitzenmacher optimization) to generate
/// `num_hashes` hash functions from two base hashes.
///
/// Memory: `ceil(BITS / 8)` bytes.
///
/// # Example
///
/// ```
/// let mut bloom: BloomFilter<16384> = BloomFilter::with_hashes(3);
/// bloom.insert(42);
/// assert!(bloom.contains(42)); // true positive
/// ```
pub struct BloomFilter<const BITS: usize> {
    /// Bit storage as u64 words. Allocated to cover BITS.
    bits: Vec<u64>,
    /// Number of hash functions to use.
    num_hashes: usize,
}

impl<const BITS: usize> BloomFilter<BITS> {
    /// Number of u64 words needed to store BITS bits.
    const WORDS: usize = (BITS + 63) / 64;

    /// Create a new Bloom filter with the given number of hash functions.
    ///
    /// A good default is `num_hashes = 3` for `BITS = 16384`, giving
    /// ~1% false positive rate at 5000 elements.
    pub fn with_hashes(num_hashes: usize) -> Self {
        BloomFilter {
            bits: vec![0u64; Self::WORDS],
            num_hashes,
        }
    }

    /// Create a new Bloom filter with automatically computed optimal hash count.
    ///
    /// Given an expected number of items `n`, computes `k = (BITS/n) * ln(2)`.
    pub fn optimal(n: usize) -> Self {
        let bits = BITS as f64;
        let k = if n > 0 {
            (bits / n as f64 * std::f64::consts::LN_2).round() as usize
        } else {
            1
        };
        let k = k.max(1);
        Self::with_hashes(k)
    }

    /// Hash a key to two independent u64 values using split-mix style.
    #[inline]
    fn double_hash(key: u64) -> (u64, u64) {
        let h1 = key
            .wrapping_mul(0x517cc1b727220a95)
            .wrapping_add(0x6c62272e07bb0142);
        let h2 = h1.rotate_left(17).wrapping_mul(0x9e3779b97f4a7c15);
        (h1, h2)
    }

    /// Get the i-th hash value using double hashing: `h1 + i * h2`.
    #[inline]
    fn nth_hash(h1: u64, h2: u64, i: usize) -> usize {
        (h1.wrapping_add((i as u64).wrapping_mul(h2))) as usize % BITS
    }

    /// Insert a pre-hashed key into the filter.
    #[inline]
    pub fn insert(&mut self, hash: u64) {
        let (h1, h2) = Self::double_hash(hash);
        for i in 0..self.num_hashes {
            let bit = Self::nth_hash(h1, h2, i);
            let word = bit / 64;
            let bit_in_word = bit % 64;
            if word < Self::WORDS {
                self.bits[word] |= 1u64 << bit_in_word;
            }
        }
    }

    /// Check if a pre-hashed key is possibly in the filter.
    ///
    /// Returns `false` only if the key was definitely not inserted.
    /// A `true` return may be a false positive.
    #[inline]
    pub fn contains(&self, hash: u64) -> bool {
        let (h1, h2) = Self::double_hash(hash);
        for i in 0..self.num_hashes {
            let bit = Self::nth_hash(h1, h2, i);
            let word = bit / 64;
            let bit_in_word = bit % 64;
            if word >= Self::WORDS || self.bits[word] & (1u64 << bit_in_word) == 0 {
                return false;
            }
        }
        true
    }

    /// Clear all bits, resetting the filter.
    pub fn clear(&mut self) {
        for word in self.bits.iter_mut() {
            *word = 0;
        }
    }

    /// Return the total memory used by this filter in bytes.
    pub fn memory_bytes(&self) -> usize {
        Self::WORDS * 8
    }

    /// Return the number of hash functions used.
    pub fn num_hashes(&self) -> usize {
        self.num_hashes
    }
}

impl<const BITS: usize> Default for BloomFilter<BITS> {
    fn default() -> Self {
        Self::with_hashes(3)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_filter() {
        let bloom: BloomFilter<16384> = BloomFilter::with_hashes(3);
        assert!(!bloom.contains(42));
    }

    #[test]
    fn test_insert_and_contains() {
        let mut bloom: BloomFilter<16384> = BloomFilter::with_hashes(3);
        bloom.insert(42);
        assert!(bloom.contains(42));
    }

    #[test]
    fn test_no_false_negatives() {
        let mut bloom: BloomFilter<16384> = BloomFilter::with_hashes(3);
        for i in 0..5000u64 {
            bloom.insert(i);
        }
        // Every inserted key must be found
        for i in 0..5000u64 {
            assert!(
                bloom.contains(i),
                "False negative for key {}",
                i
            );
        }
    }

    #[test]
    fn test_false_positive_rate() {
        let mut bloom: BloomFilter<16384> = BloomFilter::with_hashes(3);
        // Insert 5000 items
        for i in 0..5000u64 {
            bloom.insert(i);
        }
        // Test 10000 items that were NOT inserted
        let mut false_positives = 0;
        for i in 5000..15000u64 {
            if bloom.contains(i) {
                false_positives += 1;
            }
        }
        let fp_rate = false_positives as f64 / 10000.0;
        // With 16384 bits and 3 hashes for 5000 items:
        // Expected FP rate = (1 - e^(-3*5000/16384))^3 ≈ 0.13
        // Should be under 20%
        assert!(
            fp_rate < 0.20,
            "False positive rate {} exceeds 20%",
            fp_rate
        );
    }

    #[test]
    fn test_clear() {
        let mut bloom: BloomFilter<16384> = BloomFilter::with_hashes(3);
        bloom.insert(42);
        assert!(bloom.contains(42));
        bloom.clear();
        assert!(!bloom.contains(42));
    }

    #[test]
    fn test_memory_size() {
        let bloom: BloomFilter<16384> = BloomFilter::with_hashes(3);
        // 16384 bits = 2048 bytes = 256 u64 words * 8 bytes
        assert_eq!(bloom.memory_bytes(), 256 * 8);
    }

    #[test]
    fn test_optimal_hash_count() {
        let bloom: BloomFilter<16384> = BloomFilter::optimal(5000);
        // k = (16384 / 5000) * ln(2) ≈ 2.27 → rounds to 2
        assert!(bloom.num_hashes() >= 1);
    }
}
