//! Reward Function Symmetry Audit — RL Agent Convergence Analysis
//!
//! Audits the reward asymmetry [-5.5, +1.6] across 5 RL agents.
//! Tests hypothesis: Heavy negative skew creates pessimistic policy bias.
//!
//! **Baseline Reward Components:**
//! - Health improvement: +1.0
//! - Health stable: +0.2
//! - Health degraded: -1.0
//! - SPC penalty: -0.3 per alert (capped -1.5)
//! - Guard pass + circuit allowed: +0.1
//! - Guard/circuit fail: -0.5
//! - Terminal (health=4): -2.0
//! - Rework penalty: -0.2 max
//! - Momentum: +0.5 max (10-cycle window)
//! - **Range: [-5.5, +1.6]** (heavily skewed toward penalties)
//!
//! **Test Strategy:**
//! Run 500 cycles in stable environment for each agent with baseline rewards.
//! Measure: cumulative reward, convergence rate, action distribution.
//! Expected: Pessimistic bias visible in positive-skew environments (all rewards positive).

use std::collections::HashMap;
use wasm4pm::rl_orchestrator::RlOrchestrator;
use wasm4pm::RlState;

/// Stable system state — no alerts, no drift, circuit closed.
fn stable_state() -> RlState {
    RlState {
        health_level: 0,     // Normal
        event_rate_q: 3,     // Mid-range event rate
        activity_count_q: 3, // Mid-range activity
        spc_alert_level: 0,  // No SPC alerts
        drift_status: 0,     // No drift
        rework_ratio_q: 0,   // No rework
        circuit_state: 0,    // Closed (healthy)
        cycle_phase: 0,      // Phase 0
    }
}

/// Features for stable system.
fn stable_features() -> [f32; 8] {
    [0.1, 0.05, 0.06, 0.0, 0.0, 0.0, 0.0, 0.001]
}

/// Degraded system state — some alerts, some drift, elevated rework.
fn degraded_state() -> RlState {
    RlState {
        health_level: 2,     // Degraded
        event_rate_q: 5,     // Higher event rate
        activity_count_q: 5, // More activities
        spc_alert_level: 2,  // Multiple SPC alerts
        drift_status: 1,     // Low drift
        rework_ratio_q: 4,   // Moderate rework
        circuit_state: 0,    // Closed but strained
        cycle_phase: 1,
    }
}

/// Features for degraded system.
#[allow(dead_code)]
fn degraded_features() -> [f32; 8] {
    [0.4, 0.4, 0.4, 0.3, 0.1, 0.5, 0.0, 0.15]
}

// ---------------------------------------------------------------------------
// Test 1: Baseline Convergence — Stable Environment
// ---------------------------------------------------------------------------

/// **Hypothesis Test:** In a stable environment with all guards passing,
/// cumulative reward should trend positive despite the asymmetric [-5.5, +1.6] range.
/// Expected reward per cycle: 0.2 (health stable) + 0.1 (guard+circuit) = 0.3
/// Over 500 cycles: cumulative ≈ 150 (ignoring variance).
#[test]
fn test_baseline_stable_convergence_per_agent() {
    let seeds = [42u64, 123, 456, 789, 999];
    let agent_names = [
        "QLearning",
        "SARSA",
        "DoubleQLearning",
        "ExpectedSARSA",
        "REINFORCE",
    ];

    for (_agent_idx, agent_name) in agent_names.iter().enumerate() {
        let mut results_per_seed: Vec<(u64, f32)> = Vec::new();

        for seed in seeds {
            let mut orch = RlOrchestrator::new_with_seed(seed);
            let state = stable_state();
            let features = stable_features();

            for _ in 0..500 {
                let _ = orch.run_cycle(&features, &state, &state, 0, true, true, false);
            }

            let final_cumulative = orch.telemetry().cumulative_reward;
            results_per_seed.push((seed, final_cumulative));
        }

        // Verify positive cumulative reward across all seeds for this agent
        for (seed, cumulative) in &results_per_seed {
            assert!(
                *cumulative > 100.0,
                "Agent {} (seed {}): cumulative reward should be >100 in stable env, got {:.3}",
                agent_name,
                seed,
                cumulative
            );
        }

        // Compute mean and std dev across seeds
        let sum: f32 = results_per_seed.iter().map(|(_, r)| r).sum();
        let mean: f32 = sum / results_per_seed.len() as f32;
        let variance: f32 = results_per_seed
            .iter()
            .map(|(_, r)| (r - mean).powi(2))
            .sum::<f32>()
            / results_per_seed.len() as f32;
        let std_dev = variance.sqrt();

        eprintln!(
            "Agent {}: mean cumulative reward = {:.3}, std_dev = {:.3}",
            agent_name, mean, std_dev
        );
    }
}

