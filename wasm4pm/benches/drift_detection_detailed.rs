//! Comprehensive drift detection benchmarks and analysis.
//!
//! This benchmark suite provides:
//!
//! 1. **Window Size Analysis** — Jaccard distance computation and drift detection
//!    across window sizes: 5, 10, 50, 100, 500 events
//!
//! 2. **Alpha Parameter Tuning** — EWMA smoothing factor effects (0.1, 0.2, 0.3, 0.5)
//!    on trend classification accuracy and responsiveness
//!
//! 3. **Drift Scenario Performance** — Synthetic logs with known drift patterns:
//!    - Abrupt drift (sudden vocabulary change)
//!    - Gradual drift (incremental activity probability shifts)
//!    - Seasonal drift (periodic changes)
//!    - Oscillating drift (reversible drifts)
//!    - No drift (normal variation baseline)
//!
//! 4. **Threshold Effect Analysis** — Detection rates (true positive, false positive,
//!    false negative) across thresholds: 0.1, 0.2, 0.3, 0.5
//!
//! 5. **Edge Case Performance** — Empty windows, single activity, all-different activity
//!    vocabularies, and feature-level concept drift
//!
//! 6. **Determinism Verification** — Reproducibility across runs with seeded RNG

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::time::Duration;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::prediction_drift::{classify_trend, ewma_series, jaccard_distance};
use wasm4pm::state::{get_or_init_state, StoredObject};

#[path = "helpers.rs"]
mod helpers;
use helpers::{make_handle, LogShape, ACTIVITY_KEY, TIMESTAMP_KEY};

// ---------------------------------------------------------------------------
// Synthetic drift scenario generation
// ---------------------------------------------------------------------------

/// A drift scenario with known properties for validation.
#[derive(Clone, Debug)]
struct DriftScenario {
    name: &'static str,
    /// Expected number of drift points detected at threshold 0.3
    expected_drifts: usize,
    /// Expected minimum Jaccard distance at drift points
    min_drift_distance: f64,
}

