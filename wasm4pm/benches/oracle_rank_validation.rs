/// Criterion benchmarks for oracle-rank validation infrastructure.
///
/// These benchmarks measure how long the "anti-lie" oracle checks themselves
/// take.  This is important for CI budget planning: oracle checks run on every
/// merge and must stay below acceptable time bounds.
///
/// Four oracle operations are measured, all using the smallest bench_sizes()
/// entry (100-event log):
///   1. `dfg_edge_map_comparison`     — build HashMap<(from,to),freq> for both
///                                       batch and streaming DFGs and compare
///   2. `jaccard_distance`            — Jaccard distance on two edge key sets
///   3. `fitness_token_replay`        — token_replay_pure on a simple Petri net
///   4. `heuristic_threshold_sweep`   — heuristic miner at 4 thresholds
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use rustc_hash::FxHashMap;
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use wasm4pm::advanced_algorithms::discover_heuristic_miner;
use wasm4pm::conformance::token_replay_pure;
use wasm4pm::models::{
    AttributeValue, ColumnarLog, DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation, Event,
    EventLog, PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition, Trace,
};
use wasm4pm::streaming::{StreamingAlgorithm, StreamingDfgBuilder};

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, generate_event_log, make_handle, ACTIVITY_KEY};

// ---------------------------------------------------------------------------
// Oracle helpers (mirrors what the tests do)
// ---------------------------------------------------------------------------

/// Build an edge map from a DFG.
fn edges_to_map(dfg: &DirectlyFollowsGraph) -> HashMap<(String, String), usize> {
    dfg.edges
        .iter()
        .map(|e| ((e.from.clone(), e.to.clone()), e.frequency))
        .collect()
}

/// Compute Jaccard distance between two edge key sets.
/// Jaccard(A, B) = |A ∩ B| / |A ∪ B|; distance = 1 - similarity.
fn jaccard_distance(
    a: &HashMap<(String, String), usize>,
    b: &HashMap<(String, String), usize>,
) -> f64 {
    let a_keys: HashSet<_> = a.keys().collect();
    let b_keys: HashSet<_> = b.keys().collect();
    let intersection = a_keys.intersection(&b_keys).count();
    let union = a_keys.union(&b_keys).count();
    if union == 0 {
        return 0.0;
    }
    1.0 - (intersection as f64 / union as f64)
}

/// Build a streaming DFG from an EventLog (scalar streaming path).
fn streaming_dfg(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
    let mut builder = StreamingDfgBuilder::new();
    for (idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("c{}", idx);
        for event in &trace.events {
            if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                builder.add_event(&case_id, act);
            }
        }
        builder.close_trace(&case_id);
    }
    builder.snapshot()
}

/// Compute a batch DFG directly from an EventLog using the columnar approach
/// (pure-Rust path — same as streaming_batch_equivalence_tests.rs oracle).
fn batch_dfg(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut dfg = DirectlyFollowsGraph::new();

    dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
        id: act.to_owned(),
        label: act.to_owned(),
        frequency: 0,
    }));

    let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        if start >= end {
            continue;
        }
        for &id in &col.events[start..end] {
            dfg.nodes[id as usize].frequency += 1;
        }
        for i in start..end - 1 {
            *edge_counts
                .entry((col.events[i], col.events[i + 1]))
                .or_insert(0) += 1;
        }
        *dfg.start_activities
            .entry(col.vocab[col.events[start] as usize].to_owned())
            .or_insert(0) += 1;
        *dfg.end_activities
            .entry(col.vocab[col.events[end - 1] as usize].to_owned())
            .or_insert(0) += 1;
    }

    dfg.edges.extend(
        edge_counts
            .into_iter()
            .map(|((f, t), freq)| DirectlyFollowsRelation {
                from: col.vocab[f as usize].to_owned(),
                to: col.vocab[t as usize].to_owned(),
                frequency: freq,
            }),
    );

    dfg
}

