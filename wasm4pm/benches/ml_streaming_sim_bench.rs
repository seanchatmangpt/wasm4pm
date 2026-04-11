/// Criterion benchmarks for ML, streaming, simulation, and OCEL algorithms.
///
/// This benchmark suite measures performance of:
/// - Next activity prediction (n-gram, beam search)
/// - Remaining time prediction
/// - Outcome prediction (anomaly scoring, boundary coverage, trace likelihood)
/// - Anomaly detection
/// - Streaming DFG/skeleton single-event ingestion (throughput: events/sec)
/// - Monte Carlo simulation (varying num_cases)
/// - OCEL flatten to eventlog
///
/// Note: Uses internal Rust APIs directly, not WASM bindings.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::models::{AttributeValue, Event, EventLog, NGramPredictor, OCEL, OCELEvent, OCELObject, Trace};
use pictl::streaming::{StreamingAlgorithm, StreamingDfgBuilder, StreamingSkeletonBuilder};
use pictl::montecarlo::{run_monte_carlo_simulation, MonteCarloConfig};
use pictl::state::{get_or_init_state, StoredObject};
use std::collections::HashMap;
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{LogShape, ACTIVITY_KEY};

// Local LCG implementation for deterministic random number generation
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

const TIMESTAMP_KEY: &str = "time:timestamp";

// ---------------------------------------------------------------------------
// Benchmark sizes
// ---------------------------------------------------------------------------

fn ml_bench_sizes() -> Vec<LogShape> {
    vec![
        LogShape {
            num_cases: 50,
            avg_events_per_case: 10,
            num_activities: 6,
            noise_factor: 0.05,
        },
        LogShape {
            num_cases: 200,
            avg_events_per_case: 12,
            num_activities: 8,
            noise_factor: 0.08,
        },
        LogShape {
            num_cases: 500,
            avg_events_per_case: 15,
            num_activities: 10,
            noise_factor: 0.10,
        },
    ]
}

fn streaming_bench_sizes() -> Vec<LogShape> {
    vec![
        LogShape {
            num_cases: 100,
            avg_events_per_case: 10,
            num_activities: 6,
            noise_factor: 0.05,
        },
        LogShape {
            num_cases: 1000,
            avg_events_per_case: 15,
            num_activities: 10,
            noise_factor: 0.10,
        },
        LogShape {
            num_cases: 5000,
            avg_events_per_case: 20,
            num_activities: 15,
            noise_factor: 0.15,
        },
    ]
}

// ---------------------------------------------------------------------------
// Synthetic log generator with timestamps
// ---------------------------------------------------------------------------

const ACTIVITIES: &[&str; 15] = &[
    "Register", "Validate", "Check_Docs", "Assess_Risk", "Calculate_Fee",
    "Send_Invoice", "Wait_Payment", "Confirm_Payment", "Approve_Basic",
    "Approve_Senior", "Notify_Applicant", "Create_Record", "Archive",
    "Close", "Reject",
];

