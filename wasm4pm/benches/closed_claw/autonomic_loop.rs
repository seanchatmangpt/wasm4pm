//! Closed Claw Autonomic Loop Benchmark
//!
//! Measures the full 5-module cycle:
//!   guards -> pattern_dispatch -> reinforcement -> self_healing -> spc -> guards
//!
//! This benchmark validates the autonomic loop claim: that the complete
//! sense-decide-act-verify cycle executes within bounded latency, exhibits
//! constant-time layer collapse, and converges (RL epsilon decay + SPC
//! stabilization) over repeated cycles.

use criterion::{black_box, BenchmarkId, Criterion, Throughput};
use std::sync::atomic::AtomicU32;
use std::time::Duration;

use pictl::guards::{
    ExecutionContext, Guard, GuardEvaluator, ObservationBuffer, ResourceState, StateFlags,
};
use pictl::pattern_dispatch::{
    PatternConfig, PatternContext, PatternDispatcher, PatternFlags, PatternType,
};
use pictl::reinforcement::{QLearning, WorkflowAction, WorkflowState};
use pictl::self_healing::{CircuitBreaker, HealthCheck, HealthStatus};
use pictl::spc::{check_western_electric_rules, ChartData, ProcessCapability};

// ---------------------------------------------------------------------------
// RL types (same pattern as jtbd_benchmark.rs)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a standard ExecutionContext for guard evaluation.
fn test_context(cycle: u64) -> ExecutionContext {
    ExecutionContext {
        task_id: 42,
        timestamp: 1000 + cycle,
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

/// Build a PatternContext for dispatch benchmarks.
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

/// Compound guard: cpu >= 50 AND state initialized|running.
fn compound_guard() -> Guard {
    Guard::and(vec![
        Guard::resource(pictl::guards::ResourceType::Cpu, 50),
        Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING),
        Guard::predicate(pictl::guards::Predicate::LessThan, 3, 20),
    ])
}

/// Generate stable chart data (no SPC alerts).
fn stable_chart_data(n: usize) -> Vec<ChartData> {
    (0..n)
        .map(|i| ChartData {
            timestamp: format!("t{}", i),
            value: 5.0 + (i % 3) as f64 * 0.1 - 0.1,
            ucl: 10.0,
            cl: 5.0,
            lcl: 0.0,
            subgroup_data: None,
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Core: One complete autonomic loop cycle
// ---------------------------------------------------------------------------

/// Execute one full autonomic loop cycle.
///
/// Phase 1 (Guards): Evaluate compound guard against execution context.
/// Phase 2 (Pattern Dispatch): Dispatch a Sequence pattern.
/// Phase 3 (Reinforcement): Q-learning update + action selection.
/// Phase 4 (Self-Healing): Circuit breaker allow_request + record_success.
/// Phase 5 (SPC): Western Electric rules check on chart data.
///
/// Returns a summary tuple for black_box consumption.
#[inline]
fn execute_autonomic_cycle(
    ctx: &ExecutionContext,
    guard: &Guard,
    dispatcher: &PatternDispatcher,
    pattern_ctx: &PatternContext,
    agent: &QLearning<RlState, RlAction>,
    cb: &mut CircuitBreaker,
    hc: &mut HealthCheck,
    chart_data: &[ChartData],
    state: &RlState,
) -> (bool, bool, RlAction, bool, bool, usize) {
    // Phase 1: Guards -- compound guard evaluation
    let guard_pass = guard.evaluate(ctx);

    // Phase 2: Pattern Dispatch -- sequence pattern
    let dispatch_ok = dispatcher.dispatch(pattern_ctx).success;

    // Phase 3: Reinforcement -- Q-learning select + update
    let action = agent.select_action(state);
    let next_state = RlState(state.0 + 1);
    let reward = if guard_pass && dispatch_ok { 1.0 } else { -0.5 };
    agent.update(state, &action, reward, &next_state, false);

    // Phase 4: Self-Healing -- circuit breaker + health check
    let cb_allowed = cb.allow_request();
    if cb_allowed {
        if dispatch_ok {
            cb.record_success();
        } else {
            cb.record_failure();
        }
    }
    hc.record_result(guard_pass && dispatch_ok);

    // Phase 5: SPC -- Western Electric rules check
    let spc_alerts = check_western_electric_rules(chart_data);
    let spc_stable = spc_alerts.is_empty();

    (
        guard_pass,
        dispatch_ok,
        action,
        cb_allowed,
        spc_stable,
        spc_alerts.len(),
    )
}

// ---------------------------------------------------------------------------
// Benchmark: Single cycle
// ---------------------------------------------------------------------------

fn bench_closed_loop_single_cycle(c: &mut Criterion) {
    let guard = compound_guard();
    let dispatcher = PatternDispatcher::new();
    let pattern_ctx = test_pattern_context(PatternType::Sequence);
    let agent: QLearning<RlState, RlAction> = QLearning::new();
    let mut cb = CircuitBreaker::new();
    let mut hc = HealthCheck::new();
    let chart_data = stable_chart_data(20);

    let ctx = test_context(0);

    let mut group = c.benchmark_group("autonomic_loop/single_cycle");
    group.bench_function("full_5_module_cycle", |b| {
        b.iter(|| {
            let mut cb_local = CircuitBreaker::new();
            let mut hc_local = HealthCheck::new();
            black_box(execute_autonomic_cycle(
                black_box(&ctx),
                black_box(&guard),
                black_box(&dispatcher),
                black_box(&pattern_ctx),
                black_box(&agent),
                &mut cb_local,
                &mut hc_local,
                black_box(&chart_data),
                black_box(&RlState(0)),
            ));
        });
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: 10 cycles
// ---------------------------------------------------------------------------

fn bench_closed_loop_10_cycles(c: &mut Criterion) {
    let guard = compound_guard();
    let dispatcher = PatternDispatcher::new();
    let pattern_ctx = test_pattern_context(PatternType::Sequence);
    let chart_data = stable_chart_data(20);

    let mut group = c.benchmark_group("autonomic_loop/10_cycles");
    group.throughput(Throughput::Elements(10));
    group.bench_function("10_iterations", |b| {
        b.iter(|| {
            let mut agent: QLearning<RlState, RlAction> = QLearning::new();
            let mut cb = CircuitBreaker::new();
            let mut hc = HealthCheck::new();
            for cycle in 0..10u64 {
                let ctx = test_context(cycle);
                let state = RlState((cycle % 50) as i32);
                black_box(execute_autonomic_cycle(
                    &ctx,
                    &guard,
                    &dispatcher,
                    &pattern_ctx,
                    &agent,
                    &mut cb,
                    &mut hc,
                    &chart_data,
                    &state,
                ));
                agent.decay_exploration();
            }
        });
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: 100 cycles (steady-state latency)
// ---------------------------------------------------------------------------

fn bench_closed_loop_100_cycles(c: &mut Criterion) {
    let guard = compound_guard();
    let dispatcher = PatternDispatcher::new();
    let pattern_ctx = test_pattern_context(PatternType::Sequence);
    let chart_data = stable_chart_data(20);

    let mut group = c.benchmark_group("autonomic_loop/100_cycles");
    group.throughput(Throughput::Elements(100));
    group.measurement_time(Duration::from_secs(15));
    group.bench_function("100_iterations_steady_state", |b| {
        b.iter(|| {
            let mut agent: QLearning<RlState, RlAction> = QLearning::new();
            let mut cb = CircuitBreaker::new();
            let mut hc = HealthCheck::new();
            for cycle in 0..100u64 {
                let ctx = test_context(cycle);
                let state = RlState((cycle % 50) as i32);
                black_box(execute_autonomic_cycle(
                    &ctx,
                    &guard,
                    &dispatcher,
                    &pattern_ctx,
                    &agent,
                    &mut cb,
                    &mut hc,
                    &chart_data,
                    &state,
                ));
                agent.decay_exploration();
            }
        });
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: Phase transition (N=1..5 modules active)
// ---------------------------------------------------------------------------

fn bench_phase_transition_n1(c: &mut Criterion) {
    let ctx = test_context(0);

    let mut group = c.benchmark_group("autonomic_loop/phase_transition");
    group.bench_function("n1_guards_only", |b| {
        let guard = compound_guard();
        b.iter(|| black_box(guard.evaluate(black_box(&ctx))));
    });
    group.finish();
}

fn bench_phase_transition_n2(c: &mut Criterion) {
    let guard = compound_guard();
    let dispatcher = PatternDispatcher::new();
    let pattern_ctx = test_pattern_context(PatternType::Sequence);
    let ctx = test_context(0);

    let mut group = c.benchmark_group("autonomic_loop/phase_transition");
    group.bench_function("n2_guards_plus_dispatch", |b| {
        b.iter(|| {
            let g = guard.evaluate(black_box(&ctx));
            let d = dispatcher.dispatch(black_box(&pattern_ctx)).success;
            black_box((g, d));
        });
    });
    group.finish();
}

fn bench_phase_transition_n3(c: &mut Criterion) {
    let guard = compound_guard();
    let dispatcher = PatternDispatcher::new();
    let pattern_ctx = test_pattern_context(PatternType::Sequence);
    let agent: QLearning<RlState, RlAction> = QLearning::new();
    let ctx = test_context(0);

    let mut group = c.benchmark_group("autonomic_loop/phase_transition");
    group.bench_function("n3_guards_dispatch_rl", |b| {
        b.iter(|| {
            let g = guard.evaluate(black_box(&ctx));
            let d = dispatcher.dispatch(black_box(&pattern_ctx)).success;
            let action = agent.select_action(black_box(&RlState(0)));
            let next = RlState(1);
            let reward = if g && d { 1.0 } else { -0.5 };
            agent.update(black_box(&RlState(0)), &action, reward, &next, false);
            black_box((g, d, action));
        });
    });
    group.finish();
}

fn bench_phase_transition_n4(c: &mut Criterion) {
    let guard = compound_guard();
    let dispatcher = PatternDispatcher::new();
    let pattern_ctx = test_pattern_context(PatternType::Sequence);
    let agent: QLearning<RlState, RlAction> = QLearning::new();
    let ctx = test_context(0);

    let mut group = c.benchmark_group("autonomic_loop/phase_transition");
    group.bench_function("n4_guards_dispatch_rl_healing", |b| {
        b.iter(|| {
            let mut cb = CircuitBreaker::new();
            let g = guard.evaluate(black_box(&ctx));
            let d = dispatcher.dispatch(black_box(&pattern_ctx)).success;
            let action = agent.select_action(black_box(&RlState(0)));
            let next = RlState(1);
            let reward = if g && d { 1.0 } else { -0.5 };
            agent.update(black_box(&RlState(0)), &action, reward, &next, false);
            let allowed = cb.allow_request();
            if allowed {
                if d {
                    cb.record_success();
                } else {
                    cb.record_failure();
                }
            }
            black_box((g, d, action, allowed));
        });
    });
    group.finish();
}

fn bench_phase_transition_n5(c: &mut Criterion) {
    let guard = compound_guard();
    let dispatcher = PatternDispatcher::new();
    let pattern_ctx = test_pattern_context(PatternType::Sequence);
    let agent: QLearning<RlState, RlAction> = QLearning::new();
    let chart_data = stable_chart_data(20);
    let ctx = test_context(0);

    let mut group = c.benchmark_group("autonomic_loop/phase_transition");
    group.bench_function("n5_all_modules", |b| {
        b.iter(|| {
            let mut cb = CircuitBreaker::new();
            let mut hc = HealthCheck::new();
            black_box(execute_autonomic_cycle(
                &ctx,
                &guard,
                &dispatcher,
                &pattern_ctx,
                &agent,
                &mut cb,
                &mut hc,
                &chart_data,
                &RlState(0),
            ));
        });
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: Convergence rate
// ---------------------------------------------------------------------------

fn bench_convergence_rate(c: &mut Criterion) {
    let guard = compound_guard();
    let dispatcher = PatternDispatcher::new();
    let pattern_ctx = test_pattern_context(PatternType::Sequence);
    let chart_data = stable_chart_data(20);

    let mut group = c.benchmark_group("autonomic_loop/convergence");
    group.throughput(Throughput::Elements(100));
    group.measurement_time(Duration::from_secs(15));
    group.bench_function("rl_epsilon_decay_plus_spc_stability", |b| {
        b.iter(|| {
            let mut agent: QLearning<RlState, RlAction> =
                QLearning::with_hyperparams(0.1, 0.99, 1.0);
            let mut cb = CircuitBreaker::new();
            let mut hc = HealthCheck::new();
            let mut epsilon_samples: [f32; 100] = [0.0; 100];
            let mut spc_stable_count: usize = 0;

            for cycle in 0..100u64 {
                let ctx = test_context(cycle);
                let state = RlState((cycle % 50) as i32);

                // Record epsilon before this cycle
                epsilon_samples[cycle as usize] = agent.get_exploration_rate();

                let (_, _, _, _, spc_stable, _) = execute_autonomic_cycle(
                    &ctx,
                    &guard,
                    &dispatcher,
                    &pattern_ctx,
                    &agent,
                    &mut cb,
                    &mut hc,
                    &chart_data,
                    &state,
                );
                if spc_stable {
                    spc_stable_count += 1;
                }

                agent.decay_exploration();
            }

            // Black-box the convergence metrics to prevent optimization
            black_box(epsilon_samples);
            black_box(spc_stable_count);
        });
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Public entry point -- called from mod.rs
// ---------------------------------------------------------------------------

pub fn bench_autonomic_loop(c: &mut Criterion) {
    bench_closed_loop_single_cycle(c);
    bench_closed_loop_10_cycles(c);
    bench_closed_loop_100_cycles(c);
    bench_phase_transition_n1(c);
    bench_phase_transition_n2(c);
    bench_phase_transition_n3(c);
    bench_phase_transition_n4(c);
    bench_phase_transition_n5(c);
    bench_convergence_rate(c);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_cycle_completes() {
        let guard = compound_guard();
        let dispatcher = PatternDispatcher::new();
        let pattern_ctx = test_pattern_context(PatternType::Sequence);
        let agent: QLearning<RlState, RlAction> = QLearning::new();
        let mut cb = CircuitBreaker::new();
        let mut hc = HealthCheck::new();
        let chart_data = stable_chart_data(20);
        let ctx = test_context(0);

        let (guard_pass, dispatch_ok, action, cb_allowed, spc_stable, alert_count) =
            execute_autonomic_cycle(
                &ctx,
                &guard,
                &dispatcher,
                &pattern_ctx,
                &agent,
                &mut cb,
                &mut hc,
                &chart_data,
                &RlState(0),
            );

        assert!(guard_pass, "compound guard should pass on test context");
        assert!(
            dispatch_ok,
            "sequence dispatch should succeed with input_mask set"
        );
        assert!(cb_allowed, "circuit breaker should allow in closed state");
        assert!(spc_stable, "stable chart data should produce no alerts");
        assert_eq!(alert_count, 0);
        // Action is non-deterministic (epsilon-greedy) but must be one of two
        assert!(matches!(action, RlAction::Left | RlAction::Right));
    }

    #[test]
    fn test_multi_cycle_convergence() {
        let guard = compound_guard();
        let dispatcher = PatternDispatcher::new();
        let pattern_ctx = test_pattern_context(PatternType::Sequence);
        let chart_data = stable_chart_data(20);

        let mut agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.99, 1.0);
        let mut cb = CircuitBreaker::new();
        let mut hc = HealthCheck::new();

        let initial_epsilon = agent.get_exploration_rate();
        assert!(
            (initial_epsilon - 1.0).abs() < 1e-6,
            "initial epsilon should be 1.0"
        );

        for cycle in 0..50u64 {
            let ctx = test_context(cycle);
            let state = RlState((cycle % 50) as i32);
            execute_autonomic_cycle(
                &ctx,
                &guard,
                &dispatcher,
                &pattern_ctx,
                &agent,
                &mut cb,
                &mut hc,
                &chart_data,
                &state,
            );
            agent.decay_exploration();
        }

        let final_epsilon = agent.get_exploration_rate();
        assert!(
            final_epsilon < initial_epsilon,
            "epsilon should decrease after 50 decay steps: {} -> {}",
            initial_epsilon,
            final_epsilon
        );
    }

    #[test]
    fn test_phase_transition_increasing_modules() {
        let ctx = test_context(0);
        let guard = compound_guard();

        // N=1: guards only
        let r1 = guard.evaluate(&ctx);
        assert!(r1);

        // N=2: + dispatch
        let dispatcher = PatternDispatcher::new();
        let pattern_ctx = test_pattern_context(PatternType::Sequence);
        let r2 = dispatcher.dispatch(&pattern_ctx).success;
        assert!(r2);

        // N=3: + RL
        let agent: QLearning<RlState, RlAction> = QLearning::new();
        let action = agent.select_action(&RlState(0));
        agent.update(&RlState(0), &action, 1.0, &RlState(1), false);
        // No panic = success

        // N=4: + self-healing
        let mut cb = CircuitBreaker::new();
        assert!(cb.allow_request());
        cb.record_success();

        // N=5: + SPC
        let chart_data = stable_chart_data(20);
        let alerts = check_western_electric_rules(&chart_data);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_health_check_tracks_loop_results() {
        let guard = compound_guard();
        let dispatcher = PatternDispatcher::new();
        let pattern_ctx = test_pattern_context(PatternType::Sequence);
        let agent: QLearning<RlState, RlAction> = QLearning::new();
        let chart_data = stable_chart_data(20);

        let mut cb = CircuitBreaker::new();
        let mut hc = HealthCheck::new();

        // All cycles should produce guard_pass=true, dispatch_ok=true
        // so health check should stay Healthy
        for cycle in 0..5u64 {
            let ctx = test_context(cycle);
            execute_autonomic_cycle(
                &ctx,
                &guard,
                &dispatcher,
                &pattern_ctx,
                &agent,
                &mut cb,
                &mut hc,
                &chart_data,
                &RlState(cycle as i32),
            );
        }

        assert_eq!(hc.status(), HealthStatus::Healthy);
    }

    #[test]
    fn test_spc_capability_in_loop() {
        let data: Vec<f64> = (0..50).map(|i| 5.0 + (i % 7) as f64 * 0.01).collect();
        let cap = ProcessCapability::calculate(&data, 10.0, 0.0).unwrap();
        assert!(cap.cp > 0.0);
        assert!(cap.cpk > 0.0);
    }
}
