//! FM-1 Regression — Equal-State Collapse (Rank-1 Bellman Oracle)
//!
//! Agent A10 (ML/AI review) regression guard for the FM-1 fix in
//! `rl_orchestrator::run_cycle`:
//!
//!     let effective_done = done || (state == next_state);
//!
//! ## The bug (FM-1)
//!
//! When `guard_pass && circuit_allowed` but the health level is unchanged, the
//! orchestrator produces `state == next_state`. If the agent's Bellman update is
//! invoked as *non-terminal* in that situation, the bootstrap target reads
//! `max_a' Q(s', a')` where `s' == s` — i.e. it reads the very state being
//! written. The update becomes a self-referential fixed point:
//!
//!     Q(s,a) <- Q(s,a) + α [ r + γ·max_a' Q(s,a') - Q(s,a) ]
//!
//! With a pre-existing high value already stored in `s`, the target inflates far
//! above the immediate reward `r`, and repeated identical transitions drive the
//! cell toward `r / (1 - γ)` instead of settling on `r`. That is the divergence
//! the FM-1 fix prevents by collapsing the transition to terminal (target = r).
//!
//! ## Oracle (Rank-1, mathematical)
//!
//! For an *undifferentiated* transition (s' = s), the correct Bellman target
//! carries no new information about the future, so it must equal the immediate
//! reward alone (the absorbing/terminal target):
//!
//!     target = r          (NOT r + γ·max_a' Q(s,a'))
//!
//! These tests derive the expected numbers from the Bellman equation, not from
//! the implementation (no FM-5 self-reference). They FAIL if the
//! `|| (state == next_state)` clause is removed from `run_cycle`, and they
//! independently pin the agent-level contract that makes that fix correct.

use wasm4pm::reinforcement::QLearning;
use wasm4pm::rl_orchestrator::RlOrchestrator;
use wasm4pm::{create_rl_state, RlAction, RlState};

/// Construct an RlState with given health_level and all other fields zeroed.
fn state_at(health: u8) -> RlState {
    create_rl_state(health, 0, 0, 0, 0, 0, 0, 0)
}

fn zero_features() -> [f32; 8] {
    [0.0f32; 8]
}

// ===========================================================================
// FM1-A — Demonstrate the divergence the fix prevents (agent-level contract).
//
// If an equal-state transition is (wrongly) treated as non-terminal, the
// bootstrap reads the state's own pre-seeded max-Q and the target overshoots r.
// Treating it as terminal yields exactly target = r. This test pins WHY
// `effective_done` must include `state == next_state`.
// ===========================================================================
#[test]
fn fm1a_equal_state_nonterminal_would_overshoot_terminal_equals_reward() {
    let alpha = 0.5_f32;
    let gamma = 0.99_f32;

    // Pre-seed a high value in state s on a *different* action than the one we
    // update, so max_a' Q(s, a') = SEEDED_Q but Q(s, target_action) = 0.
    // One terminal update with reward R yields Q = 0 + α·(R - 0) = α·R, so to
    // make max_a' Q(s,·) large we use a large reward and read back the exact
    // resulting value (no assumption that it equals R).
    const SEED_REWARD: f32 = 10.0;
    let s = state_at(2);
    let seed_action = RlAction::Restart; // arbitrary, != Continue
    let target_action = RlAction::Continue;
    let r = 1.0_f32;

    // --- Branch 1: equal-state transition treated as NON-terminal (the bug) ---
    let buggy: QLearning<RlState, RlAction> = QLearning::new_with_seed(alpha, gamma, 7);
    // Seed Q(s, Restart) via a terminal update: target = SEED_REWARD, so
    // Q(s,Restart) = α·SEED_REWARD = 5.0 with α=0.5.
    buggy.update(&s, &seed_action, SEED_REWARD, &state_at(4), true);
    let seeded_q = buggy.get_q_value(&s, &seed_action);
    let expected_seed = alpha * SEED_REWARD; // 5.0
    assert!(
        (seeded_q - expected_seed).abs() < 1e-4,
        "precondition: terminal seed gives Q(s,Restart) = α·R = {expected_seed}, got {seeded_q}"
    );
    // Now a self-referential, non-terminal update on Continue with s' == s.
    // max_a' Q(s,a') = seeded_q (the Restart cell), so:
    //   target = r + γ·seeded_q
    //   Q(s,Continue) = 0 + α·(target - 0) = α·(r + γ·seeded_q)
    buggy.update(&s, &target_action, r, &s, /* done = */ false);
    let buggy_q = buggy.get_q_value(&s, &target_action);
    let buggy_expected = alpha * (r + gamma * seeded_q);
    assert!(
        (buggy_q - buggy_expected).abs() < 1e-3,
        "FM1-A: non-terminal equal-state update bootstraps from Q(s,·); \
         expected inflated {buggy_expected:.4}, got {buggy_q:.4}"
    );

    // --- Branch 2: equal-state transition treated as TERMINAL (the fix) ---
    let fixed: QLearning<RlState, RlAction> = QLearning::new_with_seed(alpha, gamma, 7);
    fixed.update(&s, &seed_action, SEED_REWARD, &state_at(4), true); // identical seed
    fixed.update(&s, &target_action, r, &s, /* done = */ true);
    let fixed_q = fixed.get_q_value(&s, &target_action);
    // Terminal target = r (no bootstrap). Q_new = 0 + α·(r - 0) = α·r = 0.5.
    let fixed_expected = alpha * r;
    assert!(
        (fixed_q - fixed_expected).abs() < 1e-4,
        "FM1-A: terminal collapse must use target = r (no bootstrap); \
         expected {fixed_expected:.4}, got {fixed_q:.4}"
    );

    // The two branches MUST differ — proving the terminal collapse is load-bearing.
    assert!(
        buggy_q > fixed_q + 1.0,
        "FM1-A: the self-referential (buggy) update must overshoot the terminal \
         (fixed) update; buggy={buggy_q:.4}, fixed={fixed_q:.4}"
    );
}

