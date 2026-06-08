//! Bellman Correctness (Category A) + Metamorphic Relations (Category E)
//!
//! Rank-1 precision tests that catch Bellman update bugs in a SINGLE transition.
//! These complement the existing Rank-4 statistical convergence tests.
//!
//! Category A (Bellman Correctness): Tests 1-5
//!   Verify mathematical correctness of a single Bellman update.
//!   If the Bellman update passes the same state twice (the known bug), these fail immediately.
//!
//! Category E (Metamorphic Relations): Tests 6-10
//!   Assert ORDERING relations between paired runs with controlled perturbations.
//!   Catch subtle bugs that absolute value tests miss.
//!
//! Key design decisions:
//!   - Tests 1-5 use QLearning directly (not RlOrchestrator) to access get_q_value()
//!   - Tests 6-10 use compute_reward() which is a pure function
//!   - All tests are deterministic (no randomness)

use wasm4pm::reinforcement::{Agent, QLearning};
use wasm4pm::rl_orchestrator::compute_reward;
use wasm4pm::RlAction;
use wasm4pm::RlState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Create an RlState with a specific health_level and all other fields zeroed.
fn health_state(health_level: u8) -> RlState {
    wasm4pm::create_rl_state(health_level, 0, 0, 0, 0, 0, 0, 0)
}

/// Create a QLearning agent with exploration_rate=0.0 (purely greedy).
/// This eliminates randomness in select_action.
fn greedy_q_agent() -> QLearning<RlState, RlAction> {
    QLearning::with_hyperparams(0.1, 0.99, 0.0)
}

// ===========================================================================
// Category A: Bellman Correctness (Rank-1)
// ===========================================================================

// ---------------------------------------------------------------------------
// Test 1: Q-value moves toward target after one update
// ---------------------------------------------------------------------------
#[test]
fn test_q_value_converges_toward_target_after_single_update() {
    let agent = greedy_q_agent();

    let state = health_state(2); // Degraded
    let next_state = health_state(1); // Warning (improved)
    let action = RlAction::Continue;

    // Record Q(S, a) BEFORE update — should be 0.0 (unvisited)
    let q_before = agent.get_q_value(&state, &action);
    assert!(
        q_before.abs() < 1e-6,
        "Q-value should be 0.0 for unvisited state-action pair, got {}",
        q_before
    );

    // Perform one Bellman update: Q(s,a) <- Q(s,a) + alpha * [r + gamma * max Q(s',a') - Q(s,a)]
    // With r=1.0, gamma=0.99, alpha=0.1, Q(s,a)=0, max Q(s',a')=0:
    //   delta = 0.1 * (1.0 + 0.99 * 0 - 0) = 0.1
    //   Q(s,a) = 0.0 + 0.1 = 0.1
    agent.update(&state, &action, 1.0, &next_state, false);

    let q_after = agent.get_q_value(&state, &action);

    // Q-value must have increased (moved toward positive target)
    assert!(
        q_after > q_before,
        "Q(S,a) should increase after positive reward update: before={}, after={}",
        q_before,
        q_after
    );

    // Verify the exact Bellman update magnitude
    // target = r + gamma * max_Q(s',a') = 1.0 + 0.99 * 0.0 = 1.0
    // delta = alpha * (target - current) = 0.1 * (1.0 - 0.0) = 0.1
    let expected_delta = 0.1;
    assert!(
        (q_after - q_before - expected_delta).abs() < 1e-6,
        "Bellman update magnitude should be exactly alpha * (target - current) = {}: got {}",
        expected_delta,
        q_after - q_before
    );
}

