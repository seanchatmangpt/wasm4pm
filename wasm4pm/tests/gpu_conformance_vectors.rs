//! GPU Conformance Test Vectors — LinUCB CPU vs GPU Parity
//!
//! 25 immutable ground-truth vectors in 3 categories:
//!
//!   INPUT INVARIANTS  (5):  iv-normalize-01 .. iv-normalize-05
//!   OUTPUT INVARIANTS (7):  oi-action-range-01, oi-action-range-02,
//!                           oi-determinism-01, oi-determinism-02,
//!                           oi-q-bounds-01, oi-exploration-01, oi-learning-01
//!   EDGE CASES       (13):  ec-zero-features-01/02, ec-action-0-01,
//!                           ec-action-39-01, ec-reward-negative-01,
//!                           ec-reward-zero-01, ec-reward-large-01,
//!                           ec-sequential-01/02, ec-feature-switch-01,
//!                           ec-matrix-inversion-01, ec-float-precision-01,
//!                           ec-batch-homogeneous-01
//!
//! ## Immutability contract
//!
//! These vectors are IMMUTABLE GROUND TRUTH.  Once committed, they define
//! GPU correctness forever.  Do NOT change expected values without a signed
//! review that proves the mathematical invariant is preserved.
//!
//! ## CPU Baseline
//!
//! All tests use `pictl::ml::LinUCBAgent` — the Agent 12 CPU reference.
//! The GPU parity gate (`#[cfg(feature = "gpu")]`) activates when Agent 11
//! completes the GPU kernel.
//!
//! ## Van der Aalst framing
//!
//! Perspective: Resource and Intervention (prediction framework §6).
//! Question: "Does the GPU kernel produce the same action recommendation
//!            as the CPU baseline for every possible context vector?"
//!
//! Acceptance criteria (from GPU_KERNEL_CONFORMANCE_SPEC):
//!   - `select_gpu(x) == select_cpu(x)`   for every vector
//!   - `|Q̂_gpu(a,x) - Q̂_cpu(a,x)| < 1e-3` for all actions a
//!   - All 25 vectors pass without `#[ignore]`
//!   - 100-run determinism confirmed on every vector

use pictl::ml::linucb::{LinUCBAgent, N_ACTIONS, N_FEATURES};

// ---------------------------------------------------------------------------
// Shared assertion helpers
// ---------------------------------------------------------------------------

/// Assert action is within [0, 39].
fn assert_action_in_range(action: u32, label: &str) {
    assert!(
        (action as usize) < N_ACTIONS,
        "[{label}] action {action} out of range [0, {N_ACTIONS})"
    );
}

/// Assert all Q values are finite (no NaN, no Inf).
fn assert_q_values_finite(qs: &[f32; N_ACTIONS], label: &str) {
    for (i, &q) in qs.iter().enumerate() {
        assert!(q.is_finite(), "[{label}] Q[{i}] = {q} is not finite");
    }
}

/// Assert the UCB exploration bonus is strictly positive for non-zero features.
///
/// Mathematical basis: A^{-1} is positive-definite (A = λI + Σ xx^T, always
/// PD), so x^T A^{-1} x > 0 for all x ≠ 0, and α > 0, giving bonus > 0.
fn assert_ucb_bonus_positive(agent: &LinUCBAgent, features: &[f32; N_FEATURES], label: &str) {
    let variance = agent.compute_ucb_variance(features);
    let bonus = agent.alpha * variance.max(0.0).sqrt();
    assert!(
        bonus > 0.0,
        "[{label}] UCB bonus must be > 0 for non-zero features: \
        got bonus={bonus} variance={variance} alpha={}",
        agent.alpha
    );
}

/// Run selection 100 times with independent fresh agents; assert all identical.
/// Returns the reference action.
fn assert_deterministic_100_runs(features: &[f32; N_FEATURES], label: &str) -> u32 {
    let (ref_action, ref_q) = LinUCBAgent::new().select(features);
    for run in 1..100 {
        let (action, q) = LinUCBAgent::new().select(features);
        assert_eq!(
            action, ref_action,
            "[{label}] run {run}: action {action} != {ref_action} (non-deterministic)"
        );
        assert!(
            (q - ref_q).abs() < 1e-5,
            "[{label}] run {run}: Q {q} != {ref_q} (non-deterministic)"
        );
    }
    ref_action
}

// ===========================================================================
// INPUT INVARIANTS (5 vectors)
//
// Verify that the specified normalized feature patterns produce structurally
// valid, finite, deterministic outputs without panics.
// ===========================================================================

/// iv-normalize-01: Alternating boundary values [0.0, 1.0, 0.0, 1.0, …]
///
/// Tests exact boundary representability (0.0 and 1.0 are exactly f32).
/// UCB variance = (1/λ)||x||² = (1/1.0)(0+1+0+1+0+1+0+1) = 4.0.
/// UCB bonus = α * √4 = √2 * 2 ≈ 2.828.
/// All Q values equal on fresh agent → action 0 (lowest-index tie-break).
#[test]
fn test_iv_normalize_01() {
    let label = "iv-normalize-01";
    let features: [f32; N_FEATURES] = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0];

    // Determinism: 100 independent fresh agents must all produce the same result
    let action = assert_deterministic_100_runs(&features, label);
    assert_action_in_range(action, label);

    let agent = LinUCBAgent::new();
    let qs = agent.get_q_values(&features);
    assert_q_values_finite(&qs, label);

    // Non-zero features → UCB bonus > 0
    assert_ucb_bonus_positive(&agent, &features, label);

    // All Q values equal on fresh agent (W=0, b=0, shared A_inv)
    let first_q = qs[0];
    for (i, &q) in qs.iter().enumerate() {
        assert!(
            (q - first_q).abs() < 1e-5,
            "[{label}] Q[{i}]={q} differs from Q[0]={first_q} on fresh agent"
        );
    }

    // Analytical UCB variance check: ||[0,1,0,1,0,1,0,1]||² = 4.0
    let variance = agent.compute_ucb_variance(&features);
    assert!(
        (variance - 4.0).abs() < 1e-4,
        "[{label}] x^T A^{{-1}} x = {variance}, expected 4.0"
    );

    // Tie-breaking: action 0 must be selected (lowest index)
    assert_eq!(action, 0, "[{label}] fresh agent tie must resolve to action 0");
}

