#![cfg(feature = "cloud")]
//! Action Integration Tests -- prove actions have behavioral impact on the autonomic loop.
//!
//! These tests bridge `action_dispatch` and `rl_orchestrator`, verifying that:
//! 1. Every action dispatch produces valid outcomes across all health states
//! 2. Scale action adjusts parameters proportionally to health severity
//! 3. The reward function penalizes bad decisions in bad states
//! 4. The reward function rewards recovery actions
//! 5. Circuit breaker state affects reward computation
//! 6. SPC alert count proportionally reduces reward
//!
//! Algorithm family: Autonomic Control Loop (integration)
//! Modules tested: action_dispatch, rl_orchestrator

use wasm4pm::action_dispatch::{dispatch_action, DispatchOutcome, ExecutionContext};
use wasm4pm::rl_orchestrator::{compute_reward, RlOrchestrator};
use wasm4pm::{RlAction, RlState};

/// Helper: create an RlState with dummy features and given health level.
fn make_test_state(health_level: u8) -> RlState {
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0];
    RlState::from_features(&features, health_level, 0.0)
}

/// Helper: create a default feature vector.
fn default_features() -> [f32; 8] {
    [0.1, 0.1, 0.1, 0.5, 0.0, 1.0, 1.0, 0.0]
}

// ===========================================================================
// Test 1: Action Dispatch Returns Valid Outcomes for All Health States
// ===========================================================================

#[test]
fn test_dispatch_outcomes_valid_across_all_health_states() {
    let all_actions = [
        RlAction::Continue,
        RlAction::Scale,
        RlAction::Retry,
        RlAction::Fallback,
        RlAction::Restart,
    ];

    for health in 0..=4u8 {
        let context = ExecutionContext {
            health_level: health,
            current_memory_mb: 512,
            current_timeout_ms: 30000,
            current_batch_size: 1000,
            retry_count: 0,
            max_retries: 3,
            base_backoff_ms: 1000,
            circuit_breaker_open: false,
        };

        for action in &all_actions {
            let result = dispatch_action(action, &context);
            // Every dispatch must return Ok or a known error variant (no panic)
            match result {
                Ok(outcome) => {
                    // Verify outcome has expected structure
                    match outcome {
                        DispatchOutcome::NoOp => {} // valid
                        DispatchOutcome::Scaled {
                            memory_mb,
                            timeout_ms,
                            batch_size,
                        } => {
                            // Scaled must have non-zero values
                            assert!(
                                memory_mb > 0,
                                "Scaled memory_mb must be > 0 at health={}",
                                health
                            );
                            assert!(
                                timeout_ms > 0,
                                "Scaled timeout_ms must be > 0 at health={}",
                                health
                            );
                            assert!(
                                batch_size > 0,
                                "Scaled batch_size must be > 0 at health={}",
                                health
                            );
                        }
                        DispatchOutcome::RetryInitiated { attempt, delay_ms } => {
                            assert!(attempt > 0, "Retry attempt must be > 0");
                            assert!(delay_ms > 0, "Retry delay_ms must be > 0");
                        }
                        DispatchOutcome::FallbackInitiated { algorithm } => {
                            // Placeholder returns NotImplemented, but if it were implemented:
                            let _ = &algorithm;
                        }
                        DispatchOutcome::RestartInitiated { state_cleared } => {
                            let _ = state_cleared;
                        }
                        DispatchOutcome::NotImplemented => {} // valid placeholder
                    }
                }
                Err(e) => {
                    // Errors are also valid outcomes (e.g., CircuitBreakerOpen)
                    let _ = format!("{:?}", e);
                }
            }
        }
    }
}

// ===========================================================================
// Test 2: Scale Action Adjusts Parameters by Health Severity
// ===========================================================================

#[test]
fn test_scale_action_proportionally_adjusts_by_health() {
    // Use identical base resources; only health_level changes
    let base_memory = 1024u32;
    let base_timeout = 60000u32;
    let base_batch = 2000u32;

    let mut scaled_results: Vec<(u8, u32, u32, u32)> = Vec::new();

    for health in [0u8, 2u8, 4u8] {
        let context = ExecutionContext {
            health_level: health,
            current_memory_mb: base_memory,
            current_timeout_ms: base_timeout,
            current_batch_size: base_batch,
            circuit_breaker_open: false,
            ..Default::default()
        };

        let result = dispatch_action(&RlAction::Scale, &context);
        assert!(result.is_ok(), "Scale should succeed at health={}", health);

        if let DispatchOutcome::Scaled {
            memory_mb,
            timeout_ms,
            batch_size,
        } = result.unwrap()
        {
            scaled_results.push((health, memory_mb, timeout_ms, batch_size));
        } else {
            panic!("Expected Scaled outcome at health={}", health);
        }
    }

    // memory_mb should decrease or stay equal as health worsens
    let (_, mem_0, _, _) = &scaled_results[0];
    let (_, mem_2, _, _) = &scaled_results[1];
    let (_, mem_4, _, _) = &scaled_results[2];
    assert!(
        mem_0 >= mem_2,
        "Memory at health=0 ({}) should be >= health=2 ({})",
        mem_0,
        mem_2
    );
    assert!(
        mem_2 >= mem_4,
        "Memory at health=2 ({}) should be >= health=4 ({})",
        mem_2,
        mem_4
    );

    // batch_size should decrease or stay equal as health worsens
    let (_, _, _, batch_0) = &scaled_results[0];
    let (_, _, _, batch_2) = &scaled_results[1];
    let (_, _, _, batch_4) = &scaled_results[2];
    assert!(
        batch_0 >= batch_2,
        "Batch at health=0 ({}) should be >= health=2 ({})",
        batch_0,
        batch_2
    );
    assert!(
        batch_2 >= batch_4,
        "Batch at health=2 ({}) should be >= health=4 ({})",
        batch_2,
        batch_4
    );
}