// ---------------------------------------------------------------------------
// Test 2: Different next_states produce different Q-value updates
// ---------------------------------------------------------------------------
#[test]
fn test_different_next_states_produce_different_q_updates() {
    // Agent A: update toward health=0 (best state)
    let agent_a = greedy_q_agent();
    let state = health_state(2);
    let action = RlAction::Continue;

    // First, seed next_state=health0 with a high Q-value so it bootstraps
    let good_next = health_state(0);
    let bad_next = health_state(4); // Failed (terminal)

    // Pre-populate Q(health0, Continue) with a positive value
    agent_a.update(&good_next, &action, 0.5, &health_state(0), false);

    // Pre-populate Q(health4, Continue) with a negative value
    agent_a.update(&bad_next, &action, -0.5, &health_state(4), true);

    let q_good_next_before = agent_a.get_q_value(&good_next, &action);
    let q_bad_next_before = agent_a.get_q_value(&bad_next, &action);

    assert!(
        q_good_next_before > q_bad_next_before,
        "Sanity: Q(health0, a) should be > Q(health4, a) after seeding: {} vs {}",
        q_good_next_before,
        q_bad_next_before
    );

    // Now perform the critical test: update the SAME (state, action) with
    // different next_states. If the bug (same state passed twice) exists,
    // both updates would produce identical Q-values.
    let agent_b = greedy_q_agent();
    let agent_c = greedy_q_agent();

    // Seed both agents identically
    agent_b.update(&good_next, &action, 0.5, &health_state(0), false);
    agent_c.update(&good_next, &action, 0.5, &health_state(0), false);
    agent_b.update(&bad_next, &action, -0.5, &health_state(4), true);
    agent_c.update(&bad_next, &action, -0.5, &health_state(4), true);

    // Agent B: update with good next_state (health0)
    agent_b.update(&state, &action, 0.0, &good_next, false);
    let q_with_good_next = agent_b.get_q_value(&state, &action);

    // Agent C: update with bad next_state (health4, terminal)
    agent_c.update(&state, &action, 0.0, &bad_next, true);
    let q_with_bad_next = agent_c.get_q_value(&state, &action);

    assert!(
        q_with_good_next > q_with_bad_next,
        "Q(S,a) after update toward good next_state ({:.6}) should be > Q(S,a) after update toward bad next_state ({:.6}). \
         If equal, the Bellman update is likely passing the same state twice (the bug).",
        q_with_good_next,
        q_with_bad_next
    );
}

// ---------------------------------------------------------------------------
// Test 3: Terminal state update has no bootstrapping
// ---------------------------------------------------------------------------
#[test]
fn test_terminal_update_no_bootstrap() {
    // Two agents, identical setup. One gets terminal update, other non-terminal.
    let agent_terminal = greedy_q_agent();
    let agent_nonterminal = greedy_q_agent();

    let state = health_state(2);
    let next_state = health_state(1);
    let action = RlAction::Continue;
    let reward = 1.0;

    // Seed next_state with a high Q-value so bootstrapping matters
    agent_terminal.update(&next_state, &action, 2.0, &health_state(0), false);
    agent_nonterminal.update(&next_state, &action, 2.0, &health_state(0), false);

    // Terminal update: target = r (no future value, even though next_state has high Q)
    agent_terminal.update(&state, &action, reward, &next_state, true);

    // Non-terminal update: target = r + gamma * max Q(s', a')
    agent_nonterminal.update(&state, &action, reward, &next_state, false);

    let q_terminal = agent_terminal.get_q_value(&state, &action);

    let q_nonterminal_val = agent_nonterminal.get_q_value(&state, &action);

    assert!(
        q_nonterminal_val > q_terminal,
        "Non-terminal Q(S,a) ({:.6}) should be > terminal Q(S,a) ({:.6}). \
         Terminal update must not bootstrap from next_state's Q-values.",
        q_nonterminal_val,
        q_terminal
    );

    // Verify terminal update ignores next_state Q-value entirely
    // target_terminal = r = 1.0, delta = 0.1 * (1.0 - 0) = 0.1
    let expected_terminal_q = 0.1;
    assert!(
        (q_terminal - expected_terminal_q).abs() < 1e-6,
        "Terminal Q(S,a) should be exactly alpha * r = {}: got {}",
        expected_terminal_q,
        q_terminal
    );
}

