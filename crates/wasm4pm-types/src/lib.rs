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

pub const VERSION: &str = "26.4.10";
