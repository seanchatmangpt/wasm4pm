/// Criterion benchmarks for extended discovery algorithms.
/// Covers performance analysis, social networks, causal graphs, etc.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::batches::discover_batches_wasm;
use pictl::causal_graph::{discover_causal_alpha, discover_causal_heuristic};
use pictl::correlation_miner::discover_correlation;
use pictl::hierarchical::discover_dfg_hierarchical;
use pictl::performance_dfg::discover_performance_dfg;
use pictl::process_tree::discover_simple_process_tree;
use pictl::social_network::{discover_handover_network, discover_working_together_network};
use pictl::temporal_profile::discover_temporal_profile;
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, make_handle, ACTIVITY_KEY, TIMESTAMP_KEY};

fn bench_correlation_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/correlation");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for threshold in [0.3_f64, 0.5, 0.7] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!("c{}_t{}", shape.num_cases, threshold),
                    shape.num_cases,
                ),
                &(&handle, threshold),
                |b, (h, t)| {
                    b.iter(|| discover_correlation(h, ACTIVITY_KEY, TIMESTAMP_KEY, *t).unwrap())
                },
            );
        }
    }
    group.finish();
}

fn bench_performance_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/performance_dfg");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_performance_dfg(h, ACTIVITY_KEY, TIMESTAMP_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_handover_network(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/handover_network");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    const RESOURCE_KEY: &str = "org:resource";

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_handover_network(h, RESOURCE_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_working_together_network(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/working_together");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    const RESOURCE_KEY: &str = "org:resource";

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_working_together_network(h, RESOURCE_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_temporal_profile(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/temporal_profile");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_temporal_profile(h, ACTIVITY_KEY, TIMESTAMP_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_causal_alpha(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/causal_alpha");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_causal_alpha(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_causal_heuristic(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/causal_heuristic");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for threshold in [0.5_f64, 0.7, 0.9] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!("c{}_t{}", shape.num_cases, threshold),
                    shape.num_cases,
                ),
                &(&handle, threshold),
                |b, (h, t)| b.iter(|| discover_causal_heuristic(h, ACTIVITY_KEY, *t).unwrap()),
            );
        }
    }
    group.finish();
}

fn bench_process_tree(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/process_tree");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_simple_process_tree(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_hierarchical_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/hierarchical_dfg");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for chunk_size in [100_usize, 500, 1000] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!("c{}_chunk{}", shape.num_cases, chunk_size),
                    shape.num_cases,
                ),
                &(&handle, chunk_size),
                |b, (h, c)| b.iter(|| discover_dfg_hierarchical(h, ACTIVITY_KEY, *c).unwrap()),
            );
        }
    }
    group.finish();
}

fn bench_batches(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/batches");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_batches_wasm(h, ACTIVITY_KEY, TIMESTAMP_KEY).unwrap()),
        );
    }
    group.finish();
}

criterion_group!(
    extended_benches,
    bench_correlation_miner,
    bench_performance_dfg,
    bench_handover_network,
    bench_working_together_network,
    bench_temporal_profile,
    bench_causal_alpha,
    bench_causal_heuristic,
    bench_process_tree,
    bench_hierarchical_dfg,
    bench_batches,
);
criterion_main!(extended_benches);
