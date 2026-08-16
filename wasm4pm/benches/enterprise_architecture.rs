//! Challenger enterprise architecture benchmarks on checked-in real XES evidence.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::{collections::BTreeMap, time::Duration};
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::algorithms::discover_footprints_from_log;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

const KEY: &str = "concept:name";
const XES: &str = include_str!("../bench_data/receipt.xes");
const XES_BYTES: &[u8] = include_bytes!("../bench_data/receipt.xes");

fn attr(s: &str, name: &str) -> Option<String> {
    let p = format!("{}=\"", name);
    let i = s.find(&p)? + p.len();
    let j = s[i..].find('"')?;
    Some(s[i..i + j].to_owned())
}

fn real_log() -> EventLog {
    let mut log = EventLog::new();
    let mut trace: Option<Trace> = None;
    let mut event: Option<Event> = None;
    for s in XES.lines().map(str::trim) {
        if s.starts_with("<trace>") || s.starts_with("<trace ") {
            trace = Some(Trace {
                attributes: BTreeMap::new(),
                events: vec![],
            });
        } else if s.starts_with("</trace>") {
            if let Some(t) = trace.take() {
                log.traces.push(t);
            }
        } else if s.starts_with("<event>") || s.starts_with("<event ") {
            event = Some(Event {
                attributes: BTreeMap::new(),
            });
        } else if s.starts_with("</event>") {
            if let (Some(e), Some(t)) = (event.take(), trace.as_mut()) {
                t.events.push(e);
            }
        } else if s.starts_with("<string") {
            if let (Some(k), Some(v)) = (attr(s, "key"), attr(s, "value")) {
                if let Some(e) = event.as_mut() {
                    e.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(t) = trace.as_mut() {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        } else if s.starts_with("<date") {
            if let (Some(k), Some(v), Some(e)) = (attr(s, "key"), attr(s, "value"), event.as_mut())
            {
                e.attributes.insert(k, AttributeValue::Date(v));
            }
        }
    }
    assert!(
        !log.traces.is_empty(),
        "receipt.xes must parse as real evidence"
    );
    log
}

fn setup(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>) {
    group.measurement_time(Duration::from_secs(2));
    group.warm_up_time(Duration::from_millis(250));
    group.sample_size(15);
}

fn hash<T: serde::Serialize>(v: &T) -> blake3::Hash {
    blake3::hash(&serde_json::to_vec(v).expect("candidate serialization"))
}

fn portfolio(c: &mut Criterion) {
    let log = real_log();
    let events = log.event_count() as u64;
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
    let input = blake3::hash(XES_BYTES);
    let mut g = c.benchmark_group("challenger/portfolio_before_decision");
    setup(&mut g);
    g.throughput(Throughput::Elements(6));
    g.bench_with_input(
        BenchmarkId::new("receipt_xes_events", events),
        &log,
        |b, l| {
            b.iter(|| {
                let mut r = blake3::Hasher::new();
                r.update(b"wasm4pm:ea:portfolio:v1");
                r.update(input.as_bytes());
                r.update(hash(&discover_dfg_from_log(&admitted, KEY)).as_bytes());
                r.update(hash(&discover_footprints_from_log(&admitted, KEY)).as_bytes());
                for t in [0.2, 0.4, 0.6, 0.8] {
                    r.update(
                        hash(&discover_heuristic_miner_from_log(black_box(l), KEY, t)).as_bytes(),
                    );
                }
                black_box(r.finalize())
            })
        },
    );
    g.finish();
}

fn policy_sweep(c: &mut Criterion) {
    let log = real_log();
    let events = log.event_count() as u64;
    let input = blake3::hash(XES_BYTES);
    let mut g = c.benchmark_group("challenger/policy_space_sweep");
    setup(&mut g);
    g.throughput(Throughput::Elements(9));
    g.bench_with_input(
        BenchmarkId::new("receipt_xes_events", events),
        &log,
        |b, l| {
            b.iter(|| {
                let mut r = blake3::Hasher::new();
                r.update(b"wasm4pm:ea:policy:v1");
                r.update(input.as_bytes());
                for t in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] {
                    r.update(
                        hash(&discover_heuristic_miner_from_log(black_box(l), KEY, t)).as_bytes(),
                    );
                }
                black_box(r.finalize())
            })
        },
    );
    g.finish();
}

fn receipt_tax(c: &mut Criterion) {
    let log = real_log();
    let events = log.event_count() as u64;
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
    let hashes = [
        hash(&discover_dfg_from_log(&admitted, KEY)),
        hash(&discover_footprints_from_log(&admitted, KEY)),
        hash(&discover_heuristic_miner_from_log(&log, KEY, 0.2)),
        hash(&discover_heuristic_miner_from_log(&log, KEY, 0.4)),
        hash(&discover_heuristic_miner_from_log(&log, KEY, 0.6)),
        hash(&discover_heuristic_miner_from_log(&log, KEY, 0.8)),
    ];
    let input = blake3::hash(XES_BYTES);
    let mut g = c.benchmark_group("challenger/receipt_tax");
    setup(&mut g);
    g.throughput(Throughput::Bytes((hashes.len() * 32) as u64));
    g.bench_with_input(
        BenchmarkId::new("receipt_xes_events", events),
        &hashes,
        |b, hs| {
            b.iter(|| {
                let mut r = blake3::Hasher::new();
                r.update(b"wasm4pm:ea:receipt:v1");
                r.update(input.as_bytes());
                for h in hs {
                    r.update(h.as_bytes());
                }
                black_box(r.finalize())
            })
        },
    );
    g.finish();
}

fn optionality(c: &mut Criterion) {
    let log = real_log();
    let events = log.event_count() as u64;
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
    let input = blake3::hash(XES_BYTES);
    let mut g = c.benchmark_group("challenger/architecture_optionality_density");
    setup(&mut g);
    g.throughput(Throughput::Elements(15));
    g.bench_with_input(
        BenchmarkId::new("receipt_xes_events", events),
        &log,
        |b, l| {
            b.iter(|| {
                let mut r = blake3::Hasher::new();
                r.update(b"wasm4pm:ea:optionality:v1");
                r.update(input.as_bytes());
                r.update(hash(&discover_dfg_from_log(&admitted, KEY)).as_bytes());
                r.update(hash(&discover_footprints_from_log(&admitted, KEY)).as_bytes());
                for t in [
                    0.2, 0.4, 0.6, 0.8, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
                ] {
                    r.update(
                        hash(&discover_heuristic_miner_from_log(black_box(l), KEY, t)).as_bytes(),
                    );
                }
                black_box(r.finalize())
            })
        },
    );
    g.finish();
}

criterion_group!(
    enterprise_architecture,
    portfolio,
    policy_sweep,
    receipt_tax,
    optionality
);
criterion_main!(enterprise_architecture);