/// iv-normalize-02: Uniform features [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
///
/// UCB variance = 8 * 0.5² = 2.0. UCB bonus = √2 * √2 = 2.0.
/// Fresh agent → action 0 (tie at Q = 0 + 2.0).
#[test]
fn test_iv_normalize_02() {
    let label = "iv-normalize-02";
    let features: [f32; N_FEATURES] = [0.5; N_FEATURES];

    let action = assert_deterministic_100_runs(&features, label);
    assert_action_in_range(action, label);

    let agent = LinUCBAgent::new();
    let qs = agent.get_q_values(&features);
    assert_q_values_finite(&qs, label);
    assert_ucb_bonus_positive(&agent, &features, label);

    // UCB variance = 8 * 0.25 = 2.0 for fresh agent (A_inv = I)
    let variance = agent.compute_ucb_variance(&features);
    assert!(
        (variance - 2.0).abs() < 1e-5,
        "[{label}] x^T A^{{-1}} x = {variance}, expected 2.0"
    );

    // UCB bonus = α * √2.0 = √2 * √2 = 2.0
    let bonus = agent.alpha * variance.sqrt();
    assert!(
        (bonus - 2.0).abs() < 1e-4,
        "[{label}] UCB bonus = {bonus}, expected ≈ 2.0"
    );

    // Fresh agent uniform features → action 0
    assert_eq!(action, 0, "[{label}] uniform features: fresh agent selects action 0");
}

/// iv-normalize-03: Mixed zero/one [0, 1, 0, 1, 0, 1, 0, 1]
///
/// Re-validates that alternating 0/1 inputs are handled without precision
/// loss.  Identical feature pattern to iv-normalize-01 but named separately
/// as the "mixed zero/one" invariant to document the semantic distinction
/// (alternating vs. mixed).  The analytical check confirms f32 can exactly
/// represent {0.0, 1.0}.
#[test]
fn test_iv_normalize_03() {
    let label = "iv-normalize-03";
    let features: [f32; N_FEATURES] = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0];

    let action = assert_deterministic_100_runs(&features, label);
    assert_action_in_range(action, label);

    let agent = LinUCBAgent::new();

    // Exact representation check: 0.0 and 1.0 are exact in f32
    // x^T A_inv x = Σ x_i² (with A_inv = I for fresh agent) = 4 * 1.0² = 4.0
    let variance = agent.compute_ucb_variance(&features);
    assert!(
        (variance - 4.0).abs() < 1e-4,
        "[{label}] x^T A^{{-1}} x = {variance}, expected 4.0 (exact f32 representation)"
    );

    let qs = agent.get_q_values(&features);
    assert_q_values_finite(&qs, label);
    assert_eq!(action, 0, "[{label}] mixed 0/1 features: fresh agent selects action 0");
}

/// iv-normalize-04: Extreme contrast [1e-6, 1.0, 1e-6, 1.0, 1e-6, 1.0, 1e-6, 1.0]
///
/// Tests numerical behavior with alternating near-zero and full-one values.
/// 1e-6 is above f32::EPSILON (≈ 1.19e-7) so no underflow.
/// Dominant term: 4 * 1.0² = 4.0 (the 1e-6 terms contribute ≈ 4e-12).
/// UCB variance ≈ 4.0 within tight tolerance.
#[test]
fn test_iv_normalize_04() {
    let label = "iv-normalize-04";
    let features: [f32; N_FEATURES] = [1e-6, 1.0, 1e-6, 1.0, 1e-6, 1.0, 1e-6, 1.0];

    let action = assert_deterministic_100_runs(&features, label);
    assert_action_in_range(action, label);

    let agent = LinUCBAgent::new();
    let qs = agent.get_q_values(&features);
    assert_q_values_finite(&qs, label);
    assert_ucb_bonus_positive(&agent, &features, label);

    // UCB variance ≈ 4 * 1.0² + 4 * (1e-6)² ≈ 4.0  (tight tolerance)
    let variance = agent.compute_ucb_variance(&features);
    assert!(
        variance > 3.999 && variance < 4.001,
        "[{label}] variance {variance} should be ≈ 4.0 (dominant 1.0 terms)"
    );
}

/// iv-normalize-05: All features identical [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
///
/// Identical to iv-normalize-02 by specification (both are "all 0.5").
/// Named separately as "all features identical" to document that the
/// agent correctly handles the degenerate case where all features carry
/// equal weight.  Confirms action 0 wins via lowest-index tie-break.
#[test]
fn test_iv_normalize_05() {
    let label = "iv-normalize-05";
    let features: [f32; N_FEATURES] = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

    let action = assert_deterministic_100_runs(&features, label);
    assert_action_in_range(action, label);

    let agent = LinUCBAgent::new();
    let qs = agent.get_q_values(&features);
    assert_q_values_finite(&qs, label);

    // All Q values must be identical (uniform features, fresh agent)
    let first_q = qs[0];
    for (i, &q) in qs.iter().enumerate() {
        assert!(
            (q - first_q).abs() < 1e-5,
            "[{label}] Q[{i}]={q} differs from Q[0]={first_q} (all features identical)"
        );
    }

    assert_eq!(action, 0, "[{label}] all-identical features: fresh agent selects action 0");
}

// ===========================================================================
// OUTPUT INVARIANTS (7 vectors)
//
// Properties that must hold for ANY valid agent output, regardless of input.
// ===========================================================================

