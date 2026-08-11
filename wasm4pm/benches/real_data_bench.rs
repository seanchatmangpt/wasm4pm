//! Real-Data Criterion Benchmarks — all Tier-1 algorithms against real XES event logs.
//!
//! Benchmarks 16 algorithms (those with native Rust `_from_log` or direct EventLog API)
//! across 3 real-world datasets:
//!   - sepsis.xes         (1,050 cases, ~15K events — ICU patient flow)
//!   - bpi2020_travel.xes (7,065 cases, ~87K events — travel permits)
//!   - roadtraffic.xes    (100 cases  — road traffic fines)
//!
//! Excluded (no EventLog API): streaming_log, smart_engine, pnml_import, bpmn_import,
//! powl_to_process_tree, yawl_export, playout (these take model input, not event logs).
//! Tier-2 algorithms (handle-based WASM) are covered by benchmarks/real_data_wasm_bench.js.
//!
//! Fallback: if real data is absent (e.g., CI), a synthetic 100-case log is generated
//! so the bench always produces output regardless of environment.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::{collections::BTreeMap, fs, time::Duration};

use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::algorithms::discover_alpha_plus_plus_from_log;
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
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::{
    discover_inductive_miner_from_log, discover_simulated_annealing_from_log,
};
use wasm4pm::transition_system::discover_transition_system;

const ACTIVITY_KEY: &str = "concept:name";
const TIMESTAMP_KEY: &str = "time:timestamp";

// ---------------------------------------------------------------------------
// Inline XES parser — same pattern as real_data_algo_validation.rs:34-77
// ---------------------------------------------------------------------------

fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            current_trace = Some(Trace {
                attributes: BTreeMap::new(),
                events: Vec::new(),
            });
        }
        if trimmed.starts_with("</trace>") {
            if let Some(t) = current_trace.take() {
                log.traces.push(t);
            }
        }
        if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
            current_event = Some(Event {
                attributes: BTreeMap::new(),
            });
        }
        if trimmed.starts_with("</event>") {
            if let Some(ev) = current_event.take() {
                if let Some(ref mut t) = current_trace {
                    t.events.push(ev);
                }
            }
        }
        if trimmed.starts_with("<string") {
            if let (Some(k), Some(v)) =
                (extract_attr(trimmed, "key"), extract_attr(trimmed, "value"))
            {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(ref mut t) = current_trace {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
        if trimmed.starts_with("<date") {
            if let (Some(k), Some(v)) =
                (extract_attr(trimmed, "key"), extract_attr(trimmed, "value"))
            {
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

// ---------------------------------------------------------------------------
// Dataset loading — real file with synthetic fallback
// ---------------------------------------------------------------------------

struct Dataset {
    label: &'static str,
    log: EventLog,
    event_count: u64,
}

fn generate_synthetic_fallback() -> EventLog {
    let activities = ["Register", "Validate", "Assess", "Approve", "Close"];
    let mut log = EventLog::new();
    for i in 0..100usize {
        let mut trace = Trace {
            attributes: BTreeMap::new(),
            events: Vec::new(),
        };
        let len = 5 + (i % 8);
        for j in 0..len {
            let mut ev = Event {
                attributes: BTreeMap::new(),
            };
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

fn load_dataset(candidates: &[&str], label: &'static str) -> Dataset {
    let home = std::env::var("HOME").unwrap_or_default();
    let log = candidates
        .iter()
        .filter_map(|p| {
            let resolved = p.replace("~", &home);
            let content = fs::read_to_string(&resolved).ok()?;
            if content.len() < 200 {
                return None;
            }
            let l = parse_xes(&content);
            if l.traces.is_empty() {
                return None;
            }
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
    Dataset {
        label,
        log,
        event_count,
    }
}

fn real_datasets() -> Vec<Dataset> {
    vec![
        load_dataset(
            &["bench_data/sepsis.xes", "../../bench_data/sepsis.xes"],
            "sepsis",
        ),
        load_dataset(
            &[
                "bench_data/bpi2020_travel.xes",
                "../../bench_data/bpi2020_travel.xes",
            ],
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

// ---------------------------------------------------------------------------
// Benchmarks — one function per algorithm, loops over all datasets
// ---------------------------------------------------------------------------

fn bench_dfg(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/dfg");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        let admitted_log =
            wasm4pm_compat::admission::Admission::<_, ()>::new(ds.log.clone()).into_evidence();
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &admitted_log,
            |b, log| {
                b.iter(|| black_box(discover_dfg_from_log(black_box(log), ACTIVITY_KEY)));
            },
        );
    }
    group.finish();
}

fn bench_alpha_plus_plus(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/alpha_plus_plus");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        let admitted_log =
            wasm4pm_compat::admission::Admission::<_, ()>::new(ds.log.clone()).into_evidence();
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &admitted_log,
            |b, log| {
                b.iter(|| {
                    black_box(discover_alpha_plus_plus_from_log(
                        black_box(log),
                        ACTIVITY_KEY,
                        0.0,
                    ))
                });
            },
        );
    }
    group.finish();
}

fn bench_heuristic_miner(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/heuristic_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_heuristic_miner_from_log(
                    black_box(log),
                    ACTIVITY_KEY,
                    0.3,
                ))
            });
        });
    }
    group.finish();
}

fn bench_inductive_miner(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/inductive_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        let admitted_log =
            wasm4pm_compat::admission::Admission::<_, ()>::new(ds.log.clone()).into_evidence();
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &admitted_log,
            |b, log| {
                b.iter(|| {
                    black_box(discover_inductive_miner_from_log(
                        black_box(log),
                        ACTIVITY_KEY,
                    ))
                });
            },
        );
    }
    group.finish();
}

fn bench_hill_climbing(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/hill_climbing");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_hill_climbing_from_log(
                    black_box(log),
                    ACTIVITY_KEY,
                ))
            });
        });
    }
    group.finish();
}

