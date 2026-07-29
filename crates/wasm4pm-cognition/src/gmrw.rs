//! Ontology-addressed runtime primitives for Generative Multifractal Recursive Workflow.
//!
//! This module keeps observation admission, semantic diagnosis, cognitive scheduling,
//! and execution capability binding separate. It does not actuate. Every result is a
//! typed candidate for a downstream authority and receipt boundary.

use std::collections::{BTreeMap, BTreeSet};

const STATEMENT_HASH_DOMAIN: &str = "wasm4pm.gmrw.admitted-statement.v1";

/// Truth polarity carried by an ontology statement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Polarity {
    /// The statement asserts that the relation holds.
    Positive,
    /// The statement asserts that the relation does not hold.
    Negative,
}

impl Polarity {
    fn inverse(self) -> Self {
        match self {
            Self::Positive => Self::Negative,
            Self::Negative => Self::Positive,
        }
    }
}

/// A normalized subject-predicate-object assertion aligned to public ontology terms.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct OntologyStatement {
    /// Public or publicly aligned subject identifier.
    pub subject: String,
    /// Public or publicly aligned predicate identifier.
    pub predicate: String,
    /// Public or publicly aligned object identifier or canonical literal.
    pub object: String,
    /// Whether the relation is asserted or explicitly denied.
    pub polarity: Polarity,
}

impl OntologyStatement {
    /// Return the same statement with the opposite truth polarity.
    #[must_use]
    pub fn inverse(&self) -> Self {
        Self {
            subject: self.subject.clone(),
            predicate: self.predicate.clone(),
            object: self.object.clone(),
            polarity: self.polarity.inverse(),
        }
    }
}

/// An unadmitted statement proposed by an observer, rule engine, or cognitive breed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateStatement {
    /// Stable source identifier, such as a sensor, person, rule set, or breed run.
    pub source: String,
    /// Proposed semantic statement.
    pub statement: OntologyStatement,
    /// Receipt proving the observation or derivation, when available.
    pub evidence_receipt: Option<String>,
}

/// A statement that passed the graph admission boundary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdmittedStatement {
    /// Monotonic admission sequence.
    pub sequence: u64,
    /// Stable source identifier.
    pub source: String,
    /// Admitted semantic statement.
    pub statement: OntologyStatement,
    /// Evidence receipt presented at admission.
    pub evidence_receipt: Option<String>,
    /// BLAKE3 digest over the complete admitted record.
    pub statement_hash: String,
}

/// Policy controlling which ontology namespaces and evidence profiles may enter a graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GraphAdmissionPolicy {
    allowed_namespaces: BTreeSet<String>,
    require_receipt: bool,
}

impl GraphAdmissionPolicy {
    /// Create a default-deny policy.
    #[must_use]
    pub fn default_deny() -> Self {
        Self {
            allowed_namespaces: BTreeSet::new(),
            require_receipt: true,
        }
    }

    /// Permit terms beginning with the supplied namespace prefix.
    #[must_use]
    pub fn allow_namespace(mut self, namespace: impl Into<String>) -> Self {
        self.allowed_namespaces.insert(namespace.into());
        self
    }

    /// Configure whether every candidate must carry an evidence receipt.
    #[must_use]
    pub fn require_receipt(mut self, required: bool) -> Self {
        self.require_receipt = required;
        self
    }

    fn allows(&self, term: &str) -> bool {
        self.allowed_namespaces
            .iter()
            .any(|namespace| term.starts_with(namespace))
    }
}

impl Default for GraphAdmissionPolicy {
    fn default() -> Self {
        Self::default_deny()
    }
}

/// Typed reason a candidate statement was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GraphAdmissionRefusal {
    /// A required field was empty.
    SchemaInvalid,
    /// At least one ontology term was outside the admitted public alignment surface.
    NamespaceNotAdmitted,
    /// Policy required a receipt but none was supplied.
    MissingEvidenceReceipt,
    /// The receipt was not a lowercase 64-character BLAKE3 hexadecimal digest.
    InvalidEvidenceReceipt,
}

/// Result of attempting to add a candidate to the admitted graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GraphAdmissionOutcome {
    /// A new statement entered the graph.
    Inserted(AdmittedStatement),
    /// The exact statement was already admitted; admission remained idempotent.
    AlreadyAdmitted(AdmittedStatement),
}

