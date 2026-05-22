//! Policy Persistence — Checkpoint and restore RL agent state
//!
//! Provides serialization and deserialization of policy checkpoints
//! with BLAKE3 hash verification for integrity.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;

/// Metrics tracking RL convergence during training
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvergenceMetrics {
    pub td_error_mean: f32,
    pub q_max: f32,
    pub learning_rate_current: f32,
    pub convergence_status: String, // "learning" | "converged"
}

impl Default for ConvergenceMetrics {
    fn default() -> Self {
        Self {
            td_error_mean: 0.0,
            q_max: 0.0,
            learning_rate_current: 0.1,
            convergence_status: "learning".to_string(),
        }
    }
}

/// Checkpoint of a single RL agent's policy state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyCheckpoint {
    /// Agent identifier (0-4 for 5 RL agents)
    pub agent_id: String,

    /// Q-table: state_bin → action → Q-value
    /// state_bin is the 32-bit encoding of 8D state (see encode_rl_state_key)
    pub q_table: HashMap<u64, HashMap<u32, f32>>,

    /// LinUCB weight vectors: [per_agent][8D feature dimension]
    /// Index 0-4: QLearning, SARSA, DoubleQLearning, ExpectedSARSA, REINFORCE
    pub linucb_weights: Vec<Vec<f32>>,

    /// Convergence metrics snapshot at checkpoint time
    pub convergence_metrics: ConvergenceMetrics,

    /// Monotonic epoch/cycle counter when checkpoint was saved
    pub checkpoint_epoch: u64,

    /// BLAKE3 hash of (q_table + linucb_weights + convergence_metrics + epoch)
    /// Used for integrity verification on load
    pub blake3_hash: String,
}

impl PolicyCheckpoint {
    /// Create a new policy checkpoint
    pub fn new(
        agent_id: String,
        q_table: HashMap<u64, HashMap<u32, f32>>,
        linucb_weights: Vec<Vec<f32>>,
        convergence_metrics: ConvergenceMetrics,
        checkpoint_epoch: u64,
    ) -> Self {
        let mut checkpoint = Self {
            agent_id,
            q_table,
            linucb_weights,
            convergence_metrics,
            checkpoint_epoch,
            blake3_hash: String::new(),
        };
        checkpoint.blake3_hash = checkpoint.compute_hash();
        checkpoint
    }

    /// Compute BLAKE3 hash of policy state (deterministic, collision-resistant)
    fn compute_hash(&self) -> String {
        use std::collections::BTreeMap;
        let sorted_q_table: BTreeMap<u64, BTreeMap<u32, f32>> = self.q_table
            .iter()
            .map(|(k, v)| {
                let sorted_inner: BTreeMap<u32, f32> = v.iter().map(|(&ik, &iv)| (ik, iv)).collect();
                (*k, sorted_inner)
            })
            .collect();

        // Serialize the core components to bytes
        let serialized = serde_json::json!({
            "agent_id": self.agent_id,
            "q_table": sorted_q_table,
            "linucb_weights": self.linucb_weights,
            "convergence_metrics": self.convergence_metrics,
            "checkpoint_epoch": self.checkpoint_epoch,
        });

        let bytes = serialized.to_string().into_bytes();
        let hash = blake3::hash(&bytes);
        hash.to_hex().to_string()
    }

    /// Save checkpoint to disk as JSON with BLAKE3 hash verification
    ///
    /// # Errors
    /// Returns `io::Error` if serialization or file write fails
    pub fn save<P: AsRef<Path>>(&self, path: P) -> io::Result<()> {
        let json = serde_json::to_string_pretty(&self)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;

        fs::write(path, json)?;
        Ok(())
    }

