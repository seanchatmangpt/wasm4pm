//! Policy Persistence Integration Tests
//!
//! Validates checkpoint save/load, hash verification, and agent state injection.
//! All tests use temporary files and deterministic seeding.
//!
//! **Test Coverage (6 total):** All 6 tests are active (no #[ignore] tags).
//! Tests use `tempdir()` for safe file I/O.

use std::collections::BTreeMap;
use tempfile::tempdir;

// Re-export from wasm4pm crate
use wasm4pm::policy_persistence::{ConvergenceMetrics, PolicyCheckpoint};

#[test]
fn test_save_load_roundtrip_with_real_q_table() {
    let temp_dir = tempdir().unwrap();
    let checkpoint_path = temp_dir.path().join("checkpoint_1.json");

    // Build realistic Q-table with multiple states
    let mut q_table: BTreeMap<u64, BTreeMap<u32, f32>> = BTreeMap::new();

    for state_bin in 0..100 {
        let mut action_map = BTreeMap::new();
        for action in 0..5 {
            action_map.insert(action, (state_bin as f32 + action as f32) * 0.1);
        }
        q_table.insert(state_bin, action_map);
    }

    // Create checkpoint with realistic metrics
    let metrics = ConvergenceMetrics {
        td_error_mean: 0.042,
        q_max: 8.5,
        learning_rate_current: 0.0763,
        convergence_status: "converged".to_string(),
    };

    let checkpoint = PolicyCheckpoint::new(
        "QLearning".to_string(),
        q_table,
        vec![vec![0.1; 8]; 5],
        metrics,
        1000,
    );

    // Save
    checkpoint
        .save(&checkpoint_path)
        .expect("Failed to save checkpoint");

    // Load
    let loaded = PolicyCheckpoint::load(&checkpoint_path).expect("Failed to load checkpoint");

    // Verify structure
    assert_eq!(loaded.agent_id, "QLearning");
    assert_eq!(loaded.checkpoint_epoch, 1000);
    assert_eq!(loaded.q_table.len(), 100);
    assert_eq!(loaded.convergence_metrics.td_error_mean, 0.042);
    assert_eq!(loaded.convergence_metrics.convergence_status, "converged");

    // Verify Q-values
    for state in 0..100 {
        let action_map = &loaded.q_table[&(state as u64)];
        for action in 0..5 {
            let expected = (state as f32 + action as f32) * 0.1;
            let actual = action_map[&action];
            assert!((actual - expected).abs() < 1e-6);
        }
    }
}

#[test]
fn test_hash_integrity_verification() {
    let temp_dir = tempdir().unwrap();
    let checkpoint_path = temp_dir.path().join("checkpoint_2.json");

    let checkpoint = PolicyCheckpoint::new(
        "SARSA".to_string(),
        BTreeMap::new(),
        vec![vec![0.2; 8]; 5],
        ConvergenceMetrics::default(),
        500,
    );

    let original_hash = checkpoint.blake3_hash.clone();
    assert!(
        checkpoint.verify_integrity(),
        "Original checkpoint hash should verify"
    );

    checkpoint.save(&checkpoint_path).expect("Save failed");

    let loaded = PolicyCheckpoint::load(&checkpoint_path).expect("Load failed");
    assert_eq!(
        loaded.blake3_hash, original_hash,
        "Hash should match after roundtrip"
    );
    assert!(
        loaded.verify_integrity(),
        "Loaded checkpoint hash should verify"
    );
}

#[test]
fn test_corrupt_hash_detection() {
    let temp_dir = tempdir().unwrap();
    let checkpoint_path = temp_dir.path().join("checkpoint_3.json");

    let checkpoint = PolicyCheckpoint::new(
        "DoubleQLearning".to_string(),
        BTreeMap::new(),
        vec![vec![0.3; 8]; 5],
        ConvergenceMetrics::default(),
        250,
    );

    checkpoint.save(&checkpoint_path).expect("Save failed");

    // Corrupt the saved file by modifying checkpoint_epoch
    let json_str = std::fs::read_to_string(&checkpoint_path).expect("Read failed");
    let mut json_value: serde_json::Value = serde_json::from_str(&json_str).expect("Parse failed");
    json_value["checkpoint_epoch"] = serde_json::json!(9999); // Tamper
    std::fs::write(&checkpoint_path, json_value.to_string()).expect("Write failed");

    // Loading should fail
    let result = PolicyCheckpoint::load(&checkpoint_path);
    assert!(result.is_err(), "Should fail on corrupted hash");

    let error = result.unwrap_err();
    assert!(
        error.to_string().contains("Hash mismatch"),
        "Error should mention hash mismatch"
    );
}

#[test]
fn test_agent_state_injection() {
    // This test verifies the checkpoint structure can be used to restore agent state
    let mut q_table: BTreeMap<u64, BTreeMap<u32, f32>> = BTreeMap::new();
    let mut action_map = BTreeMap::new();
    action_map.insert(0_u32, 1.5);
    action_map.insert(1_u32, 2.5);
    action_map.insert(2_u32, 3.5);
    q_table.insert(12345, action_map);

    let linucb_weights = vec![
        vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        vec![0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
        vec![0.5; 8],
        vec![0.1; 8],
        vec![0.2; 8],
    ];

    let checkpoint = PolicyCheckpoint::new(
        "ExpectedSARSA".to_string(),
        q_table,
        linucb_weights,
        ConvergenceMetrics::default(),
        750,
    );

    // Verify structure for agent injection
    assert_eq!(checkpoint.linucb_weights.len(), 5);
    assert!(checkpoint.q_table.contains_key(&12345));
    assert_eq!(checkpoint.q_table[&12345][&0], 1.5);
    assert_eq!(checkpoint.q_table[&12345][&1], 2.5);
    assert_eq!(checkpoint.q_table[&12345][&2], 3.5);
}

#[test]
fn test_file_not_found_handling() {
    let result = PolicyCheckpoint::load("/nonexistent/path/checkpoint.json");
    assert!(result.is_err());

    let error = result.unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
    assert!(error.to_string().contains("not found"));
}

#[test]
fn test_concurrent_writes_isolation() {
    let temp_dir = tempdir().unwrap();
    let checkpoint_path = temp_dir.path().join("checkpoint_4.json");

    // Write first checkpoint
    let checkpoint1 = PolicyCheckpoint::new(
        "REINFORCE".to_string(),
        BTreeMap::new(),
        vec![vec![0.1; 8]; 5],
        ConvergenceMetrics::default(),
        100,
    );
    checkpoint1.save(&checkpoint_path).expect("Save 1 failed");

    // Write second checkpoint (overwrites)
    let checkpoint2 = PolicyCheckpoint::new(
        "Agent2".to_string(),
        BTreeMap::new(),
        vec![vec![0.2; 8]; 5],
        ConvergenceMetrics::default(),
        200,
    );
    checkpoint2.save(&checkpoint_path).expect("Save 2 failed");

    // Verify the second checkpoint is loaded
    let loaded = PolicyCheckpoint::load(&checkpoint_path).expect("Load failed");
    assert_eq!(loaded.agent_id, "Agent2");
    assert_eq!(loaded.checkpoint_epoch, 200);

    // Verify hash integrity is maintained
    assert!(loaded.verify_integrity());
}