// ---------------------------------------------------------------------------
// Test 4: Negative reward decreases Q-value
// ---------------------------------------------------------------------------
#[test]
fn test_negative_reward_decreases_q_value() {
    let agent = greedy_q_agent();

    let state = health_state(1);
    let action = RlAction::Continue;

    // Seed Q(S, a) to a positive value first
    agent.update(&state, &action, 2.0, &health_state(0), false);
    let q_positive = agent.get_q_value(&state, &action);
    assert!(
        q_positive > 0.0,
        "Sanity: Q(S,a) should be positive after positive reward: {}",
        q_positive
    );

    // Now apply negative reward
    agent.update(&state, &action, -1.0, &health_state(0), false);
    let q_after_negative = agent.get_q_value(&state, &action);

    assert!(
        q_after_negative < q_positive,
        "Q(S,a) should decrease after negative reward: before={}, after={}",
        q_positive,
        q_after_negative
    );
}

// ---------------------------------------------------------------------------
// Test 5: Zero reward with bad next_state decreases Q-value
// ---------------------------------------------------------------------------
#[test]
fn test_zero_reward_bad_next_state_decreases_q() {
    let agent = greedy_q_agent();

    let state = health_state(1);
    let action = RlAction::Continue;
    let bad_next = health_state(4); // Failed (worst state)

    // Seed Q(S, a) to a positive value
    agent.update(&state, &action, 2.0, &health_state(0), false);
    let q_before = agent.get_q_value(&state, &action);
    assert!(
        q_before > 0.0,
        "Sanity: Q(S,a) should be positive: {}",
        q_before
    );

    // Update with r=0.0, next_state=health4 (terminal, Q=0 for all actions)
    // target = 0.0 + 0.99 * 0.0 = 0.0 (terminal, no bootstrap)
    // delta = 0.1 * (0.0 - Q(S,a)) < 0 since Q(S,a) > 0
    agent.update(&state, &action, 0.0, &bad_next, true);
    let q_after = agent.get_q_value(&state, &action);

    assert!(
        q_after < q_before,
        "Q(S,a) should decrease when next_state has zero value: before={}, after={}. \
         Zero reward + bad next_state means target < current Q.",
        q_before,
        q_after
    );
}

// ===========================================================================
// Category E: Metamorphic Relations (Rank-1)
// ===========================================================================
//
// Metamorphic tests assert ORDERING relations between paired runs with
// controlled perturbations. They do not assert absolute values.
// ===========================================================================

// ---------------------------------------------------------------------------
// Test 6: Health degradation monotonicity
// ---------------------------------------------------------------------------
//
// The reward function uses DISCRETE categories, not a graded scale:
//   stable          → +0.2  (health unchanged)
//   any degradation → -1.0  (health worsened, regardless of magnitude)
//   terminal (=4)   → -1.0 + -2.0 = -3.0  (additional terminal penalty)
//
// The valid metamorphic relation is:
//   stable > any_non_terminal_degradation > terminal_degradation
//
// "Mild" and "moderate" degradation produce identical rewards because the
// domain contract penalises "any degradation" equally. The grading only
// applies at the terminal boundary.
#[test]
fn test_metamorphic_health_degradation_monotonic() {
    let spc = 0;
    let circuit = true;
    let guard = true;

    // Baseline: health stays at 1 (stable)
    let reward_stable = compute_reward(1, 1, spc, circuit, guard, false, 0);

    // Any non-terminal degradation (1 -> 2 or 1 -> 3): flat -1.0 penalty
    let reward_degraded_mild = compute_reward(1, 2, spc, circuit, guard, false, 0);
    let reward_degraded_moderate = compute_reward(1, 3, spc, circuit, guard, false, 0);

    // Terminal degradation: 1 -> 4 adds a -2.0 terminal penalty on top
    let reward_terminal = compute_reward(1, 4, spc, circuit, guard, false, 0);

    // Contract 1: stable > non-terminal degradation
    assert!(
        reward_stable > reward_degraded_mild,
        "Stable health reward ({}) should exceed non-terminal degradation reward ({})",
        reward_stable,
        reward_degraded_mild
    );

    // Contract 2: any non-terminal degradation produces the SAME penalty
    // (the reward function penalises "degradation" as a category, not magnitude)
    assert!(
        (reward_degraded_mild - reward_degraded_moderate).abs() < 1e-6,
        "All non-terminal degradation should produce identical rewards (flat category penalty): \
         mild={}, moderate={}",
        reward_degraded_mild,
        reward_degraded_moderate
    );

    // Contract 3: non-terminal degradation > terminal degradation
    assert!(
        reward_degraded_moderate > reward_terminal,
        "Non-terminal degradation reward ({}) should exceed terminal degradation reward ({})",
        reward_degraded_moderate,
        reward_terminal
    );

    // Contract 4: terminal penalty is -2.0 larger than non-terminal
    let terminal_extra_penalty = reward_degraded_moderate - reward_terminal;
    assert!(
        (terminal_extra_penalty - 2.0).abs() < 1e-6,
        "Terminal state should add exactly -2.0 extra penalty vs non-terminal degradation, \
         got delta={}",
        terminal_extra_penalty
    );
}

