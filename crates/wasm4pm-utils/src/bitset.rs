//! Bitset Algebra for process mining: Performance-critical primitives
//! ported from bcinr to enable O(1) attribute comparisons and optimized trace clustering.

/// Count set bits (population count) up to and including position.
#[inline]
#[must_use]
pub const fn rank_u64(x: u64, pos: usize) -> usize {
    debug_assert!(pos < 64);
    let mask = if pos == 63 {
        u64::MAX
    } else {
        (1u64 << (pos + 1)) - 1
    };
    (x & mask).count_ones() as usize
}

/// Computes Jaccard similarity between two bitset slices.
/// Optimized for cache-local processing of event activity traces.
#[inline]
#[must_use]
pub fn jaccard_u64_slices(a: &[u64], b: &[u64]) -> f32 {
    let mut intersection_count = 0u32;
    let mut union_count = 0u32;
    for (&va, &vb) in a.iter().zip(b.iter()) {
        intersection_count += (va & vb).count_ones();
        union_count += (va | vb).count_ones();
    }
    if union_count == 0 {
        1.0
    } else {
        intersection_count as f32 / union_count as f32
    }
}

/// Branchless mask selection for performance-critical inner loops (e.g., token replay).
#[inline]
#[must_use]
pub const fn select_u64(cond: u64, true_val: u64, false_val: u64) -> u64 {
    (cond.wrapping_neg()) & true_val | (!cond.wrapping_neg()) & false_val
}

/// Branchless mask selection for 32-bit values.
#[inline]
#[must_use]
pub const fn select_u32(cond: u64, true_val: u32, false_val: u32) -> u32 {
    ((cond.wrapping_neg() as u32) & true_val) | ((!cond.wrapping_neg() as u32) & false_val)
}

/// Branchless mask selection for floating point values.
#[inline]
#[must_use]
pub fn select_f32(cond: u64, true_val: f32, false_val: f32) -> f32 {
    let t = true_val.to_bits();
    let f = false_val.to_bits();
    f32::from_bits(select_u32(cond, t, f))
}
