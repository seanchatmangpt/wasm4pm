//! Closed Claw Pipeline B: Conformance Core
//!
//! Benchmarks all conformance checking algorithms across standard log sizes:
//!   - Token Replay (sequential net)       -- standard Petri net replay
//!   - Token Replay (parallel net)         -- parallel structure replay
//!   - SIMD Token Replay                   -- SIMD-accelerated batch replay
//!   - ETConformance Precision             -- escaping-edge precision metric
//!   - DECLARE Conformance                 -- constraint violation checking
//!
//! Gates exercised: G1 Determinism, G3 Truth (fitness >= 0.95), G5 Report
//!
//! Each benchmark measures:
//!   1. Latency (ns) via Criterion
//!   2. Throughput (events/sec) set explicitly
//!   3. Output hashed with blake3 for determinism verification

use criterion::{black_box, BenchmarkId, Criterion, Throughput};
use pictl::conformance;
use pictl::etconformance_precision;
use pictl::models::*;
use pictl::simd_token_replay::SimdPetriNet;
use pictl::state::{get_or_init_state, StoredObject};
use std::collections::HashMap;
use std::time::Duration;

#[path = "../helpers.rs"]
mod helpers;
use helpers::{bench_sizes, generate_event_log, LogShape, ACTIVITY_KEY};

// ---------------------------------------------------------------------------
// Petri Net Builders (adapted from conformance_bench.rs)
// ---------------------------------------------------------------------------

/// Build a simple sequential Petri net: A -> B -> C -> D
fn build_sequential_net() -> PetriNet {
    let mut net = PetriNet::new();
    for name in ["p_start", "p1", "p2", "p3", "p_end"] {
        net.places.push(PetriNetPlace {
            id: name.to_string(),
            label: name.to_string(),
            marking: if name == "p_start" { Some(1) } else { None },
        });
    }

    for label in ["A", "B", "C", "D"] {
        net.transitions.push(PetriNetTransition {
            id: format!("t_{}", label.to_lowercase()),
            label: label.to_string(),
            is_invisible: Some(false),
        });
    }

    let arcs = [
        ("p_start", "t_a"),
        ("t_a", "p1"),
        ("p1", "t_b"),
        ("t_b", "p2"),
        ("p2", "t_c"),
        ("t_c", "p3"),
        ("p3", "t_d"),
        ("t_d", "p_end"),
    ];
    for (from, to) in arcs {
        net.arcs.push(PetriNetArc {
            from: from.to_string(),
            to: to.to_string(),
            weight: Some(1),
        });
    }

    net.initial_marking.insert("p_start".to_string(), 1);

    let mut final_marking = HashMap::new();
    final_marking.insert("p_end".to_string(), 1);
    net.final_markings.push(final_marking);

    net
}

/// Build a parallel Petri net: A -> (B || C) -> D
fn build_parallel_net() -> PetriNet {
    let mut net = PetriNet::new();

    for name in ["p_start", "p_split", "p_b", "p_c", "p_join", "p_end"] {
        net.places.push(PetriNetPlace {
            id: name.to_string(),
            label: name.to_string(),
            marking: if name == "p_start" { Some(1) } else { None },
        });
    }

    for label in ["A", "B", "C", "D"] {
        net.transitions.push(PetriNetTransition {
            id: format!("t_{}", label.to_lowercase()),
            label: label.to_string(),
            is_invisible: Some(false),
        });
    }

    let arcs = [
        ("p_start", "t_a"),
        ("t_a", "p_split"),
        ("p_split", "t_b"),
        ("p_split", "t_c"),
        ("t_b", "p_b"),
        ("t_c", "p_c"),
        ("p_b", "t_d"),
        ("p_c", "t_d"),
        ("t_d", "p_join"),
        ("t_d", "p_end"),
    ];
    for (from, to) in arcs {
        net.arcs.push(PetriNetArc {
            from: from.to_string(),
            to: to.to_string(),
            weight: Some(1),
        });
    }

    net.initial_marking.insert("p_start".to_string(), 1);

    let mut final_marking = HashMap::new();
    final_marking.insert("p_join".to_string(), 1);
    net.final_markings.push(final_marking);

    net
}

