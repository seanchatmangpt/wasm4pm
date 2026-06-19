//! Criterion benchmarks for POWL (Process-Oriented Workflow Language) discovery.
//!
//! POWL is a hierarchical process model language with soundness guarantees.
//!
//! Grounded on REAL, publicly sourced XES datasets (see `bench_data/README.md`).
//! Synthetic data generation is a TPS violation and is strictly prohibited — the
//! shared `helpers::generate_event_log` panics, so every benchmark here loads an
//! actual process log and serializes it to the JSON form `discover_powl_from_log`
//! consumes.
use criterion::{criterion_group, criterion_main, black_box, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::models::EventLog;
use wasm4pm::powl_api::discover_powl_from_log;
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;

/// A real event log, parsed and pre-serialized to the JSON `discover_powl_from_log`
/// expects, ready for discovery benchmarking.
struct Dataset {
    label: &'static str,
    /// Pre-serialized JSON of the (optionally capped) `EventLog`.
    json: String,
    /// Total events after any trace cap — used for `Throughput::Elements`.
    events: u64,
}

/// Load the first existing candidate path, parse it, optionally cap the number of
/// traces (to keep large logs runtime-bounded), serialize to JSON, and return it.
fn load_dataset(label: &'static str, candidates: &[&str], max_traces: usize) -> Dataset {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut log: EventLog = candidates
        .iter()
        .filter_map(|p| {
            let resolved = p.replace('~', &home);
            let content = std::fs::read_to_string(&resolved).ok()?;
            if content.len() < 200 {
                return None;
            }
            let parsed = validate_and_parse_xes(&content).ok()?;
            if parsed.traces.is_empty() {
                return None;
            }
            Some(parsed)
        })
        .next()
        .unwrap_or_else(|| {
            panic!(
                "Required real dataset '{}' not found at any of: {:?}\n\
                 Download from https://data.4tu.nl/ — synthetic data is prohibited.",
                label, candidates
            )
        });

    // Cap traces so a measured iteration stays runtime-bounded on large logs.
    if log.traces.len() > max_traces {
        log.traces.truncate(max_traces);
    }
    let events = log.traces.iter().map(|t| t.events.len()).sum::<usize>() as u64;
    let json = serde_json::to_string(&log).expect("bench: serialize EventLog failed");

    Dataset {
        label,
        json,
        events,
    }
}

/// Real discovery datasets, ordered small → large. Trace caps keep per-iteration
/// cost bounded while still exercising real process structure (concurrency, loops,
/// long-tail variants). All carry `concept:name` activity labels.
fn real_datasets() -> Vec<Dataset> {
    vec![
        load_dataset(
            "roadtraffic",
            &[
                "bench_data/roadtraffic100traces.xes",
                "../../bench_data/roadtraffic100traces.xes",
                "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            ],
            100,
        ),
        load_dataset(
            "sepsis",
            &["bench_data/sepsis.xes", "../../bench_data/sepsis.xes"],
            1_050,
        ),
        load_dataset(
            "bpi2020",
            &[
                "bench_data/bpi2020_travel.xes",
                "../../bench_data/bpi2020_travel.xes",
            ],
            // Cap the large travel-permit log so a measured iteration stays bounded.
            2_000,
        ),
    ]
}

/// Apply stable sampling so results are reproducible. Fast mode (default) keeps
/// each binary < ~1s; opt-in `BENCH_FULL=1` runs statistically meaningful samples.
fn configure(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>) {
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(20);
    if helpers::is_fast_mode() {
        helpers::fast_group(group);
    } else {
        helpers::full_group(group);
    }
}

/// Benchmark POWL discovery across real datasets of increasing size.
fn bench_powl_from_log(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("powl/from_log");
    configure(&mut group);

    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.json, |b, json| {
            b.iter(|| black_box(discover_powl_from_log(black_box(json), "inductive").unwrap()));
        });
    }
    group.finish();
}

/// Benchmark POWL discovery variants on a single representative real log (sepsis —
/// rich in concurrency and long-tail variants).
fn bench_powl_variants(c: &mut Criterion) {
    let ds = load_dataset(
        "sepsis",
        &["bench_data/sepsis.xes", "../../bench_data/sepsis.xes"],
        1_050,
    );

    let mut group = c.benchmark_group("powl/variants");
    configure(&mut group);
    group.measurement_time(Duration::from_secs(20));
    group.throughput(Throughput::Elements(ds.events));

    for variant in ["inductive", "alpha", "heuristic"] {
        group.bench_with_input(
            BenchmarkId::new("variant", variant),
            &ds.json,
            |b, json| {
                b.iter(|| black_box(discover_powl_from_log(black_box(json), variant).unwrap()));
            },
        );
    }
    group.finish();
}

criterion_group!(powl_benches, bench_powl_from_log, bench_powl_variants);
criterion_main!(powl_benches);