/// Build a minimal Petri net for a straight-line trace of `activities`.
/// Field names match the actual `PetriNet` / `PetriNetPlace` / `PetriNetTransition`
/// structs: `marking: Option<usize>`, `is_invisible: Option<bool>`, no `id` on PetriNet.
fn make_linear_petri_net(activities: &[&str]) -> PetriNet {
    let num_places = activities.len() + 1;
    let mut net = PetriNet::new();

    // Build places
    for i in 0..num_places {
        net.places.push(PetriNetPlace {
            id: format!("p{}", i),
            label: format!("p{}", i),
            marking: if i == 0 { Some(1) } else { None },
        });
    }

    // Build transitions + arcs
    for (i, &act) in activities.iter().enumerate() {
        let tid = format!("t{}", i);
        net.transitions.push(PetriNetTransition {
            id: tid.clone(),
            label: act.to_string(),
            is_invisible: None,
        });
        net.arcs.push(PetriNetArc {
            from: format!("p{}", i),
            to: tid.clone(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: tid,
            to: format!("p{}", i + 1),
            weight: Some(1),
        });
    }

    // initial_marking: one token in p0
    net.initial_marking.insert("p0".to_string(), 1);

    // final_markings: one token in the last place
    let last_place = format!("p{}", num_places - 1);
    let mut final_mark = HashMap::new();
    final_mark.insert(last_place, 1usize);
    net.final_markings.push(final_mark);

    net
}

/// Build a conforming EventLog for the linear Petri net.
fn make_conforming_log(activities: &[&str], num_traces: usize) -> EventLog {
    let mut log = EventLog::new();
    for case_idx in 0..num_traces {
        let mut trace = Trace {
            attributes: {
                let mut m = HashMap::new();
                m.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(format!("case{}", case_idx)),
                );
                m
            },
            events: Vec::new(),
        };
        for (i, &act) in activities.iter().enumerate() {
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", i)),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

// ---------------------------------------------------------------------------
// Group 1: DFG edge map construction + comparison
// ---------------------------------------------------------------------------

fn bench_dfg_edge_map_comparison(c: &mut Criterion) {
    let mut group = c.benchmark_group("oracle_rank/dfg_edge_map_comparison");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    // Only use the smallest size — oracle cost benchmarks are about overhead, not scalability
    let shape = bench_sizes().remove(0);
    let log = generate_event_log(&shape);
    let events = log.event_count();

    group.throughput(Throughput::Elements(events as u64));
    group.bench_with_input(BenchmarkId::new("cases", shape.num_cases), &log, |b, l| {
        b.iter(|| {
            // Build two edge maps and compare — this is exactly what the oracle does
            let batch = batch_dfg(l, ACTIVITY_KEY);
            let streaming = streaming_dfg(l, ACTIVITY_KEY);
            let batch_map = edges_to_map(&batch);
            let streaming_map = edges_to_map(&streaming);
            let _equal = batch_map == streaming_map;
            batch_map.len() + streaming_map.len()
        })
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 2: Jaccard distance computation
// ---------------------------------------------------------------------------

fn bench_jaccard_distance(c: &mut Criterion) {
    let mut group = c.benchmark_group("oracle_rank/jaccard_distance");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let shape = bench_sizes().remove(0);
    let log = generate_event_log(&shape);
    let events = log.event_count();

    // Pre-compute two edge maps (same log, two different algorithms — simulates
    // comparing algorithm results as the oracle does)
    let map_a = edges_to_map(&batch_dfg(&log, ACTIVITY_KEY));
    // Perturb by dropping every other edge (simulates a different algorithm output)
    let map_b: HashMap<(String, String), usize> = map_a
        .iter()
        .enumerate()
        .filter(|(i, _)| i % 2 == 0)
        .map(|(_, (k, v))| (k.clone(), *v))
        .collect();

    group.throughput(Throughput::Elements(events as u64));
    group.bench_with_input(
        BenchmarkId::new("cases", shape.num_cases),
        &(map_a, map_b),
        |b, (a, b_map)| b.iter(|| jaccard_distance(a, b_map)),
    );
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 3: Token replay fitness (token_replay_pure)
// ---------------------------------------------------------------------------

fn bench_fitness_token_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("oracle_rank/fitness_token_replay");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let activities = ["Register", "Validate", "Approve", "Archive"];
    let log = make_conforming_log(&activities, 100);
    let net = make_linear_petri_net(&activities);
    let events = log.event_count();

    group.throughput(Throughput::Elements(events as u64));
    group.bench_function("replay_100_traces", |b| {
        b.iter(|| token_replay_pure(&log, &net, ACTIVITY_KEY))
    });
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 4: Heuristic miner threshold sweep (4 thresholds — adversarial suite)
// ---------------------------------------------------------------------------

fn bench_heuristic_threshold_sweep(c: &mut Criterion) {
    let mut group = c.benchmark_group("oracle_rank/heuristic_threshold_sweep");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let shape = bench_sizes().remove(0);
    let (handle, events) = make_handle(&shape);

    group.throughput(Throughput::Elements(events as u64));

    // Four thresholds used in the adversarial test suite
    for &threshold in &[0.2f64, 0.4, 0.6, 0.8] {
        group.bench_with_input(
            BenchmarkId::new("threshold", format!("{:.1}", threshold)),
            &handle,
            |b, h| b.iter(|| discover_heuristic_miner(h, ACTIVITY_KEY, threshold).unwrap()),
        );
    }
    group.finish();
}

criterion_group!(
    oracle_rank_benches,
    bench_dfg_edge_map_comparison,
    bench_jaccard_distance,
    bench_fitness_token_replay,
    bench_heuristic_threshold_sweep,
);
criterion_main!(oracle_rank_benches);
