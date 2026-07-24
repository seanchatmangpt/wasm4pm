//! Thin composition utilities for InterviewAssist cognition pipelines.
//!
//! This module does not replace the component implementations. It owns the
//! repetitive wiring needed by tests and consumers while preserving each gate:
//! admission, graph construction, workflow eligibility, capability
//! preconditions, authority, verification standing, and accessible projection.

use super::accessibility::{
    select_projection, AccessibilityProfile, NoUsableOption, ProjectionOption,
};
use super::admission::{AdmissionEngine, AdmittedFact, RawObservation, RefusalReason};
use super::authority_broker::{AuthorityBroker, AuthorityClass, AuthorityDenied};
use super::blackboard::Blackboard;
use super::capability::{
    CapabilityDescriptor, CapabilityRegistry, PreconditionRefusal,
};
use super::construct::construct_obligations;
use super::graph::SemanticGraph;
use super::hypothesis::{HypothesisManager, HypothesisOutcome};
use super::verification::{
    UnrecordedStatus, VerificationLedger, VerificationStatus,
};
use super::workflow::{StepRefusal, Workflow};

/// Reusable state and lawful verbs for one composed cognition pipeline.
#[derive(Debug, Clone)]
pub struct CompositionContext {
    admission: AdmissionEngine,
    blackboard: Blackboard,
    graph: SemanticGraph,
    workflow: Workflow,
    capabilities: CapabilityRegistry,
    authority: AuthorityBroker,
    verification: VerificationLedger,
    previous_projection: Option<String>,
}

impl CompositionContext {
    /// Construct an empty, default-deny pipeline context.
    #[must_use]
    pub fn new(confidence_floor: f32) -> Self {
        Self {
            admission: AdmissionEngine::new(confidence_floor),
            blackboard: Blackboard::new(),
            graph: SemanticGraph::new(),
            workflow: Workflow::new(),
            capabilities: CapabilityRegistry::new(),
            authority: AuthorityBroker::new(),
            verification: VerificationLedger::new(),
            previous_projection: None,
        }
    }

    /// Read the shared blackboard.
    #[must_use]
    pub fn blackboard(&self) -> &Blackboard {
        &self.blackboard
    }

    /// Read the admitted semantic graph.
    #[must_use]
    pub fn graph(&self) -> &SemanticGraph {
        &self.graph
    }

    /// Read the workflow.
    #[must_use]
    pub fn workflow(&self) -> &Workflow {
        &self.workflow
    }

    /// Admit one raw observation through the configured admission gate.
    pub fn admit(
        &mut self,
        observation: &RawObservation,
        confidence: f32,
    ) -> Result<AdmittedFact, RefusalReason> {
        self.authority
            .authorize(AuthorityClass::Admit)
            .map_err(|_| RefusalReason::SchemaInvalid)?;
        self.blackboard
            .propose_admission(&self.admission, observation, confidence)
            .cloned()
    }

    /// Derive obligation triples, independently admit them into the graph, and
    /// mirror the obligations onto the blackboard.
    pub fn derive_obligations(&mut self) -> usize {
        let candidates = construct_obligations(&self.graph, self.blackboard.admitted());
        for candidate in &candidates {
            let triple = &candidate.0;
            self.graph.insert(
                triple.subject.clone(),
                triple.predicate.clone(),
                triple.object.clone(),
            );
            self.blackboard.add_obligation(triple.object.clone());
        }
        candidates.len()
    }

    /// Register a capability contract.
    pub fn register_capability(&mut self, descriptor: CapabilityDescriptor) {
        self.capabilities.register(descriptor);
    }

    /// Grant one authority class.
    pub fn grant(&mut self, class: AuthorityClass) {
        self.authority.grant(class);
    }

    /// Revoke one authority class.
    pub fn revoke(&mut self, class: AuthorityClass) {
        self.authority.revoke(class);
    }

    /// Check both the capability's declared preconditions and its required
    /// authority. Preconditions are checked first so missing semantic standing
    /// is not obscured by an authority result.
    pub fn request_capability(
        &self,
        capability_id: &str,
    ) -> Result<&CapabilityDescriptor, CapabilityRequestRefusal> {
        let descriptor = self
            .capabilities
            .check_preconditions(capability_id, &self.blackboard)
            .map_err(CapabilityRequestRefusal::Precondition)?;
        self.authority
            .authorize(descriptor.authority_requirement)
            .map_err(CapabilityRequestRefusal::Authority)?;
        Ok(descriptor)
    }

    /// Declare a workflow step and its prerequisites.
    pub fn add_step(
        &mut self,
        step: impl Into<String>,
        prerequisites: impl IntoIterator<Item = String>,
    ) {
        self.workflow.add_step(step, prerequisites);
    }

    /// Complete a workflow step after independently rechecking eligibility.
    pub fn complete_step(&mut self, step: &str) -> Result<(), StepRefusal> {
        self.workflow.complete_step(step)
    }

    /// Resolve a blackboard obligation after the corresponding capability or
    /// workflow work has actually completed.
    pub fn resolve_obligation(&mut self, obligation: &str) {
        self.blackboard.resolve_obligation(obligation);
    }

    /// Evaluate a bounded set of competing hypotheses from explicit evidence.
    #[must_use]
    pub fn evaluate_hypotheses(
        ids: impl IntoIterator<Item = String>,
        confidence_floor: f32,
        margin: f32,
        evidence: impl IntoIterator<Item = (String, f32)>,
    ) -> HypothesisOutcome {
        let mut manager = HypothesisManager::new(ids, confidence_floor, margin);
        for (id, weight) in evidence {
            if weight >= 0.0 {
                manager.add_evidence(&id, weight);
            } else {
                manager.subtract_evidence(&id, -weight);
            }
        }
        manager.evaluate()
    }

    /// Record the strongest verification layer actually reached.
    pub fn record_verification(
        &mut self,
        candidate_id: impl Into<String>,
        status: VerificationStatus,
    ) {
        self.verification.record(candidate_id, status);
    }

    /// Require a minimum verification layer before a claim may proceed.
    pub fn require_verification(
        &self,
        candidate_id: &str,
        minimum: VerificationStatus,
    ) -> Result<VerificationStatus, UnrecordedStatus> {
        self.verification.assert_minimum(candidate_id, minimum)
    }

    /// Select an accessible presentation form while preserving previous-turn
    /// stability when urgency does not justify a change.
    pub fn project(
        &mut self,
        profile: &AccessibilityProfile,
        candidates: &[ProjectionOption],
    ) -> Result<ProjectionOption, NoUsableOption> {
        self.authority
            .authorize(AuthorityClass::Project)
            .map_err(|_| NoUsableOption)?;
        let selected = select_projection(
            profile,
            self.previous_projection.as_deref(),
            candidates,
        )?;
        self.previous_projection = Some(selected.id.clone());
        Ok(selected)
    }
}

/// A composed capability request preserves which gate refused it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapabilityRequestRefusal {
    /// Capability registration or semantic precondition failure.
    Precondition(PreconditionRefusal),
    /// Required side-effect authority was not granted.
    Authority(AuthorityDenied),
}
