#![doc = "Binary data structures for wasm4pm process mining platform."]
#![doc = ""]
#![doc = "This crate defines the canonical types that all functions pass around:"]
#![doc = "- Event log formats (EventLog, OCEL)"]
#![doc = "- Process models (DFG, PetriNet, DeclareModel)"]
#![doc = "- Conformance results (ConformanceResult, TokenReplayResult)"]
#![doc = "- Provenance and hashing (ProvenanceChain, BLAKE3 operations)"]

pub mod choice_graph;
pub mod conformance;
pub mod dense_kernel;
pub mod error;
pub mod event_log;
pub mod hash;
pub mod import;
pub mod mask;
pub mod models;
pub mod ocel;
pub mod provenance;

// Re-exports for convenience
pub use choice_graph::{ChoiceGraph, ChoiceGraphError, ChoiceGraphNode};
pub use conformance::{ConformanceResult, TokenReplayResult};
pub use error::{Error, Result};
pub use event_log::{
    Attribute, AttributeValue, Attributes, Event, EventLog, Trace, XESEditableAttribute,
};
pub use hash::Blake3Hash;
pub use models::{
    Arc, DFGEdge, DFGNode, DeclareConstraint, DeclareModel, FlatIncidenceMatrix, PetriNet, Place,
    Transition, DFG,
};
pub use ocel::{OCELEvent, OCELObject, OCEL};
pub use provenance::ProvenanceChain;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
