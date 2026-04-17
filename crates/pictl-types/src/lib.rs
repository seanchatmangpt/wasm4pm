#![doc = "Binary data structures for pictl process mining platform."]
#![doc = ""]
#![doc = "This crate defines the canonical types that all functions pass around:"]
#![doc = "- Event log formats (EventLog, OCEL)"]
#![doc = "- Process models (DFG, PetriNet, DeclareModel)"]
#![doc = "- Conformance results (ConformanceResult, TokenReplayResult)"]
#![doc = "- Provenance and hashing (ProvenanceChain, BLAKE3 operations)"]

pub mod event_log;
pub mod ocel;
pub mod models;
pub mod conformance;
pub mod provenance;
pub mod error;
pub mod hash;

// Re-exports for convenience
pub use event_log::{Event, EventLog, Trace, AttributeValue, Attributes};
pub use ocel::{OCEL, OCELEvent, OCELObject};
pub use models::{DFG, DFGNode, DFGEdge, PetriNet, PetriNetPlace, PetriNetTransition, PetriNetArc, DeclareModel, DeclareConstraint};
pub use conformance::{ConformanceResult, TokenReplayResult};
pub use provenance::ProvenanceChain;
pub use error::{Error, Result};
pub use hash::Blake3Hash;

pub const VERSION: &str = "26.4.10";
