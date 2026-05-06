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
/// All groups use 4 standard input sizes from `bench_sizes()` and report
/// `Throughput::Elements(events)` so criterion reports events/second.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use rustc_hash::FxHashMap;
use std::collections::HashMap;
use std::time::Duration;
use wasm4pm::discovery::discover_dfg;
use wasm4pm::models::{
    AttributeValue, ColumnarLog, DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation,
    Event, EventLog, Trace,
};
use wasm4pm::simd_streaming_dfg::SimdStreamingDfg;
use wasm4pm::streaming::{StreamingAlgorithm, StreamingDfgBuilder};

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, generate_event_log, make_handle, ACTIVITY_KEY};

// ---------------------------------------------------------------------------
// Internal helpers (mirror the test file patterns exactly)
// ---------------------------------------------------------------------------

/// Build a DFG using `StreamingDfgBuilder` (scalar streaming path).
fn streaming_dfg_from_log(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
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
fn simd_dfg_from_log(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
    let col = log.to_columnar_owned(activity_key);
    let vocab_refs: Vec<&str> = col.vocab.iter().map(|s| s.as_str()).collect();
    let mut builder = SimdStreamingDfg::new();
    builder.add_events(&col.events, &col.trace_offsets);
    builder.finish(&vocab_refs)
}

/// Compute a batch DFG directly from an EventLog using the columnar approach
/// (mirrors `batch_dfg_from_log` in streaming_batch_equivalence_tests.rs).
/// This is the pure-Rust path — no JsValue overhead.
fn batch_dfg_from_log(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut dfg = DirectlyFollowsGraph::new();

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

    dfg.edges
        .extend(edge_counts.into_iter().map(|((f, t), freq)| {
            DirectlyFollowsRelation {
                from: col.vocab[f as usize].to_owned(),
                to: col.vocab[t as usize].to_owned(),
                frequency: freq,
            }
        }));

    dfg
}

/// Build an order-independent edge map `(from, to) -> frequency` from a DFG.
fn edges_to_map(dfg: &DirectlyFollowsGraph) -> HashMap<(String, String), usize> {
    dfg.edges
        .iter()
        .map(|e| ((e.from.clone(), e.to.clone()), e.frequency))
        .collect()
}

// ---------------------------------------------------------------------------
// Group 1: Batch DFG (discover_dfg via handle, wasm_bindgen path)
// ---------------------------------------------------------------------------

fn bench_dfg_batch(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming_vs_batch/dfg_batch");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| b.iter(|| discover_dfg(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 2: Scalar streaming DFG (StreamingDfgBuilder)
// ---------------------------------------------------------------------------

fn bench_dfg_streaming(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming_vs_batch/dfg_streaming");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for shape in bench_sizes() {
        let log = generate_event_log(&shape);
        let events = log.event_count();
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &log,
            |b, l| b.iter(|| streaming_dfg_from_log(l, ACTIVITY_KEY)),
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 3: SIMD streaming DFG (SimdStreamingDfg)
// ---------------------------------------------------------------------------

fn bench_dfg_simd(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming_vs_batch/dfg_simd");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for shape in bench_sizes() {
        let log = generate_event_log(&shape);
        let events = log.event_count();
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &log,
            |b, l| b.iter(|| simd_dfg_from_log(l, ACTIVITY_KEY)),
        );
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
//
// All paths use the pure-Rust internal types (no JsValue), mirroring how
// the streaming_batch_equivalence_tests.rs oracle is implemented.
// ---------------------------------------------------------------------------

fn bench_parity_check(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming_vs_batch/parity_check");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for shape in bench_sizes() {
        let log = generate_event_log(&shape);
        let events = log.event_count();
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &log,
            |b, l| {
                b.iter(|| {
                    let batch = batch_dfg_from_log(l, ACTIVITY_KEY);
                    let streaming = streaming_dfg_from_log(l, ACTIVITY_KEY);
                    let batch_map = edges_to_map(&batch);
                    let streaming_map = edges_to_map(&streaming);
                    // Perform the comparison (this is what the oracle does)
                    let _equal = batch_map.len() == streaming_map.len();
                    batch_map.len() + streaming_map.len()
                })
            },
        );
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
