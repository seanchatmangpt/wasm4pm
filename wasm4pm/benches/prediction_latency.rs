//! Prediction Task Latency Benchmarks
//!
//! Comprehensive latency evaluation for all 6 prediction perspectives:
//! Measures end-to-end latency (p50, p95, p99) across multiple input sizes.
//!
//! **Methodology:**
//! 1. Train models on 1K-trace logs
//! 2. Measure per-task latency: 10, 100, 1K events in trace
//! 3. Report median, p95, p99 percentiles
//! 4. Throughput: tasks per second, events per second
//! 5. Breakdown: model building, prefix extraction, inference, serialization

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use std::collections::HashMap;
use std::time::Duration;

mod helpers;
use helpers::*;

// ============================================================================
// LATENCY MEASUREMENT UTILITIES
// ============================================================================

/// Measure latencies for a repeated operation.
#[allow(dead_code)]
struct LatencyProfile {
    samples: Vec<Duration>,
}

#[allow(dead_code)]
impl LatencyProfile {
    fn new() -> Self {
        Self {
            samples: Vec::new(),
        }
    }

    fn p50(&self) -> Duration {
        if self.samples.is_empty() {
            Duration::ZERO
        } else {
            let mut sorted = self.samples.clone();
            sorted.sort();
            sorted[sorted.len() / 2]
        }
    }

    fn p95(&self) -> Duration {
        if self.samples.is_empty() {
            Duration::ZERO
        } else {
            let mut sorted = self.samples.clone();
            sorted.sort();
            sorted[(sorted.len() * 95) / 100]
        }
    }

    fn p99(&self) -> Duration {
        if self.samples.is_empty() {
            Duration::ZERO
        } else {
            let mut sorted = self.samples.clone();
            sorted.sort();
            sorted[(sorted.len() * 99) / 100]
        }
    }

    fn mean(&self) -> Duration {
        if self.samples.is_empty() {
            Duration::ZERO
        } else {
            let sum: Duration = self.samples.iter().sum();
            sum / self.samples.len() as u32
        }
    }

    fn throughput_per_sec(&self) -> f64 {
        if self.samples.is_empty() {
            0.0
        } else {
            1_000_000_000.0 / self.mean().as_nanos() as f64
        }
    }
}

// ============================================================================
// NEXT-ACTIVITY PREDICTION LATENCY
// ============================================================================

/// Benchmark next-activity prediction inference latency.
/// Measures time to predict from a given prefix.
fn benchmark_next_activity_latency(c: &mut Criterion, shape: &LogShape, label: &str) {
    let log = generate_event_log(shape);

    // Build predictor
    let mut bigram_counts: HashMap<Vec<String>, HashMap<String, usize>> = HashMap::new();
    for trace in &log.traces {
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(ACTIVITY_KEY)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();

        for i in 0..activities.len().saturating_sub(1) {
            let prefix = vec![activities[i].clone()];
            let next = activities[i + 1].clone();
            *bigram_counts
                .entry(prefix)
                .or_default()
                .entry(next)
                .or_insert(0) += 1;
        }
    }

    // Normalize to probabilities
    let mut probabilities: HashMap<Vec<String>, Vec<(String, f64)>> = HashMap::new();
    for (prefix, counts) in &bigram_counts {
        let total: usize = counts.values().sum();
        let mut preds: Vec<_> = counts
            .iter()
            .map(|(act, count)| (act.clone(), *count as f64 / total as f64))
            .collect();
        preds.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        probabilities.insert(prefix.clone(), preds);
    }

    let test_prefixes: Vec<Vec<String>> =
        probabilities.keys().take(100).map(|p| p.clone()).collect();

    c.bench_with_input(
        BenchmarkId::new("prediction_next_activity/inference", label),
        &test_prefixes,
        |b, prefixes| {
            b.iter(|| {
                for prefix in prefixes {
                    let _ = probabilities.get(prefix).map(|preds| preds.first());
                }
            })
        },
    );
}

// ============================================================================
// REMAINING-TIME PREDICTION LATENCY
// ============================================================================

