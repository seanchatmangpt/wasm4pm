//! Criterion benchmarks for the conformance-checking pipeline.
//!
//! Discovers a Petri-net model (ILP miner) from a REAL event log, then replays
//! the log against it via token-based replay. Grounded on publicly sourced XES
//! datasets (no synthetic data — see `bench_data/README.md`); `helpers::make_handle`
//! is deliberately NOT used here because synthetic generation is prohibited.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::conformance::check_token_based_replay;
use wasm4pm::discovery::discover_dfg;
use wasm4pm::ilp_discovery::discover_ilp_petri_net;
use wasm4pm::models::{EventLog, PetriNet};
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;
use helpers::ACTIVITY_KEY;

/// A real, stored event log ready for conformance benchmarking.
struct Dataset {
    label: &'static str,
    /// State handle for the stored `EventLog`.
    log_handle: String,
    /// State handle for the ILP-discovered `PetriNet`.
    pn_handle: String,
    /// Total events (after any trace cap) — used for Throughput.
    events: u64,
}

/// Load the first existing candidate path, parse it, optionally cap the number of
/// traces (to keep large logs runtime-bounded), store it, discover an ILP Petri
/// net, and return the assembled `Dataset`.
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

    // Cap traces for runtime bounding on large logs (e.g. bpi2020 ~87K events).
    if log.traces.len() > max_traces {
        log.traces.truncate(max_traces);
    }
    let events = log.traces.iter().map(|t| t.events.len()).sum::<usize>() as u64;

    let log_handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("bench: store EventLog failed");
    let pn_handle = make_petri_net_handle(&log_handle);

    Dataset {
        label,
        log_handle,
        pn_handle,
        events,
    }
}

/// Real conformance datasets, ordered small → large. Trace caps keep each log's
/// per-iteration cost bounded while still exercising real process structure.
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
            // Cap large travel-permit log so a measured iteration stays bounded.
            2_000,
        ),
    ]
}

/// Store a `PetriNet` handle from ILP discovery output (or minimal fallback).
fn make_petri_net_handle(log_handle: &str) -> String {
    if let Ok(js_val) = discover_ilp_petri_net(log_handle, ACTIVITY_KEY) {
        // On native targets, to_js wraps JSON in JsValue::from_str → as_string() works.
        if let Some(json_str) = js_val.as_string() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(h) = val["handle"].as_str() {
                    return h.to_string();
                }
            }
        }
    }
    // Fallback: store a minimal empty PetriNet so the bench still measures replay.
    get_or_init_state()
        .store_object(StoredObject::PetriNet(PetriNet::new()))
        .expect("bench: store PetriNet failed")
}

fn bench_token_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("conformance/token_replay");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(20);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &(&ds.log_handle, &ds.pn_handle),
            |b, (lh, pnh)| {
                b.iter(|| {
                    black_box(
                        check_token_based_replay(
                            black_box(lh),
                            black_box(pnh),
                            black_box(ACTIVITY_KEY),
                        )
                        .unwrap(),
                    )
                })
            },
        );
    }
    group.finish();
}

fn bench_discover_and_replay(c: &mut Criterion) {
    // End-to-end: DFG discovery + conformance check in one measurement.
    let mut group = c.benchmark_group("conformance/discover_and_replay");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(15);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &(&ds.log_handle, &ds.pn_handle),
            |b, (lh, pnh)| {
                b.iter(|| {
                    let dfg = discover_dfg(black_box(lh), black_box(ACTIVITY_KEY)).unwrap();
                    let replay = check_token_based_replay(
                        black_box(lh),
                        black_box(pnh),
                        black_box(ACTIVITY_KEY),
                    )
                    .unwrap();
                    black_box((dfg, replay))
                })
            },
        );
    }
    group.finish();
}

criterion_group!(
    conformance_benches,
    bench_token_replay,
    bench_discover_and_replay
);
criterion_main!(conformance_benches);
