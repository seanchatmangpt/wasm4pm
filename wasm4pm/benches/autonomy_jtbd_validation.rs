//! JTBD Validation Benchmarks — 5 Ported Algorithm Families
//!
//! Criterion benchmarks that exercise each Jobs-To-Be-Done primitive from the
//! operational autonomy thesis: guards, pattern dispatch, reinforcement
//! learning, self-healing, and SPC drift detection.
//!
//! Run: cargo bench -p wasm4pm --bench autonomy_jtbd_validation --features cloud

use std::hint::black_box;
use std::sync::atomic::AtomicU32;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

// ============================================================================
// Module 1: Guards — JTBD: "Execute when conditions are met"
// ============================================================================

use wasm4pm::guards::{
    ExecutionContext, Guard, GuardCompiler, GuardEvaluator, ObservationBuffer, Predicate,
    ResourceState, ResourceType, StateFlags,
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

fn bench_guards(c: &mut Criterion) {
    let mut group = c.benchmark_group("guards");

    // Single resource guard evaluation.
    let ctx = test_context();
    let guard = Guard::resource(ResourceType::Cpu, 50);
    group.bench_function("resource_eval", |b| {
        b.iter(|| black_box(black_box(&guard).evaluate(black_box(&ctx))));
    });

    // Compound AND guard with three predicates.
    let and_guard = Guard::and(vec![
        Guard::resource(ResourceType::Cpu, 50),
        Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING),
        Guard::predicate(Predicate::LessThan, 3, 20),
    ]);
    group.bench_function("compound_and_eval", |b| {
        b.iter(|| black_box(black_box(&and_guard).evaluate(black_box(&ctx))));
    });

    // Compiled hot-path closure dispatch.
    let compiled_guard = Guard::predicate(Predicate::Equal, 0, 42);
    let compiled = GuardCompiler::compile(&compiled_guard);
    group.bench_function("compiled_closure_eval", |b| {
        b.iter(|| black_box(compiled(black_box(&ctx))));
    });

    // TTL-cache benefit scales with number of distinct patterns evaluated.
    for n_patterns in [16u64, 64, 256] {
        group.throughput(Throughput::Elements(n_patterns));
        group.bench_with_input(
            BenchmarkId::new("ttl_cache_eval", n_patterns),
            &n_patterns,
            |b, &n| {
                b.iter(|| {
                    let mut evaluator = GuardEvaluator::new(1000);
                    let mut hits = 0u32;
                    for pid in 0..n {
                        // Each pattern evaluated twice: miss then hit.
                        let _ = evaluator.evaluate_cached(pid as u32, &guard, &ctx);
                        let r = evaluator.evaluate_cached(pid as u32, &guard, &ctx);
                        hits += r as u32;
                    }
                    black_box(hits)
                });
            },
        );
    }

    group.finish();
}

// ============================================================================
// Module 2: Pattern Dispatch — JTBD: "Understand control-flow semantics"
// ============================================================================