/// Deterministic admitted graph used by the GMRW diagnosis kernel.
#[derive(Debug, Clone, Default)]
pub struct GmrwGraph {
    statements: BTreeMap<OntologyStatement, AdmittedStatement>,
}

impl GmrwGraph {
    /// Create an empty graph.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Number of distinct admitted statements.
    #[must_use]
    pub fn len(&self) -> usize {
        self.statements.len()
    }

    /// Whether the graph contains no admitted statements.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.statements.is_empty()
    }

    /// Return whether an exact statement has standing.
    #[must_use]
    pub fn contains(&self, statement: &OntologyStatement) -> bool {
        self.statements.contains_key(statement)
    }

    /// Read an exact admitted statement.
    #[must_use]
    pub fn get(&self, statement: &OntologyStatement) -> Option<&AdmittedStatement> {
        self.statements.get(statement)
    }

    /// Iterate over admitted statements in deterministic semantic order.
    pub fn iter(&self) -> impl Iterator<Item = &AdmittedStatement> {
        self.statements.values()
    }

    /// Admit a candidate under an explicit policy.
    pub fn admit(
        &mut self,
        policy: &GraphAdmissionPolicy,
        candidate: CandidateStatement,
    ) -> Result<GraphAdmissionOutcome, GraphAdmissionRefusal> {
        validate_candidate(policy, &candidate)?;

        if let Some(existing) = self.statements.get(&candidate.statement) {
            return Ok(GraphAdmissionOutcome::AlreadyAdmitted(existing.clone()));
        }

        let sequence = u64::try_from(self.statements.len())
            .expect("admitted statement count fits u64")
            .saturating_add(1);
        let statement_hash = statement_hash(sequence, &candidate);
        let admitted = AdmittedStatement {
            sequence,
            source: candidate.source,
            statement: candidate.statement.clone(),
            evidence_receipt: candidate.evidence_receipt,
            statement_hash,
        };
        self.statements
            .insert(candidate.statement, admitted.clone());
        Ok(GraphAdmissionOutcome::Inserted(admitted))
    }
}

fn validate_candidate(
    policy: &GraphAdmissionPolicy,
    candidate: &CandidateStatement,
) -> Result<(), GraphAdmissionRefusal> {
    let statement = &candidate.statement;
    if candidate.source.trim().is_empty()
        || statement.subject.trim().is_empty()
        || statement.predicate.trim().is_empty()
        || statement.object.trim().is_empty()
    {
        return Err(GraphAdmissionRefusal::SchemaInvalid);
    }

    if !policy.allows(&statement.subject)
        || !policy.allows(&statement.predicate)
        || (!is_canonical_literal(&statement.object) && !policy.allows(&statement.object))
    {
        return Err(GraphAdmissionRefusal::NamespaceNotAdmitted);
    }

    match candidate.evidence_receipt.as_deref() {
        None if policy.require_receipt => Err(GraphAdmissionRefusal::MissingEvidenceReceipt),
        Some(receipt) if !is_blake3_hex(receipt) => {
            Err(GraphAdmissionRefusal::InvalidEvidenceReceipt)
        }
        _ => Ok(()),
    }
}

fn is_canonical_literal(value: &str) -> bool {
    value.starts_with('"') && value.ends_with('"') && value.len() >= 2
}

fn is_blake3_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn statement_hash(sequence: u64, candidate: &CandidateStatement) -> String {
    let mut hasher = blake3::Hasher::new_derive_key(STATEMENT_HASH_DOMAIN);
    hasher.update(&sequence.to_le_bytes());
    hasher.update(candidate.source.as_bytes());
    hasher.update(candidate.statement.subject.as_bytes());
    hasher.update(candidate.statement.predicate.as_bytes());
    hasher.update(candidate.statement.object.as_bytes());
    hasher.update(&[match candidate.statement.polarity {
        Polarity::Positive => 1,
        Polarity::Negative => 0,
    }]);
    if let Some(receipt) = &candidate.evidence_receipt {
        hasher.update(receipt.as_bytes());
    }
    hasher.finalize().to_hex().to_string()
}

