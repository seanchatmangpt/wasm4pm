//! JTBD Benchmark Suite — 5 Ported Algorithm Families
//!
//! Criterion benchmarks for guards, pattern_dispatch, reinforcement,
//! self_healing, and spc modules. Each benchmark group maps to a
//! JTBD (Jobs-To-Be-Done) claim from the operational autonomy thesis.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::sync::atomic::AtomicU32;
use std::time::Duration;

// ============================================================================
// Imports from the 5 ported modules
// ============================================================================

use pictl::guards::{
    ExecutionContext, Guard, GuardCompiler, GuardEvaluator, ObservationBuffer, ResourceState,
    StateFlags,
};
use pictl::pattern_dispatch::{
    PatternConfig, PatternContext, PatternDispatcher, PatternFlags, PatternType,
};
use pictl::reinforcement::{QLearning, SARSAAgent, WorkflowAction, WorkflowState};
use pictl::self_healing::{
    CircuitBreaker, HealthCheck, HealthStatus, RetryPolicy, RetryState, SelfHealingManager,
};
use pictl::spc::{check_western_electric_rules, ChartData, ProcessCapability};

// ============================================================================
// Shared helpers
// ============================================================================

/// Build a standard ExecutionContext for guard evaluation benchmarks.
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
        input_mask: 0b1111, // 4 inputs
        output_mask: 0,
        state: AtomicU32::new(0),
        tick_budget: 8,
    }
}

// ============================================================================
// Module 1: Guards — JTBD: "Execute when conditions are met"
// ============================================================================

fn bench_guard_predicate(c: &mut Criterion) {
    let ctx = test_context();
    let guard = Guard::predicate(
        pictl::guards::Predicate::Equal,
        0, // field selector: task_id
        42,
    );

    let mut group = c.benchmark_group("guards/predicate_eval");
    group.bench_function("equal", |b| {
        b.iter(|| black_box(guard.evaluate(black_box(&ctx))));
    });
    group.finish();
}

fn bench_guard_resource(c: &mut Criterion) {
    let ctx = test_context();
    let guard_cpu = Guard::resource(pictl::guards::ResourceType::Cpu, 50);
    let guard_mem = Guard::resource(pictl::guards::ResourceType::Memory, 2048);

    let mut group = c.benchmark_group("guards/resource_eval");
    group.bench_function("cpu_pass", |b| {
        b.iter(|| black_box(guard_cpu.evaluate(black_box(&ctx))));
    });
    group.bench_function("memory_fail", |b| {
        b.iter(|| black_box(guard_mem.evaluate(black_box(&ctx))));
    });
    group.finish();
}

fn bench_guard_compound(c: &mut Criterion) {
    let ctx = test_context();
    let g1 = Guard::resource(pictl::guards::ResourceType::Cpu, 50);
    let g2 = Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING);
    let g3 = Guard::predicate(pictl::guards::Predicate::LessThan, 3, 20);
    let guard_and = Guard::and(vec![g1, g2, g3]);
    let guard_or = Guard::or(vec![
        Guard::resource(pictl::guards::ResourceType::Memory, 2048),
        Guard::resource(pictl::guards::ResourceType::Cpu, 50),
        Guard::state(StateFlags::COMPLETED),
    ]);

    let mut group = c.benchmark_group("guards/compound");
    group.bench_function("and_3_conditions", |b| {
        b.iter(|| black_box(guard_and.evaluate(black_box(&ctx))));
    });
    group.bench_function("or_3_conditions", |b| {
        b.iter(|| black_box(guard_or.evaluate(black_box(&ctx))));
    });
    group.finish();
}

fn bench_guard_cache(c: &mut Criterion) {
    let ctx = test_context();
    let guard = Guard::resource(pictl::guards::ResourceType::Cpu, 50);
    let mut evaluator = GuardEvaluator::new(100);

    // Warm up: fill cache
    for _ in 0..10 {
        evaluator.evaluate_cached(1, &guard, &ctx);
    }

    let mut group = c.benchmark_group("guards/ttl_cache");
    group.bench_function("cache_hit", |b| {
        b.iter(|| {
            black_box(evaluator.evaluate_cached(black_box(1), black_box(&guard), black_box(&ctx)))
        });
    });
    // Cache miss: use a new pattern_id each time
    let mut counter: u32 = 100;
    group.bench_function("cache_miss", |b| {
        b.iter(|| {
            counter += 1;
            black_box(evaluator.evaluate_cached(
                black_box(counter),
                black_box(&guard),
                black_box(&ctx),
            ));
        });
    });
    group.finish();
}

