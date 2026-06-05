//! Compile-checked wasm4pm-compat API probe.
//!
//! This module does not admit evidence.
//! This module does not execute evidence.
//! This module does not bridge wasm4pm execution.
//!
//! Its only purpose is to prove which wasm4pm-compat v26.6.5
//! public symbols are available to wasm4pm during the API truth pass.

pub use wasm4pm_compat as compat;

// Verifying Evidence Lifecycle
pub use compat::evidence::Evidence;
pub use compat::state::{Raw, Parsed, Admitted, Projected, Exportable, Receipted, Refused};

// Verifying Witnesses
pub use compat::witness::Witness;
pub use compat::witnesses::{Ocel20, Xes1849, PowlPaper, WfNetSoundnessPaper};

// Verifying Admission and Refusals
pub use compat::admission::{Admit, Refusal};

// Verifying Structural Types
pub use compat::eventlog::{Event, Trace, EventLog};
pub use compat::ocel::{OcelLog, OcelObject, OcelEvent};
pub use compat::petri::{PetriNet, WfNet};
pub use compat::process_tree::ProcessTree;
pub use compat::powl::PowlNode;
pub use compat::declare::DeclareConstraint;
pub use compat::dfg::DirectlyFollowsGraph;

// Verifying Accountability
pub use compat::loss::{LossPolicy, ProjectionName, LossReport};
pub use compat::receipt::{ReceiptShape, ReceiptEnvelope};

// Verifying Graduation
pub use compat::engine_bridge::{GraduationCandidate, GraduationReason, GraduateToWasm4pm};
