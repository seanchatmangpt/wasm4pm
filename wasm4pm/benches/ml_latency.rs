//! Latency benchmarks for Nanosecond ML Algorithm Families.
//!
//! Measures execution time for:
//! 1. Regression (Least Squares)
//! 2. Forecasting (Exponential Smoothing)
//! 3. Classification (k-NN)
//! 4. PCA (Eigenvalue Decomposition)

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::ml_algorithms::*;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::state::{get_or_init_state, StoredObject};

fn setup_mock_log(num_traces: usize, events_per_trace: usize) -> String {
    let mut log = EventLog {
        attributes: std::collections::BTreeMap::new(),
        traces: Vec::with_capacity(num_traces),
    };

    for i in 0..num_traces {
        let mut trace = Trace::new();
        for j in 0..events_per_trace {
            let mut event = Event::new();
            // Real timestamps for regression/forecasting
            let ts = format!(
                "2024-01-01T10:{:02}:{:02}Z",
                (i * events_per_trace + j) / 60,
                (i * events_per_trace + j) % 60
            );
            event
                .attributes
                .insert("time:timestamp".to_string(), AttributeValue::Date(ts));
            event.attributes.insert(
                "concept:name".to_string(),
                AttributeValue::String(format!("Act{}", j % 5)),
            );
            trace.events.push(event);
        }
        log.traces.push(trace);
    }

    get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .unwrap()
}

/// Representative log sizes (trace count) the ML families are exercised over.
/// Each trace carries 10 events, so total events = traces * 10.
const TRACE_SIZES: &[usize] = &[10, 100, 500];
const EVENTS_PER_TRACE: usize = 10;

fn bench_ml_regression(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/regression");
    for &traces in TRACE_SIZES {
        let handle = setup_mock_log(traces, EVENTS_PER_TRACE);
        group.throughput(Throughput::Elements((traces * EVENTS_PER_TRACE) as u64));
        group.bench_with_input(BenchmarkId::from_parameter(traces), &handle, |b, h| {
            b.iter(|| black_box(discover_ml_regress(black_box(h), black_box("concept:name"))))
        });
    }
    group.finish();
}

fn bench_ml_forecasting(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/forecasting");
    for &traces in TRACE_SIZES {
        let handle = setup_mock_log(traces, EVENTS_PER_TRACE);
        group.throughput(Throughput::Elements((traces * EVENTS_PER_TRACE) as u64));
        group.bench_with_input(BenchmarkId::from_parameter(traces), &handle, |b, h| {
            b.iter(|| {
                black_box(discover_ml_forecast(
                    black_box(h),
                    black_box("concept:name"),
                ))
            })
        });
    }
    group.finish();
}

fn bench_ml_classification(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/classification");
    for &traces in TRACE_SIZES {
        let handle = setup_mock_log(traces, EVENTS_PER_TRACE);
        group.throughput(Throughput::Elements((traces * EVENTS_PER_TRACE) as u64));
        group.bench_with_input(BenchmarkId::from_parameter(traces), &handle, |b, h| {
            b.iter(|| {
                black_box(discover_ml_classify(
                    black_box(h),
                    black_box("concept:name"),
                ))
            })
        });
    }
    group.finish();
}

fn bench_ml_pca(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/pca");
    for &traces in TRACE_SIZES {
        let handle = setup_mock_log(traces, EVENTS_PER_TRACE);
        group.throughput(Throughput::Elements((traces * EVENTS_PER_TRACE) as u64));
        group.bench_with_input(BenchmarkId::from_parameter(traces), &handle, |b, h| {
            b.iter(|| black_box(discover_ml_pca(black_box(h), black_box("concept:name"))))
        });
    }
    group.finish();
}

fn bench_ml_automl(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/automl");
    for &traces in TRACE_SIZES {
        let handle = setup_mock_log(traces, EVENTS_PER_TRACE);
        group.throughput(Throughput::Elements((traces * EVENTS_PER_TRACE) as u64));
        group.bench_with_input(BenchmarkId::new("forecast", traces), &handle, |b, h| {
            b.iter(|| {
                black_box(discover_automl_forecast(
                    black_box(h),
                    black_box("concept:name"),
                ))
            })
        });
        group.bench_with_input(BenchmarkId::new("classify", traces), &handle, |b, h| {
            b.iter(|| {
                black_box(discover_automl_classify(
                    black_box(h),
                    black_box("concept:name"),
                ))
            })
        });
    }
    group.finish();
}

criterion_group!(
    name = benches;
    config = Criterion::default()
        .warm_up_time(Duration::from_secs(1))
        .measurement_time(Duration::from_secs(3))
        .sample_size(200);
    targets =
        bench_ml_regression,
        bench_ml_forecasting,
        bench_ml_classification,
        bench_ml_pca,
        bench_ml_automl
);

criterion_main!(benches);