fn bench_guard_compiler(c: &mut Criterion) {
    let guard = Guard::predicate(pictl::guards::Predicate::Equal, 0, 42);
    let ctx = test_context();

    let mut group = c.benchmark_group("guards/compiler");
    group.bench_function("compile_predicate", |b| {
        b.iter(|| black_box(GuardCompiler::compile(black_box(&guard))));
    });
    group.bench_function("compiled_closure_call", |b| {
        let compiled = GuardCompiler::compile(&guard);
        b.iter(|| black_box(compiled(black_box(&ctx))));
    });
    group.bench_function("generic_evaluate", |b| {
        b.iter(|| black_box(guard.evaluate(black_box(&ctx))));
    });
    group.finish();
}

// ============================================================================
// Module 2: Pattern Dispatch — JTBD: "Understand control-flow semantics"
// ============================================================================

fn bench_pattern_dispatch_hot_path(c: &mut Criterion) {
    let dispatcher = PatternDispatcher::new();
    let patterns = [
        (PatternType::Sequence, "sequence"),
        (PatternType::ParallelSplit, "parallel_split"),
        (PatternType::Synchronization, "synchronization"),
        (PatternType::ExclusiveChoice, "exclusive_choice"),
        (PatternType::SimpleMerge, "simple_merge"),
        (PatternType::MultiChoice, "multi_choice"),
        (PatternType::StructuredSyncMerge, "structured_sync_merge"),
        (PatternType::MultiMerge, "multi_merge"),
        (
            PatternType::StructuredDiscriminator,
            "structured_discriminator",
        ),
    ];

    let mut group = c.benchmark_group("pattern_dispatch/dispatch");
    for (pt, name) in patterns {
        let ctx = test_pattern_context(pt);
        group.bench_with_input(BenchmarkId::new(name, pt as u32), &ctx, |b, ctx| {
            b.iter(|| black_box(dispatcher.dispatch(black_box(ctx))));
        });
    }
    group.finish();
}

fn bench_pattern_dispatch_all_43(c: &mut Criterion) {
    let dispatcher = PatternDispatcher::new();

    let mut group = c.benchmark_group("pattern_dispatch/all_43");
    group.throughput(Throughput::Elements(43));
    group.bench_function("dispatch_all_patterns", |b| {
        b.iter(|| {
            for pt_val in 1u8..=43 {
                if let Some(pt) = PatternType::from_u8(pt_val) {
                    let ctx = test_pattern_context(pt);
                    black_box(dispatcher.dispatch(&ctx));
                }
            }
        });
    });
    group.finish();
}

fn bench_pattern_dispatch_validation(c: &mut Criterion) {
    let dispatcher = PatternDispatcher::new();

    let mut group = c.benchmark_group("pattern_dispatch/validation");
    group.bench_function("validate_pattern", |b| {
        b.iter(|| {
            for pt_val in 1u8..=43 {
                if let Some(pt) = PatternType::from_u8(pt_val) {
                    black_box(dispatcher.validate_pattern(pt));
                }
            }
        });
    });
    group.finish();
}

// ============================================================================
// Module 3: Reinforcement Learning — JTBD: "Route work to best path"
// ============================================================================

// Simple test types for RL benchmarks
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

fn bench_rl_q_learning(c: &mut Criterion) {
    let agent: QLearning<RlState, RlAction> = QLearning::new();
    let s1 = RlState(0);
    let s2 = RlState(1);
    let action = RlAction::Left;

    let mut group = c.benchmark_group("reinforcement/q_learning");
    group.bench_function("update", |b| {
        b.iter(|| {
            black_box(agent.update(
                black_box(&s1),
                black_box(&action),
                1.0,
                black_box(&s2),
                false,
            ))
        });
    });
    group.bench_function("select_action", |b| {
        b.iter(|| black_box(agent.select_action(black_box(&s1))));
    });
    group.bench_function("get_q_value", |b| {
        b.iter(|| black_box(agent.get_q_value(black_box(&s1), black_box(&action))));
    });
    group.finish();
}

fn bench_rl_sarsa(c: &mut Criterion) {
    let agent: SARSAAgent<RlState, RlAction> = SARSAAgent::new();
    let s1 = RlState(0);
    let s2 = RlState(1);
    let a1 = RlAction::Left;
    let a2 = RlAction::Right;

    let mut group = c.benchmark_group("reinforcement/sarsa");
    group.bench_function("update", |b| {
        b.iter(|| {
            black_box(agent.update(
                black_box(&s1),
                black_box(&a1),
                1.0,
                black_box(&s2),
                black_box(&a2),
            ))
        });
    });
    group.bench_function("epsilon_greedy", |b| {
        b.iter(|| black_box(agent.epsilon_greedy_action(black_box(&s1), 0.1)));
    });
    group.finish();
}

