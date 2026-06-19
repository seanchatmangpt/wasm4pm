//! Criterion benchmarks for `prediction_drift`.
//!
//! Measures the throughput of:
//!
//! * `ewma_series` over numeric series of varying length.
//! * `jaccard_distance` over activity-vocabulary sets of varying size.
//! * `detect_drift` over synthetic event logs of varying scale.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::HashSet;
use std::fs;
use std::time::Duration;
use wasm4pm::prediction_drift::{ewma_series, jaccard_distance};
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;
use helpers::{store_log, ACTIVITY_KEY};

/// Load a real XES dataset, store it in global state, and return
/// `(handle, total_events)`. Panics if the dataset cannot be found —
/// synthetic data is prohibited (see helpers.rs TPS rule).
fn load_real_log(candidates: &[&str], label: &str) -> (String, usize) {
    let home = std::env::var("HOME").unwrap_or_default();
    let log = candidates
        .iter()
        .filter_map(|p| {
            let resolved = p.replace('~', &home);
            let content = fs::read_to_string(&resolved).ok()?;
            if content.len() < 200 {
                return None;
            }
            let l = validate_and_parse_xes(&content).ok()?;
            if l.traces.is_empty() {
                None
            } else {
                Some(l)
            }
        })
        .next()
        .unwrap_or_else(|| {
            panic!(
                "Required dataset '{}' not found at any of: {:?}",
                label, candidates
            )
        });
    let total_events = log.traces.iter().map(|t| t.events.len()).sum::<usize>();
    (store_log(log), total_events)
}

// ---------------------------------------------------------------------------
// EWMA
// ---------------------------------------------------------------------------

fn bench_ewma(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/ewma");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for n in [16usize, 256, 4_096, 65_536] {
        let series: Vec<f64> = (0..n).map(|i| (i as f64 * 0.01).sin()).collect();
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::new("len", n), &series, |b, s| {
            b.iter(|| black_box(ewma_series(black_box(s), black_box(0.3))));
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
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for n in [8usize, 64, 512, 4_096] {
        let a = make_set("act", n);
        // Build B with ~50 % overlap with A (worst-case union/intersection sizes).
        let mut b = HashSet::with_capacity(n);
        for i in (n / 2)..(n + n / 2) {
            b.insert(format!("act_{}", i));
        }
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::new("set_size", n), &(a, b), |bench, (a, b)| {
            bench.iter(|| black_box(jaccard_distance(black_box(a), black_box(b))));
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
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    // Real process-mining logs. detect_drift walks trace windows comparing
    // activity vocabularies, so exercising it on genuine logs (varied trace
    // counts and activity alphabets) is the meaningful workload.
    let datasets: &[(&str, &[&str])] = &[
        ("sepsis", &["bench_data/sepsis.xes", "../../bench_data/sepsis.xes"]),
        (
            "roadtraffic",
            &[
                "bench_data/roadtraffic100traces.xes",
                "../../bench_data/roadtraffic100traces.xes",
            ],
        ),
        (
            "bpi2020",
            &["bench_data/bpi2020_travel.xes", "../../bench_data/bpi2020_travel.xes"],
        ),
    ];

    for (label, candidates) in datasets {
        let (handle, events) = load_real_log(candidates, label);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("dataset", label), &handle, |b, h| {
            b.iter(|| {
                let result = detect_drift(black_box(h), black_box(ACTIVITY_KEY), black_box(5));
                black_box(result.is_ok())
            });
        });
    }
    group.finish();
}

criterion_group!(drift, bench_ewma, bench_jaccard, bench_detect_drift);
criterion_main!(drift);