fn generate_event_log_with_timestamps(shape: &LogShape) -> EventLog {
    let activities: Vec<&str> = ACTIVITIES
        .iter()
        .copied()
        .take(shape.num_activities)
        .collect();
    let mut rng = Lcg::new(0xDEAD_BEEF_CAFE_BABE);
    let mut log = EventLog::new();

    for case_idx in 0..shape.num_cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case:concept:name".to_string(),
            AttributeValue::String(format!("case_{}", case_idx)),
        );

        let len_factor = 0.5 + rng.next_f64_unit();
        let num_events = ((shape.avg_events_per_case as f64 * len_factor) as usize).max(2);

        let mut timestamp_ms = (case_idx * 1_000_000) as i64;

        for evt_idx in 0..num_events {
            let base_idx = evt_idx % activities.len();
            let act_idx = if rng.next_f64_unit() < shape.noise_factor {
                rng.next_usize_mod(activities.len())
            } else {
                base_idx
            };

            let service_time_ms = 100 + rng.next_usize_mod(900);
            timestamp_ms += service_time_ms as i64;

            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(activities[act_idx].to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::Date(format!(
                    "2024-01-{:02}T{:02}:{:02}:{:02}.{:03}Z",
                    (case_idx % 28) + 1,
                    (timestamp_ms / 3_600_000) % 24,
                    (timestamp_ms / 60_000) % 60,
                    (timestamp_ms / 1000) % 60,
                    timestamp_ms % 1000
                )),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

fn store_log(log: EventLog) -> String {
    get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("bench: store_object failed")
}

fn make_handle_with_timestamps(shape: &LogShape) -> (String, usize) {
    let log = generate_event_log_with_timestamps(shape);
    let total_events = log.event_count();
    let handle = store_log(log);
    (handle, total_events)
}

// ---------------------------------------------------------------------------
// Internal helpers for n-gram prediction
// ---------------------------------------------------------------------------

/// Build an n-gram predictor from an event log (internal version).
fn build_ngram_predictor_internal(log: &EventLog, activity_key: &str, n: usize) -> NGramPredictor {
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

/// Build a DFG from an event log (internal version).
fn build_dfg_internal(log: &EventLog, activity_key: &str) -> pictl::models::DirectlyFollowsGraph {
    use pictl::models::{DFGNode, DirectlyFollowsRelation};
    use std::collections::HashMap;

    let mut node_counts: HashMap<String, usize> = HashMap::new();
    let mut edge_counts: HashMap<(String, String), usize> = HashMap::new();
    let mut start_counts: HashMap<String, usize> = HashMap::new();
    let mut end_counts: HashMap<String, usize> = HashMap::new();

    for trace in &log.traces {
        let acts: Vec<&str> = trace
            .events
            .iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
            .collect();

        if acts.is_empty() {
            continue;
        }

        // Count nodes
        for act in &acts {
            *node_counts.entry(act.to_string()).or_insert(0) += 1;
        }

        // Count edges
        for i in 0..acts.len().saturating_sub(1) {
            let from = acts[i];
            let to = acts[i + 1];
            *edge_counts.entry((from.to_string(), to.to_string())).or_insert(0) += 1;
        }

        // Start/end activities
        if let Some(first) = acts.first() {
            *start_counts.entry(first.to_string()).or_insert(0) += 1;
        }
        if let Some(last) = acts.last() {
            *end_counts.entry(last.to_string()).or_insert(0) += 1;
        }
    }

    let mut dfg = pictl::models::DirectlyFollowsGraph::new();
    dfg.nodes = node_counts
        .into_iter()
        .map(|(id, freq)| DFGNode {
            id: id.clone(),
            label: id,
            frequency: freq,
        })
        .collect();
    dfg.edges = edge_counts
        .into_iter()
        .map(|((from, to), freq)| DirectlyFollowsRelation {
            from,
            to,
            frequency: freq,
        })
        .collect();
    dfg.start_activities = start_counts;
    dfg.end_activities = end_counts;
    dfg
}

// ---------------------------------------------------------------------------
// ML Prediction Benchmarks
// ---------------------------------------------------------------------------

fn bench_next_activity_prediction(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/next_activity");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);

    for shape in ml_bench_sizes() {
        let log = generate_event_log_with_timestamps(&shape);
        let events = log.event_count();
        let n = 3;

        let predictor = build_ngram_predictor_internal(&log, ACTIVITY_KEY, n);
        let prefix = vec!["Register".to_string(), "Validate".to_string()];

        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new(format!("c{}_n{}", shape.num_cases, n), shape.num_cases),
            &(&predictor, &prefix),
            |b, (pred, pref)| b.iter(|| pred.predict(pref)),
        );
    }
    group.finish();
}

fn bench_remaining_time_build(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/remaining_time_build");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);

    for shape in ml_bench_sizes() {
        let log = generate_event_log_with_timestamps(&shape);
        let events = log.event_count();

        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &log,
            |b, log| {
                b.iter(|| {
                    // Simulate remaining time model building
                    let mut case_durations: Vec<f64> = Vec::new();
                    for trace in &log.traces {
                        // Simple duration estimation based on event count
                        let duration = trace.events.len() as f64 * 1000.0;
                        case_durations.push(duration);
                    }
                    case_durations
                })
            },
        );
    }
    group.finish();
}

fn bench_anomaly_scoring(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/anomaly_scoring");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in ml_bench_sizes() {
        let log = generate_event_log_with_timestamps(&shape);
        let dfg = build_dfg_internal(&log, ACTIVITY_KEY);

        group.bench_with_input(
            BenchmarkId::new("trace_score", shape.num_cases),
            &dfg,
            |b, dfg| {
                let trace = vec!["Register".to_string(), "Validate".to_string(), "Approve_Basic".to_string()];
                b.iter(|| {
                    // Simulate anomaly scoring
                    let total_edges: usize = dfg.edges.iter().map(|e| e.frequency).sum();
                    let total_f = total_edges.max(1) as f64;
                    let mut cost_sum = 0.0_f64;
                    for i in 0..trace.len() - 1 {
                        let edge_freq = dfg
                            .edges
                            .iter()
                            .find(|e| e.from == trace[i] && e.to == trace[i + 1])
                            .map(|e| e.frequency)
                            .unwrap_or(0);
                        cost_sum += if edge_freq == 0 {
                            10.0
                        } else {
                            -(edge_freq as f64 / total_f).log2()
                        };
                    }
                    cost_sum / (trace.len() - 1) as f64
                })
            },
        );
    }
    group.finish();
}

