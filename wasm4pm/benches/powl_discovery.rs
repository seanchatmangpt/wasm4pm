/// Criterion benchmarks for POWL (Process-Oriented Workflow Language) discovery.
/// POWL is a hierarchical process model language with soundness guarantees.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::models::EventLog;
use pictl::powl_api::discover_powl_from_log;
use serde_json::json;
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, generate_event_log, ACTIVITY_KEY};

/// Helper to serialize an EventLog to JSON for POWL discovery.
fn log_to_json(log: &EventLog) -> String {
    serde_json::to_string(log).expect("failed to serialize EventLog")
}

fn bench_powl_from_log(c: &mut Criterion) {
    let mut group = c.benchmark_group("powl/from_log");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(20);

    for shape in bench_sizes() {
        let log = generate_event_log(&shape);
        let log_json = log_to_json(&log);
        let total_events = log.event_count();

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &log_json,
            |b, json| b.iter(|| discover_powl_from_log(json, "inductive").unwrap()),
        );
    }
    group.finish();
}

/// Benchmark POWL discovery with different algorithm variants.
fn bench_powl_variants(c: &mut Criterion) {
    let mut group = c.benchmark_group("powl/variants");
    group.measurement_time(Duration::from_secs(20));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(15);

    let fixed_shape = helpers::LogShape {
        num_cases: 1000,
        avg_events_per_case: 15,
        num_activities: 12,
        noise_factor: 0.1,
    };
    let log = generate_event_log(&fixed_shape);
    let log_json = log_to_json(&log);

    for variant in ["inductive", "alpha", "heuristic"] {
        group.bench_with_input(
            BenchmarkId::new("variant", variant),
            &log_json,
            |b, json| b.iter(|| discover_powl_from_log(json, variant).unwrap()),
        );
    }
    group.finish();
}

/// Benchmark POWL discovery with varying noise levels.
fn bench_powl_noise(c: &mut Criterion) {
    let mut group = c.benchmark_group("powl/noise");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(20);

    let num_cases = 1000;
    let avg_events_per_case = 15;
    let num_activities = 12;

    for noise_factor in [0.0_f64, 0.05, 0.1, 0.2, 0.3] {
        let shape = helpers::LogShape {
            num_cases,
            avg_events_per_case,
            num_activities,
            noise_factor,
        };
        let log = generate_event_log(&shape);
        let log_json = log_to_json(&log);

        group.bench_with_input(
            BenchmarkId::new("noise", (noise_factor * 100.0) as u32),
            &log_json,
            |b, json| b.iter(|| discover_powl_from_log(json, "inductive").unwrap()),
        );
    }
    group.finish();
}

/// Benchmark POWL discovery with varying vocabulary sizes.
fn bench_powl_vocabulary_size(c: &mut Criterion) {
    let mut group = c.benchmark_group("powl/vocab_size");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(20);

    let num_cases = 1000;
    let avg_events_per_case = 15;

    for num_activities in [5_usize, 10, 15, 20, 30] {
        let shape = helpers::LogShape {
            num_cases,
            avg_events_per_case,
            num_activities,
            noise_factor: 0.1,
        };
        let log = generate_event_log(&shape);
        let log_json = log_to_json(&log);

        group.bench_with_input(
            BenchmarkId::new("activities", num_activities),
            &log_json,
            |b, json| b.iter(|| discover_powl_from_log(json, "inductive").unwrap()),
        );
    }
    group.finish();
}

criterion_group!(
    powl_benches,
    bench_powl_from_log,
    bench_powl_variants,
    bench_powl_noise,
    bench_powl_vocabulary_size,
);
criterion_main!(powl_benches);
