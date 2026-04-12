//! Closed Claw Pipeline E: Manufacturing Truth Loop
//!
//! Multi-stage pipeline: Monte Carlo Simulation -> Temporal Profile -> Conformance -> Receipt
//!
//! The manufacturing truth loop verifies temporal consistency of process execution:
//!   1. Generate synthetic event log with timestamps
//!   2. Build temporal profile (mean/stdev per directly-follows pair)
//!   3. Check temporal conformance (zeta-threshold deviation detection)
//!   4. Run Monte Carlo simulation for performance estimation
//!   5. BLAKE3 receipt bundle proving temporal truth
//!
//! Gates exercised:
//!   G2 Receipt    -- hash chain: input -> profile -> conformance -> simulation
//!   G3 Truth     -- temporal deviations within zeta=2.0 threshold
//!   G5 Report    -- metrics: fitness, deviations, activity stats, utilization

use criterion::{black_box, BenchmarkId, Criterion, Throughput};
use pictl::models::*;
use pictl::montecarlo::{run_monte_carlo_simulation, MonteCarloConfig};
use std::collections::HashMap;
use std::time::Duration;

#[path = "../helpers.rs"]
mod helpers;
use helpers::{bench_sizes_slow, generate_event_log, ACTIVITY_KEY, TIMESTAMP_KEY};

// ---------------------------------------------------------------------------
// Temporal Profile (inline, mirrors temporal_profile.rs logic)
// ---------------------------------------------------------------------------

/// Build a temporal profile from an EventLog natively.
/// Returns a HashMap of (from, to) -> (mean_ms, stdev_ms, count).
fn build_temporal_profile(
    log: &EventLog,
    activity_key: &str,
    timestamp_key: &str,
) -> HashMap<(String, String), (f64, f64, usize)> {
    let mut acc: HashMap<(String, String), (f64, f64, usize)> = HashMap::new();

    for trace in &log.traces {
        let pairs: Vec<(String, Option<i64>)> = trace
            .events
            .iter()
            .filter_map(|e| {
                let act = e
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)?;
                let ts = e.attributes.get(timestamp_key).and_then(|v| {
                    if let AttributeValue::Date(s) = v {
                        parse_timestamp_ms(s)
                    } else {
                        None
                    }
                });
                Some((act, ts))
            })
            .collect();

        for i in 0..pairs.len().saturating_sub(1) {
            if let (Some(t1), Some(t2)) = (pairs[i].1, pairs[i + 1].1) {
                if t2 >= t1 {
                    let dur = (t2 - t1) as f64;
                    let key = (pairs[i].0.clone(), pairs[i + 1].0.clone());
                    let e = acc.entry(key).or_insert((0.0, 0.0, 0));
                    e.0 += dur;
                    e.1 += dur * dur;
                    e.2 += 1;
                }
            }
        }
    }

    let mut profile = HashMap::new();
    for ((a, b), (sum, sum_sq, cnt)) in acc {
        let mean = sum / cnt as f64;
        let variance = (sum_sq / cnt as f64) - mean * mean;
        let stdev = variance.max(0.0).sqrt();
        profile.insert((a, b), (mean, stdev, cnt));
    }

    profile
}

// ---------------------------------------------------------------------------
// Temporal Conformance Check (inline, mirrors temporal_profile.rs logic)
// ---------------------------------------------------------------------------

/// Check a log against a temporal profile. Returns (total_steps, deviations, fitness).
fn check_temporal_conformance_native(
    log: &EventLog,
    profile: &HashMap<(String, String), (f64, f64, usize)>,
    activity_key: &str,
    timestamp_key: &str,
    zeta: f64,
) -> (usize, usize, f64) {
    let mut total_steps = 0usize;
    let mut total_deviations = 0usize;

    for trace in &log.traces {
        let pairs: Vec<(String, Option<i64>)> = trace
            .events
            .iter()
            .filter_map(|e| {
                let act = e
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)?;
                let ts = e.attributes.get(timestamp_key).and_then(|v| {
                    if let AttributeValue::Date(s) = v {
                        parse_timestamp_ms(s)
                    } else {
                        None
                    }
                });
                Some((act, ts))
            })
            .collect();

        for i in 0..pairs.len().saturating_sub(1) {
            total_steps += 1;
            let key = (pairs[i].0.clone(), pairs[i + 1].0.clone());
            if let Some(&(mean, stdev, _)) = profile.get(&key) {
                if let (Some(t1), Some(t2)) = (pairs[i].1, pairs[i + 1].1) {
                    let dur = (t2 - t1).max(0) as f64;
                    let z = if stdev > 0.0 {
                        (dur - mean).abs() / stdev
                    } else {
                        0.0
                    };
                    if z > zeta {
                        total_deviations += 1;
                    }
                }
            }
        }
    }

    let fitness = if total_steps == 0 {
        1.0
    } else {
        1.0 - total_deviations as f64 / total_steps as f64
    };

    (total_steps, total_deviations, fitness)
}

