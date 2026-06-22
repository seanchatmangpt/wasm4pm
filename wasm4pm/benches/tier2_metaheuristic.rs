/// Criterion benchmarks for Tier 2-3 metaheuristic discovery algorithms.
///
/// Tier 2-3 algorithms are computationally intensive (metaheuristics,
/// optimization-based). They are grounded on a real event log
/// (`bench_data/sepsis.xes`, real ICU-patient cases) rather than synthetic
/// data — helpers.rs forbids synthetic generation (TPS rule). Trace counts are
/// swept by truncating the real log to representative prefixes so Throughput is
/// reported against actual event volume. Prefixes are kept small because these
/// metaheuristics are expensive.
///
/// Algorithms covered:
/// - Genetic Algorithm (evolutionary search)
/// - PSO / Particle Swarm Optimization (swarm intelligence)
/// - ILP / Integer Linear Programming (constraint optimization)
/// - ACO / Ant Colony Optimization (pheromone-based search)
/// - Simulated Annealing (thermal search)
/// - A* Search (informed heuristic search)
/// - Hill Climbing (greedy local optimization)
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::fast_discovery::{discover_astar, discover_hill_climbing};
use wasm4pm::genetic_discovery::{discover_genetic_algorithm, discover_pso_algorithm};
use wasm4pm::ilp_discovery::discover_ilp_petri_net;
use wasm4pm::models::EventLog;
use wasm4pm::more_discovery::{discover_ant_colony, discover_simulated_annealing};
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;
use helpers::ACTIVITY_KEY;

/// Trace-count prefixes swept over the real log. Metaheuristics are expensive,
/// so prefixes are kept small. In fast mode only the smallest is used.
fn metaheuristic_case_counts() -> &'static [usize] {
    if helpers::is_fast_mode() {
        &[20]
    } else {
        &[20, 50, 100]
    }
}

/// Load `bench_data/sepsis.xes`, truncate to `max_traces`, store it in global
/// state and return (handle, total_events). Returns `None` if the fixture is
/// absent so real-data benches skip cleanly instead of fabricating input.
/// The bench cwd is the crate dir (`wasm4pm/`); the fixture lives at the repo
/// root, hence the two candidate paths.
fn setup_real_log(max_traces: usize) -> Option<(String, usize)> {
    let content = ["../bench_data/sepsis.xes", "bench_data/sepsis.xes"]
        .iter()
        .find_map(|p| std::fs::read_to_string(p).ok())?;
    let mut log: EventLog = validate_and_parse_xes(&content).ok()?;
    if log.traces.len() > max_traces {
        log.traces.truncate(max_traces);
    }
    let total_events = log.event_count();
    if total_events == 0 {
        return None;
    }
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .ok()?;
    Some((handle, total_events))
}

/// Fixed real log (largest prefix) used for parameter sweeps. Returns the
/// stored handle, or `None` if the fixture is absent.
fn fixed_real_handle() -> Option<String> {
    let counts = metaheuristic_case_counts();
    let max = *counts.last().unwrap();
    setup_real_log(max).map(|(handle, _)| handle)
}

/// Apply shared sampling config to a group, respecting fast/full mode.
fn configure(
    group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>,
    secs: u64,
    warmup_secs: u64,
    samples: usize,
) {
    if helpers::is_fast_mode() {
        helpers::fast_group(group);
    } else {
        // Full mode still caps via helpers::full_group, but honor the
        // per-bench measurement intent as an upper bound.
        group.measurement_time(Duration::from_secs(secs));
        group.warm_up_time(Duration::from_secs(warmup_secs));
        group.sample_size(samples);
        helpers::full_group(group);
    }
}

/// ---------------------------------------------------------------------------
/// Genetic Algorithm Benchmarks
/// ---------------------------------------------------------------------------

