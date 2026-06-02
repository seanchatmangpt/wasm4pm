#![allow(clippy::all, unused_mut)]
//! Rank-1 mathematical property tests for `combine_cf` (Shortliffe-Buchanan
//! certainty-factor combination, MYCIN 1976).
//!
//! The public docs on `combine_cf` claim three Rank-1 properties:
//!   1. Commutativity for same-sign inputs: `combine(a,b) == combine(b,a)`
//!   2. Identity: `combine(x, 0) == x`
//!   3. Bounds: result is in `[-1.0, 1.0]` for inputs in `[-1.0, 1.0]`
//!
//! Before this file the function was `pub`-exported with documented invariants
//! and ZERO test coverage anywhere in the workspace. Drift on these properties
//! would silently corrupt every MYCIN inference. These property tests anchor
//! the math.

use proptest::prelude::*;
use wasm4pm_cognition::breeds::production_rules::combine_cf;

const EPS: f32 = 1e-5;

fn approx_eq(a: f32, b: f32) -> bool {
    (a - b).abs() <= EPS
}

proptest! {
    /// Property 1 (commutativity for same-sign inputs).
    #[test]
    fn combine_cf_commutative_same_sign(
        a in -1.0_f32..=1.0_f32,
        b in -1.0_f32..=1.0_f32,
    ) {
        // Same-sign or one of them is zero.
        prop_assume!((a >= 0.0 && b >= 0.0) || (a <= 0.0 && b <= 0.0));
        let ab = combine_cf(a, b);
        let ba = combine_cf(b, a);
        prop_assert!(approx_eq(ab, ba), "combine_cf({a},{b})={ab} != combine_cf({b},{a})={ba}");
    }

    /// Property 2 (identity at 0).
    #[test]
    fn combine_cf_identity_zero(x in -1.0_f32..=1.0_f32) {
        let lhs = combine_cf(x, 0.0);
        let rhs = combine_cf(0.0, x);
        prop_assert!(approx_eq(lhs, x), "combine_cf({x}, 0) = {lhs}, want {x}");
        prop_assert!(approx_eq(rhs, x), "combine_cf(0, {x}) = {rhs}, want {x}");
    }

    /// Property 3 (bounds): result stays in [-1.0, 1.0].
    #[test]
    fn combine_cf_bounded(
        a in -1.0_f32..=1.0_f32,
        b in -1.0_f32..=1.0_f32,
    ) {
        let r = combine_cf(a, b);
        prop_assert!(r >= -1.0 && r <= 1.0, "combine_cf({a},{b})={r} out of [-1,1]");
    }

    /// Property 4 (monotonicity for positive evidence): combining positive
    /// evidence with non-negative new evidence never decreases the result.
    #[test]
    fn combine_cf_positive_monotone(
        prior in 0.0_f32..=1.0_f32,
        new in 0.0_f32..=1.0_f32,
    ) {
        let combined = combine_cf(prior, new);
        prop_assert!(combined + EPS >= prior, "combine_cf({prior},{new})={combined} < prior");
    }
}

/// Spot-check anchors from Shortliffe-Buchanan (1976).
#[test]
fn combine_cf_anchors() {
    // Identity at 0.
    assert!(approx_eq(combine_cf(0.5, 0.0), 0.5));
    assert!(approx_eq(combine_cf(0.0, -0.7), -0.7));
    // Same-sign positive: 0.6, 0.4 → 0.6 + 0.4 - 0.24 = 0.76
    assert!(approx_eq(combine_cf(0.6, 0.4), 0.76));
    // Same-sign negative: -0.6, -0.4 → -0.6 + -0.4 + 0.24 = -0.76
    assert!(approx_eq(combine_cf(-0.6, -0.4), -0.76));
    // Mixed signs: 0.8, -0.5 → (0.3) / (1 - min(.8,.5)) = 0.3 / 0.5 = 0.6
    assert!(approx_eq(combine_cf(0.8, -0.5), 0.6));
    // Extreme: combine(1, x) saturates at 1.0.
    assert!(approx_eq(combine_cf(1.0, 0.9), 1.0));
    // Extreme: combine(-1, x) saturates at -1.0.
    assert!(approx_eq(combine_cf(-1.0, -0.9), -1.0));
}
