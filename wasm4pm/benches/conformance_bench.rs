//! Criterion benchmarks for conformance checking algorithms.
//!
//! Benchmarks conformance checking approaches:
//! - Token-based replay (standard)
//! - SIMD-accelerated token replay
//! - ETConformance precision
//! - DECLARE constraint checking
//! - Temporal profile discovery/conformance
//!
//! Note: A* alignment is excluded from this benchmark because it's computationally
//! expensive (O(b^d) worst case) and the internal function is private.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::models::*;
use pictl::state::{get_or_init_state, StoredObject};
use std::collections::HashMap;
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{generate_event_log, LogShape, ACTIVITY_KEY};

// Internal modules for benchmarking
use pictl::conformance;
use pictl::etconformance_precision;
use pictl::simd_token_replay::SimdPetriNet;

// ---------------------------------------------------------------------------
// Synthetic Petri Net Builders
// ---------------------------------------------------------------------------

/// Build a simple sequential Petri net: A -> B -> C -> D
fn build_sequential_net() -> PetriNet {
    let mut net = PetriNet::new();
    // Places
    net.places.push(PetriNetPlace {
        id: "p_start".into(),
        label: "p_start".into(),
        marking: Some(1),
    });
    net.places.push(PetriNetPlace {
        id: "p1".into(),
        label: "p1".into(),
        marking: None,
    });
    net.places.push(PetriNetPlace {
        id: "p2".into(),
        label: "p2".into(),
        marking: None,
    });
    net.places.push(PetriNetPlace {
        id: "p3".into(),
        label: "p3".into(),
        marking: None,
    });
    net.places.push(PetriNetPlace {
        id: "p_end".into(),
        label: "p_end".into(),
        marking: None,
    });

    // Transitions
    for (_i, label) in ["A", "B", "C", "D"].iter().enumerate() {
        net.transitions.push(PetriNetTransition {
            id: format!("t_{}", label.to_lowercase()),
            label: label.to_string(),
            is_invisible: Some(false),
        });
    }

    // Arcs: p_start -> t_a -> p1 -> t_b -> p2 -> t_c -> p3 -> t_d -> p_end
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

    // Initial marking
    net.initial_marking.insert("p_start".to_string(), 1);

    // Final marking
    let mut final_marking = HashMap::new();
    final_marking.insert("p_end".to_string(), 1);
    net.final_markings.push(final_marking);

    net
}

/// Build a parallel Petri net: A -> (B || C) -> D
fn build_parallel_net() -> PetriNet {
    let mut net = PetriNet::new();

    // Places
    for name in ["p_start", "p_split", "p_b", "p_c", "p_join", "p_end"] {
        net.places.push(PetriNetPlace {
            id: name.to_string(),
            label: name.to_string(),
            marking: if name == "p_start" { Some(1) } else { None },
        });
    }

    // Transitions
    for label in ["A", "B", "C", "D"] {
        net.transitions.push(PetriNetTransition {
            id: format!("t_{}", label.to_lowercase()),
            label: label.to_string(),
            is_invisible: Some(false),
        });
    }

    // Arcs for parallel structure
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

/// Build a DECLARE model with Response constraints
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
        activities: vec!["A".to_string(), "B".to_string(), "C".to_string(), "D".to_string()],
    }
}

// ---------------------------------------------------------------------------
// Token Replay Benchmark (standard)
// ---------------------------------------------------------------------------

