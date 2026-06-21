use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Default, Debug)]
pub struct Config {
    #[serde(default)]
    pub values: BTreeMap<String, String>,
}

impl Config {
    /// Loads configuration from '.wasm4pm/config.json' (local) or '~/.wasm4pm/config.json' (global).
    /// Returns a default Config if no file is found.
    pub fn load() -> Result<Self> {
        // Try local .wasm4pm/config.json first
        let local_path = Path::new(".wasm4pm/config.json");
        if local_path.exists() {
            let content = fs::read_to_string(local_path)
                .with_context(|| format!("Failed to read local config at {:?}", local_path))?;
            return serde_json::from_str(&content)
                .with_context(|| format!("Failed to parse local config at {:?}", local_path));
        }

        // Try global ~/.wasm4pm/config.json
        if let Some(global_path) = Self::global_config_path() {
            if global_path.exists() {
                let content = fs::read_to_string(&global_path).with_context(|| {
                    format!("Failed to read global config at {:?}", global_path)
                })?;
                return serde_json::from_str(&content).with_context(|| {
                    format!("Failed to parse global config at {:?}", global_path)
                });
            }
        }

        Ok(Config::default())
    }

    /// Saves the configuration.
    /// Prefers the local path if '.wasm4pm/' directory exists, otherwise saves to the global path.
    pub fn save(&self) -> Result<()> {
        let content =
            serde_json::to_string_pretty(self).context("Failed to serialize configuration")?;

        // Prefer local if .wasm4pm/ directory exists
        let local_dir = Path::new(".wasm4pm");
        if local_dir.exists() && local_dir.is_dir() {
            let local_path = local_dir.join("config.json");
            fs::write(&local_path, content)
                .with_context(|| format!("Failed to write local config to {:?}", local_path))?;
            return Ok(());
        }

        // Otherwise save to global
        if let Some(global_path) = Self::global_config_path() {
            if let Some(parent) = global_path.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("Failed to create config directory {:?}", parent))?;
            }
            fs::write(&global_path, content)
                .with_context(|| format!("Failed to write global config to {:?}", global_path))?;
            return Ok(());
        }

        anyhow::bail!(
            "Could not determine a valid path to save configuration. (Home directory not found)"
        )
    }

    /// Returns the global configuration path (~/.wasm4pm/config.json)
    fn global_config_path() -> Option<PathBuf> {
        let home = if cfg!(windows) {
            std::env::var("USERPROFILE").ok()
        } else {
            std::env::var("HOME").ok()
        };

        home.map(|h| PathBuf::from(h).join(".wasm4pm").join("config.json"))
    }

    /// Gets a value from the configuration
    pub fn get(&self, key: &str) -> Option<&String> {
        self.values.get(key)
    }

    /// Sets a value in the configuration
    pub fn set(&mut self, key: String, value: String) {
        self.values.insert(key, value);
    }
}
