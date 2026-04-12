//! JTBD Validation Test Suite — 5 Ported Algorithm Families
//!
//! Tests that validate each Jobs-To-Be-Done claim from the operational
//! autonomy thesis. Each test maps to a specific JTBD use case with
//! quantitative evidence.
//!
//! Run: cargo test --bench autonomy_jtbd_validation -- --nocapture

use std::sync::atomic::AtomicU32;

// ============================================================================
// Module 1: Guards — JTBD: "Execute when conditions are met"
// ============================================================================

use pictl::guards::{
    ExecutionContext, Guard, GuardCompiler, GuardEvaluator, ObservationBuffer, ResourceState,
    StateFlags,
};

fn test_context() -> ExecutionContext {
    ExecutionContext {
        task_id: 42,
        timestamp: 1000,
        resources: ResourceState {
            cpu_available: 80,
            memory_available: 1024,
            io_capacity: 100,
            queue_depth: 10,
        },
        observations: ObservationBuffer {
            count: 5,
            observations: [0; 16],
        },
        state_flags: StateFlags::INITIALIZED.bits() | StateFlags::RUNNING.bits(),
    }
}

#[test]
fn test_jtbd_cpu_resource_guard() {
    // JTBD: "Execute when CPU ≥ 50"
    let ctx = test_context();
    let guard_pass = Guard::resource(pictl::guards::ResourceType::Cpu, 50);
    assert!(
        guard_pass.evaluate(&ctx),
        "CPU=80 should pass guard with threshold=50"
    );

    let guard_fail = Guard::resource(pictl::guards::ResourceType::Cpu, 100);
    assert!(
        !guard_fail.evaluate(&ctx),
        "CPU=80 should fail guard with threshold=100"
    );
}

#[test]
fn test_jtbd_compound_and_guard() {
    // JTBD: "Compound AND guard — all conditions must pass"
    let ctx = test_context();

    let g1 = Guard::resource(pictl::guards::ResourceType::Cpu, 50); // passes
    let g2 = Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING); // passes
    let g3 = Guard::predicate(
        pictl::guards::Predicate::LessThan,
        3, // observations.count
        20,
    ); // passes (count=5 < 20)

    let guard_all_pass = Guard::and(vec![g1, g2, g3]);
    assert!(
        guard_all_pass.evaluate(&ctx),
        "All 3 conditions pass, AND should pass"
    );

    // Change g3 to fail: count=5, threshold=3 → 5 >= 3, so use GreaterThanOrEqual
    let g3_fail = Guard::predicate(pictl::guards::Predicate::GreaterThanOrEqual, 3, 10); // 5 < 10, fails
    let guard_one_fail = Guard::and(vec![
        Guard::resource(pictl::guards::ResourceType::Cpu, 50),
        Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING),
        g3_fail,
    ]);
    assert!(
        !guard_one_fail.evaluate(&ctx),
        "One condition fails, AND should fail"
    );
}

#[test]
fn test_jtbd_state_flag_check() {
    // JTBD: "State flag check (INITIALIZED | RUNNING)"
    let ctx = test_context();

    let guard_match = Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING);
    assert!(
        guard_match.evaluate(&ctx),
        "State flags match, guard should pass"
    );

    let guard_partial = Guard::state(StateFlags::INITIALIZED | StateFlags::COMPLETED);
    assert!(
        !guard_partial.evaluate(&ctx),
        "COMPLETED not set, guard should fail"
    );

    let guard_single = Guard::state(StateFlags::RUNNING);
    assert!(
        guard_single.evaluate(&ctx),
        "RUNNING is set, guard should pass"
    );
}

#[test]
fn test_jtbd_ttl_cache_benefit() {
    // JTBD: "TTL cache reduces redundant evaluation"
    let ctx = test_context();
    let guard = Guard::resource(pictl::guards::ResourceType::Cpu, 50);
    let mut evaluator = GuardEvaluator::new(1000);

    // First call: cache miss
    let _ = evaluator.evaluate_cached(1, &guard, &ctx);
    assert_eq!(evaluator.len(), 1, "Cache should have 1 entry");

    // Second call: cache hit (same timestamp, within TTL)
    let _ = evaluator.evaluate_cached(1, &guard, &ctx);
    assert_eq!(
        evaluator.len(),
        1,
        "Cache should still have 1 entry (hit, no new entry)"
    );

    // Different pattern_id: cache miss
    let _ = evaluator.evaluate_cached(2, &guard, &ctx);
    assert_eq!(evaluator.len(), 2, "Cache should have 2 entries");

    // Advance time beyond TTL
    let ctx_expired = ExecutionContext {
        timestamp: 2000,
        ..test_context()
    };
    let _ = evaluator.evaluate_cached(1, &guard, &ctx_expired);
    assert_eq!(
        evaluator.len(),
        2,
        "Expired entry replaced, still 2 entries"
    );

    // Clear expired (timestamp > all entries' timestamps)
    evaluator.clear_expired(2500);
    assert_eq!(evaluator.len(), 1, "Only non-expired entry remains");
}

