//! Criterion benchmarks for slow metaheuristic discovery algorithms (>200ms/call):
//! the genetic miner, particle-swarm miner, and ILP miner.
//!
//! Grounded on REAL, publicly sourced XES datasets from `bench_data/` (see
//! `bench_data/README.md`) — synthetic data generation is prohibited, so
//! `helpers::make_handle` is deliberately NOT used here. Traces are capped per
//! dataset to keep each measured iteration of these expensive miners bounded.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::genetic_discovery::{discover_genetic_algorithm, discover_pso_algorithm};
use wasm4pm::ilp_discovery::discover_ilp_petri_net;
use wasm4pm::models::EventLog;
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;
use helpers::ACTIVITY_KEY;

/// A real, stored event log ready for discovery benchmarking.
struct Dataset {
    label: &'static str,
    /// State handle for the stored `EventLog`.
    handle: String,
    /// Total events (after any trace cap) — used for Throughput.
    events: u64,
}

/// Load the first existing candidate path, parse it, cap traces (these miners are
/// O(>200ms), so caps stay small), store it, and return the assembled `Dataset`.
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

    // Cap traces to keep these >200ms-per-call miners runtime-bounded.
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

/// Real discovery datasets, ordered small → large. Trace caps keep each log's
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
            500,
        ),
        load_dataset(
            "bpi2020",
            &[
                "bench_data/bpi2020_travel.xes",
                "../../bench_data/bpi2020_travel.xes",
            ],
            // Aggressive cap — these metaheuristics scale poorly with case count.
            500,
        ),
    ]
}

fn bench_genetic_algorithm(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/genetic_algorithm");
    group.measurement_time(Duration::from_secs(60));
    group.warm_up_time(Duration::from_secs(5));
    group.sample_size(10);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let datasets = real_datasets();

    // Parameter sweep: (population, generations) on the smallest real log.
    let fixed = &datasets[0];
    for (pop, gen) in [(10_usize, 5_usize), (20, 10), (50, 20)] {
        group.bench_with_input(
            BenchmarkId::new(format!("{}/pop{}_gen{}", fixed.label, pop, gen), pop * gen),
            &fixed.handle,
            |b, h| {
                b.iter(|| {
                    black_box(
                        discover_genetic_algorithm(
                            black_box(h),
                            black_box(ACTIVITY_KEY),
                            black_box(pop),
                            black_box(gen),
                        )
                        .unwrap(),
                    )
                })
            },
        );
    }

    // Size sweep at minimal parameters across all real datasets.
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(
            BenchmarkId::new("p10_g5", ds.label),
            &ds.handle,
            |b, h| {
                b.iter(|| {
                    black_box(
                        discover_genetic_algorithm(
                            black_box(h),
                            black_box(ACTIVITY_KEY),
                            black_box(10),
                            black_box(5),
                        )
                        .unwrap(),
                    )
                })
            },
        );
    }
    group.finish();
}

fn bench_pso(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/pso");
    group.measurement_time(Duration::from_secs(60));
    group.warm_up_time(Duration::from_secs(5));
    group.sample_size(10);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let datasets = real_datasets();

    // Parameter sweep on the smallest real log.
    let fixed = &datasets[0];
    for (swarm, iters) in [(10_usize, 10_usize), (20, 15), (30, 20)] {
        group.bench_with_input(
            BenchmarkId::new(
                format!("{}/swarm{}_iter{}", fixed.label, swarm, iters),
                swarm * iters,
            ),
            &fixed.handle,
            |b, h| {
                b.iter(|| {
                    black_box(
                        discover_pso_algorithm(
                            black_box(h),
                            black_box(ACTIVITY_KEY),
                            black_box(swarm),
                            black_box(iters),
                        )
                        .unwrap(),
                    )
                })
            },
        );
    }

    // Size sweep at minimal parameters across all real datasets.
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(
            BenchmarkId::new("s10_i10", ds.label),
            &ds.handle,
            |b, h| {
                b.iter(|| {
                    black_box(
                        discover_pso_algorithm(
                            black_box(h),
                            black_box(ACTIVITY_KEY),
                            black_box(10),
                            black_box(10),
                        )
                        .unwrap(),
                    )
                })
            },
        );
    }
    group.finish();
}

fn bench_ilp(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/ilp");
    group.measurement_time(Duration::from_secs(30));
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
            BenchmarkId::new("cases", ds.label),
            &ds.handle,
            |b, h| {
                b.iter(|| {
                    black_box(
                        discover_ilp_petri_net(black_box(h), black_box(ACTIVITY_KEY)).unwrap(),
                    )
                })
            },
        );
    }
    group.finish();
}

criterion_group!(slow_benches, bench_genetic_algorithm, bench_pso, bench_ilp);
criterion_main!(slow_benches);