// ===========================================================================
// Test 3: Reward Penalizes Bad Actions in Bad States
// ===========================================================================

#[test]
fn test_reward_structure_penalizes_bad_decisions() {
    // Compare: stable at health=0 (good state, no action needed) vs
    //          stable at health=3 (bad state, should have acted)
    //
    // Both have prev_health == curr_health (stable), but the SPC penalty
    // and circuit/guard components should differ when health is high.
    // We test: Continue at health=3 with 0 alerts vs Continue at health=0 with 0 alerts.
    // Since both are "stable" (no health change), the base reward is the same (+0.2).
    // The difference comes from guard/circuit status.

    // Good state, everything healthy
    let reward_good_state = compute_reward(0, 0, 0, true, true, false, 0);

    // Bad state: same action (Continue = no health change), but guards fail
    let reward_bad_state_guards_fail = compute_reward(3, 3, 0, false, true, false, 0);

    // Bad state: circuit breaker blocked
    let reward_bad_state_circuit_fail = compute_reward(3, 3, 0, true, false, false, 0);

    // Good state should have higher reward than bad state with guard failure
    assert!(
        reward_good_state > reward_bad_state_guards_fail,
        "Continue in good state (reward={}) should beat Continue in bad state with guard failure (reward={})",
        reward_good_state,
        reward_bad_state_guards_fail
    );

    // Good state should have higher reward than bad state with circuit failure
    assert!(
        reward_good_state > reward_bad_state_circuit_fail,
        "Continue in good state (reward={}) should beat Continue in bad state with circuit failure (reward={})",
        reward_good_state,
        reward_bad_state_circuit_fail
    );

    // Now test degradation in bad state: health 3->4 is terminal, should be worst
    let reward_terminal = compute_reward(3, 4, 0, true, true, false, 0);
    assert!(
        reward_terminal < reward_good_state,
        "Terminal degradation (reward={}) should be worse than stable good state (reward={})",
        reward_terminal,
        reward_good_state
    );
}

// ===========================================================================
// Test 4: Reward Rewards Good Actions in Bad States
// ===========================================================================

#[test]
fn test_reward_rewards_recovery_actions() {
    // Recovery: health improves from 3 (Critical) to 1 (Warning)
    let reward_recovery = compute_reward(3, 1, 0, true, true, false, 0);

    // Stable: health stays at 1 (Warning)
    let reward_stable = compute_reward(1, 1, 0, true, true, false, 0);

    // Small improvement: health improves from 1 to 0
    let reward_small_improvement = compute_reward(1, 0, 0, true, true, false, 0);

    // Recovery from Critical to Warning should have higher reward than
    // just staying stable at Warning
    assert!(
        reward_recovery > reward_stable,
        "Recovery 3->1 (reward={}) should beat stable 1->1 (reward={})",
        reward_recovery,
        reward_stable
    );

    // Big recovery (3->1, delta=2) should have same or higher reward than
    // small improvement (1->0, delta=1) -- both get +1.0 for improvement,
    // but the reward function currently gives the same +1.0 regardless of delta.
    // Verify they are at least equal (both positive).
    assert!(
        reward_recovery > 0.0,
        "Recovery should yield positive reward, got {}",
        reward_recovery
    );
    assert!(
        reward_small_improvement > 0.0,
        "Small improvement should yield positive reward, got {}",
        reward_small_improvement
    );
}

// ===========================================================================
// Test 5: Circuit Breaker State Affects Reward
// ===========================================================================

#[test]
fn test_circuit_breaker_open_reduces_reward() {
    // Same health transition (stable at 2), but circuit breaker differs
    let reward_circuit_ok = compute_reward(2, 2, 0, true, true, false, 0);
    let reward_circuit_blocked = compute_reward(2, 2, 0, true, false, false, 0);

    assert!(
        reward_circuit_ok > reward_circuit_blocked,
        "Circuit OK (reward={}) should beat circuit blocked (reward={})",
        reward_circuit_ok,
        reward_circuit_blocked
    );

    // The difference should be exactly 0.6 (0.1 bonus vs -0.5 penalty)
    let delta = reward_circuit_ok - reward_circuit_blocked;
    assert!(
        (delta - 0.6).abs() < 0.001,
        "Expected circuit breaker impact of 0.6, got {}",
        delta
    );

    // Same for guard failure
    let reward_guard_fail = compute_reward(2, 2, 0, false, true, false, 0);
    assert!(
        reward_circuit_ok > reward_guard_fail,
        "Circuit OK (reward={}) should beat guard failure (reward={})",
        reward_circuit_ok,
        reward_guard_fail
    );
}

