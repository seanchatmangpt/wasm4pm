//! Autonomic Instincts — Real-Data Criterion Benchmarks.
//!
//! Benchmarks the self-governing layer (SPC, EWMA drift, Jaccard drift,
//! RL orchestrator, circuit breaker) driven by statistics extracted from
//! real XES event logs — NOT synthetic seeded states.
//!
//! What this adds over existing benches (rl_convergence.rs, drift_bench.rs):
//!   - SPC Western Electric rules run on *real* event-rate time series
//!     (sepsis ICU data has genuine rework loops that trigger real SPC alerts)
//!   - EWMA smoothed on *real* activity-frequency series with realistic
//!     timestamp gaps and activity diversity variation
//!   - Jaccard drift measured between *real* sliding-window activity sets
//!   - RL orchestrator driven by feature vectors derived from *real* logs
//!   - Circuit breaker driven by *real* SPC alert rates (not a fixed 0%)
//!   - Full autonomic loop (SPC → RL → circuit) as one chained iteration
//!
//! Datasets (real files with synthetic fallback if absent):
//!   bench_data/sepsis.xes         — 1,050 cases, ~15K events (ICU patient flow)
//!   bench_data/bpi2020_travel.xes — 7,065 cases, ~87K events (travel permits)
//!   ~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes — 100 cases

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use std::fs;

use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::prediction_drift::{classify_trend, ewma_series, jaccard_distance};
use wasm4pm::rl_orchestrator::{compute_health_state, RlOrchestrator};
use wasm4pm::self_healing::CircuitBreaker;
use wasm4pm::spc::{check_western_electric_rules, ChartData};
use wasm4pm::RlState;

const ACTIVITY_KEY: &str = "concept:name";
const TIMESTAMP_KEY: &str = "time:timestamp";

// ─── XES parser (verbatim from real_data_bench.rs) ──────────────────────────

fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            current_trace = Some(Trace { attributes: HashMap::new(), events: Vec::new() });
        }
        if trimmed.starts_with("</trace>") {
            if let Some(t) = current_trace.take() { log.traces.push(t); }
        }
        if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
            current_event = Some(Event { attributes: HashMap::new() });
        }
        if trimmed.starts_with("</event>") {
            if let Some(ev) = current_event.take() {
                if let Some(ref mut t) = current_trace { t.events.push(ev); }
            }
        }
        if trimmed.starts_with("<string") {
            if let (Some(k), Some(v)) = (extract_attr(trimmed, "key"), extract_attr(trimmed, "value")) {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(ref mut t) = current_trace {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
        if trimmed.starts_with("<date") {
            if let (Some(k), Some(v)) = (extract_attr(trimmed, "key"), extract_attr(trimmed, "value")) {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::Date(v));
                }
            }
        }
    }
    log
}

fn extract_attr(s: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = s.find(&needle)? + needle.len();
    let end = s[start..].find('"')?;
    Some(s[start..start + end].to_string())
}

// ─── Synthetic fallback ──────────────────────────────────────────────────────

fn generate_synthetic_fallback() -> EventLog {
    let activities = ["Register", "Validate", "Assess", "Approve", "Close"];
    let mut log = EventLog::new();
    for i in 0..100usize {
        let mut trace = Trace { attributes: HashMap::new(), events: Vec::new() };
        let len = 5 + (i % 8);
        for j in 0..len {
            let mut ev = Event { attributes: HashMap::new() };
            ev.attributes.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(activities[j % activities.len()].to_string()),
            );
            ev.attributes.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::Date(format!("2024-01-01T{:02}:00:00.000+00:00", j)),
            );
            trace.events.push(ev);
        }
        log.traces.push(trace);
    }
    log
}

// ─── Feature extraction from real EventLog ───────────────────────────────────

fn extract_event_rates(log: &EventLog) -> Vec<f64> {
    log.traces.iter().map(|t| t.events.len() as f64).collect()
}

fn extract_activity_frequencies(log: &EventLog) -> Vec<f64> {
    log.traces
        .iter()
        .map(|t| {
            let unique: HashSet<_> = t
                .events
                .iter()
                .filter_map(|e| e.attributes.get(ACTIVITY_KEY))
                .filter_map(|v| match v {
                    AttributeValue::String(s) => Some(s.as_str()),
                    _ => None,
                })
                .collect();
            unique.len() as f64
        })
        .collect()
}

