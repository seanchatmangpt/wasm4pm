//! Prediction Task Latency Benchmarks
//!
//! Latency evaluation for the 6 prediction perspectives (next-activity,
//! remaining-time, outcome, drift, feature-importance, resource) plus an
//! end-to-end breakdown, batch throughput, and scaling sweeps.
//!
//! **Grounded on REAL data.** Synthetic event-log generation is a TPS
//! violation (`helpers::generate_event_log` panics by design), so every
//! benchmark trains and infers over real XES logs loaded from `bench_data/`
//! (sepsis required; bpi2020 / roadtraffic enrich the sweep when present).
//!
//! Every measured input and every returned result is wrapped in `black_box`
//! so the optimizer cannot elide the timed work, and size-parameterized
//! workloads use `Throughput` so results are comparable across datasets.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::HashMap;
use std::fs;

mod helpers;
use helpers::*;

use wasm4pm::models::EventLog;
use wasm4pm::xes_format::validate_and_parse_xes;

// ============================================================================
// REAL DATASET LOADING
// ============================================================================

/// A real event log paired with a human-readable label.
struct RealLog {
    label: &'static str,
    log: EventLog,
}

/// Load and parse the first existing candidate path with the crate's real XES
/// parser. Returns `None` when the dataset is absent (optional datasets) so
/// callers can skip without falling back to synthetic data.
fn load_real_log(label: &'static str, candidates: &[&str]) -> Option<RealLog> {
    for path in candidates {
        let content = match fs::read_to_string(path) {
            Ok(c) if c.len() > 200 => c,
            _ => continue,
        };
        match validate_and_parse_xes(&content) {
            Ok(log) if !log.traces.is_empty() => return Some(RealLog { label, log }),
            _ => continue,
        }
    }
    None
}

/// Required + optional real datasets. Sepsis is required (small, always shipped
/// in `bench_data/`); the others enrich the sweep when available.
fn real_logs() -> Vec<RealLog> {
    let mut sets = Vec::new();
    if let Some(ds) = load_real_log(
        "sepsis",
        &["bench_data/sepsis.xes", "../bench_data/sepsis.xes"],
    ) {
        sets.push(ds);
    }
    if !is_fast_mode() {
        if let Some(ds) = load_real_log(
            "bpi2020",
            &[
                "bench_data/bpi2020_travel.xes",
                "../bench_data/bpi2020_travel.xes",
            ],
        ) {
            sets.push(ds);
        }
        if let Some(ds) = load_real_log(
            "roadtraffic",
            &[
                "bench_data/roadtraffic100traces.xes",
                "../bench_data/roadtraffic100traces.xes",
            ],
        ) {
            sets.push(ds);
        }
    }
    assert!(
        !sets.is_empty(),
        "prediction_latency bench requires at least bench_data/sepsis.xes — no real dataset found"
    );
    sets
}

/// Extract the activity sequence (`concept:name`) for a trace.
fn trace_activities(trace: &wasm4pm::models::Trace) -> Vec<String> {
    trace
        .events
        .iter()
        .filter_map(|e| {
            e.attributes
                .get(ACTIVITY_KEY)
                .and_then(|v| v.as_string())
                .map(str::to_owned)
        })
        .collect()
}

/// Train a bigram next-activity model (prefix -> ranked predictions) over a log.
fn build_bigram_model(log: &EventLog) -> HashMap<Vec<String>, Vec<(String, f64)>> {
    let mut counts: HashMap<Vec<String>, HashMap<String, usize>> = HashMap::new();
    for trace in &log.traces {
        let acts = trace_activities(trace);
        for i in 0..acts.len().saturating_sub(1) {
            *counts
                .entry(vec![acts[i].clone()])
                .or_default()
                .entry(acts[i + 1].clone())
                .or_insert(0) += 1;
        }
    }
    let mut model: HashMap<Vec<String>, Vec<(String, f64)>> = HashMap::new();
    for (prefix, c) in &counts {
        let total: usize = c.values().sum();
        let mut preds: Vec<_> = c
            .iter()
            .map(|(act, n)| (act.clone(), *n as f64 / total as f64))
            .collect();
        preds.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        model.insert(prefix.clone(), preds);
    }
    model
}

// ============================================================================
// NEXT-ACTIVITY PREDICTION LATENCY
// ============================================================================

