/// Criterion benchmarks for medium-speed algorithms (5–200ms per call).
///
/// Grounded on REAL process-mining event logs (no synthetic generation — the
/// shared `generate_event_log` helper deliberately panics per the TPS rule).
/// Logs are loaded from `bench_data/` (sepsis, road-traffic) and `data/`.
/// Each log is parsed once, stored in global state, and the resulting handle
/// is fed to the handle-based discovery/analytics algorithms under test.
///
/// All inputs and returned results are wrapped in `criterion::black_box` so the
/// optimizer cannot elide the measured work. Throughput is reported in events.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::BTreeMap;
use std::time::Duration;
use wasm4pm::algorithms::discover_dfg_filtered;
use wasm4pm::fast_discovery::{
    analyze_trace_variants, cluster_traces, detect_concept_drift, discover_astar,
    mine_sequential_patterns,
};
use wasm4pm::ilp_discovery::discover_optimized_dfg;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::{discover_ant_colony, discover_simulated_annealing};

#[path = "helpers.rs"]
mod helpers;
use helpers::{is_fast_mode, store_log, ACTIVITY_KEY};

// ---------------------------------------------------------------------------
// Inline XES parser — same pattern as real_data_bench.rs:43-103
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
// Real-data loading — first existing candidate wins. No synthetic fallback:
// these benches MUST exercise a real log (TPS rule).
// ---------------------------------------------------------------------------

struct Dataset {
    label: &'static str,
    handle: String,
    events: u64,
}

/// Load the first existing XES candidate, optionally truncating to `max_traces`
/// to keep the slower members of this group bounded. Returns `None` if no
/// candidate file is present (e.g. a minimal CI checkout) so the bench can skip
/// rather than panic.
fn load_dataset(
    candidates: &[&str],
    label: &'static str,
    max_traces: Option<usize>,
) -> Option<Dataset> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut log = candidates.iter().find_map(|p| {
        let resolved = p.replace('~', &home);
        let content = std::fs::read_to_string(&resolved).ok()?;
        if content.len() < 200 {
            return None;
        }
        let l = parse_xes(&content);
        if l.traces.is_empty() {
            None
        } else {
            Some(l)
        }
    })?;

    if let Some(cap) = max_traces {
        if log.traces.len() > cap {
            log.traces.truncate(cap);
        }
    }

    let events = log.event_count() as u64;
    let handle = store_log(log);
    Some(Dataset {
        label,
        handle,
        events,
    })
}

/// Representative real datasets. `max_traces` caps runtime for the heavier
/// metaheuristic discoverers; small logs run in full.
fn datasets(max_traces: Option<usize>) -> Vec<Dataset> {
    let mut out = Vec::new();
    // Road traffic fines — 100 traces, small & fast.
    if let Some(d) = load_dataset(
        &[
            "bench_data/roadtraffic100traces.xes",
            "data/small-example.xes",
        ],
        "roadtraffic100",
        max_traces,
    ) {
        out.push(d);
    }
    // Sepsis — ICU patient flow, longer variants.
    if let Some(d) = load_dataset(
        &[
            "bench_data/sepsis.xes",
            "data/Sepsis Cases - Event Log.xes",
            "data/RepairExample.xes",
        ],
        "sepsis",
        max_traces,
    ) {
        out.push(d);
    }
    // In full mode, add the larger BPI-2020 travel log (capped).
    if !is_fast_mode() {
        if let Some(d) = load_dataset(
            &["bench_data/bpi2020_travel.xes", "data/PermitLog.xes"],
            "bpi2020_travel",
            Some(max_traces.unwrap_or(usize::MAX).min(2_000)),
        ) {
            out.push(d);
        }
    }
    out
}

fn configure(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>) {
    if is_fast_mode() {
        helpers::fast_group(group);
    } else {
        helpers::full_group(group);
    }
}

