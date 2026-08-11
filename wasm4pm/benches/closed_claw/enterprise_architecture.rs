//! Challenger enterprise-architecture benchmark rail.
//!
//! These scenarios measure the economics of architectural decision-making rather
//! than isolated algorithm latency. The point is to quantify how many reversible,
//! deterministic process hypotheses wasm4pm can manufacture and receipt before an
//! enterprise would normally pay the latency/cost of one human or LLM decision.
//!
//! Metrics exposed through Criterion names:
//! - hypothesis portfolio: multiple independent process representations per decision
//! - policy sweep: many admissible heuristic policies before irreversible selection
//! - receipt tax: incremental cost of binding candidate outputs into a deterministic receipt
//! - optionality density: lawful candidate evaluations per millisecond

use criterion::{black_box, BenchmarkId, Criterion, Throughput};
use std::time::Duration;

#[path = "../helpers.rs"]
mod helpers;
use helpers::{make_handle, BenchShape, ACTIVITY_KEY};

use wasm4pm::advanced_algorithms::discover_heuristic_miner;
use wasm4pm::algorithms::discover_alpha_plus_plus;
use wasm4pm::discovery::{discover_declare, discover_dfg};
use wasm4pm::more_discovery::{discover_inductive_miner, extract_process_skeleton};

const PORTFOLIO_ALTERNATIVES: u64 = 6;
const POLICY_ALTERNATIVES: u64 = 9;

fn enterprise_shapes() -> [BenchShape; 3] {
    [
        BenchShape {
            num_cases: 100,
            events_per_case: 10,
            num_activities: 7,
        },
        BenchShape {
            num_cases: 1_000,
            events_per_case: 10,
            num_activities: 12,
        },
        BenchShape {
            num_cases: 10_000,
            events_per_case: 10,
            num_activities: 20,
        },
    ]
}

fn hash_js(value: wasm_bindgen::JsValue) -> blake3::Hash {
    blake3::hash(value.as_string().unwrap_or_default().as_bytes())
}

/// Manufacture six different process hypotheses for the same observation before
/// selecting one. This models an architecture review that preserves reversible
/// options instead of committing to the first model produced.
fn bench_hypothesis_portfolio(c: &mut Criterion) {
    let mut group = c.benchmark_group("challenger/enterprise/hypothesis_portfolio");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);

    for shape in enterprise_shapes() {
        let (handle, _) = make_handle(&shape);
        group.throughput(Throughput::Elements(PORTFOLIO_ALTERNATIVES));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| {
                b.iter(|| {
                    let hashes = [
                        hash_js(discover_dfg(h, ACTIVITY_KEY).expect("DFG discovery")),
                        hash_js(
                            discover_heuristic_miner(h, ACTIVITY_KEY, 0.5)
                                .expect("heuristic discovery"),
                        ),
                        hash_js(
                            discover_alpha_plus_plus(h, ACTIVITY_KEY, 0.1)
                                .expect("alpha++ discovery"),
                        ),
                        hash_js(
                            discover_inductive_miner(h, ACTIVITY_KEY)
                                .expect("inductive discovery"),
                        ),
                        hash_js(discover_declare(h, ACTIVITY_KEY).expect("DECLARE discovery")),
                        hash_js(
                            extract_process_skeleton(h, ACTIVITY_KEY, 2)
                                .expect("skeleton discovery"),
                        ),
                    ];
                    black_box(hashes)
                });
            },
        );
    }
    group.finish();
}

/// Sweep nine dependency thresholds for the same observation. This measures the
/// cost of exploring policy space before selecting an architectural constraint.
fn bench_policy_space_sweep(c: &mut Criterion) {
    let mut group = c.benchmark_group("challenger/enterprise/policy_space_sweep");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);

    for shape in enterprise_shapes() {
        let (handle, _) = make_handle(&shape);
        group.throughput(Throughput::Elements(POLICY_ALTERNATIVES));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| {
                b.iter(|| {
                    let mut hashes = Vec::with_capacity(POLICY_ALTERNATIVES as usize);
                    for threshold in [0.1_f64, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] {
                        let result = discover_heuristic_miner(h, ACTIVITY_KEY, threshold)
                            .expect("heuristic policy candidate");
                        hashes.push(hash_js(result));
                    }
                    black_box(hashes)
                });
            },
        );
    }
    group.finish();
}

