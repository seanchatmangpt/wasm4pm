//! Rank-1 statistical oracles for `prediction_drift` helpers.
//!
//! These tests target the pure-Rust helpers (`jaccard_distance`, `ewma_series`,
//! `classify_trend`) — i.e. everything in `prediction_drift` that does *not*
//! cross the wasm-bindgen boundary. The boundary itself is exercised in the
//! TypeScript test suite under `packages/kernel/__tests__/`.
//!
//! Oracle ranks (per `chicago-tdd.md`):
//!
//! * **Rank 1** — Mathematical theorem: Jaccard set-distance metric properties,
//!   EWMA recurrence and convergence.
//! * **Rank 3** — Metamorphic relations: monotonicity under controlled
//!   perturbation.

use std::collections::HashSet;
use wasm4pm::prediction_drift::{
    classify_trend, ewma_series, jaccard_distance, DEFAULT_DRIFT_THRESHOLD,
};

fn s(items: &[&str]) -> HashSet<String> {
    items.iter().map(|x| x.to_string()).collect()
}

// ---------------------------------------------------------------------------
// Jaccard distance — Rank 1 metric properties
// ---------------------------------------------------------------------------

#[test]
fn jaccard_is_in_unit_interval() {
    let cases: &[(&[&str], &[&str])] = &[
        (&[], &[]),
        (&["A"], &[]),
        (&[], &["B"]),
        (&["A", "B", "C"], &["B", "C", "D"]),
        (&["X"], &["Y"]),
        (&["A", "B"], &["A", "B"]),
    ];
    for (a, b) in cases {
        let d = jaccard_distance(&s(a), &s(b));
        assert!((0.0..=1.0).contains(&d), "distance {} out of [0,1]", d);
    }
}

#[test]
fn jaccard_identity_law() {
    // d(A, A) = 0 for all A.
    for items in [
        &[][..],
        &["A"][..],
        &["A", "B", "C"][..],
        &["x", "y", "z", "w", "u"][..],
    ] {
        let a = s(items);
        assert_eq!(jaccard_distance(&a, &a), 0.0);
    }
}

#[test]
fn jaccard_symmetry_law() {
    // d(A, B) = d(B, A).
    let pairs: &[(&[&str], &[&str])] = &[
        (&["A"], &["B"]),
        (&["A", "B"], &["B", "C"]),
        (&["A", "B", "C", "D"], &["C", "D", "E"]),
        (&["X", "Y", "Z"], &[]),
    ];
    for (a, b) in pairs {
        let sa = s(a);
        let sb = s(b);
        assert!((jaccard_distance(&sa, &sb) - jaccard_distance(&sb, &sa)).abs() < 1e-12);
    }
}

#[test]
fn jaccard_triangle_inequality() {
    // Jaccard distance is a true metric: d(A,C) ≤ d(A,B) + d(B,C).
    let a = s(&["A", "B", "C"]);
    let b = s(&["B", "C", "D"]);
    let c = s(&["D", "E", "F"]);
    let d_ab = jaccard_distance(&a, &b);
    let d_bc = jaccard_distance(&b, &c);
    let d_ac = jaccard_distance(&a, &c);
    assert!(
        d_ac <= d_ab + d_bc + 1e-12,
        "triangle violated: d(A,C)={} > d(A,B)+d(B,C)={}",
        d_ac,
        d_ab + d_bc
    );
}

#[test]
fn jaccard_disjoint_nonempty_is_one() {
    let a = s(&["A", "B"]);
    let b = s(&["X", "Y", "Z"]);
    assert_eq!(jaccard_distance(&a, &b), 1.0);
}

#[test]
fn jaccard_metamorphic_growing_overlap_decreases_distance() {
    // Rank 3 metamorphic: grow |A ∩ B| while keeping |A ∪ B| constant
    // ⇒ distance strictly decreases.
    let mut prev = f64::INFINITY;
    let universe = ["A", "B", "C", "D", "E", "F"];
    for k in 1..=universe.len() {
        let a = s(&universe);
        let b = s(&universe[..k]);
        let d = jaccard_distance(&a, &b);
        assert!(
            d <= prev + 1e-12,
            "non-monotonic at k={}: {} > {}",
            k,
            d,
            prev
        );
        prev = d;
    }
}