fn bench_rl_episode(c: &mut Criterion) {
    let mut group = c.benchmark_group("reinforcement/episode");
    group.bench_function("100_step_episode", |b| {
        b.iter(|| {
            let agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.99, 0.5);
            let mut state = RlState(0);
            for _ in 0..100 {
                if state.is_terminal() {
                    break;
                }
                let action = agent.select_action(&state);
                let next_state = RlState(state.0 + 1);
                let reward = if next_state.0 > state.0 { 1.0 } else { -1.0 };
                agent.update(&state, &action, reward, &next_state, false);
                state = next_state;
            }
            black_box(agent);
        });
    });
    group.finish();
}

// ============================================================================
// Module 4: Self-Healing — JTBD: "Recover from failure without intervention"
// ============================================================================

fn bench_sh_circuit_breaker(c: &mut Criterion) {
    let mut group = c.benchmark_group("self_healing/circuit_breaker");

    group.bench_function("allow_request_closed", |b| {
        b.iter(|| {
            let mut cb = CircuitBreaker::new();
            black_box(cb.allow_request());
        });
    });

    group.bench_function("record_success", |b| {
        b.iter(|| {
            let mut cb = CircuitBreaker::new();
            cb.record_success();
            black_box(cb);
        });
    });

    group.bench_function("record_failure", |b| {
        b.iter(|| {
            let mut cb = CircuitBreaker::new();
            cb.record_failure();
            black_box(cb);
        });
    });

    group.bench_function("closed_to_open_5_failures", |b| {
        b.iter(|| {
            let mut cb = CircuitBreaker::new();
            for _ in 0..5 {
                cb.record_failure();
            }
            black_box(cb);
        });
    });

    group.finish();
}

fn bench_sh_retry(c: &mut Criterion) {
    let policy = RetryPolicy::default();

    let mut group = c.benchmark_group("self_healing/retry");
    group.bench_function("next_attempt_no_jitter", |b| {
        b.iter(|| {
            let policy_no_jitter = RetryPolicy {
                jitter: false,
                ..policy.clone()
            };
            let mut state = RetryState::new(100);
            let mut total = 0u64;
            while let Some(backoff) = state.next_attempt(&policy_no_jitter) {
                total += backoff;
            }
            black_box(total);
        });
    });

    group.bench_function("next_attempt_with_jitter", |b| {
        b.iter(|| {
            let mut state = RetryState::new(100);
            let mut total = 0u64;
            while let Some(backoff) = state.next_attempt(&policy) {
                total += backoff;
            }
            black_box(total);
        });
    });
    group.finish();
}

fn bench_sh_health_check(c: &mut Criterion) {
    let mut group = c.benchmark_group("self_healing/health_check");

    group.bench_function("record_result_healthy", |b| {
        b.iter(|| {
            let mut hc = HealthCheck::new();
            hc.record_result(true);
            black_box(hc);
        });
    });

    group.bench_function("unhealthy_to_healthy_cycle", |b| {
        b.iter(|| {
            let mut hc = HealthCheck::new();
            // Drive to unhealthy
            for _ in 0..3 {
                hc.record_result(false);
            }
            assert_eq!(hc.status(), HealthStatus::Unhealthy);
            // Drive back to healthy
            for _ in 0..2 {
                hc.record_result(true);
            }
            assert_eq!(hc.status(), HealthStatus::Healthy);
            black_box(hc);
        });
    });

    group.finish();
}

fn bench_sh_manager(c: &mut Criterion) {
    let mut group = c.benchmark_group("self_healing/manager");

    group.bench_function("new_manager", |b| {
        b.iter(|| {
            let mut mgr = SelfHealingManager::new();
            mgr.add_circuit_breaker("api".to_string(), CircuitBreaker::new());
            black_box(mgr);
        });
    });

    group.finish();
}

// ============================================================================
// Module 5: SPC — JTBD: "Detect when the process is drifting"
// ============================================================================

/// Generate stable process data centered on CL.
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

/// Generate data with a shift (9 points above CL).
fn shift_chart_data() -> Vec<ChartData> {
    (0..9)
        .map(|_| ChartData {
            timestamp: String::new(),
            value: 6.0, // all above CL=5.0
            ucl: 10.0,
            cl: 5.0,
            lcl: 0.0,
            subgroup_data: None,
        })
        .collect()
}

/// Generate data with a trend (6 monotonic increasing).
fn trend_chart_data() -> Vec<ChartData> {
    let mut data: Vec<ChartData> = (0..5)
        .map(|_| ChartData {
            timestamp: String::new(),
            value: 0.0,
            ucl: 10.0,
            cl: 5.0,
            lcl: 0.0,
            subgroup_data: None,
        })
        .collect();
    for i in 5..11 {
        data.push(ChartData {
            timestamp: String::new(),
            value: i as f64,
            ucl: 10.0,
            cl: 5.0,
            lcl: 0.0,
            subgroup_data: None,
        });
    }
    data
}

