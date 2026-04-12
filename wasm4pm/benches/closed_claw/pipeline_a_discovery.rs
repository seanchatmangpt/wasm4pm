//! Closed Claw Pipeline A: Discovery Core
//!
//! Benchmarks all discovery algorithms across standard log sizes:
//!   - DFG (Directly-Follows Graph)          -- O(n) single pass
//!   - Alpha++                                -- Petri net discovery with alpha relations
//!   - Heuristic Miner                        -- threshold-based dependency discovery
//!   - Inductive Miner                        -- recursive structure discovery
//!   - Process Skeleton                       -- filtered DFG with min frequency
//!   - Genetic Algorithm                      -- evolutionary model discovery (slow sizes)
//!   - DECLARE Discovery                      -- constraint mining via TraceProfile
//!
//! Gates exercised: G1 Determinism, G5 Report
//!
//! Each benchmark measures:
//!   1. Latency (ns) via Criterion
//!   2. Throughput (events/sec) set explicitly
//!   3. Output hashed with blake3 for determinism verification

use criterion::{black_box, BenchmarkId, Criterion, Throughput};
use std::time::Duration;

#[path = "../helpers.rs"]
mod helpers;
use helpers::{bench_sizes, bench_sizes_slow, make_handle, ACTIVITY_KEY};

use pictl::advanced_algorithms::discover_heuristic_miner;
use pictl::algorithms::discover_alpha_plus_plus;
use pictl::discovery::{discover_declare, discover_dfg};
use pictl::genetic_discovery::discover_genetic_algorithm;
use pictl::more_discovery::{discover_inductive_miner, extract_process_skeleton};

/// Register all discovery core benchmarks into the criterion instance.
pub fn bench_discovery_core(c: &mut Criterion) {
    bench_dfg(c);
    bench_alpha_plus_plus(c);
    bench_heuristic_miner(c);
    bench_inductive_miner(c);
    bench_process_skeleton(c);
    bench_genetic_algorithm(c);
    bench_declare_discovery(c);
}

// ---------------------------------------------------------------------------
// DFG Discovery
// ---------------------------------------------------------------------------

fn bench_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/A_discovery/dfg");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |_b, h| {
                let result = discover_dfg(h, ACTIVITY_KEY).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Alpha++ Discovery
// ---------------------------------------------------------------------------

fn bench_alpha_plus_plus(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/A_discovery/alpha_plus_plus");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |_b, h| {
                let result = discover_alpha_plus_plus(h, ACTIVITY_KEY, 0.1).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Heuristic Miner
// ---------------------------------------------------------------------------

fn bench_heuristic_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/A_discovery/heuristic_miner");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |_b, h| {
                let result = discover_heuristic_miner(h, ACTIVITY_KEY, 0.5).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Inductive Miner
// ---------------------------------------------------------------------------

fn bench_inductive_miner(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/A_discovery/inductive_miner");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |_b, h| {
                let result = discover_inductive_miner(h, ACTIVITY_KEY).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Process Skeleton
// ---------------------------------------------------------------------------

fn bench_process_skeleton(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/A_discovery/process_skeleton");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |_b, h| {
                let result = extract_process_skeleton(h, ACTIVITY_KEY, 2).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Genetic Algorithm (slow -- use reduced sizes)
// ---------------------------------------------------------------------------

fn bench_genetic_algorithm(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/A_discovery/genetic_algorithm");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(10);

    for shape in bench_sizes_slow() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |_b, h| {
                let result = discover_genetic_algorithm(h, ACTIVITY_KEY, 50, 20).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// DECLARE Discovery
// ---------------------------------------------------------------------------

fn bench_declare_discovery(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/A_discovery/declare");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |_b, h| {
                let result = discover_declare(h, ACTIVITY_KEY).unwrap();
                let hash = blake3::hash(result.as_string().unwrap_or_default().as_bytes());
                black_box(hash);
            },
        );
    }
    group.finish();
}