// ---------------------------------------------------------------------------
// Test 7: SPC alert count monotonicity
// ---------------------------------------------------------------------------
//
// The SPC penalty is: -0.3 per alert, capped at -1.5 total.
// Cap triggers at 5 alerts (5 × 0.3 = 1.5).
//
// Domain contracts:
//   1. Below cap (0..=4 alerts): strict monotone decrease (-0.3 per step)
//   2. At and above cap (5, 10, 50 alerts): identical reward (penalty saturated)
//   3. Total SPC penalty range is bounded to [0, 1.5]
#[test]
fn test_metamorphic_spc_alert_count_monotonic() {
    // Fix all params: health stable 2->2, circuit ok, guard ok
    let prev = 2;
    let curr = 2;
    let circuit = true;
    let guard = true;

    // -- Part 1: strict monotone region (0..=4 alerts, below cap) --
    let pre_cap_counts = [0usize, 1, 2, 3, 4];
    let pre_cap_rewards: Vec<f32> = pre_cap_counts
        .iter()
        .map(|&spc| compute_reward(prev, curr, spc, circuit, guard, false, 0))
        .collect();

    for i in 0..pre_cap_rewards.len() - 1 {
        assert!(
            pre_cap_rewards[i] > pre_cap_rewards[i + 1],
            "Reward must decrease strictly for each alert below cap: \
             reward({} alerts) = {} should be > reward({} alerts) = {}",
            pre_cap_counts[i],
            pre_cap_rewards[i],
            pre_cap_counts[i + 1],
            pre_cap_rewards[i + 1]
        );
        // Verify each step is exactly -0.3
        let step = pre_cap_rewards[i] - pre_cap_rewards[i + 1];
        assert!(
            (step - 0.3).abs() < 1e-5,
            "Each additional SPC alert below cap must penalise exactly -0.3: got step={}",
            step
        );
    }

    // -- Part 2: flat region (5, 10, 50 alerts, at or above cap) --
    let at_cap = compute_reward(prev, curr, 5, circuit, guard, false, 0);
    let above_cap_10 = compute_reward(prev, curr, 10, circuit, guard, false, 0);
    let above_cap_50 = compute_reward(prev, curr, 50, circuit, guard, false, 0);

    assert!(
        (at_cap - above_cap_10).abs() < 1e-6,
        "Reward must be identical at (5 alerts={}) and above cap (10 alerts={}): penalty is saturated",
        at_cap, above_cap_10
    );
    assert!(
        (at_cap - above_cap_50).abs() < 1e-6,
        "Reward must be identical at (5 alerts={}) and above cap (50 alerts={}): penalty is saturated",
        at_cap, above_cap_50
    );

    // -- Part 3: total SPC penalty capped at exactly 1.5 --
    let no_alert_reward = compute_reward(prev, curr, 0, circuit, guard, false, 0);
    let max_alert_reward = compute_reward(prev, curr, 50, circuit, guard, false, 0);
    let total_spc_penalty = no_alert_reward - max_alert_reward;
    assert!(
        (total_spc_penalty - 1.5).abs() < 1e-5,
        "Total SPC penalty at saturation must be exactly 1.5: got {}",
        total_spc_penalty
    );
}