/// Generate data with a point beyond UCL.
fn ooc_chart_data() -> Vec<ChartData> {
    let mut data: Vec<ChartData> = (0..8)
        .map(|i| ChartData {
            timestamp: String::new(),
            value: 5.0 + i as f64 * 0.1,
            ucl: 10.0,
            cl: 5.0,
            lcl: 0.0,
            subgroup_data: None,
        })
        .collect();
    data.push(ChartData {
        timestamp: String::new(),
        value: 11.0, // beyond UCL
        ucl: 10.0,
        cl: 5.0,
        lcl: 0.0,
        subgroup_data: None,
    });
    data
}

fn bench_spc_western_electric(c: &mut Criterion) {
    let stable_data = stable_chart_data(20);
    let shift_data = shift_chart_data();
    let trend_data = trend_chart_data();
    let ooc_data = ooc_chart_data();

    let mut group = c.benchmark_group("spc/western_electric");
    group.throughput(Throughput::Elements(20));
    group.bench_function("stable_20pts", |b| {
        b.iter(|| black_box(check_western_electric_rules(black_box(&stable_data))));
    });
    group.bench_function("shift_detection", |b| {
        b.iter(|| black_box(check_western_electric_rules(black_box(&shift_data))));
    });
    group.bench_function("trend_detection", |b| {
        b.iter(|| black_box(check_western_electric_rules(black_box(&trend_data))));
    });
    group.bench_function("ooc_detection", |b| {
        b.iter(|| black_box(check_western_electric_rules(black_box(&ooc_data))));
    });
    group.finish();
}

fn bench_spc_capability(c: &mut Criterion) {
    // Capable process: data well within spec limits
    let capable_data: Vec<f64> = (0..100).map(|i| 5.0 + (i % 7) as f64 * 0.01).collect();
    // Borderline process: data near spec limits
    let borderline_data: Vec<f64> = (0..100).map(|i| 0.5 + i as f64 * 0.04).collect();

    let mut group = c.benchmark_group("spc/capability");
    group.bench_function("capable_100pts", |b| {
        b.iter(|| {
            black_box(ProcessCapability::calculate(
                black_box(&capable_data),
                10.0,
                0.0,
            ))
        });
    });
    group.bench_function("borderline_100pts", |b| {
        b.iter(|| {
            black_box(ProcessCapability::calculate(
                black_box(&borderline_data),
                5.0,
                0.0,
            ))
        });
    });
    group.finish();
}

fn bench_spc_cdf(c: &mut Criterion) {
    let mut group = c.benchmark_group("spc/math");
    group.bench_function("normal_cdf", |b| {
        b.iter(|| {
            for z in [-3.0, -1.96, -1.0, 0.0, 1.0, 1.96, 3.0] {
                black_box(pictl::spc::normal_cdf_public(z));
            }
        });
    });

    group.bench_function("inverse_normal_cdf", |b| {
        b.iter(|| {
            for p in [
                0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999,
            ] {
                black_box(pictl::spc::inverse_normal_cdf_public(p));
            }
        });
    });

    group.bench_function("cdf_roundtrip", |b| {
        b.iter(|| {
            for p in [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99] {
                let z = pictl::spc::inverse_normal_cdf_public(p);
                let p2 = pictl::spc::normal_cdf_public(z);
                black_box((z, p2));
            }
        });
    });
    group.finish();
}

// ============================================================================
// Criterion main
// ============================================================================

criterion_group! {
    name = jtbd_guards;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(5))
        .warm_up_time(Duration::from_secs(1))
        .sample_size(100);
    targets = bench_guard_predicate, bench_guard_resource, bench_guard_compound, bench_guard_cache, bench_guard_compiler
}

criterion_group! {
    name = jtbd_patterns;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(5))
        .warm_up_time(Duration::from_secs(1))
        .sample_size(100);
    targets = bench_pattern_dispatch_hot_path, bench_pattern_dispatch_all_43, bench_pattern_dispatch_validation
}

criterion_group! {
    name = jtbd_reinforcement;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(5))
        .warm_up_time(Duration::from_secs(1))
        .sample_size(100);
    targets = bench_rl_q_learning, bench_rl_sarsa, bench_rl_episode
}

criterion_group! {
    name = jtbd_self_healing;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(5))
        .warm_up_time(Duration::from_secs(1))
        .sample_size(100);
    targets = bench_sh_circuit_breaker, bench_sh_retry, bench_sh_health_check, bench_sh_manager
}

criterion_group! {
    name = jtbd_spc;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(5))
        .warm_up_time(Duration::from_secs(1))
        .sample_size(100);
    targets = bench_spc_western_electric, bench_spc_capability, bench_spc_cdf
}

criterion_main!(
    jtbd_guards,
    jtbd_patterns,
    jtbd_reinforcement,
    jtbd_self_healing,
    jtbd_spc
);
