use pm4py_lsp::fixtures::{persist_fixture, reload_fixture, Fixture};
use pm4py_lsp::receipts::{persist_receipt, verify_receipt_file, Receipt, SnapshotId};
use serde_json::json;
use tempfile::tempdir;

#[test]
fn test_snapshot_id_determinism() {
    let uris = ["file:///a.py", "file:///b.py"];
    let contents = ["import pm4py", "import pandas"];
    let config = "{}";

    let id1 = SnapshotId::new(&uris, &contents, config);
    let id2 = SnapshotId::new(&uris, &contents, config);

    assert_eq!(id1, id2);

    let id3 = SnapshotId::new(&uris, &["import pm4py", "import pandas as pd"], config);
    assert_ne!(id1, id3);
}

#[test]
fn test_receipt_persistence() {
    let dir = tempdir().unwrap();
    let base_path = dir.path();

    let snapshot_id = SnapshotId::new(&["file:///a.py"], &["import pm4py"], "{}");
    let data = json!({"status": "ok"});
    let canonical = wasm4pm_types::hash::canonical_json(&data).unwrap();
    let hash = wasm4pm_types::hash::blake3_string(&canonical);
    let receipt = Receipt {
        id: "receipt1".to_string(),
        snapshot_id: snapshot_id.clone(),
        data,
        hash,
    };

    persist_receipt(&receipt, base_path).unwrap();

    let receipt_path = base_path
        .join("receipts/pm4py-lsp")
        .join(snapshot_id.as_str())
        .join("receipt1.json");
    assert!(verify_receipt_file(&receipt_path));
}

#[test]
fn test_corrupt_receipt_refusal() {
    let dir = tempdir().unwrap();
    let base_path = dir.path();

    let snapshot_id = SnapshotId::new(&["file:///a.py"], &["import pm4py"], "{}");
    let data = json!({"status": "ok"});
    let canonical = wasm4pm_types::hash::canonical_json(&data).unwrap();
    let hash = wasm4pm_types::hash::blake3_string(&canonical);
    let mut receipt = Receipt {
        id: "receipt1".to_string(),
        snapshot_id: snapshot_id.clone(),
        data,
        hash,
    };

    persist_receipt(&receipt, base_path).unwrap();
    let receipt_path = base_path
        .join("receipts/pm4py-lsp")
        .join(snapshot_id.as_str())
        .join("receipt1.json");
    assert!(verify_receipt_file(&receipt_path));

    // Corrupt the hash
    receipt.hash = "corrupted_hash_value".to_string();
    persist_receipt(&receipt, base_path).unwrap();
    assert!(
        !verify_receipt_file(&receipt_path),
        "Should refuse receipt with corrupted hash"
    );

    // Reset hash, corrupt the data
    receipt.hash = wasm4pm_types::hash::blake3_string(&canonical);
    receipt.data = json!({"status": "tampered_data"});
    persist_receipt(&receipt, base_path).unwrap();
    assert!(
        !verify_receipt_file(&receipt_path),
        "Should refuse receipt with tampered data"
    );
}

#[test]
fn test_fixture_persistence() {
    let dir = tempdir().unwrap();
    let base_path = dir.path();

    let snapshot_id = SnapshotId::new(&["file:///a.py"], &["import pm4py"], "{}");
    let fixture = Fixture {
        snapshot_id: snapshot_id.clone(),
        data: json!({"expected": "output"}),
    };

    persist_fixture(&fixture, base_path).unwrap();

    let fixture_path = base_path
        .join("fixtures/pm4py-parity")
        .join(format!("{}.json", snapshot_id.as_str()));
    assert!(fixture_path.exists());

    let reloaded = reload_fixture(&snapshot_id, base_path).unwrap();
    assert_eq!(fixture, reloaded);
}
