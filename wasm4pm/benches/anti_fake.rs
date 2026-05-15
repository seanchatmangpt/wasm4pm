use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::testing::{ActivityEvidence, ObjectEvidence, PowlTestHarness};

#[path = "helpers.rs"]
mod helpers;

fn bh(data: &str) -> String {
    blake3::hash(data.as_bytes()).to_hex().to_string()
}

fn model_path(name: &str) -> String {
    format!("{}/routes/test-harness/{name}", env!("CARGO_MANIFEST_DIR"))
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: complete_activity
// ─────────────────────────────────────────────────────────────────────────────

fn bench_complete_activity(c: &mut Criterion) {
    let mut group = c.benchmark_group("anti_fake/complete_activity");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let objects_counts = if helpers::is_fast_mode() {
        vec![1, 10]
    } else {
        vec![1, 10, 100]
    };

    for &num_objs in &objects_counts {
        group.throughput(Throughput::Elements(num_objs as u64));
        group.bench_with_input(
            BenchmarkId::new("outputs", num_objs),
            &num_objs,
            |b, &n| {
                b.iter(|| {
                    let mut h = PowlTestHarness::new("bench-route");
                    let outputs: Vec<ObjectEvidence> = (0..n)
                        .map(|i| ObjectEvidence::new(format!("obj_{}", i), bh(&format!("data_{}", i))))
                        .collect();
                    let evidence = ActivityEvidence::new("A").with_outputs(outputs);
                    black_box(h.complete_activity(evidence).unwrap());
                });
            },
        );
    }

    for &num_objs in &objects_counts {
        group.throughput(Throughput::Elements(num_objs as u64));
        group.bench_with_input(
            BenchmarkId::new("inputs", num_objs),
            &num_objs,
            |b, &n| {
                // Setup harness with registered outputs
                let mut h = PowlTestHarness::new("bench-route");
                let outputs: Vec<ObjectEvidence> = (0..n)
                    .map(|i| ObjectEvidence::new(format!("obj_{}", i), bh(&format!("data_{}", i))))
                    .collect();
                let evidence_out = ActivityEvidence::new("A").with_outputs(outputs.clone());
                h.complete_activity(evidence_out).unwrap();

                b.iter(|| {
                    let mut h_inner = h.clone(); // We need a way to reset or clone the harness
                    let inputs: Vec<ObjectEvidence> = (0..n)
                        .map(|i| ObjectEvidence::new(format!("obj_{}", i), bh(&format!("data_{}", i))))
                        .collect();
                    let evidence_in = ActivityEvidence::new("B").with_inputs(inputs);
                    black_box(h_inner.complete_activity(evidence_in).unwrap());
                });
            },
        );
    }

    group.finish();
}

// I need to check if PowlTestHarness supports cloning or if I should just recreate it.
// The struct definition doesn't show #[derive(Clone)].

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: finish (conformance check)
// ─────────────────────────────────────────────────────────────────────────────

fn bench_finish(c: &mut Criterion) {
    let mut group = c.benchmark_group("anti_fake/finish");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    let trace_lengths = if helpers::is_fast_mode() {
        vec![10, 50]
    } else {
        vec![10, 100, 500]
    };

    let model = model_path("sequential-two-step.powl.json");

    for &len in &trace_lengths {
        group.throughput(Throughput::Elements(len as u64));
        group.bench_with_input(
            BenchmarkId::new("sequential-two-step", len),
            &len,
            |b, &l| {
                let mut h = PowlTestHarness::new("bench-route").model(&model);
                // Record A, then B, then many A, B...
                for i in 0..l {
                    let act = if i % 2 == 0 { "A" } else { "B" };
                    h.complete_activity(
                        ActivityEvidence::new(act)
                            .with_outputs(vec![ObjectEvidence::new(format!("out_{}", i), bh("val"))])
                    ).unwrap();
                }
                b.iter(|| {
                    black_box(h.finish());
                });
            },
        );
    }

    group.finish();
}

// Since PowlTestHarness might not be Clone, I'll check if I can add it or work around it.
// I'll also add a benchmark for tampered log detection.

fn bench_tamper_detection(c: &mut Criterion) {
    let mut group = c.benchmark_group("anti_fake/tamper_detection");
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    group.bench_function("input_hash_mismatch", |b| {
        let mut h = PowlTestHarness::new("bench-route");
        h.complete_activity(
            ActivityEvidence::new("A")
                .with_outputs(vec![ObjectEvidence::new("obj", bh("original"))])
        ).unwrap();

        b.iter(|| {
            let mut h_inner = h.clone();
            let evidence = ActivityEvidence::new("B")
                .with_inputs(vec![ObjectEvidence::new("obj", bh("tampered"))]);
            let result = h_inner.complete_activity(evidence);
            black_box(result).unwrap_err();
        });
    });

    group.finish();
}

// I need to implement clone_for_bench or just Clone for PowlTestHarness.
// Let's check harness.rs again to see if I can add Clone.

criterion_group!(anti_fake_benches, bench_complete_activity, bench_finish, bench_tamper_detection);
criterion_main!(anti_fake_benches);