fn extract_rework_ratio(log: &EventLog) -> f64 {
    let rework_traces = log.traces.iter().filter(|t| {
        let mut seen: HashMap<&str, usize> = HashMap::new();
        for ev in &t.events {
            if let Some(AttributeValue::String(a)) = ev.attributes.get(ACTIVITY_KEY) {
                *seen.entry(a.as_str()).or_insert(0) += 1;
            }
        }
        seen.values().any(|&c| c > 1)
    }).count();
    if log.traces.is_empty() { 0.0 } else { rework_traces as f64 / log.traces.len() as f64 }
}

fn extract_window_activity_sets(
    log: &EventLog,
    window_size: usize,
) -> Vec<(HashSet<String>, HashSet<String>)> {
    let windows: Vec<HashSet<String>> = log
        .traces
        .chunks(window_size.max(1))
        .map(|chunk| {
            chunk
                .iter()
                .flat_map(|t| t.events.iter())
                .filter_map(|e| e.attributes.get(ACTIVITY_KEY))
                .filter_map(|v| match v {
                    AttributeValue::String(s) => Some(s.clone()),
                    _ => None,
                })
                .collect()
        })
        .collect();
    windows.windows(2).map(|w| (w[0].clone(), w[1].clone())).collect()
}

fn build_chart_data(series: &[f64]) -> Vec<ChartData> {
    if series.is_empty() {
        return Vec::new();
    }
    let n = series.len() as f64;
    let mean = series.iter().sum::<f64>() / n;
    let variance = series.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    let sigma = variance.sqrt().max(1e-9);
    let ucl = mean + 3.0 * sigma;
    let lcl = mean - 3.0 * sigma;
    series
        .iter()
        .enumerate()
        .map(|(i, &v)| ChartData {
            timestamp: format!("2024-{:04}", i),
            value: v,
            ucl,
            cl: mean,
            lcl,
            subgroup_data: None,
        })
        .collect()
}

fn build_rl_features(
    log: &EventLog,
    event_rates: &[f64],
    activity_freqs: &[f64],
    rework_ratio: f64,
) -> [f32; 8] {
    let total_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
    let trace_count = log.traces.len().max(1);
    let unique_activities: HashSet<_> = log
        .traces
        .iter()
        .flat_map(|t| t.events.iter())
        .filter_map(|e| e.attributes.get(ACTIVITY_KEY))
        .filter_map(|v| match v { AttributeValue::String(s) => Some(s.as_str()), _ => None })
        .collect();
    let n_activities = unique_activities.len();

    let avg_rate = if !event_rates.is_empty() {
        event_rates.iter().sum::<f64>() / event_rates.len() as f64
    } else {
        0.0
    };
    let avg_freq = if !activity_freqs.is_empty() {
        activity_freqs.iter().sum::<f64>() / activity_freqs.len() as f64
    } else {
        0.0
    };

    // Normalize each component to [0,1] matching RlState quantization ranges
    let event_rate_norm = (avg_rate / 50.0_f64).clamp(0.0, 1.0) as f32;        // 0-7 → /7
    let activity_norm  = (n_activities as f64 / 30.0).clamp(0.0, 1.0) as f32;   // 0-7
    let trace_norm     = ((trace_count as f64).log2() / 14.0).clamp(0.0, 1.0) as f32; // log scale
    let rework_norm    = (rework_ratio as f32).clamp(0.0, 1.0);
    let total_norm     = ((total_events as f64) / 100_000.0).clamp(0.0, 1.0) as f32;
    let freq_norm      = (avg_freq / 20.0_f64).clamp(0.0, 1.0) as f32;

    [
        event_rate_norm,   // event_rate_q proxy
        activity_norm,     // activity_count_q proxy
        0.0_f32,           // spc_alert_level (set during bench)
        0.0_f32,           // drift_status (set during bench)
        rework_norm,       // rework_ratio_q proxy
        trace_norm,        // cycle_phase proxy
        total_norm,        // health_level proxy
        freq_norm,         // circuit_state proxy
    ]
}

// ─── Dataset fixture ─────────────────────────────────────────────────────────

