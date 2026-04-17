//! Benchmark constant-latency loop refactoring
//! Measures cycle predictability via perf counters.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pictl::models::{AttributeValue, Event, EventLog, Trace};
use std::collections::HashMap;

fn make_log(num_traces: usize, events_per_trace: usize) -> EventLog {
    let traces: Vec<Trace> = (0..num_traces)
        .map(|_| Trace {
            attributes: HashMap::new(),
            events: (0..events_per_trace)
                .map(|i| {
                    let mut attrs = HashMap::new();
                    let activity = format!("activity_{}", i % 10);
                    attrs.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(activity),
                    );
                    Event { attributes: attrs }
                })
                .collect(),
        })
        .collect();
    EventLog {
        attributes: HashMap::new(),
        traces,
    }
}

fn bench_fnv1a_hashing(c: &mut Criterion) {
    c.bench_function("fnv1a_hash_1kb", |b| {
        let content = "x".repeat(1024);
        b.iter(|| pictl::cache::hash_xes_content(black_box(&content)))
    });

    c.bench_function("fnv1a_hash_10kb", |b| {
        let content = "x".repeat(10240);
        b.iter(|| pictl::cache::hash_xes_content(black_box(&content)))
    });

    c.bench_function("fnv1a_hash_100kb", |b| {
        let content = "x".repeat(102400);
        b.iter(|| pictl::cache::hash_xes_content(black_box(&content)))
    });
}

fn bench_parallel_executor(c: &mut Criterion) {
    c.bench_function("dfg_256_traces_32_events", |b| {
        let log = make_log(256, 32);
        b.iter(|| {
            let col_owned = log.to_columnar_owned("concept:name");
            let col = pictl::models::ColumnarLog::from_owned(&col_owned);
            pictl::parallel_executor::compute_dfg_parallel(&col)
        })
    });

    c.bench_function("dfg_1024_traces_64_events", |b| {
        let log = make_log(1024, 64);
        b.iter(|| {
            let col_owned = log.to_columnar_owned("concept:name");
            let col = pictl::models::ColumnarLog::from_owned(&col_owned);
            pictl::parallel_executor::compute_dfg_parallel(&col)
        })
    });
}

fn bench_token_replay(c: &mut Criterion) {
    c.bench_function("conformance_small_log", |b| {
        let log = make_log(100, 16);
        b.iter(|| {
            let col_owned = log.to_columnar_owned("concept:name");
            let col = pictl::models::ColumnarLog::from_owned(&col_owned);
            let dfg = pictl::parallel_executor::compute_dfg_parallel(&col);
            pictl::simd_token_replay::SimdPetriNet::from_dfg(&dfg)
        })
    });
}

criterion_group!(
    benches,
    bench_fnv1a_hashing,
    bench_parallel_executor,
    bench_token_replay
);
criterion_main!(benches);
