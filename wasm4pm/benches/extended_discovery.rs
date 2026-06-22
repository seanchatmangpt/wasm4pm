//! Criterion benchmarks for extended discovery algorithms.
//!
//! Covers performance DFG, social networks (handover / working-together),
//! correlation mining, causal graphs (alpha / heuristic), process trees,
//! hierarchical DFG, temporal profiles, and batch discovery.
//!
//! Grounded on REAL, publicly sourced XES datasets (see `bench_data/README.md`)
//! — synthetic generation is prohibited, so `helpers::make_handle` is NOT used.
//! Each measured input and returned result is wrapped in `black_box` so the
//! optimizer cannot elide the work, and every group uses `Throughput::Elements`
//! over the real event count to report per-event scaling.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::batches::discover_batches_wasm;
use wasm4pm::causal_graph::{discover_causal_alpha, discover_causal_heuristic};
use wasm4pm::correlation_miner::discover_correlation;
use wasm4pm::hierarchical::discover_dfg_hierarchical;
use wasm4pm::models::EventLog;
use wasm4pm::performance_dfg::discover_performance_dfg;
use wasm4pm::process_tree::discover_simple_process_tree;
use wasm4pm::social_network::{discover_handover_network, discover_working_together_network};
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::temporal_profile::discover_temporal_profile;
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;
use helpers::{ACTIVITY_KEY, TIMESTAMP_KEY};

const RESOURCE_KEY: &str = "org:resource";

/// A real, stored event log ready for discovery benchmarking.
struct Dataset {
    label: &'static str,
    /// State handle for the stored `EventLog`.
    handle: String,
    /// Total events (after any trace cap) — used for `Throughput::Elements`.
    events: u64,
}

/// Load the first existing candidate path, parse it, optionally cap the number of
/// traces (to keep large logs runtime-bounded), store it, and return the dataset.
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

    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("bench: store EventLog failed");

    Dataset {
        label,
        handle,
        events,
    }
}

/// Real discovery datasets, ordered small → large. Trace caps keep per-iteration
/// cost bounded while still exercising real process structure (concurrency,
/// loops, resource handovers). All three carry `concept:name`, `time:timestamp`,
/// and `org:resource` attributes.
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
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(group);
    } else {
        helpers::full_group(group);
    }
}

fn bench_correlation_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/correlation");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        for threshold in [0.3_f64, 0.5, 0.7] {
            group.bench_with_input(
                BenchmarkId::new(ds.label, threshold),
                &(&ds.handle, threshold),
                |b, (h, t)| {
                    b.iter(|| {
                        black_box(
                            discover_correlation(
                                black_box(h),
                                black_box(ACTIVITY_KEY),
                                black_box(TIMESTAMP_KEY),
                                black_box(*t),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }
    group.finish();
}

fn bench_performance_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/performance_dfg");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_performance_dfg(
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

fn bench_handover_network(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/handover_network");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(discover_handover_network(black_box(h), black_box(RESOURCE_KEY)).unwrap())
            })
        });
    }
    group.finish();
}

fn bench_working_together_network(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/working_together");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_working_together_network(black_box(h), black_box(RESOURCE_KEY))
                        .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_temporal_profile(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/temporal_profile");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_temporal_profile(
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

fn bench_causal_alpha(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/causal_alpha");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(discover_causal_alpha(black_box(h), black_box(ACTIVITY_KEY)).unwrap())
            })
        });
    }
    group.finish();
}

fn bench_causal_heuristic(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/causal_heuristic");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        for threshold in [0.5_f64, 0.7, 0.9] {
            group.bench_with_input(
                BenchmarkId::new(ds.label, threshold),
                &(&ds.handle, threshold),
                |b, (h, t)| {
                    b.iter(|| {
                        black_box(
                            discover_causal_heuristic(
                                black_box(h),
                                black_box(ACTIVITY_KEY),
                                black_box(*t),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }
    group.finish();
}

fn bench_process_tree(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/process_tree");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_simple_process_tree(black_box(h), black_box(ACTIVITY_KEY)).unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_hierarchical_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/hierarchical_dfg");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        for chunk_size in [100_usize, 500, 1000] {
            group.bench_with_input(
                BenchmarkId::new(ds.label, chunk_size),
                &(&ds.handle, chunk_size),
                |b, (h, cs)| {
                    b.iter(|| {
                        black_box(
                            discover_dfg_hierarchical(
                                black_box(h),
                                black_box(ACTIVITY_KEY),
                                black_box(*cs),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }
    group.finish();
}

fn bench_batches(c: &mut Criterion) {
    let mut group = c.benchmark_group("extended/batches");
    configure(&mut group);
    for ds in real_datasets() {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_batches_wasm(
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
