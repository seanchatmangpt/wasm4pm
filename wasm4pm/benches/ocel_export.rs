use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use serde_json::Value;
use std::time::Duration;
use wasm4pm::testing::harness::TestEvent;
use wasm4pm::testing::ocel_exporter::export_ocel;
use wasm4pm::testing::proof_pack::ProofPackWriter;

#[path = "helpers.rs"]
mod helpers;

fn generate_test_events(n: usize) -> Vec<TestEvent> {
    (0..n)
        .map(|i| TestEvent {
            activity: format!("activity_{}", i % 20),
            object_ids: vec![format!("obj_{}", i), format!("obj_{}", i + 1)],
        })
        .collect()
}

fn bench_ocel_export(c: &mut Criterion) {
    let mut group = c.benchmark_group("ocel/export");
    group.measurement_time(Duration::from_secs(5));

    for size in [100, 1000, 10000] {
        let events = generate_test_events(size);
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(BenchmarkId::from_parameter(size), &events, |b, events| {
            b.iter(|| export_ocel(events, "bench-route"))
        });
    }
    group.finish();
}

fn bench_ocel_serialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("ocel/serialization");

    for size in [100, 1000, 10000] {
        let events = generate_test_events(size);
        let doc = export_ocel(&events, "bench-route");

        group.throughput(Throughput::Bytes(
            serde_json::to_string(&doc).unwrap().len() as u64,
        ));
        group.bench_with_input(BenchmarkId::from_parameter(size), &doc, |b, doc| {
            b.iter(|| serde_json::to_string(doc).unwrap())
        });
    }
    group.finish();
}

fn bench_proof_pack_write(c: &mut Criterion) {
    let mut group = c.benchmark_group("proof_pack/write_ocel");
    let writer = ProofPackWriter::for_test("bench-run");
    let events = generate_test_events(1000);
    let doc = export_ocel(&events, "bench-route");

    group.bench_function("1000_events", |b| {
        b.iter(|| writer.write_ocel(&doc).unwrap())
    });
    group.finish();

    // Cleanup
    let _ = std::fs::remove_dir_all(writer.dir());
}

criterion_group!(
    ocel_benches,
    bench_ocel_export,
    bench_ocel_serialization,
    bench_proof_pack_write
);
criterion_main!(ocel_benches);
