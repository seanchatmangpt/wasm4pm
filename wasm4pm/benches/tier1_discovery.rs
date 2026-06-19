/// Criterion benchmarks for Tier 1 (fast) discovery algorithms.
///
/// Tier 1 algorithms are the fastest process discovery methods:
/// - DFG (Directly-Follows Graph) - O(n) single pass
/// - Process Skeleton - filtered DFG with min frequency
/// - Alpha++ - basic Petri net discovery
/// - Heuristic Miner - threshold-based dependency discovery
/// - Inductive Miner - recursive structure discovery
///
/// Grounded on a real event log (`bench_data/sepsis.xes`, real ICU-patient
/// cases). Trace counts are swept by truncating the real log to representative
/// prefixes so Throughput is reported against actual event volume — no
/// synthetic data is fabricated (see helpers.rs TPS rule). Every input and
/// returned result is wrapped in `black_box` so the optimizer cannot elide the
/// measured work.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::advanced_algorithms::discover_heuristic_miner;
use wasm4pm::algorithms::discover_alpha_plus_plus;
use wasm4pm::discovery::discover_dfg;
use wasm4pm::models::EventLog;
use wasm4pm::more_discovery::{discover_inductive_miner, extract_process_skeleton};
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::xes_format::validate_and_parse_xes;

#[path = "helpers.rs"]
mod helpers;
use helpers::ACTIVITY_KEY;

/// Trace-count prefixes swept over the real log. In fast mode only the
/// smallest is used so each binary completes in well under a second.
fn real_case_counts() -> &'static [usize] {
    if helpers::is_fast_mode() {
        &[100]
    } else {
        &[100, 500, 1_000]
    }
}

/// Load `bench_data/sepsis.xes`, truncate to `max_traces`, store it in global
/// state and return (handle, total_events). Returns `None` if the fixture is
/// absent so real-data benches skip cleanly instead of fabricating input.
/// The bench cwd is the crate dir (`wasm4pm/`); the fixture lives at the repo
/// root, hence the two candidate paths.
fn setup_real_log(max_traces: usize) -> Option<(String, usize)> {
    let content = ["../bench_data/sepsis.xes", "bench_data/sepsis.xes"]
        .iter()
        .find_map(|p| std::fs::read_to_string(p).ok())?;
    let mut log: EventLog = validate_and_parse_xes(&content).ok()?;
    if log.traces.len() > max_traces {
        log.traces.truncate(max_traces);
    }
    let total_events = log.event_count();
    if total_events == 0 {
        return None;
    }
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .ok()?;
    Some((handle, total_events))
}

/// Benchmark DFG discovery - the foundational O(n) algorithm
fn bench_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/dfg");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for &n in real_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_dfg(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

/// Benchmark Process Skeleton extraction - DFG with frequency filtering
fn bench_process_skeleton(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/process_skeleton");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for &n in real_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(extract_process_skeleton(black_box(h), ACTIVITY_KEY, 2).unwrap()))
        });
    }
    group.finish();
}

/// Benchmark Alpha++ algorithm - basic Petri net discovery
fn bench_alpha_plus_plus(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/alpha_plus_plus");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for &n in real_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_alpha_plus_plus(black_box(h), ACTIVITY_KEY, 0.1).unwrap()))
        });
    }
    group.finish();
}

/// Benchmark Heuristic Miner with dependency threshold
fn bench_heuristic_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/heuristic_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for &n in real_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        // Benchmark with default threshold of 0.5
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_heuristic_miner(black_box(h), ACTIVITY_KEY, 0.5).unwrap()))
        });
    }
    group.finish();
}

/// Benchmark Inductive Miner - recursive structure discovery
fn bench_inductive_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("tier1/inductive_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for &n in real_case_counts() {
        let Some((handle, events)) = setup_real_log(n) else {
            continue;
        };
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_inductive_miner(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

criterion_group!(
    tier1_benches,
    bench_dfg,
    bench_process_skeleton,
    bench_alpha_plus_plus,
    bench_heuristic_miner,
    bench_inductive_miner,
);
criterion_main!(tier1_benches);
