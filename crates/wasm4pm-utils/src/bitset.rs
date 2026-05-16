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
///
/// `cond` is interpreted as a *truthy* value: any non-zero `cond` selects
/// `true_val`, exactly zero selects `false_val`. The implementation first
/// canonicalises `cond` to `0` or `1` so non-boolean inputs (e.g., flag
/// bitmaps) don't produce mixed-bit garbage.
#[inline]
#[must_use]
pub const fn select_u64(cond: u64, true_val: u64, false_val: u64) -> u64 {
    let bit = (cond != 0) as u64; // canonicalise to 0 or 1
    let mask = bit.wrapping_neg(); // all-ones if truthy, all-zeros otherwise
    (mask & true_val) | (!mask & false_val)
}

/// Branchless mask selection for 32-bit values. See `select_u64` for the
/// truthy-vs-falsy contract on `cond`.
#[inline]
#[must_use]
pub const fn select_u32(cond: u64, true_val: u32, false_val: u32) -> u32 {
    let bit = (cond != 0) as u32;
    let mask = bit.wrapping_neg(); // u32 all-ones if truthy
    (mask & true_val) | (!mask & false_val)
}

/// Branchless mask selection for floating point values.
#[inline]
#[must_use]
pub fn select_f32(cond: u64, true_val: f32, false_val: f32) -> f32 {
    let t = true_val.to_bits();
    let f = false_val.to_bits();
    f32::from_bits(select_u32(cond, t, f))
}

#[cfg(test)]
mod select_tests {
    use super::*;

    /// Rank-1 oracle: `select_*` must agree with the conditional branch
    /// semantics `if cond != 0 { true_val } else { false_val }` for any
    /// `cond` value — not just `0`/`1`. The pre-fix implementation produced
    /// bit-mixed garbage for `cond ∉ {0, 1}` because `cond.wrapping_neg()`
    /// was not a valid sign-extended mask.
    #[test]
    fn select_u64_matches_branch_for_any_cond() {
        for cond in [0u64, 1, 2, 0xFF, u64::MAX, u64::MAX - 1] {
            let expected = if cond != 0 { 9u64 } else { 20u64 };
            assert_eq!(
                select_u64(cond, 9, 20),
                expected,
                "select_u64 disagrees with branch for cond={cond}"
            );
        }
    }

    #[test]
    fn select_u32_matches_branch_for_any_cond() {
        for cond in [0u64, 1, 2, 0xFF, u64::MAX, 0xFFFF_FFFE] {
            let expected = if cond != 0 { 9u32 } else { 20u32 };
            assert_eq!(select_u32(cond, 9, 20), expected, "cond={cond}");
        }
    }

    /// Rank-2 oracle: `select_f32` is bit-identical to selecting between the
    /// two operands. Confirms that the u32 truncation in the underlying
    /// helper does not corrupt either operand.
    #[test]
    fn select_f32_preserves_full_bit_pattern() {
        let a = 1.234567f32;
        let b = -987.654f32;
        assert_eq!(select_f32(1, a, b).to_bits(), a.to_bits());
        assert_eq!(select_f32(0, a, b).to_bits(), b.to_bits());
        assert_eq!(select_f32(42, a, b).to_bits(), a.to_bits()); // truthy ≠ 1
    }
}
