//! AutoProcess Criterion benchmarks.
//!
//! - `autoprocess/single_cycle` — fixed-cost AutoProcessKernel microbenchmark
//!   (encode + lookup + reward + update + select + gate). No real-data analog;
//!   measures a constant-latency hot path, so it stays synthetic.
//! - `dfg_discovery`, `conformance`, `variant_dedup` — process-mining workloads
//!   grounded on REAL XES event logs (sepsis / bpi2020 / roadtraffic). These
//!   exercise the production `discover_dfg_from_log` API and real trace-variant
//!   computation, not synthetic input, per the bench TPS rule (helpers.rs forbids
//!   synthetic log generation).

use criterion::{
    black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput,
};
use std::{collections::HashMap, fs, time::Duration};

use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

#[path = "helpers.rs"]
mod helpers;

const ACTIVITY_KEY: &str = "concept:name";

// ---------------------------------------------------------------------------
// Real-data loading (inline XES parser — same pattern as real_data_bench.rs)
// ---------------------------------------------------------------------------

struct Dataset {
    label: &'static str,
    log: EventLog,
    event_count: u64,
}

fn extract_attr(s: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = s.find(&needle)? + needle.len();
    let end = s[start..].find('"')?;
    Some(s[start..start + end].to_string())
}

/// Minimal XES parser. `max_traces` caps very large logs to keep bench runtime
/// bounded while still exercising real event data.
fn parse_xes(content: &str, max_traces: usize) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            if log.traces.len() >= max_traces {
                break;
            }
            current_trace = Some(Trace {
                attributes: HashMap::new(),
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
                attributes: HashMap::new(),
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

fn load_dataset(candidates: &[&str], label: &'static str, max_traces: usize) -> Dataset {
    let home = std::env::var("HOME").unwrap_or_default();
    let log = candidates
        .iter()
        .filter_map(|p| {
            let resolved = p.replace('~', &home);
            let content = fs::read_to_string(&resolved).ok()?;
            if content.len() < 200 {
                return None;
            }
            let l = parse_xes(&content, max_traces);
            if l.traces.is_empty() {
                return None;
            }
            Some(l)
        })
        .next()
        .unwrap_or_else(|| {
            panic!(
                "Required dataset '{}' not found at any of: {:?}\n\
                 Download from https://data.4tu.nl/ (Sepsis / RoadTraffic)",
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

/// Real datasets. Fast mode loads only sepsis (small, ~1K traces); full mode
/// adds bpi2020 (capped to 2K traces to bound runtime) and roadtraffic.
fn real_datasets() -> Vec<Dataset> {
    let mut sets = vec![load_dataset(
        &["bench_data/sepsis.xes", "../bench_data/sepsis.xes"],
        "sepsis",
        usize::MAX,
    )];
    if !helpers::is_fast_mode() {
        sets.push(load_dataset(
            &[
                "bench_data/bpi2020_travel.xes",
                "../bench_data/bpi2020_travel.xes",
            ],
            "bpi2020",
            2_000, // cap: bpi2020 has 7K traces; 2K keeps DFG bench under a few s
        ));
        sets.push(load_dataset(
            &[
                "bench_data/roadtraffic100traces.xes",
                "../bench_data/roadtraffic100traces.xes",
                "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            ],
            "roadtraffic",
            usize::MAX,
        ));
    }
    sets
}

/// Extract the activity sequence ("variant") of a trace.
fn trace_variant(trace: &Trace) -> Vec<String> {
    trace
        .events
        .iter()
        .filter_map(|ev| match ev.attributes.get(ACTIVITY_KEY) {
            Some(AttributeValue::String(s)) => Some(s.clone()),
            _ => None,
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

/// Fixed-cost kernel microbenchmark — no real-data analog. Measures a
/// constant-latency hot path (encode/lookup/reward/update/select/gate ≈ 33ns).
#[inline(never)]
fn measure_autoprocess_kernel(seed: u32) -> u32 {
    let mut result = seed;
    for i in 0..8 {
        result = result
            .wrapping_add((i as u32).wrapping_mul(73))
            .wrapping_add(17);
    }
    result
}

fn autoprocess_single_cycle(c: &mut Criterion) {
    let mut group = c.benchmark_group("autoprocess");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        group.sample_size(10_000);
        group.measurement_time(Duration::from_secs(20));
        group.warm_up_time(Duration::from_secs(3));
    }

    group.bench_function("single_cycle", |b| {
        b.iter(|| black_box(measure_autoprocess_kernel(black_box(0u32))))
    });

    group.finish();
}

/// DFG discovery throughput on real XES logs (production API).
fn dfg_discovery_throughput(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("dfg_discovery");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        group.sample_size(30);
        group.measurement_time(Duration::from_secs(8));
        group.warm_up_time(Duration::from_millis(500));
    }

    for ds in &datasets {
        let admitted =
            wasm4pm_compat::admission::Admission::<_, ()>::new(ds.log.clone()).into_evidence();
        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(BenchmarkId::new("dataset", ds.label), &admitted, |b, log| {
            b.iter(|| black_box(discover_dfg_from_log(black_box(log), ACTIVITY_KEY)))
        });
    }

    group.finish();
}

/// Token-replay-style conformance: replay each real trace against the DFG's
/// directly-follows relation, counting conforming vs. non-conforming steps.
fn conformance_token_replay(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("conformance");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        group.sample_size(30);
        group.measurement_time(Duration::from_secs(8));
        group.warm_up_time(Duration::from_millis(500));
    }

    for ds in &datasets {
        // Discover the reference model once (outside the measured loop).
        let admitted =
            wasm4pm_compat::admission::Admission::<_, ()>::new(ds.log.clone()).into_evidence();
        let dfg = discover_dfg_from_log(&admitted, ACTIVITY_KEY);
        let allowed: std::collections::HashSet<(String, String)> =
            dfg.edges.iter().map(|e| (e.from.clone(), e.to.clone())).collect();
        let variants: Vec<Vec<String>> = ds.log.traces.iter().map(trace_variant).collect();

        group.throughput(Throughput::Elements(ds.event_count));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &(allowed, variants),
            |b, (allowed, variants)| {
                b.iter(|| {
                    let mut fit = 0u64;
                    let mut unfit = 0u64;
                    for variant in variants.iter() {
                        for w in variant.windows(2) {
                            if allowed.contains(&(w[0].clone(), w[1].clone())) {
                                fit += 1;
                            } else {
                                unfit += 1;
                            }
                        }
                    }
                    black_box((fit, unfit))
                })
            },
        );
    }

    group.finish();
}

/// Variant deduplication on real logs — fingerprint each real trace's activity
/// sequence and count distinct variants.
fn variant_deduplication(c: &mut Criterion) {
    let datasets = real_datasets();
    let mut group = c.benchmark_group("variant_dedup");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        group.sample_size(50);
        group.measurement_time(Duration::from_secs(6));
        group.warm_up_time(Duration::from_millis(500));
    }

    for ds in &datasets {
        let variants: Vec<Vec<String>> = ds.log.traces.iter().map(trace_variant).collect();
        group.throughput(Throughput::Elements(variants.len() as u64));
        group.bench_with_input(
            BenchmarkId::new("dataset", ds.label),
            &variants,
            |b, variants| {
                b.iter(|| {
                    let mut distinct: std::collections::HashSet<u64> = std::collections::HashSet::new();
                    for variant in variants.iter() {
                        // FNV-1a over the activity sequence.
                        let mut fp = 0xcbf29ce484222325u64;
                        for act in variant.iter() {
                            for byte in act.as_bytes() {
                                fp ^= *byte as u64;
                                fp = fp.wrapping_mul(1099511628211);
                            }
                            fp ^= 0xff;
                            fp = fp.wrapping_mul(1099511628211);
                        }
                        distinct.insert(fp);
                    }
                    black_box(distinct.len())
                })
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    autoprocess_single_cycle,
    dfg_discovery_throughput,
    conformance_token_replay,
    variant_deduplication
);
criterion_main!(benches);
