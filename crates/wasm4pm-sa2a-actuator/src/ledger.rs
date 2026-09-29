use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::ActuatorRefusal;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LedgerState {
    Executing,
    Executed,
    UnknownOutcome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Entry {
    effect_digest: String,
    generation: u64,
    state: LedgerState,
    result_digest: Option<String>,
}

pub trait EffectLedger {
    fn claim(&self, effect_digest: &str, generation: u64) -> Result<(), ActuatorRefusal>;
    fn complete(&self, effect_digest: &str, generation: u64, result_digest: &str) -> Result<(), ActuatorRefusal>;
    fn mark_unknown(&self, effect_digest: &str, generation: u64) -> Result<(), ActuatorRefusal>;
    fn recover_unknown_outcomes(&self) -> Result<usize, ActuatorRefusal>;
}

#[derive(Debug, Clone)]
pub struct FileEffectLedger {
    root: PathBuf,
}

impl FileEffectLedger {
    pub fn new(root: impl Into<PathBuf>) -> Result<Self, ActuatorRefusal> {
        let root = root.into();
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    fn key(effect_digest: &str, generation: u64) -> Result<String, ActuatorRefusal> {
        let hex = effect_digest.strip_prefix("sha256:").ok_or(ActuatorRefusal::InvalidDigest)?;
        if hex.len() != 64 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(ActuatorRefusal::InvalidDigest);
        }
        Ok(format!("{hex}.{generation}"))
    }

    fn path(&self, key: &str, state: LedgerState) -> PathBuf {
        let suffix = match state {
            LedgerState::Executing => "executing",
            LedgerState::Executed => "executed",
            LedgerState::UnknownOutcome => "unknown",
        };
        self.root.join(format!("{key}.{suffix}.json"))
    }

    fn write_new(&self, path: &Path, entry: &Entry) -> Result<(), ActuatorRefusal> {
        let bytes = serde_json::to_vec(entry)?;
        let mut file = OpenOptions::new().create_new(true).write(true).open(path)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        Ok(())
    }

    fn transition(&self, from: &Path, to: &Path, entry: &Entry) -> Result<(), ActuatorRefusal> {
        let tmp = to.with_extension("tmp");
        let bytes = serde_json::to_vec(entry)?;
        let mut file = OpenOptions::new().create(true).truncate(true).write(true).open(&tmp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&tmp, to)?;
        if from.exists() {
            fs::remove_file(from)?;
        }
        Ok(())
    }
}

impl EffectLedger for FileEffectLedger {
    fn claim(&self, effect_digest: &str, generation: u64) -> Result<(), ActuatorRefusal> {
        let key = Self::key(effect_digest, generation)?;
        if self.path(&key, LedgerState::Executed).exists() {
            return Err(ActuatorRefusal::AlreadyExecuted);
        }
        if self.path(&key, LedgerState::UnknownOutcome).exists() {
            return Err(ActuatorRefusal::UnknownOutcome);
        }
        let entry = Entry { effect_digest: effect_digest.into(), generation, state: LedgerState::Executing, result_digest: None };
        self.write_new(&self.path(&key, LedgerState::Executing), &entry)
            .map_err(|e| match e {
                ActuatorRefusal::LedgerIo(ref io) if io.kind() == std::io::ErrorKind::AlreadyExists => ActuatorRefusal::AlreadyClaimed,
                other => other,
            })
    }

    fn complete(&self, effect_digest: &str, generation: u64, result_digest: &str) -> Result<(), ActuatorRefusal> {
        let key = Self::key(effect_digest, generation)?;
        let from = self.path(&key, LedgerState::Executing);
        if !from.exists() {
            return Err(ActuatorRefusal::UnknownOutcome);
        }
        let entry = Entry { effect_digest: effect_digest.into(), generation, state: LedgerState::Executed, result_digest: Some(result_digest.into()) };
        self.transition(&from, &self.path(&key, LedgerState::Executed), &entry)
    }

    fn mark_unknown(&self, effect_digest: &str, generation: u64) -> Result<(), ActuatorRefusal> {
        let key = Self::key(effect_digest, generation)?;
        let from = self.path(&key, LedgerState::Executing);
        if !from.exists() { return Ok(()); }
        let entry = Entry { effect_digest: effect_digest.into(), generation, state: LedgerState::UnknownOutcome, result_digest: None };
        self.transition(&from, &self.path(&key, LedgerState::UnknownOutcome), &entry)
    }

    fn recover_unknown_outcomes(&self) -> Result<usize, ActuatorRefusal> {
        let mut count = 0;
        for item in fs::read_dir(&self.root)? {
            let path = item?.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            if !name.ends_with(".executing.json") { continue; }
            let bytes = fs::read(&path)?;
            let mut entry: Entry = serde_json::from_slice(&bytes)?;
            entry.state = LedgerState::UnknownOutcome;
            let key = name.trim_end_matches(".executing.json");
            self.transition(&path, &self.path(key, LedgerState::UnknownOutcome), &entry)?;
            count += 1;
        }
        Ok(count)
    }
}