// ---------------------------------------------------------------------------
// Test 8: Circuit breaker metamorphic
// ---------------------------------------------------------------------------
#[test]
fn test_metamorphic_circuit_breaker_impact() {
    let prev = 2;
    let curr = 2;
    let spc = 0;
    let guard = true;

    let reward_circuit_ok = compute_reward(prev, curr, spc, guard, true, false, 0);
    let reward_circuit_fail = compute_reward(prev, curr, spc, guard, false, false, 0);

    assert!(
        reward_circuit_ok > reward_circuit_fail,
        "Circuit OK reward ({}) should exceed circuit FAIL reward ({})",
        reward_circuit_ok,
        reward_circuit_fail
    );

    // Penalty magnitude should be consistent: guard+circuit bonus vs guard-only penalty
    // circuit_ok: +0.1 (guard_pass && circuit_allowed)
    // circuit_fail: -0.5 (else branch)
    // Difference = 0.6
    let diff = reward_circuit_ok - reward_circuit_fail;
    assert!(
        (diff - 0.6).abs() < 1e-6,
        "Circuit breaker penalty magnitude should be exactly 0.6: got {}",
        diff
    );
}

// ---------------------------------------------------------------------------
// Test 9: Guard failure metamorphic
// ---------------------------------------------------------------------------
#[test]
fn test_metamorphic_guard_failure_impact() {
    let prev = 2;
    let curr = 2;
    let spc = 0;
    let circuit = true;

    let reward_guard_ok = compute_reward(prev, curr, spc, true, circuit, false, 0);
    let reward_guard_fail = compute_reward(prev, curr, spc, false, circuit, false, 0);

    assert!(
        reward_guard_ok > reward_guard_fail,
        "Guard pass reward ({}) should exceed guard fail reward ({})",
        reward_guard_ok,
        reward_guard_fail
    );

    // Penalty magnitude: same logic as circuit breaker (+0.1 vs -0.5 = 0.6)
    let diff = reward_guard_ok - reward_guard_fail;
    assert!(
        (diff - 0.6).abs() < 1e-6,
        "Guard failure penalty magnitude should be exactly 0.6: got {}",
        diff
    );
}

// ---------------------------------------------------------------------------
// Test 10: Composition — all penalties stack
// ---------------------------------------------------------------------------
#[test]
fn test_metamorphic_all_penalties_compose() {
    // Best case: health improves (3->0), no alerts, circuit ok, guard ok
    let best_reward = compute_reward(3, 0, 0, true, true, false, 0);

    // Worst case: health degrades to terminal (0->4), max alerts, circuit fail, guard fail
    let worst_reward = compute_reward(0, 4, 100, false, false, false, 0);

    assert!(
        best_reward > worst_reward,
        "Best-case reward ({}) must exceed worst-case reward ({})",
        best_reward,
        worst_reward
    );

    // The gap should be significant (not a rounding artifact)
    let gap = best_reward - worst_reward;
    assert!(
        gap > 1.0,
        "Reward gap between best and worst case should be > 1.0 (got {}). \
         All penalties must compose, not cancel out.",
        gap
    );

    // Verify best case is positive (health improved + guard/circuit bonus)
    assert!(
        best_reward > 0.0,
        "Best-case reward should be positive: got {}",
        best_reward
    );

    // Verify worst case is deeply negative
    assert!(
        worst_reward < -2.0,
        "Worst-case reward should be < -2.0 (got {}). \
         Health degradation + terminal penalty + SPC + circuit + guard failures should stack.",
        worst_reward
    );
}

// ===========================================================================
// Cross-category regression: Bellman update uses next_state, not state
// ===========================================================================
//
// These tests directly check for the specific bug pattern that motivated this
// test file: passing the same state twice instead of state and next_state.

