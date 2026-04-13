use core::fmt;
use std::collections::{BTreeMap, BTreeSet};

pub type ReceiptId = String;
pub type TaskId = String;
pub type AgentId = String;
pub type RoleId = String;
pub type TransitionId = String;
pub type ArtifactId = String;
pub type PolicyId = String;
pub type PromptTemplateId = String;
pub type PromptArtifactId = String;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ConfidenceBand {
    Unknown,
    Low,
    Medium,
    High,
    Certain,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum WorkflowPhase {
    Intake,
    Triage,
    Analyze,
    Plan,
    Execute,
    Validate,
    Escalate,
    Complete,
    Failed,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum AgentRole {
    Explorer,
    Planner,
    Executor,
    Validator,
    Explainer,
    Escalator,
    Auditor,
    Compiler,
    Reviewer,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SwarmTopology {
    Single,
    Parallel,
    Pipeline,
    Debate,
    ReviewLoop,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ActionClass {
    Read,
    Write,
    Execute,
    Delegate,
    Escalate,
    Summarize,
    Validate,
    GenerateArtifact,
    Notify,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ArtifactFamily {
    SystemPrompt,
    TaskPrompt,
    DelegationPrompt,
    ValidationPrompt,
    ExplanationPrompt,
    EscalationPrompt,
    HandoffPrompt,
    Report,
    Ticket,
    EmailDraft,
    AuditNote,
    ReceiptBundle,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum DecisionDisposition {
    Allow,
    Deny,
    Escalate,
    Retry,
    Defer,
    NoOp,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum DriftStatus {
    Stable,
    Watch,
    ShiftDetected,
    TrendDetected,
    OutOfControl,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReceiptRef {
    pub id: ReceiptId,
    pub transition_id: Option<TransitionId>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EvidenceEnvelope {
    pub receipt_refs: Vec<ReceiptRef>,
    pub required_evidence_classes: BTreeSet<String>,
    pub available_evidence_classes: BTreeSet<String>,
    pub confidence_score: Option<f32>,
    pub confidence_band: ConfidenceBand,
    pub drift_status: DriftStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyEnvelope {
    pub policy_ids: Vec<PolicyId>,
    pub allowed_actions: BTreeSet<ActionClass>,
    pub forbidden_actions: BTreeSet<ActionClass>,
    pub required_roles: BTreeSet<AgentRole>,
    pub blocked_roles: BTreeSet<AgentRole>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransitionEnvelope {
    pub transition_id: TransitionId,
    pub phase: WorkflowPhase,
    pub action_class: ActionClass,
    pub disposition: DecisionDisposition,
    pub allowed: bool,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TaskContext {
    pub task_id: TaskId,
    pub title: String,
    pub phase: WorkflowPhase,
    pub risk_level: RiskLevel,
    pub policy: PolicyEnvelope,
    pub evidence: EvidenceEnvelope,
    pub tags: BTreeSet<String>,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RoleDecision {
    pub selected_role: AgentRole,
    pub candidate_roles: Vec<AgentRole>,
    pub confidence_band: ConfidenceBand,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TopologyDecision {
    pub topology: SwarmTopology,
    pub candidate_topologies: Vec<SwarmTopology>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HandoffRequest {
    pub from_agent: AgentId,
    pub to_role: AgentRole,
    pub task: TaskContext,
    pub attached_evidence: EvidenceEnvelope,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HandoffDecision {
    pub allowed: bool,
    pub disposition: DecisionDisposition,
    pub transition: Option<TransitionEnvelope>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EscalationDecision {
    pub should_escalate: bool,
    pub target_role: Option<AgentRole>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ArtifactRequest {
    pub artifact_families: Vec<ArtifactFamily>,
    pub task: TaskContext,
    pub selected_role: Option<AgentRole>,
    pub selected_topology: Option<SwarmTopology>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ArtifactPlan {
    pub artifact_families: Vec<ArtifactFamily>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PromptBindingSet {
    pub task_id: TaskId,
    pub phase: WorkflowPhase,
    pub selected_role: Option<AgentRole>,
    pub topology: Option<SwarmTopology>,
    pub recommended_actions: Vec<ActionClass>,
    pub forbidden_actions: Vec<ActionClass>,
    pub evidence_receipts: Vec<ReceiptId>,
    pub confidence_band: ConfidenceBand,
    pub drift_status: DriftStatus,
    pub bindings: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CounterfactualOption {
    pub option_id: String,
    pub action_class: ActionClass,
    pub projected_disposition: DecisionDisposition,
    pub estimated_cost: Option<f32>,
    pub estimated_reward: Option<f32>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CounterfactualResult {
    pub selected_option_id: Option<String>,
    pub options: Vec<CounterfactualOption>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct JtbdCase {
    pub case_id: String,
    pub job_statement: String,
    pub task: TaskContext,
    pub expected_role: Option<AgentRole>,
    pub expected_topology: Option<SwarmTopology>,
    pub expected_disposition: Option<DecisionDisposition>,
    pub expected_artifacts: Vec<ArtifactFamily>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct JtbdResult {
    pub case_id: String,
    pub passed: bool,
    pub assertions: Vec<JtbdAssertion>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct JtbdAssertion {
    pub name: String,
    pub passed: bool,
    pub details: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgenticError {
    UnsupportedRole,
    UnsupportedTopology,
    MissingEvidence,
    PolicyViolation,
    InvalidTransition,
    EscalationRequired,
    CounterfactualUnavailable,
    Other(String),
}

impl fmt::Display for AgenticError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedRole => write!(f, "unsupported role"),
            Self::UnsupportedTopology => write!(f, "unsupported topology"),
            Self::MissingEvidence => write!(f, "missing evidence"),
            Self::PolicyViolation => write!(f, "policy violation"),
            Self::InvalidTransition => write!(f, "invalid transition"),
            Self::EscalationRequired => write!(f, "escalation required"),
            Self::CounterfactualUnavailable => write!(f, "counterfactual unavailable"),
            Self::Other(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for AgenticError {}
