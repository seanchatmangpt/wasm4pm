/// Criterion benchmarks for ML-based analysis algorithms.
/// ML operations typically scale O(n) to O(n log n) with moderate constant factors.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::fast_discovery::{analyze_trace_variants, cluster_traces, detect_concept_drift};
use pictl::prediction::build_ngram_predictor;
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, make_handle, ACTIVITY_KEY};

fn bench_ngram_predictor(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/ngram_predictor");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for order in [1_usize, 2, 3] {
            group.bench_with_input(
                BenchmarkId::new(format!("c{}_n{}", shape.num_cases, order), shape.num_cases),
                &(&handle, order),
                |b, (h, n)| b.iter(|| build_ngram_predictor(h, ACTIVITY_KEY, *n).unwrap()),
            );
        }
    }
    group.finish();
}

fn bench_cluster_traces(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/cluster");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for n_clusters in [3_usize, 5, 10] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!("c{}_k{}", shape.num_cases, n_clusters),
                    shape.num_cases,
                ),
                &(&handle, n_clusters),
                |b, (h, k)| b.iter(|| cluster_traces(h, ACTIVITY_KEY, *k).unwrap()),
            );
        }
    }
    group.finish();
}

fn bench_concept_drift(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/concept_drift");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for window_size in [50_usize, 100, 200] {
            group.bench_with_input(
                BenchmarkId::new(
                    format!("c{}_w{}", shape.num_cases, window_size),
                    shape.num_cases,
                ),
                &(&handle, window_size),
                |b, (h, w)| b.iter(|| detect_concept_drift(h, ACTIVITY_KEY, *w).unwrap()),
            );
        }
    }
    group.finish();
}

fn bench_trace_variants(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/trace_variants");
    group.measurement_time(Duration::from_secs(10));
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

criterion_group!(
    ml_benches,
    bench_ngram_predictor,
    bench_cluster_traces,
    bench_concept_drift,
    bench_trace_variants,
);
criterion_main!(ml_benches);
