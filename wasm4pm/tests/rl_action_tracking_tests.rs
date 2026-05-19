//! Action History tests — Rank-2 domain contract verification.
//!
//! Tests for ActionHistory struct including:
//! - Rolling window FIFO semantics (max 100 actions)
//! - Per-action success rate computation
//! - Distribution histogram accuracy
//! - Saturation behavior at 100-action limit

use wasm4pm::{RlAction, rl_orchestrator::ActionHistory};

/// Test 1: Rolling window FIFO semantics
/// Verifies that recording >100 actions triggers FIFO eviction.
#[test]
fn action_history_rolling_window_fifo_semantics() {
    let mut history = ActionHistory::new();

    // Record 105 actions (Continue, Scale, Retry, Fallback, Restart, repeat)
    for i in 0..105 {
        let action = match i % 5 {
            0 => RlAction::Continue,
            1 => RlAction::Scale,
            2 => RlAction::Retry,
            3 => RlAction::Fallback,
            4 => RlAction::Restart,
            _ => unreachable!(),
        };
        history.record_action(action, 0.1);
    }

    // Verify only last 100 are retained (oldest 5 evicted)
    let recent = history.recent_actions();
    assert_eq!(
        recent.len(),
        100,
        "rolling window must retain exactly 100 actions, got {}",
        recent.len()
    );

    // Verify the first action in recent_actions is from index 5 (Continue again)
    // Pattern: Continue(0), Scale(1), Retry(2), Fallback(3), Restart(4),
    //          Continue(5), Scale(6), ...
    // After 105 total, indices 0-4 are evicted, so first in window is index 5.
    let first_action = recent[0].0;
    assert_eq!(
        first_action,
        RlAction::Continue,
        "first action in window after eviction should be Continue (index 5 from original sequence)"
    );

    // Verify last action in recent_actions is from index 104 (Restart)
    let last_action = recent[99].0;
    assert_eq!(
        last_action,
        RlAction::Restart,
        "last action in window should be Restart (index 104 from original sequence)"
    );
}

/// Test 2: Per-action success rate computation
/// Records mixed rewards, verifies success_rate() computes correctly.
#[test]
fn action_history_per_action_success_rates() {
    let mut history = ActionHistory::new();

    // Record Continue: 2 successes out of 5 → 0.4
    for _ in 0..2 {
        history.record_action(RlAction::Continue, 0.5); // positive = success
    }
    for _ in 0..3 {
        history.record_action(RlAction::Continue, -0.5); // negative = failure
    }

    // Record Scale: 3 successes out of 4 → 0.75
    for _ in 0..3 {
        history.record_action(RlAction::Scale, 1.0);
    }
    for _ in 0..1 {
        history.record_action(RlAction::Scale, -0.1);
    }

    // Record Retry: 0 successes out of 2 → 0.0
    history.record_action(RlAction::Retry, 0.0); // zero = failure (not > 0)
    history.record_action(RlAction::Retry, -1.0);

    // Record Fallback: all successes → 1.0
    for _ in 0..3 {
        history.record_action(RlAction::Fallback, 0.1);
    }

    // Record Restart: not recorded yet → 0.0 (div by zero → 0.0)

    // Verify success rates
    let continue_rate = history.get_success_rate(RlAction::Continue);
    assert!((continue_rate - 0.4).abs() < 1e-6, "Continue success rate should be 0.4, got {}", continue_rate);

    let scale_rate = history.get_success_rate(RlAction::Scale);
    assert!((scale_rate - 0.75).abs() < 1e-6, "Scale success rate should be 0.75, got {}", scale_rate);

    let retry_rate = history.get_success_rate(RlAction::Retry);
    assert!((retry_rate - 0.0).abs() < 1e-6, "Retry success rate should be 0.0, got {}", retry_rate);

    let fallback_rate = history.get_success_rate(RlAction::Fallback);
    assert!((fallback_rate - 1.0).abs() < 1e-6, "Fallback success rate should be 1.0, got {}", fallback_rate);

    let restart_rate = history.get_success_rate(RlAction::Restart);
    assert!((restart_rate - 0.0).abs() < 1e-6, "Restart success rate (unrecorded) should be 0.0, got {}", restart_rate);
}

/// Test 3: Distribution histogram accuracy
/// Verifies that distribution() returns correct action counts.
#[test]
fn action_history_distribution_histogram_accuracy() {
    let mut history = ActionHistory::new();

    // Record actions with specific counts
    for _ in 0..10 {
        history.record_action(RlAction::Continue, 0.1);
    }
    for _ in 0..15 {
        history.record_action(RlAction::Scale, 0.2);
    }
    for _ in 0..8 {
        history.record_action(RlAction::Retry, 0.3);
    }
    for _ in 0..5 {
        history.record_action(RlAction::Fallback, 0.4);
    }
    for _ in 0..12 {
        history.record_action(RlAction::Restart, 0.5);
    }

    // Total: 50 actions (within rolling window limit of 100)

    let dist = history.distribution();

    // Verify distribution tuple order: (label, count)
    assert_eq!(dist[0].0, "Continue");
    assert_eq!(dist[0].1, 10, "Continue count should be 10");

    assert_eq!(dist[1].0, "Scale");
    assert_eq!(dist[1].1, 15, "Scale count should be 15");

    assert_eq!(dist[2].0, "Retry");
    assert_eq!(dist[2].1, 8, "Retry count should be 8");

    assert_eq!(dist[3].0, "Fallback");
    assert_eq!(dist[3].1, 5, "Fallback count should be 5");

    assert_eq!(dist[4].0, "Restart");
    assert_eq!(dist[4].1, 12, "Restart count should be 12");

    // Verify total matches recent_actions length
    let total: u32 = dist.iter().map(|(_, count)| count).sum();
    assert_eq!(total as usize, history.recent_actions().len(), "distribution total must match recent_actions length");
}

/// Test 4: Saturation at 100-action limit
/// Records actions past 100, verifies newest actions displace oldest.
#[test]
fn action_history_saturation_displaces_oldest() {
    let mut history = ActionHistory::new();

    // Record 150 Continue actions with distinct reward values
    for i in 0..150 {
        history.record_action(RlAction::Continue, i as f32);
    }

    let recent = history.recent_actions();

    // Window should contain exactly 100 actions (oldest 50 evicted)
    assert_eq!(recent.len(), 100, "window must be capped at 100");

    // Verify window contains actions 50..150 (oldest 50 evicted)
    // Action i has reward i (as f32)
    assert!((recent[0].1 - 50.0).abs() < 1e-6, "first action should be from index 50, reward ~50");
    assert!((recent[99].1 - 149.0).abs() < 1e-6, "last action should be from index 149, reward ~149");

    // Verify oldest (index 0-49) are gone
    let min_reward = recent.iter().map(|(_, r)| *r).fold(f32::INFINITY, f32::min);
    assert!(min_reward >= 50.0 - 1e-6, "minimum reward in window should be ~50 (index 50)");

    // Verify newest (index 100-149) are present
    let max_reward = recent.iter().map(|(_, r)| *r).fold(f32::NEG_INFINITY, f32::max);
    assert!(max_reward >= 149.0 - 1e-6, "maximum reward in window should be ~149 (index 149)");
}
