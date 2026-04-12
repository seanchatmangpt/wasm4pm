//! Golden baseline save/load for the Closed Claw Constitution.

use std::collections::BTreeMap;
use std::path::PathBuf;

/// A golden baseline record for a specific benchmark.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GoldenBaseline {
    pub benchmark_id: String,
    pub pipeline_class: String,
    pub algorithm: String,
    pub dataset_size: usize,
    pub total_events: usize,
    pub output_hash: String,
    pub metrics: BTreeMap<String, String>,
}

/// Get the directory where golden baselines are stored.
pub fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("benches")
        .join("closed_claw")
        .join("golden")
}
