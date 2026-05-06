/// Criterion benchmarks for prediction functions vs naive baselines.
///
/// Verifies that the performance overhead of the n-gram prediction system
/// is bounded and predictable.  Two baseline comparisons are provided:
///
///   - `uniform_random_baseline`: returns a random activity from the vocabulary,
///     representing the simplest possible baseline.  Its cost is the floor.
///   - n-gram model build + predict: the actual prediction system cost.
///
/// Groups:
///   - `prediction_baseline/ngram_build_unigram`    — build NGramPredictor (n=1) on 1K-trace log
///   - `prediction_baseline/ngram_build_bigram`     — build NGramPredictor (n=2) on 1K-trace log
///   - `prediction_baseline/ngram_predict_unigram`  — predict_next (n=1) per unique prefix
///   - `prediction_baseline/ngram_predict_bigram`   — predict_next (n=2) per unique prefix
///   - `prediction_baseline/uniform_random_baseline` — baseline: pick uniformly at random
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::HashMap;
use std::time::Duration;
use wasm4pm::models::{AttributeValue, EventLog, NGramPredictor};

#[path = "helpers.rs"]
mod helpers;
use helpers::{generate_event_log, Lcg, LogShape, ACTIVITY_KEY};

// ---------------------------------------------------------------------------
// Helper: build NGramPredictor from an EventLog (pure-Rust path, no wasm_bindgen)
// This mirrors the `build_ngram` helper in `prediction_naive_baseline_tests.rs`.
// ---------------------------------------------------------------------------

fn build_ngram(log: &EventLog, activity_key: &str, n: usize) -> NGramPredictor {
    let n = n.max(2);
    let mut counts: HashMap<Vec<String>, HashMap<String, usize>> = HashMap::new();
    for trace in &log.traces {
        let acts: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();
        if acts.len() < 2 {
            continue;
        }
        for i in 0..acts.len() - 1 {
            let context_len = (n - 1).min(i + 1);
            let prefix: Vec<String> = acts[i + 1 - context_len..=i].to_vec();
            let next = acts[i + 1].clone();
            *counts.entry(prefix).or_default().entry(next).or_insert(0) += 1;
        }
    }
    NGramPredictor { n, counts }
}

/// Extract all unique length-1 prefixes (unigram context) from a log.
fn extract_unigram_prefixes(log: &EventLog, activity_key: &str) -> Vec<Vec<String>> {
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                seen.insert(act.clone());
            }
        }
    }
    seen.into_iter().map(|a| vec![a]).collect()
}

/// Extract all unique length-2 prefixes (bigram context) from a log.
fn extract_bigram_prefixes(log: &EventLog, activity_key: &str) -> Vec<Vec<String>> {
    let mut seen: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();
    for trace in &log.traces {
        let acts: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();
        for window in acts.windows(2) {
            seen.insert((window[0].clone(), window[1].clone()));
        }
    }
    seen.into_iter()
        .map(|(a, b)| vec![a, b])
        .collect()
}

/// Build a vocabulary (sorted unique activities) from a log.
fn vocab(log: &EventLog, activity_key: &str) -> Vec<String> {
    let mut seen: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                seen.insert(act.clone());
            }
        }
    }
    seen.into_iter().collect()
}

// ---------------------------------------------------------------------------
// Benchmark: build NGramPredictor (n=1 unigram — minimum order, n clamped to 2)
// ---------------------------------------------------------------------------