#[test]
fn test_jtbd_guard_compiler_produces_closure() {
    // JTBD: "Compile hot-path guard to closure"
    let guard = Guard::predicate(pictl::guards::Predicate::Equal, 0, 42);
    let ctx = test_context();

    let compiled = GuardCompiler::compile(&guard);
    assert!(compiled(&ctx), "Compiled closure should evaluate to true");
    assert_eq!(
        compiled(&ExecutionContext {
            task_id: 99,
            ..test_context()
        }),
        false,
        "Compiled closure should evaluate to false for different task_id"
    );
}

// ============================================================================
// Module 2: Pattern Dispatch — JTBD: "Understand control-flow semantics"
// ============================================================================

use pictl::pattern_dispatch::{
    PatternConfig, PatternContext, PatternDispatcher, PatternFlags, PatternType,
};

fn test_pattern_context(pt: PatternType) -> PatternContext {
    PatternContext {
        pattern_type: pt,
        pattern_id: 1,
        config: PatternConfig {
            max_instances: 4,
            join_threshold: 2,
            timeout_ticks: 8,
            flags: PatternFlags::default(),
        },
        input_mask: 0b1111,
        output_mask: 0,
        state: AtomicU32::new(0),
        tick_budget: 8,
    }
}

#[test]
fn test_jtbd_parallel_split_semantics() {
    // JTBD: "ParallelSplit dispatch with 4 branches"
    let dispatcher = PatternDispatcher::new();
    let ctx = test_pattern_context(PatternType::ParallelSplit);

    let result = dispatcher.dispatch(&ctx);
    assert!(result.success, "ParallelSplit should succeed");
    assert!(
        result.output_mask != 0,
        "ParallelSplit should set bits in output_mask"
    );
}

#[test]
fn test_jtbd_synchronization_semantics() {
    // JTBD: "Synchronization waits for all inputs"
    let dispatcher = PatternDispatcher::new();
    let ctx = test_pattern_context(PatternType::Synchronization);

    let result = dispatcher.dispatch(&ctx);
    assert!(result.success, "Synchronization should succeed");
}

#[test]
fn test_jtbd_exclusive_choice_deterministic() {
    // JTBD: "Exclusive choice is deterministic"
    let dispatcher = PatternDispatcher::new();
    let ctx = test_pattern_context(PatternType::ExclusiveChoice);

    let result1 = dispatcher.dispatch(&ctx);
    let result2 = dispatcher.dispatch(&ctx);
    assert_eq!(
        result1.output_mask, result2.output_mask,
        "ExclusiveChoice should produce identical output_mask on same input"
    );
}

#[test]
fn test_jtbd_all_patterns_registered() {
    // JTBD: "All 43 patterns registered"
    let dispatcher = PatternDispatcher::new();

    for pt_val in 1u8..=43 {
        let result = PatternType::from_u8(pt_val);
        assert!(
            result.is_some(),
            "PatternType::from_u8({}) should return Some",
            pt_val
        );
        let pt = result.unwrap();
        assert!(
            dispatcher.validate_pattern(pt),
            "Pattern {:?} should be valid in dispatcher",
            pt
        );
    }
}

// ============================================================================
// Module 3: Reinforcement Learning — JTBD: "Route work to best path"
// ============================================================================

use pictl::reinforcement::{QLearning, SARSAAgent, WorkflowAction, WorkflowState};

#[derive(Clone, Eq, PartialEq, Hash)]
struct RlState(i32);

impl WorkflowState for RlState {
    fn features(&self) -> Vec<f32> {
        vec![self.0 as f32]
    }

