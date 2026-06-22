//! Performance profiling for AutoML optimization loops.
//!
//! Target: Vision 2030 Nanosecond Architecture efficiency.
//! Validation: 100-trace sweep must complete in < 100 microseconds.

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::ml_algorithms::*;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::xes_format::validate_and_parse_xes;

/// Load a real XES log from bench_data/ and store it, returning the state
/// handle plus the trace count. Returns None if the file is unavailable so the
/// real-data benches are skipped cleanly rather than fabricating input.
fn setup_real_log(path: &str, max_traces: usize) -> Option<(String, usize)> {
    let content = std::fs::read_to_string(path).ok()?;
    let mut log = validate_and_parse_xes(&content).ok()?;
    // Cap traces so the timed sweep stays bounded on large real logs.
    if log.traces.len() > max_traces {
        log.traces.truncate(max_traces);
    }
    let count = log.traces.len();
    if count < 10 {
        return None; // automl requires >= 10 traces for 5-fold CV
    }
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .unwrap();
    Some((handle, count))
}

fn setup_mock_log(num_traces: usize, events_per_trace: usize) -> String {
    let mut log = EventLog {
        attributes: std::collections::HashMap::new(),
        traces: Vec::with_capacity(num_traces),
    };

    for i in 0..num_traces {
        let mut trace = Trace::new();
        for j in 0..events_per_trace {
            let mut event = Event::new();
            // Real timestamps for forecasting
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

    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .unwrap();
    handle
}

fn bench_automl_forecast(c: &mut Criterion) {
    let mut group = c.benchmark_group("automl/forecast");

    for &size in &[10, 100, 1000] {
        let handle = setup_mock_log(size, 10);
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(format!("synthetic_{}_traces", size), &handle, |b, h| {
            b.iter(|| {
                black_box(discover_automl_forecast(
                    black_box(h),
                    black_box("concept:name"),
                ))
            })
        });
    }

    // Ground on a real process-mining log (sepsis: ~1050 patient traces).
    if let Some((handle, count)) = setup_real_log("bench_data/sepsis.xes", 1000) {
        group.throughput(Throughput::Elements(count as u64));
        group.bench_with_input(format!("sepsis_real_{}_traces", count), &handle, |b, h| {
            b.iter(|| {
                black_box(discover_automl_forecast(
                    black_box(h),
                    black_box("concept:name"),
                ))
            })
        });
    }

    group.finish();
}

fn bench_automl_classify(c: &mut Criterion) {
    let mut group = c.benchmark_group("automl/classify");

    for &size in &[10, 100, 1000] {
        let handle = setup_mock_log(size, 10);
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(format!("synthetic_{}_traces", size), &handle, |b, h| {
            b.iter(|| {
                black_box(discover_automl_classify(
                    black_box(h),
                    black_box("concept:name"),
                ))
            })
        });
    }

    // Ground on a real process-mining log (sepsis: ~1050 patient traces).
    if let Some((handle, count)) = setup_real_log("bench_data/sepsis.xes", 1000) {
        group.throughput(Throughput::Elements(count as u64));
        group.bench_with_input(format!("sepsis_real_{}_traces", count), &handle, |b, h| {
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
        .sample_size(100);
    targets =
        bench_automl_forecast,
        bench_automl_classify
);

criterion_main!(benches);