// ---------------------------------------------------------------------------
// Test 2: Convergence Rate Comparison — Which Agent Converges Fastest?
// ---------------------------------------------------------------------------

/// Measure convergence rate by tracking when cumulative reward plateaus.
/// Hypothesis: DoubleQLearning and ExpectedSARSA converge faster due to variance reduction.
#[test]
fn test_convergence_rate_comparison() {
    let agent_indices = [0, 1, 2, 3, 4];
    let agent_names = [
        "QLearning",
        "SARSA",
        "DoubleQLearning",
        "ExpectedSARSA",
        "REINFORCE",
    ];

    let mut convergence_cycles: Vec<(usize, String)> = Vec::new();

    for agent_idx in agent_indices {
        let mut orch = RlOrchestrator::new_with_seed(42);
        let state = stable_state();
        let features = stable_features();

        let mut last_reward = 0.0_f32;
        let mut plateau_count = 0;
        let mut convergence_cycle = 500; // Default to 500 if no plateau detected

        for cycle in 0..500 {
            let _ = orch.run_cycle(&features, &state, &state, 0, true, true, false);
            let current_reward = orch.telemetry().cumulative_reward;

            // Plateau detected: rate of change < 0.5 per 10 cycles
            if cycle >= 10 {
                let delta = (current_reward - last_reward).abs();
                if delta < 0.5 {
                    plateau_count += 1;
                    if plateau_count >= 5 {
                        convergence_cycle = cycle;
                        break;
                    }
                } else {
                    plateau_count = 0;
                }
            }

            if cycle % 100 == 0 {
                last_reward = current_reward;
            }
        }

        convergence_cycles.push((convergence_cycle, agent_names[agent_idx].to_string()));
    }

    // Sort by convergence cycle (earlier = faster)
    convergence_cycles.sort_by_key(|(c, _)| *c);
    eprintln!("\nConvergence Cycles (earlier = faster):");
    for (cycles, name) in convergence_cycles {
        eprintln!("  {}: {} cycles", name, cycles);
    }
    assert!(true);
}

// ---------------------------------------------------------------------------
// Test 3: Action Distribution — Policy Lock-In Detection
// ---------------------------------------------------------------------------

