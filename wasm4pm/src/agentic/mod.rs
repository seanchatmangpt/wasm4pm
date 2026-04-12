//! agentic module — Lawful agentic control primitives for pictl
//!
//! This module provides type-first, trait-first shells for role selection, task decomposition,
//! handoffs, topology selection, evidence sufficiency checking, escalation, artifact dispatch,
//! prompt binding compilation, counterfactual evaluation, and JTBD test harnesses.
//!
//! All trait implementations currently return `Err(AgenticError::NotImplemented)`. This is
//! intentional scaffolding that enables future wiring to RL, marking semantics, SPC drift,
//! and receipt chains without letting agentic logic become fuzzy chat logic.

pub mod types;
pub mod traits;
pub mod role_selector;
pub mod task_decomposer;
pub mod handoff;
pub mod topology;
pub mod evidence_sufficiency;
pub mod escalation;
pub mod artifact_dispatch;
pub mod prompt_bindings;
pub mod counterfactual;
pub mod jtbd;
pub mod prelude;

pub use prelude::*;
