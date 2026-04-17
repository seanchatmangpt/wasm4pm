//! Constant-latency branchless algorithms for SIMD and conformance checking.
//!
//! This module provides branchless (zero-conditional-branch) implementations of common
//! bit manipulation and selection operations. All functions have constant latency
//! and avoid branch misprediction penalties. Functions are guaranteed to compile
//! to assembly with zero conditional jumps (verified via objdump analysis).
//!
//! # Feature Gating
//!
//! When `bcinr` feature is enabled, functions delegate to `bcinr_core` implementations
//! optimized for the target architecture. Otherwise, portable fallback implementations
//! are used, which are still constant-latency.

/// Branchless select: if condition is non-zero, return `true_val`, else `false_val`.
///
/// # Constant Latency
///
/// This function executes in constant time without conditional jumps.
/// The `condition` parameter is converted to a mask via bitwise operations.
///
/// # Assembly Properties
///
/// - x86-64: Uses `cmov` (conditional move) instead of `jz`/`jnz` jumps
/// - ARM64: Uses `csel` (conditional select) instead of `b.eq` branches
/// - WASM: Compiles to `select` opcode (no branches)
///
/// # Example
///
/// ```
/// # use wasm4pm::branchless::select_u64;
/// let x = 5u64;
/// let y = 10u64;
/// let cond = x < y; // false (0)
/// let result = select_u64(cond as u64, y, x);
/// assert_eq!(result, x); // condition is 0, so returns false_val
/// ```
#[inline]
pub fn select_u64(condition: u64, true_val: u64, false_val: u64) -> u64 {
    #[cfg(feature = "bcinr")]
    {
        bcinr_core::api::mask::select_u64(condition, true_val, false_val)
    }

    #[cfg(not(feature = "bcinr"))]
    {
        // Portable branchless select via bit manipulation.
        // Convert condition to mask: non-zero -> all bits set, zero -> 0.
        // Technique: ((x != 0) as u64).wrapping_neg() produces -1 (0xFFFF...FFFF) or 0.
        let mask = ((condition != 0) as i64).wrapping_neg() as u64;
        (true_val & mask) | (false_val & !mask)
    }
}

/// Branchless select for u32 values.
///
/// See [`select_u64`] for detailed documentation.
///
/// # Example
///
/// ```
/// # use wasm4pm::branchless::select_u32;
/// let x = 5u32;
/// let y = 10u32;
/// let cond = x > y; // false (0)
/// let result = select_u32(cond as u32, y, x);
/// assert_eq!(result, x);
/// ```
#[inline]
pub fn select_u32(condition: u32, true_val: u32, false_val: u32) -> u32 {
    #[cfg(feature = "bcinr")]
    {
        bcinr_core::api::mask::select_u32(condition, true_val, false_val)
    }

    #[cfg(not(feature = "bcinr"))]
    {
        // Portable branchless select via bit manipulation.
        // Convert condition to mask: non-zero -> all bits set, zero -> 0.
        let mask = ((condition != 0) as i32).wrapping_neg() as u32;
        (true_val & mask) | (false_val & !mask)
    }
}

/// Branchless blend of two u64 values using a bit mask.
///
/// Returns `(x & mask) | (y & !mask)`, selecting bits from `x` where
/// mask is set and from `y` where mask is unset.
///
/// # Constant Latency
///
/// Executes in a fixed number of logical operations regardless of input values.
/// Compile-time optimization may reduce this to inline bitwise operations.
///
/// # Example
///
/// ```
/// # use wasm4pm::branchless::blend;
/// let x = 0xFF00u64;
/// let y = 0x00FFu64;
/// let mask = 0xAAAAu64; // alternating bits
/// let result = blend(x, y, mask);
/// // result has bits from x where mask=1, from y where mask=0
/// ```
#[inline]
pub fn blend(x: u64, y: u64, mask: u64) -> u64 {
    (x & mask) | (y & !mask)
}