// ---------------------------------------------------------------------------
// Regression 1: Direct detection of the same-state-twice bug
// ---------------------------------------------------------------------------
#[test]
fn test_bellman_uses_next_state_not_current_state() {
    let agent = greedy_q_agent();
    let state = health_state(2);
    let action = RlAction::Continue;

    // Pre-populate the NEXT state with high Q-values by repeated positive updates
    let next_state = health_state(0);
    for _ in 0..10 {
        agent.update(&next_state, &RlAction::Scale, 1.0, &next_state, false);
    }
    // Q(next_state, Scale) is now significantly positive after 10 updates.

    // Current state is still uninitialized: Q(state, .) = 0.0 for all actions

    // Update current state with reward=0.0
    // CORRECT behavior (next_state used): target = 0.0 + gamma * max Q(next_state, .) > 0
    //   -> Q(state, action) INCREASES toward the bootstrapped future value
    // BUG behavior (state passed twice): target = 0.0 + gamma * max Q(state, .) = 0.0
    //   -> Q(state, action) stays at 0.0 (target == current_q == 0, delta = 0)
    let q_before = agent.get_q_value(&state, &action);
    assert_eq!(q_before, 0.0, "Q should be 0.0 before update");

    agent.update(&state, &action, 0.0, &next_state, false);

    let q_after = agent.get_q_value(&state, &action);
    assert!(
        q_after > 0.0,
        "Q(S,a) must be positive after update with reward=0 but valuable next_state. \
         If Q(S,a) == 0.0, the Bellman update is passing the same state twice instead of \
         using next_state. Got Q(S,a) = {}",
        q_after
    );
}

// ---------------------------------------------------------------------------
// Regression 2: Agent trait dispatch also uses next_state correctly
// ---------------------------------------------------------------------------
#[test]
fn test_agent_trait_bellman_correctness() {
    let agent = greedy_q_agent();
    let state = health_state(3);
    let next_state = health_state(0);
    let action = RlAction::Continue;

    // Pre-populate next_state with a positive Q-value
    agent.update(&next_state, &RlAction::Scale, 1.0, &next_state, false);

    // Use the Agent trait (the same dispatch path RlOrchestrator uses)
    let q_before = agent.get_q_value(&state, &action);
    Agent::update(&agent, &state, &action, 0.0, &next_state, false);
    let q_after = agent.get_q_value(&state, &action);

    assert!(
        q_after > q_before,
        "Agent trait update must produce positive Q-value from zero-reward + valuable next_state. \
         Q before={}, Q after={}. If equal, the Agent trait dispatch is broken.",
        q_before,
        q_after
    );
}

// ---------------------------------------------------------------------------
// Test A4: Q-value update magnitude differs between γ=0.99 and γ=0.5
// ---------------------------------------------------------------------------
#[test]
fn test_a4_discount_factor_affects_q_update_magnitude() {
    // Same state, same reward. Higher gamma means more bootstrapping from next_state,
    // so the target is higher, and the resulting Q-update is larger.
    //
    // Setup:
    //   - Pre-populate next_state with Q(next_state, Continue) = 1.0 (after one update)
    //   - Update (state, Continue) with r=0.0, non-terminal
    //   - gamma=0.99: target = 0.0 + 0.99 * 1.0 = 0.99; delta = 0.1 * (0.99 - 0) = 0.099
    //   - gamma=0.50: target = 0.0 + 0.50 * 1.0 = 0.50; delta = 0.1 * (0.50 - 0) = 0.050
    //   - Assert: delta_0_99 > delta_0_50

    // Agent with γ=0.99
    let agent_high_gamma = QLearning::with_hyperparams(0.1, 0.99, 0.0);
    // Agent with γ=0.50
    let agent_low_gamma = QLearning::with_hyperparams(0.1, 0.50, 0.0);

    let state = health_state(2);
    let next_state = health_state(1);
    let action = RlAction::Continue;

    // Seed next_state with Q(next_state, Continue) ≈ 1.0 in both agents.
    // One update: r=1.0, terminal=true -> Q = alpha * r = 0.1 * 1.0 = 0.1
    // Ten updates chained to accumulate: use non-terminal self-bootstrap.
    for _ in 0..20 {
        agent_high_gamma.update(&next_state, &action, 1.0, &next_state, false);
        agent_low_gamma.update(&next_state, &action, 1.0, &next_state, false);
    }

    // Verify both agents have the same Q(next_state) after identical seeding.
    let q_next_high = agent_high_gamma.get_q_value(&next_state, &action);
    let q_next_low = agent_low_gamma.get_q_value(&next_state, &action);
    // They differ because gamma differs in the self-bootstrap, but both are positive.
    assert!(
        q_next_high > 0.0,
        "Q(next_state) must be positive for high gamma agent"
    );
    assert!(
        q_next_low > 0.0,
        "Q(next_state) must be positive for low gamma agent"
    );
    // High gamma agent bootstraps more aggressively, so q_next_high >= q_next_low
    assert!(
        q_next_high >= q_next_low,
        "Higher gamma should yield higher Q(next_state) after self-bootstrap: \
         high={:.4}, low={:.4}",
        q_next_high,
        q_next_low
    );

    // Now update the SAME (state, action) with r=0.0 in both agents.
    let q_before_high = agent_high_gamma.get_q_value(&state, &action);
    let q_before_low = agent_low_gamma.get_q_value(&state, &action);
    assert_eq!(
        q_before_high, 0.0,
        "state must be unvisited for high-gamma agent"
    );
    assert_eq!(
        q_before_low, 0.0,
        "state must be unvisited for low-gamma agent"
    );

    agent_high_gamma.update(&state, &action, 0.0, &next_state, false);
    agent_low_gamma.update(&state, &action, 0.0, &next_state, false);

    let q_after_high = agent_high_gamma.get_q_value(&state, &action);
    let q_after_low = agent_low_gamma.get_q_value(&state, &action);

    let delta_high = q_after_high - q_before_high;
    let delta_low = q_after_low - q_before_low;

    assert!(
        delta_high > delta_low,
        "Higher γ (0.99) should produce larger Q-update magnitude than lower γ (0.50) \
         given the same next_state Q-values. delta_high={:.6}, delta_low={:.6}",
        delta_high,
        delta_low
    );
}