// ---------------------------------------------------------------------------
// EWMA — Rank 1 recurrence + convergence
// ---------------------------------------------------------------------------

#[test]
fn ewma_recurrence_holds_pointwise() {
    let v: Vec<f64> = (0..50).map(|i| (i as f64).sin()).collect();
    let alpha = 0.25;
    let s_out = ewma_series(&v, alpha);
    assert_eq!(s_out[0], v[0]);
    for i in 1..v.len() {
        let expected = alpha * v[i] + (1.0 - alpha) * s_out[i - 1];
        assert!((s_out[i] - expected).abs() < 1e-12, "violation at i={}", i);
    }
}

#[test]
fn ewma_constant_input_is_fixed_point() {
    let s_out = ewma_series(&vec![7.5; 100], 0.4);
    for x in s_out {
        assert!((x - 7.5).abs() < 1e-12);
    }
}

#[test]
fn ewma_geometric_convergence_to_step() {
    // x[0]=0, x[i>=1]=10. After ~ -log(eps)/log(1-α) samples, |s - 10| < eps.
    let alpha = 0.3;
    let mut v = vec![0.0];
    v.extend(std::iter::repeat(10.0).take(500));
    let s_out = ewma_series(&v, alpha);
    let last = *s_out.last().unwrap();
    assert!((last - 10.0).abs() < 1e-9, "did not converge: {}", last);
}

#[test]
fn ewma_lower_alpha_smooths_more_than_higher_alpha() {
    // Rank 3 metamorphic: for the same noisy series, the lower-α EWMA has
    // smaller variance about its mean than the higher-α EWMA.
    let mut v = Vec::new();
    let mut rng_state: u64 = 0x9E37_79B9_7F4A_7C15;
    for _ in 0..1000 {
        rng_state = rng_state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let r = (rng_state >> 11) as f64 / (1u64 << 53) as f64; // [0,1)
        v.push(r - 0.5);
    }
    let low = ewma_series(&v, 0.05);
    let high = ewma_series(&v, 0.9);
    let var = |s: &[f64]| {
        let m = s.iter().sum::<f64>() / s.len() as f64;
        s.iter().map(|x| (x - m).powi(2)).sum::<f64>() / s.len() as f64
    };
    assert!(
        var(&low) < var(&high),
        "var(low={}) >= var(high={})",
        var(&low),
        var(&high)
    );
}

#[test]
fn ewma_handles_extreme_alpha() {
    let v = vec![1.0, 2.0, 3.0, 4.0];
    // α=0 clamped to MIN_POSITIVE: stays near first sample.
    let s0 = ewma_series(&v, 0.0);
    assert!((s0[s0.len() - 1] - 1.0).abs() < 1e-9);
    // α>1 clamped to 1: identity-with-lag.
    let s1 = ewma_series(&v, 100.0);
    assert_eq!(s1, v);
    // NaN α should not panic.
    let s_nan = ewma_series(&v, f64::NAN);
    assert_eq!(s_nan.len(), v.len());
}

// ---------------------------------------------------------------------------
// classify_trend — Rank 2 domain contract
// ---------------------------------------------------------------------------

#[test]
fn trend_classification_matches_spec() {
    assert_eq!(classify_trend(&[]), "stable");
    assert_eq!(classify_trend(&[42.0]), "stable");
    assert_eq!(classify_trend(&[1.0, 2.0, 3.0, 4.0, 5.0]), "rising");
    assert_eq!(classify_trend(&[5.0, 4.0, 3.0, 2.0, 1.0]), "falling");
    // Range / scale < 5% ⇒ stable.
    assert_eq!(
        classify_trend(&[100.0, 100.5, 101.0, 100.9, 100.4]),
        "stable"
    );
}

// ---------------------------------------------------------------------------
// Constants — Rank 2 domain contract
// ---------------------------------------------------------------------------

#[test]
fn default_drift_threshold_in_open_unit_interval() {
    assert!(DEFAULT_DRIFT_THRESHOLD > 0.0 && DEFAULT_DRIFT_THRESHOLD < 1.0);
}