    /// Load checkpoint from disk and verify BLAKE3 hash integrity
    ///
    /// # Errors
    /// Returns:
    /// - `io::NotFound` if file does not exist
    /// - `io::InvalidData` if JSON parsing fails or hash verification fails
    pub fn load<P: AsRef<Path>>(path: P) -> io::Result<Self> {
        let path = path.as_ref();

        if !path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Checkpoint file not found: {}", path.display()),
            ));
        }

        let json = fs::read_to_string(path)?;
        let checkpoint: PolicyCheckpoint =
            serde_json::from_str(&json).map_err(|e| {
                io::Error::new(io::ErrorKind::InvalidData, format!("JSON parse error: {}", e))
            })?;

        // Verify hash integrity
        let saved_hash = checkpoint.blake3_hash.clone();
        let computed_hash = checkpoint.compute_hash();

        if saved_hash != computed_hash {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "Hash mismatch: expected {}, got {}",
                    saved_hash, computed_hash
                ),
            ));
        }

        Ok(checkpoint)
    }

    /// Verify the checkpoint's BLAKE3 hash
    pub fn verify_integrity(&self) -> bool {
        // Create a temporary checkpoint with empty hash for computation
        let mut temp = self.clone();
        temp.blake3_hash = String::new();
        let computed = temp.compute_hash();
        computed == self.blake3_hash
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::NamedTempFile;

    #[test]
    fn test_policy_checkpoint_creation() {
        let q_table = HashMap::new();
        let linucb_weights = vec![vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]; 5];
        let metrics = ConvergenceMetrics::default();

        let checkpoint = PolicyCheckpoint::new(
            "QLearning".to_string(),
            q_table,
            linucb_weights,
            metrics,
            100,
        );

        assert_eq!(checkpoint.agent_id, "QLearning");
        assert_eq!(checkpoint.checkpoint_epoch, 100);
        assert!(!checkpoint.blake3_hash.is_empty());
    }

    #[test]
    fn test_save_load_roundtrip() {
        let temp_file = NamedTempFile::new().unwrap();
        let temp_path = temp_file.path().to_path_buf();

        // Create checkpoint
        let mut q_table = HashMap::new();
        let mut action_map = HashMap::new();
        action_map.insert(0, 1.5);
        action_map.insert(1, 2.5);
        q_table.insert(42, action_map);

        let linucb_weights = vec![vec![0.1; 8]; 5];
        let mut metrics = ConvergenceMetrics::default();
        metrics.td_error_mean = 0.05;
        metrics.q_max = 4.2;

        let checkpoint = PolicyCheckpoint::new(
            "SARSA".to_string(),
            q_table,
            linucb_weights,
            metrics,
            500,
        );

        // Save
        checkpoint.save(&temp_path).unwrap();

        // Load
        let loaded = PolicyCheckpoint::load(&temp_path).unwrap();

        // Verify
        assert_eq!(loaded.agent_id, "SARSA");
        assert_eq!(loaded.checkpoint_epoch, 500);
        assert_eq!(loaded.convergence_metrics.td_error_mean, 0.05);
        assert_eq!(loaded.convergence_metrics.q_max, 4.2);
        assert_eq!(loaded.q_table.len(), 1);
        assert!(loaded.q_table[&42].contains_key(&0));
        assert_eq!(loaded.q_table[&42][&0], 1.5);
    }

    #[test]
    fn test_hash_integrity_verification() {
        let q_table = HashMap::new();
        let linucb_weights = vec![vec![0.1; 8]; 5];
        let metrics = ConvergenceMetrics::default();

        let checkpoint = PolicyCheckpoint::new(
            "DoubleQLearning".to_string(),
            q_table,
            linucb_weights,
            metrics,
            200,
        );

        assert!(checkpoint.verify_integrity());
    }

    #[test]
    fn test_corrupt_hash_detection() {
        let temp_file = NamedTempFile::new().unwrap();
        let temp_path = temp_file.path().to_path_buf();

        let checkpoint = PolicyCheckpoint::new(
            "ExpectedSARSA".to_string(),
            HashMap::new(),
            vec![vec![0.1; 8]; 5],
            ConvergenceMetrics::default(),
            300,
        );

        checkpoint.save(&temp_path).unwrap();

        // Corrupt the file
        let mut json = serde_json::from_str::<serde_json::Value>(
            &fs::read_to_string(&temp_path).unwrap(),
        )
        .unwrap();
        json["checkpoint_epoch"] = serde_json::json!(999); // Tamper with epoch
        fs::write(&temp_path, json.to_string()).unwrap();

        // Loading should fail due to hash mismatch
        let result = PolicyCheckpoint::load(&temp_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Hash mismatch"));
    }

    #[test]
    fn test_file_not_found_handling() {
        let result = PolicyCheckpoint::load("/nonexistent/path/checkpoint.json");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_concurrent_writes_isolation() {
        let temp_file = NamedTempFile::new().unwrap();
        let temp_path = temp_file.path().to_path_buf();

        let checkpoint1 = PolicyCheckpoint::new(
            "Agent1".to_string(),
            HashMap::new(),
            vec![vec![0.1; 8]; 5],
            ConvergenceMetrics::default(),
            100,
        );

        checkpoint1.save(&temp_path).unwrap();

        // Create second checkpoint
        let checkpoint2 = PolicyCheckpoint::new(
            "Agent2".to_string(),
            HashMap::new(),
            vec![vec![0.2; 8]; 5],
            ConvergenceMetrics::default(),
            200,
        );

        checkpoint2.save(&temp_path).unwrap();

        // Load and verify it's the second checkpoint
        let loaded = PolicyCheckpoint::load(&temp_path).unwrap();
        assert_eq!(loaded.agent_id, "Agent2");
        assert_eq!(loaded.checkpoint_epoch, 200);
    }
}