// ---------------------------------------------------------------------------
// Test A5: Larger α produces larger Q-update magnitude
// ---------------------------------------------------------------------------
#[test]
fn test_a5_learning_rate_scales_q_update_magnitude() {
    // delta = alpha * (target - current_q)
    // With identical state/reward/next_state, higher alpha => larger delta.
    //
    // Setup:
    //   - Agent A: alpha=0.5, Agent B: alpha=0.01
    //   - Both start with Q(state, Continue) = 0.0 (unvisited)
    //   - Update with r=1.0, terminal=true -> target=1.0
    //   - Agent A delta = 0.5 * (1.0 - 0) = 0.5
    //   - Agent B delta = 0.01 * (1.0 - 0) = 0.01
    //   - Assert: delta_A > delta_B

    let agent_large_alpha = QLearning::with_hyperparams(0.5, 0.99, 0.0);
    let agent_small_alpha = QLearning::with_hyperparams(0.01, 0.99, 0.0);

    let state = health_state(2);
    let next_state = health_state(1);
    let action = RlAction::Continue;

    let q_before_large = agent_large_alpha.get_q_value(&state, &action);
    let q_before_small = agent_small_alpha.get_q_value(&state, &action);
    assert_eq!(
        q_before_large, 0.0,
        "state must be unvisited for large-alpha agent"
    );
    assert_eq!(
        q_before_small, 0.0,
        "state must be unvisited for small-alpha agent"
    );

    // Terminal update with positive reward: target = r = 1.0 (no bootstrap)
    agent_large_alpha.update(&state, &action, 1.0, &next_state, true);
    agent_small_alpha.update(&state, &action, 1.0, &next_state, true);

    let q_after_large = agent_large_alpha.get_q_value(&state, &action);
    let q_after_small = agent_small_alpha.get_q_value(&state, &action);

    let delta_large = q_after_large - q_before_large;
    let delta_small = q_after_small - q_before_small;

    assert!(
        delta_large > delta_small,
        "Larger α (0.5) should produce larger Q-update magnitude than smaller α (0.01). \
         delta_large={:.4}, delta_small={:.4}",
        delta_large,
        delta_small
    );

    // Verify exact magnitudes
    let expected_large = 0.5 * 1.0; // alpha * (target - current) = 0.5 * 1.0
    let expected_small = 0.01 * 1.0; // alpha * (target - current) = 0.01 * 1.0

    assert!(
        (delta_large - expected_large).abs() < 1e-5,
        "Large-alpha delta should be exactly alpha*target={:.4}: got {:.6}",
        expected_large,
        delta_large
    );
    assert!(
        (delta_small - expected_small).abs() < 1e-5,
        "Small-alpha delta should be exactly alpha*target={:.4}: got {:.6}",
        expected_small,
        delta_small
    );
}
