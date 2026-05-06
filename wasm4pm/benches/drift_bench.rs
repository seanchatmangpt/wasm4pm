//! Criterion benchmarks for `prediction_drift`.
//!
//! Measures the throughput of:
//!
//! * `ewma_series` over numeric series of varying length.
//! * `jaccard_distance` over activity-vocabulary sets of varying size.
//! * `detect_drift` over synthetic event logs of varying scale.

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::HashSet;
use std::time::Duration;
use wasm4pm::prediction_drift::{ewma_series, jaccard_distance};

#[path = "helpers.rs"]
mod helpers;
use helpers::{make_handle, LogShape, ACTIVITY_KEY};

// ---------------------------------------------------------------------------
// EWMA
// ---------------------------------------------------------------------------

fn bench_ewma(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/ewma");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }
    for n in [16usize, 256, 4_096, 65_536] {
        let series: Vec<f64> = (0..n).map(|i| (i as f64 * 0.01).sin()).collect();
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::new("len", n), &series, |b, s| {
            b.iter(|| ewma_series(s, 0.3));
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Jaccard distance
// ---------------------------------------------------------------------------

fn make_set(prefix: &str, n: usize) -> HashSet<String> {
    (0..n).map(|i| format!("{}_{}", prefix, i)).collect()
}

fn bench_jaccard(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/jaccard");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }
    for n in [8usize, 64, 512, 4_096] {
        let a = make_set("act", n);
        // Build B with ~50 % overlap with A (worst-case union/intersection sizes).
        let mut b = HashSet::with_capacity(n);
        for i in (n / 2)..(n + n / 2) {
            b.insert(format!("act_{}", i));
        }
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::new("set_size", n), &(a, b), |bench, (a, b)| {
            bench.iter(|| jaccard_distance(a, b));
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// detect_drift over synthetic event logs
// ---------------------------------------------------------------------------

fn bench_detect_drift(c: &mut Criterion) {
    use wasm4pm::prediction_drift::detect_drift;

    let mut group = c.benchmark_group("drift/detect_drift");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let shapes = [
        LogShape {
            num_cases: 100,
            avg_events_per_case: 10,
            num_activities: 8,
            noise_factor: 0.05,
        },
        LogShape {
            num_cases: 1_000,
            avg_events_per_case: 15,
            num_activities: 12,
            noise_factor: 0.10,
        },
        LogShape {
            num_cases: 10_000,
            avg_events_per_case: 15,
            num_activities: 15,
            noise_factor: 0.10,
        },
    ];

    for shape in shapes {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| {
                b.iter(|| {
                    // Discard the JsValue result; only the work matters for timing.
                    let _ = detect_drift(h, ACTIVITY_KEY, 5);
                });
            },
        );
    }
    group.finish();
}

criterion_group!(drift, bench_ewma, bench_jaccard, bench_detect_drift);
criterion_main!(drift);
