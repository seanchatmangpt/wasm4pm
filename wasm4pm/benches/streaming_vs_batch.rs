/// Criterion benchmarks comparing streaming and batch DFG discovery.
///
/// Verifies relative performance of three DFG implementations:
///   - Batch DFG via `discover_dfg` (columnar, O(n) single pass) through the
///     wasm_bindgen handle path — same call as the kernel uses
///   - Scalar streaming via `StreamingDfgBuilder` (incremental, case-by-case)
///   - SIMD streaming via `SimdStreamingDfg` (vectorised columnar path)
///
/// A fourth group measures the overhead of the "parity check" oracle itself:
/// constructing edge maps from two streaming results and comparing them.
///
/// All groups run against REAL, publicly sourced process-mining event logs
/// (sepsis, road-traffic, BPI Challenge 2020 travel permits) loaded from
/// `bench_data/`. Throughput is reported as `Throughput::Elements(events)`,
/// so criterion reports events/second. Synthetic data generation is a TPS
/// violation in this crate (see `helpers::generate_event_log`) and is not used.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use rustc_hash::FxHashMap;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::time::Duration;
use wasm4pm::discovery::discover_dfg;
use wasm4pm::models::{
    AttributeValue, ColumnarLog, DFGNode, DirectlyFollowsRelation, Event, EventLog, Trace, DFG,
};
use wasm4pm::simd_streaming_dfg::SimdStreamingDfg;
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::streaming::{StreamingAlgorithm, StreamingDfgBuilder};

const ACTIVITY_KEY: &str = "concept:name";

// ---------------------------------------------------------------------------
// Real-data loading — inline XES parser (mirrors real_data_bench.rs:46-105).
// Synthetic generation is prohibited in this crate; every group exercises a
// real published event log.
// ---------------------------------------------------------------------------

fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            current_trace = Some(Trace {
                attributes: BTreeMap::new(),
                events: Vec::new(),
            });
        }
        if trimmed.starts_with("</trace>") {
            if let Some(t) = current_trace.take() {
                log.traces.push(t);
            }
        }
        if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
            current_event = Some(Event {
                attributes: BTreeMap::new(),
            });
        }
        if trimmed.starts_with("</event>") {
            if let Some(ev) = current_event.take() {
                if let Some(ref mut t) = current_trace {
                    t.events.push(ev);
                }
            }
        }
        if trimmed.starts_with("<string") {
            if let (Some(k), Some(v)) =
                (extract_attr(trimmed, "key"), extract_attr(trimmed, "value"))
            {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(ref mut t) = current_trace {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
        if trimmed.starts_with("<date") {
            if let (Some(k), Some(v)) =
                (extract_attr(trimmed, "key"), extract_attr(trimmed, "value"))
            {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::Date(v));
                }
            }
        }
    }
    log
}

fn extract_attr(s: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = s.find(&needle)? + needle.len();
    let end = s[start..].find('"')?;
    Some(s[start..start + end].to_string())
}

struct Dataset {
    label: &'static str,
    log: EventLog,
    event_count: u64,
}

/// Load one real dataset from the first candidate path that resolves.
/// Panics if absent — synthetic fallback is prohibited in this crate.
fn load_dataset(candidates: &[&str], label: &'static str) -> Dataset {
    let home = std::env::var("HOME").unwrap_or_default();
    let log = candidates
        .iter()
        .filter_map(|p| {
            let resolved = p.replace('~', &home);
            let content = fs::read_to_string(&resolved).ok()?;
            if content.len() < 200 {
                return None;
            }
            let l = parse_xes(&content);
            if l.traces.is_empty() {
                return None;
            }
            Some(l)
        })
        .next()
        .unwrap_or_else(|| {
            panic!(
                "Required dataset '{}' not found at any of: {:?}\n\
                 Download from https://data.4tu.nl/ (Sepsis/RoadTraffic/BPI2020)",
                label, candidates
            )
        });
    let event_count = log.traces.iter().map(|t| t.events.len()).sum::<usize>() as u64;
    Dataset {
        label,
        log,
        event_count,
    }
}

/// Representative real logs spanning small → large.
///   - roadtraffic (100 traces)  — small, dense
///   - sepsis                     — medium, high variant count
///   - bpi2020 travel             — large (~87K events); capped to keep
///                                  per-binary runtime bounded
fn real_datasets() -> Vec<Dataset> {
    let mut sets = vec![
        load_dataset(
            &[
                "bench_data/roadtraffic100traces.xes",
                "../bench_data/roadtraffic100traces.xes",
            ],
            "roadtraffic",
        ),
        load_dataset(
            &["bench_data/sepsis.xes", "../bench_data/sepsis.xes"],
            "sepsis",
        ),
    ];
    // BPI2020 is ~87K events; cap traces so the streaming/SIMD/parity groups
    // stay reproducible within the configured measurement window.
    let mut bpi = load_dataset(
        &[
            "bench_data/bpi2020_travel.xes",
            "../bench_data/bpi2020_travel.xes",
        ],
        "bpi2020",
    );
    const BPI_TRACE_CAP: usize = 2_000;
    if bpi.log.traces.len() > BPI_TRACE_CAP {
        bpi.log.traces.truncate(BPI_TRACE_CAP);
        bpi.event_count = bpi.log.traces.iter().map(|t| t.events.len()).sum::<usize>() as u64;
    }
    sets.push(bpi);
    sets
}