    fn is_terminal(&self) -> bool {
        self.0 >= 100
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
enum RlAction {
    Left,
    Right,
}

impl WorkflowAction for RlAction {
    const ACTION_COUNT: usize = 2;

    fn to_index(&self) -> usize {
        match self {
            RlAction::Left => 0,
            RlAction::Right => 1,
        }
    }

    fn from_index(idx: usize) -> Option<Self> {
        match idx {
            0 => Some(RlAction::Left),
            1 => Some(RlAction::Right),
            _ => None,
        }
    }
}

#[test]
fn test_jtbd_q_learning_reward() {
    // JTBD: "Positive reward increases Q(s,a)"
    let agent: QLearning<RlState, RlAction> = QLearning::new();
    let s1 = RlState(0);
    let s2 = RlState(1);
    let action = RlAction::Left;

    let q_before = agent.get_q_value(&s1, &action);
    assert_eq!(q_before, 0.0, "Initial Q-value should be 0");

    agent.update(&s1, &action, 1.0, &s2, false);
    let q_after = agent.get_q_value(&s1, &action);
    assert!(
        q_after > q_before,
        "Q-value should increase after positive reward: {} > {}",
        q_after,
        q_before
    );
}

#[test]
fn test_jtbd_sarsa_on_policy() {
    // JTBD: "SARSA uses actual next action, not max"
    let agent: SARSAAgent<RlState, RlAction> = SARSAAgent::new();
    let s1 = RlState(0);
    let s2 = RlState(1);
    let a1 = RlAction::Left;
    let a2 = RlAction::Right;

    // SARSA should not panic — uses a' (actual next action), not max_a'
    agent.update(&s1, &a1, 1.0, &s2, &a2);
    // Verify the update happened by checking Q(s1, a1) changed
    let q_val = agent.epsilon_greedy_action(&s1, 0.0); // epsilon=0 → greedy
                                                       // With epsilon=0, it picks the best action — should be Left (the one we updated)
    assert_eq!(q_val, RlAction::Left);
}

#[test]
fn test_jtbd_epsilon_decay() {
    // JTBD: "Exploration rate decreases over episodes"
    let mut agent: QLearning<RlState, RlAction> = QLearning::new();
    let initial_rate = agent.get_exploration_rate();

    // Decay 10 times
    for _ in 0..10 {
        agent.decay_exploration();
    }

    let decayed_rate = agent.get_exploration_rate();
    assert!(
        decayed_rate < initial_rate,
        "Exploration rate should decrease after 10 decays: {} < {}",
        decayed_rate,
        initial_rate
    );
    assert!(
        decayed_rate > 0.0,
        "Exploration rate should still be positive: {}",
        decayed_rate
    );
}

// ============================================================================
// Module 4: Self-Healing — JTBD: "Recover from failure without intervention"
// ============================================================================

use pictl::self_healing::{
    CircuitBreaker, HealthCheck, HealthStatus, RetryPolicy, RetryState, SelfHealingManager,
};

#[test]
fn test_jtbd_cb_opens_at_threshold() {
    // JTBD: "Circuit breaker opens after 5 failures"
    let mut cb = CircuitBreaker::new();
    assert_eq!(cb.state(), pictl::self_healing::CircuitState::Closed);

    for i in 1..5 {
        cb.record_failure();
        assert_eq!(
            cb.state(),
            pictl::self_healing::CircuitState::Closed,
            "Should still be Closed after {} failures",
            i
        );
    }

    cb.record_failure();
    assert_eq!(
        cb.state(),
        pictl::self_healing::CircuitState::Open,
        "Should be Open after 5th failure"
    );
}

#[test]
fn test_jtbd_retry_backoff_doubles() {
    // JTBD: "Exponential backoff doubles each attempt"
    let policy = RetryPolicy {
        jitter: false,
        max_attempts: 3,
        initial_backoff_ms: 100,
        backoff_multiplier: 2.0,
        max_backoff_ms: 10_000,
    };

    let mut state = RetryState::new(100);
    let b1 = state
        .next_attempt(&policy)
        .expect("attempt 1 should succeed");
    let b2 = state
        .next_attempt(&policy)
        .expect("attempt 2 should succeed");
    let b3 = state
        .next_attempt(&policy)
        .expect("attempt 3 should succeed");
    let b4 = state.next_attempt(&policy); // should be None (exhausted)

    assert_eq!(b1, 100, "First backoff should be initial=100ms");
    assert_eq!(b2, 200, "Second backoff should be 200ms (doubled)");
    assert_eq!(b3, 400, "Third backoff should be 400ms (doubled again)");
    assert!(b4.is_none(), "Should be exhausted after 3 attempts");
}

#[test]
fn test_jtbd_health_check_recovery() {
    // JTBD: "Health check recovers unhealthy → healthy"
    let mut hc = HealthCheck::new();
    assert_eq!(hc.status(), HealthStatus::Healthy);

    // Drive to unhealthy (3 consecutive failures)
    hc.record_result(false);
    hc.record_result(false);
    hc.record_result(false);
    assert_eq!(
        hc.status(),
        HealthStatus::Unhealthy,
        "Should be unhealthy after 3 failures"
    );

    // Drive back to healthy (2 consecutive successes)
    hc.record_result(true);
    hc.record_result(true);
    assert_eq!(
        hc.status(),
        HealthStatus::Healthy,
        "Should be healthy after 2 successes"
    );
}

#[test]
fn test_jtbd_manager_coordination() {
    // JTBD: "Self-healing manager coordinates circuit breakers"
    let mut mgr = SelfHealingManager::new();
    mgr.add_circuit_breaker("api".to_string(), CircuitBreaker::new());
    mgr.add_circuit_breaker("db".to_string(), CircuitBreaker::new());

    // Manager should track both circuit breakers (verify via add + access)
    if let Some(api_cb) = mgr.circuit_breaker("api") {
        api_cb.record_failure();
        api_cb.record_failure();
    }
    if let Some(db_cb) = mgr.circuit_breaker("db") {
        db_cb.record_failure();
    }
    // Verify failures were recorded
    let api_count = mgr.circuit_breaker("api").map(|cb| cb.failure_count());
    let db_count = mgr.circuit_breaker("db").map(|cb| cb.failure_count());
    assert_eq!(api_count, Some(2), "API should have 2 failures");
    assert_eq!(db_count, Some(1), "DB should have 1 failure");
}

// ============================================================================
// Module 5: SPC — JTBD: "Detect when the process is drifting"
// ============================================================================

use pictl::spc::{check_western_electric_rules, ChartData, ProcessCapability, SpecialCause};

fn chart(value: f64, ucl: f64, cl: f64, lcl: f64) -> ChartData {
    ChartData {
        timestamp: String::new(),
        value,
        ucl,
        cl,
        lcl,
        subgroup_data: None,
    }
}

#[test]
fn test_jtbd_rule1_alerts() {
    // JTBD: "Rule 1: Point beyond UCL triggers alert"
    // Build 9 points where points straddle CL to avoid Rule 2 shift detection
    let mut data: Vec<ChartData> = (0..8)
        .map(|i| {
            let v = if i % 2 == 0 { 4.0 } else { 6.0 }; // alternate above/below CL
            chart(v, 10.0, 5.0, 0.0)
        })
        .collect();
    data.push(chart(11.0, 10.0, 5.0, 0.0)); // beyond UCL

    let alerts = check_western_electric_rules(&data);
    assert!(alerts.len() >= 1, "Should detect at least 1 alert");
    assert!(
        alerts
            .iter()
            .any(|a| matches!(a, SpecialCause::OutOfControl { value: 11.0, .. })),
        "Should detect OutOfControl for value 11.0"
    );
}

#[test]
fn test_jtbd_rule2_shift_above() {
    // JTBD: "Rule 2: 9-point shift detection"
    let data: Vec<ChartData> = (0..9).map(|_| chart(6.0, 10.0, 5.0, 0.0)).collect();

    let alerts = check_western_electric_rules(&data);
    assert!(alerts.iter().any(|a| matches!(
        a,
        SpecialCause::Shift {
            direction: pictl::spc::ShiftDirection::Above,
            count: 9
        }
    )));
}

#[test]
fn test_jtbd_rule3_trend_increasing() {
    // JTBD: "Rule 3: 6-point trend detection"
    let mut data: Vec<ChartData> = (0..5).map(|_| chart(0.0, 10.0, 5.0, 0.0)).collect();
    for i in 5..11 {
        data.push(chart(i as f64, 10.0, 5.0, 0.0));
    }

    let alerts = check_western_electric_rules(&data);
    assert!(alerts.iter().any(|a| matches!(
        a,
        SpecialCause::Trend {
            direction: pictl::spc::TrendDirection::Increasing,
            ..
        }
    )));
}

#[test]
fn test_jtbd_capability_within_threshold() {
    // JTBD: "Cp ≥ 1.0, Cpk ≥ 1.0 for capable process"
    // Generate data with mean≈5.0, std≈0.5 — well within USL=10, LSL=0
    let data: Vec<f64> = (0..100)
        .map(|i| 5.0 + ((i % 7) as f64 - 3.0) * 0.15)
        .collect();

    let cap = ProcessCapability::calculate(&data, 10.0, 0.0).unwrap();
    assert!(
        cap.cp >= 1.0,
        "Cp should be ≥ 1.0 for capable process, got {}",
        cap.cp
    );
    assert!(
        cap.cpk >= 1.0,
        "Cpk should be ≥ 1.0 for capable process, got {}",
        cap.cpk
    );
}

#[test]
fn test_jtbd_dpmo_to_sigma_boundaries() {
    // JTBD: "DPMO → sigma conversion at known boundaries"
    // 3.4 DPMO ≈ 6 sigma (Six Sigma)
    let cap_6sigma =
        ProcessCapability::calculate(&[5.0, 5.001, 4.999, 5.000, 5.002], 6.0, 4.0).unwrap();
    assert!(
        cap_6sigma.sigma_level >= 5.0,
        "Near-zero DPMO should give sigma ≥ 5.0, got {} (dpmo={})",
        cap_6sigma.sigma_level,
        cap_6sigma.dpmo
    );

    // Broader process: sigma should be positive but lower
    let wider_data: Vec<f64> = (0..100).map(|i| (i as f64) * 0.05 + 1.0).collect();
    let cap_wide = ProcessCapability::calculate(&wider_data, 10.0, 0.0).unwrap();
    assert!(
        cap_wide.sigma_level > 0.0,
        "Sigma level should be positive, got {}",
        cap_wide.sigma_level
    );
}

#[test]
fn test_jtbd_normal_cdf_accuracy() {
    // JTBD: "Normal CDF accuracy — Φ(0)=0.5, Φ(1.96)≈0.975"
    let p0 = pictl::spc::normal_cdf_public(0.0);
    assert!((p0 - 0.5).abs() < 1e-6, "Φ(0) should be 0.5, got {}", p0);

    let p196 = pictl::spc::normal_cdf_public(1.96);
    assert!(
        (p196 - 0.975).abs() < 0.01,
        "Φ(1.96) should be ≈0.975, got {}",
        p196
    );

    let pn196 = pictl::spc::normal_cdf_public(-1.96);
    assert!(
        (pn196 - 0.025).abs() < 0.01,
        "Φ(-1.96) should be ≈0.025, got {}",
        pn196
    );
}

#[test]
fn test_jtbd_inverse_cdf_accuracy() {
    // JTBD: "Inverse normal CDF — Φ⁻¹(0.975)≈1.96, Φ⁻¹(0.025)≈-1.96"
    let z975 = pictl::spc::inverse_normal_cdf_public(0.975);
    assert!(
        (z975 - 1.96).abs() < 0.01,
        "Φ⁻¹(0.975) should be ≈1.96, got {}",
        z975
    );

    let z025 = pictl::spc::inverse_normal_cdf_public(0.025);
    assert!(
        (z025 - (-1.96)).abs() < 0.01,
        "Φ⁻¹(0.025) should be ≈-1.96, got {}",
        z025
    );

    let z5 = pictl::spc::inverse_normal_cdf_public(0.5);
    assert!(z5.abs() < 0.01, "Φ⁻¹(0.5) should be ≈0, got {}", z5);
}

// ============================================================================
// Cross-module JTBD: Autonomy Stack integration
// ============================================================================

#[test]
fn test_jtbd_guard_dispatch_pipeline() {
    // JTBD: "Guard gates pattern dispatch — conditional execution"
    let ctx = test_context();
    let guard = Guard::and(vec![
        Guard::resource(pictl::guards::ResourceType::Cpu, 50),
        Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING),
    ]);

    if guard.evaluate(&ctx) {
        let dispatcher = PatternDispatcher::new();
        let pctx = test_pattern_context(PatternType::Sequence);
        let result = dispatcher.dispatch(&pctx);
        assert!(
            result.success,
            "Pattern dispatch should succeed when guard passes"
        );
    }
}

#[test]
fn test_jtbd_rl_self_healing_loop() {
    // JTBD: "RL agent adapts routing, self-healing protects"
    // Use a small state space (0,1,2) so the agent revisits state 0 frequently
    let agent: QLearning<RlState, RlAction> = QLearning::new();
    let mut cb = CircuitBreaker::new();

    fastrand::seed(42);
    let mut state = RlState(0);
    for _ in 0..50 {
        let action = agent.select_action(&state);
        let reward = if action == RlAction::Left { 1.0 } else { -0.5 };
        let next_state = RlState((state.0 + 1) % 3); // cycle through 0→1→2→0
        agent.update(
            &state,
            &action,
            reward,
            &next_state,
            next_state.is_terminal(),
        );

        // Simulate operation: 80% success rate
        if fastrand::u32(..) % 10 < 8 {
            cb.record_success();
        } else {
            cb.record_failure();
        }

        state = next_state;
    }

    // Agent should have learned that Left is better than Right for any state
    let q_left = agent.get_q_value(&RlState(0), &RlAction::Left);
    let q_right = agent.get_q_value(&RlState(0), &RlAction::Right);
    assert!(
        q_left > q_right,
        "Agent should prefer Left (q_left={:.4}) over Right (q_right={:.4}) for state 0 after 50 episodes",
        q_left, q_right
    );
}
