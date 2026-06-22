//! Criterion benchmarks for analytics and analysis functions.
//!
//! Grounded on REAL process-mining event logs (no synthetic data — synthetic
//! generation is a TPS violation, see helpers::generate_event_log). Each
//! analytics function is measured against real XES logs loaded from
//! `bench_data/`, with Throughput in events so results are comparable across
//! datasets of different sizes.
//!
//! Datasets:
//!   - sepsis.xes          (ICU patient flow)
//!   - bpi2020_travel.xes  (travel permits — larger)
//!   - roadtraffic100traces.xes (road traffic fines, when present)
//!
//! Every measured input and every returned result is wrapped in `black_box` so
//! the optimizer cannot elide the work being timed.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::fs;
use std::time::Duration;

use wasm4pm::advanced_algorithms::{
    analyze_infrequent_paths, compute_model_metrics, detect_bottlenecks, detect_rework,
};
use wasm4pm::analysis::analyze_dotted_chart;
use wasm4pm::fast_discovery::{analyze_activity_cooccurrence, analyze_start_end_activities};
use wasm4pm::final_analytics::{
    analyze_process_speedup, analyze_temporal_bottlenecks, analyze_variant_complexity,
    compute_activity_transition_matrix, compute_trace_similarity_matrix, extract_activity_ordering,
};
use wasm4pm::more_discovery::analyze_activity_dependencies;
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;
use helpers::{store_log, ACTIVITY_KEY, TIMESTAMP_KEY};

/// A real dataset materialised into APP_STATE: handle + total event count.
struct RealDataset {
    label: &'static str,
    handle: String,
    events: usize,
}

/// Load a real XES log from the first existing candidate path, parse it with
/// the crate's real parser, and store it in APP_STATE. Returns `None` when the
/// dataset is absent (e.g. roadtraffic is optional) so callers can skip it
/// without a synthetic fallback.
fn load_real_dataset(label: &'static str, candidates: &[&str]) -> Option<RealDataset> {
    for path in candidates {
        let content = match fs::read_to_string(path) {
            Ok(c) if c.len() > 200 => c,
            _ => continue,
        };
        let log = match validate_and_parse_xes(&content) {
            Ok(l) if !l.traces.is_empty() => l,
            _ => continue,
        };
        let events = log.event_count();
        let handle = store_log(log);
        return Some(RealDataset {
            label,
            handle,
            events,
        });
    }
    None
}

/// Required + optional real datasets. Sepsis is required (small, always shipped
/// in `bench_data/`); the others enrich the sweep when available.
fn real_datasets() -> Vec<RealDataset> {
    let mut sets = Vec::new();
    if let Some(ds) = load_real_dataset(
        "sepsis",
        &["bench_data/sepsis.xes", "../bench_data/sepsis.xes"],
    ) {
        sets.push(ds);
    }
    if let Some(ds) = load_real_dataset(
        "bpi2020",
        &[
            "bench_data/bpi2020_travel.xes",
            "../bench_data/bpi2020_travel.xes",
        ],
    ) {
        sets.push(ds);
    }
    if let Some(ds) = load_real_dataset(
        "roadtraffic",
        &[
            "bench_data/roadtraffic100traces.xes",
            "../bench_data/roadtraffic100traces.xes",
        ],
    ) {
        sets.push(ds);
    }
    assert!(
        !sets.is_empty(),
        "analytics bench requires at least bench_data/sepsis.xes — no real dataset found"
    );
    sets
}

/// Configure a group: stable, reproducible sampling. In fast mode (default)
/// each binary completes in ~1s; full mode (BENCH_FULL=1) uses statistical
/// sampling for publishable numbers.
fn configure(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>) {
    if helpers::is_fast_mode() {
        helpers::fast_group(group);
    } else {
        group.measurement_time(Duration::from_secs(5));
        group.warm_up_time(Duration::from_millis(500));
        group.sample_size(20);
    }
}

/// Same as `configure` but with reduced sampling for O(n²) workloads.
fn configure_slow(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>) {
    if helpers::is_fast_mode() {
        helpers::fast_group(group);
    } else {
        group.measurement_time(Duration::from_secs(20));
        group.warm_up_time(Duration::from_secs(3));
        group.sample_size(10);
    }
}

fn bench_detect_rework(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/detect_rework");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| black_box(detect_rework(black_box(h), black_box(ACTIVITY_KEY)).unwrap()))
        });
    }
    group.finish();
}

fn bench_detect_bottlenecks(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/detect_bottlenecks");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    detect_bottlenecks(
                        black_box(h),
                        black_box(ACTIVITY_KEY),
                        black_box(TIMESTAMP_KEY),
                        black_box(60),
                    )
                    .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_model_metrics(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/model_metrics");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(compute_model_metrics(black_box(h), black_box(ACTIVITY_KEY)).unwrap())
            })
        });
    }
    group.finish();
}

fn bench_infrequent_paths(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/infrequent_paths");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    analyze_infrequent_paths(black_box(h), black_box(ACTIVITY_KEY), black_box(0.1))
                        .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_variant_complexity(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/variant_complexity");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    analyze_variant_complexity(black_box(h), black_box(ACTIVITY_KEY)).unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_transition_matrix(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/transition_matrix");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    compute_activity_transition_matrix(black_box(h), black_box(ACTIVITY_KEY))
                        .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_process_speedup(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/process_speedup");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        // analyze_process_speedup takes (handle, timestamp_key, window_size)
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    analyze_process_speedup(black_box(h), black_box(TIMESTAMP_KEY), black_box(50))
                        .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_temporal_bottlenecks(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/temporal_bottlenecks");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    analyze_temporal_bottlenecks(
                        black_box(h),
                        black_box(ACTIVITY_KEY),
                        black_box(TIMESTAMP_KEY),
                    )
                    .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_activity_ordering(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/activity_ordering");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(extract_activity_ordering(black_box(h), black_box(ACTIVITY_KEY)).unwrap())
            })
        });
    }
    group.finish();
}

fn bench_trace_similarity(c: &mut Criterion) {
    // O(n²) — reduced sampling.
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/trace_similarity");
    configure_slow(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    compute_trace_similarity_matrix(black_box(h), black_box(ACTIVITY_KEY)).unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_activity_cooccurrence(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/activity_cooccurrence");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    analyze_activity_cooccurrence(black_box(h), black_box(ACTIVITY_KEY)).unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_start_end_activities(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/start_end_activities");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    analyze_start_end_activities(black_box(h), black_box(ACTIVITY_KEY)).unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_activity_dependencies(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/activity_dependencies");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    analyze_activity_dependencies(black_box(h), black_box(ACTIVITY_KEY)).unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_dotted_chart(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("analytics/dotted_chart");
    configure(&mut group);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events as u64));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| black_box(analyze_dotted_chart(black_box(h)).unwrap()))
        });
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
