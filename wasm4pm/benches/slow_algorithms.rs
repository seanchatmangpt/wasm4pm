/// Criterion benchmarks for slow metaheuristic algorithms (>200ms per call).
/// Sizes capped at 1K cases. Parameter sweeps included.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use pictl::genetic_discovery::{discover_genetic_algorithm, discover_pso_algorithm};
use pictl::ilp_discovery::discover_ilp_petri_net;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes_slow, make_handle, ACTIVITY_KEY};

fn bench_genetic_algorithm(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/genetic_algorithm");
    group.measurement_time(Duration::from_secs(60));
    group.warm_up_time(Duration::from_secs(5));
    group.sample_size(10);

    // Parameter sweep: (population, generations) at 500 cases
    let fixed_shape = helpers::LogShape {
        num_cases: 500,
        avg_events_per_case: 12,
        num_activities: 10,
        noise_factor: 0.1,
    };
    let (fixed_handle, _) = make_handle(&fixed_shape);
    for (pop, gen) in [(10_usize, 5_usize), (20, 10), (50, 20)] {
        group.bench_with_input(
            BenchmarkId::new(format!("pop{}_gen{}", pop, gen), 500),
            &fixed_handle,
            |b, h| b.iter(|| discover_genetic_algorithm(h, ACTIVITY_KEY, pop, gen).unwrap()),
        );
    }

    // Size sweep at minimal parameters
    for shape in bench_sizes_slow() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases_p10_g5", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_genetic_algorithm(h, ACTIVITY_KEY, 10, 5).unwrap()),
        );
    }
    group.finish();
}

fn bench_pso(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/pso");
    group.measurement_time(Duration::from_secs(60));
    group.warm_up_time(Duration::from_secs(5));
    group.sample_size(10);

    // Parameter sweep at 500 cases
    let fixed_shape = helpers::LogShape {
        num_cases: 500,
        avg_events_per_case: 12,
        num_activities: 10,
        noise_factor: 0.1,
    };
    let (fixed_handle, _) = make_handle(&fixed_shape);
    for (swarm, iters) in [(10_usize, 10_usize), (20, 15), (30, 20)] {
        group.bench_with_input(
            BenchmarkId::new(format!("swarm{}_iter{}", swarm, iters), 500),
            &fixed_handle,
            |b, h| b.iter(|| discover_pso_algorithm(h, ACTIVITY_KEY, swarm, iters).unwrap()),
        );
    }

    // Size sweep at minimal parameters
    for shape in bench_sizes_slow() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases_s10_i10", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_pso_algorithm(h, ACTIVITY_KEY, 10, 10).unwrap()),
        );
    }
    group.finish();
}

fn bench_ilp(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/ilp");
    group.measurement_time(Duration::from_secs(30));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(15);
    for shape in bench_sizes_slow() {
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

criterion_group!(slow_benches, bench_genetic_algorithm, bench_pso, bench_ilp);
criterion_main!(slow_benches);