/// Isolate the cryptographic/evidence overhead after candidate manufacture. The
/// output is a deterministic Merkle-like fold over six model hashes, allowing the
/// benchmark report to express receipt cost as a fraction of decision cost.
fn bench_receipt_tax(c: &mut Criterion) {
    let mut group = c.benchmark_group("challenger/enterprise/receipt_tax");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(50);

    for shape in enterprise_shapes() {
        let (handle, _) = make_handle(&shape);
        let candidates = [
            hash_js(discover_dfg(&handle, ACTIVITY_KEY).expect("DFG discovery")),
            hash_js(
                discover_heuristic_miner(&handle, ACTIVITY_KEY, 0.5)
                    .expect("heuristic discovery"),
            ),
            hash_js(
                discover_alpha_plus_plus(&handle, ACTIVITY_KEY, 0.1)
                    .expect("alpha++ discovery"),
            ),
            hash_js(
                discover_inductive_miner(&handle, ACTIVITY_KEY)
                    .expect("inductive discovery"),
            ),
            hash_js(discover_declare(&handle, ACTIVITY_KEY).expect("DECLARE discovery")),
            hash_js(
                extract_process_skeleton(&handle, ACTIVITY_KEY, 2)
                    .expect("skeleton discovery"),
            ),
        ];

        group.throughput(Throughput::Bytes((candidates.len() * 32) as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &candidates,
            |b, hashes| {
                b.iter(|| {
                    let mut receipt = blake3::Hasher::new();
                    receipt.update(b"wasm4pm:enterprise-decision:v1");
                    for hash in hashes {
                        receipt.update(hash.as_bytes());
                    }
                    black_box(receipt.finalize())
                });
            },
        );
    }
    group.finish();
}

/// Combine model-family and policy alternatives into one reversible architecture
/// search envelope: six independent hypotheses plus nine policy candidates.
/// Criterion throughput therefore reports candidate evaluations/second directly.
fn bench_optionality_density(c: &mut Criterion) {
    let mut group = c.benchmark_group("challenger/enterprise/optionality_density");
    group.measurement_time(Duration::from_secs(8));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(20);

    for shape in enterprise_shapes() {
        let (handle, _) = make_handle(&shape);
        let candidates = PORTFOLIO_ALTERNATIVES + POLICY_ALTERNATIVES;
        group.throughput(Throughput::Elements(candidates));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &handle,
            |b, h| {
                b.iter(|| {
                    let mut receipt = blake3::Hasher::new();
                    receipt.update(b"wasm4pm:optionality:v1");

                    for result in [
                        discover_dfg(h, ACTIVITY_KEY).expect("DFG discovery"),
                        discover_heuristic_miner(h, ACTIVITY_KEY, 0.5)
                            .expect("heuristic discovery"),
                        discover_alpha_plus_plus(h, ACTIVITY_KEY, 0.1)
                            .expect("alpha++ discovery"),
                        discover_inductive_miner(h, ACTIVITY_KEY)
                            .expect("inductive discovery"),
                        discover_declare(h, ACTIVITY_KEY).expect("DECLARE discovery"),
                        extract_process_skeleton(h, ACTIVITY_KEY, 2)
                            .expect("skeleton discovery"),
                    ] {
                        receipt.update(hash_js(result).as_bytes());
                    }

                    for threshold in [0.1_f64, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] {
                        let result = discover_heuristic_miner(h, ACTIVITY_KEY, threshold)
                            .expect("heuristic policy candidate");
                        receipt.update(hash_js(result).as_bytes());
                    }

                    black_box(receipt.finalize())
                });
            },
        );
    }
    group.finish();
}

pub fn bench_enterprise_architecture(c: &mut Criterion) {
    bench_hypothesis_portfolio(c);
    bench_policy_space_sweep(c);
    bench_receipt_tax(c);
    bench_optionality_density(c);
}
