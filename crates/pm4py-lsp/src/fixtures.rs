use crate::receipts::SnapshotId;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Fixture {
    pub snapshot_id: SnapshotId,
    pub data: serde_json::Value,
}

pub fn persist_fixture(fixture: &Fixture, base_path: &Path) -> std::io::Result<()> {
    let fixture_dir = base_path.join("fixtures/pm4py-parity");
    fs::create_dir_all(&fixture_dir)?;

    let fixture_path = fixture_dir.join(format!("{}.json", fixture.snapshot_id.as_str()));
    let content = serde_json::to_string_pretty(fixture)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(fixture_path, content)?;

    Ok(())
}

pub fn reload_fixture(snapshot_id: &SnapshotId, base_path: &Path) -> std::io::Result<Fixture> {
    let fixture_dir = base_path.join("fixtures/pm4py-parity");
    let fixture_path = fixture_dir.join(format!("{}.json", snapshot_id.as_str()));
    let content = fs::read_to_string(fixture_path)?;
    let fixture: Fixture = serde_json::from_str(&content)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    Ok(fixture)
}