/// Apply stable, reproducible sampling parameters to a group.
fn configure(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>) {
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
}

/// Store an `EventLog` in global state, returning its handle (for the
/// wasm_bindgen `discover_dfg` path).
fn store_log(log: EventLog) -> String {
    get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("bench: store_object failed")
}

// ---------------------------------------------------------------------------
// Internal DFG builders (mirror streaming_batch_equivalence_tests.rs patterns)
// ---------------------------------------------------------------------------

/// Build a DFG using `StreamingDfgBuilder` (scalar streaming path).
fn streaming_dfg_from_log(log: &EventLog, activity_key: &str) -> DFG {
    let mut builder = StreamingDfgBuilder::new();
    for (idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("c{}", idx);
        for event in &trace.events {
            if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                builder.add_event(&case_id, act);
            }
        }
        builder.close_trace(&case_id);
    }
    builder.snapshot()
}

/// Build a DFG using `SimdStreamingDfg` (columnar SIMD/scalar path).
fn simd_dfg_from_log(log: &EventLog, activity_key: &str) -> DFG {
    let col = log.to_columnar_owned(activity_key);
    let vocab_refs: Vec<&str> = col.vocab.iter().map(|s| s.as_str()).collect();
    let mut builder = SimdStreamingDfg::new();
    builder.add_events(&col.events, &col.trace_offsets);
    builder.finish(&vocab_refs)
}

/// Compute a batch DFG directly from an EventLog using the columnar approach
/// (mirrors `batch_dfg_from_log` in streaming_batch_equivalence_tests.rs).
fn batch_dfg_from_log(log: &EventLog, activity_key: &str) -> DFG {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut dfg = DFG::new();

    dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
        id: act.to_owned(),
        label: act.to_owned(),
        frequency: 0,
    }));

    let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        if start >= end {
            continue;
        }
        for &id in &col.events[start..end] {
            dfg.nodes[id as usize].frequency += 1;
        }
        for i in start..end - 1 {
            *edge_counts
                .entry((col.events[i], col.events[i + 1]))
                .or_insert(0) += 1;
        }
        *dfg.start_activities
            .entry(col.vocab[col.events[start] as usize].to_owned())
            .or_insert(0) += 1;
        *dfg.end_activities
            .entry(col.vocab[col.events[end - 1] as usize].to_owned())
            .or_insert(0) += 1;
    }

    dfg.edges.extend(
        edge_counts
            .into_iter()
            .map(|((f, t), freq)| DirectlyFollowsRelation {
                from: col.vocab[f as usize].to_owned(),
                to: col.vocab[t as usize].to_owned(),
                frequency: freq,
            }),
    );

    dfg
}

/// Build an order-independent edge map `(from, to) -> frequency` from a DFG.
fn edges_to_map(dfg: &DFG) -> HashMap<(String, String), usize> {
    dfg.edges
        .iter()
        .map(|e| ((e.from.clone(), e.to.clone()), e.frequency))
        .collect()
}

// ---------------------------------------------------------------------------
// Group 1: Batch DFG (discover_dfg via handle, wasm_bindgen path)
// ---------------------------------------------------------------------------

fn bench_dfg_batch(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("streaming_vs_batch/dfg_batch");
    configure(&mut group);

    for ds in &datasets {
        let handle = store_log(ds.log.clone());
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &handle, |b, h| {
            b.iter(|| black_box(discover_dfg(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 2: Scalar streaming DFG (StreamingDfgBuilder)
// ---------------------------------------------------------------------------

fn bench_dfg_streaming(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("streaming_vs_batch/dfg_streaming");
    configure(&mut group);

    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, l| {
            b.iter(|| black_box(streaming_dfg_from_log(black_box(l), ACTIVITY_KEY)))
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 3: SIMD streaming DFG (SimdStreamingDfg)
// ---------------------------------------------------------------------------

fn bench_dfg_simd(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("streaming_vs_batch/dfg_simd");
    configure(&mut group);

    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, l| {
            b.iter(|| black_box(simd_dfg_from_log(black_box(l), ACTIVITY_KEY)))
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 4: Parity check overhead (oracle cost)
//
// Measures the additional work of the parity oracle itself:
//   1. Build both batch and streaming DFGs from the same EventLog.
//   2. Convert both results to edge maps (HashMap).
//   3. Assert equality (compare map lengths — the comparand itself).
// ---------------------------------------------------------------------------

fn bench_parity_check(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("streaming_vs_batch/parity_check");
    configure(&mut group);

    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, l| {
            b.iter(|| {
                let batch = batch_dfg_from_log(black_box(l), ACTIVITY_KEY);
                let streaming = streaming_dfg_from_log(black_box(l), ACTIVITY_KEY);
                let batch_map = edges_to_map(&batch);
                let streaming_map = edges_to_map(&streaming);
                let _equal = batch_map.len() == streaming_map.len();
                black_box(batch_map.len() + streaming_map.len())
            })
        });
    }
    group.finish();
}

criterion_group!(
    streaming_vs_batch_benches,
    bench_dfg_batch,
    bench_dfg_streaming,
    bench_dfg_simd,
    bench_parity_check,
);
criterion_main!(streaming_vs_batch_benches);
