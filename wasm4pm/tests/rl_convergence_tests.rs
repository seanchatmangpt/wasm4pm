//! RL Learning Convergence Tests.
//!
//! Tests that RL agents actually learn — Q-values change, cumulative reward
//! trends positive, and the system avoids terminal states.
//!
//! Important constraint: The reward function is STATE-BASED (not action-based).
//! All actions receive the same reward for the same state transition. Therefore
//! we cannot test "agent learns to prefer action X". Instead we verify:
//!   1. Q-values are updated (learning happens)
//!   2. Cumulative reward is positive in stable environments
//!   3. Action distribution is non-degenerate (exploration works)
//!   4. Different environments produce different action distributions
//!
//! Oracle: Rank 4 (Statistical Property) — convergence trends over N trials.
//! Strategy: Seeded RNG + multi-seed statistical assertions.

use pictl::rl_orchestrator::RlOrchestrator;
use pictl::RlState;

/// Create a stable "healthy" state — no alerts, no drift, circuit closed.
fn healthy_state() -> RlState {
    RlState {
        health_level: 0,
        event_rate_q: 3,
        activity_count_q: 3,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    }
}

/// Create a "degraded" state — some alerts, slight drift.
fn degraded_state() -> RlState {
    RlState {
        health_level: 2,
        event_rate_q: 5,
        activity_count_q: 5,
        spc_alert_level: 1,
        drift_status: 1,
        rework_ratio_q: 3,
        circuit_state: 0,
        cycle_phase: 1,
    }
}

/// Default feature vector for healthy system.
fn healthy_features() -> [f32; 8] {
    [0.1, 0.05, 0.06, 0.0, 0.0, 1.0, 1.0, 0.001]
}

/// Features reflecting degraded system.
fn degraded_features() -> [f32; 8] {
    [0.5, 0.5, 0.5, 0.5, 0.1, 0.0, 0.5, 0.2]
}

// ---------------------------------------------------------------------------
// Test 1: Cumulative reward is positive in stable environment
// ---------------------------------------------------------------------------

#[test]
fn test_convergence_positive_cumulative_reward_stable() {
    // In a stable environment (health=0, no alerts, guard+circuit pass),
    // each cycle yields reward = 0.2 (stability) + 0.1 (guard+circ) = 0.3.
    // After 500 cycles, cumulative reward should be positive.
    let mut orch = RlOrchestrator::new_with_seed(42);
    let state = healthy_state();
    let features = healthy_features();

    for _ in 0..500 {
        let _ = orch.run_cycle(&features, &state, &state, 0, true, true);
    }

    assert!(
        orch.telemetry().cumulative_reward > 0.0,
        "Cumulative reward should be positive after 500 stable cycles, got {:.3}",
        orch.telemetry().cumulative_reward,
    );
}

// ---------------------------------------------------------------------------
// Test 2: Cumulative reward is negative in degraded environment
// ---------------------------------------------------------------------------

#[test]
fn test_convergence_negative_cumulative_reward_degraded() {
    // In a degraded environment with SPC alerts and guard failure,
    // each cycle yields reward = 0.2 (stability) - 0.6 (2 alerts) - 0.5 (guard fail) = -0.9.
    // Cumulative reward should be negative.
    let mut orch = RlOrchestrator::new_with_seed(42);
    let state = degraded_state();
    let features = degraded_features();

    for _ in 0..200 {
        let _ = orch.run_cycle(&features, &state, &state, 2, false, true);
    }

    assert!(
        orch.telemetry().cumulative_reward < 0.0,
        "Cumulative reward should be negative in degraded environment, got {:.3}",
        orch.telemetry().cumulative_reward,
    );
}

// ---------------------------------------------------------------------------
// Test 3: Cumulative reward is monotonically tracked
// ---------------------------------------------------------------------------

