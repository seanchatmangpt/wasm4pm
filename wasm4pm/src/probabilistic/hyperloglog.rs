//! HyperLogLog for approximate distinct element counting.
//!
//! Estimates the cardinality of a multiset using fixed memory.
//! With `REGISTERS = 1024` registers, the expected error rate is
//! approximately `1.04 / sqrt(1024)` ≈ 3.25%.

use std::mem;

/// HyperLogLog cardinality estimator.
///
/// Uses the standard HyperLogLog algorithm with linear counting for small
/// cardinalities and bias correction for large ones.
///
/// `REGISTERS` must be a power of 2. Memory: `REGISTERS` bytes.
///
/// # Example
///
/// ```
/// let mut hll: HyperLogLog<1024> = HyperLogLog::new();
/// for i in 0..10000 { hll.add(i as u64); }
/// let est = hll.estimate();
/// assert!((est as f64 - 10000.0).abs() / 10000.0 < 0.05);
/// ```
pub struct HyperLogLog<const REGISTERS: usize> {
    registers: [u8; REGISTERS],
}

/// Number of bits used to select the register index.
const fn index_bits<const REGISTERS: usize>() -> u32 {
    // REGISTERS must be a power of 2; we compute log2 at compile time
    let mut bits = 0u32;
    let mut n = REGISTERS;
    while n > 1 {
        n >>= 1;
        bits += 1;
    }
    bits
}

impl<const REGISTERS: usize> HyperLogLog<REGISTERS> {
    /// Create a new HyperLogLog with all registers zeroed.
    pub fn new() -> Self {
        HyperLogLog {
            registers: [0u8; REGISTERS],
        }
    }

    /// Add a pre-hashed value to the estimator.
    ///
    /// The hash should be well-distributed (e.g., from a good hash function).
    /// The bottom `b` bits select the register; the remaining bits determine
    /// the position of the leftmost 1-bit (rho).
    #[inline]
    pub fn add(&mut self, hash: u64) {
        let b = index_bits::<REGISTERS>();
        let mask = (1u64 << b) - 1;
        let idx = (hash & mask) as usize;
        let w = hash >> b;

        // Count leading zeros + 1 (position of first 1-bit from the left)
        // We must left-shift w back by b bits so that leading_zeros() counts
        // zeros only within the meaningful (64 - b) bits, not the zero-padded
        // upper b bits of the u64.
        let w_padded = w << b;
        let rho: u8 = if w == 0 {
            // All remaining bits are 0 — maximum rho
            (64 - b + 1) as u8
        } else {
            w_padded.leading_zeros() as u8 + 1
        };

        // Keep the maximum rho for this register
        if rho > self.registers[idx] {
            self.registers[idx] = rho;
        }
    }

    /// Estimate the cardinality of the set.
    ///
    /// Uses the standard HyperLogLog formula with:
    /// - Linear counting correction for small sets (E < 2.5 * REGISTERS)
    /// - Bias correction for large sets
    pub fn estimate(&self) -> usize {
        let m = REGISTERS as f64;
        let alpha_m = match REGISTERS {
            16 => 0.673,
            32 => 0.697,
            64 => 0.709,
            _ => 0.7213 / (1.0 + 1.079 / m),
        };

        // Compute harmonic mean of 2^(-register)
        let sum: f64 = self
            .registers
            .iter()
            .map(|&r| 2.0f64.powi(-(r as i32)))
            .sum();

        if sum == 0.0 {
            return 0;
        }

        let e = alpha_m * m * m / sum;

        // Small range correction: use linear counting
        if e <= 2.5 * m {
            let zeros = self.registers.iter().filter(|&&r| r == 0).count() as f64;
            if zeros > 0.0 {
                let lc = m * (m / zeros).ln();
                return lc.round() as usize;
            }
        }

        // Large range correction
        let two_32 = 2.0f64.powi(32);
        if e > two_32 / 30.0 {
            return (-two_32 * (1.0 - e / two_32).ln()).round() as usize;
        }

        e.round() as usize
    }

    /// Merge another HyperLogLog into this one (union operation).
    ///
    /// After merging, `self.estimate()` returns the cardinality of the union
    /// of both sets.
    pub fn merge(&mut self, other: &HyperLogLog<REGISTERS>) {
        for i in 0..REGISTERS {
            if other.registers[i] > self.registers[i] {
                self.registers[i] = other.registers[i];
            }
        }
    }

    /// Return the total memory used by this estimator in bytes.
    pub fn memory_bytes(&self) -> usize {
        mem::size_of::<Self>()
    }

    /// Reset all registers to zero.
    pub fn clear(&mut self) {
        self.registers = [0u8; REGISTERS];
    }
}

impl<const REGISTERS: usize> Default for HyperLogLog<REGISTERS> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty() {
        let hll: HyperLogLog<1024> = HyperLogLog::new();
        assert_eq!(hll.estimate(), 0);
    }

    #[test]
    fn test_single_element() {
        let mut hll: HyperLogLog<1024> = HyperLogLog::new();
        hll.add(42);
        let est = hll.estimate();
        // Should be approximately 1 (within a factor of 2 for HLL)
        assert!((1..=3).contains(&est));
    }

    /// Helper: SplitMix64 hash for u64 values (good distribution for sequential integers).
    fn splitmix64(v: u64) -> u64 {
        let mut z = v.wrapping_add(0x9e3779b97f4a7c15);
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^ (z >> 31)
    }

    #[test]
    fn test_error_rate_10k_unique() {
        let mut hll: HyperLogLog<1024> = HyperLogLog::new();
        for i in 0..10_000u64 {
            hll.add(splitmix64(i));
        }
        let est = hll.estimate();
        let error = (est as f64 - 10_000.0).abs() / 10_000.0;
        // With 1024 registers, expected error ~3.25%
        assert!(
            error < 0.10,
            "Error {} exceeds 10% (estimated={}, true=10000)",
            error,
            est
        );
    }

    #[test]
    fn test_merge() {
        let mut hll_a: HyperLogLog<1024> = HyperLogLog::new();
        let mut hll_b: HyperLogLog<1024> = HyperLogLog::new();

        for i in 0..5000u64 {
            hll_a.add(splitmix64(i));
        }
        for i in 5000..10_000u64 {
            hll_b.add(splitmix64(i));
        }

        hll_a.merge(&hll_b);
        let est = hll_a.estimate();
        let error = (est as f64 - 10_000.0).abs() / 10_000.0;
        assert!(
            error < 0.10,
            "Merge error {} exceeds 10% (estimated={})",
            error,
            est
        );
    }

    #[test]
    fn test_clear() {
        let mut hll: HyperLogLog<1024> = HyperLogLog::new();
        for i in 0..1000u64 {
            hll.add(i.wrapping_mul(0x517cc1b727220a95));
        }
        assert!(hll.estimate() > 0);
        hll.clear();
        assert_eq!(hll.estimate(), 0);
    }

    #[test]
    fn test_memory_size() {
        let hll: HyperLogLog<1024> = HyperLogLog::new();
        assert_eq!(hll.memory_bytes(), 1024);
    }
}
