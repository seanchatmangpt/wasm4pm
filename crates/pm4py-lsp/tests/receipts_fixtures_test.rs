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
        prev_receipt_hash: None,
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
        prev_receipt_hash: None,
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
        version: 1,
    };

    persist_fixture(&fixture, base_path).unwrap();

    let fixture_path = base_path
        .join("fixtures/pm4py-parity")
        .join(format!("{}.json", snapshot_id.as_str()));
    assert!(fixture_path.exists());

    let reloaded = reload_fixture(&snapshot_id, base_path).unwrap();
    assert_eq!(fixture, reloaded);
}

#[test]
fn test_fixture_missing_version_defaults_to_1() {
    // A fixture JSON without a "version" field must deserialize with version = 1
    let snapshot_id = SnapshotId::new(&["file:///b.py"], &["import pm4py"], "{}");
    let json_without_version = format!(
        r#"{{"snapshot_id": {}, "data": {{"expected": "output"}}}}"#,
        serde_json::to_string(&snapshot_id).unwrap()
    );
    let fixture: Fixture = serde_json::from_str(&json_without_version)
        .expect("must deserialize fixture without version field");
    assert_eq!(fixture.version, 1, "missing version must default to 1");
}

#[test]
fn test_receipt_merkle_chain() {
    let dir = tempdir().unwrap();
    let base_path = dir.path();

    let snapshot_id = SnapshotId::new(&["file:///chain.py"], &["import pm4py"], "{}");

    // Receipt 1 — no predecessor
    let data1 = json!({"step": 1});
    let canonical1 = wasm4pm_types::hash::canonical_json(&data1).unwrap();
    let hash1 = wasm4pm_types::hash::blake3_string(&canonical1);
    let receipt1 = Receipt {
        id: "chain-receipt-1".to_string(),
        snapshot_id: snapshot_id.clone(),
        data: data1,
        hash: hash1.clone(),
        prev_receipt_hash: None,
    };
    persist_receipt(&receipt1, base_path).unwrap();

    // Receipt 2 — prev = hash of receipt 1
    let data2 = json!({"step": 2});
    let canonical2 = wasm4pm_types::hash::canonical_json(&data2).unwrap();
    let hash2 = wasm4pm_types::hash::blake3_string(&canonical2);
    let receipt2 = Receipt {
        id: "chain-receipt-2".to_string(),
        snapshot_id: snapshot_id.clone(),
        data: data2,
        hash: hash2.clone(),
        prev_receipt_hash: Some(hash1.clone()),
    };
    persist_receipt(&receipt2, base_path).unwrap();

    // Receipt 3 — prev = hash of receipt 2
    let data3 = json!({"step": 3});
    let canonical3 = wasm4pm_types::hash::canonical_json(&data3).unwrap();
    let hash3 = wasm4pm_types::hash::blake3_string(&canonical3);
    let receipt3 = Receipt {
        id: "chain-receipt-3".to_string(),
        snapshot_id: snapshot_id.clone(),
        data: data3,
        hash: hash3.clone(),
        prev_receipt_hash: Some(hash2.clone()),
    };
    persist_receipt(&receipt3, base_path).unwrap();

    let snap_dir = base_path
        .join("receipts/pm4py-lsp")
        .join(snapshot_id.as_str());

    // All three receipts must individually verify
    assert!(verify_receipt_file(&snap_dir.join("chain-receipt-1.json")));
    assert!(verify_receipt_file(&snap_dir.join("chain-receipt-2.json")));
    assert!(verify_receipt_file(&snap_dir.join("chain-receipt-3.json")));

    // Verify the chain links: read back and check prev_receipt_hash fields
    let r1_content = std::fs::read_to_string(snap_dir.join("chain-receipt-1.json")).unwrap();
    let r2_content = std::fs::read_to_string(snap_dir.join("chain-receipt-2.json")).unwrap();
    let r3_content = std::fs::read_to_string(snap_dir.join("chain-receipt-3.json")).unwrap();

    let r1: Receipt = serde_json::from_str(&r1_content).unwrap();
    let r2: Receipt = serde_json::from_str(&r2_content).unwrap();
    let r3: Receipt = serde_json::from_str(&r3_content).unwrap();

    assert!(r1.prev_receipt_hash.is_none(), "first receipt has no predecessor");
    assert_eq!(
        r2.prev_receipt_hash.as_deref(),
        Some(hash1.as_str()),
        "receipt 2 must link to receipt 1 hash"
    );
    assert_eq!(
        r3.prev_receipt_hash.as_deref(),
        Some(hash2.as_str()),
        "receipt 3 must link to receipt 2 hash"
    );
}
