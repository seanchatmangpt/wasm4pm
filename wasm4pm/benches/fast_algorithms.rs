/// Criterion benchmarks for fast process discovery algorithms (<50ms per call).
/// Sweeps all four standard dataset sizes.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::advanced_algorithms::discover_heuristic_miner;
use wasm4pm::algorithms::discover_alpha_plus_plus;
use wasm4pm::analysis::{analyze_case_duration, analyze_event_statistics};
use wasm4pm::discovery::{discover_declare, discover_dfg};
use wasm4pm::fast_discovery::discover_hill_climbing;
use wasm4pm::more_discovery::{discover_inductive_miner, extract_process_skeleton};

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, make_handle, ACTIVITY_KEY};

fn bench_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/dfg");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_dfg(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_declare(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/declare");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    for shape in bench_sizes() {
        if shape.num_cases > 10_000 {
            continue;
        } // O(activities² × cases)
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_declare(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_heuristic_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/heuristic_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        // Benchmark three dependency thresholds
        for threshold in [0.3_f64, 0.5, 0.8] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!("cases{}_t{}", shape.num_cases, threshold),
                    shape.num_cases,
                ),
                &handle,
                |b, h| b.iter(|| discover_heuristic_miner(h, ACTIVITY_KEY, threshold).unwrap()),
            );
        }
    }
    group.finish();
}

fn bench_alpha_plus_plus(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/alpha_plus_plus");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_alpha_plus_plus(h, ACTIVITY_KEY, 0.1).unwrap()),
        );
    }
    group.finish();
}

fn bench_inductive_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/inductive_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_inductive_miner(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_hill_climbing(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/hill_climbing");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    for shape in bench_sizes() {
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

fn bench_process_skeleton(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/process_skeleton");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| extract_process_skeleton(h, ACTIVITY_KEY, 2).unwrap()),
        );
    }
    group.finish();
}

fn bench_event_statistics(c: &mut Criterion) {
    let mut group = c.benchmark_group("analysis/event_statistics");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_event_statistics(h).unwrap()),
        );
    }
    group.finish();
}

fn bench_case_duration(c: &mut Criterion) {
    let mut group = c.benchmark_group("analysis/case_duration");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_case_duration(h).unwrap()),
        );
    }
    group.finish();
}

criterion_group!(
    fast_benches,
    bench_dfg,
    bench_declare,
    bench_heuristic_miner,
    bench_alpha_plus_plus,
    bench_inductive_miner,
    bench_hill_climbing,
    bench_process_skeleton,
    bench_event_statistics,
    bench_case_duration,
);
criterion_main!(fast_benches);