fn bench_ngram_build_unigram(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_baseline/ngram_build_unigram");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    // Fixed: 1K-trace log (as specified in the task description)
    let shape = LogShape {
        num_cases: 1_000,
        avg_events_per_case: 15,
        num_activities: 12,
        noise_factor: 0.10,
    };
    let log = generate_event_log(&shape);
    let events = log.event_count();

    group.throughput(Throughput::Elements(events as u64));
    group.bench_function("1k_traces", |b| {
        // n=1 is clamped to 2 inside build_ngram; this exercises the minimum-order path
        b.iter(|| build_ngram(&log, ACTIVITY_KEY, 1))
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: build NGramPredictor (n=2 bigram)
// ---------------------------------------------------------------------------

fn bench_ngram_build_bigram(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_baseline/ngram_build_bigram");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let shape = LogShape {
        num_cases: 1_000,
        avg_events_per_case: 15,
        num_activities: 12,
        noise_factor: 0.10,
    };
    let log = generate_event_log(&shape);
    let events = log.event_count();

    group.throughput(Throughput::Elements(events as u64));
    group.bench_function("1k_traces", |b| {
        b.iter(|| build_ngram(&log, ACTIVITY_KEY, 2))
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: predict_next (n=1/unigram) per unique prefix
// ---------------------------------------------------------------------------

fn bench_ngram_predict_unigram(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_baseline/ngram_predict_unigram");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let shape = LogShape {
        num_cases: 1_000,
        avg_events_per_case: 15,
        num_activities: 12,
        noise_factor: 0.10,
    };
    let log = generate_event_log(&shape);
    let predictor = build_ngram(&log, ACTIVITY_KEY, 2); // n=1 clamped to 2
    let prefixes = extract_unigram_prefixes(&log, ACTIVITY_KEY);
    let events = log.event_count();

    group.throughput(Throughput::Elements(events as u64));
    group.bench_with_input(
        BenchmarkId::new("prefixes", prefixes.len()),
        &prefixes,
        |b, ps| {
            b.iter(|| {
                let mut count = 0usize;
                for prefix in ps {
                    count += predictor.predict(prefix).len();
                }
                count
            })
        },
    );
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: predict_next (n=2/bigram) per unique bigram prefix
// ---------------------------------------------------------------------------

fn bench_ngram_predict_bigram(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_baseline/ngram_predict_bigram");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let shape = LogShape {
        num_cases: 1_000,
        avg_events_per_case: 15,
        num_activities: 12,
        noise_factor: 0.10,
    };
    let log = generate_event_log(&shape);
    let predictor = build_ngram(&log, ACTIVITY_KEY, 3); // n=3: context is 2 (bigram)
    let prefixes = extract_bigram_prefixes(&log, ACTIVITY_KEY);
    let events = log.event_count();

    group.throughput(Throughput::Elements(events as u64));
    group.bench_with_input(
        BenchmarkId::new("prefixes", prefixes.len()),
        &prefixes,
        |b, ps| {
            b.iter(|| {
                let mut count = 0usize;
                for prefix in ps {
                    count += predictor.predict(prefix).len();
                }
                count
            })
        },
    );
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: uniform random baseline
//
// Returns a random activity from the vocabulary without any learned model.
// This is the simplest possible prediction baseline — its cost is the floor
// against which n-gram overhead should be judged.
// ---------------------------------------------------------------------------

fn bench_uniform_random_baseline(c: &mut Criterion) {
    let mut group = c.benchmark_group("prediction_baseline/uniform_random_baseline");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() { helpers::fast_group(&mut group); } else { helpers::full_group(&mut group); }

    let shape = LogShape {
        num_cases: 1_000,
        avg_events_per_case: 15,
        num_activities: 12,
        noise_factor: 0.10,
    };
    let log = generate_event_log(&shape);
    let vocabulary = vocab(&log, ACTIVITY_KEY);
    let events = log.event_count();
    let num_prefixes = extract_unigram_prefixes(&log, ACTIVITY_KEY).len();

    group.throughput(Throughput::Elements(events as u64));
    group.bench_with_input(
        BenchmarkId::new("prefixes", num_prefixes),
        &vocabulary,
        |b, vocab| {
            // Deterministic LCG — no external rand crate required
            let mut rng = Lcg::new(0x1234_5678_9ABC_DEF0);
            b.iter(|| {
                // Simulate predicting for `num_prefixes` queries
                let mut result = String::new();
                for _ in 0..num_prefixes {
                    let idx = rng.next_usize_mod(vocab.len());
                    result = vocab[idx].clone();
                }
                result
            })
        },
    );
    group.finish();
}

criterion_group!(
    prediction_baseline_benches,
    bench_ngram_build_unigram,
    bench_ngram_build_bigram,
    bench_ngram_predict_unigram,
    bench_ngram_predict_bigram,
    bench_uniform_random_baseline,
);
criterion_main!(prediction_baseline_benches);
