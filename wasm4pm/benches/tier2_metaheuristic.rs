/// Criterion benchmarks for Tier 2-3 metaheuristic discovery algorithms.
///
/// Tier 2-3 algorithms are computationally intensive (metaheuristics, optimization-based).
/// This benchmark uses small synthetic logs to keep runtime reasonable.
///
/// Algorithms covered:
/// - Genetic Algorithm (evolutionary search)
/// - PSO / Particle Swarm Optimization (swarm intelligence)
/// - ILP / Integer Linear Programming (constraint optimization)
/// - ACO / Ant Colony Optimization (pheromone-based search)
/// - Simulated Annealing (thermal search)
/// - A* Search (informed heuristic search)
/// - Hill Climbing (greedy local optimization)
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::fast_discovery::{discover_astar, discover_hill_climbing};
use pictl::genetic_discovery::{discover_genetic_algorithm, discover_pso_algorithm};
use pictl::ilp_discovery::discover_ilp_petri_net;
use pictl::more_discovery::{discover_ant_colony, discover_simulated_annealing};
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{make_handle, LogShape, ACTIVITY_KEY};

/// Small log sizes for metaheuristics (they're expensive).
/// These are intentionally smaller than general benchmarks.
fn metaheuristic_sizes() -> Vec<LogShape> {
    vec![
        LogShape {
            num_cases: 20,
            avg_events_per_case: 8,
            num_activities: 5,
            noise_factor: 0.05,
        },
        LogShape {
            num_cases: 50,
            avg_events_per_case: 10,
            num_activities: 8,
            noise_factor: 0.10,
        },
        LogShape {
            num_cases: 100,
            avg_events_per_case: 12,
            num_activities: 10,
            noise_factor: 0.10,
        },
    ]
}

/// ---------------------------------------------------------------------------
/// Genetic Algorithm Benchmarks
/// ---------------------------------------------------------------------------

fn bench_genetic_algorithm(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/genetic_algorithm");
    group.measurement_time(Duration::from_secs(30));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(10);

    // Fixed log for parameter sweep
    let fixed_shape = LogShape {
        num_cases: 50,
        avg_events_per_case: 10,
        num_activities: 8,
        noise_factor: 0.10,
    };
    let (fixed_handle, _) = make_handle(&fixed_shape);

    // Parameter sweep: (population_size, generations)
    for (pop, gen) in [(5_usize, 3_usize), (10, 5), (20, 10)] {
        group.bench_with_input(
            BenchmarkId::new(format!("params_pop{}_gen{}", pop, gen), 50),
            &fixed_handle,
            |b, h| b.iter(|| discover_genetic_algorithm(h, ACTIVITY_KEY, pop, gen).unwrap()),
        );
    }

    // Size sweep at minimal parameters
    for shape in metaheuristic_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_genetic_algorithm(h, ACTIVITY_KEY, 5, 3).unwrap()),
        );
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// PSO (Particle Swarm Optimization) Benchmarks
/// ---------------------------------------------------------------------------

fn bench_pso(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/pso");
    group.measurement_time(Duration::from_secs(30));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(10);

    // Fixed log for parameter sweep
    let fixed_shape = LogShape {
        num_cases: 50,
        avg_events_per_case: 10,
        num_activities: 8,
        noise_factor: 0.10,
    };
    let (fixed_handle, _) = make_handle(&fixed_shape);

    // Parameter sweep: (swarm_size, iterations)
    for (swarm, iters) in [(5_usize, 5_usize), (10, 10), (15, 15)] {
        group.bench_with_input(
            BenchmarkId::new(format!("params_swarm{}_iter{}", swarm, iters), 50),
            &fixed_handle,
            |b, h| b.iter(|| discover_pso_algorithm(h, ACTIVITY_KEY, swarm, iters).unwrap()),
        );
    }

    // Size sweep at minimal parameters
    for shape in metaheuristic_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_pso_algorithm(h, ACTIVITY_KEY, 5, 5).unwrap()),
        );
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// ILP (Integer Linear Programming) Benchmarks
/// ---------------------------------------------------------------------------

