#![doc = "Binary data structures for wasm4pm process mining platform."]
#![doc = ""]
#![doc = "This crate defines the canonical types that all functions pass around:"]
#![doc = "- Event log formats (EventLog, OCEL)"]
#![doc = "- Process models (DFG, PetriNet, DeclareModel)"]
#![doc = "- Conformance results (ConformanceResult, TokenReplayResult)"]
#![doc = "- Provenance and hashing (ProvenanceChain, BLAKE3 operations)"]

pub mod conformance;
pub mod error;
pub mod event_log;
pub mod hash;
pub mod models;
pub mod ocel;
pub mod provenance;
pub mod dense_kernel;
pub mod mask;
pub mod powl8_op;
pub mod choice_graph;
pub mod import;

// Re-exports for convenience
pub use conformance::{ConformanceResult, TokenReplayResult};
pub use error::{Error, Result};
pub use event_log::{AttributeValue, Attributes, Event, EventLog, Trace, Attribute, XESEditableAttribute};
pub use hash::Blake3Hash;
pub use models::{
    DFGEdge, DFGNode, DeclareConstraint, DeclareModel, PetriNet, Arc, Place,
    Transition, FlatIncidenceMatrix, DFG,
};
pub use ocel::{OCELEvent, OCELObject, OCEL};
pub use provenance::ProvenanceChain;
pub use choice_graph::{ChoiceGraph, ChoiceGraphNode, ChoiceGraphError};

/// Crate version pulled from `Cargo.toml` at compile time.
///
/// PR #77 RF-3 class: the previous hardcoded `"26.4.10"` drifted from the
/// workspace version (currently 26.5.x). Receipts include `algorithm_version`
/// and `kernel_version`, so a stale constant produced provenance chains that
/// claimed the wrong build identity. Sourcing from `CARGO_PKG_VERSION` keeps
/// this in lockstep with `Cargo.toml` without manual updates.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod version_tests {
    use super::VERSION;

    /// Rank-2 (domain contract): VERSION must match the workspace package
    /// version that produced this binary. Any drift is a provenance defect.
    #[test]
    fn version_matches_cargo_pkg_version() {
        assert_eq!(VERSION, env!("CARGO_PKG_VERSION"));
        // CalVer prefix sanity: starts with "26." (the year for this release).
        assert!(
            VERSION.starts_with("26."),
            "VERSION {VERSION} must be CalVer-formatted"
        );
    }
}
