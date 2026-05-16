//! Rank-1 (mathematical theorem) regression tests for breed primitives.
//!
//! Pins the documented algebraic properties of `jaccard` (cbr.rs) and
//! `noisy_or` (hearsay.rs) so a future refactor cannot silently violate them
//! (the same FM-5 trap PR #53 fixed for combine_cf).

use std::collections::HashSet;
use wasm4pm_cognition::breeds::cbr::jaccard;
use wasm4pm_cognition::breeds::hearsay::noisy_or;

fn set_of(items: &[&str]) -> HashSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

// ── jaccard ───────────────────────────────────────────────────────────────────

#[test]
fn jaccard_symmetry() {
    let a = set_of(&["x", "y", "z"]);
    let b = set_of(&["y", "z", "w"]);
    assert_eq!(jaccard(&a, &b), jaccard(&b, &a));
}

#[test]
fn jaccard_identity_for_nonempty_set() {
    let a = set_of(&["x", "y", "z"]);
    assert_eq!(jaccard(&a, &a), 1.0);
}

#[test]
fn jaccard_zero_for_disjoint_sets() {
    let a = set_of(&["x", "y"]);
    let b = set_of(&["p", "q"]);
    assert_eq!(jaccard(&a, &b), 0.0);
}

#[test]
fn jaccard_empty_empty_convention_zero() {
    // Documented convention per cbr.rs:26 — pin behavior so a refactor
    // cannot silently change CBR similarity semantics.
    let empty: HashSet<String> = HashSet::new();
    assert_eq!(jaccard(&empty, &empty), 0.0);
}

#[test]
fn jaccard_bounded_in_zero_to_one() {
    let a = set_of(&["x", "y", "z", "w"]);
    let b = set_of(&["x", "y", "p", "q"]);
    let r = jaccard(&a, &b);
    assert!((0.0..=1.0).contains(&r), "jaccard out of bounds: {}", r);
}

#[test]
fn jaccard_half_overlap_is_one_third() {
    // {x,y} ∩ {y,z} = {y}, ∪ = {x,y,z}, jaccard = 1/3.
    let r = jaccard(&set_of(&["x", "y"]), &set_of(&["y", "z"]));
    assert!((r - (1.0_f32 / 3.0)).abs() < 1e-6, "expected ≈ 1/3, got {}", r);
}

// ── noisy_or (hearsay.rs:28-33) ───────────────────────────────────────────────

#[test]
fn noisy_or_commutativity() {
    assert!((noisy_or(0.3, 0.7) - noisy_or(0.7, 0.3)).abs() < 1e-6);
    assert!((noisy_or(0.0, 0.5) - noisy_or(0.5, 0.0)).abs() < 1e-6);
}

#[test]
fn noisy_or_identity_with_zero() {
    for x in [0.0_f32, 0.1, 0.5, 0.7, 1.0] {
        assert!((noisy_or(x, 0.0) - x).abs() < 1e-6, "identity broken at x={}", x);
    }
}

#[test]
fn noisy_or_absorbing_with_one() {
    for x in [0.0_f32, 0.1, 0.5, 0.7, 1.0] {
        assert!((noisy_or(x, 1.0) - 1.0).abs() < 1e-6);
    }
}

#[test]
fn noisy_or_monotone_no_smaller_than_max_input() {
    // Documented invariant on hearsay.rs:33.
    for a in [0.0_f32, 0.25, 0.5, 0.75, 0.99] {
        for b in [0.0_f32, 0.25, 0.5, 0.75, 0.99] {
            let r = noisy_or(a, b);
            let m = a.max(b);
            assert!(r + 1e-6 >= m, "monotone violated: noisy_or({a},{b})={r} < max={m}");
            assert!((0.0..=1.0).contains(&r), "out of bounds: {}", r);
        }
    }
}

#[test]
fn noisy_or_clamps_out_of_range_inputs() {
    assert!((noisy_or(-1.0, 0.5) - noisy_or(0.0, 0.5)).abs() < 1e-6);
    assert!((noisy_or(2.0, 0.5) - noisy_or(1.0, 0.5)).abs() < 1e-6);
    let r = noisy_or(-100.0, -100.0);
    assert!((0.0..=1.0).contains(&r));
}

#[test]
fn noisy_or_specific_value_check() {
    // noisy_or(0.7, 0.8) = 1 - (1-0.7)(1-0.8) = 1 - 0.06 = 0.94
    let r = noisy_or(0.7, 0.8);
    assert!((r - 0.94).abs() < 1e-4, "expected 0.94, got {}", r);
}