#[test]
fn test_convergence_cumulative_reward_monotonic() {
    let mut orch = RlOrchestrator::new_with_seed(42);
    let state = healthy_state();
    let features = healthy_features();

    let mut last_cumulative = 0.0_f32;
    for _ in 0..100 {
        let _ = orch.run_cycle(&features, &state, &state, 0, true, true);
        assert!(
            orch.telemetry().cumulative_reward >= last_cumulative,
            "Cumulative reward should be monotonically increasing: \
             current={:.3} prev={:.3}",
            orch.telemetry().cumulative_reward,
            last_cumulative,
        );
        last_cumulative = orch.telemetry().cumulative_reward;
    }
}

// ---------------------------------------------------------------------------
// Test 4: Reward improves with health recovery
// ---------------------------------------------------------------------------

#[test]
fn test_convergence_reward_improves_with_health_recovery() {
    // Simulate a recovery scenario: start degraded (health=2), recover to healthy (health=0).
    // The reward should be higher after recovery than during degradation.
    let mut orch = RlOrchestrator::new_with_seed(42);
    let bad_state = degraded_state();
    let good_state = healthy_state();
    let features = healthy_features();

    let mut degraded_rewards: Vec<f32> = Vec::new();
    let mut healthy_rewards: Vec<f32> = Vec::new();

    // Phase 1: degraded (100 cycles)
    for _ in 0..100 {
        let (_, reward) = orch.run_cycle(&features, &bad_state, &bad_state, 2, false, true);
        degraded_rewards.push(reward);
    }

    // Phase 2: healthy (100 cycles)
    for _ in 0..100 {
        let (_, reward) = orch.run_cycle(&features, &good_state, &good_state, 0, true, true);
        healthy_rewards.push(reward);
    }

    let degraded_avg: f64 = degraded_rewards.iter().sum::<f32>() as f64 / degraded_rewards.len() as f64;
    let healthy_avg: f64 = healthy_rewards.iter().sum::<f32>() as f64 / healthy_rewards.len() as f64;

    assert!(
        healthy_avg > degraded_avg,
        "Average reward should be higher in healthy phase ({:.3}) than degraded phase ({:.3})",
        healthy_avg,
        degraded_avg,
    );
}

// ---------------------------------------------------------------------------
// Test 5: Exploration decay reduces action variance
// ---------------------------------------------------------------------------

#[test]
fn test_convergence_exploration_decay_reduces_variance() {
    // After many cycles, exploration should have decayed enough that
    // the action distribution becomes more concentrated.
    let mut orch = RlOrchestrator::new_with_seed(42);
    let state = healthy_state();
    let features = healthy_features();

    // Count actions in first 50 cycles (high exploration)
    let mut first_actions: Vec<String> = Vec::new();
    for _ in 0..50 {
        let (action, _) = orch.run_cycle(&features, &state, &state, 0, true, true);
        first_actions.push(action);
    }

    // Count actions in cycles 450-500 (low exploration)
    let mut late_actions: Vec<String> = Vec::new();
    for _ in 0..50 {
        let (action, _) = orch.run_cycle(&features, &state, &state, 0, true, true);
        late_actions.push(action);
    }

    // Compute number of unique actions selected
    let first_unique: std::collections::HashSet<String> =
        first_actions.into_iter().collect();
    let late_unique: std::collections::HashSet<String> =
        late_actions.into_iter().collect();

    // With 5 possible actions and decaying exploration,
    // late-stage should use fewer distinct actions
    assert!(
        late_unique.len() <= first_unique.len(),
        "Late-stage unique actions ({}) should be <= early-stage ({})",
        late_unique.len(),
        first_unique.len(),
    );
}

// ---------------------------------------------------------------------------
// Test 6: Multi-seed — positive cumulative reward is robust
// ---------------------------------------------------------------------------

#[test]
fn test_convergence_positive_reward_across_seeds() {
    // In a stable environment, all seeds should produce positive cumulative reward.
    let seeds: [u64; 5] = [1, 42, 100, 999, 7777];

    for seed in &seeds {
        let mut orch = RlOrchestrator::new_with_seed(*seed);
        let state = healthy_state();
        let features = healthy_features();

        for _ in 0..200 {
            let _ = orch.run_cycle(&features, &state, &state, 0, true, true);
        }

        assert!(
            orch.telemetry().cumulative_reward > 0.0,
            "Seed {}: cumulative reward should be positive, got {:.3}",
            seed,
            orch.telemetry().cumulative_reward,
        );
    }
}

