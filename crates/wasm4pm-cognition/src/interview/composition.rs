//! Public composition utilities for InterviewAssist cognition pipelines.
//!
//! Two surfaces are intentionally provided:
//! - [`CompositionContext`] exposes lawful low-level verbs for advanced users.
//! - [`CognitivePipeline`] lets downstream users compose breeds declaratively
//!   without manually sequencing admission, graph construction, capability
//!   preconditions, authority, verification, or accessible projection.

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
use super::graph::{SemanticGraph, Triple};
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

    /// Admit a breed proposal into the graph and blackboard.
    pub fn apply_proposal(&mut self, proposal: &BreedProposal) {
        for triple in &proposal.triples {
            self.graph.insert(
                triple.subject.clone(),
                triple.predicate.clone(),
                triple.object.clone(),
            );
        }
        for obligation in &proposal.add_obligations {
            self.blackboard.add_obligation(obligation.clone());
        }
        for obligation in &proposal.resolve_obligations {
            self.blackboard.resolve_obligation(obligation);
        }
        if let Some((candidate_id, status)) = &proposal.verification {
            self.verification.record(candidate_id.clone(), *status);
        }
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

    /// Check capability preconditions and required authority.
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

    /// Resolve a blackboard obligation after corresponding work completed.
    pub fn resolve_obligation(&mut self, obligation: &str) {
        self.blackboard.resolve_obligation(obligation);
    }

    /// Evaluate competing hypotheses from explicit signed evidence.
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

    /// Select an accessible presentation form while preserving stability.
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

/// Read-only input given to a downstream cognitive breed.
#[derive(Debug, Clone, Copy)]
pub struct BreedInput<'a> {
    /// Trusted working state.
    pub blackboard: &'a Blackboard,
    /// Trusted semantic graph.
    pub graph: &'a SemanticGraph,
}

/// A breed's proposed contribution. Proposals are applied by the pipeline,
/// never by the breed itself.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BreedProposal {
    /// Semantic triples proposed for admission.
    pub triples: Vec<Triple>,
    /// New obligations created by this breed.
    pub add_obligations: Vec<String>,
    /// Existing obligations resolved by this breed.
    pub resolve_obligations: Vec<String>,
    /// Optional verification evidence actually reached.
    pub verification: Option<(String, VerificationStatus)>,
    /// Consumer-domain value returned by the breed.
    pub value: Option<String>,
}

/// Typed failure returned by a cognitive breed implementation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BreedFailure {
    /// Stable breed-specific failure code.
    pub code: String,
    /// Human-readable detail.
    pub message: String,
}

/// Public extension point for downstream cognitive breeds.
pub trait CognitiveBreed {
    /// Stable identifier used for capability registration and traces.
    fn id(&self) -> &str;

    /// Blackboard obligations required before this breed may run.
    fn preconditions(&self) -> Vec<String> {
        Vec::new()
    }

    /// Side-effect authority required by this breed.
    fn authority_requirement(&self) -> AuthorityClass {
        AuthorityClass::Project
    }

    /// Evaluate trusted state and return a proposal, not direct mutations.
    fn evaluate(&self, input: BreedInput<'_>) -> Result<BreedProposal, BreedFailure>;
}

/// Closure adapter so downstream users do not need to declare a new Rust type.
pub struct ClosureBreed<F> {
    id: String,
    preconditions: Vec<String>,
    authority_requirement: AuthorityClass,
    evaluate: F,
}

impl<F> ClosureBreed<F>
where
    F: for<'a> Fn(BreedInput<'a>) -> Result<BreedProposal, BreedFailure>,
{
    /// Wrap a closure as a cognitive breed.
    ///
    /// The `for<'a> Fn(...)` bound must live here, not only on the
    /// `CognitiveBreed` impl below: rustc only infers a closure literal's
    /// `Fn` impl as higher-ranked over `'a` when that bound is the expected
    /// type at the point the closure is constructed. Without it here, the
    /// closure gets pinned to one concrete lifetime and later fails
    /// "implementation of `Fn` is not general enough" wherever
    /// `CognitiveBreed` is required — this bit every caller of `new`.
    #[must_use]
    pub fn new(
        id: impl Into<String>,
        preconditions: impl IntoIterator<Item = String>,
        authority_requirement: AuthorityClass,
        evaluate: F,
    ) -> Self {
        Self {
            id: id.into(),
            preconditions: preconditions.into_iter().collect(),
            authority_requirement,
            evaluate,
        }
    }
}