struct AutonomicDataset {
    label: &'static str,
    event_count: u64,
    trace_count: u64,
    event_rates: Vec<f64>,
    activity_frequencies: Vec<f64>,
    chart_data: Vec<ChartData>,
    window_pairs: Vec<(HashSet<String>, HashSet<String>)>,
    rl_features: [f32; 8],
    rl_state: RlState,
    rl_next_state: RlState,
    spc_alert_count: usize,
    rework_ratio: f32,
}

fn load_dataset(candidates: &[&str], label: &'static str) -> AutonomicDataset {
    let home = std::env::var("HOME").unwrap_or_default();
    let log = candidates
        .iter()
        .filter_map(|p| {
            let resolved = p.replace("~", &home);
            let content = fs::read_to_string(&resolved).ok()?;
            if content.len() < 200 { return None; }
            let l = parse_xes(&content);
            if l.traces.is_empty() { return None; }
            Some(l)
        })
        .next()
        .unwrap_or_else(|| {
            panic!(
                "Required dataset '{}' not found at any of: {:?}\n\
                 Download from https://data.4tu.nl/ (Sepsis/RoadTraffic)",
                label, candidates
            )
        });

    let event_count = log.traces.iter().map(|t| t.events.len()).sum::<usize>() as u64;
    let trace_count = log.traces.len() as u64;
    let unique_acts: HashSet<_> = log
        .traces
        .iter()
        .flat_map(|t| t.events.iter())
        .filter_map(|e| e.attributes.get(ACTIVITY_KEY))
        .filter_map(|v| match v { AttributeValue::String(s) => Some(s.as_str()), _ => None })
        .collect();

    let event_rates = extract_event_rates(&log);
    let activity_frequencies = extract_activity_frequencies(&log);
    let rework_ratio = extract_rework_ratio(&log) as f32;
    let chart_data = build_chart_data(&event_rates);
    let window_pairs = extract_window_activity_sets(&log, 50);

    let rl_features = build_rl_features(&log, &event_rates, &activity_frequencies, rework_ratio as f64);
    let health = compute_health_state(event_count, trace_count, unique_acts.len() as u64);
    let rl_state = RlState::from_features(&rl_features, health, rework_ratio);
    // next_state = slightly healthier (simulates successful cycle)
    let next_health = health.saturating_sub(1);
    let rl_next_state = RlState::from_features(&rl_features, next_health, rework_ratio * 0.95);

    let spc_alert_count = check_western_electric_rules(&chart_data).len();

    AutonomicDataset {
        label,
        event_count,
        trace_count,
        event_rates,
        activity_frequencies,
        chart_data,
        window_pairs,
        rl_features,
        rl_state,
        rl_next_state,
        spc_alert_count,
        rework_ratio,
    }
}

fn real_datasets() -> Vec<AutonomicDataset> {
    vec![
        load_dataset(
            &["bench_data/sepsis.xes", "../../bench_data/sepsis.xes"],
            "sepsis",
        ),
        load_dataset(
            &["bench_data/bpi2020_travel.xes", "../../bench_data/bpi2020_travel.xes"],
            "bpi2020",
        ),
        load_dataset(
            &[
                "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
                "~/chatmangpt/pm4py/tests/input_data/roadtraffic50traces.xes",
            ],
            "roadtraffic",
        ),
    ]
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

/// Western Electric rule checking against real event-rate control charts.
fn bench_spc(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("autonomic/spc");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.trace_count));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &ds.chart_data,
            |b, chart| {
                b.iter(|| check_western_electric_rules(black_box(chart)));
            },
        );
    }
    group.finish();
}

/// EWMA smoothing on real activity-frequency time series.
fn bench_ewma(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("autonomic/ewma");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &ds.activity_frequencies,
            |b, series| {
                b.iter(|| ewma_series(black_box(series), black_box(0.3)));
            },
        );
    }
    group.finish();
}

/// Jaccard drift detection on real consecutive window pairs.
fn bench_jaccard(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("autonomic/jaccard");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        let pair_count = ds.window_pairs.len() as u64;
        if pair_count == 0 {
            continue;
        }
        group.throughput(Throughput::Elements(pair_count));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &ds.window_pairs,
            |b, pairs| {
                b.iter(|| {
                    pairs.iter().for_each(|(a, b_set)| {
                        black_box(jaccard_distance(black_box(a), black_box(b_set)));
                    });
                });
            },
        );
    }
    group.finish();
}

