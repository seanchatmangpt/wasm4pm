//! Latency benchmarks for AutoProcessAgent Vision 2030 closed loop
//!
//! Measures per-operation latency:
//! 1. Perception: Encode 8D state to state_id (branchless)
//! 2. Decision: Q-table lookup + LinUCB estimate
//! 3. Protection: Circuit breaker + guard rules
//! 4. Optimization: Bellman update
//! 5. Full cycle: All 4 operations combined
//!
//! Budget: 34 nanoseconds per cycle (target: 30.6ns with 10% margin)

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::time::Duration;
use wasm4pm::autoprocess::AutoProcessAgent;
use wasm4pm::RlState;

// =========================================================================
// Benchmark: Perception (Encode 8D state to state_id)
// =========================================================================

fn bench_perception_encode_state(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/perception");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(10000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let agent = AutoProcessAgent::new();

    let state = RlState {
        health_level: 2,
        event_rate_q: 3,
        activity_count_q: 4,
        spc_alert_level: 1,
        drift_status: 1,
        rework_ratio_q: 2,
        circuit_state: 0,
        cycle_phase: 1,
    };

    group.bench_function("encode_state_branchless", |b| {
        b.iter(|| agent.encode_state(black_box(&state)))
    });

    group.finish();
}

// =========================================================================
// Benchmark: Decision (Q-table lookup + select action)
// =========================================================================

fn bench_decision_select_action(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/decision");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(10000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let mut agent = AutoProcessAgent::new();

    group.bench_function("select_action_epsilon_greedy", |b| {
        b.iter(|| {
            let state_id = 12345u32;
            agent.select_action_epsilon_greedy(black_box(state_id), black_box(None))
        })
    });

    group.finish();
}

fn bench_decision_linucb_estimate(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/decision_linucb");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(10000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let agent = AutoProcessAgent::new();
    let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    let q_value = 0.5;

    group.bench_function("linucb_ucb_estimate", |b| {
        b.iter(|| agent.linucb_ucb_estimate(black_box(q_value), black_box(&features)))
    });

    group.finish();
}

// =========================================================================
// Benchmark: Protection (Circuit breaker + guards)
// =========================================================================

fn bench_protection_guard_eval(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/protection_guard");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(10000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let agent = AutoProcessAgent::new();

    let state = RlState {
        health_level: 2,
        event_rate_q: 3,
        activity_count_q: 4,
        spc_alert_level: 1,
        drift_status: 1,
        rework_ratio_q: 2,
        circuit_state: 0,
        cycle_phase: 1,
    };

    let action = wasm4pm::RlAction::Continue;

    group.bench_function("evaluate_guard_branchless", |b| {
        b.iter(|| agent.evaluate_guard(black_box(&state), black_box(action), black_box(2u8)))
    });

    group.finish();
}

fn bench_protection_circuit_advance(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/protection_circuit");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(10000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let mut agent = AutoProcessAgent::new();

    group.bench_function("advance_circuit_breaker", |b| {
        b.iter(|| {
            for _ in 0..1000 {
                black_box(&mut agent).advance_circuit_breaker();
            }
        })
    });

    group.finish();
}

fn bench_protection_circuit_check(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/protection_circuit_check");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(10000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let agent = AutoProcessAgent::new();

    group.bench_function("circuit_allows_request", |b| {
        b.iter(|| agent.circuit_allows_request())
    });

    group.finish();
}

// =========================================================================
// Benchmark: Optimization (Bellman update)
// =========================================================================

fn bench_optimization_bellman_update(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/optimization_bellman");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(10000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let mut agent = AutoProcessAgent::new();

    group.bench_function("bellman_update_direct", |b| {
        b.iter(|| {
            agent.bellman_update_direct(
                black_box(100u32),
                black_box(0usize),
                black_box(0.5),
                black_box(200u32),
                black_box(false),
            );
        })
    });

    group.finish();
}

// =========================================================================
// Benchmark: Amortized cycle cost with deferred Bellman
// =========================================================================

fn bench_amortized_cycle(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/amortized_cycle");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(100);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    // Budget target: 34ns per cycle amortized over 256 cycles
    group.significance_level(0.05);

    group.bench_function("256_deferred_cycles_amortized", |b| {
        b.iter_batched(
            || AutoProcessAgent::new(),
            |mut agent| {
                // Use deferred mode (drain_every = 128)
                agent.set_drain_cadence(128);

                let state = RlState {
                    health_level: 2,
                    event_rate_q: 3,
                    activity_count_q: 4,
                    spc_alert_level: 1,
                    drift_status: 1,
                    rework_ratio_q: 2,
                    circuit_state: 0,
                    cycle_phase: 1,
                };

                let next_state = RlState {
                    health_level: 2,
                    event_rate_q: 3,
                    activity_count_q: 4,
                    spc_alert_level: 1,
                    drift_status: 1,
                    rework_ratio_q: 2,
                    circuit_state: 0,
                    cycle_phase: 2,
                };

                let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
                let reward = 0.5;

                // Run 256 cycles and measure total time
                for _ in 0..256 {
                    let _decision = agent.run_cycle(
                        black_box(&state),
                        black_box(&features),
                        black_box(reward),
                        black_box(&next_state),
                        black_box(false),
                        black_box(true),
                        black_box(0u8),
                    );
                }
                agent
            },
            criterion::BatchSize::SmallInput,
        )
    });

    group.finish();
}