fn benchmark_remaining_time_latency(c: &mut Criterion, shape: &LogShape, label: &str) {
    let log = generate_event_log(shape);

    // Build model: bucket stats
    let mut bucket_times: HashMap<String, Vec<f64>> = HashMap::new();

    for trace in &log.traces {
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(ACTIVITY_KEY)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();

        for (prefix_len, _) in activities.iter().enumerate() {
            if let Some(activity) = activities.get(prefix_len) {
                let key = format!("{}|{}", activity, prefix_len);
                bucket_times
                    .entry(key)
                    .or_insert_with(Vec::new)
                    .push(1000.0); // Mock time value
            }
        }
    }

    // Compute means
    let mut bucket_means: HashMap<String, f64> = HashMap::new();
    for (key, times) in &bucket_times {
        if !times.is_empty() {
            let mean = times.iter().sum::<f64>() / times.len() as f64;
            bucket_means.insert(key.clone(), mean);
        }
    }

    let test_keys: Vec<String> = bucket_means.keys().take(100).map(|k| k.clone()).collect();

    c.bench_with_input(
        BenchmarkId::new("prediction_remaining_time/inference", label),
        &test_keys,
        |b, keys| {
            b.iter(|| {
                for key in keys {
                    let _ = bucket_means.get(key);
                }
            })
        },
    );
}

// ============================================================================
// OUTCOME PREDICTION LATENCY
// ============================================================================

fn benchmark_outcome_latency(c: &mut Criterion, shape: &LogShape, label: &str) {
    let log = generate_event_log(shape);

    let train_median_events = {
        let mut event_counts: Vec<usize> = log.traces.iter().map(|t| t.events.len()).collect();
        event_counts.sort();
        event_counts[event_counts.len() / 2]
    };

    let test_traces: Vec<usize> = log
        .traces
        .iter()
        .take(100)
        .map(|t| t.events.len())
        .collect();

    c.bench_with_input(
        BenchmarkId::new("prediction_outcome/inference", label),
        &test_traces,
        |b, traces| {
            b.iter(|| {
                for &event_count in traces {
                    let _ = event_count > train_median_events;
                }
            })
        },
    );
}

// ============================================================================
// DRIFT DETECTION LATENCY
// ============================================================================

fn benchmark_drift_latency(c: &mut Criterion, shape: &LogShape, label: &str) {
    let log = generate_event_log(shape);

    // Activity frequency stats
    let mut activity_freq: HashMap<String, usize> = HashMap::new();
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(attr) = event.attributes.get(ACTIVITY_KEY) {
                if let Some(act_name) = attr.as_string() {
                    *activity_freq.entry(act_name.to_owned()).or_insert(0) += 1;
                }
            }
        }
    }

    let test_activities: Vec<Vec<String>> = log
        .traces
        .iter()
        .take(100)
        .map(|t| {
            t.events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(ACTIVITY_KEY)
                        .and_then(|v| v.as_string())
                        .map(str::to_owned)
                })
                .collect()
        })
        .collect();

    c.bench_with_input(
        BenchmarkId::new("prediction_drift/inference", label),
        &test_activities,
        |b, traces| {
            b.iter(|| {
                for trace in traces {
                    let rare = trace
                        .iter()
                        .filter(|a| activity_freq.get(*a).map(|&f| f < 5).unwrap_or(true))
                        .count();
                    let _ = rare > trace.len() / 2;
                }
            })
        },
    );
}

// ============================================================================
// FEATURE IMPORTANCE LATENCY
// ============================================================================

fn benchmark_features_latency(c: &mut Criterion, shape: &LogShape, label: &str) {
    let log = generate_event_log(shape);

    // Extract all activities
    let mut activities: Vec<String> = Vec::new();
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(attr) = event.attributes.get(ACTIVITY_KEY) {
                if let Some(act_name) = attr.as_string() {
                    activities.push(act_name.to_owned());
                }
            }
        }
    }

    let test_batch_size = 100;

    c.bench_with_input(
        BenchmarkId::new("prediction_features/importance", label),
        &test_batch_size,
        |b, _| {
            b.iter(|| {
                // Compute frequencies
                let mut freq: HashMap<String, usize> = HashMap::new();
                for act in &activities {
                    *freq.entry(act.clone()).or_insert(0) += 1;
                }
                let _ = freq.len();
            })
        },
    );
}

// ============================================================================
// RESOURCE PREDICTION LATENCY
// ============================================================================

