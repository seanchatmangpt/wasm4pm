//! MYCIN certainty-factor algebra (Shortliffe & Buchanan 1975), promoted from
//! `production_rules.rs` for reuse by fuzzy / Dempster–Shafer / Bayesian
//! evidence-combination breeds.
//!
//! Rank-1 properties proven by the tests below:
//! - Same-sign commutativity: `combine_cf(a, b) == combine_cf(b, a)`.
//! - Identity: `combine_cf(x, 0) == x`.
//! - Absorption: `combine_cf(1, b) == 1` for `b >= 0`.
//! - Bounds: result in `[-1, 1]` for inputs in `[-1, 1]`.

/// Shortliffe–Buchanan certainty-factor combination.
///
/// `a + b - a*b` for two positive CFs, `a + b + a*b` for two negative CFs,
/// `(a + b) / (1 - min(|a|, |b|))` for mixed signs (0 when the denominator
/// vanishes, i.e. combining +1 with -1).
pub fn combine_cf(a: f32, b: f32) -> f32 {
    let r = if a >= 0.0 && b >= 0.0 {
        a + b - a * b
    } else if a < 0.0 && b < 0.0 {
        a + b + a * b
    } else {
        let denom = 1.0 - a.abs().min(b.abs());
        if denom.abs() < 1e-9 {
            0.0
        } else {
            (a + b) / denom
        }
    };
    r.clamp(-1.0, 1.0)
}

/// Fold a sequence of certainty factors left-to-right with [`combine_cf`].
///
/// Returns 0.0 for an empty slice (the identity element).
pub fn combine_all(cfs: &[f32]) -> f32 {
    cfs.iter().fold(0.0_f32, |acc, &cf| combine_cf(acc, cf))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn cf() -> impl Strategy<Value = f32> {
        (-1.0_f32..=1.0_f32).prop_map(|x| (x * 1000.0).round() / 1000.0)
    }

    proptest! {
        #[test]
        fn commutative(a in cf(), b in cf()) {
            prop_assert!((combine_cf(a, b) - combine_cf(b, a)).abs() < 1e-5);
        }

        #[test]
        fn identity_zero(a in cf()) {
            prop_assert!((combine_cf(a, 0.0) - a).abs() < 1e-6);
        }

        #[test]
        fn bounded(a in cf(), b in cf()) {
            let r = combine_cf(a, b);
            prop_assert!((-1.0..=1.0).contains(&r));
        }

        #[test]
        fn one_absorbs_nonnegative(b in 0.0_f32..=1.0_f32) {
            prop_assert!((combine_cf(1.0, b) - 1.0).abs() < 1e-6);
        }

        #[test]
        fn same_sign_associative(a in 0.0_f32..=1.0_f32, b in 0.0_f32..=1.0_f32, c in 0.0_f32..=1.0_f32) {
            let lhs = combine_cf(combine_cf(a, b), c);
            let rhs = combine_cf(a, combine_cf(b, c));
            prop_assert!((lhs - rhs).abs() < 1e-4);
        }
    }

    #[test]
    fn known_values() {
        // 0.6 ⊕ 0.4 = 0.6 + 0.4 - 0.24 = 0.76 (Shortliffe & Buchanan worked example form)
        assert!((combine_cf(0.6, 0.4) - 0.76).abs() < 1e-6);
        // -0.6 ⊕ -0.4 = -0.76 (mirror)
        assert!((combine_cf(-0.6, -0.4) + 0.76).abs() < 1e-6);
        // mixed: (0.6 - 0.4) / (1 - 0.4) = 0.333...
        assert!((combine_cf(0.6, -0.4) - 0.2 / 0.6).abs() < 1e-6);
        // total conflict collapses to 0
        assert_eq!(combine_cf(1.0, -1.0), 0.0);
    }

    #[test]
    fn fold_matches_pairwise() {
        let v = [0.3_f32, -0.2, 0.5];
        let folded = combine_all(&v);
        let manual = combine_cf(combine_cf(combine_cf(0.0, 0.3), -0.2), 0.5);
        assert!((folded - manual).abs() < 1e-6);
        assert_eq!(combine_all(&[]), 0.0);
    }
}
