//! Native Rust API benchmarks — direct `_from_log` calls, no WASM boundary.
//!
//! Use this when wasm4pm is a Rust library dependency. These numbers reflect
//! pure algorithm cost: no handle lookup, no JSON serialization, no JS interop.
//!
//! Datasets (bench_data/ relative to workspace root):
//!   bpi2020_travel.xes       — 7,065 cases, ~87K events (travel permits)
//!   roadtraffic100traces.xes — 100 cases,   ~1.3K events (road traffic fines)

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::{collections::BTreeMap, fs, path::Path, time::Duration};
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::batches::discover_batches;
use wasm4pm::correlation_miner::{mine_correlation, CorrelationConfig};
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::fast_discovery::{discover_astar_from_log, discover_hill_climbing_from_log};
use wasm4pm::genetic_discovery::{
    discover_aco_algorithm_from_log, discover_genetic_algorithm_from_log,
    discover_pso_algorithm_from_log,
};
use wasm4pm::ilp_discovery::{discover_ilp_petri_net_from_log, discover_optimized_dfg_from_log};
use wasm4pm::log_to_trie::discover_prefix_tree_inner;
use wasm4pm::models::{AdmittedEventLog, AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::{
    discover_inductive_miner_from_log, discover_simulated_annealing_from_log,
};
use wasm4pm::transition_system::discover_transition_system;

const ACTIVITY_KEY: &str = "concept:name";
const TIMESTAMP_KEY: &str = "time:timestamp";

fn make_admitted(log: EventLog) -> AdmittedEventLog<()> {
    wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence()
}

// ---------------------------------------------------------------------------
// XES parser
// ---------------------------------------------------------------------------

fn extract_attr(line: &str, key: &str) -> Option<String> {
    let needle = format!("{}=\"", key);
    let start = line.find(&needle)? + needle.len();
    let end = line[start..].find('"')? + start;
    Some(line[start..end].to_string())
}

fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let t = line.trim();
        if t.starts_with("<trace") {
            current_trace = Some(Trace {
                attributes: BTreeMap::new(),
                events: Vec::new(),
            });
        }
        if t.starts_with("</trace>") {
            if let Some(tr) = current_trace.take() {
                log.traces.push(tr);
            }
        }
        if t.starts_with("<event") {
            current_event = Some(Event {
                attributes: BTreeMap::new(),
            });
        }
        if t.starts_with("</event>") {
            if let Some(ev) = current_event.take() {
                if let Some(ref mut tr) = current_trace {
                    tr.events.push(ev);
                }
            }
        }
        if t.starts_with("<string") {
            if let (Some(k), Some(v)) = (extract_attr(t, "key"), extract_attr(t, "value")) {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(ref mut tr) = current_trace {
                    tr.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
        if t.starts_with("<date") || t.starts_with("<float") || t.starts_with("<int") {
            if let (Some(k), Some(v)) = (extract_attr(t, "key"), extract_attr(t, "value")) {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
    }
    log
}

struct Dataset {
    label: &'static str,
    log: EventLog,
    event_count: u64,
}

fn try_load(candidates: &[&str]) -> Option<EventLog> {
    for path in candidates {
        let p = if path.starts_with("~/") {
            let home = std::env::var("HOME").unwrap_or_default();
            Path::new(&home)
                .join(&path[2..])
                .to_string_lossy()
                .to_string()
        } else {
            path.to_string()
        };
        if let Ok(content) = fs::read_to_string(&p) {
            if content.len() >= 200 {
                let l = parse_xes(&content);
                if !l.traces.is_empty() {
                    return Some(l);
                }
            }
        }
    }
    None
}

fn available_datasets() -> Vec<Dataset> {
    let mut out = Vec::new();
    let specs: &[(&[&str], &'static str)] = &[
        (
            &[
                "bench_data/bpi2020_travel.xes",
                "../../bench_data/bpi2020_travel.xes",
                "/Users/sac/wasm4pm/bench_data/bpi2020_travel.xes",
            ],
            "bpi2020",
        ),
        (
            &[
                "bench_data/roadtraffic100traces.xes",
                "../../bench_data/roadtraffic100traces.xes",
                "/Users/sac/wasm4pm/bench_data/roadtraffic100traces.xes",
                "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            ],
            "roadtraffic",
        ),
        (
            &[
                "bench_data/sepsis.xes",
                "../../bench_data/sepsis.xes",
                "/Users/sac/wasm4pm/bench_data/sepsis.xes",
            ],
            "sepsis",
        ),
    ];
    for (candidates, label) in specs {
        if let Some(log) = try_load(candidates) {
            let event_count = log.traces.iter().map(|t| t.events.len()).sum::<usize>() as u64;
            out.push(Dataset {
                label,
                log,
                event_count,
            });
        }
    }
    if out.is_empty() {
        panic!("No datasets in bench_data/. Need bpi2020_travel.xes or roadtraffic100traces.xes");
    }
    out
}

// ---------------------------------------------------------------------------
// Discovery — direct EventLog or AdmittedEventLog API
// ---------------------------------------------------------------------------

fn bench_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/dfg");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        let admitted = make_admitted(ds.log.clone());
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &admitted,
            |b, log| b.iter(|| discover_dfg_from_log(log, ACTIVITY_KEY)),
        );
    }
    group.finish();
}

fn bench_optimized_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/optimized_dfg");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_optimized_dfg_from_log(log, ACTIVITY_KEY, 1.0, 1.0)),
        );
    }
    group.finish();
}