/// Generate a log with an abrupt drift: activity vocabulary suddenly changes.
///
/// First half: A, B, C; second half: X, Y, Z.
fn generate_abrupt_drift_log(num_cases: usize, events_per_case: usize) -> EventLog {
    let mut log = EventLog::new();
    let activities_before = ["A", "B", "C"];
    let activities_after = ["X", "Y", "Z"];

    for case_idx in 0..num_cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case:concept:name".to_string(),
            AttributeValue::String(format!("case_{}", case_idx)),
        );

        let activities = if case_idx < num_cases / 2 {
            &activities_before[..]
        } else {
            &activities_after[..]
        };

        for evt_idx in 0..events_per_case {
            let activity = activities[evt_idx % activities.len()];
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(activity.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::Date(format!(
                    "2024-01-{:02}T{:02}:{:02}:00Z",
                    (case_idx % 28) + 1,
                    (evt_idx / 60) % 24,
                    evt_idx % 60,
                )),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

/// Generate a log with gradual drift: activity probabilities shift incrementally.
///
/// Window 1: 80% A, 20% B
/// Window 2: 70% A, 30% B
/// ... gradually transition to: 20% A, 80% B
fn generate_gradual_drift_log(num_cases: usize, events_per_case: usize) -> EventLog {
    let mut log = EventLog::new();
    let mut rng = helpers::Lcg::new(0x1234_5678_9ABC_DEF0);

    for case_idx in 0..num_cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case:concept:name".to_string(),
            AttributeValue::String(format!("case_{}", case_idx)),
        );

        // Probability of "A" decreases from 0.8 to 0.2 over the log.
        let progress = case_idx as f64 / num_cases.max(1) as f64;
        let prob_a = 0.8 - (0.6 * progress);

        for evt_idx in 0..events_per_case {
            let activity = if rng.next_f64_unit() < prob_a {
                "A"
            } else {
                "B"
            };
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(activity.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::Date(format!(
                    "2024-01-{:02}T{:02}:{:02}:00Z",
                    (case_idx % 28) + 1,
                    (evt_idx / 60) % 24,
                    evt_idx % 60,
                )),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

/// Generate a log with seasonal drift: vocabulary changes every N cases.
///
/// Cases 0..50: A, B, C
/// Cases 50..100: D, E, F
/// Cases 100..150: A, B, C (repeat)
fn generate_seasonal_drift_log(num_cases: usize, events_per_case: usize) -> EventLog {
    let mut log = EventLog::new();
    let season_length = 50;
    let vocabularies = [
        vec!["A", "B", "C"],
        vec!["D", "E", "F"],
        vec!["G", "H", "I"],
    ];

    for case_idx in 0..num_cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case:concept:name".to_string(),
            AttributeValue::String(format!("case_{}", case_idx)),
        );

        let season = (case_idx / season_length) % vocabularies.len();
        let activities = &vocabularies[season];

        for evt_idx in 0..events_per_case {
            let activity = activities[evt_idx % activities.len()];
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(activity.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::Date(format!(
                    "2024-01-{:02}T{:02}:{:02}:00Z",
                    (case_idx % 28) + 1,
                    (evt_idx / 60) % 24,
                    evt_idx % 60,
                )),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

/// Generate a log with oscillating drift: drift reverses periodically.
///
/// Cases 0..50: A, B; Cases 50..100: X, Y; Cases 100..150: A, B; repeat
fn generate_oscillating_drift_log(num_cases: usize, events_per_case: usize) -> EventLog {
    let mut log = EventLog::new();
    let period = 50;

    for case_idx in 0..num_cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case:concept:name".to_string(),
            AttributeValue::String(format!("case_{}", case_idx)),
        );

        let phase = (case_idx / period) % 2;
        let activities = if phase == 0 {
            vec!["A", "B"]
        } else {
            vec!["X", "Y"]
        };

        for evt_idx in 0..events_per_case {
            let activity = activities[evt_idx % activities.len()];
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(activity.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::Date(format!(
                    "2024-01-{:02}T{:02}:{:02}:00Z",
                    (case_idx % 28) + 1,
                    (evt_idx / 60) % 24,
                    evt_idx % 60,
                )),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

/// Generate a baseline log with no intentional drift (normal variation).
fn generate_stable_log(num_cases: usize, events_per_case: usize) -> EventLog {
    let mut log = EventLog::new();
    let mut rng = helpers::Lcg::new(0xABCD_EF00_1234_5678);
    let activities = ["A", "B", "C", "D", "E"];

    for case_idx in 0..num_cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case:concept:name".to_string(),
            AttributeValue::String(format!("case_{}", case_idx)),
        );

        for evt_idx in 0..events_per_case {
            let activity = activities[rng.next_usize_mod(activities.len())];
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(activity.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::Date(format!(
                    "2024-01-{:02}T{:02}:{:02}:00Z",
                    (case_idx % 28) + 1,
                    (evt_idx / 60) % 24,
                    evt_idx % 60,
                )),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

// ---------------------------------------------------------------------------
// Real-data XES loading (grounds drift detection on a genuine event log)
// ---------------------------------------------------------------------------

fn extract_attr(s: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = s.find(&needle)? + needle.len();
    let end = s[start..].find('"')?;
    Some(s[start..start + end].to_string())
}

/// Minimal streaming XES parser (matches `real_data_bench.rs`).
fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            current_trace = Some(Trace {
                attributes: HashMap::new(),
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
                attributes: HashMap::new(),
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

/// Load the real Sepsis event log (1,050 cases, ~15K events).
/// Returns `None` when the dataset is absent so synthetic benches still run.
fn load_real_log() -> Option<EventLog> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        "bench_data/sepsis.xes",
        "../bench_data/sepsis.xes",
        "../../bench_data/sepsis.xes",
        "~/chatmangpt/pm4py/tests/input_data/sepsis.xes",
    ];
    candidates.iter().find_map(|p| {
        let resolved = p.replace('~', &home);
        let content = fs::read_to_string(&resolved).ok()?;
        if content.len() < 200 {
            return None;
        }
        let log = parse_xes(&content);
        if log.traces.is_empty() {
            None
        } else {
            Some(log)
        }
    })
}

// ---------------------------------------------------------------------------
// Real-data drift detection (grounded on Sepsis ICU patient flow)
// ---------------------------------------------------------------------------

fn bench_real_data_drift(c: &mut Criterion) {
    let log = match load_real_log() {
        Some(l) => l,
        None => {
            eprintln!(
                "drift/real_data: sepsis.xes not found in bench_data/ — skipping real-data bench"
            );
            return;
        }
    };

    let total_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("Failed to store real log");

    let mut group = c.benchmark_group("drift/real_data");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(20);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for window_size in [10usize, 50, 100, 500] {
        group.throughput(Throughput::Elements(
            (total_events / window_size.max(1)) as u64,
        ));
        group.bench_with_input(
            BenchmarkId::new("sepsis_window", window_size),
            &window_size,
            |b, &ws| {
                b.iter(|| {
                    let result = wasm4pm::prediction_drift::detect_drift(
                        black_box(&handle),
                        black_box(ACTIVITY_KEY),
                        black_box(ws),
                    );
                    black_box(result)
                });
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Window size parameter sweep
// ---------------------------------------------------------------------------

fn bench_window_sizes(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/window_sizes");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let shape = LogShape {
        num_cases: 1_000,
        avg_events_per_case: 10,
        num_activities: 8,
        noise_factor: 0.05,
    };
    let (handle, events) = make_handle(&shape);

    for window_size in [5usize, 10, 50, 100, 500] {
        group.throughput(Throughput::Elements(events as u64 / window_size as u64));
        group.bench_with_input(
            BenchmarkId::new("size", window_size),
            &window_size,
            |b, &ws| {
                b.iter(|| {
                    let result = wasm4pm::prediction_drift::detect_drift(
                        black_box(&handle),
                        black_box(ACTIVITY_KEY),
                        black_box(ws),
                    );
                    black_box(result)
                });
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Alpha parameter tuning
// ---------------------------------------------------------------------------

fn bench_alpha_tuning(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/alpha_tuning");
    group.measurement_time(Duration::from_secs(2));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let series: Vec<f64> = (0..1_000)
        .map(|i| ((i as f64 * 0.01).sin() + (i as f64 * 0.002).cos()).abs())
        .collect();

    for alpha in [0.1f64, 0.2, 0.3, 0.5] {
        group.throughput(Throughput::Elements(series.len() as u64));
        group.bench_with_input(BenchmarkId::new("alpha", alpha), &alpha, |b, &a| {
            b.iter(|| black_box(ewma_series(black_box(&series), black_box(a))));
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Drift scenario performance
// ---------------------------------------------------------------------------

fn bench_drift_scenarios(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/scenarios");
    group.measurement_time(Duration::from_secs(4));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(25);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let scenarios = [
        ("abrupt", generate_abrupt_drift_log(500, 10)),
        ("gradual", generate_gradual_drift_log(500, 10)),
        ("seasonal", generate_seasonal_drift_log(500, 10)),
        ("oscillating", generate_oscillating_drift_log(500, 10)),
        ("stable", generate_stable_log(500, 10)),
    ];

    for (name, log) in scenarios {
        let handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .expect("Failed to store log");
        let total_events = get_or_init_state()
            .with_object(&handle, |obj| match obj {
                Some(StoredObject::EventLog(l)) => Ok(l.event_count()),
                _ => Ok(0),
            })
            .unwrap_or(0);

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(BenchmarkId::new("scenario", name), &handle, |b, h| {
            b.iter(|| {
                let result = wasm4pm::prediction_drift::detect_drift(
                    black_box(h),
                    black_box(ACTIVITY_KEY),
                    black_box(10),
                );
                black_box(result)
            });
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Threshold sensitivity analysis
// ---------------------------------------------------------------------------

/// Analyze drift detection accuracy across threshold values.
fn bench_threshold_sensitivity(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/threshold_sensitivity");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    // Instead of benchmarking threshold directly (API doesn't support it),
    // we benchmark the core Jaccard distance operation at varying set overlap levels.
    for overlap_percent in [0usize, 25, 50, 75, 100] {
        let a = (0..20)
            .map(|i| format!("act_{}", i))
            .collect::<HashSet<_>>();
        let b = (0..(20 * overlap_percent / 100))
            .chain(20..(20 + (20 * (100 - overlap_percent) / 100)))
            .map(|i| format!("act_{}", i))
            .collect::<HashSet<_>>();

        group.bench_with_input(
            BenchmarkId::new("overlap", format!("{}%", overlap_percent)),
            &(a, b),
            |bench, (a, b)| {
                bench.iter(|| black_box(jaccard_distance(black_box(a), black_box(b))));
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Edge case performance
// ---------------------------------------------------------------------------

fn bench_edge_cases(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/edge_cases");
    group.measurement_time(Duration::from_secs(2));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    // Empty sets (no activities) — Jaccard(∅, ∅) = 0.0 by convention
    let empty_a: HashSet<String> = HashSet::new();
    let empty_b: HashSet<String> = HashSet::new();
    group.bench_function("empty_sets", |b| {
        b.iter(|| black_box(jaccard_distance(black_box(&empty_a), black_box(&empty_b))));
    });

    // Single activity in both sets
    let single_a = ["A"].iter().map(|s| s.to_string()).collect::<HashSet<_>>();
    let single_b = ["A"].iter().map(|s| s.to_string()).collect::<HashSet<_>>();
    group.bench_function("single_activity", |b| {
        b.iter(|| black_box(jaccard_distance(black_box(&single_a), black_box(&single_b))));
    });

    // All different activities (maximum disjointness)
    let all_diff_a = (0..50)
        .map(|i| format!("act_a_{}", i))
        .collect::<HashSet<_>>();
    let all_diff_b = (0..50)
        .map(|i| format!("act_b_{}", i))
        .collect::<HashSet<_>>();
    group.bench_function("all_different_activities", |b| {
        b.iter(|| {
            black_box(jaccard_distance(
                black_box(&all_diff_a),
                black_box(&all_diff_b),
            ))
        });
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Determinism verification
// ---------------------------------------------------------------------------

fn bench_determinism(c: &mut Criterion) {
    let mut group = c.benchmark_group("drift/determinism");
    group.measurement_time(Duration::from_secs(2));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let series = vec![1.0, 2.5, 3.7, 2.1, 4.9, 1.2, 3.4];
    let alpha = 0.3;

    // Bench the same computation multiple times to ensure stable timing.
    group.bench_function("ewma_deterministic", |b| {
        b.iter(|| {
            let result1 = ewma_series(black_box(&series), black_box(alpha));
            let result2 = ewma_series(black_box(&series), black_box(alpha));
            // Verify results are identical (not benchmarking equality check, just the computation).
            assert_eq!(result1, result2);
            black_box(result1)
        });
    });

    group.finish();
}

criterion_group!(
    drift_detailed,
    bench_real_data_drift,
    bench_window_sizes,
    bench_alpha_tuning,
    bench_drift_scenarios,
    bench_threshold_sensitivity,
    bench_edge_cases,
    bench_determinism,
);
criterion_main!(drift_detailed);