fn bench_ilp(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/ilp");
    group.measurement_time(Duration::from_secs(20));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(15);

    for shape in metaheuristic_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_ilp_petri_net(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// ACO (Ant Colony Optimization) Benchmarks
/// ---------------------------------------------------------------------------

fn bench_aco(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/aco");
    group.measurement_time(Duration::from_secs(30));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(10);

    // Fixed log for parameter sweep
    let fixed_shape = LogShape {
        num_cases: 50,
        avg_events_per_case: 10,
        num_activities: 8,
        noise_factor: 0.10,
    };
    let (fixed_handle, _) = make_handle(&fixed_shape);

    // Parameter sweep: (num_ants, iterations)
    for (ants, iters) in [(5_usize, 5_usize), (10, 10), (15, 15)] {
        group.bench_with_input(
            BenchmarkId::new(format!("params_ants{}_iter{}", ants, iters), 50),
            &fixed_handle,
            |b, h| b.iter(|| discover_ant_colony(h, ACTIVITY_KEY, ants, iters).unwrap()),
        );
    }

    // Size sweep at minimal parameters
    for shape in metaheuristic_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_ant_colony(h, ACTIVITY_KEY, 5, 5).unwrap()),
        );
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// Simulated Annealing Benchmarks
/// ---------------------------------------------------------------------------

fn bench_simulated_annealing(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/simulated_annealing");
    group.measurement_time(Duration::from_secs(25));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(12);

    // Fixed log for parameter sweep
    let fixed_shape = LogShape {
        num_cases: 50,
        avg_events_per_case: 10,
        num_activities: 8,
        noise_factor: 0.10,
    };
    let (fixed_handle, _) = make_handle(&fixed_shape);

    // Parameter sweep: (initial_temperature, cooling_rate)
    for (temp, cooling) in [(10.0_f64, 0.90_f64), (50.0, 0.95), (100.0, 0.99)] {
        group.bench_with_input(
            BenchmarkId::new(
                format!(
                    "params_temp{}_cool{}",
                    temp as u32,
                    (cooling * 100.0) as u32
                ),
                50,
            ),
            &fixed_handle,
            |b, h| b.iter(|| discover_simulated_annealing(h, ACTIVITY_KEY, temp, cooling).unwrap()),
        );
    }

    // Size sweep at default parameters
    for shape in metaheuristic_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_simulated_annealing(h, ACTIVITY_KEY, 50.0, 0.95).unwrap()),
        );
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// A* Search Benchmarks
/// ---------------------------------------------------------------------------

fn bench_astar(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/astar");
    group.measurement_time(Duration::from_secs(20));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(15);

    // Fixed log for parameter sweep
    let fixed_shape = LogShape {
        num_cases: 50,
        avg_events_per_case: 10,
        num_activities: 8,
        noise_factor: 0.10,
    };
    let (fixed_handle, _) = make_handle(&fixed_shape);

    // Parameter sweep: max_iterations
    for max_iter in [10_usize, 20, 50] {
        group.bench_with_input(
            BenchmarkId::new(format!("params_iter{}", max_iter), 50),
            &fixed_handle,
            |b, h| b.iter(|| discover_astar(h, ACTIVITY_KEY, max_iter).unwrap()),
        );
    }

    // Size sweep at default iterations
    for shape in metaheuristic_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_astar(h, ACTIVITY_KEY, 20).unwrap()),
        );
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// Hill Climbing Benchmarks
/// ---------------------------------------------------------------------------

fn bench_hill_climbing(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier2/hill_climbing");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);

    // Hill climbing is greedy and fast - benchmark larger sizes
    for shape in metaheuristic_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_hill_climbing(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

/// ---------------------------------------------------------------------------
/// Criterion Main
/// ---------------------------------------------------------------------------

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
