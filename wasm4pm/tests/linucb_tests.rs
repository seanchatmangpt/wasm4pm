//! Integration tests for the LinUCB CPU baseline.
//!
//! These tests complement the unit tests embedded in src/ml/linucb.rs.
//! They exercise the public API as an external crate consumer would
//! (ground-truth validation surface for GPU parity checks).

use pictl::ml::linucb::{N_ACTIONS, N_FEATURES};
use pictl::ml::LinUCBAgent;

// ---------------------------------------------------------------------------
// Structural / API surface tests
// ---------------------------------------------------------------------------

#[test]
fn linucb_new_produces_valid_agent() {
    let agent = LinUCBAgent::new();
    assert_eq!(agent.alpha_lr, 0.1);
    assert_eq!(agent.lambda, 1.0);
    // √2 up to f32 precision
    assert!((agent.alpha - 2.0_f32.sqrt()).abs() < 1e-6);
    assert_eq!(agent.name, "LinUCB-CPU");
}

#[test]
fn select_signature_contract() {
    let agent = LinUCBAgent::new();
    let features = [0.5_f32; N_FEATURES];
    let (action, score) = agent.select(&features);
    assert!(
        (action as usize) < N_ACTIONS,
        "action out of range: {action}"
    );
    assert!(score.is_finite(), "score must be finite: {score}");
}

#[test]
fn get_q_values_returns_40_elements() {
    let agent = LinUCBAgent::new();
    let features = [0.1_f32; N_FEATURES];
    let qs = agent.get_q_values(&features);
    assert_eq!(qs.len(), N_ACTIONS);
    for q in qs.iter() {
        assert!(q.is_finite(), "all Q values must be finite");
    }
}

// ---------------------------------------------------------------------------
// Math correctness
// ---------------------------------------------------------------------------

#[test]
fn ucb_variance_is_nonnegative() {
    let agent = LinUCBAgent::new();
    let features = [0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8, 0.4];
    let v = agent.compute_ucb_variance(&features);
    assert!(v >= 0.0, "x^T A^-1 x must be non-negative, got {v}");
}

#[test]
fn ucb_variance_of_zero_features_is_zero() {
    let agent = LinUCBAgent::new();
    let zero = [0.0_f32; N_FEATURES];
    let v = agent.compute_ucb_variance(&zero);
    assert!(v.abs() < 1e-7, "variance of zero vector must be 0, got {v}");
}

#[test]
fn fresh_agent_q_equals_exploration_bonus_only() {
    // With W=0 and b=0, Q̂_a(x) = α √(x^T A^{-1} x) for all a.
    // A^{-1} = I (λ=1), so x^T A^{-1} x = ||x||².
    let agent = LinUCBAgent::new();
    let x = [0.3, 0.0, 0.5, 0.0, 0.0, 0.0, 0.1, 0.0_f32];
    let qs = agent.get_q_values(&x);
    let norm_sq: f32 = x.iter().map(|xi| xi * xi).sum();
    let expected = agent.alpha * norm_sq.sqrt();
    for (i, &q) in qs.iter().enumerate() {
        assert!(
            (q - expected).abs() < 1e-5,
            "Q[{i}] = {q} but expected {expected}"
        );
    }
}

// ---------------------------------------------------------------------------
// Update mechanics
// ---------------------------------------------------------------------------

#[test]
fn update_intercept_tracks_reward_direction() {
    let mut agent = LinUCBAgent::new();
    let features = [0.0_f32; N_FEATURES]; // zero features → gradient only on b
    let initial_b = agent.intercept(10);
    agent.update(&features, 10, 1.0);
    let after_b = agent.intercept(10);
    assert!(
        after_b > initial_b,
        "positive reward should increase intercept: {initial_b} → {after_b}"
    );
}

#[test]
fn update_with_unit_features_updates_all_weights() {
    let mut agent = LinUCBAgent::new();
    let ones = [1.0_f32; N_FEATURES];
    let w_before = agent.weight_vector(20);
    agent.update(&ones, 20, 5.0);
    let w_after = agent.weight_vector(20);
    for j in 0..N_FEATURES {
        assert_ne!(w_before[j], w_after[j], "W[20][{j}] should change");
    }
}

// ---------------------------------------------------------------------------
// Performance smoke test (latency bounds)
// ---------------------------------------------------------------------------

#[test]
fn select_latency_under_1ms() {
    use std::time::Instant;
    let agent = LinUCBAgent::new();
    let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

    // Warm-up
    for _ in 0..10 {
        let _ = agent.select(&features);
    }

    let start = Instant::now();
    let iters = 1_000u32;
    for _ in 0..iters {
        let _ = agent.select(&features);
    }
    let elapsed_us = start.elapsed().as_micros() as f64;
    let per_call_us = elapsed_us / iters as f64;

    assert!(
        per_call_us < 1_000.0,
        "select() took {per_call_us:.1} µs per call (must be < 1000 µs)"
    );
    eprintln!("select() latency: {per_call_us:.2} µs/call");
}

#[test]
fn update_latency_under_2ms() {
    use std::time::Instant;
    let mut agent = LinUCBAgent::new();
    let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

    // Warm-up
    for i in 0..10u32 {
        agent.update(&features, i % N_ACTIONS as u32, 1.0);
    }

    let start = Instant::now();
    let iters = 1_000u32;
    for i in 0..iters {
        agent.update(&features, i % N_ACTIONS as u32, 1.0);
    }
    let elapsed_us = start.elapsed().as_micros() as f64;
    let per_call_us = elapsed_us / iters as f64;

    assert!(
        per_call_us < 2_000.0,
        "update() took {per_call_us:.1} µs per call (must be < 2000 µs)"
    );
    eprintln!("update() latency: {per_call_us:.2} µs/call");
}
