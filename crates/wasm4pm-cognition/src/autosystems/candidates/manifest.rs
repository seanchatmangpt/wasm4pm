//! Manifest-based candidate discovery.
//!
//! Reads a JSON manifest of candidates and dimension specs, validates them,
//! and yields a [`CandidateManifest`]. Available on both native and wasm32.

use crate::autosystems::candidates::{CandidateDiscovery, CandidateManifest};
use serde::{Deserialize, Serialize};

/// Manifest-driven discovery. Construct via [`Self::from_str`] or
/// [`Self::from_path`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestDiscovery {
    /// Source identifier (path or `"<inline>"`).
    pub source: String,
    /// Pre-parsed manifest.
    pub manifest: CandidateManifest,
}

impl ManifestDiscovery {
    /// Construct from raw JSON bytes.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn from_str(source: impl Into<String>, json: &str) -> Result<Self, String> {
        let manifest: CandidateManifest = serde_json::from_str(json)
            .map_err(|e| format!("manifest parse error: {}", e))?;
        manifest.validate()?;
        Ok(Self {
            source: source.into(),
            manifest,
        })
    }

    /// Read a manifest from a path (native only).
    #[cfg(not(target_arch = "wasm32"))]
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn from_path(path: impl AsRef<std::path::Path>) -> Result<Self, String> {
        let p = path.as_ref();
        let body = std::fs::read_to_string(p)
            .map_err(|e| format!("manifest read error {}: {}", p.display(), e))?;
        Self::from_str(p.display().to_string(), &body)
    }
}

impl CandidateDiscovery for ManifestDiscovery {
    fn discover(&self) -> Result<CandidateManifest, String> {
        let mut m = self.manifest.clone();
        for c in &mut m.candidates {
            if c.provenance.is_none() {
                c.provenance = Some(self.source.clone());
            }
        }
        Ok(m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEMO: &str = r#"{
        "version": "1",
        "dimensions": [
            {"key":"latency_ms","unit":"time","direction":"lower_is_better","min":0.0,"max":10000.0}
        ],
        "candidates": [
            {"id":"x","family_id":"demo","runtime_boundaries":["client_wasm"],
             "dimensions":{"latency_ms":42.0}}
        ]
    }"#;

    #[test]
    fn parse_and_validate() {
        let d = ManifestDiscovery::from_str("inline", DEMO).expect("ok");
        let m = d.discover().expect("discover");
        assert_eq!(m.candidates.len(), 1);
        assert_eq!(m.candidates[0].provenance.as_deref(), Some("inline"));
    }

    #[test]
    fn reject_invalid_dimension() {
        let bad = r#"{"version":"1","dimensions":[],"candidates":[
          {"id":"x","family_id":"d","runtime_boundaries":[],
           "dimensions":{"undeclared":1.0}}]}"#;
        assert!(ManifestDiscovery::from_str("inline", bad).is_err());
    }
}
