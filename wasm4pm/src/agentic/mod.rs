//! agentic module — Lawful agentic control primitives for pictl
//!
//! This module provides type-first, trait-first shells for role selection, task decomposition,
//! handoffs, topology selection, evidence sufficiency checking, escalation, artifact dispatch,
//! prompt binding compilation, counterfactual evaluation, and JTBD test harnesses.
//!
//! All trait implementations are production-complete with deterministic logic:
//! - RoleSelector: phase→role mapping with risk overrides
//! - TaskDecomposer: risk→topology mapping with phase overrides
//! - HandoffValidator: 3-gate policy enforcement (blocked roles, allowed actions, required roles)
//! - EvidenceSufficiencyChecker: evidence gap detection (required classes, confidence, drift)
//! - EscalationEngine: drift/risk/phase-based escalation triggers
//! - ArtifactDispatcher: role→artifact family mapping
//! - PromptBindingCompiler: orchestrates role+topology selection into prompt bindings
//! - CounterfactualEvaluator: RL-powered action evaluation with reward estimation
//! - JtbdRunner: test harness verifying role/topology/disposition/artifact assertions
//!
//! Integrations:
//! - RL orchestrator: compute_reward() for counterfactual evaluation
//! - Marking semantics: Petri net validation in E2E tests
//! - SPC drift: Western Electric rules trigger escalation
//! - Receipt chains: EvidenceEnvelope carries receipt refs through pipeline

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