fn benchmark_next_activity_latency(c: &mut Criterion, ds: &RealLog) {
    let probabilities = build_bigram_model(&ds.log);
    let test_prefixes: Vec<Vec<String>> = probabilities.keys().take(100).cloned().collect();

    c.bench_with_input(
        BenchmarkId::new("prediction_next_activity/inference", ds.label),
        &test_prefixes,
        |b, prefixes| {
            b.iter(|| {
                let mut hits = 0usize;
                for prefix in black_box(prefixes) {
                    if let Some(preds) = probabilities.get(prefix) {
                        if preds.first().is_some() {
                            hits += 1;
                        }
                    }
                }
                black_box(hits)
            })
        },
    );
}

// ============================================================================
// REMAINING-TIME PREDICTION LATENCY
// ============================================================================

fn benchmark_remaining_time_latency(c: &mut Criterion, ds: &RealLog) {
    // Build model: per (activity, prefix-len) bucket mean remaining length.
    let mut bucket_times: HashMap<String, Vec<f64>> = HashMap::new();
    for trace in &ds.log.traces {
        let acts = trace_activities(trace);
        let n = acts.len();
        for (prefix_len, activity) in acts.iter().enumerate() {
            let key = format!("{}|{}", activity, prefix_len);
            bucket_times
                .entry(key)
                .or_default()
                .push((n - prefix_len) as f64);
        }
    }
    let mut bucket_means: HashMap<String, f64> = HashMap::new();
    for (key, times) in &bucket_times {
        if !times.is_empty() {
            bucket_means.insert(key.clone(), times.iter().sum::<f64>() / times.len() as f64);
        }
    }
    let test_keys: Vec<String> = bucket_means.keys().take(100).cloned().collect();

    c.bench_with_input(
        BenchmarkId::new("prediction_remaining_time/inference", ds.label),
        &test_keys,
        |b, keys| {
            b.iter(|| {
                let mut acc = 0.0f64;
                for key in black_box(keys) {
                    if let Some(&m) = bucket_means.get(key) {
                        acc += m;
                    }
                }
                black_box(acc)
            })
        },
    );
}

// ============================================================================
// OUTCOME PREDICTION LATENCY
// ============================================================================

fn benchmark_outcome_latency(c: &mut Criterion, ds: &RealLog) {
    let train_median_events = {
        let mut event_counts: Vec<usize> = ds.log.traces.iter().map(|t| t.events.len()).collect();
        event_counts.sort_unstable();
        event_counts[event_counts.len() / 2]
    };
    let test_traces: Vec<usize> = ds
        .log
        .traces
        .iter()
        .take(100)
        .map(|t| t.events.len())
        .collect();

    c.bench_with_input(
        BenchmarkId::new("prediction_outcome/inference", ds.label),
        &test_traces,
        |b, traces| {
            b.iter(|| {
                let mut positive = 0usize;
                for &event_count in black_box(traces) {
                    if event_count > train_median_events {
                        positive += 1;
                    }
                }
                black_box(positive)
            })
        },
    );
}

// ============================================================================
// DRIFT DETECTION LATENCY
// ============================================================================

fn benchmark_drift_latency(c: &mut Criterion, ds: &RealLog) {
    let mut activity_freq: HashMap<String, usize> = HashMap::new();
    for trace in &ds.log.traces {
        for act in trace_activities(trace) {
            *activity_freq.entry(act).or_insert(0) += 1;
        }
    }
    let test_activities: Vec<Vec<String>> = ds
        .log
        .traces
        .iter()
        .take(100)
        .map(trace_activities)
        .collect();

    c.bench_with_input(
        BenchmarkId::new("prediction_drift/inference", ds.label),
        &test_activities,
        |b, traces| {
            b.iter(|| {
                let mut drifted = 0usize;
                for trace in black_box(traces) {
                    let rare = trace
                        .iter()
                        .filter(|a| activity_freq.get(*a).map(|&f| f < 5).unwrap_or(true))
                        .count();
                    if rare > trace.len() / 2 {
                        drifted += 1;
                    }
                }
                black_box(drifted)
            })
        },
    );
}

// ============================================================================
// FEATURE IMPORTANCE LATENCY
// ============================================================================

fn benchmark_features_latency(c: &mut Criterion, ds: &RealLog) {
    let mut activities: Vec<String> = Vec::new();
    for trace in &ds.log.traces {
        activities.extend(trace_activities(trace));
    }

    c.bench_with_input(
        BenchmarkId::new("prediction_features/importance", ds.label),
        &activities,
        |b, acts| {
            b.iter(|| {
                let mut freq: HashMap<&str, usize> = HashMap::new();
                for act in black_box(acts) {
                    *freq.entry(act.as_str()).or_insert(0) += 1;
                }
                black_box(freq.len())
            })
        },
    );
}

// ============================================================================
// RESOURCE PREDICTION LATENCY
// ============================================================================

