/// Criterion benchmarks for streaming algorithms.
/// These algorithms process logs incrementally.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::discovery::discover_dfg;
use pictl::simd_streaming_dfg::discover_dfg_simd_handle;
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, make_handle, ACTIVITY_KEY};

fn bench_dfg_scalar(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming/dfg_scalar");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

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

fn bench_dfg_simd_handle(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming/dfg_simd_handle");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_dfg_simd_handle(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

criterion_group!(streaming_benches, bench_dfg_scalar, bench_dfg_simd_handle,);
criterion_main!(streaming_benches);