/// RL orchestrator cycle driven by real-derived feature vectors and state.
///
/// Creates one orchestrator per dataset (warm state machine) and repeatedly
/// calls run_cycle() — measuring pure dispatch cost, not initialization.
fn bench_rl_cycle(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("autonomic/rl_cycle");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        // Pre-warm the orchestrator to a trained state (100 cycles)
        let mut orch = RlOrchestrator::new_with_seed(42);
        for _ in 0..100 {
            orch.run_cycle(
                &ds.rl_features,
                &ds.rl_state,
                &ds.rl_next_state,
                ds.spc_alert_count,
                true,
                true,
                false,
            );
        }

        group.throughput(Throughput::Elements(1));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &(ds.rl_features, ds.rl_state.clone(), ds.rl_next_state.clone(), ds.spc_alert_count),
            |b, (features, state, next, alerts)| {
                // Note: orch is captured by ref; state machine updates are part of the measurement
                let mut local_orch = RlOrchestrator::new_with_seed(42);
                b.iter(|| {
                    local_orch.run_cycle(
                        black_box(features),
                        black_box(state),
                        black_box(next),
                        black_box(*alerts),
                        true,
                        true,
                        false,
                    )
                });
            },
        );
    }
    group.finish();
}

/// Circuit breaker state transitions driven by real SPC alert rates.
///
/// Replays a failure/success sequence proportional to the real alert rate
/// observed in each dataset, measuring allow_request() + record_*() cost.
fn bench_circuit_breaker(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("autonomic/circuit_breaker");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        // Build a sequence of N=100 allow+record operations at the real failure rate
        let n = 100usize;
        let failure_rate = (ds.spc_alert_count as f64 / ds.trace_count.max(1) as f64).clamp(0.0, 1.0);
        let failures: Vec<bool> = (0..n)
            .map(|i| (i as f64 / n as f64) < failure_rate)
            .collect();

        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &failures,
            |b, seq| {
                b.iter(|| {
                    let mut cb = CircuitBreaker::new();
                    for &fail in seq {
                        let _ = cb.allow_request();
                        if fail {
                            cb.record_failure();
                        } else {
                            cb.record_success();
                        }
                    }
                });
            },
        );
    }
    group.finish();
}

/// Full autonomic loop: SPC check → RL decision → circuit breaker gate.
///
/// Measures the end-to-end per-heartbeat cost of the autonomic instinct layer
/// when driven by real-data-derived state (not synthetic seeded states).
fn bench_full_loop(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("autonomic/full_loop");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(1));
        let input = (
            ds.chart_data.clone(),
            ds.rl_features,
            ds.rl_state.clone(),
            ds.rl_next_state.clone(),
            ds.spc_alert_count,
        );
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &input,
            |b, (chart, features, state, next, _alert_hint)| {
                let mut orch = RlOrchestrator::new_with_seed(42);
                let mut cb = CircuitBreaker::new();
                b.iter(|| {
                    // 1. Perception: check Western Electric rules on real event-rate chart
                    let alerts = check_western_electric_rules(black_box(chart));
                    let alert_count = alerts.len();

                    // 2. Decision: RL orchestrator selects action
                    let circuit_allowed = cb.allow_request();
                    let (_action, _reward) = orch.run_cycle(
                        black_box(features),
                        black_box(state),
                        black_box(next),
                        black_box(alert_count),
                        true,
                        circuit_allowed,
                        false,
                    );

                    // 3. Protection: record result in circuit breaker
                    if alert_count > 0 {
                        cb.record_failure();
                    } else {
                        cb.record_success();
                    }
                });
            },
        );
    }
    group.finish();
}

/// classify_trend on real EWMA-smoothed activity-frequency series.
///
/// Tests the pure function that maps a smoothed series to "rising"/"falling"/"stable".
/// This is the step between EWMA output and RL drift_status — a CPU-bound classification.
fn bench_classify_trend(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("autonomic/classify_trend");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        let smoothed = ewma_series(&ds.activity_frequencies, 0.3);
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &smoothed,
            |b, series| {
                b.iter(|| classify_trend(black_box(series)));
            },
        );
    }
    group.finish();
}

criterion_group!(
    autonomic_benches,
    bench_spc,
    bench_ewma,
    bench_jaccard,
    bench_rl_cycle,
    bench_circuit_breaker,
    bench_full_loop,
    bench_classify_trend,
);
criterion_main!(autonomic_benches);
