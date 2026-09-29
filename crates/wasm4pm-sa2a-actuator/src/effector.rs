use std::fs;
use std::path::{Component, Path, PathBuf};

use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::error::ActuatorRefusal;
use crate::wire::PreparedEffect;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EffectorOutcome {
    pub result_digest: String,
}

pub trait Effector {
    fn capability(&self) -> &'static str;
    fn perform(&self, effect: &PreparedEffect) -> Result<EffectorOutcome, ActuatorRefusal>;
}

#[derive(Debug, Clone)]
pub struct Utf8FileWriteEffector {
    root: PathBuf,
}

impl Utf8FileWriteEffector {
    pub fn new(root: impl Into<PathBuf>) -> Result<Self, ActuatorRefusal> {
        let root = root.into();
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    fn admitted_relative(value: &str) -> Result<&Path, ActuatorRefusal> {
        let path = Path::new(value);
        if path.is_absolute()
            || path
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err(ActuatorRefusal::PathRefused);
        }
        Ok(path)
    }
}

impl Effector for Utf8FileWriteEffector {
    fn capability(&self) -> &'static str {
        "fs.write_utf8"
    }

    fn perform(&self, effect: &PreparedEffect) -> Result<EffectorOutcome, ActuatorRefusal> {
        if effect.capability != self.capability() {
            return Err(ActuatorRefusal::EffectorMismatch);
        }
        let Value::Object(payload) = &effect.payload else {
            return Err(ActuatorRefusal::InvalidEffect);
        };
        let relative = payload
            .get("relative_path")
            .and_then(Value::as_str)
            .ok_or(ActuatorRefusal::InvalidEffect)?;
        let content = payload
            .get("content")
            .and_then(Value::as_str)
            .ok_or(ActuatorRefusal::InvalidEffect)?;
        let relative = Self::admitted_relative(relative)?;
        let target = self.root.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let tmp = target.with_extension("sa2a.tmp");
        fs::write(&tmp, content.as_bytes())?;
        fs::rename(tmp, &target)?;
        let digest = Sha256::digest(content.as_bytes());
        Ok(EffectorOutcome {
            result_digest: format!("sha256:{digest:x}"),
        })
    }
}