/// oi-action-range-01: All 40 actions selectable (no stuck actions)
///
/// By targeting each action with 300 positive rewards through a unique
/// orthogonal feature vector, every action ∈ [0, 39] must become the argmax.
/// If any action is unreachable, the bandit has a structural defect.
#[test]
fn test_oi_action_range_01() {
    let label = "oi-action-range-01";
    let mut actions_seen = std::collections::HashSet::new();

    for target in 0..N_ACTIONS {
        let mut agent = LinUCBAgent::new();

        // Build a feature vector that makes `target` uniquely identifiable.
        // Primary dimension: target % 8; secondary (if target ≥ 8): adds 0.5
        // to a different dimension.  This provides enough context variety for
        // all 40 actions to be distinguishable after 300 updates.
        let mut features = [0.0_f32; N_FEATURES];
        let primary = target % N_FEATURES;
        features[primary] = 1.0;
        if target >= N_FEATURES {
            let secondary = (target / N_FEATURES) % N_FEATURES;
            if secondary != primary {
                features[secondary] = 0.5;
            } else {
                // Ensure the secondary is always a different dimension
                features[(secondary + 1) % N_FEATURES] = 0.5;
            }
        }

        for _ in 0..300 {
            agent.update(&features, target as u32, 1.0);
        }

        let (selected, _) = agent.select(&features);
        assert_eq!(
            selected as usize, target,
            "[{label}] action {target} must be selectable after 300 positive rewards, got {selected}"
        );
        actions_seen.insert(selected as usize);
    }

    assert_eq!(
        actions_seen.len(),
        N_ACTIONS,
        "[{label}] all {N_ACTIONS} actions must be selectable, saw {}",
        actions_seen.len()
    );
}

