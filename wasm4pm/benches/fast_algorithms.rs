/// Criterion benchmarks for fast process discovery algorithms (<50ms per call).
///
/// Grounded on a real event log (`bench_data/sepsis.xes`, 1,050 ICU-patient
/// cases / ~15K events). Trace counts are swept by truncating the real log to
/// representative prefixes so Throughput is reported against actual event
/// volume — no synthetic data is fabricated (see helpers.rs TPS rule).
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::advanced_algorithms::discover_heuristic_miner;
use wasm4pm::algorithms::discover_alpha_plus_plus;
use wasm4pm::analysis::{analyze_case_duration, analyze_event_statistics};
use wasm4pm::discovery::{discover_declare, discover_dfg};
use wasm4pm::fast_discovery::discover_hill_climbing;
use wasm4pm::more_discovery::{discover_inductive_miner, extract_process_skeleton};

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

fn bench_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/dfg");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_dfg(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

fn bench_declare(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/declare");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_declare(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

fn bench_heuristic_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/heuristic_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        // Benchmark three dependency thresholds
        for threshold in [0.3_f64, 0.5, 0.8] {
            group.bench_with_input(
                BenchmarkId::new(format!("cases{}_t{}", n, threshold), n),
                &handle,
                |b, h| {
                    b.iter(|| {
                        black_box(
                            discover_heuristic_miner(black_box(h), ACTIVITY_KEY, threshold)
                                .unwrap(),
                        )
                    })
                },
            );
        }
    }
    group.finish();
}

fn bench_alpha_plus_plus(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/alpha_plus_plus");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_alpha_plus_plus(black_box(h), ACTIVITY_KEY, 0.1).unwrap()))
        });
    }
    group.finish();
}

fn bench_inductive_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/inductive_miner");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_inductive_miner(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

fn bench_hill_climbing(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/hill_climbing");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(discover_hill_climbing(black_box(h), ACTIVITY_KEY).unwrap()))
        });
    }
    group.finish();
}

fn bench_process_skeleton(c: &mut Criterion) {
    let mut group = c.benchmark_group("discovery/process_skeleton");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(extract_process_skeleton(black_box(h), ACTIVITY_KEY, 2).unwrap()))
        });
    }
    group.finish();
}

fn bench_event_statistics(c: &mut Criterion) {
    let mut group = c.benchmark_group("analysis/event_statistics");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(analyze_event_statistics(black_box(h)).unwrap()))
        });
    }
    group.finish();
}

fn bench_case_duration(c: &mut Criterion) {
    let mut group = c.benchmark_group("analysis/case_duration");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }
    for &n in real_case_counts() {
        let (handle, events) = helpers::store_real_log_capped(n);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(BenchmarkId::new("cases", n), &handle, |b, h| {
            b.iter(|| black_box(analyze_case_duration(black_box(h)).unwrap()))
        });
    }
    group.finish();
}

criterion_group!(
    fast_benches,
    bench_dfg,
    bench_declare,
    bench_heuristic_miner,
    bench_alpha_plus_plus,
    bench_inductive_miner,
    bench_hill_climbing,
    bench_process_skeleton,
    bench_event_statistics,
    bench_case_duration,
);
criterion_main!(fast_benches);