// ===========================================================================
// Test 6: SPC Alerts Reduce Reward Proportionally
// ===========================================================================

#[test]
fn test_spc_alert_count_proportionally_reduces_reward() {
    // Same health transition (stable 1->1), vary SPC alert count
    let alert_counts = [0usize, 2, 5, 10];
    let mut rewards: Vec<f32> = Vec::new();

    for &count in &alert_counts {
        let reward = compute_reward(1, 1, count, true, true, false, 0);
        rewards.push(reward);
    }

    // Monotonic decrease: more alerts = lower reward
    for i in 1..rewards.len() {
        assert!(
            rewards[i - 1] >= rewards[i],
            "Reward with {} alerts ({}) should be >= reward with {} alerts ({})",
            alert_counts[i - 1],
            rewards[i - 1],
            alert_counts[i],
            rewards[i]
        );
    }

    // 0 alerts should have significantly higher reward than 10 alerts
    let gap = rewards[0] - rewards[3];
    assert!(
        gap > 0.5,
        "Gap between 0 alerts and 10 alerts should be > 0.5, got {}",
        gap
    );

    // Verify the penalty caps at 1.5 (SPC component bounded)
    // 10 alerts * 0.3 = 3.0, but capped at 1.5
    let reward_10 = compute_reward(1, 1, 10, true, true, false, 0);
    let reward_100 = compute_reward(1, 1, 100, true, true, false, 0);
    assert!(
        (reward_10 - reward_100).abs() < 0.001,
        "10 alerts and 100 alerts should have same reward (SPC penalty capped at 1.5), got {} vs {}",
        reward_10,
        reward_100
    );
}

// ===========================================================================
// Integration: Dispatch + Reward End-to-End
// ===========================================================================

#[test]
fn test_dispatch_and_reward_end_to_end() {
    // Simulate a full cycle: dispatch action, compute reward, verify consistency

    // Scenario: Degraded state, dispatch Scale, verify outcome is reasonable
    let context = ExecutionContext {
        health_level: 2,
        current_memory_mb: 512,
        current_timeout_ms: 30000,
        current_batch_size: 1000,
        ..Default::default()
    };

    let dispatch_result = dispatch_action(&RlAction::Scale, &context);
    assert!(dispatch_result.is_ok());

    if let DispatchOutcome::Scaled {
        memory_mb,
        timeout_ms: _,
        batch_size,
    } = dispatch_result.unwrap()
    {
        // After scaling, resources should be reduced
        assert!(
            memory_mb <= 512,
            "Scaled memory should not increase in degraded state"
        );
        assert!(
            batch_size <= 1000,
            "Scaled batch should not increase in degraded state"
        );

        // Compute reward for stable degraded state (action was taken, health unchanged)
        let reward = compute_reward(2, 2, 0, true, true, false, 0);
        // Stable with guards passing: +0.2 (stable) - 0 (SPC) + 0.1 (guard+circuit) = 0.3
        assert!(
            (reward - 0.3).abs() < 0.001,
            "Expected reward 0.3 for stable degraded with guards passing, got {}",
            reward
        );
    } else {
        panic!("Expected Scaled outcome");
    }
}

#[test]
fn test_orchestrator_run_cycle_produces_valid_action_and_reward() {
    // Full end-to-end: create orchestrator, run cycle, verify action is a valid RlAction
    let mut orch = RlOrchestrator::new();
    let features = default_features();
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    let (action_label, reward) =
        orch.run_cycle(&features, &state, &next_state, 0, true, true, false);

    // Action label should match one of the 5 RlAction variants
    let valid_actions = ["Continue", "Scale", "Retry", "Fallback", "Restart"];
    assert!(
        valid_actions.contains(&action_label.as_str()),
        "Action '{}' should be one of {:?}",
        action_label,
        valid_actions
    );

    // Reward should be a finite number
    assert!(
        !reward.is_nan() && !reward.is_infinite(),
        "Reward should be finite, got {}",
        reward
    );

    // Telemetry should be updated
    assert_eq!(orch.telemetry().cycle_count, 1);
    assert_eq!(orch.telemetry().last_health_state, 1);
}

#[test]
fn test_orchestrator_cycle_accumulates_reward() {
    // Run multiple cycles and verify cumulative reward grows correctly
    let mut orch = RlOrchestrator::new();
    let features = default_features();
    let state = make_test_state(0);
    let next_state = make_test_state(0);

    let mut expected_cumulative = 0.0_f32;

    for _ in 0..5 {
        let (_, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
        expected_cumulative += reward;
        assert_eq!(
            orch.telemetry().cumulative_reward,
            expected_cumulative,
            "Cumulative reward mismatch"
        );
    }

    assert_eq!(orch.telemetry().cycle_count, 5);
}