/// Execution substrate that may realize a semantic effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ExecutionClass {
    /// Deterministic in-process or WASM execution.
    LocalMachine,
    /// Supervised OTP process execution.
    Otp,
    /// Constrained edge execution through AtomVM.
    AtomVm,
    /// Sensor or actuator execution in an IoT environment.
    Iot,
    /// Explicit human observation, judgment, approval, or physical action.
    Human,
    /// External institution or independently governed process cell.
    External,
}

/// A registered capability and the semantic effects it can lawfully propose.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapabilityDescriptor {
    /// Stable capability identifier.
    pub id: String,
    /// Execution substrate.
    pub execution_class: ExecutionClass,
    /// Semantic effects the capability may produce.
    pub effects: BTreeSet<OntologyStatement>,
    /// Whether the capability currently has authority to be selected.
    pub authorized: bool,
}

/// Open- or closed-world interpretation for an unresolved requirement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequirementMode {
    /// Absence means the state is not yet known.
    OpenWorld,
    /// Absence must be resolved or explicitly refused before continuation.
    ClosedWorld,
}

/// A semantic condition required for workflow continuation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Requirement {
    /// Required semantic statement.
    pub statement: OntologyStatement,
    /// Interpretation of missing information.
    pub mode: RequirementMode,
}

/// Diagnosis of one continuation requirement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SemanticStatus {
    /// The graph already proves the requirement.
    Satisfied,
    /// A registered capability can produce the missing state.
    Missing,
    /// The graph proves the opposite state.
    NonConformant,
    /// Both the required and opposite states have standing.
    Inconsistent,
    /// No registered authorized capability can produce a closed-world requirement.
    Unsupported,
    /// An open-world requirement has insufficient evidence.
    Unknown,
}

/// Process obligation manufactured from semantic diagnosis.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObligationKind {
    /// No work is required.
    None,
    /// Execute one of the registered capabilities.
    ExecuteCapability,
    /// Repair a known nonconformant state.
    RepairViolation,
    /// Resolve contradictory admitted evidence.
    ResolveConflict,
    /// Register or obtain a capability that can produce the required effect.
    RegisterCapability,
    /// Acquire additional observation or evidence.
    AcquireEvidence,
}

/// Complete residue record for one requirement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SemanticResidue {
    /// Requirement that was diagnosed.
    pub requirement: Requirement,
    /// Current semantic status.
    pub status: SemanticStatus,
    /// Next process obligation implied by the diagnosis.
    pub obligation: ObligationKind,
    /// Authorized capabilities able to produce the required effect.
    pub capability_ids: Vec<String>,
}

/// Diagnose requirements against admitted state and registered capabilities.
#[must_use]
pub fn diagnose_requirements(
    graph: &GmrwGraph,
    requirements: &[Requirement],
    capabilities: &[CapabilityDescriptor],
) -> Vec<SemanticResidue> {
    requirements
        .iter()
        .cloned()
        .map(|requirement| diagnose_one(graph, requirement, capabilities))
        .collect()
}

fn diagnose_one(
    graph: &GmrwGraph,
    requirement: Requirement,
    capabilities: &[CapabilityDescriptor],
) -> SemanticResidue {
    let exact = graph.contains(&requirement.statement);
    let inverse = graph.contains(&requirement.statement.inverse());
    let mut capability_ids: Vec<String> = capabilities
        .iter()
        .filter(|capability| {
            capability.authorized && capability.effects.contains(&requirement.statement)
        })
        .map(|capability| capability.id.clone())
        .collect();
    capability_ids.sort();
    capability_ids.dedup();

    let (status, obligation) = match (exact, inverse, capability_ids.is_empty()) {
        (true, true, _) => (SemanticStatus::Inconsistent, ObligationKind::ResolveConflict),
        (true, false, _) => (SemanticStatus::Satisfied, ObligationKind::None),
        (false, true, _) => (
            SemanticStatus::NonConformant,
            ObligationKind::RepairViolation,
        ),
        (false, false, false) => (
            SemanticStatus::Missing,
            ObligationKind::ExecuteCapability,
        ),
        (false, false, true) if requirement.mode == RequirementMode::ClosedWorld => (
            SemanticStatus::Unsupported,
            ObligationKind::RegisterCapability,
        ),
        (false, false, true) => (SemanticStatus::Unknown, ObligationKind::AcquireEvidence),
    };

    SemanticResidue {
        requirement,
        status,
        obligation,
        capability_ids,
    }
}