fn bench_astar(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/astar");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(20);
    configure(&mut group);
    for ds in datasets(Some(2_000)) {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_astar(black_box(h), black_box(ACTIVITY_KEY), black_box(500)).unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_simulated_annealing(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/simulated_annealing");
    group.measurement_time(Duration::from_secs(20));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(15);
    configure(&mut group);
    for ds in datasets(Some(1_000)) {
        group.throughput(Throughput::Elements(ds.events));
        for (temp, cooling) in [(100.0_f64, 0.95_f64), (100.0, 0.99)] {
            group.bench_with_input(
                BenchmarkId::new("log", format!("{}_t{}_cool{}", ds.label, temp, cooling)),
                &ds.handle,
                |b, h| {
                    b.iter(|| {
                        black_box(
                            discover_simulated_annealing(
                                black_box(h),
                                black_box(ACTIVITY_KEY),
                                black_box(temp),
                                black_box(cooling),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }
    group.finish();
}

fn bench_ant_colony(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/ant_colony");
    group.measurement_time(Duration::from_secs(20));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(15);
    configure(&mut group);
    for ds in datasets(Some(1_000)) {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_ant_colony(
                        black_box(h),
                        black_box(ACTIVITY_KEY),
                        black_box(20),
                        black_box(10),
                    )
                    .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_dfg_filtered(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/dfg_filtered");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    configure(&mut group);
    for ds in datasets(None) {
        group.throughput(Throughput::Elements(ds.events));
        for min_freq in [2_usize, 5, 10] {
            group.bench_with_input(
                BenchmarkId::new("log", format!("{}_mf{}", ds.label, min_freq)),
                &ds.handle,
                |b, h| {
                    b.iter(|| {
                        black_box(
                            discover_dfg_filtered(
                                black_box(h),
                                black_box(ACTIVITY_KEY),
                                black_box(min_freq),
                            )
                            .unwrap(),
                        )
                    })
                },
            );
        }
    }
    group.finish();
}

fn bench_optimized_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/optimized_dfg");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    configure(&mut group);
    for ds in datasets(None) {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    discover_optimized_dfg(
                        black_box(h),
                        black_box(ACTIVITY_KEY),
                        black_box(0.8),
                        black_box(0.2),
                    )
                    .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_trace_variants(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/trace_variants");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    configure(&mut group);
    for ds in datasets(None) {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(analyze_trace_variants(black_box(h), black_box(ACTIVITY_KEY)).unwrap())
            })
        });
    }
    group.finish();
}

fn bench_sequential_patterns(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/sequential_patterns");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);
    configure(&mut group);
    for ds in datasets(Some(2_000)) {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    mine_sequential_patterns(
                        black_box(h),
                        black_box(ACTIVITY_KEY),
                        black_box(0.1),
                        black_box(3),
                    )
                    .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_concept_drift(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/concept_drift");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);
    configure(&mut group);
    for ds in datasets(Some(2_000)) {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    detect_concept_drift(black_box(h), black_box(ACTIVITY_KEY), black_box(50))
                        .unwrap(),
                )
            })
        });
    }
    group.finish();
}

fn bench_cluster_traces(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics/cluster_traces");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);
    configure(&mut group);
    for ds in datasets(Some(2_000)) {
        group.throughput(Throughput::Elements(ds.events));
        group.bench_with_input(BenchmarkId::new("log", ds.label), &ds.handle, |b, h| {
            b.iter(|| {
                black_box(
                    cluster_traces(black_box(h), black_box(ACTIVITY_KEY), black_box(5)).unwrap(),
                )
            })
        });
    }
    group.finish();
}

criterion_group!(
    medium_benches,
    bench_astar,
    bench_simulated_annealing,
    bench_ant_colony,
    bench_dfg_filtered,
    bench_optimized_dfg,
    bench_trace_variants,
    bench_sequential_patterns,
    bench_concept_drift,
    bench_cluster_traces,
);
criterion_main!(medium_benches);