fn bench_simulated_annealing(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/simulated_annealing");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(15);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_simulated_annealing_from_log(
                    black_box(log),
                    ACTIVITY_KEY,
                    50.0,
                    0.95,
                ))
            });
        });
    }
    group.finish();
}

fn bench_a_star(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/a_star");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(10);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| black_box(discover_astar_from_log(black_box(log), ACTIVITY_KEY, 50)));
        });
    }
    group.finish();
}

fn bench_aco(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/aco");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(15);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_aco_algorithm_from_log(
                    black_box(log),
                    ACTIVITY_KEY,
                    10,
                    5,
                ))
            });
        });
    }
    group.finish();
}

fn bench_pso(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/pso");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(15);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_pso_algorithm_from_log(
                    black_box(log),
                    ACTIVITY_KEY,
                    10,
                    5,
                ))
            });
        });
    }
    group.finish();
}

fn bench_genetic_algorithm(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/genetic_algorithm");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(15);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_genetic_algorithm_from_log(
                    black_box(log),
                    ACTIVITY_KEY,
                    10,
                    5,
                ))
            });
        });
    }
    group.finish();
}

fn bench_optimized_dfg(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/optimized_dfg");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_optimized_dfg_from_log(
                    black_box(log),
                    ACTIVITY_KEY,
                    0.5,
                    0.5,
                ))
            });
        });
    }
    group.finish();
}

fn bench_ilp(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/ilp");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(15);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_ilp_petri_net_from_log(
                    black_box(log),
                    ACTIVITY_KEY,
                ))
            });
        });
    }
    group.finish();
}

fn bench_transition_system(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/transition_system");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_transition_system(
                    black_box(log),
                    ACTIVITY_KEY,
                    2,
                    "past",
                ))
            });
        });
    }
    group.finish();
}

fn bench_prefix_tree(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/prefix_tree");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_prefix_tree_inner(
                    black_box(log),
                    ACTIVITY_KEY,
                    None,
                ))
            });
        });
    }
    group.finish();
}

fn bench_batches(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("real_data/batches");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &ds.log, |b, log| {
            b.iter(|| {
                black_box(discover_batches(
                    black_box(log),
                    ACTIVITY_KEY,
                    TIMESTAMP_KEY,
                ))
            });
        });
    }
    group.finish();
}

fn bench_correlation_miner(c: &mut Criterion) {
    let datasets = real_datasets();
    let cfg = CorrelationConfig {
        correlation_threshold: 3600.0 * 24.0,
        min_edge_frequency: 2,
    };
    let mut group = c.benchmark_group("real_data/correlation_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
    for ds in &datasets {
        group.throughput(Throughput::Elements(ds.event_count));
        let input = (ds.log.clone(), cfg.clone());
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &input,
            |b, (log, cfg)| {
                b.iter(|| {
                    black_box(mine_correlation(
                        black_box(log),
                        ACTIVITY_KEY,
                        TIMESTAMP_KEY,
                        black_box(cfg),
                    ))
                });
            },
        );
    }
    group.finish();
}

criterion_group!(
    real_data_benches,
    bench_dfg,
    bench_alpha_plus_plus,
    bench_heuristic_miner,
    bench_inductive_miner,
    bench_hill_climbing,
    bench_simulated_annealing,
    bench_a_star,
    bench_aco,
    bench_pso,
    bench_genetic_algorithm,
    bench_optimized_dfg,
    bench_ilp,
    bench_transition_system,
    bench_prefix_tree,
    bench_batches,
    bench_correlation_miner,
);
criterion_main!(real_data_benches);