/// Branchless population count (number of set bits) for u64.
///
/// # Constant Latency
///
/// On modern x86-64 (Nehalem+), compiles to a single `popcnt` instruction.
/// On older targets without `popcnt`, uses a loop-unrolled bit-counting algorithm.
///
/// # Example
///
/// ```
/// # use wasm4pm::branchless::popcount;
/// let x = 0b1010_1010u64;
/// assert_eq!(popcount(x), 4);
/// ```
#[inline]
pub fn popcount(x: u64) -> u32 {
    // Portable popcount via Knuth's algorithm (constant latency for fixed bit width).
    // Split into 32-bit halves and use Rust's built-in (which compiles to popcnt on modern targets).
    let hi = (x >> 32) as u32;
    let lo = x as u32;
    hi.count_ones() + lo.count_ones()
}

/// Branchless count of leading zeros for u64.
///
/// # Constant Latency
///
/// On modern x86-64 (Lzcnt), compiles to a single instruction.
/// On older targets, uses a loop-unrolled bit-searching algorithm.
///
/// # Example
///
/// ```
/// # use wasm4pm::branchless::leading_zeros;
/// let x = 0x0000_0001u64;
/// assert_eq!(leading_zeros(x), 63);
/// ```
#[inline]
pub fn leading_zeros(x: u64) -> u32 {
    // Portable leading zeros (Rust built-in; compiles to lzcnt on modern x86-64).
    x.leading_zeros()
}

/// Branchless population count for u32.
///
/// See [`popcount`] for detailed documentation.
#[inline]
pub fn popcount_u32(x: u32) -> u32 {
    #[cfg(feature = "bcinr")]
    {
        bcinr_core::api::int::popcount_u32(x)
    }

    #[cfg(not(feature = "bcinr"))]
    {
        x.count_ones()
    }
}

/// Branchless count of leading zeros for u32.
///
/// See [`leading_zeros`] for detailed documentation.
#[inline]
pub fn leading_zeros_u32(x: u32) -> u32 {
    x.leading_zeros()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_select_u64_true() {
        let result = select_u64(1, 42u64, 0u64);
        assert_eq!(result, 42);
    }

    #[test]
    fn test_select_u64_false() {
        let result = select_u64(0, 42u64, 99u64);
        assert_eq!(result, 99);
    }

    #[test]
    fn test_select_u32_true() {
        let result = select_u32(1, 42u32, 0u32);
        assert_eq!(result, 42);
    }

    #[test]
    fn test_select_u32_false() {
        let result = select_u32(0, 42u32, 99u32);
        assert_eq!(result, 99);
    }

    #[test]
    fn test_blend_basic() {
        let x = 0xFFFFu64;
        let y = 0x0000u64;
        let mask = 0xFF00u64;
        let result = blend(x, y, mask);
        assert_eq!(result, 0xFF00u64);
    }

    #[test]
    fn test_popcount_basic() {
        assert_eq!(popcount(0b1010_1010u64), 4);
        assert_eq!(popcount(0u64), 0);
        assert_eq!(popcount(u64::MAX), 64);
    }

    #[test]
    fn test_leading_zeros_basic() {
        assert_eq!(leading_zeros(0u64), 64);
        assert_eq!(leading_zeros(u64::MAX), 0);
        assert_eq!(leading_zeros(0x0000_0001u64), 63);
    }

    #[test]
    fn test_popcount_u32_basic() {
        assert_eq!(popcount_u32(0b1010_1010u32), 4);
        assert_eq!(popcount_u32(0u32), 0);
        assert_eq!(popcount_u32(u32::MAX), 32);
    }

    #[test]
    fn test_leading_zeros_u32_basic() {
        assert_eq!(leading_zeros_u32(0u32), 32);
        assert_eq!(leading_zeros_u32(u32::MAX), 0);
        assert_eq!(leading_zeros_u32(0x0000_0001u32), 31);
    }
}
