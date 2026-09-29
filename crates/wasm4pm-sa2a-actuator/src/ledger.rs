use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::ActuatorRefusal;
use crate::resource::{ResourceBudget, ResourceEnvelope};
use crate::resource_admission::ResourceAdmission;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LedgerState {
    Executing,
    Executed,
    UnknownOutcome,
}

/// One durable consequential claim. Resource identity is stored in the same
/// create-new record as the effect claim so allocation and DO cannot drift into
/// independent books.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EffectClaimRecord {
    pub effect_digest: String,
    pub generation: u64,
    pub state: LedgerState,
    pub result_digest: Option<String>,
    #[serde(default)]
    pub allocation_id: Option<String>,
    #[serde(default)]
    pub replay_key: Option<String>,
    #[serde(default)]
    pub requested: Option<ResourceBudget>,
}

pub trait EffectLedger {
    fn claim(&self, effect_digest: &str, generation: u64) -> Result<(), ActuatorRefusal>;

    fn claim_with_allocation(
        &self,
        effect_digest: &str,
        generation: u64,
        envelope: &ResourceEnvelope,
        requested: ResourceBudget,
    ) -> Result<(), ActuatorRefusal>;

    fn complete(
        &self,
        effect_digest: &str,
        generation: u64,
        result_digest: &str,
    ) -> Result<(), ActuatorRefusal>;

    fn mark_unknown(&self, effect_digest: &str, generation: u64)
        -> Result<(), ActuatorRefusal>;

    fn recover_unknown_outcomes(&self) -> Result<usize, ActuatorRefusal>;

    fn record(
        &self,
        effect_digest: &str,
        generation: u64,
    ) -> Result<Option<EffectClaimRecord>, ActuatorRefusal>;
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
        let hex = effect_digest
            .strip_prefix("sha256:")
            .ok_or(ActuatorRefusal::InvalidDigest)?;
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

    fn write_new(&self, path: &Path, entry: &EffectClaimRecord) -> Result<(), ActuatorRefusal> {
        let bytes = serde_json::to_vec(entry)?;
        let mut file = OpenOptions::new().create_new(true).write(true).open(path)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        Ok(())
    }

    fn read(&self, path: &Path) -> Result<EffectClaimRecord, ActuatorRefusal> {
        Ok(serde_json::from_slice(&fs::read(path)?)?)
    }

    fn transition(
        &self,
        from: &Path,
        to: &Path,
        entry: &EffectClaimRecord,
    ) -> Result<(), ActuatorRefusal> {
        let tmp = to.with_extension("tmp");
        let bytes = serde_json::to_vec(entry)?;
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&tmp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&tmp, to)?;
        if from.exists() {
            fs::remove_file(from)?;
        }
        Ok(())
    }

    fn existing(&self, key: &str) -> Result<Option<EffectClaimRecord>, ActuatorRefusal> {
        for state in [
            LedgerState::Executed,
            LedgerState::UnknownOutcome,
            LedgerState::Executing,
        ] {
            let path = self.path(key, state);
            if path.exists() {
                return Ok(Some(self.read(&path)?));
            }
        }
        Ok(None)
    }

    fn refusal_for_existing(
        existing: &EffectClaimRecord,
        expected_allocation: Option<(&ResourceEnvelope, ResourceBudget)>,
    ) -> ActuatorRefusal {
        match existing.state {
            LedgerState::Executed => ActuatorRefusal::AlreadyExecuted,
            LedgerState::UnknownOutcome => ActuatorRefusal::UnknownOutcome,
            LedgerState::Executing => {
                if let Some((envelope, requested)) = expected_allocation {
                    if existing.allocation_id.as_deref() != Some(envelope.allocation_id.as_str())
                        || existing.replay_key.as_deref() != Some(envelope.replay_key.as_str())
                        || existing.requested != Some(requested)
                    {
                        return ActuatorRefusal::AllocationClaimMismatch;
                    }
                }
                ActuatorRefusal::AlreadyClaimed
            }
        }
    }

    fn claim_record(
        &self,
        effect_digest: &str,
        generation: u64,
        allocation: Option<(&ResourceEnvelope, ResourceBudget)>,
    ) -> Result<(), ActuatorRefusal> {
        let key = Self::key(effect_digest, generation)?;

        if let Some(existing) = self.existing(&key)? {
            return Err(Self::refusal_for_existing(&existing, allocation));
        }

        let (allocation_id, replay_key, requested) = match allocation {
            Some((envelope, requested)) => (
                Some(envelope.allocation_id.clone()),
                Some(envelope.replay_key.clone()),
                Some(requested),
            ),
            None => (None, None, None),
        };

        let entry = EffectClaimRecord {
            effect_digest: effect_digest.into(),
            generation,
            state: LedgerState::Executing,
            result_digest: None,
            allocation_id,
            replay_key,
            requested,
        };

        self.write_new(&self.path(&key, LedgerState::Executing), &entry)
            .map_err(|error| match error {
                ActuatorRefusal::LedgerIo(ref io)
                    if io.kind() == std::io::ErrorKind::AlreadyExists =>
                {
                    ActuatorRefusal::AlreadyClaimed
                }
                other => other,
            })
    }
}

