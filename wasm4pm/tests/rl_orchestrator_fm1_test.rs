//! FM-1 Bellman self-reference oracle (Rank-1 mathematical oracle).
//!
//! Per `.claude/rules/ml-rl-testing.md`, FM-1 is: `next_state == state` in the
//! Bellman update — when `guard_pass && circuit_allowed`, callers may construct
//! `rl_next_state == rl_state`, making the bootstrap term self-referential.
//!
//! These tests deliberately construct `s != s'`, pre-seed `max_a' Q(s', a')`,
//! and assert post-update `Q(s, a)` matches the closed-form Bellman target.
//! Compile gate: `--features cloud` (rl_orchestrator is `#[cfg(feature = "cloud")]`).

use wasm4pm::reinforcement::QLearning;
use wasm4pm::rl_orchestrator::{AgentType, RlOrchestrator};
use wasm4pm::rl_state_serialization::{encode_rl_state_key, SerializedAgentQTable};
use wasm4pm::{create_rl_state, RlAction, RlState};

/// Two RlStates differing in at least two dims so their packed u64 keys differ.
fn distinct_states() -> (RlState, RlState) {
    let s = create_rl_state(2, 0, 0, 0, 0, 0, 0, 0);
    let s_next = create_rl_state(1, 3, 0, 0, 0, 0, 0, 0);
    (s, s_next)
}

fn key_of(s: &RlState) -> u64 {
    encode_rl_state_key(
        s.health_level, s.event_rate_q, s.activity_count_q, s.spc_alert_level,
        s.drift_status, s.rework_ratio_q, s.circuit_state, s.cycle_phase,
    )
}

#[test]
fn fm1_states_are_actually_distinct() {
    // Vacuity gate: if this fails, the rest of FM-1 is meaningless.
    let (s, s_next) = distinct_states();
    assert_ne!(key_of(&s), key_of(&s_next), "test states must encode distinctly");
    assert_ne!(s, s_next, "test states must be PartialEq-distinct");
}

#[test]
fn fm1_qlearning_direct_update_matches_bellman() {
    // Rank-1: closed-form Bellman target with alpha=1.0, gamma=0.5.
    // Seed Q(s', Scale)=4.0 first, then update Q(s, Continue) with r=1.0.
    // Predicted: Q_new(s, Continue) = 0 + 1.0 * (1.0 + 0.5 * 4.0 - 0) = 3.0.
    // FM-1 footprint (s/s' aliasing): bootstrap reads Q(s, .) = 0 -> Q_new = 1.0.
    let (s, s_next) = distinct_states();
    let agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(1.0, 0.5, 0.0);

    agent.update(&s_next, &RlAction::Scale, 4.0, &s_next, /*done*/ true);
    assert!((agent.get_q_value(&s_next, &RlAction::Scale) - 4.0).abs() < 1e-6);

    agent.update(&s, &RlAction::Continue, 1.0, &s_next, /*done*/ false);
    let q = agent.get_q_value(&s, &RlAction::Continue);
    assert!(
        (q - 3.0).abs() < 1e-6,
        "FM-1 detected: Q(s,Continue)={} but Bellman predicts 3.0",
        q
    );

    // Cross-contamination: Q(s', Scale) must be untouched.
    assert!((agent.get_q_value(&s_next, &RlAction::Scale) - 4.0).abs() < 1e-6);
}

#[test]
fn fm1_orchestrator_update_changes_q_directionally() {
    // Rank-2 domain contract via the orchestrator's trait-object update path:
    // a single update with s != s' must (a) move Q(s,a) and (b) move it in
    // the sign-direction of reward.
    let orch = RlOrchestrator::new_with_seed(42);
    assert_eq!(orch.active_agent(), AgentType::QLearning);
    let (s, s_next) = distinct_states();

    let q0 = q_value_for(&orch.export_all_q_tables(), &s, RlAction::Continue);
    orch.update(&s, &RlAction::Continue, 1.0, &s_next, false);
    let q1 = q_value_for(&orch.export_all_q_tables(), &s, RlAction::Continue);

    assert!(
        (q1 - q0).abs() > 1e-7,
        "Bellman update with s!=s' was a no-op: {} -> {} (FM-1 footprint)",
        q0, q1
    );
    assert!(q1 > q0, "positive reward must increase Q(s,a): {} -> {}", q0, q1);
}

/// Look up Q(state, action) for the active QLearning agent in exported tables.
/// Returns 0.0 for unvisited entries (matching QLearning's cold-start convention).
fn q_value_for(tables: &[SerializedAgentQTable], state: &RlState, action: RlAction) -> f32 {
    tables
        .iter()
        .find(|t| t.agent_type == AgentType::QLearning as u8)
        .and_then(|t| t.state_values.get(&key_of(state)))
        .and_then(|v| v.get(action as usize).copied())
        .unwrap_or(0.0)
}
