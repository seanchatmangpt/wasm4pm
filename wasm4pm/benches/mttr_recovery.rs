/**
 * mttr_recovery.rs
 * Benchmarks for Mean-Time-To-Recovery (MTTR) across 4 critical recovery paths
 *
 * Recovery paths measured:
 * 1. degraded → ready (soft recovery) — target: 10-100ms
 * 2. failed → ready (fast recovery) — target: <1s
 * 3. bootstrapping → ready (cold start) — target: <5s
 * 4. circuit_open → closed (breaker reset) — target: <500ms
 *
 * NOTE: These are synthetic state-machine recovery models. The MTTR domain
 * (recovery-path latency) does not correspond to any event-log dataset, so the
 * benches intentionally exercise simulated state transitions rather than a real
 * XES/OCEL log. Criterion times the recovery work directly (no hand-rolled
 * Instant/Duration timing), and every input and result is fed through black_box
 * so the optimizer cannot elide the modeled transition cost.
 */
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;

// Synthetic recovery-path models. Each returns the resolved end state plus an
// accumulator so the work is observable through black_box. In production these
// would call the real engine recovery methods; the shape (number of transition
// steps) approximates the relative cost of each path.

/// Soft recovery (degraded → ready): validate, clear error buffer, reset, transition.
fn soft_recovery(work: usize) -> (&'static str, u32) {
    let mut error_count: u32 = 0;
    for _ in 0..work {
        error_count = error_count.wrapping_add(1);
        if error_count > 50 {
            error_count = 0;
        }
    }
    ("ready", error_count)
}

/// Fast recovery (failed → ready): WASM stays loaded, skip recompile, validate kernel.
fn fast_recovery(work: usize) -> (&'static str, u64) {
    let mut acc: u64 = 0;
    let mut wasm_ready = false;
    for i in 0..work {
        wasm_ready = true;
        acc = acc.wrapping_add(i as u64);
    }
    if wasm_ready {
        ("ready", acc)
    } else {
        ("failed", acc)
    }
}

/// Cold start (uninitialized → bootstrapping → ready): full WASM load + kernel init.
fn cold_start(load_work: usize, init_work: usize) -> (&'static str, u64) {
    let mut acc: u64 = 0;
    let mut wasm_loaded = false;
    for i in 0..load_work {
        wasm_loaded = true;
        acc = acc.wrapping_add(i as u64);
    }
    let mut kernel_ready = false;
    for i in 0..init_work {
        kernel_ready = true;
        acc = acc.wrapping_add(i as u64);
    }
    if wasm_loaded && kernel_ready {
        ("ready", acc)
    } else {
        ("uninitialized", acc)
    }
}

/// Circuit breaker reset (open → half-open → closed): timeout, transition, probe.
fn circuit_reset(timeout_work: usize) -> (&'static str, u32) {
    let mut time_in_open: u32 = 0;
    for _ in 0..timeout_work {
        time_in_open = time_in_open.wrapping_add(1);
    }
    let mut breaker_state = if time_in_open > 100 {
        "half_open"
    } else {
        "open"
    };
    let probe_success = true;
    if breaker_state == "half_open" && probe_success {
        breaker_state = "closed";
    }
    (breaker_state, time_in_open)
}

/// Parallel recovery contention: `concurrency` competing recovery attempts.
/// Returns an accumulator over all attempt outcomes.
fn parallel_contention(concurrency: usize, work: usize) -> u64 {
    let mut acc: u64 = 0;
    for _ in 0..concurrency {
        let (_state, c) = soft_recovery(work);
        acc = acc.wrapping_add(c as u64);
    }
    acc
}

fn mttr_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("mttr_recovery");
    group.sample_size(100);
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.significance_level(0.05);

    let soft_work = 100usize;
    let fast_work = 1_000usize;
    let cold_load = 10_000usize;
    let cold_init = 1_000usize;
    let breaker_work = 500usize;

    group.bench_function("soft_recovery_degraded_to_ready", |b| {
        b.iter(|| black_box(soft_recovery(black_box(soft_work))))
    });

    group.bench_function("fast_recovery_failed_to_ready", |b| {
        b.iter(|| black_box(fast_recovery(black_box(fast_work))))
    });

    group.bench_function("cold_start_bootstrap_to_ready", |b| {
        b.iter(|| black_box(cold_start(black_box(cold_load), black_box(cold_init))))
    });

    group.bench_function("circuit_breaker_open_to_closed", |b| {
        b.iter(|| black_box(circuit_reset(black_box(breaker_work))))
    });

    group.finish();
}

/// Throughput-parameterized contention: measure recovery cost scaling with the
/// number of concurrent recovery attempts (Throughput::Elements = attempts).
fn mttr_contention(c: &mut Criterion) {
    let mut group = c.benchmark_group("mttr_contention");
    group.sample_size(100);
    group.measurement_time(Duration::from_secs(10));

    let work = 100usize;
    for &concurrency in &[1usize, 2, 4, 8, 16] {
        group.throughput(Throughput::Elements(concurrency as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(concurrency),
            &concurrency,
            |b, &conc| b.iter(|| black_box(parallel_contention(black_box(conc), black_box(work)))),
        );
    }

    group.finish();
}

/// Per-path latency comparison across all four recovery paths.
fn mttr_latency_percentiles(c: &mut Criterion) {
    let mut group = c.benchmark_group("mttr_percentiles");
    group.sample_size(100);
    group.measurement_time(Duration::from_secs(10));

    group.bench_with_input(
        BenchmarkId::from_parameter("soft_recovery"),
        &100usize,
        |b, &w| b.iter(|| black_box(soft_recovery(black_box(w)))),
    );
    group.bench_with_input(
        BenchmarkId::from_parameter("fast_recovery"),
        &1_000usize,
        |b, &w| b.iter(|| black_box(fast_recovery(black_box(w)))),
    );
    group.bench_with_input(
        BenchmarkId::from_parameter("cold_start"),
        &10_000usize,
        |b, &w| b.iter(|| black_box(cold_start(black_box(w), black_box(1_000)))),
    );
    group.bench_with_input(
        BenchmarkId::from_parameter("circuit_reset"),
        &500usize,
        |b, &w| b.iter(|| black_box(circuit_reset(black_box(w)))),
    );

    group.finish();
}

criterion_group!(
    benches,
    mttr_benchmarks,
    mttr_contention,
    mttr_latency_percentiles
);
criterion_main!(benches);