impl<F> CognitiveBreed for ClosureBreed<F>
where
    F: for<'a> Fn(BreedInput<'a>) -> Result<BreedProposal, BreedFailure>,
{
    fn id(&self) -> &str {
        &self.id
    }

    fn preconditions(&self) -> Vec<String> {
        self.preconditions.clone()
    }

    fn authority_requirement(&self) -> AuthorityClass {
        self.authority_requirement
    }

    fn evaluate(&self, input: BreedInput<'_>) -> Result<BreedProposal, BreedFailure> {
        (self.evaluate)(input)
    }
}

/// One deterministic pipeline trace event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PipelineEvent {
    /// Observation passed admission.
    ObservationAdmitted(String),
    /// Built-in CONSTRUCT obligations were derived.
    ObligationsDerived(usize),
    /// A breed was invoked after all gates passed.
    BreedInvoked(String),
    /// A breed proposal was applied.
    ProposalApplied(String),
    /// Minimum verification standing was established.
    VerificationEstablished(String, VerificationStatus),
    /// Accessible projection was selected.
    ProjectionSelected(String),
}

/// Input for one declaratively composed cognition run.
#[derive(Debug, Clone)]
pub struct PipelineInput {
    /// Raw external observation.
    pub observation: RawObservation,
    /// Confidence supplied to the admission gate.
    pub confidence: f32,
    /// Optional accessible projection profile.
    pub accessibility_profile: Option<AccessibilityProfile>,
    /// Available projection forms.
    pub projection_options: Vec<ProjectionOption>,
}

/// Successful result of a composed cognition run.
#[derive(Debug, Clone)]
pub struct PipelineOutput {
    /// Admitted source fact.
    pub admitted: AdmittedFact,
    /// Breed values in invocation order.
    pub breed_values: Vec<(String, Option<String>)>,
    /// Final selected presentation form, when requested.
    pub projection: Option<ProjectionOption>,
    /// Deterministic execution trace.
    pub trace: Vec<PipelineEvent>,
}

/// Failure preserves the exact layer that refused composition.
#[derive(Debug, Clone, PartialEq)]
pub enum PipelineRefusal {
    /// Source observation failed admission.
    Admission(RefusalReason),
    /// Capability contract or authority refused a breed.
    Capability {
        /// Breed that was refused.
        breed_id: String,
        /// Refusing gate.
        refusal: CapabilityRequestRefusal,
    },
    /// Breed implementation returned a typed failure.
    Breed {
        /// Breed that failed.
        breed_id: String,
        /// Typed breed failure.
        failure: BreedFailure,
    },
    /// Required verification standing was absent or too weak.
    Verification(UnrecordedStatus),
    /// No accessible projection could be selected.
    Projection(NoUsableOption),
}

/// Builder for a downstream cognition pipeline.
pub struct CognitivePipelineBuilder {
    confidence_floor: f32,
    authorities: Vec<AuthorityClass>,
    breeds: Vec<Box<dyn CognitiveBreed>>,
    minimum_verification: Option<(String, VerificationStatus)>,
}

impl CognitivePipelineBuilder {
    /// Start a pipeline with an admission confidence floor.
    #[must_use]
    pub fn new(confidence_floor: f32) -> Self {
        Self {
            confidence_floor,
            authorities: vec![AuthorityClass::Admit],
            breeds: Vec::new(),
            minimum_verification: None,
        }
    }

    /// Grant authority to the composed runtime.
    #[must_use]
    pub fn grant(mut self, authority: AuthorityClass) -> Self {
        if !self.authorities.contains(&authority) {
            self.authorities.push(authority);
        }
        self
    }

