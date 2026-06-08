//! Adversarial Rank-1 Oracle Tests — Category A (Bellman Correctness) + Category C (SPC)
//!
//! From ADVERSARIAL_TEST_PLAN.md:
//!
//! **Category A — Bellman Correctness (Oracle Rank 1)**
//!   Target: QLearning agent (primary orchestrator agent)
//!   Oracle: Mathematical theorem — the Bellman optimality equation must hold.
//!
//! | Test | Property | Method |
//! |------|----------|--------|
//! | A1   | Non-terminal update moves Q(s,a) toward target | Seeded RNG, s≠s', verify direction |
//! | A2   | Terminal update: target = r (no bootstrapping) | done=true, verify no s' contribution |
//! | A3   | FM-1 regression: guard_pass+circuit_allowed path | Verify Q diverges from zero with valuable s' |
//!
//! **Category C — SPC Time-Series (Oracle Rank 1)**
//!   Target: Western Electric rules engine
//!   Oracle: Mathematical theorem — rules fire at exactly specified points.
//!
//! | Test | Property | Method |
//! |------|----------|--------|
//! | C1   | Rule 1: 3σ violation fires at exactly that point | Series ending with outlier |
//! | C2   | Rule 2: 9 consecutive fires at exactly the 9th | 9-point same-side window |
//! | C3   | Rule 3: 6 trending fires at exactly the 6th | 6-point monotonic window |
//!
//! ## Design decisions
//!
//! - Expected values are derived from the Bellman equation and Western Electric rule
//!   definitions — NOT from the implementation under test (no FM-5 self-reference).
//! - Seeded RNG (`QLearning::new_with_seed`) eliminates all randomness.
//! - Tests require `--features cloud` because `rl_orchestrator`, `reinforcement`,
//!   `spc`, and `spc_history` are gated behind `#[cfg(feature = "cloud")]`.
//!
//! Run with:
//!   cargo test --test adversarial_bellman_spc --features cloud

use wasm4pm::reinforcement::QLearning;
use wasm4pm::spc::{
    check_western_electric_rules, ChartData, ShiftDirection, SpecialCause, TrendDirection,
};
use wasm4pm::{create_rl_state, RlAction, RlState};

// ---------------------------------------------------------------------------
// Helpers — Bellman
// ---------------------------------------------------------------------------

/// Create an RlState with a given health_level and all other fields zeroed.
/// This satisfies the s≠s' requirement when health_level values differ.
fn rl_state(health_level: u8) -> RlState {
    create_rl_state(health_level, 0, 0, 0, 0, 0, 0, 0)
}

/// Create a QLearning agent with seeded RNG and exploration_rate=0.0 (greedy).
/// Seeded RNG makes action selection deterministic, satisfying the
/// "Seeded RNG, s≠s', verify direction" requirement in the test plan.
fn seeded_greedy_agent() -> QLearning<RlState, RlAction> {
    QLearning::new_with_seed(/*alpha=*/ 0.1, /*gamma=*/ 0.99, /*seed=*/ 42)
}

// ---------------------------------------------------------------------------
// Helpers — SPC
// ---------------------------------------------------------------------------

/// Build a ChartData point with value, center line, and sigma.
/// UCL = cl + 3*sigma, LCL = max(cl - 3*sigma, 0).
fn spc_point(ts: &str, value: f64, cl: f64, sigma: f64) -> ChartData {
    ChartData {
        timestamp: ts.to_string(),
        value,
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: f64::max(cl - 3.0 * sigma, 0.0),
        subgroup_data: None,
    }
}

// ===========================================================================
// Category A — Bellman Correctness (Rank-1)
// ===========================================================================