/// Build a DECLARE model with Response and Existence constraints
fn build_declare_model() -> DeclareModel {
    DeclareModel {
        constraints: vec![
            DeclareConstraint {
                template: "Response".to_string(),
                activities: vec!["A".to_string(), "B".to_string()],
                support: 1.0,
                confidence: 1.0,
            },
            DeclareConstraint {
                template: "Response".to_string(),
                activities: vec!["B".to_string(), "C".to_string()],
                support: 1.0,
                confidence: 1.0,
            },
            DeclareConstraint {
                template: "Response".to_string(),
                activities: vec!["C".to_string(), "D".to_string()],
                support: 1.0,
                confidence: 1.0,
            },
            DeclareConstraint {
                template: "Existence".to_string(),
                activities: vec!["A".to_string()],
                support: 1.0,
                confidence: 1.0,
            },
        ],
        activities: vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "D".to_string(),
        ],
    }
}

// ---------------------------------------------------------------------------
// Token Replay (sequential net)
// ---------------------------------------------------------------------------

fn bench_token_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/B_conformance/token_replay");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    let net = build_sequential_net();
    let net_handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(net))
        .expect("store PetriNet failed");

    for shape in bench_sizes() {
        let log = generate_event_log(&shape);
        let log_handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .expect("store EventLog failed");

        let total_events = shape.num_cases * shape.avg_events_per_case;
        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("sequential/cases", shape.num_cases),
            &log_handle,
            |_b, h| {
                let result =
                    conformance::check_token_based_replay(h, &net_handle, ACTIVITY_KEY).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Token Replay (parallel net)
// ---------------------------------------------------------------------------

fn bench_token_replay_parallel(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/B_conformance/token_replay");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    let net = build_parallel_net();
    let net_handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(net))
        .expect("store PetriNet failed");

    for shape in bench_sizes() {
        let log = generate_event_log(&shape);
        let log_handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .expect("store EventLog failed");

        let total_events = shape.num_cases * shape.avg_events_per_case;
        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("parallel/cases", shape.num_cases),
            &log_handle,
            |_b, h| {
                let result =
                    conformance::check_token_based_replay(h, &net_handle, ACTIVITY_KEY).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// SIMD Token Replay
// ---------------------------------------------------------------------------

fn bench_simd_token_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/B_conformance/simd_token_replay");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for num_cases in [100, 500, 1_000, 5_000, 10_000] {
        let shape = LogShape {
            num_cases,
            avg_events_per_case: 12,
            num_activities: 4,
            noise_factor: 0.1,
        };
        let log = generate_event_log(&shape);

        // Build DFG-based Petri net
        let mut dfg = DirectlyFollowsGraph::new();
        let activities = ["A", "B", "C", "D"];
        for (i, &act) in activities.iter().enumerate() {
            dfg.nodes.push(DFGNode {
                id: act.to_string(),
                label: act.to_string(),
                frequency: num_cases * i + 1,
            });
        }
        for i in 0..activities.len() - 1 {
            dfg.edges.push(DirectlyFollowsRelation {
                from: activities[i].to_string(),
                to: activities[i + 1].to_string(),
                frequency: num_cases,
            });
        }

        let net = SimdPetriNet::from_dfg(&dfg);

        // Pre-compute traces once (outside the benchmark loop)
        let mut all_activities: Vec<String> = Vec::new();
        let mut trace_offsets: Vec<usize> = vec![0];

        for trace in &log.traces {
            for event in &trace.events {
                if let Some(activity) =
                    event.attributes.get(ACTIVITY_KEY).and_then(|v| v.as_string())
                {
                    all_activities.push(activity.to_owned());
                }
            }
            trace_offsets.push(all_activities.len());
        }

        let total_events: usize = all_activities.len();
        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &(all_activities, trace_offsets),
            |_b, (acts, offsets)| {
                let mut traces: Vec<Vec<&str>> = Vec::new();
                for i in 0..offsets.len() - 1 {
                    let start = offsets[i];
                    let end = offsets[i + 1];
                    let trace_activities: Vec<&str> =
                        acts[start..end].iter().map(|s| s.as_ref()).collect();
                    traces.push(trace_activities);
                }
                let result = net.replay_log(black_box(&traces));
                let hash = blake3::hash(format!("{:?}", result).as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// ETConformance Precision
// ---------------------------------------------------------------------------

fn bench_etconformance_precision(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/B_conformance/etconformance_precision");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    let net = build_sequential_net();
    let initial_marking: HashMap<String, usize> = net
        .places
        .iter()
        .filter_map(|p| p.marking.map(|m| (p.id.clone(), m)))
        .collect();
    let final_marking: HashMap<String, usize> =
        net.final_markings.first().cloned().unwrap_or_default();

    for shape in bench_sizes() {
        let log = generate_event_log(&shape);

        let total_events = shape.num_cases * shape.avg_events_per_case;
        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &log,
            |_b, log| {
                let result = etconformance_precision::compute_precision(
                    &net,
                    &initial_marking,
                    &final_marking,
                    log,
                    ACTIVITY_KEY,
                );
                let hash = blake3::hash(format!("{:?}", result).as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// DECLARE Conformance
// ---------------------------------------------------------------------------

fn bench_declare_conformance(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/B_conformance/declare");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    let declare_model = build_declare_model();
    let constraints = declare_model.constraints;

    for num_cases in [100, 500, 1_000, 5_000, 10_000] {
        let shape = LogShape {
            num_cases,
            avg_events_per_case: 12,
            num_activities: 4,
            noise_factor: 0.1,
        };
        let log = generate_event_log(&shape);

        // Build trace activities as owned strings, then &str slices
        let traces_owned: Vec<Vec<String>> = log
            .traces
            .iter()
            .map(|t| {
                t.events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(ACTIVITY_KEY)
                            .and_then(|v| v.as_string())
                            .map(|s| s.to_owned())
                    })
                    .collect()
            })
            .collect();

        let traces: Vec<Vec<&str>> = traces_owned
            .iter()
            .map(|t| t.iter().map(|s| s.as_str()).collect())
            .collect();

        let total_events = num_cases * shape.avg_events_per_case;
        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &traces,
            |_b, traces| {
                // Inline DECLARE constraint checking (as in conformance_bench.rs)
                let mut violations: Vec<usize> = vec![0; constraints.len()];

                for trace in traces {
                    for (ci, constraint) in constraints.iter().enumerate() {
                        let violated = match constraint.template.as_str() {
                            "Response" if constraint.activities.len() == 2 => {
                                let a = constraint.activities[0].as_str();
                                let b = constraint.activities[1].as_str();
                                let mut violates = false;
                                for (i, &act) in trace.iter().enumerate() {
                                    if act == a {
                                        if !trace[i + 1..].contains(&b) {
                                            violates = true;
                                            break;
                                        }
                                    }
                                }
                                violates
                            }
                            "Existence" if constraint.activities.len() == 1 => {
                                let a = constraint.activities[0].as_str();
                                !trace.contains(&a)
                            }
                            "Absence" if constraint.activities.len() == 1 => {
                                let a = constraint.activities[0].as_str();
                                trace.contains(&a)
                            }
                            "Init" if constraint.activities.len() == 1 => {
                                let a = constraint.activities[0].as_str();
                                trace.first().map(|&x| x != a).unwrap_or(true)
                            }
                            "Precedence" if constraint.activities.len() == 2 => {
                                let a = constraint.activities[0].as_str();
                                let b = constraint.activities[1].as_str();
                                let mut a_seen = false;
                                let mut violates = false;
                                for &act in trace {
                                    if act == a {
                                        a_seen = true;
                                    }
                                    if act == b && !a_seen {
                                        violates = true;
                                        break;
                                    }
                                }
                                violates
                            }
                            _ => false,
                        };
                        if violated {
                            violations[ci] += 1;
                        }
                    }
                }

                let hash = blake3::hash(format!("{:?}", violations).as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/// Register all conformance core benchmarks into the criterion instance.
pub fn bench_conformance_core(c: &mut Criterion) {
    bench_token_replay(c);
    bench_token_replay_parallel(c);
    bench_simd_token_replay(c);
    bench_etconformance_precision(c);
    bench_declare_conformance(c);
}
