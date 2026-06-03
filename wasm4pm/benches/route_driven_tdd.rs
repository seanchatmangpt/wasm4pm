use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::fs;
use std::path::PathBuf;
use wasm4pm::testing::{ActivityEvidence, ObjectEvidence, PowlTestHarness};

fn bh(data: &str) -> String {
    blake3::hash(data.as_bytes()).to_hex().to_string()
}

fn model_path(name: &str) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("routes");
    path.push("test-harness");
    path.push(name);
    path
}

fn bench_route_evaluation(c: &mut Criterion) {
    let mut group = c.benchmark_group("route_evaluation");

    group.bench_function("sequential_2_step", |b| {
        let model = model_path("sequential-two-step.powl.json");
        b.iter(|| {
            let mut harness = PowlTestHarness::new("sequential-ab-route").model(&model);
            harness
                .complete_activity(
                    ActivityEvidence::new("A")
                        .with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))]),
                )
                .unwrap();
            harness
                .complete_activity(
                    ActivityEvidence::new("B")
                        .with_inputs(vec![ObjectEvidence::new("a-out", bh("A:output"))])
                        .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
                )
                .unwrap();
            black_box(harness.finish());
        });
    });

    group.bench_function("sequential_3_step", |b| {
        let model = model_path("sequential-three-step.powl.json");
        b.iter(|| {
            let mut harness = PowlTestHarness::new("three-step-route").model(&model);
            harness
                .complete_activity(
                    ActivityEvidence::new("A")
                        .with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))]),
                )
                .unwrap();
            harness
                .complete_activity(
                    ActivityEvidence::new("B")
                        .with_inputs(vec![ObjectEvidence::new("a-out", bh("A:output"))])
                        .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
                )
                .unwrap();
            harness
                .complete_activity(
                    ActivityEvidence::new("C")
                        .with_inputs(vec![ObjectEvidence::new("b-out", bh("B:output"))])
                        .with_outputs(vec![ObjectEvidence::new("c-out", bh("C:output"))]),
                )
                .unwrap();
            black_box(harness.finish());
        });
    });

    group.bench_function("sequential_5_step", |b| {
        let model = model_path("test-lifecycle.powl.json");
        b.iter(|| {
            let mut harness = PowlTestHarness::new("lifecycle-route").model(&model);
            harness.record_activity("test.started");
            harness.record_activity("command.executed");
            harness.record_activity("output.captured");
            harness.record_activity("assertion.checked");
            harness.record_activity("test.completed");
            black_box(harness.finish());
        });
    });

    group.bench_function("concurrent_2_step", |b| {
        let model = model_path("concurrent-two-step.powl.json");
        b.iter(|| {
            let mut harness = PowlTestHarness::new("concurrent-ab-route").model(&model);
            harness
                .complete_activity(
                    ActivityEvidence::new("A")
                        .with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))]),
                )
                .unwrap();
            harness
                .complete_activity(
                    ActivityEvidence::new("B")
                        .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
                )
                .unwrap();
            black_box(harness.finish());
        });
    });

    // Synthetic scalability test
    group.bench_function("synthetic_sequential_20_step", |b| {
        let mut nodes = Vec::new();
        let mut order = Vec::new();
        for i in 0..20 {
            nodes.push(format!("node{}", i));
            if i > 0 {
                order.push(format!("node{}-->node{}", i - 1, i));
            }
        }
        let powl = format!(
            "PO=(nodes={{{}}}, order={{{}}})",
            nodes.join(", "),
            order.join(", ")
        );
        let spec = serde_json::json!({
            "powl_expression": powl,
            "required_activities": nodes
        });

        let temp_dir = std::env::temp_dir();
        let model_file = temp_dir.join("synthetic-20.powl.json");
        fs::write(&model_file, spec.to_string()).unwrap();

        b.iter(|| {
            let mut harness = PowlTestHarness::new("synthetic-route").model(&model_file);
            for i in 0..20 {
                harness.record_activity(format!("node{}", i));
            }
            black_box(harness.finish());
        });

        let _ = fs::remove_file(model_file);
    });

    group.finish();
}

fn bench_tdd_loop_overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("tdd_loop_overhead");

    group.bench_function("record_activity_only_10", |b| {
        b.iter(|| {
            let mut harness = PowlTestHarness::new("record-only");
            for _ in 0..10 {
                harness.record_activity(black_box("Activity"));
            }
            black_box(harness.events());
        });
    });

    group.bench_function("complete_activity_only_10", |b| {
        b.iter(|| {
            let mut harness = PowlTestHarness::new("complete-only");

            // First activity (output only)
            let out0 = bh("obj0");
            harness
                .complete_activity(
                    ActivityEvidence::new("Activity0")
                        .with_outputs(vec![ObjectEvidence::new("obj0", out0.clone())]),
                )
                .unwrap();

            let mut last_id = "obj0".to_string();
            let mut last_hash = out0;

            for i in 1..10 {
                let next_id = format!("obj{}", i);
                let next_hash = bh(&next_id);
                harness
                    .complete_activity(
                        ActivityEvidence::new(format!("Activity{}", i))
                            .with_inputs(vec![ObjectEvidence::new(last_id, last_hash)])
                            .with_outputs(vec![ObjectEvidence::new(
                                next_id.clone(),
                                next_hash.clone(),
                            )]),
                    )
                    .unwrap();
                last_id = next_id;
                last_hash = next_hash;
            }
            black_box(harness.events());
        });
    });

    group.bench_function("export_ocel_100_events", |b| {
        let mut harness = PowlTestHarness::new("export-bench");
        for i in 0..100 {
            harness.record_activity(format!("Activity{}", i));
        }
        b.iter(|| {
            black_box(harness.export_ocel());
        });
    });

    group.bench_function("harness_init_finish_no_model", |b| {
        b.iter(|| {
            let harness = PowlTestHarness::new("init-finish");
            black_box(harness.finish());
        });
    });

    group.finish();
}

criterion_group!(benches, bench_route_evaluation, bench_tdd_loop_overhead);
criterion_main!(benches);
