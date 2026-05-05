//! Latency benchmarks for Nanosecond ML Algorithm Families.
//!
//! Measures execution time for:
//! 1. Regression (Least Squares)
//! 2. Forecasting (Exponential Smoothing)
//! 3. Classification (k-NN)
//! 4. PCA (Eigenvalue Decomposition)

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::time::Duration;
use wasm4pm::models::{EventLog, Trace, Event, AttributeValue};
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::ml_algorithms::*;

fn setup_mock_log(num_traces: usize, events_per_trace: usize) -> String {
    let mut log = EventLog {
        attributes: std::collections::HashMap::new(),
        traces: Vec::with_capacity(num_traces),
    };

    let start_time = "2024-01-01T10:00:00Z";

    for i in 0..num_traces {
        let mut trace = Trace::new();
        for j in 0..events_per_trace {
            let mut event = Event::new();
            // Real timestamps for regression/forecasting
            let ts = format!("2024-01-01T10:{:02}:{:02}Z", (i * events_per_trace + j) / 60, (i * events_per_trace + j) % 60);
            event.attributes.insert("time:timestamp".to_string(), AttributeValue::Date(ts));
            event.attributes.insert("concept:name".to_string(), AttributeValue::String(format!("Act{}", j % 5)));
            trace.events.push(event);
        }
        log.traces.push(trace);
    }

    let handle = get_or_init_state().store_object(StoredObject::EventLog(log)).unwrap();
    handle
}

fn bench_ml_regression(c: &mut Criterion) {
    let handle = setup_mock_log(100, 10);
    let mut group = c.benchmark_group("ml/regression");
    
    group.bench_function("discover_ml_regress_100_traces", |b| {
        b.iter(|| discover_ml_regress(black_box(&handle), black_box("concept:name")))
    });
    group.finish();
}

fn bench_ml_forecasting(c: &mut Criterion) {
    let handle = setup_mock_log(100, 10);
    let mut group = c.benchmark_group("ml/forecasting");
    
    group.bench_function("discover_ml_forecast_100_traces", |b| {
        b.iter(|| discover_ml_forecast(black_box(&handle), black_box("concept:name")))
    });
    group.finish();
}

fn bench_ml_classification(c: &mut Criterion) {
    let handle = setup_mock_log(100, 10);
    let mut group = c.benchmark_group("ml/classification");
    
    group.bench_function("discover_ml_classify_100_traces", |b| {
        b.iter(|| discover_ml_classify(black_box(&handle), black_box("concept:name")))
    });
    group.finish();
}

fn bench_ml_pca(c: &mut Criterion) {
    let handle = setup_mock_log(100, 10);
    let mut group = c.benchmark_group("ml/pca");
    
    group.bench_function("discover_ml_pca_100_traces", |b| {
        b.iter(|| discover_ml_pca(black_box(&handle), black_box("concept:name")))
    });
    group.finish();
}

fn bench_ml_automl(c: &mut Criterion) {
    let handle = setup_mock_log(100, 10);
    let mut group = c.benchmark_group("ml/automl");
    
    group.bench_function("discover_automl_forecast_100_traces", |b| {
        b.iter(|| discover_automl_forecast(black_box(&handle), black_box("concept:name")))
    });
    group.bench_function("discover_automl_classify_100_traces", |b| {
        b.iter(|| discover_automl_classify(black_box(&handle), black_box("concept:name")))
    });
    group.finish();
}

criterion_group!(
    name = benches;
    config = Criterion::default()
        .warm_up_time(Duration::from_secs(1))
        .measurement_time(Duration::from_secs(3))
        .sample_size(1000);
    targets =
        bench_ml_regression,
        bench_ml_forecasting,
        bench_ml_classification,
        bench_ml_pca,
        bench_ml_automl
);

criterion_main!(benches);