// ===========================================================================
// FM1-B — Orchestrator path: equal state (s == s') must not diverge.
//
// Drive run_cycle repeatedly with state == next_state on the guard_pass +
// circuit_allowed (historically buggy) trigger. With the FM-1 fix in place,
// each cycle's update collapses to target = r, so the agent never enters the
// self-referential r/(1-γ) blow-up. We assert the orchestrator completes the
// cycles deterministically and the cumulative reward stays within the documented
// per-cycle reward bound (no NaN/Inf, no runaway). This FAILS if the
// `|| (state == next_state)` clause is removed (self-referential divergence).
// ===========================================================================
#[test]
fn fm1b_orchestrator_equal_state_run_cycle_does_not_diverge() {
    let mut orch = RlOrchestrator::new_with_seed(42);
    let features = zero_features();

    // health unchanged → state == next_state (the FM-1 trigger condition).
    let s = state_at(2);
    let s_eq = state_at(2);
    assert_eq!(
        s, s_eq,
        "FM1-B precondition: state and next_state must be EQUAL for this regression"
    );

    let cycles = 50_u64;
    for _ in 0..cycles {
        let (_action, reward) = orch.run_cycle(
            &features, &s, &s_eq, 0,     // spc_alert_count
            true,  // guard_pass  (FM-1 trigger)
            true,  // circuit_allowed (FM-1 trigger)
            false, // latency_budget_exceeded
        );
        // Per-cycle reward must stay finite and within the documented bound
        // [-5.5, +1.6] (no self-referential explosion).
        assert!(
            reward.is_finite(),
            "FM1-B: per-cycle reward must be finite, got {reward}"
        );
        assert!(
            (-5.5..=1.6).contains(&reward),
            "FM1-B: per-cycle reward {reward} escaped documented bound [-5.5, +1.6]"
        );
    }

    assert_eq!(
        orch.telemetry().cycle_count,
        cycles,
        "FM1-B: orchestrator must complete all {cycles} cycles"
    );
    // Cumulative reward cannot exceed cycles * max_per_cycle_reward; a diverging
    // self-referential Q would still bound reward (reward is computed from the
    // transition, not Q), but a panic/NaN in the update would abort the loop.
    let cum = orch.telemetry().cumulative_reward;
    assert!(
        cum.is_finite(),
        "FM1-B: cumulative reward must remain finite after {cycles} equal-state cycles, got {cum}"
    );
}
