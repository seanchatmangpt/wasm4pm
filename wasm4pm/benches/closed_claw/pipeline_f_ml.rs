//! Closed Claw Pipeline F: ML-Augmented Runtime
//!
//! Benchmarks: Streaming DFG, Anomaly Detection, Drift Detection
//! Gates: G1 Determinism, G5 Report

use criterion::{black_box, BenchmarkId, Criterion, Throughput};
use pictl::simd_streaming_dfg::SimdStreamingDfg;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

#[path = "../helpers.rs"]
mod helpers;
use helpers::{generate_event_log, LogShape, ACTIVITY_KEY};

struct Lcg(u64);
impl Lcg {
    const fn new(seed: u64) -> Self {
        Self(seed)
    }
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0
    }
    fn next_usize_mod(&mut self, m: usize) -> usize {
        (self.next() as usize) % m
    }
    fn next_f64_unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
}

const STREAMING_ACTIVITIES: &[&str] = &[
    "Register",
    "Validate",
    "Check_Docs",
    "Assess_Risk",
    "Calculate_Fee",
    "Send_Invoice",
    "Confirm_Payment",
    "Approve_Basic",
    "Approve_Senior",
    "Notify_Applicant",
    "Create_Record",
    "Archive",
    "Close",
    "Reject",
];

fn generate_streaming_events(
    num_cases: usize,
    avg_events_per_case: usize,
) -> Vec<(String, String)> {
    let mut rng = Lcg::new(0xDEAD_BEEF_CAFE_BABE);
    let mut events = Vec::with_capacity(num_cases * avg_events_per_case);
    for case_idx in 0..num_cases {
        let case_id = format!("case_{}", case_idx);
        let len_factor = 0.5 + rng.next_f64_unit();
        let num_events = ((avg_events_per_case as f64 * len_factor) as usize).max(2);
        for evt_idx in 0..num_events {
            let base_idx = evt_idx % STREAMING_ACTIVITIES.len();
            let act_idx = if rng.next_f64_unit() < 0.1 {
                rng.next_usize_mod(STREAMING_ACTIVITIES.len())
            } else {
                base_idx
            };
            events.push((case_id.clone(), STREAMING_ACTIVITIES[act_idx].to_string()));
        }
    }
    events
}

fn encode_streaming_to_columnar(
    events: &[(String, String)],
) -> (Vec<u32>, Vec<usize>, Vec<String>) {
    let mut vocab_map: HashMap<String, u32> = HashMap::new();
    let mut vocab: Vec<String> = Vec::new();
    let mut case_events: HashMap<String, Vec<u32>> = HashMap::new();
    let mut case_order: Vec<String> = Vec::new();
    for (case_id, activity) in events {
        let id = *vocab_map.entry(activity.clone()).or_insert_with(|| {
            let id = vocab.len() as u32;
            vocab.push(activity.clone());
            id
        });
        case_events
            .entry(case_id.clone())
            .or_insert_with(|| {
                case_order.push(case_id.clone());
                Vec::new()
            })
            .push(id);
    }
    let mut flat_events = Vec::new();
    let mut offsets = vec![0usize];
    for case_id in &case_order {
        if let Some(trace) = case_events.get(case_id) {
            flat_events.extend_from_slice(trace);
            offsets.push(flat_events.len());
        }
    }
    (flat_events, offsets, vocab)
}

fn bench_streaming_dfg_simd(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/F_ml/streaming_dfg_simd");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    let sizes: &[usize] = &[1_000, 5_000, 10_000, 50_000];
    for &num_cases in sizes {
        let events = generate_streaming_events(num_cases, 15);
        let total_events = events.len();
        let (flat, offsets, vocab_strs) = encode_streaming_to_columnar(&events);
        let vocab: Vec<&str> = vocab_strs.iter().map(|s| s.as_str()).collect();
        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &(flat, offsets, vocab),
            |b, (flat, offsets, vocab)| {
                b.iter(|| {
                    let mut builder = SimdStreamingDfg::new();
                    builder.add_events(black_box(flat), black_box(offsets));
                    let dfg = builder.finish(black_box(vocab));
                    black_box(dfg)
                })
            },
        );
    }
    group.finish();
}