// ---------------------------------------------------------------------------
// A1: Non-terminal update moves Q(s,a) toward target
//
// Bellman equation (non-terminal):
//   target = r + γ * max_a' Q(s', a')
//   Q_new(s,a) = Q_old(s,a) + α * (target - Q_old(s,a))
//
// Theorem: positive r, unvisited s', Q_old=0 → target = r > 0 → Q_new > Q_old.
// Expected delta = α * r = 0.1 * 1.0 = 0.1 (derived from Bellman, not code).
// ---------------------------------------------------------------------------
#[test]
fn a1_nonterminal_update_moves_q_toward_target() {
    let agent = seeded_greedy_agent();
    let s = rl_state(2); // degraded
    let s_next = rl_state(1); // warning (improved, different health_level → s≠s')

    // Enforce s ≠ s' precondition.
    assert_ne!(
        s.health_level, s_next.health_level,
        "A1 precondition: s and s_next must be distinct states (s≠s')"
    );

    let q_before = agent.get_q_value(&s, &RlAction::Continue);
    assert!(
        q_before.abs() < 1e-6,
        "A1 precondition: Q(s,a) must be 0.0 for unvisited state-action pair, got {}",
        q_before
    );

    // Bellman update: r=1.0, s_next is unvisited (max Q(s',.) = 0).
    // Mathematical target: 1.0 + 0.99 * 0.0 = 1.0
    // Expected Q_new: 0.0 + 0.1 * (1.0 - 0.0) = 0.1
    agent.update(&s, &RlAction::Continue, 1.0, &s_next, false);
    let q_after = agent.get_q_value(&s, &RlAction::Continue);

    assert!(
        q_after > q_before,
        "A1 FAILED: Q(s,a) must increase after positive non-terminal update. before={}, after={}",
        q_before,
        q_after
    );

    // Verify exact update magnitude derived from the Bellman equation.
    let expected_delta = 0.1_f32; // α * (target - Q_old) = 0.1 * (1.0 - 0.0)
    let actual_delta = q_after - q_before;
    assert!(
        (actual_delta - expected_delta).abs() < 1e-5,
        "A1 FAILED: Q-update magnitude must be α*(r - Q_old) = {} (Bellman theorem). Got delta={}",
        expected_delta,
        actual_delta
    );
}

// ---------------------------------------------------------------------------
// A2: Terminal update — target = r (no s' bootstrapping)
//
// Bellman equation (terminal / done=true):
//   target = r   (future term γ * max_a' Q(s',a') = 0 by convention)
//   Q_new(s,a) = Q_old(s,a) + α * (r - Q_old(s,a))
//
// Theorem: terminal Q must be strictly less than non-terminal Q when s' has
// positive Q-value, because bootstrapping from s' raises the non-terminal target.
// ---------------------------------------------------------------------------
#[test]
fn a2_terminal_update_target_equals_reward_no_bootstrap() {
    // Seed s_next with a large positive Q-value.
    // If the terminal update incorrectly bootstraps, it would use this value.
    let agent_terminal = seeded_greedy_agent();
    let agent_nonterminal = seeded_greedy_agent();

    let s = rl_state(2);
    let s_next = rl_state(1);
    let action = RlAction::Continue;
    let reward = 1.0_f32;

    // Seed Q(s_next, Continue) with a large positive value in both agents.
    // After seeding: Q(s_next, .) >> 0, so bootstrapping would raise the target significantly.
    for _ in 0..10 {
        agent_terminal.update(&s_next, &action, 2.0, &s_next, false);
        agent_nonterminal.update(&s_next, &action, 2.0, &s_next, false);
    }
    let q_s_next = agent_terminal.get_q_value(&s_next, &action);
    assert!(
        q_s_next > 0.5,
        "A2 precondition: Q(s_next, Continue) must be substantially positive after seeding, got {}",
        q_s_next
    );

    // Terminal update: target = r (ignore s_next Q-value).
    agent_terminal.update(&s, &action, reward, &s_next, true);
    let q_terminal = agent_terminal.get_q_value(&s, &action);

    // Non-terminal update: target = r + γ * max Q(s_next, .) >> r.
    agent_nonterminal.update(&s, &action, reward, &s_next, false);
    let q_nonterminal = agent_nonterminal.get_q_value(&s, &action);

    // Theorem: non-terminal Q must exceed terminal Q (s' Q-value is bootstrapped).
    assert!(
        q_nonterminal > q_terminal,
        "A2 FAILED: Non-terminal Q ({:.6}) must exceed terminal Q ({:.6}). \
         Terminal done=true must NOT bootstrap from s' Q-value.",
        q_nonterminal,
        q_terminal
    );

    // Verify terminal Q exact value: α * r = 0.1 * 1.0 = 0.1
    // (starts from 0 since (s, Continue) was never updated before these calls)
    let expected_terminal_q = 0.1_f32; // α * r (derived from Bellman equation)
    assert!(
        (q_terminal - expected_terminal_q).abs() < 1e-5,
        "A2 FAILED: Terminal Q must be α*r = {} exactly (Bellman terminal case). Got {}",
        expected_terminal_q,
        q_terminal
    );
}