/// oi-action-range-02: Highest Q action always ∈ [0, 39]
///
/// The type contract: `select()` must always return a u32 in bounds.
/// Tested over diverse feature patterns and agent states.
#[test]
fn test_oi_action_range_02() {
    let label = "oi-action-range-02";

    let test_cases: &[([f32; N_FEATURES], u32, f32)] = &[
        // (features, action_to_update, reward)
        ([0.0; N_FEATURES], 0, 0.0),
        ([1.0; N_FEATURES], 39, 1.0),
        ([0.5; N_FEATURES], 20, 0.5),
        ([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], 7, 0.8),
        ([0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2], 15, -0.3),
        ([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 0, 1.0),
        ([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0], 39, 1.0),
        ([1e-6, 0.5, 1.0, 0.25, 0.75, 0.125, 0.875, 0.333], 5, 0.6),
    ];

    for (i, &(features, action, reward)) in test_cases.iter().enumerate() {
        let mut agent = LinUCBAgent::new();
        agent.update(&features, action, reward);
        let (selected, q) = agent.select(&features);
        assert!(
            (selected as usize) < N_ACTIONS,
            "[{label}] case {i}: action {selected} out of [0, {N_ACTIONS})"
        );
        assert!(
            q.is_finite(),
            "[{label}] case {i}: Q = {q} is not finite"
        );
    }
}

/// oi-determinism-01: Same features → same action (no RNG)
///
/// Two independent agents with identical update histories must produce
/// bit-identical results for the same features.  This is the fundamental
/// determinism contract.
#[test]
fn test_oi_determinism_01() {
    let label = "oi-determinism-01";
    let features: [f32; N_FEATURES] = [0.1, 0.9, 0.3, 0.7, 0.5, 0.5, 0.2, 0.8];

    let update_seq: &[([f32; N_FEATURES], u32, f32)] = &[
        ([0.5; N_FEATURES], 3, 1.0),
        ([0.1, 0.9, 0.3, 0.7, 0.5, 0.5, 0.2, 0.8], 7, 0.5),
        ([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 15, 0.8),
    ];

    let mut agent_a = LinUCBAgent::new();
    let mut agent_b = LinUCBAgent::new();

    for &(f, a, r) in update_seq {
        agent_a.update(&f, a, r);
        agent_b.update(&f, a, r);
    }

    let (action_a, q_a) = agent_a.select(&features);
    let (action_b, q_b) = agent_b.select(&features);

    assert_eq!(
        action_a, action_b,
        "[{label}] same update history → same action: {action_a} vs {action_b}"
    );
    assert!(
        (q_a - q_b).abs() < 1e-6,
        "[{label}] same update history → same Q: {q_a} vs {q_b}"
    );
}

/// oi-determinism-02: Same features, 100 runs → all identical (hash-based check)
///
/// 100 independent agents with the same update sequence must produce
/// identical (action, Q) pairs.  This catches non-determinism from any
/// source: uninitialized memory, time-dependent values, global state.
#[test]
fn test_oi_determinism_02() {
    let label = "oi-determinism-02";
    let features: [f32; N_FEATURES] = [0.3, 0.6, 0.1, 0.9, 0.4, 0.7, 0.2, 0.8];

    let update_seq: &[([f32; N_FEATURES], u32, f32)] = &[
        ([0.5; N_FEATURES], 5, 1.0),
        ([0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.1, 0.9], 12, 0.7),
    ];

    // Reference run
    let mut ref_agent = LinUCBAgent::new();
    for &(f, a, r) in update_seq {
        ref_agent.update(&f, a, r);
    }
    let (ref_action, ref_q) = ref_agent.select(&features);
    assert_action_in_range(ref_action, label);

    // 99 additional independent runs
    for run in 1..100 {
        let mut agent = LinUCBAgent::new();
        for &(f, a, r) in update_seq {
            agent.update(&f, a, r);
        }
        let (action, q) = agent.select(&features);
        assert_eq!(
            action, ref_action,
            "[{label}] run {run}: action {action} != reference {ref_action}"
        );
        assert!(
            (q - ref_q).abs() < 1e-5,
            "[{label}] run {run}: Q {q} != reference {ref_q}"
        );
    }
}

/// oi-q-bounds-01: All Q̂ values finite (no NaN/Inf)
///
/// After an extreme update sequence (large rewards, varied features),
/// all Q values must remain finite.  Covers the range of physically
/// plausible rewards in the process mining domain.
#[test]
fn test_oi_q_bounds_01() {
    let label = "oi-q-bounds-01";
    let mut agent = LinUCBAgent::new();

    // Stress with extremes: large positive, zero, negative, and very large
    let extremes: &[([f32; N_FEATURES], u32, f32)] = &[
        ([1.0; N_FEATURES], 0, 1000.0),
        ([0.0; N_FEATURES], 1, 0.0),
        ([0.5; N_FEATURES], 2, -10.0),
        ([1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0], 39, 500.0),
        ([0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0], 20, -500.0),
    ];
    for &(f, a, r) in extremes {
        agent.update(&f, a, r);
    }

    // Q values must be finite for diverse feature patterns
    let test_features: &[[f32; N_FEATURES]] = &[
        [0.5; N_FEATURES],
        [0.0; N_FEATURES],
        [1.0; N_FEATURES],
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    ];
    for (case_idx, features) in test_features.iter().enumerate() {
        let qs = agent.get_q_values(features);
        assert_q_values_finite(&qs, label);
        let (action, q) = agent.select(features);
        assert_action_in_range(action, label);
        assert!(
            q.is_finite(),
            "[{label}] case {case_idx}: best Q = {q} is not finite"
        );
    }
}

/// oi-exploration-01: UCB bonus α√(x^T A^{-1} x) > 0 for non-zero features
///
/// Mathematical invariant based on positive-definiteness of A:
///   - A = λI + Σ x_t x_t^T  (always PD)
///   - A^{-1} is PD (inverse of PD matrix)
///   - x ≠ 0 → x^T A^{-1} x > 0
///   - α = √2 > 0
///   → UCB bonus > 0 for all non-zero x
///
/// Also confirms: zero features → zero bonus (x=0 → x^T A^{-1} x = 0).
#[test]
fn test_oi_exploration_01() {
    let label = "oi-exploration-01";

    let non_zero: &[[f32; N_FEATURES]] = &[
        [0.5; N_FEATURES],
        [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        [1e-6, 1.0, 1e-6, 1.0, 1e-6, 1.0, 1e-6, 1.0],
        [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0],
    ];

    let agent = LinUCBAgent::new();
    for (i, features) in non_zero.iter().enumerate() {
        let variance = agent.compute_ucb_variance(features);
        let bonus = agent.alpha * variance.max(0.0).sqrt();
        assert!(
            bonus > 0.0,
            "[{label}] case {i}: UCB bonus {bonus} must be > 0 for non-zero x \
            (variance={variance}, alpha={})",
            agent.alpha
        );
    }

    // Zero features → zero bonus
    let zero: [f32; N_FEATURES] = [0.0; N_FEATURES];
    let var_zero = agent.compute_ucb_variance(&zero);
    let bonus_zero = agent.alpha * var_zero.max(0.0).sqrt();
    assert!(
        bonus_zero.abs() < 1e-7,
        "[{label}] zero features must give zero bonus, got {bonus_zero}"
    );
}

/// oi-learning-01: update(reward=1.0) shifts argmax; update(reward=0.0) shrinks UCB variance
///
/// The LinUCBAgent uses a **shared covariance matrix A** (not per-action).
/// This means: after N updates, the UCB exploration bonus shrinks for ALL
/// actions because A accumulates x x^T regardless of which action is chosen.
///
/// Two-part learning invariant:
///
/// Part A — reward=1.0 drives argmax:  After 500 positive updates for action 7
///   with distinctive features, action 7 must become the argmax.  This confirms
///   the linear term W[7]·x + b[7] eventually dominates the UCB bonus term.
///   (500 steps needed because uniform features give slow gradient signal.)
///
/// Part B — reward=0.0 shrinks UCB variance:  With W=0, b=0: δ = 0 → no weight
///   change.  However A still grows (x x^T accumulated), so the UCB variance
///   term x^T A^{-1} x strictly decreases after each zero-reward update.
///   After 50 zero-reward updates, variance must be < fresh variance.
#[test]
fn test_oi_learning_01() {
    let label = "oi-learning-01";

    // Part A: reward=1.0 must drive action 7 to argmax after 500 updates.
    // Use distinctive (non-uniform) features so gradient signal is clear.
    let features_a: [f32; N_FEATURES] = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6];
    let action = 7_u32;

    let mut agent_pos = LinUCBAgent::new();
    for _ in 0..500 {
        agent_pos.update(&features_a, action, 1.0);
    }
    let (argmax, _q) = agent_pos.select(&features_a);
    assert_eq!(
        argmax, action,
        "[{label}] Part A: after 500 positive updates, action {action} must be argmax, got {argmax}"
    );

    // Confirm W[7] has grown significantly (positive gradient applied)
    let w7_sum: f32 = agent_pos.weight_vector(action as usize).iter().sum();
    assert!(
        w7_sum > 0.0,
        "[{label}] Part A: W[7] must have positive sum after positive rewards, got {w7_sum}"
    );

    // Part B: reward=0.0 must shrink UCB variance (A grows, A_inv shrinks).
    let features_b: [f32; N_FEATURES] = [0.5; N_FEATURES];
    let var_fresh = LinUCBAgent::new().compute_ucb_variance(&features_b);

    let mut agent_zero = LinUCBAgent::new();
    for _ in 0..50 {
        agent_zero.update(&features_b, 5, 0.0);
    }
    let var_after_zero = agent_zero.compute_ucb_variance(&features_b);
    assert!(
        var_after_zero < var_fresh,
        "[{label}] Part B: UCB variance after 50 zero-reward updates ({var_after_zero}) \
        must be < fresh variance ({var_fresh})"
    );

    // W[5] must not have changed (δ=0, no gradient)
    let w5_sum: f32 = agent_zero.weight_vector(5).iter().sum();
    assert!(
        w5_sum.abs() < 1e-6,
        "[{label}] Part B: W[5] must remain 0 after zero-reward updates, got sum={w5_sum}"
    );
}

// ===========================================================================
// EDGE CASES (13 vectors)
// ===========================================================================

/// ec-zero-features-01: All features = 0
///
/// Zero vector collapses the UCB exploration bonus to 0.
/// All Q values = 0 (W=0, b=0, bonus=0).
/// Action 0 must be selected (lowest-index tie at Q=0).
#[test]
fn test_ec_zero_features_01() {
    let label = "ec-zero-features-01";
    let features = [0.0_f32; N_FEATURES];

    let agent = LinUCBAgent::new();
    let (action, q) = agent.select(&features);

    assert_action_in_range(action, label);
    assert!(q.is_finite(), "[{label}] Q must be finite for zero features");
    assert!(q.abs() < 1e-6, "[{label}] Q = {q} for zero features (expected 0.0)");

    // All Q values must be exactly zero
    let qs = agent.get_q_values(&features);
    for (i, &qi) in qs.iter().enumerate() {
        assert!(qi.abs() < 1e-6, "[{label}] Q[{i}] = {qi} (expected 0.0)");
    }

    // Tie-breaking: action 0 must be selected
    assert_eq!(action, 0, "[{label}] all Q=0 → action 0 via lowest-index tie-break");

    // Determinism: 100 runs all return action 0
    let det_action = assert_deterministic_100_runs(&features, label);
    assert_eq!(det_action, 0, "[{label}] determinism: must always select action 0");
}

/// ec-zero-features-02: Select on zero features, then update on non-zero features
///
/// A zero-feature selection followed by a non-zero update must not corrupt
/// agent state.  A_inv diagonal must remain positive (PD preserved).
#[test]
fn test_ec_zero_features_02() {
    let label = "ec-zero-features-02";
    let zero_f = [0.0_f32; N_FEATURES];
    let nonzero_f: [f32; N_FEATURES] = [0.5; N_FEATURES];

    let mut agent = LinUCBAgent::new();

    // Step 1: Select on zero features (valid, returns action 0)
    let (action_from_zero, _) = agent.select(&zero_f);
    assert_action_in_range(action_from_zero, label);

    // Step 2: Update on non-zero features for the selected action
    agent.update(&nonzero_f, action_from_zero, 1.0);

    // Step 3: Q values must be finite for both feature vectors
    assert_q_values_finite(&agent.get_q_values(&zero_f), label);
    assert_q_values_finite(&agent.get_q_values(&nonzero_f), label);

    // Step 4: A_inv diagonal must be positive (PD invariant)
    let a_inv = agent.inverse_covariance();
    for i in 0..N_FEATURES {
        assert!(
            a_inv[i][i] > 0.0,
            "[{label}] A_inv[{i}][{i}] = {} must be positive after update", a_inv[i][i]
        );
    }
}

/// ec-action-0-01: Select action 0 (first action)
///
/// Action 0 is the default tie-breaking winner on fresh agents.
/// After 100 positive updates, action 0's weight vector W[0] must be
/// positive (gradient accumulated) and action 0 must remain the argmax.
///
/// Note on Q value monotonicity: the LinUCBAgent uses a **shared** A matrix,
/// so the UCB bonus term shrinks for ALL actions after each update, regardless
/// of which action is targeted.  Early updates may cause the net Q to decrease
/// (shrinking bonus outpaces growing linear term).  After sufficient updates,
/// the linear term W[0]·x dominates and Q recovers above the fresh value.
/// We test the final stable state (argmax) rather than the monotonic path.
#[test]
fn test_ec_action_0_01() {
    let label = "ec-action-0-01";
    let features: [f32; N_FEATURES] = [0.5; N_FEATURES];

    let agent_fresh = LinUCBAgent::new();

    // Fresh agent must select action 0
    let (initial, _) = agent_fresh.select(&features);
    assert_eq!(initial, 0, "[{label}] fresh agent must select action 0 (tie at Q=uniform)");

    // After 100 positive updates for action 0, W[0] must be non-trivial
    let mut agent = LinUCBAgent::new();
    for _ in 0..100 {
        agent.update(&features, 0, 1.0);
    }

    let w0 = agent.weight_vector(0);
    let w0_sum: f32 = w0.iter().sum();
    assert!(w0_sum > 0.0, "[{label}] W[0] sum must be > 0 after 100 positive updates, got {w0_sum}");

    // W[0] must be strictly positive component-wise (uniform features, positive gradient)
    for (j, &wj) in w0.iter().enumerate() {
        assert!(wj > 0.0, "[{label}] W[0][{j}] = {wj} must be > 0 after 100 positive updates");
    }

    // After 100 positive updates for action 0, it must remain the argmax
    let (argmax, _) = agent.select(&features);
    assert_eq!(argmax, 0, "[{label}] action 0 must be argmax after 100 positive updates, got {argmax}");

    // Q values must be finite
    let qs = agent.get_q_values(&features);
    for (i, &q) in qs.iter().enumerate() {
        assert!(q.is_finite(), "[{label}] Q[{i}] = {q} must be finite");
    }
}

/// ec-action-39-01: Select action 39 (last action)
///
/// Boundary: action index 39 = N_ACTIONS - 1.  After 500 targeted updates,
/// action 39 must become the argmax.  Its weight vector must be non-trivial.
#[test]
fn test_ec_action_39_01() {
    let label = "ec-action-39-01";
    let features: [f32; N_FEATURES] = [0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4];

    let mut agent = LinUCBAgent::new();
    for _ in 0..500 {
        agent.update(&features, 39, 1.0);
    }

    let (action, q) = agent.select(&features);
    assert_action_in_range(action, label);
    assert!(q.is_finite(), "[{label}] Q must be finite");
    assert_eq!(action, 39, "[{label}] after 500 positive rewards, action 39 must be argmax, got {action}");

    // W[39] must have positive components
    let w39_max = agent.weight_vector(39).iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    assert!(w39_max > 0.0, "[{label}] W[39] max component must be > 0");
}

/// ec-reward-negative-01: Update with negative reward
///
/// Negative rewards (penalty signals) are physically valid.
/// They cause δ = r - (w·x + b) < 0, so W decreases (negative gradient).
/// The penalized action must NOT be the argmax after 50 negative updates.
#[test]
fn test_ec_reward_negative_01() {
    let label = "ec-reward-negative-01";
    let features: [f32; N_FEATURES] = [0.5; N_FEATURES];
    let action = 10_u32;

    let mut agent = LinUCBAgent::new();
    let q_before = agent.get_q_values(&features)[action as usize];

    for _ in 0..50 {
        agent.update(&features, action, -1.0);
    }

    let qs = agent.get_q_values(&features);
    assert_q_values_finite(&qs, label);

    let q_after = qs[action as usize];
    assert!(
        q_after < q_before,
        "[{label}] Q[{action}] must decrease after negative rewards: {q_before} → {q_after}"
    );

    let (selected, best_q) = agent.select(&features);
    assert_action_in_range(selected, label);
    assert!(best_q.is_finite(), "[{label}] best Q = {best_q} must be finite");

    // Negatively-reinforced action must not win
    assert_ne!(
        selected, action,
        "[{label}] negatively-reinforced action {action} must not be selected"
    );
}

/// ec-reward-zero-01: Update with reward = 0.0
///
/// With W=0, b=0: δ = 0.0 - 0.0 = 0 → weights unchanged.
/// However A is still updated (x x^T accumulated), so A_inv shrinks,
/// reducing the UCB variance term.
#[test]
fn test_ec_reward_zero_01() {
    let label = "ec-reward-zero-01";
    let features: [f32; N_FEATURES] = [0.5; N_FEATURES];
    let action = 5_u32;

    let mut agent = LinUCBAgent::new();
    let w_before = agent.weight_vector(action as usize);
    let intercept_before = agent.intercept(action as usize);

    agent.update(&features, action, 0.0);

    // Weights and intercept must be unchanged (δ = 0 → no gradient)
    let w_after = agent.weight_vector(action as usize);
    let intercept_after = agent.intercept(action as usize);
    for (j, (&wb, &wa)) in w_before.iter().zip(w_after.iter()).enumerate() {
        assert!(
            (wa - wb).abs() < 1e-7,
            "[{label}] W[{action}][{j}] changed after zero-reward update: {wb} → {wa}"
        );
    }
    assert!(
        (intercept_after - intercept_before).abs() < 1e-7,
        "[{label}] intercept changed after zero-reward update"
    );

    // A_inv must have shrunk (Sherman-Morrison applied, UCB variance decreases)
    let fresh_var = LinUCBAgent::new().compute_ucb_variance(&features);
    let after_var = agent.compute_ucb_variance(&features);
    assert!(
        after_var < fresh_var,
        "[{label}] UCB variance must decrease after zero-reward update \
        (A grows, A_inv shrinks): {fresh_var} → {after_var}"
    );

    // Q values remain finite
    assert_q_values_finite(&agent.get_q_values(&features), label);
}

/// ec-reward-large-01: Update with reward = 1e6 (extreme value)
///
/// Large rewards must not cause NaN or Inf.
/// After update: δ = 1e6 - 0 = 1e6; W[action] += 0.1 * 1e6 * features = 5e4 * features.
/// These values are large but finite in f32 (f32::MAX ≈ 3.4e38).
/// Action 20 must become the argmax.
#[test]
fn test_ec_reward_large_01() {
    let label = "ec-reward-large-01";
    let features: [f32; N_FEATURES] = [0.5; N_FEATURES];
    let action = 20_u32;

    let mut agent = LinUCBAgent::new();
    agent.update(&features, action, 1e6);

    let qs = agent.get_q_values(&features);
    assert_q_values_finite(&qs, label);

    let (selected, best_q) = agent.select(&features);
    assert_action_in_range(selected, label);
    assert!(best_q.is_finite(), "[{label}] best Q = {best_q} must be finite after reward=1e6");
    assert_eq!(selected, action, "[{label}] action {action} should be argmax after reward=1e6, got {selected}");

    // W[20] must be finite and positive
    for (j, &wj) in agent.weight_vector(action as usize).iter().enumerate() {
        assert!(wj.is_finite(), "[{label}] W[{action}][{j}] = {wj} is not finite");
        assert!(wj > 0.0, "[{label}] W[{action}][{j}] = {wj} must be > 0 after large positive reward");
    }
}

/// ec-sequential-01: 10 sequential selects (idempotency of select)
///
/// `select()` is a read-only operation (`&self`).  On a fresh agent with
/// uniform features, 10 consecutive calls must all return action 0.
/// The Q score must remain constant across calls (no hidden mutation).
#[test]
fn test_ec_sequential_01() {
    let label = "ec-sequential-01";
    let features: [f32; N_FEATURES] = [0.5; N_FEATURES];

    let agent = LinUCBAgent::new();
    let (first_action, first_q) = agent.select(&features);
    assert_eq!(first_action, 0, "[{label}] first select: expected action 0 on fresh agent");

    for i in 1..10 {
        let (action, q) = agent.select(&features);
        assert_eq!(
            action, first_action,
            "[{label}] select #{i}: action {action} != {first_action} (select must be idempotent)"
        );
        assert!(
            (q - first_q).abs() < 1e-6,
            "[{label}] select #{i}: Q {q} != {first_q} (must be stable)"
        );
    }
}

/// ec-sequential-02: 10 sequential updates (A matrix evolution)
///
/// After each update, the UCB variance must decrease monotonically
/// (A grows → A_inv shrinks → smaller exploration bonus).
/// After 10 updates with features=[1,0,...,0]:
///   A[0][0] = λ + 10 = 11 → A_inv[0][0] ≈ 1/11 ≈ 0.0909
/// This is a factor ~11x smaller than the initial 1/λ = 1.0.
#[test]
fn test_ec_sequential_02() {
    let label = "ec-sequential-02";
    let features: [f32; N_FEATURES] = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

    let var_initial = LinUCBAgent::new().compute_ucb_variance(&features);

    let mut agent = LinUCBAgent::new();
    let mut prev_var = var_initial;

    for step in 0..10 {
        agent.update(&features, 0, 1.0);
        let var_after = agent.compute_ucb_variance(&features);

        assert!(
            var_after < prev_var,
            "[{label}] step {step}: variance {var_after} must be < previous {prev_var} \
            (A grows monotonically)"
        );
        assert_q_values_finite(&agent.get_q_values(&features), label);
        prev_var = var_after;
    }

    // After 10 updates: A[0][0] = 1 + 10 = 11 → A_inv[0][0] ≈ 1/11
    let a_inv = agent.inverse_covariance();
    assert!(
        a_inv[0][0] < 0.5,
        "[{label}] A_inv[0][0] = {} should be ~1/11 ≈ 0.0909 after 10 updates",
        a_inv[0][0]
    );
    // Tight range: Sherman-Morrison should give close to 1/11
    assert!(
        a_inv[0][0] > 0.05 && a_inv[0][0] < 0.15,
        "[{label}] A_inv[0][0] = {} (expected near 1/11 ≈ 0.0909)",
        a_inv[0][0]
    );
}

/// ec-feature-switch-01: Select(features1), then select(features2 ≠ features1)
///
/// After training action 3 on features1 and action 15 on features2,
/// the agent must select contextually-appropriate actions.
/// This verifies the LinUCB disjoint model correctly exploits per-action
/// weight vectors trained on different contexts.
#[test]
fn test_ec_feature_switch_01() {
    let label = "ec-feature-switch-01";
    let f1: [f32; N_FEATURES] = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    let f2: [f32; N_FEATURES] = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

    let mut agent = LinUCBAgent::new();
    for _ in 0..300 {
        agent.update(&f1, 3, 1.0);
        agent.update(&f2, 15, 1.0);
    }

    let (action1, _) = agent.select(&f1);
    let (action2, _) = agent.select(&f2);

    assert_action_in_range(action1, label);
    assert_action_in_range(action2, label);
    assert_eq!(action1, 3, "[{label}] f1 → expected action 3, got {action1}");
    assert_eq!(action2, 15, "[{label}] f2 → expected action 15, got {action2}");
    assert_ne!(action1, action2, "[{label}] different features must yield different actions");
}

/// ec-matrix-inversion-01: A_inv remains valid after 100 updates
///
/// After 100 diverse updates, the Sherman-Morrison A_inv approximation
/// must remain consistent with A: A * A_inv ≈ I within f32 tolerance.
/// Tolerance 0.05 (f32 arithmetic accumulates rounding over 100 steps).
#[test]
fn test_ec_matrix_inversion_01() {
    let label = "ec-matrix-inversion-01";
    let mut agent = LinUCBAgent::new();

    for step in 0_u32..100 {
        let t = step as f32 / 100.0;
        let features: [f32; N_FEATURES] = [
            t,
            1.0 - t,
            (t * 2.0).min(1.0),
            (1.0 - t * 2.0).max(0.0),
            t * 0.5,
            (1.0 - t) * 0.5,
            t * t,
            (1.0 - t) * (1.0 - t),
        ];
        let action = (step % N_ACTIONS as u32) as u32;
        let reward = if step % 2 == 0 { 1.0 } else { -1.0 };
        agent.update(&features, action, reward);
    }

    let a = agent.covariance_matrix();
    let a_inv = agent.inverse_covariance();

    // Compute A * A_inv
    let mut product = [[0.0_f32; N_FEATURES]; N_FEATURES];
    for i in 0..N_FEATURES {
        for k in 0..N_FEATURES {
            for j in 0..N_FEATURES {
                product[i][j] += a[i][k] * a_inv[k][j];
            }
        }
    }

    // Diagonal ≈ 1, off-diagonal ≈ 0 (tolerance 0.05 for f32 Sherman-Morrison over 100 steps)
    let tol = 0.05_f32;
    for i in 0..N_FEATURES {
        for j in 0..N_FEATURES {
            let expected = if i == j { 1.0_f32 } else { 0.0_f32 };
            assert!(
                (product[i][j] - expected).abs() < tol,
                "[{label}] A*A_inv[{i}][{j}] = {} (expected {expected}, tol {tol})",
                product[i][j]
            );
        }
    }

    // Q values must still be finite after all this
    let test_f: [f32; N_FEATURES] = [0.5; N_FEATURES];
    assert_q_values_finite(&agent.get_q_values(&test_f), label);
}

/// ec-float-precision-01: f32 inputs — exact UCB variance for known vectors
///
/// For a fresh agent (A_inv = I, λ=1.0):
///   x^T A^{-1} x = x^T I x = ||x||²
///
/// We verify this algebraic identity holds within 1e-5 for known vectors
/// whose norms are exactly representable in f32.  This validates that f32
/// arithmetic in the UCB computation does not introduce systematic error
/// beyond the expected single-precision rounding.
#[test]
fn test_ec_float_precision_01() {
    let label = "ec-float-precision-01";

    // (features, expected ||x||²)
    let cases: &[([f32; N_FEATURES], f32)] = &[
        ([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 1.0),
        ([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0], 1.0),
        ([0.5; N_FEATURES], 2.0),                                // 8 × 0.25 = 2.0
        ([1.0; N_FEATURES], 8.0),                                // 8 × 1.0 = 8.0
        ([0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0], 4.0),       // 4 × 1.0 = 4.0
        ([0.5, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 0.5),        // 2 × 0.25 = 0.5
    ];

    let agent = LinUCBAgent::new();
    for (i, (features, expected)) in cases.iter().enumerate() {
        let variance = agent.compute_ucb_variance(features);
        assert!(
            (variance - expected).abs() < 1e-5,
            "[{label}] case {i}: x^T A^{{-1}} x = {variance}, expected {expected} \
            (diff = {})",
            (variance - expected).abs()
        );
    }
}

/// ec-batch-homogeneous-01: 2048 identical features in batch (cache behavior)
///
/// `select()` is pure (`&self`) — no state mutation.  2048 identical calls
/// must all return the same result.  After batch inference, one update
/// must leave the agent in a valid state with finite Q values.
#[test]
fn test_ec_batch_homogeneous_01() {
    let label = "ec-batch-homogeneous-01";
    let features: [f32; N_FEATURES] = [0.5; N_FEATURES];

    let agent = LinUCBAgent::new();
    let (ref_action, ref_q) = agent.select(&features);
    assert_action_in_range(ref_action, label);

    // 2048 identical selects
    for i in 0..2048_usize {
        let (action, q) = agent.select(&features);
        assert_eq!(
            action, ref_action,
            "[{label}] batch item {i}: action {action} != {ref_action}"
        );
        assert!(
            (q - ref_q).abs() < 1e-6,
            "[{label}] batch item {i}: Q {q} != {ref_q}"
        );
    }

    // Post-batch: update once, verify state is valid
    let mut agent_post = LinUCBAgent::new();
    // (2048 selects don't mutate, so the above loop was on the immutable agent)
    agent_post.update(&features, ref_action, 1.0);

    assert_q_values_finite(&agent_post.get_q_values(&features), label);
    let (action_post, q_post) = agent_post.select(&features);
    assert_action_in_range(action_post, label);
    assert!(q_post.is_finite(), "[{label}] Q after post-batch update must be finite");
}

// ===========================================================================
// GPU Parity Gate
//
// Activates when `--features gpu` is set (Agent 11's GPU kernel).
// The structure is final; only the GPU import and assertion lines need
// to be uncommented when the `pictl::gpu::LinUCBGPU` type is available.
// ===========================================================================

/// GPU parity: for every conformance vector, CPU and GPU must agree.
///
/// Feature gate: `gpu` (disabled until Agent 11 delivers the kernel).
/// When enabled:
///   1. Builds CPU agent with each vector's update sequence
///   2. Builds GPU kernel with the same state
///   3. Asserts `select_gpu(x) == select_cpu(x)`
///   4. Asserts `|Q̂_gpu(a, x) - Q̂_cpu(a, x)| < 1e-3` for all 40 actions
#[cfg(feature = "gpu")]
mod gpu_parity {
    use pictl::ml::linucb::{LinUCBAgent, N_ACTIONS, N_FEATURES};
    // use pictl::gpu::LinUCBGPU;   // Agent 11 — uncomment when ready

    /// The 25 conformance vectors as (id, features, optional_update).
    ///
    /// optional_update = Some((action_index, reward)) applies one update
    /// before the parity check.
    const VECTORS: &[(&str, [f32; N_FEATURES], Option<(u32, f32)>)] = &[
        ("iv-normalize-01", [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0], None),
        ("iv-normalize-02", [0.5; N_FEATURES], None),
        ("iv-normalize-03", [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0], None),
        ("iv-normalize-04", [1e-6, 1.0, 1e-6, 1.0, 1e-6, 1.0, 1e-6, 1.0], None),
        ("iv-normalize-05", [0.5; N_FEATURES], None),
        ("oi-action-range-01", [0.5; N_FEATURES], Some((5, 1.0))),
        ("oi-action-range-02", [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], Some((3, 0.5))),
        ("oi-determinism-01", [0.1, 0.9, 0.3, 0.7, 0.5, 0.5, 0.2, 0.8], Some((7, 0.5))),
        ("oi-determinism-02", [0.3, 0.6, 0.1, 0.9, 0.4, 0.7, 0.2, 0.8], Some((5, 1.0))),
        ("oi-q-bounds-01", [0.5; N_FEATURES], Some((0, 1000.0))),
        ("oi-exploration-01", [0.5; N_FEATURES], None),
        ("oi-learning-01", [0.5; N_FEATURES], Some((7, 1.0))),
        ("ec-zero-features-01", [0.0; N_FEATURES], None),
        ("ec-zero-features-02", [0.5; N_FEATURES], Some((0, 1.0))),
        ("ec-action-0-01", [0.5; N_FEATURES], Some((0, 1.0))),
        ("ec-action-39-01", [0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4], Some((39, 1.0))),
        ("ec-reward-negative-01", [0.5; N_FEATURES], Some((10, -1.0))),
        ("ec-reward-zero-01", [0.5; N_FEATURES], Some((5, 0.0))),
        ("ec-reward-large-01", [0.5; N_FEATURES], Some((20, 1e6))),
        ("ec-sequential-01", [0.5; N_FEATURES], None),
        ("ec-sequential-02", [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], Some((0, 1.0))),
        ("ec-feature-switch-01", [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], Some((3, 1.0))),
        ("ec-matrix-inversion-01", [0.5; N_FEATURES], Some((0, 1.0))),
        ("ec-float-precision-01", [0.5; N_FEATURES], None),
        ("ec-batch-homogeneous-01", [0.5; N_FEATURES], None),
    ];

    #[test]
    fn test_gpu_parity_all_25_vectors() {
        assert_eq!(VECTORS.len(), 25, "Must have exactly 25 conformance vectors");

        for (id, features, update) in VECTORS {
            // Build CPU agent
            let mut cpu_agent = LinUCBAgent::new();
            if let Some((action, reward)) = update {
                cpu_agent.update(features, *action, *reward);
            }
            let (cpu_action, _cpu_q) = cpu_agent.select(features);
            let cpu_qs = cpu_agent.get_q_values(features);

            // ----------------------------------------------------------------
            // GPU kernel (uncomment when Agent 11 delivers pictl::gpu::LinUCBGPU)
            // ----------------------------------------------------------------
            // let mut gpu_agent = LinUCBGPU::new().expect("GPU kernel init");
            // if let Some((action, reward)) = update {
            //     gpu_agent.update(features, *action, *reward);
            // }
            // let (gpu_action, _gpu_q) = gpu_agent.select(features).expect("GPU select");
            // let gpu_qs = gpu_agent.get_q_values(features).expect("GPU Q values");
            //
            // // Action parity
            // assert_eq!(
            //     cpu_action, gpu_action,
            //     "Parity mismatch on {id}: CPU={cpu_action} GPU={gpu_action}"
            // );
            // // Q value parity (all 40 actions)
            // for (a, (&cq, &gq)) in cpu_qs.iter().zip(gpu_qs.iter()).enumerate() {
            //     assert!(
            //         (cq - gq).abs() < 1e-3,
            //         "Q parity mismatch on {id} action {a}: CPU={cq} GPU={gq}"
            //     );
            // }
            // ----------------------------------------------------------------

            // Stub: until GPU is ready, at least verify CPU is sane
            assert!(
                (cpu_action as usize) < N_ACTIONS,
                "[GPU stub] {id}: CPU action {cpu_action} out of range"
            );
            for (a, &q) in cpu_qs.iter().enumerate() {
                assert!(q.is_finite(), "[GPU stub] {id}: CPU Q[{a}] = {q} not finite");
            }
        }
    }
}
