use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pm4py_lsp::fixtures::{persist_fixture, Fixture};
use pm4py_lsp::receipts::{verify_receipt_file, Receipt, SnapshotId};
use pm4py_lsp::Backend;
use tower_lsp_max::lsp_types::Url;
use tower_lsp_max::LanguageServer;

fn bench_fixture_write_latency(c: &mut Criterion) {
    let dir = tempfile::tempdir().unwrap();
    let base_path = dir.path().to_path_buf();

    let facts = pm4py_lsp::analysis::PipelineFacts::extract("import pm4py");
    let snapshot_id = SnapshotId::new(&["file:///event_pipeline.py"], &["import pm4py"], "{}");
    let fixture = Fixture {
        version: 1,
        snapshot_id,
        data: serde_json::to_value(&facts).unwrap(),
    };

    c.bench_function("B4_fixture_write_latency", |b| {
        b.iter(|| {
            persist_fixture(black_box(&fixture), black_box(&base_path)).unwrap();
        })
    });
}

fn bench_receipt_verify_latency(c: &mut Criterion) {
    let dir = tempfile::tempdir().unwrap();
    let base_path = dir.path().to_path_buf();

    let data = serde_json::json!({"test": "value"});
    let canonical = wasm4pm_types::hash::canonical_json(&data).unwrap();
    let hash = wasm4pm_types::hash::blake3_string(&canonical);
    let receipt = Receipt {
        id: "test-receipt-id".to_string(),
        snapshot_id: SnapshotId::new(&["file:///test.py"], &["print('hello')"], "{}"),
        data,
        hash,
        prev_receipt_hash: None,
    };

    let snapshot_dir = base_path
        .join("receipts/pm4py-lsp")
        .join(receipt.snapshot_id.as_str());
    std::fs::create_dir_all(&snapshot_dir).unwrap();
    let receipt_path = snapshot_dir.join(format!("{}.json", receipt.id));
    let content = serde_json::to_string_pretty(&receipt).unwrap();
    std::fs::write(&receipt_path, content).unwrap();

    c.bench_function("B5_receipt_verify_latency", |b| {
        b.iter(|| {
            let verified = verify_receipt_file(black_box(&receipt_path));
            assert!(verified);
        })
    });
}

fn bench_conformance_vector_latency(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let (service, _) = tower_lsp_max::LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let uri = Url::parse("file:///test.py").unwrap();
    let text = "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\n";

    rt.block_on(async {
        backend
            .documents
            .lock()
            .await
            .insert(uri.clone(), text.to_string());
    });

    let snapshot_id = rt.block_on(async { backend.max_snapshot().await.unwrap() });

    c.bench_function("B7_conformance_vector_latency", |b| {
        b.iter(|| {
            rt.block_on(async {
                let cv = backend
                    .max_conformance_vector(black_box(snapshot_id.clone()))
                    .await
                    .unwrap();
                black_box(cv);
            });
        })
    });
}

criterion_group!(
    benches,
    bench_fixture_write_latency,
    bench_receipt_verify_latency,
    bench_conformance_vector_latency
);
criterion_main!(benches);