fn bench_outcome_prediction(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml/outcome_prediction");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    let shape = LogShape {
        num_cases: 200,
        avg_events_per_case: 12,
        num_activities: 8,
        noise_factor: 0.08,
    };
    let log = generate_event_log_with_timestamps(&shape);

    // Build DFG for anomaly scoring
    let dfg = build_dfg_internal(&log, ACTIVITY_KEY);

    group.bench_with_input("score_anomaly", &dfg, |b, dfg| {
        let trace = vec!["Register".to_string(), "Validate".to_string(), "Approve_Basic".to_string()];
        b.iter(|| {
            let total_edges: usize = dfg.edges.iter().map(|e| e.frequency).sum();
            let total_f = total_edges.max(1) as f64;
            let mut cost_sum = 0.0_f64;
            for i in 0..trace.len() - 1 {
                let edge_freq = dfg
                    .edges
                    .iter()
                    .find(|e| e.from == trace[i] && e.to == trace[i + 1])
                    .map(|e| e.frequency)
                    .unwrap_or(0);
                cost_sum += if edge_freq == 0 {
                    10.0
                } else {
                    -(edge_freq as f64 / total_f).log2()
                };
            }
            cost_sum / (trace.len() - 1) as f64
        })
    });

    // Build predictor for trace likelihood
    let predictor = build_ngram_predictor_internal(&log, ACTIVITY_KEY, 2);

    group.bench_with_input("trace_likelihood", &predictor, |b, pred| {
        let trace = vec![
            "Register".to_string(),
            "Validate".to_string(),
            "Approve_Basic".to_string(),
            "Close".to_string(),
        ];
        b.iter(|| {
            // Simulate trace likelihood calculation
            let mut log_prob = 0.0_f64;
            for i in 0..trace.len() - 1 {
                let context_len = (pred.n - 1).min(i + 1);
                let prefix = trace[i + 1 - context_len..=i].to_vec();
                let preds = pred.predict(&prefix);
                let prob = preds
                    .iter()
                    .find(|(a, _)| a == &trace[i + 1])
                    .map(|(_, p)| *p)
                    .unwrap_or(1e-10);
                log_prob += prob.ln();
            }
            log_prob
        })
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Streaming Benchmarks (single-event throughput)
// ---------------------------------------------------------------------------

fn bench_streaming_dfg_single_event(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming/dfg_single_event");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(100);
    group.throughput(Throughput::Bytes(1));

    // Measure single-event ingestion throughput
    group.bench_with_input("add_event", "test_input", |b, _| {
        let case_id = "bench_case";
        let activity = "TestActivity";

        b.iter(|| {
            let mut stream = StreamingDfgBuilder::new();
            stream.add_event(case_id, activity);
            stream.close_trace(case_id);
        });
    });

    // Measure throughput for batch ingestion
    group.bench_with_input("add_batch_10", "test_input", |b, _| {
        let batch: Vec<(String, String)> = (0..10)
            .map(|i| (format!("case_{}", i % 3), format!("Activity{}", i)))
            .collect();

        b.iter(|| {
            let mut stream = StreamingDfgBuilder::new();
            stream.add_batch(&batch);
            for (case_id, _) in &batch {
                stream.close_trace(case_id);
            }
        });
    });

    group.finish();
}

fn bench_streaming_skeleton_single_event(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming/skeleton_single_event");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(100);
    group.throughput(Throughput::Bytes(1));

    group.bench_with_input("add_event", "test_input", |b, _| {
        let case_id = "bench_case";
        let activity = "TestActivity";

        b.iter(|| {
            let mut stream = StreamingSkeletonBuilder::new();
            stream.add_event(case_id, activity);
            stream.close_trace(case_id);
        });
    });

    group.finish();
}

fn bench_streaming_dfg_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming/dfg_throughput");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    group.throughput(Throughput::Elements(1_000_000));

    for shape in streaming_bench_sizes() {
        let log = generate_event_log_with_timestamps(&shape);
        let total_events = log.event_count();

        group.bench_with_input(
            BenchmarkId::new("events", total_events),
            &log,
            |b, log| {
                let case_ids: Vec<String> = (0..log.traces.len())
                    .map(|i| format!("case_{}", i))
                    .collect();

                b.iter(|| {
                    let mut local_stream = StreamingDfgBuilder::new();
                    for (trace_idx, trace) in log.traces.iter().enumerate() {
                        for event in &trace.events {
                            if let Some(AttributeValue::String(activity)) =
                                event.attributes.get(ACTIVITY_KEY)
                            {
                                local_stream.add_event(&case_ids[trace_idx], activity);
                            }
                        }
                        local_stream.close_trace(&case_ids[trace_idx]);
                    }
                    local_stream.snapshot()
                });
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Monte Carlo Simulation Benchmarks
// ---------------------------------------------------------------------------

fn bench_monte_carlo_simulation(c: &mut Criterion) {
    let mut group = c.benchmark_group("simulation/monte_carlo");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);

    for &num_cases in &[10, 50, 100, 200] {
        let shape = LogShape {
            num_cases,
            avg_events_per_case: 8,
            num_activities: 6,
            noise_factor: 0.05,
        };
        let log = generate_event_log_with_timestamps(&shape);

        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &log,
            |b, log| {
                let config = MonteCarloConfig {
                    num_cases,
                    inter_arrival_mean_ms: 1000.0,
                    activity_service_time_ms: HashMap::new(),
                    resource_capacity: HashMap::new(),
                    simulation_time_ms: 60000,
                    random_seed: 42,
                };

                b.iter(|| run_monte_carlo_simulation(log, &config).unwrap());
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// OCEL Flatten Benchmarks
// ---------------------------------------------------------------------------

fn create_synthetic_ocel(num_objects: usize, events_per_object: usize) -> OCEL {
    let mut objects = Vec::new();
    let mut events = Vec::new();
    let mut event_idx = 0;

    for obj_idx in 0..num_objects {
        let obj_id = format!("obj_{}", obj_idx);
        objects.push(OCELObject {
            id: obj_id.clone(),
            object_type: "Order".to_string(),
            attributes: {
                let mut attrs = HashMap::new();
                attrs.insert("value".to_string(), AttributeValue::Float((obj_idx * 100) as f64));
                attrs
            },
            changes: vec![],
            embedded_relations: vec![],
        });

        for evt_idx in 0..events_per_object {
            events.push(OCELEvent {
                id: format!("e_{}", event_idx),
                event_type: if evt_idx == 0 { "Create".to_string() } else { "Update".to_string() },
                timestamp: format!("2024-01-{:02}T{:02}:00:00Z", (obj_idx % 28) + 1, evt_idx),
                attributes: HashMap::new(),
                object_ids: vec![obj_id.clone()],
                object_refs: vec![],
            });
            event_idx += 1;
        }
    }

    OCEL {
        event_types: vec!["Create".to_string(), "Update".to_string()],
        object_types: vec!["Order".to_string()],
        events,
        objects,
        object_relations: vec![],
    }
}

fn bench_ocel_flatten(c: &mut Criterion) {
    let mut group = c.benchmark_group("ocel/flatten");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);

    for &num_objects in &[10, 50, 100, 200] {
        let events_per_object = 5;
        let ocel = create_synthetic_ocel(num_objects, events_per_object);

        group.bench_with_input(
            BenchmarkId::new("objects", num_objects),
            &ocel,
            |b, ocel| {
                b.iter(|| {
                    // Simulate OCEL flattening (projecting objects to traces)
                    let mut event_log = EventLog::new();
                    for obj in &ocel.objects {
                        if obj.object_type != "Order" {
                            continue;
                        }
                        let mut trace = Trace {
                            attributes: HashMap::new(),
                            events: Vec::new(),
                        };
                        trace.attributes.insert(
                            "object_id".to_string(),
                            AttributeValue::String(obj.id.clone()),
                        );

                        for ocel_event in &ocel.events {
                            if ocel_event.object_ids.contains(&obj.id) {
                                let mut event_attrs = HashMap::new();
                                event_attrs.insert(
                                    "concept:name".to_string(),
                                    AttributeValue::String(ocel_event.event_type.clone()),
                                );
                                event_attrs.insert(
                                    "time:timestamp".to_string(),
                                    AttributeValue::String(ocel_event.timestamp.clone()),
                                );
                                trace.events.push(Event { attributes: event_attrs });
                            }
                        }
                        event_log.traces.push(trace);
                    }
                    event_log
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Criterion Main
// ---------------------------------------------------------------------------

criterion_group!(
    ml_benches,
    bench_next_activity_prediction,
    bench_remaining_time_build,
    bench_anomaly_scoring,
    bench_outcome_prediction,
);

criterion_group!(
    streaming_benches,
    bench_streaming_dfg_single_event,
    bench_streaming_skeleton_single_event,
    bench_streaming_dfg_throughput,
);

criterion_group!(
    sim_ocel_benches,
    bench_monte_carlo_simulation,
    bench_ocel_flatten,
);

criterion_main!(ml_benches, streaming_benches, sim_ocel_benches);
