/// Criterion benchmarks for Tier 1 (fast) discovery algorithms.
///
/// Tier 1 algorithms are the fastest process discovery methods:
/// - DFG (Directly-Follows Graph) - O(n) single pass
/// - Process Skeleton - filtered DFG with min frequency
/// - Alpha++ - basic Petri net discovery
/// - Heuristic Miner - threshold-based dependency discovery
/// - Inductive Miner - recursive structure discovery
///
/// These benchmarks sweep 4 standard dataset sizes (100 to 50k events).
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::advanced_algorithms::discover_heuristic_miner;
use pictl::algorithms::discover_alpha_plus_plus;
use pictl::discovery::discover_dfg;
use pictl::more_discovery::{discover_inductive_miner, extract_process_skeleton};
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, make_handle, ACTIVITY_KEY};

/// Benchmark DFG discovery - the foundational O(n) algorithm
fn bench_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/dfg");
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

/// Benchmark Process Skeleton extraction - DFG with frequency filtering
fn bench_process_skeleton(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/process_skeleton");
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

/// Benchmark Alpha++ algorithm - basic Petri net discovery
fn bench_alpha_plus_plus(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/alpha_plus_plus");
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

/// Benchmark Heuristic Miner with dependency threshold
fn bench_heuristic_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/heuristic_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        // Benchmark with default threshold of 0.5
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_heuristic_miner(h, ACTIVITY_KEY, 0.5).unwrap()),
        );
    }
    group.finish();
}

/// Benchmark Inductive Miner - recursive structure discovery
fn bench_inductive_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/inductive_miner");
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

criterion_group!(
    tier1_benches,
    bench_dfg,
    bench_process_skeleton,
    bench_alpha_plus_plus,
    bench_heuristic_miner,
    bench_inductive_miner,
);
criterion_main!(tier1_benches);