fn bench_token_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("conformance/token_replay");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(30);

    let net = build_sequential_net();
    let net_handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(net))
        .expect("store PetriNet failed");

    for num_cases in [100, 500, 1_000, 5_000] {
        let shape = LogShape {
            num_cases,
            avg_events_per_case: 12,
            num_activities: 4,
            noise_factor: 0.1,
        };
        let log = generate_event_log(&shape);
        let log_handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .expect("store EventLog failed");

        group.throughput(Throughput::Elements(
            (num_cases * shape.avg_events_per_case) as u64,
        ));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &log_handle,
            |b, h| {
                b.iter(|| {
                    black_box(conformance::check_token_based_replay(
                        h,
                        &net_handle,
                        ACTIVITY_KEY,
                    ))
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// SIMD Token Replay Benchmark
// ---------------------------------------------------------------------------

fn bench_simd_token_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("conformance/simd_token_replay");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
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
        // Add sequential edges
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
                if let Some(activity) = event.attributes.get(ACTIVITY_KEY).and_then(|v| v.as_string()) {
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
            |b, (acts, offsets)| {
                // Build trace slices with stable references
                let mut traces: Vec<Vec<&str>> = Vec::new();
                for i in 0..offsets.len() - 1 {
                    let start = offsets[i];
                    let end = offsets[i + 1];
                    let trace_activities: Vec<&str> = acts[start..end]
                        .iter()
                        .map(|s| s.as_ref())
                        .collect();
                    traces.push(trace_activities);
                }
                b.iter(|| black_box(net.replay_log(black_box(&traces))));
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// ETConformance Precision Benchmark
// ---------------------------------------------------------------------------

fn bench_etconformance_precision(c: &mut Criterion) {
    let mut group = c.benchmark_group("conformance/etconformance_precision");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(30);

    let net = build_sequential_net();
    let initial_marking: HashMap<String, usize> = net
        .places
        .iter()
        .filter_map(|p| p.marking.map(|m| (p.id.clone(), m)))
        .collect();
    let final_marking: HashMap<String, usize> =
        net.final_markings.first().cloned().unwrap_or_default();

    for num_cases in [100, 500, 1_000, 5_000] {
        let shape = LogShape {
            num_cases,
            avg_events_per_case: 12,
            num_activities: 4,
            noise_factor: 0.1,
        };
        let log = generate_event_log(&shape);

        group.throughput(Throughput::Elements(
            (num_cases * shape.avg_events_per_case) as u64,
        ));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &log,
            |b, log| {
                b.iter(|| {
                    black_box(etconformance_precision::compute_precision(
                        &net,
                        &initial_marking,
                        &final_marking,
                        log,
                        ACTIVITY_KEY,
                    ))
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// DECLARE Conformance Benchmark
// ---------------------------------------------------------------------------

fn bench_declare_conformance(c: &mut Criterion) {
    let mut group = c.benchmark_group("conformance/declare");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
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

        // Build trace activities once - collect owned strings, then convert to &str slices
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

        // Convert to &str slices for benchmark
        let traces: Vec<Vec<&str>> = traces_owned
            .iter()
            .map(|t| t.iter().map(|s| s.as_str()).collect())
            .collect();

        group.throughput(Throughput::Elements(
            (num_cases * shape.avg_events_per_case) as u64,
        ));
        group.bench_with_input(
            BenchmarkId::new("cases", num_cases),
            &traces,
            |b, traces| {
                b.iter(|| {
                    // Inline DECLARE checking logic for benchmark
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

                    black_box(violations)
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Temporal Profile Benchmark
// ---------------------------------------------------------------------------

fn bench_temporal_profile(c: &mut Criterion) {
    let mut group = c.benchmark_group("conformance/temporal_profile");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(30);

    for num_cases in [100, 500, 1_000, 5_000] {
        let shape = LogShape {
            num_cases,
            avg_events_per_case: 12,
            num_activities: 4,
            noise_factor: 0.1,
        };
        let log = generate_event_log(&shape);

        // Build trace activities as string slices for temporal profile
        let traces_str: Vec<Vec<String>> = log
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

        group.throughput(Throughput::Elements(
            (num_cases * shape.avg_events_per_case) as u64,
        ));
        group.bench_with_input(
            BenchmarkId::new("discovery/cases", num_cases),
            &traces_str,
            |b, traces| {
                b.iter(|| {
                    // Inline temporal profile discovery
                    let mut acc: std::collections::HashMap<(String, String), (f64, f64, usize)> =
                        std::collections::HashMap::new();

                    for trace in traces {
                        for i in 0..trace.len().saturating_sub(1) {
                            // Use fixed time difference (100ms per step)
                            let dur = 100.0_f64;
                            let key = (trace[i].clone(), trace[i + 1].clone());
                            let e = acc.entry(key).or_insert((0.0, 0.0, 0));
                            e.0 += dur;
                            e.1 += dur * dur;
                            e.2 += 1;
                        }
                    }

                    black_box(acc)
                })
            },
        );
    }

    // Benchmark temporal conformance checking
    let shape = LogShape {
        num_cases: 1_000,
        avg_events_per_case: 12,
        num_activities: 4,
        noise_factor: 0.1,
    };
    let log = generate_event_log(&shape);

    // Build traces with timestamps
    let traces_str: Vec<Vec<String>> = log
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

    // Build a simple profile (mean=100ms, stdev=10ms for all pairs)
    let mut profile_map: std::collections::HashMap<(String, String), (f64, f64, usize)> =
        std::collections::HashMap::new();
    profile_map.insert(("A".to_string(), "B".to_string()), (100.0, 10.0, 100));
    profile_map.insert(("B".to_string(), "C".to_string()), (100.0, 10.0, 100));
    profile_map.insert(("C".to_string(), "D".to_string()), (100.0, 10.0, 100));

    group.bench_function("checking/1000_cases", |b| {
        b.iter(|| {
            let mut total_steps = 0usize;
            let mut total_deviations = 0usize;
            let zeta = 2.0_f64;

            for trace in &traces_str {
                for i in 0..trace.len().saturating_sub(1) {
                    total_steps += 1;
                    let key: (String, String) = (trace[i].clone(), trace[i + 1].clone());
                    if let Some(&(mean, stdev, _)) = profile_map.get(&key) {
                        // Use fixed dur = 100ms (should match profile mean)
                        let dur = 100.0_f64;
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

            black_box((total_steps, total_deviations))
        })
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Criterion Groups
// ---------------------------------------------------------------------------

criterion_group!(
    conformance_benches,
    bench_token_replay,
    bench_simd_token_replay,
    bench_etconformance_precision,
    bench_declare_conformance,
    bench_temporal_profile,
);
criterion_main!(conformance_benches);
