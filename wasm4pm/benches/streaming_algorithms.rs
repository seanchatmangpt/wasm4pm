/// Criterion benchmarks for streaming DFG discovery algorithms.
///
/// These algorithms process logs incrementally to build a Directly-Follows
/// Graph. They are benchmarked against **real** publicly-sourced XES event
/// logs (synthetic data generation is a TPS violation — see `helpers.rs`),
/// loaded from `bench_data/`:
///   - sepsis.xes            — ICU patient flow (small)
///   - roadtraffic100traces.xes — road-traffic fines (medium)
///   - bpi2020_travel.xes    — travel permits (large, included only in BENCH_FULL)
///
/// Each dataset is parsed once, stored in the global state, and the resulting
/// handle is reused across iterations. Throughput is reported in Elements
/// (events processed) so scalar vs. SIMD variants are comparable across sizes.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::path::Path;
use std::time::Duration;
use wasm4pm::discovery::discover_dfg;
use wasm4pm::simd_streaming_dfg::discover_dfg_simd_handle;
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;
use helpers::{is_fast_mode, store_log, ACTIVITY_KEY};

/// A real dataset to benchmark: (label, relative path, total events after load).
struct Dataset {
    label: &'static str,
    handle: String,
    events: u64,
}

/// Load the real XES datasets available under `bench_data/`. In fast mode only
/// the two smaller logs are used; `BENCH_FULL=1` adds the large BPI-2020 log.
fn load_datasets() -> Vec<Dataset> {
    let mut specs: Vec<(&str, &str)> = vec![
        ("sepsis", "bench_data/sepsis.xes"),
        ("roadtraffic", "bench_data/roadtraffic100traces.xes"),
    ];
    if !is_fast_mode() {
        specs.push(("bpi2020_travel", "bench_data/bpi2020_travel.xes"));
    }

    let mut out = Vec::new();
    for (label, rel) in specs {
        let path = Path::new(rel);
        if !path.exists() {
            // Skip cleanly if a dataset is absent (e.g. CI without bench_data);
            // never fabricate a synthetic log — that is a TPS violation.
            eprintln!("streaming bench: dataset '{}' missing at {}, skipping", label, rel);
            continue;
        }
        let content = std::fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("bench: failed to read {}: {}", rel, e));
        let log = validate_and_parse_xes(&content)
            .unwrap_or_else(|e| panic!("bench: failed to parse {}: {}", rel, e));
        let events = log.event_count() as u64;
        assert!(events > 0, "bench: real dataset '{}' parsed to 0 events", label);
        let handle = store_log(log);
        out.push(Dataset { label, handle, events });
    }
    assert!(
        !out.is_empty(),
        "bench: no real datasets available under bench_data/ — cannot benchmark streaming DFG"
    );
    out
}

fn bench_dfg_scalar(c: &mut Criterion) {
    let datasets = load_datasets();
    let mut group = c.benchmark_group("streaming/dfg_scalar");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &ds.handle,
            |b, h| {
                b.iter(|| {
                    black_box(
                        discover_dfg(black_box(h.as_str()), black_box(ACTIVITY_KEY)).unwrap(),
                    )
                })
            },
        );
    }
    group.finish();
}

fn bench_dfg_simd_handle(c: &mut Criterion) {
    let datasets = load_datasets();
    let mut group = c.benchmark_group("streaming/dfg_simd_handle");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &ds.handle,
            |b, h| {
                b.iter(|| {
                    black_box(
                        discover_dfg_simd_handle(black_box(h.as_str()), black_box(ACTIVITY_KEY))
                            .unwrap(),
                    )
                })
            },
        );
    }
    group.finish();
}

criterion_group!(streaming_benches, bench_dfg_scalar, bench_dfg_simd_handle);
criterion_main!(streaming_benches);