fn bench_heuristic_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/heuristic_miner");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_heuristic_miner_from_log(log, ACTIVITY_KEY, 0.5)),
        );
    }
    group.finish();
}

fn bench_inductive_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/inductive_miner");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        let admitted = make_admitted(ds.log.clone());
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &admitted,
            |b, log| b.iter(|| discover_inductive_miner_from_log(log, ACTIVITY_KEY)),
        );
    }
    group.finish();
}

fn bench_ilp(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/ilp");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_ilp_petri_net_from_log(log, ACTIVITY_KEY)),
        );
    }
    group.finish();
}

fn bench_hill_climbing(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/hill_climbing");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_hill_climbing_from_log(log, ACTIVITY_KEY)),
        );
    }
    group.finish();
}

fn bench_simulated_annealing(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/simulated_annealing");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| {
                b.iter(|| discover_simulated_annealing_from_log(log, ACTIVITY_KEY, 1000.0, 0.95))
            },
        );
    }
    group.finish();
}

fn bench_transition_system(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/transition_system");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_transition_system(log, ACTIVITY_KEY, 2, "forward")),
        );
    }
    group.finish();
}

fn bench_prefix_tree(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/prefix_tree");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_prefix_tree_inner(log, ACTIVITY_KEY, None)),
        );
    }
    group.finish();
}

fn bench_batches(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/batches");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_batches(log, ACTIVITY_KEY, TIMESTAMP_KEY)),
        );
    }
    group.finish();
}

fn bench_correlation_miner(c: &mut Criterion) {
    let cfg = CorrelationConfig::default();
    let mut group = c.benchmark_group("native/correlation_miner");
    group.measurement_time(Duration::from_secs(5));
    for ds in &available_datasets() {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| mine_correlation(log, ACTIVITY_KEY, TIMESTAMP_KEY, &cfg)),
        );
    }
    group.finish();
}

// Metaheuristics — small datasets only (population-based search is expensive on large logs)

fn bench_aco(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/aco");
    group.measurement_time(Duration::from_secs(8));
    group.sample_size(20);
    for ds in available_datasets()
        .into_iter()
        .filter(|d| d.event_count < 5_000)
    {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_aco_algorithm_from_log(log, ACTIVITY_KEY, 10, 20)),
        );
    }
    group.finish();
}

fn bench_pso(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/pso");
    group.measurement_time(Duration::from_secs(8));
    group.sample_size(20);
    for ds in available_datasets()
        .into_iter()
        .filter(|d| d.event_count < 5_000)
    {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_pso_algorithm_from_log(log, ACTIVITY_KEY, 10, 20)),
        );
    }
    group.finish();
}

fn bench_genetic_algorithm(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/genetic_algorithm");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(15);
    for ds in available_datasets()
        .into_iter()
        .filter(|d| d.event_count < 5_000)
    {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_genetic_algorithm_from_log(log, ACTIVITY_KEY, 20, 10)),
        );
    }
    group.finish();
}

fn bench_astar(c: &mut Criterion) {
    let mut group = c.benchmark_group("native/a_star");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(15);
    for ds in available_datasets()
        .into_iter()
        .filter(|d| d.event_count < 5_000)
    {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new(ds.label, ds.event_count),
            &ds.log,
            |b, log| b.iter(|| discover_astar_from_log(log, ACTIVITY_KEY, 1000)),
        );
    }
    group.finish();
}

criterion_group!(
    native_benches,
    bench_dfg,
    bench_optimized_dfg,
    bench_heuristic_miner,
    bench_inductive_miner,
    bench_ilp,
    bench_hill_climbing,
    bench_simulated_annealing,
    bench_transition_system,
    bench_prefix_tree,
    bench_batches,
    bench_correlation_miner,
    bench_aco,
    bench_pso,
    bench_genetic_algorithm,
    bench_astar,
);
criterion_main!(native_benches);