// =========================================================================
// Benchmark: Full cycle (Perception → Decision → Protection → Optimization)
// =========================================================================

fn bench_full_cycle(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/full_cycle");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(10000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    // Budget target: 34ns per cycle, with 10% margin → 30.6ns target
    group.significance_level(0.05);

    let mut agent = AutoProcessAgent::new();

    group.bench_function("run_cycle_nominal", |b| {
        b.iter(|| {
            let state = RlState {
                health_level: 2,
                event_rate_q: 3,
                activity_count_q: 4,
                spc_alert_level: 1,
                drift_status: 1,
                rework_ratio_q: 2,
                circuit_state: 0,
                cycle_phase: 1,
            };

            let next_state = RlState {
                health_level: 2,
                event_rate_q: 3,
                activity_count_q: 4,
                spc_alert_level: 1,
                drift_status: 1,
                rework_ratio_q: 2,
                circuit_state: 0,
                cycle_phase: 2,
            };

            let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
            let reward = 0.5;

            agent.run_cycle(
                black_box(&state),
                black_box(&features),
                black_box(reward),
                black_box(&next_state),
                black_box(false),
                black_box(true),
                black_box(0u8),
            )
        })
    });

    group.finish();
}

// =========================================================================
// Benchmark: SIMD-like perception (multiple state encodings in sequence)
// =========================================================================

fn bench_perception_batch(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess/perception_batch");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(1000);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let agent = AutoProcessAgent::new();

    // Create a small batch of 8 states
    let states = vec![
        RlState {
            health_level: 0,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        },
        RlState {
            health_level: 1,
            event_rate_q: 1,
            activity_count_q: 1,
            spc_alert_level: 1,
            drift_status: 1,
            rework_ratio_q: 1,
            circuit_state: 1,
            cycle_phase: 1,
        },
        RlState {
            health_level: 2,
            event_rate_q: 2,
            activity_count_q: 2,
            spc_alert_level: 2,
            drift_status: 2,
            rework_ratio_q: 2,
            circuit_state: 2,
            cycle_phase: 2,
        },
        RlState {
            health_level: 3,
            event_rate_q: 3,
            activity_count_q: 3,
            spc_alert_level: 3,
            drift_status: 0,
            rework_ratio_q: 3,
            circuit_state: 0,
            cycle_phase: 3,
        },
        RlState {
            health_level: 4,
            event_rate_q: 4,
            activity_count_q: 4,
            spc_alert_level: 0,
            drift_status: 1,
            rework_ratio_q: 4,
            circuit_state: 1,
            cycle_phase: 0,
        },
        RlState {
            health_level: 0,
            event_rate_q: 5,
            activity_count_q: 5,
            spc_alert_level: 1,
            drift_status: 2,
            rework_ratio_q: 5,
            circuit_state: 2,
            cycle_phase: 1,
        },
        RlState {
            health_level: 1,
            event_rate_q: 6,
            activity_count_q: 6,
            spc_alert_level: 2,
            drift_status: 0,
            rework_ratio_q: 6,
            circuit_state: 0,
            cycle_phase: 2,
        },
        RlState {
            health_level: 2,
            event_rate_q: 7,
            activity_count_q: 7,
            spc_alert_level: 3,
            drift_status: 1,
            rework_ratio_q: 7,
            circuit_state: 1,
            cycle_phase: 3,
        },
    ];

    group.bench_function("encode_8_states", |b| {
        b.iter(|| {
            let mut ids = vec![];
            for state in &states {
                ids.push(agent.encode_state(black_box(state)));
            }
            ids
        })
    });

    group.finish();
}

// =========================================================================
// Criterion setup
// =========================================================================

criterion_group!(
    name = benches;
    config = Criterion::default()
        .warm_up_time(Duration::from_secs(2))
        .measurement_time(Duration::from_secs(5))
        .sample_size(10000);
    targets =
        bench_perception_encode_state,
        bench_perception_batch,
        bench_decision_select_action,
        bench_decision_linucb_estimate,
        bench_protection_guard_eval,
        bench_protection_circuit_advance,
        bench_protection_circuit_check,
        bench_optimization_bellman_update,
        bench_amortized_cycle,
        bench_full_cycle
);

criterion_main!(benches);