impl EffectLedger for FileEffectLedger {
    fn claim(&self, effect_digest: &str, generation: u64) -> Result<(), ActuatorRefusal> {
        self.claim_record(effect_digest, generation, None)
    }

    fn claim_with_allocation(
        &self,
        effect_digest: &str,
        generation: u64,
        envelope: &ResourceEnvelope,
        requested: ResourceBudget,
    ) -> Result<(), ActuatorRefusal> {
        ResourceAdmission::admit(envelope, effect_digest, generation, requested)?;
        self.claim_record(
            effect_digest,
            generation,
            Some((envelope, requested)),
        )
    }

    fn complete(
        &self,
        effect_digest: &str,
        generation: u64,
        result_digest: &str,
    ) -> Result<(), ActuatorRefusal> {
        let key = Self::key(effect_digest, generation)?;
        let from = self.path(&key, LedgerState::Executing);
        if !from.exists() {
            return Err(ActuatorRefusal::UnknownOutcome);
        }

        let mut entry = self.read(&from)?;
        entry.state = LedgerState::Executed;
        entry.result_digest = Some(result_digest.into());
        self.transition(&from, &self.path(&key, LedgerState::Executed), &entry)
    }

    fn mark_unknown(
        &self,
        effect_digest: &str,
        generation: u64,
    ) -> Result<(), ActuatorRefusal> {
        let key = Self::key(effect_digest, generation)?;
        let from = self.path(&key, LedgerState::Executing);
        if !from.exists() {
            return Ok(());
        }

        let mut entry = self.read(&from)?;
        entry.state = LedgerState::UnknownOutcome;
        entry.result_digest = None;
        self.transition(
            &from,
            &self.path(&key, LedgerState::UnknownOutcome),
            &entry,
        )
    }

    fn recover_unknown_outcomes(&self) -> Result<usize, ActuatorRefusal> {
        let mut count = 0;

        for item in fs::read_dir(&self.root)? {
            let path = item?.path();
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !name.ends_with(".executing.json") {
                continue;
            }

            let key = name.trim_end_matches(".executing.json");
            let executed = self.path(key, LedgerState::Executed);
            let unknown = self.path(key, LedgerState::UnknownOutcome);

            // A crash after the target state became durable but before cleanup
            // may leave the old executing file. Prefer the terminal state.
            if executed.exists() || unknown.exists() {
                fs::remove_file(&path)?;
                continue;
            }

            let mut entry = self.read(&path)?;
            entry.state = LedgerState::UnknownOutcome;
            entry.result_digest = None;
            self.transition(&path, &unknown, &entry)?;
            count += 1;
        }

        Ok(count)
    }

    fn record(
        &self,
        effect_digest: &str,
        generation: u64,
    ) -> Result<Option<EffectClaimRecord>, ActuatorRefusal> {
        let key = Self::key(effect_digest, generation)?;
        self.existing(&key)
    }
}