// ---------------------------------------------------------------------------
// Benchmark: Temporal Profile Discovery
// ---------------------------------------------------------------------------

fn bench_temporal_profile_discovery(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/E_manufacturing/temporal_profile");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));

    for shape in bench_sizes_slow() {
        let log = generate_event_log(&shape);
        let total_events = log.event_count();

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &log,
            |b, log| {
                b.iter(|| {
                    let profile =
                        build_temporal_profile(black_box(log), ACTIVITY_KEY, TIMESTAMP_KEY);
                    black_box(profile)
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: Temporal Conformance Checking
// ---------------------------------------------------------------------------

fn bench_temporal_conformance_check(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/E_manufacturing/temporal_conformance");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));

    for shape in bench_sizes_slow() {
        let log = generate_event_log(&shape);
        let total_events = log.event_count();
        let profile = build_temporal_profile(&log, ACTIVITY_KEY, TIMESTAMP_KEY);

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &(&log, &profile),
            |b, (log, profile)| {
                b.iter(|| {
                    let (steps, deviations, fitness) = check_temporal_conformance_native(
                        black_box(log),
                        black_box(profile),
                        ACTIVITY_KEY,
                        TIMESTAMP_KEY,
                        2.0,
                    );
                    black_box((steps, deviations, fitness))
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: Monte Carlo Simulation
// ---------------------------------------------------------------------------

fn bench_monte_carlo(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/E_manufacturing/montecarlo");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));

    for shape in bench_sizes_slow() {
        let log = generate_event_log(&shape);
        let total_events = log.event_count();

        let config = MonteCarloConfig {
            num_cases: shape.num_cases,
            inter_arrival_mean_ms: 1000.0,
            activity_service_time_ms: HashMap::new(),
            resource_capacity: HashMap::new(),
            simulation_time_ms: 60000,
            random_seed: 42,
        };

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &(&log, &config),
            |b, (log, config)| {
                b.iter(|| {
                    let result = run_monte_carlo_simulation(black_box(log), black_box(config))
                        .expect("simulation failed");
                    black_box(result)
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: Manufacturing Truth Loop E2E
// ---------------------------------------------------------------------------

fn bench_manufacturing_truth_e2e(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/E_manufacturing/truth_loop_e2e");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(10);

    for shape in bench_sizes_slow() {
        let log = generate_event_log(&shape);
        let total_events = log.event_count();

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &shape,
            |b, shape| {
                b.iter(|| {
                    let log = generate_event_log(black_box(shape));
                    let input_json = serde_json::to_string(&log).unwrap_or_default();
                    let input_hash = blake3::hash(input_json.as_bytes());

                    let profile = build_temporal_profile(&log, ACTIVITY_KEY, TIMESTAMP_KEY);
                    let profile_json = serde_json::to_string(&profile).unwrap_or_default();
                    let plan_hash = blake3::hash(profile_json.as_bytes());

                    let (_steps, deviations, fitness) = check_temporal_conformance_native(
                        &log,
                        &profile,
                        ACTIVITY_KEY,
                        TIMESTAMP_KEY,
                        2.0,
                    );

                    let mc_config = MonteCarloConfig {
                        num_cases: shape.num_cases,
                        inter_arrival_mean_ms: 1000.0,
                        activity_service_time_ms: HashMap::new(),
                        resource_capacity: HashMap::new(),
                        simulation_time_ms: 60000,
                        random_seed: 42,
                    };
                    let mc_result =
                        run_monte_carlo_simulation(&log, &mc_config).expect("MC simulation failed");

                    let output_json = serde_json::to_string(&mc_result).unwrap_or_default();
                    let output_hash = blake3::hash(output_json.as_bytes());

                    black_box((
                        input_hash,
                        plan_hash,
                        output_hash,
                        deviations,
                        fitness,
                        mc_result.completed_cases,
                    ))
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Public entry point (called from mod.rs)
// ---------------------------------------------------------------------------

pub fn bench_manufacturing_truth(c: &mut Criterion) {
    bench_temporal_profile_discovery(c);
    bench_temporal_conformance_check(c);
    bench_monte_carlo(c);
    bench_manufacturing_truth_e2e(c);
}