fn bench_streaming_dfg_builder(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/F_ml/streaming_dfg_builder");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    let sizes: &[usize] = &[1_000, 5_000, 10_000, 50_000];
    for &num_cases in sizes {
        let events = generate_streaming_events(num_cases, 15);
        let total_events = events.len();
        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &events,
            |b, events| {
                b.iter(|| {
                    let mut edge_counts: HashMap<(u32, u32), usize> = HashMap::new();
                    let mut node_counts: HashMap<u32, usize> = HashMap::new();
                    let mut start_counts: HashMap<u32, usize> = HashMap::new();
                    let mut end_counts: HashMap<u32, usize> = HashMap::new();
                    let mut vocab_map: HashMap<String, u32> = HashMap::new();
                    let mut _vocab: Vec<String> = Vec::new();
                    let mut open_traces: HashMap<String, Vec<u32>> = HashMap::new();
                    for (case_id, activity) in black_box(events).iter() {
                        let id = *vocab_map.entry(activity.clone()).or_insert_with(|| {
                            let id = _vocab.len() as u32;
                            _vocab.push(activity.clone());
                            id
                        });
                        open_traces.entry(case_id.clone()).or_default().push(id);
                    }
                    for (_case_id, trace) in &open_traces {
                        if trace.is_empty() {
                            continue;
                        }
                        for &id in trace {
                            *node_counts.entry(id).or_insert(0) += 1;
                        }
                        for pair in trace.windows(2) {
                            *edge_counts.entry((pair[0], pair[1])).or_insert(0) += 1;
                        }
                        *start_counts.entry(trace[0]).or_insert(0) += 1;
                        if let Some(&last) = trace.last() {
                            *end_counts.entry(last).or_insert(0) += 1;
                        }
                    }
                    black_box((edge_counts.len(), node_counts.len()))
                })
            },
        );
    }
    group.finish();
}

fn bench_anomaly_detection(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/F_ml/anomaly_detection");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    for num_cases in [500usize, 2_000, 5_000] {
        let shape = LogShape {
            num_cases,
            avg_events_per_case: 15,
            num_activities: 14,
            noise_factor: 0.1,
        };
        let log = generate_event_log(&shape);
        let mut edge_freq: HashMap<(String, String), usize> = HashMap::new();
        let mut total_edges: usize = 0;
        for trace in &log.traces {
            let activities: Vec<&str> = trace
                .events
                .iter()
                .filter_map(|e| e.attributes.get(ACTIVITY_KEY).and_then(|v| v.as_string()))
                .collect();
            for pair in activities.windows(2) {
                *edge_freq
                    .entry((pair[0].to_string(), pair[1].to_string()))
                    .or_insert(0) += 1;
                total_edges += 1;
            }
        }
        let total_f = total_edges.max(1) as f64;
        let traces: Vec<Vec<String>> = log
            .traces
            .iter()
            .map(|t| {
                t.events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(ACTIVITY_KEY)
                            .and_then(|v| v.as_string())
                            .map(|s| s.to_string())
                    })
                    .collect()
            })
            .collect();
        let total_trace_events: usize = traces.iter().map(|t| t.len()).sum();
        group.throughput(Throughput::Elements(total_trace_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &(traces, edge_freq, total_f),
            |b, (traces, edge_freq, total_f)| {
                b.iter(|| {
                    let missing_edge_cost: f64 = 10.0;
                    let mut scores: Vec<f64> = Vec::with_capacity(traces.len());
                    for trace in black_box(traces).iter() {
                        if trace.len() < 2 {
                            scores.push(0.0);
                            continue;
                        }
                        let steps = trace.len() - 1;
                        let mut cost_sum = 0.0_f64;
                        for i in 0..steps {
                            let freq = edge_freq
                                .get(&(trace[i].clone(), trace[i + 1].clone()))
                                .copied()
                                .unwrap_or(0);
                            cost_sum += if freq == 0 {
                                missing_edge_cost
                            } else {
                                -(freq as f64 / *black_box(total_f)).log2()
                            };
                        }
                        scores.push(cost_sum / steps as f64);
                    }
                    black_box(scores)
                })
            },
        );
    }
    group.finish();
}

fn bench_drift_detection(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/F_ml/drift_detection");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    for num_cases in [1_000usize, 5_000, 10_000] {
        let shape = LogShape {
            num_cases,
            avg_events_per_case: 15,
            num_activities: 14,
            noise_factor: 0.1,
        };
        let log = generate_event_log(&shape);
        let window_size: usize = 50;
        let trace_activity_sets: Vec<HashSet<String>> = log
            .traces
            .iter()
            .map(|t| {
                t.events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(ACTIVITY_KEY)
                            .and_then(|v| v.as_string())
                            .map(|s| s.to_string())
                    })
                    .collect()
            })
            .collect();
        group.throughput(Throughput::Elements(num_cases as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &(trace_activity_sets, window_size),
            |b, (trace_sets, window_size)| {
                b.iter(|| {
                    let drift_threshold: f64 = 0.3;
                    let mut drift_count: usize = 0;
                    let mut prev_activities: HashSet<&String> = HashSet::new();
                    for window in black_box(trace_sets).windows(*black_box(window_size)) {
                        let mut current: HashSet<&String> = HashSet::new();
                        for set in window {
                            for act in set {
                                current.insert(act);
                            }
                        }
                        if !prev_activities.is_empty() {
                            let intersection = current.intersection(&prev_activities).count();
                            let union = current.union(&prev_activities).count().max(1);
                            let jaccard_distance = 1.0 - (intersection as f64 / union as f64);
                            if jaccard_distance > drift_threshold {
                                drift_count += 1;
                            }
                        }
                        prev_activities = current;
                    }
                    black_box(drift_count)
                })
            },
        );
    }
    group.finish();
}

pub fn bench_ml_augmented(c: &mut Criterion) {
    bench_streaming_dfg_simd(c);
    bench_streaming_dfg_builder(c);
    bench_anomaly_detection(c);
    bench_drift_detection(c);
}
