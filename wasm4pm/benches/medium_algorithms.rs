/// Criterion benchmarks for medium-speed algorithms (5–200ms per call).
/// Sizes capped at 10K cases for the slower members of this group.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::algorithms::discover_dfg_filtered;
use wasm4pm::fast_discovery::{
    analyze_trace_variants, cluster_traces, detect_concept_drift, discover_astar,
    mine_sequential_patterns,
};
use wasm4pm::ilp_discovery::discover_optimized_dfg;
use wasm4pm::more_discovery::{discover_ant_colony, discover_simulated_annealing};

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, make_handle, ACTIVITY_KEY};

fn bench_astar(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/astar");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(20);
    for shape in bench_sizes() {
        if shape.num_cases > 10_000 { continue; }
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_astar(h, ACTIVITY_KEY, 500).unwrap()),
        );
    }
    group.finish();
}

fn bench_simulated_annealing(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/simulated_annealing");
    group.measurement_time(Duration::from_secs(20));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(15);
    for shape in bench_sizes() {
        if shape.num_cases > 5_000 { continue; }
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for (temp, cooling) in [(100.0_f64, 0.95_f64), (100.0, 0.99)] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!("c{}_t{}_cool{}", shape.num_cases, temp, cooling),
                    shape.num_cases,
                ),
                &handle,
                |b, h| b.iter(|| discover_simulated_annealing(h, ACTIVITY_KEY, temp, cooling).unwrap()),
            );
        }
    }
    group.finish();
}

fn bench_ant_colony(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/ant_colony");
    group.measurement_time(Duration::from_secs(20));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(15);
    for shape in bench_sizes() {
        if shape.num_cases > 5_000 { continue; }
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_ant_colony(h, ACTIVITY_KEY, 20, 10).unwrap()),
        );
    }
    group.finish();
}

fn bench_dfg_filtered(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/dfg_filtered");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for min_freq in [2_usize, 5, 10] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!("cases{}_mf{}", shape.num_cases, min_freq),
                    shape.num_cases,
                ),
                &handle,
                |b, h| b.iter(|| discover_dfg_filtered(h, ACTIVITY_KEY, min_freq).unwrap()),
            );
        }
    }
    group.finish();
}

fn bench_optimized_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/optimized_dfg");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_optimized_dfg(h, ACTIVITY_KEY, 0.8, 0.2).unwrap()),
        );
    }
    group.finish();
}

fn bench_trace_variants(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/trace_variants");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_trace_variants(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_sequential_patterns(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/sequential_patterns");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);
    for shape in bench_sizes() {
        if shape.num_cases > 10_000 { continue; }
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| mine_sequential_patterns(h, ACTIVITY_KEY, 0.1, 3).unwrap()),
        );
    }
    group.finish();
}

fn bench_concept_drift(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/concept_drift");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);
    for shape in bench_sizes() {
        if shape.num_cases > 10_000 { continue; }
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| detect_concept_drift(h, ACTIVITY_KEY, 50).unwrap()),
        );
    }
    group.finish();
}

fn bench_cluster_traces(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/cluster_traces");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);
    for shape in bench_sizes() {
        if shape.num_cases > 10_000 { continue; }
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| cluster_traces(h, ACTIVITY_KEY, 5).unwrap()),
        );
    }
    group.finish();
}

criterion_group!(
    medium_benches,
    bench_astar,
    bench_simulated_annealing,
    bench_ant_colony,
    bench_dfg_filtered,
    bench_optimized_dfg,
    bench_trace_variants,
    bench_sequential_patterns,
    bench_concept_drift,
    bench_cluster_traces,
);
criterion_main!(medium_benches);
