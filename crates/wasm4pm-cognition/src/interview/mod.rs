//! InterviewAssist cognition-runtime core (ARD §3).
//!
//! Minimal, real implementations of the lifecycle components that gate
//! session trust: [`orchestrator`] (state machine), [`event`] (canonical
//! event envelope), [`admission`] (raw observation → admitted fact),
//! [`blackboard`] (partitioned shared state), [`authority_broker`]
//! (side-effect authorization), and [`receipt`] (content-addressed,
//! replay-verified ledger).
//!
//! Deliberately out of scope here: Workflow Engine / POWL execution (no
//! reusable executor exists in this workspace yet — deferred), Semantic
//! Graph, CONSTRUCT Engine, Self-Play Factory, Accessibility Projector, and
//! standalone Hypothesis Manager extraction (already real inline in
//! [`crate::session::model`] — extracting it is a refactor, not new
//! coverage).

pub mod accessibility;
pub mod admission;
pub mod authority_broker;
pub mod blackboard;
pub mod capability;
pub mod construct;
pub mod event;
pub mod graph;
pub mod hypothesis;
pub mod orchestrator;
pub mod receipt;
pub mod self_play;
pub mod verification;
pub mod workflow;
