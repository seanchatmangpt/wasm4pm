//! Criterion benchmarks for self-conformance checking.
//!
//! Measures the throughput of `PowlTestHarness` recording and verification.
//! This proves that the testing harness itself is performant at scale.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::fs;
use std::time::Duration;
use wasm4pm::testing::{ActivityEvidence, ObjectEvidence, PowlTestHarness};

#[path = "helpers.rs"]
mod helpers;

fn bh(data: &str) -> String {
    blake3::hash(data.as_bytes()).to_hex().to_string()
}

/// Setup a simple loop model for benchmarking.
fn setup_model(path: &str) {
    let content = r#"{
        "powl_expression": "* ( A, tau )",
        "required_activities": ["A"]
    }"#;
    fs::write(path, content).expect("failed to write benchmark model");
}

fn bench_recording(c: &mut Criterion) {
    let mut group = c.benchmark_group("self_conformance/recording");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for size in [1_000, 10_000, 100_000] {
        if helpers::is_fast_mode() && size > 1_000 {
            continue;
        }

        group.throughput(Throughput::Elements(size as u64));

        // Benchmark record_activity (name only)
        group.bench_with_input(BenchmarkId::new("record_activity", size), &size, |b, &s| {
            b.iter(|| {
                let mut h = PowlTestHarness::new("bench-route");
                for _ in 0..s {
                    h.record_activity("A");
                }
                black_box(h)
            });
        });

        // Benchmark complete_activity (with evidence chaining)
        group.bench_with_input(
            BenchmarkId::new("complete_activity", size),
            &size,
            |b, &s| {
                b.iter(|| {
                    let mut h = PowlTestHarness::new("bench-route");

                    // Initial activity produces the first object
                    let mut prev_obj = "init".to_string();
                    let mut prev_hash = bh("init");
                    h.complete_activity(
                        ActivityEvidence::new("start")
                            .with_outputs(vec![ObjectEvidence::new(&prev_obj, &prev_hash)]),
                    )
                    .unwrap();

                    for i in 0..s {
                        let next_obj = format!("obj_{}", i);
                        let next_hash = bh(&next_obj);

                        h.complete_activity(
                            ActivityEvidence::new("A")
                                .with_inputs(vec![ObjectEvidence::new(&prev_obj, &prev_hash)])
                                .with_outputs(vec![ObjectEvidence::new(&next_obj, &next_hash)]),
                        )
                        .unwrap();

                        prev_obj = next_obj;
                        prev_hash = next_hash;
                    }
                    black_box(h)
                });
            },
        );
    }
    group.finish();
}

fn bench_verification(c: &mut Criterion) {
    let mut group = c.benchmark_group("self_conformance/verification");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
        group.measurement_time(Duration::from_secs(5));
    }

    let model_path = "benches/self_conformance_model.powl.json";
    setup_model(model_path);

    for size in [1_000, 10_000, 100_000] {
        if helpers::is_fast_mode() && size > 1_000 {
            continue;
        }

        group.throughput(Throughput::Elements(size as u64));

        // Use record_activity to fill the harness
        group.bench_with_input(BenchmarkId::new("finish", size), &size, |b, &s| {
            b.iter_with_setup(
                || {
                    let mut h = PowlTestHarness::new("bench-route").model(model_path);
                    for _ in 0..s {
                        h.record_activity("A");
                    }
                    h
                },
                |h| {
                    black_box(h.finish());
                },
            );
        });
    }

    fs::remove_file(model_path).ok();
    group.finish();
}

fn bench_ocel_export(c: &mut Criterion) {
    let mut group = c.benchmark_group("self_conformance/ocel_export");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for size in [1_000, 10_000, 100_000] {
        if helpers::is_fast_mode() && size > 1_000 {
            continue;
        }

        group.throughput(Throughput::Elements(size as u64));

        group.bench_with_input(BenchmarkId::new("export_ocel", size), &size, |b, &s| {
            b.iter_with_setup(
                || {
                    let mut h = PowlTestHarness::new("bench-route");
                    for i in 0..s {
                        h.record_activity("A");
                        if i % 10 == 0 {
                            // Add some evidence occasionally to make OCEL more interesting
                            h.complete_activity(ActivityEvidence::new("B").with_outputs(vec![
                                ObjectEvidence::new("obj", bh(&i.to_string())),
                            ]))
                            .ok();
                        }
                    }
                    h
                },
                |h| {
                    black_box(h.export_ocel());
                },
            );
        });
    }
    group.finish();
}

criterion_group!(
    self_conformance_benches,
    bench_recording,
    bench_verification,
    bench_ocel_export
);
criterion_main!(self_conformance_benches);