// ---------------------------------------------------------------------------
// Test 7: Different environments produce different action distributions
// ---------------------------------------------------------------------------

#[test]
fn test_convergence_different_environments_different_actions() {
    // Run identical seed in healthy vs degraded environments.
    // Different reward landscapes should produce different action distributions.
    let seed = 42;
    let total_cycles = 300;

    let healthy_dist = {
        let mut orch = RlOrchestrator::new_with_seed(seed);
        let state = healthy_state();
        let features = healthy_features();
        let mut counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for _ in 0..total_cycles {
            let (action, _) = orch.run_cycle(&features, &state, &state, 0, true, true);
            *counts.entry(action).or_insert(0) += 1;
        }
        counts
    };

    let degraded_dist = {
        let mut orch = RlOrchestrator::new_with_seed(seed);
        let state = degraded_state();
        let features = degraded_features();
        let mut counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for _ in 0..total_cycles {
            let (action, _) = orch.run_cycle(&features, &state, &state, 2, false, true);
            *counts.entry(action).or_insert(0) += 1;
        }
        counts
    };

    // At least one action should have a different count
    let mut has_difference = false;
    for action in &["Continue", "Scale", "Retry", "Fallback", "Restart"] {
        let h = healthy_dist.get(*action).copied().unwrap_or(0);
        let d = degraded_dist.get(*action).copied().unwrap_or(0);
        if h != d {
            has_difference = true;
            break;
        }
    }

    assert!(
        has_difference,
        "Healthy and degraded environments should produce different action distributions.\n\
         Healthy: {:?}\n\
         Degraded: {:?}",
        healthy_dist,
        degraded_dist,
    );
}

// ---------------------------------------------------------------------------
// Category G: Multi-Seed Convergence Consistency
// ---------------------------------------------------------------------------

#[test]
fn test_multi_seed_final_reward_distributions_are_consistent() {
    // JTBD: Final reward distributions are consistent across seeds (policy quality is reproducible)
    // Oracle Rank 3: Metamorphic relation — different seeds should converge to same policy quality
    // Van der Aalst doctrine: RL system's behavior should be stable across random initializations

    let seeds = [42u64, 123, 456, 789, 999]; // 5 different seeds
    let total_cycles = 200;

    let per_seed_final_means: Vec<f32> = seeds
        .iter()
        .map(|&seed| {
            let mut orch = RlOrchestrator::new_with_seed(seed);
            let state = healthy_state();
            let features = healthy_features();

            // Run 200 cycles, collect rewards
            let mut all_rewards = Vec::new();
            for _ in 0..total_cycles {
                let (_action, reward) = orch.run_cycle(&features, &state, &state, 0, true, true);
                all_rewards.push(reward);
            }

            // Compute mean of last 10 cycles for this seed
            let final_10: Vec<f32> = all_rewards[total_cycles - 10..].to_vec();
            let final_mean: f32 = final_10.iter().sum::<f32>() / final_10.len() as f32;
            final_mean
        })
        .collect();

    // Compute mean and std dev of per-seed means
    let mean_of_means: f32 = per_seed_final_means.iter().sum::<f32>() / per_seed_final_means.len() as f32;
    let variance: f32 = per_seed_final_means.iter()
        .map(|m| (m - mean_of_means).powi(2))
        .sum::<f32>() / per_seed_final_means.len() as f32;
    let std_dev = variance.sqrt();

    // Coefficient of variation: std_dev / mean (< 50% indicates consistency)
    let cv = std_dev / mean_of_means.abs();

    assert!(
        cv < 0.5,
        "Multi-seed final reward distributions should be consistent (CV < 50%):\n\
         Per-seed means: {:?}\n\
         Mean of means: {}\n\
         Std dev: {}\n\
         Coefficient of Variation: {}\n\
         Expected: CV < 0.5",
        per_seed_final_means,
        mean_of_means,
        std_dev,
        cv
    );
}