    /// Append one cognitive breed. Invocation order is declaration order.
    #[must_use]
    pub fn breed(mut self, breed: impl CognitiveBreed + 'static) -> Self {
        self.breeds.push(Box::new(breed));
        self
    }

    /// Require final verification standing for a candidate.
    #[must_use]
    pub fn require_verification(
        mut self,
        candidate_id: impl Into<String>,
        minimum: VerificationStatus,
    ) -> Self {
        self.minimum_verification = Some((candidate_id.into(), minimum));
        self
    }

    /// Build the pipeline and register every breed as a capability contract.
    #[must_use]
    pub fn build(self) -> CognitivePipeline {
        let mut context = CompositionContext::new(self.confidence_floor);
        for authority in self.authorities {
            context.grant(authority);
        }
        for breed in &self.breeds {
            context.register_capability(CapabilityDescriptor {
                capability_id: breed.id().to_string(),
                preconditions: breed.preconditions(),
                postconditions: Vec::new(),
                effects: vec![format!("propose:{}", breed.id())],
                authority_requirement: breed.authority_requirement(),
            });
        }
        CognitivePipeline {
            context,
            breeds: self.breeds,
            minimum_verification: self.minimum_verification,
        }
    }
}

/// Declarative downstream runtime that owns the lawful pipeline sequence.
pub struct CognitivePipeline {
    context: CompositionContext,
    breeds: Vec<Box<dyn CognitiveBreed>>,
    minimum_verification: Option<(String, VerificationStatus)>,
}

impl CognitivePipeline {
    /// Read the underlying context for audit and advanced queries.
    #[must_use]
    pub fn context(&self) -> &CompositionContext {
        &self.context
    }

    /// Run admission, derivation, breed gates, proposals, verification, and
    /// accessible projection without exposing sequencing to downstream users.
    pub fn run(&mut self, input: PipelineInput) -> Result<PipelineOutput, PipelineRefusal> {
        let mut trace = Vec::new();
        let admitted = self
            .context
            .admit(&input.observation, input.confidence)
            .map_err(PipelineRefusal::Admission)?;
        trace.push(PipelineEvent::ObservationAdmitted(admitted.id.clone()));

        let derived = self.context.derive_obligations();
        trace.push(PipelineEvent::ObligationsDerived(derived));

        let mut breed_values = Vec::new();
        for breed in &self.breeds {
            let breed_id = breed.id().to_string();
            self.context
                .request_capability(&breed_id)
                .map_err(|refusal| PipelineRefusal::Capability {
                    breed_id: breed_id.clone(),
                    refusal,
                })?;
            trace.push(PipelineEvent::BreedInvoked(breed_id.clone()));

            let proposal = breed
                .evaluate(BreedInput {
                    blackboard: self.context.blackboard(),
                    graph: self.context.graph(),
                })
                .map_err(|failure| PipelineRefusal::Breed {
                    breed_id: breed_id.clone(),
                    failure,
                })?;
            breed_values.push((breed_id.clone(), proposal.value.clone()));
            self.context.apply_proposal(&proposal);
            trace.push(PipelineEvent::ProposalApplied(breed_id));
        }

        if let Some((candidate_id, minimum)) = &self.minimum_verification {
            let reached = self
                .context
                .require_verification(candidate_id, *minimum)
                .map_err(PipelineRefusal::Verification)?;
            trace.push(PipelineEvent::VerificationEstablished(
                candidate_id.clone(),
                reached,
            ));
        }

        let projection = match input.accessibility_profile {
            Some(profile) => {
                let selected = self
                    .context
                    .project(&profile, &input.projection_options)
                    .map_err(PipelineRefusal::Projection)?;
                trace.push(PipelineEvent::ProjectionSelected(selected.id.clone()));
                Some(selected)
            }
            None => None,
        };

        Ok(PipelineOutput {
            admitted,
            breed_values,
            projection,
            trace,
        })
    }
}
