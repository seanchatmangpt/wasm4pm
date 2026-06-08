//! pm-core — zero-cost process-mining types from paper formal definitions.
//!
//! This crate is **no_std + alloc** and has ZERO algorithm implementations.
//! Downstream process-mining libraries can depend on pm-core without pulling
//! in WASM, CLI, or any algorithm code.
//!
//! # Module structure
//!
//! | Module | Paper grounding | Key types |
//! |---|---|---|
//! | `primitives` | XES IEEE 1849-2016, van der Aalst 2016 §2.1 | ActivityName, CaseId, TimestampNs, … |
//! | `log` | IEEE 1849-2016 | EventLog, Trace, Event |
//! | `petri_net` | Murata 1989, van der Aalst 2016 §2.2 | PetriNet, PetriPlace, PetriTransition |
//! | `dfg` | van der Aalst 2016 §3 | DFG |
//! | `process_tree` | Leemans et al. 2013 ICATPN | ProcessTree, ProcessOperator |
//! | `alignment` | Adriansyah 2014 PhD | AlignmentMove, Alignment |
//! | `quality` | van der Aalst 2016 §9.2 | FitnessScore, QualityDimensions |
//! | `declare` | van der Aalst et al. 2009 | DeclareModel, DeclareTemplate |
//! | `heuristics_net` | Weijters & van der Aalst 2003 | HeuristicsNet |
//! | `transition_system` | van der Aalst 2016 §2.3 | TransitionSystem |
//! | `precision` | Munoz-Gama & Carmona 2010 | EtcPrecisionResult |
//! | `performance` | Denisov et al. 2018 | PerformanceSpectrum |
//! | `log_skeleton` | Verbeek 2021 STTT | LogSkeleton |
//! | `ocel` | Ghahfarokhi et al. 2021 | ObjectCentricEventLog |
//! | `social_network` | van der Aalst et al. 2005 | HandoverNetwork |
//!
//! # Usage
//!
//! ```toml
//! [dependencies]
//! pm-core = { path = "../pm-core" }
//! # Optional: enable serde support
//! # pm-core = { path = "../pm-core", features = ["serde"] }
//! ```
//!
//! ```rust,no_run
//! use pm_core::prelude::*;
//!
//! // Build a directly-follows graph
//! let mut dfg = DFG::new();
//! dfg.record_edge(
//!     ActivityName::from("Register"),
//!     ActivityName::from("Approve"),
//! );
//! ```

#![no_std]
#![forbid(unsafe_code)]
#![allow(missing_docs)]
#![allow(clippy::all, unused_imports, unused_attributes)]

#[macro_use]
extern crate alloc;

// ─── Core vocabulary ──────────────────────────────────────────────────────
/// Zero-cost domain newtypes shared across all modules (XES, van der Aalst 2016 §2.1).
pub mod primitives;

// ─── Domain modules ───────────────────────────────────────────────────────
/// XES event log hierarchy (IEEE 1849-2016): Log → Trace → Event → Attribute.
pub mod log;

/// Petri net structure: places, transitions, arcs, markings (Murata 1989).
pub mod petri_net;

/// Directly-Follows Graph (van der Aalst 2016 §3).
pub mod dfg;

/// Block-structured process trees with operators {→, ×, ∧, ↺} (Leemans et al. 2013).
pub mod process_tree;

/// Optimal trace alignment (Adriansyah 2014 PhD thesis TU/e).
pub mod alignment;

/// Four quality dimensions: fitness, precision, generalization, simplicity (van der Aalst 2016 §9.2).
pub mod quality;

/// DECLARE constraint language and model (van der Aalst et al. 2009 EDOC).
pub mod declare;

/// Heuristics Net for heuristic process discovery (Weijters & van der Aalst 2003).
pub mod heuristics_net;

/// Transition system: states, transitions, traces (van der Aalst 2016 §2.3).
pub mod transition_system;

/// ETConformance precision via escaping-edge analysis (Munoz-Gama & Carmona 2010 BPM).
pub mod precision;

/// Performance spectrum: per-segment duration distributions (Denisov et al. 2018).
pub mod performance;

/// Log skeleton: compact constraint representation (Verbeek 2021 STTT).
pub mod log_skeleton;

/// Object-Centric Event Log OCEL 2.0 (Ghahfarokhi et al. 2021 ICSOC).
pub mod ocel;

/// Social network mining: handover-of-work and working-together graphs (van der Aalst et al. 2005 CSCW).
pub mod social_network;

// ─── Prelude ──────────────────────────────────────────────────────────────
/// Convenience re-exports for the most commonly needed types.
///
/// `use pm_core::prelude::*;` brings in the essential vocabulary without
/// requiring per-module imports.
pub mod prelude {
    // Core vocabulary from primitives
    pub use crate::primitives::{
        ActivityName, CaseId, DurationNs, Frequency, ObjectId, ObjectType, PlaceId, ResourceName,
        TimestampNs, TransitionId,
    };
    // Quality dimensions (bounded constructors)
    pub use crate::quality::{
        FitnessScore, GeneralizationScore, PrecisionScore, QualityDimensions, SimplicityScore,
        TokenReplayStats,
    };
    // Core process model structures
    pub use crate::dfg::DFG;
    pub use crate::log::XesLog;
    pub use crate::ocel::ObjectCentricEventLog;
    pub use crate::petri_net::PetriNet;
    pub use crate::process_tree::{ProcessOperator, ProcessTree, ProcessTreeNode};
    // Conformance
    pub use crate::alignment::{Alignment, AlignmentCost, AlignmentMove};
    pub use crate::quality::TokenReplayStats as TokenReplay;
}
