use core::fmt;
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum RiskLevel {
    #[default]
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum ConfidenceBand {
    #[default]
    Unknown,
    Low,
    Medium,
    High,
    Certain,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum WorkflowPhase {
    #[default]
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

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum AgentRole {
    #[default]
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

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum SwarmTopology {
    #[default]
    Single,
    Parallel,
    Pipeline,
    Debate,
    ReviewLoop,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum ActionClass {
    #[default]
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

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum ArtifactFamily {
    #[default]
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

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum DecisionDisposition {
    #[default]
    Allow,
    Deny,
    Escalate,
    Retry,
    Defer,
    NoOp,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub enum DriftStatus {
    #[default]
    Stable,
    Watch,
    ShiftDetected,
    TrendDetected,
    OutOfControl,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ReceiptRef {
    pub id: ReceiptId,
    pub transition_id: Option<TransitionId>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct EvidenceEnvelope {
    pub receipt_refs: Vec<ReceiptRef>,
    pub required_evidence_classes: BTreeSet<String>,
    pub available_evidence_classes: BTreeSet<String>,
    pub confidence_score: Option<f32>,
    pub confidence_band: ConfidenceBand,
    pub drift_status: DriftStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct PolicyEnvelope {
    pub policy_ids: Vec<PolicyId>,
    pub allowed_actions: BTreeSet<ActionClass>,
    pub forbidden_actions: BTreeSet<ActionClass>,
    pub required_roles: BTreeSet<AgentRole>,
    pub blocked_roles: BTreeSet<AgentRole>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct TransitionEnvelope {
    pub transition_id: TransitionId,
    pub phase: WorkflowPhase,
    pub action_class: ActionClass,
    pub disposition: DecisionDisposition,
    pub allowed: bool,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct RoleDecision {
    pub selected_role: AgentRole,
    pub candidate_roles: Vec<AgentRole>,
    pub confidence_band: ConfidenceBand,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct TopologyDecision {
    pub topology: SwarmTopology,
    pub candidate_topologies: Vec<SwarmTopology>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct HandoffRequest {
    pub from_agent: AgentId,
    pub to_role: AgentRole,
    pub task: TaskContext,
    pub attached_evidence: EvidenceEnvelope,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct HandoffDecision {
    pub allowed: bool,
    pub disposition: DecisionDisposition,
    pub transition: Option<TransitionEnvelope>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct EscalationDecision {
    pub should_escalate: bool,
    pub target_role: Option<AgentRole>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ArtifactRequest {
    pub artifact_families: Vec<ArtifactFamily>,
    pub task: TaskContext,
    pub selected_role: Option<AgentRole>,
    pub selected_topology: Option<SwarmTopology>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ArtifactPlan {
    pub artifact_families: Vec<ArtifactFamily>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct CounterfactualOption {
    pub option_id: String,
    pub action_class: ActionClass,
    pub projected_disposition: DecisionDisposition,
    pub estimated_cost: Option<f32>,
    pub estimated_reward: Option<f32>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct CounterfactualResult {
    pub selected_option_id: Option<String>,
    pub options: Vec<CounterfactualOption>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct JtbdResult {
    pub case_id: String,
    pub passed: bool,
    pub assertions: Vec<JtbdAssertion>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct JtbdAssertion {
    pub name: String,
    pub passed: bool,
    pub details: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

impl Default for AgenticError {
    fn default() -> Self {
        Self::Other("unknown error".to_string())
    }
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

/// Structured error context — wraps an `AgenticError` with the agent identity,
/// action being attempted, task being processed, and (optional) cycle number.
///
/// When a multi-step agentic pipeline fails (role_selector → task_decomposer →
/// handoff_validator → evidence_sufficiency), the caller receives the context of
/// which step failed, not just the generic error variant.
///
/// # Example
///
/// ```rust
/// use wasm4pm::agentic::types::{AgenticError, AgenticContext};
///
/// let ctx = AgenticContext::new(
///     AgenticError::PolicyViolation,
///     "handoff_validator",
///     "validate_handoff",
///     Some("task-42"),
///     None,
/// );
/// assert!(ctx.to_string().contains("handoff_validator"));
/// assert!(ctx.to_string().contains("task-42"));
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgenticContext {
    /// The underlying error variant.
    pub error: AgenticError,
    /// Which concrete implementor raised the error (e.g. "handoff_validator").
    pub agent: String,
    /// Which trait method was being called (e.g. "validate_handoff").
    pub action: String,
    /// The task ID being processed, if available.
    pub task_id: Option<String>,
    /// The autonomic cycle count, if available.
    pub cycle: Option<u64>,
}

impl AgenticContext {
    pub fn new(
        error: AgenticError,
        agent: impl Into<String>,
        action: impl Into<String>,
        task_id: Option<impl Into<String>>,
        cycle: Option<u64>,
    ) -> Self {
        Self {
            error,
            agent: agent.into(),
            action: action.into(),
            task_id: task_id.map(Into::into),
            cycle,
        }
    }
}

impl fmt::Display for AgenticContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "agentic error in {}::{}", self.agent, self.action)?;
        if let Some(task_id) = &self.task_id {
            write!(f, " (task={task_id})")?;
        }
        if let Some(cycle) = self.cycle {
            write!(f, " (cycle={cycle})")?;
        }
        write!(f, ": {}", self.error)
    }
}

impl std::error::Error for AgenticContext {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agentic_context_display_includes_agent_action_task_cycle() {
        let ctx = AgenticContext::new(
            AgenticError::PolicyViolation,
            "handoff_validator",
            "validate_handoff",
            Some("task-42"),
            Some(7),
        );
        let s = ctx.to_string();
        assert!(s.contains("handoff_validator"), "missing agent: {s}");
        assert!(s.contains("validate_handoff"), "missing action: {s}");
        assert!(s.contains("task-42"), "missing task_id: {s}");
        assert!(s.contains('7'), "missing cycle: {s}");
        assert!(s.contains("policy violation"), "missing error: {s}");
    }

    #[test]
    fn agentic_context_without_task_and_cycle() {
        let ctx = AgenticContext::new(
            AgenticError::MissingEvidence,
            "evidence_checker",
            "is_sufficient",
            None::<String>,
            None,
        );
        let s = ctx.to_string();
        assert!(s.contains("evidence_checker"));
        assert!(s.contains("missing evidence"));
        assert!(!s.contains("task="));
        assert!(!s.contains("cycle="));
    }

    #[test]
    fn agentic_context_error_source_is_inner() {
        use std::error::Error;
        let ctx = AgenticContext::new(
            AgenticError::InvalidTransition,
            "handoff",
            "validate",
            None::<String>,
            None,
        );
        let source = ctx.source().expect("should have source");
        assert_eq!(source.to_string(), "invalid transition");
    }
}
