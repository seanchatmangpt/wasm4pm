use blake3::Hasher;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SnapshotId(String);

impl SnapshotId {
    pub fn new(uris: &[&str], contents: &[&str], config: &str) -> Self {
        let mut hasher = Hasher::new();
        hasher.update(&(uris.len() as u64).to_le_bytes());
        for uri in uris {
            hasher.update(&(uri.len() as u64).to_le_bytes());
            hasher.update(uri.as_bytes());
        }
        hasher.update(&(contents.len() as u64).to_le_bytes());
        for content in contents {
            hasher.update(&(content.len() as u64).to_le_bytes());
            hasher.update(content.as_bytes());
        }
        hasher.update(&(config.len() as u64).to_le_bytes());
        hasher.update(config.as_bytes());
        Self(hasher.finalize().to_hex().to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

pub fn generate_snapshot_id(uris: &[&str], contents: &[&str], config: &str) -> SnapshotId {
    SnapshotId::new(uris, contents, config)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Receipt {
    pub id: String,
    pub snapshot_id: SnapshotId,
    pub data: serde_json::Value,
    pub hash: String,
}

pub fn persist_receipt(receipt: &Receipt, base_path: &Path) -> std::io::Result<()> {
    let snapshot_dir = base_path
        .join("receipts/pm4py-lsp")
        .join(receipt.snapshot_id.as_str());
    fs::create_dir_all(&snapshot_dir)?;

    let receipt_path = snapshot_dir.join(format!("{}.json", receipt.id));
    let content = serde_json::to_string_pretty(receipt)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(receipt_path, content)?;

    Ok(())
}

pub fn verify_receipt_file(receipt_path: &Path) -> bool {
    let content = match fs::read_to_string(receipt_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let receipt: Receipt = match serde_json::from_str(&content) {
        Ok(r) => r,
        Err(_) => return false,
    };
    let canonical = match wasm4pm_types::hash::canonical_json(&receipt.data) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let expected_hash = wasm4pm_types::hash::blake3_string(&canonical);
    receipt.hash == expected_hash
}
