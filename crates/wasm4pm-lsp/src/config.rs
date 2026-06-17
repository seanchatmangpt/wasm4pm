use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// LSP-relevant subset of a `wasm4pm.toml` file.
///
/// Only the sections that affect LSP behaviour are parsed; unknown keys are
/// ignored so this can safely deserialise any wasm4pm.toml version.
#[derive(Deserialize, Default, Clone, Debug)]
#[serde(default)]
pub struct LspConfig {
    pub membrane: MembraneConfig,
    pub algorithm: AlgorithmConfig,
    pub observability: ObservabilityConfig,
    pub ocpq: OcpqConfig,
    pub model: ModelConfig,
    /// VS Code settings overlay — merged at runtime, not from toml.
    #[serde(skip)]
    pub settings_overlay: Option<Value>,
}

/// `[membrane]` — conformance-checking policy.
#[derive(Deserialize, Clone, Debug)]
#[serde(default)]
pub struct MembraneConfig {
    /// When `false` the LSP emits no conformance diagnostics at all.
    pub enabled: bool,
    /// Fitness score below which a Gall FIT verdict is downgraded to DEVIATION.
    pub fitness_threshold: Option<f32>,
}

impl Default for MembraneConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            fitness_threshold: None,
        }
    }
}

/// `[algorithm]` — discovery algorithm selection.
#[derive(Deserialize, Default, Clone, Debug)]
#[serde(default)]
pub struct AlgorithmConfig {
    /// Algorithm name shown in code-lens titles, e.g. `"dfg"`.
    pub name: Option<String>,
}

/// `[observability]` — logging verbosity.
#[derive(Deserialize, Default, Clone, Debug)]
#[serde(default)]
pub struct ObservabilityConfig {
    #[serde(rename = "logLevel")]
    pub log_level: Option<String>,
}

/// `[ocpq]` — OCPQ constraint evaluation.
#[derive(Deserialize, Default, Clone, Debug)]
#[serde(default)]
pub struct OcpqConfig {
    /// Path to a `wasm4pm.ocpq.json` file containing a serialized `ocpq::QueryTree`.
    pub constraints_file: Option<String>,
}

/// `[model]` — process model references.
#[derive(Deserialize, Default, Clone, Debug)]
#[serde(default)]
pub struct ModelConfig {
    /// Relative path to an OCPN model file (for `textDocument/documentLink`).
    pub ocpn_model: Option<String>,
}

impl LspConfig {
    /// Search upward from `start` for a `wasm4pm.toml` and parse it.
    /// Returns `Default` if no file is found or it cannot be parsed.
    pub fn load_from_workspace(start: &Path) -> Self {
        if let Some(path) = find_upward(start, "wasm4pm.toml") {
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Ok(cfg) = toml::from_str::<LspConfig>(&text) {
                    return cfg;
                }
            }
        }
        LspConfig::default()
    }

    /// Reload from the given path directly (used on `didChangeWatchedFiles`).
    pub fn reload_from(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|t| toml::from_str::<LspConfig>(&t).ok())
            .unwrap_or_default()
    }
}

/// Walk upward from `dir` looking for `filename`; returns the first match.
fn find_upward(dir: &Path, filename: &str) -> Option<PathBuf> {
    let mut current = if dir.is_file() { dir.parent()? } else { dir }.to_path_buf();
    loop {
        let candidate = current.join(filename);
        if candidate.exists() {
            return Some(candidate);
        }
        match current.parent() {
            Some(p) => current = p.to_path_buf(),
            None => return None,
        }
    }
}
