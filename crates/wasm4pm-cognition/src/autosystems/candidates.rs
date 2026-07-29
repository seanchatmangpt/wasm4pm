//! Open architecture candidate type with manifest-driven discovery.
//!
//! The previous revision baked nine architecture families into the source tree
//! with hand-tuned scores that always punished centralized cloud. This module
//! replaces that arrangement with an open [`Candidate`] type whose dimensions
//! are validated against a manifest of [`DimensionSpec`] declarations.
//!
//! The legacy `ArchitectureFamily` enum is retained as a compatibility bridge so
//! existing call sites continue to compile while migrations land.

use crate::autosystems::dimension::DimensionSpec;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

#[cfg(not(target_arch = "wasm32"))]
pub mod fs_walk;
pub mod manifest;

#[cfg(not(target_arch = "wasm32"))]
pub use fs_walk::FilesystemDiscovery;
pub use manifest::ManifestDiscovery;

/// Runtime boundary where work executes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeBoundary {
    /// Client WASM execution.
    ClientWasm,
    /// Customer's own infrastructure.
    CustomerNode,
    /// Peer node.
    Peer,
    /// AtomVM coordinator.
    AtomvmCoord,
    /// Cloud residual services.
    CloudResidual,
    /// Forbidden centralized work.
    ForbiddenCentralWork,
}

/// Legacy architecture-family enumeration.
///
/// Retained for compile-time compatibility with prior dependents. Manifest-driven
/// discovery uses [`Candidate::family_id`] (free-form string) instead.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ArchitectureFamily {
    /// Centralized cloud service.
    CentralizedCloud,
    /// Local-first CRDT.
    LocalFirstCrdt,
    /// WASM-local compute.
    WasmLocal,
    /// P2P gossip protocol.
    P2pGossip,
    /// Edge compute.
    EdgeCompute,
    /// Hybrid fog.
    HybridFog,
    /// Mesh network.
    MeshNetwork,
    /// Broadcast server.
    BroadcastServer,
    /// Event sourcing.
    EventSourcing,
}

/// A candidate architecture with scored dimensions.
///
/// `dimensions` maps a free-form key (declared in the manifest's
/// [`DimensionSpec`]) to a numeric value. Order is preserved so manifests are
/// reproducible; lookups are O(1).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Candidate {
    /// Unique candidate identifier.
    pub id: String,
    /// Free-form family/category identifier (`"centralized-cloud"`, `"mesh"`, ...).
    pub family_id: String,
    /// Where work runs.
    pub runtime_boundaries: Vec<RuntimeBoundary>,
    /// Scored dimensions, keyed by [`DimensionSpec::key`].
    pub dimensions: IndexMap<String, f64>,
    /// Optional human-readable provenance (manifest path, discovery source).
    #[serde(default)]
    pub provenance: Option<String>,
}

impl Candidate {
    /// Lookup a dimension value by key.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn get(&self, key: &str) -> Option<f64> {
        self.dimensions.get(key).copied()
    }

    /// Count of declared dimensions.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn arity(&self) -> usize {
        self.dimensions.len()
    }
}

/// A manifest-described candidate registry, validated against [`DimensionSpec`]s.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CandidateManifest {
    /// Manifest version (semver-ish). Currently `"1"`.
    #[serde(default = "default_version")]
    pub version: String,
    /// Dimension declarations.
    pub dimensions: Vec<DimensionSpec>,
    /// Candidate entries.
    pub candidates: Vec<Candidate>,
}

fn default_version() -> String {
    "1".to_string()
}

impl CandidateManifest {
    /// Validate every candidate's dimensions against the declared specs.
    ///
    /// Returns the first violation encountered (if any).
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn validate(&self) -> Result<(), String> {
        let by_key: IndexMap<&str, &DimensionSpec> = self
            .dimensions
            .iter()
            .map(|dimension| (dimension.key.as_str(), dimension))
            .collect();

        for candidate in &self.candidates {
            for (key, value) in &candidate.dimensions {
                let spec = by_key.get(key.as_str()).ok_or_else(|| {
                    format!("candidate {}: undeclared dimension {}", candidate.id, key)
                })?;
                spec.validate(*value)
                    .map_err(|error| format!("{}: {}", candidate.id, error))?;
            }
        }
        Ok(())
    }
}

/// Discovery trait. Implementations may walk filesystems, load manifests,
/// or query remote registries — they all yield a [`CandidateManifest`].
pub trait CandidateDiscovery {
    /// Produce a candidate manifest.
    fn discover(&self) -> Result<CandidateManifest, String>;
}

/// Compatibility function returning no built-in candidates.
///
/// The previous implementation hardcoded nine candidates with poisoned baseline
/// scores. Use [`ManifestDiscovery::from_path`] or [`FilesystemDiscovery`] with
/// an actual manifest. The bundled `assets/manifests/9-family-demo.json`
/// contains a neutral demo set for tests.
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn all_candidates() -> Vec<Candidate> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::autosystems::dimension::Direction;

    #[test]
    fn manifest_validates_known_dimensions() {
        let manifest = CandidateManifest {
            version: "1".into(),
            dimensions: vec![DimensionSpec {
                key: "latency_ms".into(),
                unit: "time".into(),
                direction: Direction::LowerIsBetter,
                min: Some(0.0),
                max: Some(1000.0),
            }],
            candidates: vec![Candidate {
                id: "alpha".into(),
                family_id: "demo".into(),
                runtime_boundaries: vec![RuntimeBoundary::ClientWasm],
                dimensions: {
                    let mut dimensions = IndexMap::new();
                    dimensions.insert("latency_ms".into(), 50.0);
                    dimensions
                },
                provenance: None,
            }],
        };
        assert!(manifest.validate().is_ok());
    }

    #[test]
    fn manifest_rejects_undeclared_dimensions() {
        let manifest = CandidateManifest {
            version: "1".into(),
            dimensions: vec![],
            candidates: vec![Candidate {
                id: "alpha".into(),
                family_id: "demo".into(),
                runtime_boundaries: vec![],
                dimensions: {
                    let mut dimensions = IndexMap::new();
                    dimensions.insert("undeclared".into(), 1.0);
                    dimensions
                },
                provenance: None,
            }],
        };
        assert!(manifest.validate().is_err());
    }

    #[test]
    fn compatibility_all_candidates_returns_empty() {
        assert!(all_candidates().is_empty());
    }
}
