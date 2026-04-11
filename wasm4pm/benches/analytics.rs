/// Criterion benchmarks for analytics and analysis functions.
/// All sweeps use full four-size range; O(n²) algorithms capped at 1K cases.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::advanced_algorithms::{
    analyze_infrequent_paths, compute_model_metrics, detect_bottlenecks, detect_rework,
};
use pictl::analysis::analyze_dotted_chart;
use pictl::fast_discovery::{analyze_activity_cooccurrence, analyze_start_end_activities};
use pictl::final_analytics::{
    analyze_process_speedup, analyze_temporal_bottlenecks, analyze_variant_complexity,
    compute_activity_transition_matrix, compute_trace_similarity_matrix, extract_activity_ordering,
};
use pictl::more_discovery::analyze_activity_dependencies;
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, bench_sizes_slow, make_handle, ACTIVITY_KEY, TIMESTAMP_KEY};

fn bench_detect_rework(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/detect_rework");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| detect_rework(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_detect_bottlenecks(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/detect_bottlenecks");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| detect_bottlenecks(h, ACTIVITY_KEY, TIMESTAMP_KEY, 60).unwrap()),
        );
    }
    group.finish();
}

fn bench_model_metrics(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/model_metrics");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(40);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| compute_model_metrics(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_infrequent_paths(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/infrequent_paths");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(40);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_infrequent_paths(h, ACTIVITY_KEY, 0.1).unwrap()),
        );
    }
    group.finish();
}

fn bench_variant_complexity(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/variant_complexity");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_variant_complexity(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_transition_matrix(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/transition_matrix");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(40);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| compute_activity_transition_matrix(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_process_speedup(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/process_speedup");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(40);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            // analyze_process_speedup takes (handle, timestamp_key, window_size)
            |b, h| b.iter(|| analyze_process_speedup(h, TIMESTAMP_KEY, 50).unwrap()),
        );
    }
    group.finish();
}

fn bench_temporal_bottlenecks(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/temporal_bottlenecks");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(40);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_temporal_bottlenecks(h, ACTIVITY_KEY, TIMESTAMP_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_activity_ordering(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/activity_ordering");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(40);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| extract_activity_ordering(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_trace_similarity(c: &mut Criterion) {
    // O(n²) — cap at 1K cases
    let mut group = c.benchmark_group("analytics/trace_similarity");
    group.measurement_time(Duration::from_secs(20));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(10);
    for shape in bench_sizes_slow() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| compute_trace_similarity_matrix(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_activity_cooccurrence(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/activity_cooccurrence");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(40);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_activity_cooccurrence(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_start_end_activities(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/start_end_activities");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_start_end_activities(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_activity_dependencies(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/activity_dependencies");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_activity_dependencies(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_dotted_chart(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/dotted_chart");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| analyze_dotted_chart(h).unwrap()),
        );
    }
    group.finish();
}

criterion_group!(
    analytics_benches,
    bench_detect_rework,
    bench_detect_bottlenecks,
    bench_model_metrics,
    bench_infrequent_paths,
    bench_variant_complexity,
    bench_transition_matrix,
    bench_process_speedup,
    bench_temporal_bottlenecks,
    bench_activity_ordering,
    bench_trace_similarity,
    bench_activity_cooccurrence,
    bench_start_end_activities,
    bench_activity_dependencies,
    bench_dotted_chart,
);
criterion_main!(analytics_benches);