fn benchmark_resource_latency(c: &mut Criterion, ds: &RealLog) {
    let test_traces: Vec<usize> = ds
        .log
        .traces
        .iter()
        .take(100)
        .map(|t| t.events.len())
        .collect();
    let mean_trace_len: f64 =
        test_traces.iter().sum::<usize>() as f64 / test_traces.len().max(1) as f64;

    c.bench_with_input(
        BenchmarkId::new("prediction_resource/inference", ds.label),
        &test_traces,
        |b, traces| {
            b.iter(|| {
                let mut acc = 0.0f64;
                for &len in black_box(traces) {
                    acc += (len as f64 * 10.0) - (mean_trace_len * 10.0);
                }
                black_box(acc)
            })
        },
    );
}

// ============================================================================
// END-TO-END LATENCY BREAKDOWN
// ============================================================================

fn bench_end_to_end_breakdown(c: &mut Criterion) {
    let datasets = real_logs();
    let ds = &datasets[0];
    let log = &ds.log;

    let mut group = c.benchmark_group("prediction_e2e_breakdown");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    // Model building (training)
    group.bench_function(BenchmarkId::new("model_building", ds.label), |b| {
        b.iter(|| black_box(build_bigram_model(black_box(log))).len())
    });

    // Prefix extraction (from the first real trace)
    group.bench_function(BenchmarkId::new("prefix_extraction", ds.label), |b| {
        b.iter(|| black_box(trace_activities(black_box(&log.traces[0]))).len())
    });

    // Inference (lookup in trained model) — use a real prefix from the log.
    let model = build_bigram_model(log);
    let sample_prefix: Vec<String> = model
        .keys()
        .next()
        .cloned()
        .unwrap_or_else(|| vec!["__none__".to_string()]);
    group.bench_function(BenchmarkId::new("inference", ds.label), |b| {
        b.iter(|| black_box(model.get(black_box(&sample_prefix))).is_some())
    });

    // JSON serialization
    group.bench_function("json_serialization", |b| {
        b.iter(|| {
            use serde_json::json;
            let result = json!({
                "activities": ["A", "B", "C"],
                "probabilities": [0.5, 0.3, 0.2],
                "confidence": 0.5,
                "entropy": 0.95
            });
            black_box(serde_json::to_string(black_box(&result)).ok())
        })
    });

    group.finish();
}

// ============================================================================
// BATCH PROCESSING THROUGHPUT
// ============================================================================

fn bench_batch_throughput(c: &mut Criterion) {
    let datasets = real_logs();
    let ds = &datasets[0];
    let model = build_bigram_model(&ds.log);
    let sample_prefix: Vec<String> = model
        .keys()
        .next()
        .cloned()
        .unwrap_or_else(|| vec!["__none__".to_string()]);

    let mut group = c.benchmark_group("prediction_batch_throughput");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for &batch in &[1usize, 100, 1000] {
        let prefixes = vec![sample_prefix.clone(); batch];
        group.throughput(Throughput::Elements(batch as u64));
        group.bench_with_input(
            BenchmarkId::new("batch_predictions", batch),
            &prefixes,
            |b, prefixes| {
                b.iter(|| {
                    let mut hits = 0usize;
                    for prefix in black_box(prefixes) {
                        if model.get(prefix).and_then(|p| p.first()).is_some() {
                            hits += 1;
                        }
                    }
                    black_box(hits)
                })
            },
        );
    }

    group.finish();
}

// ============================================================================
// SCALING ANALYSIS — over real datasets of increasing size
// ============================================================================

fn bench_scaling_by_log_size(c: &mut Criterion) {
    let datasets = real_logs();

    let mut group = c.benchmark_group("prediction_scaling_log_size");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for ds in &datasets {
        let events = ds.log.event_count();
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("model_building", ds.label),
            &ds.log,
            |b, log| b.iter(|| black_box(build_bigram_model(black_box(log))).len()),
        );
    }

    group.finish();
}

// ============================================================================
// CRITERION GROUPS
// ============================================================================

fn benches_accuracy(c: &mut Criterion) {
    let datasets = real_logs();
    for ds in &datasets {
        benchmark_next_activity_latency(c, ds);
        benchmark_remaining_time_latency(c, ds);
        benchmark_outcome_latency(c, ds);
        benchmark_drift_latency(c, ds);
        benchmark_features_latency(c, ds);
        benchmark_resource_latency(c, ds);
    }
}

criterion_group!(
    benches,
    benches_accuracy,
    bench_end_to_end_breakdown,
    bench_batch_throughput,
    bench_scaling_by_log_size
);
criterion_main!(benches);