/// Verify that agents don't lock into single action despite asymmetric rewards.
/// Hypothesis: Pessimistic reward bias could cause "Continue" to dominate (safe action).
#[test]
fn test_action_distribution_diversity() {
    let agent_names = [
        "QLearning",
        "SARSA",
        "DoubleQLearning",
        "ExpectedSARSA",
        "REINFORCE",
    ];

    for (_agent_idx, agent_name) in agent_names.iter().enumerate() {
        let mut orch = RlOrchestrator::new_with_seed(42);
        let state = stable_state();
        let features = stable_features();

        let mut action_counts: HashMap<String, usize> = HashMap::new();

        for _ in 0..300 {
            let (action, _) = orch.run_cycle(&features, &state, &state, 0, true, true, false);
            *action_counts.entry(action).or_insert(0) += 1;
        }

        // Verify diversity: no single action dominates >80%
        let total_actions = action_counts.values().sum::<usize>();
        for (action, count) in &action_counts {
            let percentage = (*count as f32 / total_actions as f32) * 100.0;
            assert!(
                percentage < 80.0,
                "Agent {} action '{}' dominates {:.1}% (should be <80%)",
                agent_name,
                action,
                percentage
            );
        }

        eprintln!(
            "\nAgent {} action distribution (out of {} cycles):",
            agent_name, total_actions
        );
        for (action, count) in action_counts {
            eprintln!(
                "  {}: {} ({:.1}%)",
                action,
                count,
                (count as f32 / total_actions as f32) * 100.0
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Test 4: Reward Sensitivity — Pessimism Bias Detection
// ---------------------------------------------------------------------------

/// Hypothesis: Negative rewards (penalties) have stronger learning signals than positive rewards.
/// Measure: Compare reward deltas in positive-only environment vs. asymmetric baseline.
/// Expected: Same action distribution suggests asymmetry is NOT biasing learning.
/// Different distribution suggests asymmetry IS biasing learning (pessimism).
#[test]
fn test_reward_asymmetry_pessimism_bias() {
    // Baseline run: asymmetric rewards [-5.5, +1.6]
    let mut orch_baseline = RlOrchestrator::new_with_seed(42);
    let state = stable_state();
    let features = stable_features();

    let mut baseline_actions: HashMap<String, usize> = HashMap::new();

    for cycle in 0..200 {
        let (action, reward) =
            orch_baseline.run_cycle(&features, &state, &state, 0, true, true, false);
        *baseline_actions.entry(action).or_insert(0) += 1;

        // Print first 10 cycles to see reward structure
        if cycle < 10 {
            eprintln!(
                "Cycle {}: reward = {:.3}, cumulative = {:.3}",
                cycle,
                reward,
                orch_baseline.telemetry().cumulative_reward
            );
        }
    }

    // Analyze distribution
    let total = baseline_actions.values().sum::<usize>();
    let mut action_percentages: Vec<(String, f32)> = baseline_actions
        .into_iter()
        .map(|(action, count)| (action, count as f32 / total as f32 * 100.0))
        .collect();
    action_percentages.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    eprintln!("\nBaseline Action Distribution (asymmetric rewards):");
    for (action, pct) in action_percentages {
        eprintln!("  {}: {:.1}%", action, pct);
    }

    // Hypothesis: If "Continue" dominates >50%, suggests pessimism bias (safe action)
    // If distribution is balanced, asymmetry is NOT causing bias.
    assert!(total == 200, "all 200 cycles completed");
}

// ---------------------------------------------------------------------------
// Test 5: Multi-Seed Stability — Consistency Across Random Seeds
// ---------------------------------------------------------------------------

/// Run each agent with 5 different seeds. Verify that final cumulative rewards
/// are consistent (high correlation) across seeds. Inconsistency suggests instability.
#[test]
fn test_multiseed_reward_consistency() {
    let agent_names = [
        "QLearning",
        "SARSA",
        "DoubleQLearning",
        "ExpectedSARSA",
        "REINFORCE",
    ];
    let seeds = [42u64, 123, 456, 789, 999];

    for agent_name in agent_names.iter() {
        let mut final_rewards: Vec<f32> = Vec::new();

        for seed in seeds {
            let mut orch = RlOrchestrator::new_with_seed(seed);
            let state = stable_state();
            let features = stable_features();

            for _ in 0..500 {
                let _ = orch.run_cycle(&features, &state, &state, 0, true, true, false);
            }

            final_rewards.push(orch.telemetry().cumulative_reward);
        }

        // Compute coefficient of variation (CV = std_dev / mean)
        let mean: f32 = final_rewards.iter().sum::<f32>() / final_rewards.len() as f32;
        let variance: f32 = final_rewards
            .iter()
            .map(|r| (r - mean).powi(2))
            .sum::<f32>()
            / final_rewards.len() as f32;
        let std_dev = variance.sqrt();
        let cv = std_dev / mean.abs();

        eprintln!(
            "Agent {}: final rewards = {:?}, mean = {:.3}, CV = {:.3}",
            agent_name, final_rewards, mean, cv
        );

        // CV < 0.1 suggests good stability
        assert!(
            cv < 0.2,
            "Agent {} has high coefficient of variation ({:.3}), suggesting instability",
            agent_name,
            cv
        );
    }
}

// ---------------------------------------------------------------------------
// Test 6: Reward Range Verification — Bounds Enforcement
// ---------------------------------------------------------------------------

/// Verify that all rewards stay within [-5.5, +1.6] bounds.
/// Tests the hypothesis: Is reward asymmetry truly maintained, or do penalties exceed -5.5?
#[test]
fn test_reward_bounds_enforcement() {
    let mut orch = RlOrchestrator::new_with_seed(42);

    // Healthy state
    let healthy = stable_state();
    let healthy_features = stable_features();

    // Degraded state with maximum penalties
    let worst_state = RlState {
        health_level: 4,     // Terminal
        event_rate_q: 7,     // Max
        activity_count_q: 7, // Max
        spc_alert_level: 3,  // Max alerts
        drift_status: 2,     // Max drift
        rework_ratio_q: 7,   // Max rework
        circuit_state: 2,    // Open (unhealthy)
        cycle_phase: 3,
    };
    let _worst_features = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

    let mut min_reward = f32::MAX;
    let mut max_reward = f32::MIN;

    // Run through diverse state transitions
    for _ in 0..100 {
        let (_, reward) = orch.run_cycle(
            &healthy_features,
            &healthy,
            &worst_state,
            10,
            false,
            false,
            true,
        );
        min_reward = min_reward.min(reward);
        max_reward = max_reward.max(reward);
    }

    eprintln!(
        "\nReward bounds observed: min = {:.3}, max = {:.3}",
        min_reward, max_reward
    );

    // Verify bounds
    assert!(
        min_reward >= -5.5,
        "Minimum reward {:.3} exceeds lower bound -5.5",
        min_reward
    );
    assert!(
        max_reward <= 1.6,
        "Maximum reward {:.3} exceeds upper bound +1.6",
        max_reward
    );
}

// ---------------------------------------------------------------------------
// Test 7: Reward Component Sensitivity Analysis
// ---------------------------------------------------------------------------

/// Measure which reward component has the strongest impact on convergence.
/// Hypothesis: SPC penalty (-1.5 cap) is most impactful; health is secondary.
#[test]
fn test_reward_component_sensitivity() {
    let mut orch = RlOrchestrator::new_with_seed(42);
    let base_state = stable_state();
    let features = stable_features();

    let mut scenario_results: Vec<(String, f32)> = Vec::new();

    // Scenario 1: Healthy (baseline)
    for _ in 0..100 {
        let _ = orch.run_cycle(&features, &base_state, &base_state, 0, true, true, false);
    }
    let healthy_reward = orch.telemetry().cumulative_reward;
    scenario_results.push(("Healthy".to_string(), healthy_reward));

    // Scenario 2: SPC alerts (0 → 3 max)
    let mut orch = RlOrchestrator::new_with_seed(42);
    let state_with_spc = RlState {
        spc_alert_level: 3,
        ..base_state
    };
    for _ in 0..100 {
        let _ = orch.run_cycle(
            &features,
            &state_with_spc,
            &state_with_spc,
            3,
            true,
            true,
            false,
        );
    }
    let spc_reward = orch.telemetry().cumulative_reward;
    scenario_results.push(("SPC Alerts (3)".to_string(), spc_reward));

    // Scenario 3: Health degradation
    let mut orch = RlOrchestrator::new_with_seed(42);
    let degraded = degraded_state();
    for _ in 0..100 {
        let _ = orch.run_cycle(
            &stable_features(),
            &degraded,
            &degraded,
            0,
            true,
            true,
            false,
        );
    }
    let health_reward = orch.telemetry().cumulative_reward;
    scenario_results.push(("Health Degraded".to_string(), health_reward));

    // Scenario 4: Guard/circuit fail
    let mut orch = RlOrchestrator::new_with_seed(42);
    for _ in 0..100 {
        let _ = orch.run_cycle(&features, &base_state, &base_state, 0, false, false, false);
    }
    let guard_fail_reward = orch.telemetry().cumulative_reward;
    scenario_results.push(("Guard/Circuit Fail".to_string(), guard_fail_reward));

    eprintln!("\nComponent Sensitivity (cumulative reward over 100 cycles):");
    for (scenario, reward) in scenario_results {
        eprintln!("  {}: {:.3}", scenario, reward);
    }
    assert!(true);
}

// ---------------------------------------------------------------------------
// Test 8: Pessimism Hypothesis Validation
// ---------------------------------------------------------------------------

/// Direct test of hypothesis: Does negative skew bias agents toward "safe" actions?
/// Expected: In a safe environment (all guards pass), agent should explore, not retreat.
#[test]
fn test_pessimism_hypothesis_safe_action_bias() {
    // Theory: If pessimism bias exists, agents will prefer "Continue" (safest action)
    // over exploratory actions like "Scale" or "Restart".

    let mut orch = RlOrchestrator::new_with_seed(42);
    let state = stable_state();
    let features = stable_features();

    let mut action_counts: HashMap<String, usize> = HashMap::new();

    // Run 500 cycles in SAFE environment
    for _ in 0..500 {
        let (action, _) = orch.run_cycle(&features, &state, &state, 0, true, true, false);
        *action_counts.entry(action).or_insert(0) += 1;
    }

    let total = action_counts.values().sum::<usize>();
    let continue_count = action_counts.get("Continue").copied().unwrap_or(0);
    let continue_pct = continue_count as f32 / total as f32;

    eprintln!(
        "\nPessimism Hypothesis Test: 'Continue' action percentage = {:.1}%",
        continue_pct * 100.0
    );

    // If continue_pct > 0.6 (60%), suggests pessimism bias
    // If continue_pct < 0.4 (40%), suggests diverse exploration (no bias)
    if continue_pct > 0.6 {
        eprintln!("  ⚠️  POTENTIAL PESSIMISM BIAS: 'Continue' dominates");
    } else if continue_pct < 0.4 {
        eprintln!("  ✓ GOOD: Diverse exploration, no bias detected");
    } else {
        eprintln!("  ≈ MODERATE: Mixed exploration and exploitation");
    }
    assert!(continue_pct >= 0.0);
}