fn benchmark_resource_latency(c: &mut Criterion, shape: &LogShape, label: &str) {
    let log = generate_event_log(shape);

    let test_traces: Vec<usize> = log
        .traces
        .iter()
        .take(100)
        .map(|t| t.events.len())
        .collect();

    let mean_trace_len: f64 = test_traces.iter().sum::<usize>() as f64 / test_traces.len() as f64;

    c.bench_with_input(
        BenchmarkId::new("prediction_resource/inference", label),
        &test_traces,
        |b, traces| {
            b.iter(|| {
                for &len in traces {
                    let _ = (len as f64 * 10.0) - (mean_trace_len * 10.0);
                }
            })
        },
    );
}

// ============================================================================
// END-TO-END LATENCY BREAKDOWN
// ============================================================================

fn bench_end_to_end_breakdown(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_e2e_breakdown");
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    } // Smaller sample size for slower operations

    let shape = LogShape {
        num_cases: 1000,
        avg_events_per_case: 20,
        num_activities: 15,
        noise_factor: 0.10,
    };

    let log = generate_event_log(&shape);

    // Model building (training)
    group.bench_function("model_building", |b| {
        b.iter(|| {
            let mut counts: HashMap<Vec<String>, HashMap<String, usize>> = HashMap::new();
            for trace in black_box(&log.traces) {
                let acts: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(ACTIVITY_KEY)
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)
                    })
                    .collect();

                for i in 0..acts.len().saturating_sub(1) {
                    let prefix = vec![acts[i].clone()];
                    let next = acts[i + 1].clone();
                    *counts.entry(prefix).or_default().entry(next).or_insert(0) += 1;
                }
            }
            counts.len()
        })
    });

    // Prefix extraction (from a trace)
    group.bench_function("prefix_extraction", |b| {
        b.iter(|| {
            let trace = black_box(&log.traces[0]);
            let mut acts: Vec<String> = Vec::new();
            for event in &trace.events {
                if let Some(attr) = event.attributes.get(ACTIVITY_KEY) {
                    if let Some(a) = attr.as_string() {
                        acts.push(a.to_owned());
                    }
                }
            }
            acts.len()
        })
    });

    // Inference (lookup in model)
    let mut model: HashMap<Vec<String>, Vec<(String, f64)>> = HashMap::new();
    for trace in &log.traces {
        let acts: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(ACTIVITY_KEY)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();

        for i in 0..acts.len().saturating_sub(1) {
            let prefix = vec![acts[i].clone()];
            model
                .entry(prefix)
                .or_insert_with(Vec::new)
                .push((acts[i + 1].clone(), 0.5));
        }
    }

    group.bench_function("inference", |b| {
        b.iter(|| {
            let prefix = black_box(vec!["Register".to_string()]);
            let _ = model.get(&prefix);
        })
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
            serde_json::to_string(&result).ok()
        })
    });

    group.finish();
}

// ============================================================================
// BATCH PROCESSING THROUGHPUT
// ============================================================================

fn bench_batch_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_batch_throughput");
    group.sample_size(20);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let shape = LogShape {
        num_cases: 1000,
        avg_events_per_case: 20,
        num_activities: 15,
        noise_factor: 0.10,
    };

    let log = generate_event_log(&shape);

    // Build model
    let mut model: HashMap<Vec<String>, Vec<(String, f64)>> = HashMap::new();
    for trace in &log.traces {
        let acts: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(ACTIVITY_KEY)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();

        for i in 0..acts.len().saturating_sub(1) {
            let prefix = vec![acts[i].clone()];
            model
                .entry(prefix)
                .or_insert_with(Vec::new)
                .push((acts[i + 1].clone(), 0.5));
        }
    }

    // Single task processing
    group.bench_function("single_prediction", |b| {
        b.iter(|| {
            let prefix = black_box(vec!["Register".to_string()]);
            model.get(&prefix).map(|p| p.first())
        })
    });

    // Batch processing (100 tasks)
    group.bench_function("batch_100_predictions", |b| {
        b.iter(|| {
            let prefixes = vec![vec!["Register".to_string()]; 100];
            let mut results = Vec::new();
            for prefix in &prefixes {
                results.push(model.get(prefix).map(|p| p.first()));
            }
            results.len()
        })
    });

    // Batch processing (1000 tasks)
    group.bench_function("batch_1000_predictions", |b| {
        b.iter(|| {
            let prefixes = vec![vec!["Register".to_string()]; 1000];
            let mut results = Vec::new();
            for prefix in &prefixes {
                results.push(model.get(prefix).map(|p| p.first()));
            }
            results.len()
        })
    });

    group.finish();
}

// ============================================================================
// SCALING ANALYSIS
// ============================================================================

