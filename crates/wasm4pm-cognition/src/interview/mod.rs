//! InterviewAssist cognition-runtime core (ARD §3).
//!
//! Minimal, real implementations of the lifecycle components that gate
//! session trust: [`orchestrator`] (state machine), [`event`] (canonical
//! event envelope), [`admission`] (raw observation → admitted fact),
//! [`blackboard`] (partitioned shared state), [`authority_broker`]
//! (side-effect authorization), and [`receipt`] (content-addressed,
//! replay-verified ledger).

pub mod accessibility;
pub mod admission;
pub mod authority_broker;
pub mod blackboard;
pub mod capability;
pub mod composition;
pub mod construct;
pub mod event;
pub mod graph;
pub mod hypothesis;
pub mod orchestrator;
pub mod receipt;
pub mod self_play;
pub mod verification;
pub mod workflow;

pub use composition::{
    BreedFailure, BreedInput, BreedProposal, CapabilityRequestRefusal, ClosureBreed,
    CognitiveBreed, CognitivePipeline, CognitivePipelineBuilder, CompositionContext,
    PipelineEvent, PipelineInput, PipelineOutput, PipelineRefusal,
};

impl Default for CompositionContext {
    fn default() -> Self {
        Self::new(0.0)
    }
}

impl Default for CognitivePipelineBuilder {
    fn default() -> Self {
        Self::new(0.0)
    }
}