use wasm4pm::pattern_dispatch::{
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

fn bench_pattern_dispatch(c: &mut Criterion) {
    let mut group = c.benchmark_group("pattern_dispatch");
    let dispatcher = PatternDispatcher::new();

    for pt in [
        PatternType::Sequence,
        PatternType::ParallelSplit,
        PatternType::Synchronization,
        PatternType::ExclusiveChoice,
    ] {
        group.bench_function(format!("dispatch_{pt:?}"), |b| {
            b.iter_batched(
                || test_pattern_context(pt),
                |ctx| black_box(dispatcher.dispatch(black_box(&ctx))),
                criterion::BatchSize::SmallInput,
            );
        });
    }

    // Validate the full registered pattern table (43 patterns).
    group.throughput(Throughput::Elements(43));
    group.bench_function("validate_all_patterns", |b| {
        b.iter(|| {
            let mut valid = 0u32;
            for pt_val in 1u8..=43 {
                if let Some(pt) = PatternType::from_u8(black_box(pt_val)) {
                    valid += dispatcher.validate_pattern(pt) as u32;
                }
            }
            black_box(valid)
        });
    });

    group.finish();
}

// ============================================================================
// Module 3: Reinforcement Learning — JTBD: "Route work to best path"
// ============================================================================

use wasm4pm::reinforcement::{QLearning, SARSAAgent, WorkflowAction, WorkflowState};

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

fn bench_reinforcement(c: &mut Criterion) {
    let mut group = c.benchmark_group("reinforcement");

    // Single Q-learning update.
    group.bench_function("q_learning_update", |b| {
        b.iter_batched(
            || QLearning::<RlState, RlAction>::new(),
            |agent| {
                agent.update(
                    black_box(&RlState(0)),
                    black_box(&RlAction::Left),
                    black_box(1.0),
                    black_box(&RlState(1)),
                    false,
                );
                black_box(agent.get_q_value(&RlState(0), &RlAction::Left))
            },
            criterion::BatchSize::SmallInput,
        );
    });

    // Single SARSA on-policy update.
    group.bench_function("sarsa_update", |b| {
        b.iter_batched(
            || SARSAAgent::<RlState, RlAction>::new(),
            |agent| {
                agent.update(
                    black_box(&RlState(0)),
                    black_box(&RlAction::Left),
                    black_box(1.0),
                    black_box(&RlState(1)),
                    black_box(&RlAction::Right),
                );
                black_box(agent.epsilon_greedy_action(&RlState(0), 0.0))
            },
            criterion::BatchSize::SmallInput,
        );
    });

    // Full training loop — throughput in episodes across representative sizes.
    for episodes in [50u64, 500, 2000] {
        group.throughput(Throughput::Elements(episodes));
        group.bench_with_input(
            BenchmarkId::new("q_learning_train", episodes),
            &episodes,
            |b, &eps| {
                b.iter(|| {
                    let agent: QLearning<RlState, RlAction> = QLearning::new();
                    let mut state = RlState(0);
                    for _ in 0..eps {
                        let action = agent.select_action(&state);
                        let reward = if action == RlAction::Left { 1.0 } else { -0.5 };
                        let next_state = RlState((state.0 + 1) % 3);
                        agent.update(
                            &state,
                            &action,
                            reward,
                            &next_state,
                            next_state.is_terminal(),
                        );
                        state = next_state;
                    }
                    black_box(agent.get_q_value(&RlState(0), &RlAction::Left))
                });
            },
        );
    }

    group.finish();
}

// ============================================================================
// Module 4: Self-Healing — JTBD: "Recover from failure without intervention"
// ============================================================================

use wasm4pm::self_healing::{CircuitBreaker, HealthCheck, RetryPolicy, RetryState};

fn bench_self_healing(c: &mut Criterion) {
    let mut group = c.benchmark_group("self_healing");

    // Circuit-breaker failure recording to threshold.
    group.bench_function("circuit_breaker_trip", |b| {
        b.iter_batched(
            CircuitBreaker::new,
            |mut cb| {
                for _ in 0..5 {
                    cb.record_failure();
                }
                black_box(cb.state())
            },
            criterion::BatchSize::SmallInput,
        );
    });

    // Exponential backoff schedule computation.
    let policy = RetryPolicy {
        jitter: false,
        max_attempts: 8,
        initial_backoff_ms: 100,
        backoff_multiplier: 2.0,
        max_backoff_ms: 10_000,
    };
    group.bench_function("retry_backoff_schedule", |b| {
        b.iter(|| {
            let mut state = RetryState::new(100);
            let mut total = 0u64;
            while let Some(ms) = state.next_attempt(black_box(&policy)) {
                total += ms as u64;
            }
            black_box(total)
        });
    });

    // Health-check state transitions across a stream of results.
    for n in [16u64, 128, 1024] {
        group.throughput(Throughput::Elements(n));
        group.bench_with_input(BenchmarkId::new("health_check_stream", n), &n, |b, &n| {
            b.iter(|| {
                let mut hc = HealthCheck::new();
                let mut status = hc.status();
                for i in 0..n {
                    // Alternating bursts of failures/successes to drive transitions.
                    hc.record_result(black_box((i / 3) % 2 == 0));
                    status = hc.status();
                }
                black_box(status)
            });
        });
    }

    group.finish();
}

// ============================================================================
// Module 5: SPC — JTBD: "Detect when the process is drifting"
// ============================================================================

use wasm4pm::spc::{check_western_electric_rules, ChartData, ProcessCapability};

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

fn bench_spc(c: &mut Criterion) {
    let mut group = c.benchmark_group("spc");

    // Western Electric rule checking — throughput in chart points.
    for n in [32u64, 256, 2048] {
        // Deterministic drifting series: straddles CL then trends/shifts.
        let data: Vec<ChartData> = (0..n)
            .map(|i| {
                let phase = i % 32;
                let v = if phase < 16 {
                    if i % 2 == 0 {
                        4.0
                    } else {
                        6.0
                    }
                } else {
                    // upward trend segment to exercise trend/shift rules
                    5.0 + (phase as f64 - 16.0) * 0.2
                };
                chart(v, 10.0, 5.0, 0.0)
            })
            .collect();

        group.throughput(Throughput::Elements(n));
        group.bench_with_input(
            BenchmarkId::new("western_electric_rules", n),
            &data,
            |b, data| {
                b.iter(|| black_box(check_western_electric_rules(black_box(data))));
            },
        );
    }

    // Process capability (Cp/Cpk/DPMO/sigma) over a measurement window.
    for n in [50u64, 500, 5000] {
        let data: Vec<f64> = (0..n)
            .map(|i| 5.0 + ((i % 7) as f64 - 3.0) * 0.15)
            .collect();
        group.throughput(Throughput::Elements(n));
        group.bench_with_input(
            BenchmarkId::new("process_capability", n),
            &data,
            |b, data| {
                b.iter(|| {
                    black_box(ProcessCapability::calculate(
                        black_box(data),
                        black_box(10.0),
                        black_box(0.0),
                    ))
                });
            },
        );
    }

    // Normal CDF / inverse CDF accuracy primitives (hot in capability math).
    group.bench_function("normal_cdf", |b| {
        b.iter(|| black_box(wasm4pm::spc::normal_cdf_public(black_box(1.96))));
    });
    group.bench_function("inverse_normal_cdf", |b| {
        b.iter(|| black_box(wasm4pm::spc::inverse_normal_cdf_public(black_box(0.975))));
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_guards,
    bench_pattern_dispatch,
    bench_reinforcement,
    bench_self_healing,
    bench_spc
);
criterion_main!(benches);
