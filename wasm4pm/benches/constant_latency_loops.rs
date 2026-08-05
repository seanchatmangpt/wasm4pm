//! Benchmark constant-latency loop refactoring
//! Measures cycle predictability via perf counters.
//!
//! Grounded on a real event log (`bench_data/sepsis.xes`) for the DFG and
//! token-replay paths so the measured work matches production input shapes,
//! not just synthetic activity ids. Synthetic logs are retained only for the
//! size-parameterized throughput sweep.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::BTreeMap;
use std::path::Path;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

fn make_log(num_traces: usize, events_per_trace: usize) -> EventLog {
    let traces: Vec<Trace> = (0..num_traces)
        .map(|_| Trace {
            attributes: BTreeMap::new(),
            events: (0..events_per_trace)
                .map(|i| {
                    let mut attrs = BTreeMap::new();
                    let activity = format!("activity_{}", i % 10);
                    attrs.insert("concept:name".to_string(), AttributeValue::String(activity));
                    Event { attributes: attrs }
                })
                .collect(),
        })
        .collect();
    EventLog {
        attributes: BTreeMap::new(),
        traces,
    }
}

/// Load a real event log from `bench_data/`. Returns `None` if the file is
/// absent so the synthetic benches still run in CI without the fixture.
fn load_real_log() -> Option<EventLog> {
    // Bench cwd is the crate dir (wasm4pm/); fixture lives at repo-root/bench_data.
    let candidates = [
        "../bench_data/sepsis.xes",
        "bench_data/sepsis.xes",
        "../data/Sepsis Cases - Event Log.xes",
    ];
    for c in candidates {
        if Path::new(c).exists() {
            if let Ok(content) = std::fs::read_to_string(c) {
                if let Ok(log) = wasm4pm::xes_format::validate_and_parse_xes(&content) {
                    return Some(log);
                }
            }
        }
    }
    None
}

fn total_events(log: &EventLog) -> u64 {
    log.traces.iter().map(|t| t.events.len() as u64).sum()
}

fn bench_fnv1a_hashing(c: &mut Criterion) {
    let mut group = c.benchmark_group("fnv1a_hash");
    for size in [1024usize, 10_240, 102_400] {
        let content = "x".repeat(size);
        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(BenchmarkId::from_parameter(size), &content, |b, content| {
            b.iter(|| black_box(wasm4pm::cache::hash_xes_content(black_box(content))))
        });
    }
    group.finish();
}

fn bench_parallel_executor(c: &mut Criterion) {
    let mut group = c.benchmark_group("dfg_parallel");

    // Size-parameterized throughput sweep over synthetic logs.
    for &(traces, events) in &[(256usize, 32usize), (1024, 64)] {
        let log = make_log(traces, events);
        group.throughput(Throughput::Elements(total_events(&log)));
        group.bench_with_input(
            BenchmarkId::new("synthetic", format!("{traces}x{events}")),
            &log,
            |b, log| {
                b.iter(|| {
                    let col_owned = log.to_columnar_owned(black_box("concept:name"));
                    let col = wasm4pm::models::ColumnarLog::from_owned(&col_owned);
                    black_box(wasm4pm::parallel_executor::compute_dfg_parallel(&col))
                })
            },
        );
    }

    // Real-log DFG: production input shape (sepsis.xes).
    if let Some(log) = load_real_log() {
        group.throughput(Throughput::Elements(total_events(&log)));
        group.bench_with_input(BenchmarkId::new("real", "sepsis"), &log, |b, log| {
            b.iter(|| {
                let col_owned = log.to_columnar_owned(black_box("concept:name"));
                let col = wasm4pm::models::ColumnarLog::from_owned(&col_owned);
                black_box(wasm4pm::parallel_executor::compute_dfg_parallel(&col))
            })
        });
    }

    group.finish();
}

fn bench_token_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("token_replay");

    let synthetic = make_log(100, 16);
    group.throughput(Throughput::Elements(total_events(&synthetic)));
    group.bench_with_input(
        BenchmarkId::new("synthetic", "100x16"),
        &synthetic,
        |b, log| {
            b.iter(|| {
                let col_owned = log.to_columnar_owned(black_box("concept:name"));
                let col = wasm4pm::models::ColumnarLog::from_owned(&col_owned);
                let dfg = wasm4pm::parallel_executor::compute_dfg_parallel(&col);
                black_box(wasm4pm::simd_token_replay::SimdPetriNet::from_dfg(&dfg))
            })
        },
    );

    if let Some(log) = load_real_log() {
        group.throughput(Throughput::Elements(total_events(&log)));
        group.bench_with_input(BenchmarkId::new("real", "sepsis"), &log, |b, log| {
            b.iter(|| {
                let col_owned = log.to_columnar_owned(black_box("concept:name"));
                let col = wasm4pm::models::ColumnarLog::from_owned(&col_owned);
                let dfg = wasm4pm::parallel_executor::compute_dfg_parallel(&col);
                black_box(wasm4pm::simd_token_replay::SimdPetriNet::from_dfg(&dfg))
            })
        });
    }

    group.finish();
}

criterion_group! {
    name = benches;
    config = Criterion::default().sample_size(50);
    targets = bench_fnv1a_hashing, bench_parallel_executor, bench_token_replay
}
criterion_main!(benches);