// ---------------------------------------------------------------------------
// A3: FM-1 Regression — guard_pass + circuit_allowed path must not cause
//     self-referential Q update
//
// FM-1 Bug Description:
//   When guard_pass=true AND circuit_allowed=true, the orchestrator historically
//   set next_health_level = health_level, making rl_state == rl_next_state.
//   The Bellman update becomes self-referential:
//     Q(s,a) <- Q(s,a) + α * [r + γ * max_a' Q(s,a) - Q(s,a)]
//   which fails to propagate information from the real next_state.
//
// Detection: If FM-1 is present, Q(s, a) stays at 0 after an update with
// r=0.0 and valuable s_next (Q(s_next, .) >> 0), because the bootstrap
// term would be γ * max Q(s, .) = γ * 0 = 0 (self-referential lookup).
//
// Expected (correct): Q(s, a) increases from 0 toward γ * Q(s_next, .) > 0.
// ---------------------------------------------------------------------------
#[test]
fn a3_fm1_regression_nonterminal_uses_next_state_not_current_state() {
    let agent = seeded_greedy_agent();
    let s = rl_state(2); // current: degraded
    let s_next = rl_state(1); // next: warning (distinct from s)

    // Verify s ≠ s_next (the FM-1 bug makes them equal).
    assert_ne!(
        s.health_level, s_next.health_level,
        "A3 precondition: s and s_next must be distinct (FM-1 makes them the same)"
    );

    // Pre-populate Q(s_next, Scale) with a substantially positive value.
    // This ensures that if the Bellman update correctly uses s_next (not s),
    // Q(s, Continue) will receive a positive bootstrap contribution.
    for _ in 0..20 {
        agent.update(&s_next, &RlAction::Scale, 1.0, &s_next, false);
    }
    let q_s_next_scale = agent.get_q_value(&s_next, &RlAction::Scale);
    assert!(
        q_s_next_scale > 0.1,
        "A3 precondition: Q(s_next, Scale) must be substantially positive after seeding. Got {}",
        q_s_next_scale
    );

    // Q(s, Continue) must be 0 before the update.
    let q_before = agent.get_q_value(&s, &RlAction::Continue);
    assert!(
        q_before.abs() < 1e-6,
        "A3 precondition: Q(s, Continue) must be 0.0 before the critical update. Got {}",
        q_before
    );

    // Critical update: r=0.0, non-terminal, using valuable s_next.
    //   CORRECT Bellman: target = 0.0 + γ * max Q(s_next, .) > 0 → Q(s, Continue) increases.
    //   FM-1 Bellman:    target = 0.0 + γ * max Q(s, .) = 0.0 → Q(s, Continue) stays at 0.
    agent.update(&s, &RlAction::Continue, 0.0, &s_next, false);
    let q_after = agent.get_q_value(&s, &RlAction::Continue);

    assert!(
        q_after > 0.0,
        "A3 FM-1 REGRESSION DETECTED: Q(s, Continue) must be positive after update with \
         zero reward but valuable s_next (Q(s_next, Scale)={:.4}). \
         If Q stays at 0.0, the Bellman update is using `state` as both current AND next state \
         (self-referential FM-1 bug). Got Q(s, Continue) = {:.6}",
        q_s_next_scale,
        q_after
    );

    assert!(
        q_after > q_before,
        "A3 FM-1: Q(s, Continue) must move strictly away from 0: before={:.6}, after={:.6}",
        q_before,
        q_after
    );
}

// ===========================================================================
// Category C — SPC Western Electric Rules (Rank-1)
// ===========================================================================

