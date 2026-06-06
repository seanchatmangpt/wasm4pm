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
pub use compat::state::{Admitted, Exportable, Parsed, Projected, Raw, Receipted, Refused};

// Verifying Witnesses
pub use compat::witness::Witness;
pub use compat::witnesses::{Ocel20, PowlPaper, WfNetSoundnessPaper, Xes1849};

// Verifying Admission and Refusals
pub use compat::admission::{Admit, Refusal};

// Verifying Structural Types
pub use compat::declare::DeclareConstraint;
pub use compat::dfg::DirectlyFollowsGraph;
pub use compat::eventlog::{Event, EventLog, Trace};
pub use compat::ocel::{OcelEvent, OcelLog, OcelObject};
pub use compat::petri::{PetriNet, WfNet};
pub use compat::powl::PowlNode;
pub use compat::process_tree::ProcessTree;

// Verifying Accountability
pub use compat::loss::{LossPolicy, LossReport, ProjectionName};
pub use compat::receipt::{ReceiptEnvelope, ReceiptShape};

// Verifying Graduation
pub use compat::engine_bridge::{GraduateToWasm4pm, GraduationCandidate, GraduationReason};