fn bench_genetic_algorithm(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/genetic_algorithm");
    configure(&mut group, 30, 3, 10);

    // Parameter sweep on a fixed real log: (population_size, generations)
    if let Some(fixed_handle) = fixed_real_handle() {
        for (pop, gen) in [(5_usize, 3_usize), (10, 5), (20, 10)] {
            group.bench_with_input(
                BenchmarkId::new(format!("params_pop{}_gen{}", pop, gen), pop),
                &fixed_handle,
                |b, h| {
                    b.iter(|| {
                        black_box(
                            discover_genetic_algorithm(
                                black_box(h),
                                ACTIVITY_KEY,
                                black_box(pop),
                                black_box(gen),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }

    // Size sweep at minimal parameters over real-log prefixes.
    for &n in metaheuristic_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| {
                black_box(discover_genetic_algorithm(black_box(h), ACTIVITY_KEY, 5, 3).unwrap())
            })
        });
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// PSO (Particle Swarm Optimization) Benchmarks
/// ---------------------------------------------------------------------------

fn bench_pso(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/pso");
    configure(&mut group, 30, 3, 10);

    if let Some(fixed_handle) = fixed_real_handle() {
        // Parameter sweep: (swarm_size, iterations)
        for (swarm, iters) in [(5_usize, 5_usize), (10, 10), (15, 15)] {
            group.bench_with_input(
                BenchmarkId::new(format!("params_swarm{}_iter{}", swarm, iters), swarm),
                &fixed_handle,
                |b, h| {
                    b.iter(|| {
                        black_box(
                            discover_pso_algorithm(
                                black_box(h),
                                ACTIVITY_KEY,
                                black_box(swarm),
                                black_box(iters),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }

    for &n in metaheuristic_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_pso_algorithm(black_box(h), ACTIVITY_KEY, 5, 5).unwrap()))
        });
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// ILP (Integer Linear Programming) Benchmarks
/// ---------------------------------------------------------------------------

fn bench_ilp(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/ilp");
    configure(&mut group, 20, 2, 15);

    for &n in metaheuristic_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_ilp_petri_net(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// ACO (Ant Colony Optimization) Benchmarks
/// ---------------------------------------------------------------------------

fn bench_aco(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/aco");
    configure(&mut group, 30, 3, 10);

    if let Some(fixed_handle) = fixed_real_handle() {
        // Parameter sweep: (num_ants, iterations)
        for (ants, iters) in [(5_usize, 5_usize), (10, 10), (15, 15)] {
            group.bench_with_input(
                BenchmarkId::new(format!("params_ants{}_iter{}", ants, iters), ants),
                &fixed_handle,
                |b, h| {
                    b.iter(|| {
                        black_box(
                            discover_ant_colony(
                                black_box(h),
                                ACTIVITY_KEY,
                                black_box(ants),
                                black_box(iters),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }

    for &n in metaheuristic_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_ant_colony(black_box(h), ACTIVITY_KEY, 5, 5).unwrap()))
        });
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// Simulated Annealing Benchmarks
/// ---------------------------------------------------------------------------

fn bench_simulated_annealing(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/simulated_annealing");
    configure(&mut group, 25, 2, 12);

    if let Some(fixed_handle) = fixed_real_handle() {
        // Parameter sweep: (initial_temperature, cooling_rate)
        for (temp, cooling) in [(10.0_f64, 0.90_f64), (50.0, 0.95), (100.0, 0.99)] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!(
                        "params_temp{}_cool{}",
                        temp as u32,
                        (cooling * 100.0) as u32
                    ),
                    temp as u32,
                ),
                &fixed_handle,
                |b, h| {
                    b.iter(|| {
                        black_box(
                            discover_simulated_annealing(
                                black_box(h),
                                ACTIVITY_KEY,
                                black_box(temp),
                                black_box(cooling),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }

    for &n in metaheuristic_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_simulated_annealing(black_box(h), ACTIVITY_KEY, 50.0, 0.95).unwrap(),
                )
            })
        });
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// A* Search Benchmarks
/// ---------------------------------------------------------------------------

fn bench_astar(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/astar");
    configure(&mut group, 20, 2, 15);

    if let Some(fixed_handle) = fixed_real_handle() {
        // Parameter sweep: max_iterations
        for max_iter in [10_usize, 20, 50] {
            group.bench_with_input(
                BenchmarkId::new(format!("params_iter{}", max_iter), max_iter),
                &fixed_handle,
                |b, h| {
                    b.iter(|| {
                        black_box(
                            discover_astar(black_box(h), ACTIVITY_KEY, black_box(max_iter))
                                .unwrap(),
                        )
                    })
                },
            );
        }
    }

    for &n in metaheuristic_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_astar(black_box(h), ACTIVITY_KEY, 20).unwrap()))
        });
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// Hill Climbing Benchmarks
/// ---------------------------------------------------------------------------

fn bench_hill_climbing(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/hill_climbing");
    configure(&mut group, 15, 2, 20);

    // Hill climbing is greedy and fast - benchmark over real-log prefixes.
    for &n in metaheuristic_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_hill_climbing(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Criterion Main
// ---------------------------------------------------------------------------

criterion_group!(
    tier2_metaheuristic,
    bench_genetic_algorithm,
    bench_pso,
    bench_ilp,
    bench_aco,
    bench_simulated_annealing,
    bench_astar,
    bench_hill_climbing
);
criterion_main!(tier2_metaheuristic);