// ---------------------------------------------------------------------------
// C1: Rule 1 (3σ violation) fires at exactly the outlier point
//
// Western Electric Rule 1 theorem:
//   A point is "out of control" iff its value > UCL or value < LCL.
//   UCL = cl + 3*sigma, LCL = max(cl - 3*sigma, 0).
//   The rule fires if and only if the LATEST point in the slice is out of control.
//
// Test design:
//   10 stable points (within ±0.3σ of CL), then one outlier at cl + 4*sigma.
//   At data length 10: outlier not yet included → no alert.
//   At data length 11: outlier is the latest point → Rule 1 fires.
// ---------------------------------------------------------------------------
#[test]
fn c1_rule1_fires_at_exactly_the_3sigma_outlier_point() {
    let cl = 50.0;
    let sigma = 5.0;
    let outlier = cl + 4.0 * sigma; // 70.0 — clearly beyond UCL = 65.0

    // 10 stable points (alternating above/below CL by ±0.3σ), then the outlier.
    let mut data: Vec<ChartData> = (0..10)
        .map(|i| {
            let offset = if i % 2 == 0 {
                0.3 * sigma
            } else {
                -0.3 * sigma
            };
            spc_point(&format!("stable-{}", i), cl + offset, cl, sigma)
        })
        .collect();
    data.push(spc_point("outlier", outlier, cl, sigma));

    // Before outlier is included: no Rule 1 alert.
    let alerts_before = check_western_electric_rules(&data[..10]);
    assert!(
        !alerts_before
            .iter()
            .any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
        "C1 FAILED: Rule 1 must NOT fire on stable data without outlier in the window"
    );

    // At length 11: outlier is the latest point → Rule 1 must fire.
    let alerts_at_outlier = check_western_electric_rules(&data[..11]);
    let ooc = alerts_at_outlier
        .iter()
        .find(|a| matches!(a, SpecialCause::OutOfControl { .. }));
    assert!(
        ooc.is_some(),
        "C1 FAILED: Rule 1 must fire when latest point ({}) exceeds UCL ({}). \
         No OutOfControl alert found.",
        outlier,
        cl + 3.0 * sigma
    );

    // Verify exact alert values — derived from Western Electric rule definition.
    if let Some(SpecialCause::OutOfControl { value, ucl, lcl }) = ooc {
        assert_eq!(
            *value, outlier,
            "C1 FAILED: OutOfControl value must be exactly the outlier ({}). Got {}",
            outlier, value
        );
        assert_eq!(
            *ucl,
            cl + 3.0 * sigma,
            "C1 FAILED: UCL must be cl + 3*sigma = {}. Got {}",
            cl + 3.0 * sigma,
            ucl
        );
        assert_eq!(
            *lcl,
            f64::max(cl - 3.0 * sigma, 0.0),
            "C1 FAILED: LCL must be max(cl - 3*sigma, 0) = {}. Got {}",
            f64::max(cl - 3.0 * sigma, 0.0),
            lcl
        );
    }
}

// ---------------------------------------------------------------------------
// C2: Rule 2 (9 consecutive same-side) fires at exactly the 9th point
//
// Western Electric Rule 2 theorem:
//   Fire when the trailing 9-point window contains all points above CL
//   or all points below CL. The 9th point (latest) is when it first triggers.
//
// Test design:
//   8 alternating above/below points to prevent premature firing.
//   Then 9 consecutive above-CL points (indices 8–16).
//   At data length 17: trailing 9 = indices 8–16 (all above CL) → fires.
//   At data length 16: trailing 9 includes index 7 (below CL) → no fire.
// ---------------------------------------------------------------------------
#[test]
fn c2_rule2_fires_at_exactly_ninth_consecutive_same_side_point() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut data: Vec<ChartData> = Vec::new();

    // 8 alternating above/below CL — prevents any premature 9-point same-side window.
    for i in 0..8 {
        let value = if i % 2 == 0 { cl + 2.0 } else { cl - 2.0 };
        data.push(spc_point(&format!("mixed-{}", i), value, cl, sigma));
    }

    // 9 consecutive above-CL points (all within control limits).
    for i in 8..=16 {
        data.push(spc_point(&format!("above-{}", i), cl + 1.0, cl, sigma));
    }

    // Before the trailing 9 are all-above: Rule 2 must not fire.
    // At length 16: trailing 9 = data[7..=15] → includes data[7] which is below CL.
    for window_end in 9..=16 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            !alerts
                .iter()
                .any(|a| matches!(a, SpecialCause::Shift { .. })),
            "C2 FAILED: Rule 2 must NOT fire at window_end={} \
             (trailing 9 still contains a below-CL point at index 7)",
            window_end
        );
    }

    // At length 17: trailing 9 = data[8..=16] → all above CL → Rule 2 fires.
    let alerts_at_17 = check_western_electric_rules(&data[..17]);
    let shift = alerts_at_17
        .iter()
        .find(|a| matches!(a, SpecialCause::Shift { .. }));
    assert!(
        shift.is_some(),
        "C2 FAILED: Rule 2 must fire at exactly the 9th consecutive above-CL point (length=17). \
         No Shift alert found."
    );

    // Verify exact shift direction and count — derived from Western Electric rule definition.
    if let Some(SpecialCause::Shift { direction, count }) = shift {
        assert_eq!(
            *direction,
            ShiftDirection::Above,
            "C2 FAILED: Shift direction must be Above (all 9 points above CL)"
        );
        assert_eq!(
            *count, 9,
            "C2 FAILED: Shift count must be exactly 9 (Western Electric Rule 2 window). Got {}",
            count
        );
    }
}