/// Scheduling clock for a deterministic algorithm or cognitive breed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ReasoningClock {
    /// Per-event reflex work with fixed memory and strict latency.
    HardRealtime,
    /// Triggered diagnosis that may consume microseconds to milliseconds.
    SoftRealtime,
    /// Bounded asynchronous or batch deliberation.
    Deliberative,
}

/// Epistemic authority ceiling of an operator result.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum CandidateKind {
    /// A derivation proposed for graph admission.
    DerivedStatement,
    /// A conformance or constraint verdict.
    ConstraintVerdict,
    /// A ranked but unproven explanation.
    Hypothesis,
    /// A probability distribution or forecast.
    Prediction,
    /// A candidate process model or workflow fragment.
    ProcessModel,
    /// A candidate execution plan.
    Plan,
    /// A proposed new capability or integration.
    Capability,
}

/// Registry entry for one process-mining algorithm or cognitive breed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperatorDescriptor {
    /// Stable operator identifier.
    pub id: String,
    /// Runtime clock on which the operator may execute.
    pub clock: ReasoningClock,
    /// Declared worst-case latency for the admitted input profile.
    pub max_latency_micros: u64,
    /// Maximum number of admitted statements accepted by the profile.
    pub max_input_statements: usize,
    /// Result authority ceiling.
    pub candidate_kind: CandidateKind,
    /// Whether oracle, OCEL, receipt, and determinism certification is complete.
    pub bvc_certified: bool,
    /// Predicates that trigger eligibility.
    pub trigger_predicates: BTreeSet<String>,
}

/// Deterministic registry of algorithms and cognitive breeds.
#[derive(Debug, Clone, Default)]
pub struct OperatorRegistry {
    operators: BTreeMap<String, OperatorDescriptor>,
}

impl OperatorRegistry {
    /// Create an empty registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Register or replace one operator by stable identifier.
    pub fn register(&mut self, descriptor: OperatorDescriptor) {
        self.operators.insert(descriptor.id.clone(), descriptor);
    }

    /// Read one registered operator.
    #[must_use]
    pub fn get(&self, id: &str) -> Option<&OperatorDescriptor> {
        self.operators.get(id)
    }

    /// Iterate over operators in stable identifier order.
    pub fn iter(&self) -> impl Iterator<Item = &OperatorDescriptor> {
        self.operators.values()
    }
}

/// Budget for one cognitive scheduling decision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReasoningBudget {
    /// Clocks admitted for this decision.
    pub allowed_clocks: BTreeSet<ReasoningClock>,
    /// Maximum operators selected.
    pub max_operators: usize,
    /// Aggregate declared latency budget.
    pub max_total_latency_micros: u64,
}

/// Select certified operators deterministically under trigger, size, clock, and latency bounds.
#[must_use]
pub fn select_operators(
    registry: &OperatorRegistry,
    observed_predicates: &BTreeSet<String>,
    input_statement_count: usize,
    budget: &ReasoningBudget,
) -> Vec<OperatorDescriptor> {
    let mut candidates: Vec<OperatorDescriptor> = registry
        .iter()
        .filter(|operator| operator.bvc_certified)
        .filter(|operator| budget.allowed_clocks.contains(&operator.clock))
        .filter(|operator| input_statement_count <= operator.max_input_statements)
        .filter(|operator| {
            operator.trigger_predicates.is_empty()
                || !operator
                    .trigger_predicates
                    .is_disjoint(observed_predicates)
        })
        .cloned()
        .collect();

    candidates.sort_by(|left, right| {
        left.clock
            .cmp(&right.clock)
            .then(left.max_latency_micros.cmp(&right.max_latency_micros))
            .then(left.id.cmp(&right.id))
    });

    let mut selected = Vec::new();
    let mut used_latency = 0_u64;
    for candidate in candidates {
        if selected.len() >= budget.max_operators {
            break;
        }
        let next_latency = used_latency.saturating_add(candidate.max_latency_micros);
        if next_latency > budget.max_total_latency_micros {
            continue;
        }
        used_latency = next_latency;
        selected.push(candidate);
    }
    selected
}
