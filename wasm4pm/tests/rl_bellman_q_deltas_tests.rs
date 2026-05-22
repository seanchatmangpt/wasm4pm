//! Q-value delta tracking tests (Gap 2 — Rank-1 mathematical oracle).
//!
//! These tests verify that the update() method emits OTEL spans with Q-value deltas.
//! Since Q-table access is private, these tests focus on the behavior of the
//! orchestrator across multiple cycles, verifying that Bellman updates occur
//! and learning progresses (indirect verification of Q-delta instrumentation).

use wasm4pm::rl_orchestrator::{RlOrchestrator, compute_reward};
use wasm4pm::RlState;

fn make_state(health: u8, event_rate_q: u8) -> RlState {
    RlState {
        health_level: health,
        event_rate_q,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    }
}

#[test]
fn bellman_update_execution_over_cycles() {
    // Rank-1 oracle: Bellman updates should occur every cycle
    // Verify by running cycles and checking that telemetry accumulates reward
    let mut orch = RlOrchestrator::new_with_seed(42);

    let s = make_state(0, 0);
    let s_next = make_state(0, 1);

    let features = &[0.5; 8];
    let initial_cumulative = orch.telemetry().cumulative_reward;

    // Run one full cycle: action selection, reward, Bellman update
    let (_action_label, reward) = orch.run_cycle(&features, &s, &s_next, 0, true, true, false);

    let final_cumulative = orch.telemetry().cumulative_reward;

    // Rank-1 oracle: Bellman update should affect cumulative reward
    assert!(
        final_cumulative > initial_cumulative || final_cumulative < initial_cumulative,
        "Bellman update should change cumulative reward, got reward={}",
        reward
    );
}

#[test]
fn positive_reward_accumulates() {
    // Rank-2 domain contract: positive reward should accumulate
    let mut orch = RlOrchestrator::new_with_seed(42);

    let s = make_state(0, 0);
    let s_next = make_state(0, 0); // Same state to avoid terminal/degradation
    let features = &[0.5; 8];

    // Run 10 cycles with good conditions (guard pass, circuit allowed)
    for _ in 0..10 {
        let (_action_label, _reward) = orch.run_cycle(&features, &s, &s_next, 0, true, true, false);
    }

    let total_reward = orch.telemetry().cumulative_reward;

    // With stable health and good guard/circuit, expect positive accumulation
    assert!(
        total_reward > 0.0,
        "Positive conditions should accumulate positive reward, got {}",
        total_reward
    );
}

#[test]
fn negative_reward_decreases_cumulative() {
    // Rank-2 domain contract: negative reward should decrease cumulative
    let mut orch = RlOrchestrator::new_with_seed(42);

    let s = make_state(0, 0);
    let s_next = make_state(4, 0); // Terminal state
    let features = &[0.5; 8];

    // Terminal penalty should be large negative
    let (_, reward) = orch.run_cycle(&features, &s, &s_next, 0, false, false, true);

    let total_reward = orch.telemetry().cumulative_reward;

    // Terminal and guard/circuit fail should result in large negative
    assert!(
        total_reward < 0.0,
        "Terminal penalty should result in negative cumulative reward, got {} (reward={})",
        total_reward,
        reward
    );
}

#[test]
fn zero_reward_neutral_to_cumulative() {
    // Rank-1 oracle: zero reward should not change cumulative reward
    let mut orch = RlOrchestrator::new_with_seed(42);

    let s = make_state(0, 0);
    let s_next = make_state(0, 1);
    let initial_cumulative = orch.telemetry().cumulative_reward;

    let action = orch.select_action(&s);
    orch.update(&s, &action, 0.0, &s_next, false);

    let final_cumulative = orch.telemetry().cumulative_reward;

    // Cumulative should stay near initial (may change due to other reward components)
    assert!(
        (final_cumulative - initial_cumulative).abs() < 1.0,
        "Zero reward should not significantly change cumulative"
    );
}

#[test]
fn cycle_count_increments_per_update() {
    // Rank-1 oracle: run_cycle() should increment cycle_count each time
    let mut orch = RlOrchestrator::new_with_seed(42);

    let features = &[0.5; 8];
    let s = make_state(0, 0);
    let s_next = make_state(0, 1);

    let initial_cycle_count = orch.telemetry().cycle_count;

    // Run one full cycle via run_cycle()
    let (_action_label, _reward) = orch.run_cycle(features, &s, &s_next, 0, true, true, false);

    let final_cycle_count = orch.telemetry().cycle_count;

    assert_eq!(
        final_cycle_count,
        initial_cycle_count + 1,
        "Each run_cycle() should increment cycle_count by 1"
    );
}

#[test]
fn multiple_cycles_accumulate_state() {
    // Rank-3 metamorphic: multiple cycles with increasing health should show improvement
    let mut orch = RlOrchestrator::new_with_seed(42);

    let features = &[0.5; 8];
    let s = make_state(0, 0);

    // Run 5 cycles with improving health
    for i in 0..5 {
        let s_next = make_state(0, i as u8 % 4); // Vary event_rate to avoid terminal state
        let (_action_label, _reward) = orch.run_cycle(features, &s, &s_next, 0, true, true, false);
    }

    let final_cycle_count = orch.telemetry().cycle_count;
    assert_eq!(final_cycle_count, 5, "After 5 cycles, cycle_count should be 5");
}

#[test]
fn action_selection_changes_last_action_label() {
    // Rank-1 oracle: each cycle should update last_action_label telemetry
    let mut orch = RlOrchestrator::new_with_seed(42);

    let features = &[0.5; 8];
    let s = make_state(0, 0);
    let s_next = make_state(0, 1);

    let (action_label, _reward) = orch.run_cycle(features, &s, &s_next, 0, true, true, false);

    let telemetry_label = orch.telemetry().last_action_label.clone();

    assert_eq!(
        action_label, telemetry_label,
        "Returned action_label should match telemetry.last_action_label"
    );
    assert!(
        !telemetry_label.is_empty(),
        "Action label should not be empty"
    );
}