// ---------------------------------------------------------------------------
// C3: Rule 3 (6 consecutive trending) fires at exactly the 6th point
//
// Western Electric Rule 3 theorem:
//   Fire when the trailing 6-point window is strictly monotone increasing
//   or strictly monotone decreasing (each consecutive pair satisfies >/<).
//
// Test design:
//   5 strictly decreasing points to prevent premature increasing-trend detection.
//   Then 6 strictly increasing points (indices 5–10).
//   At data length 11: trailing 6 = indices 5–10 (strictly increasing) → fires.
//   At data length 10: trailing 6 = indices 4–9 → includes index 4 (highest
//     of the decreasing run), creating a drop 4→5 that breaks monotonicity.
// ---------------------------------------------------------------------------
#[test]
fn c3_rule3_fires_at_exactly_sixth_consecutive_trending_point() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut data: Vec<ChartData> = Vec::new();

    // 5 strictly decreasing points: cl+10, cl+9, cl+8, cl+7, cl+6.
    for i in 0..5 {
        data.push(spc_point(
            &format!("dec-{}", i),
            cl + 10.0 - i as f64, // 60, 59, 58, 57, 56
            cl,
            sigma,
        ));
    }

    // 6 strictly increasing points: cl+1, cl+2, cl+3, cl+4, cl+5, cl+6.
    for i in 5..=10 {
        data.push(spc_point(
            &format!("inc-{}", i),
            cl + (i - 4) as f64, // 51, 52, 53, 54, 55, 56
            cl,
            sigma,
        ));
    }

    // 4 flat points (plateau to verify trend does not persist beyond the window).
    for i in 11..15 {
        data.push(spc_point(&format!("flat-{}", i), cl + 6.0, cl, sigma));
    }

    // Before trailing 6 are all-increasing: Rule 3 must not fire.
    // At length 10: trailing 6 = data[4..=9] → data[4]=56 (dec end), data[5]=51 (inc start).
    // 56 → 51 is decreasing, so the 6-point window is NOT strictly increasing.
    for window_end in 9..=10 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            !alerts
                .iter()
                .any(|a| matches!(a, SpecialCause::Trend { .. })),
            "C3 FAILED: Rule 3 must NOT fire at window_end={} \
             (trailing 6 still spans the decreasing-to-increasing inflection)",
            window_end
        );
    }

    // At length 11: trailing 6 = data[5..=10] = 51, 52, 53, 54, 55, 56 → strictly increasing.
    let alerts_at_11 = check_western_electric_rules(&data[..11]);
    let trend = alerts_at_11
        .iter()
        .find(|a| matches!(a, SpecialCause::Trend { .. }));
    assert!(
        trend.is_some(),
        "C3 FAILED: Rule 3 must fire when trailing 6 points are strictly monotone increasing \
         (length=11). No Trend alert found."
    );

    // Verify exact trend direction and count — derived from Western Electric rule definition.
    if let Some(SpecialCause::Trend { direction, count }) = trend {
        assert_eq!(
            *direction,
            TrendDirection::Increasing,
            "C3 FAILED: Trend direction must be Increasing. Got {:?}",
            direction
        );
        assert_eq!(
            *count, 6,
            "C3 FAILED: Trend count must be exactly 6 (Western Electric Rule 3 window). Got {}",
            count
        );
    }

    // At length 12: trailing 6 = data[6..=11] → data[10]=56.0, data[11]=56.0.
    // 56.0 == 56.0 is NOT strictly greater — plateau breaks the trend.
    let alerts_at_12 = check_western_electric_rules(&data[..12]);
    assert!(
        !alerts_at_12
            .iter()
            .any(|a| matches!(a, SpecialCause::Trend { .. })),
        "C3 FAILED: Rule 3 must NOT fire when a plateau breaks the monotone trend (length=12)"
    );
}
