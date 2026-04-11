//! Closed Claw Benchmarking Constitution -- Main Harness
//!
//! 6 canonical pipeline classes, 5 pass/fail gates, receipt bundles.

#[path = "../helpers.rs"]
mod helpers;

mod autonomic_loop;
mod golden;
mod rl_algorithms;
mod gates;
pub mod metrics;
mod pipeline_a_discovery;
mod pipeline_b_conformance;
mod pipeline_c_ocel;
mod pipeline_d_semantic;
mod pipeline_e_manufacturing;
mod pipeline_f_ml;
mod receipt;
mod registry;

use criterion::{criterion_group, criterion_main, Criterion};
use std::time::Duration;

fn closed_claw_benchmarks(c: &mut Criterion) {
    pipeline_a_discovery::bench_discovery_core(c);
    pipeline_b_conformance::bench_conformance_core(c);
    pipeline_c_ocel::bench_ocel_core(c);
    pipeline_d_semantic::bench_semantic_proof(c);
    pipeline_e_manufacturing::bench_manufacturing_truth(c);
    pipeline_f_ml::bench_ml_augmented(c);
}

criterion_group! {
    name = closed_claw;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(10))
        .warm_up_time(Duration::from_secs(2))
        .sample_size(20);
    targets = closed_claw_benchmarks
}

criterion_group! {
    name = autonomic_loop;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(10))
        .warm_up_time(Duration::from_secs(2))
        .sample_size(50);
    targets = autonomic_loop::bench_autonomic_loop
}

criterion_group! {
    name = rl_algorithms;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(10))
        .warm_up_time(Duration::from_secs(2))
        .sample_size(20);
    targets = rl_algorithms::bench_rl_algorithms
}

criterion_main!(closed_claw, autonomic_loop, rl_algorithms);