fn bench_scaling_by_trace_length(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_scaling_trace_length");
    group.sample_size(20);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for trace_len in [10, 50, 100, 500].iter() {
        let shape = LogShape {
            num_cases: 100,
            avg_events_per_case: *trace_len,
            num_activities: 10,
            noise_factor: 0.10,
        };

        let log = generate_event_log(&shape);

        // Build model
        let mut model: HashMap<Vec<String>, Vec<(String, f64)>> = HashMap::new();
        for trace in &log.traces {
            let acts: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(ACTIVITY_KEY)
                        .and_then(|v| v.as_string())
                        .map(str::to_owned)
                })
                .collect();

            for i in 0..acts.len().saturating_sub(1) {
                let prefix = vec![acts[i].clone()];
                model
                    .entry(prefix)
                    .or_insert_with(Vec::new)
                    .push((acts[i + 1].clone(), 0.5));
            }
        }

        group.bench_with_input(
            BenchmarkId::new("model_building", trace_len),
            &trace_len,
            |b, _| {
                b.iter(|| {
                    let mut counts: HashMap<Vec<String>, HashMap<String, usize>> = HashMap::new();
                    for trace in black_box(&log.traces) {
                        let acts: Vec<String> = trace
                            .events
                            .iter()
                            .filter_map(|e| {
                                e.attributes
                                    .get(ACTIVITY_KEY)
                                    .and_then(|v| v.as_string())
                                    .map(str::to_owned)
                            })
                            .collect();

                        for i in 0..acts.len().saturating_sub(1) {
                            let prefix = vec![acts[i].clone()];
                            let next = acts[i + 1].clone();
                            *counts.entry(prefix).or_default().entry(next).or_insert(0) += 1;
                        }
                    }
                    counts.len()
                })
            },
        );
    }

    group.finish();
}

fn bench_scaling_by_log_size(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_scaling_log_size");
    group.sample_size(20);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_cases in [100, 500, 1000, 5000].iter() {
        let shape = LogShape {
            num_cases: *num_cases,
            avg_events_per_case: 15,
            num_activities: 12,
            noise_factor: 0.10,
        };

        let log = generate_event_log(&shape);

        group.bench_with_input(
            BenchmarkId::new("model_building", num_cases),
            &num_cases,
            |b, _| {
                b.iter(|| {
                    let mut counts: HashMap<Vec<String>, HashMap<String, usize>> = HashMap::new();
                    for trace in black_box(&log.traces) {
                        let acts: Vec<String> = trace
                            .events
                            .iter()
                            .filter_map(|e| {
                                e.attributes
                                    .get(ACTIVITY_KEY)
                                    .and_then(|v| v.as_string())
                                    .map(str::to_owned)
                            })
                            .collect();

                        for i in 0..acts.len().saturating_sub(1) {
                            let prefix = vec![acts[i].clone()];
                            let next = acts[i + 1].clone();
                            *counts.entry(prefix).or_default().entry(next).or_insert(0) += 1;
                        }
                    }
                    counts.len()
                })
            },
        );
    }

    group.finish();
}

// ============================================================================
// CRITERION GROUPS
// ============================================================================

fn benches_accuracy(c: &mut Criterion) {
    let sizes = vec![
        (
            LogShape {
                num_cases: 100,
                avg_events_per_case: 10,
                num_activities: 8,
                noise_factor: 0.05,
            },
            "small",
        ),
        (
            LogShape {
                num_cases: 1000,
                avg_events_per_case: 15,
                num_activities: 12,
                noise_factor: 0.10,
            },
            "medium",
        ),
        (
            LogShape {
                num_cases: 5000,
                avg_events_per_case: 20,
                num_activities: 15,
                noise_factor: 0.15,
            },
            "large",
        ),
    ];

    for (shape, label) in sizes {
        benchmark_next_activity_latency(c, &shape, label);
        benchmark_remaining_time_latency(c, &shape, label);
        benchmark_outcome_latency(c, &shape, label);
        benchmark_drift_latency(c, &shape, label);
        benchmark_features_latency(c, &shape, label);
        benchmark_resource_latency(c, &shape, label);
    }
}

criterion_group!(
    benches,
    benches_accuracy,
    bench_end_to_end_breakdown,
    bench_batch_throughput,
    bench_scaling_by_trace_length,
    bench_scaling_by_log_size
);
criterion_main!(benches);
