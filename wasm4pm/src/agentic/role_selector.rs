use crate::agentic::traits::RoleSelector;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultRoleSelector;

impl RoleSelector for DefaultRoleSelector {
    fn select_role(&self, task: &TaskContext) -> Result<RoleDecision, AgenticError> {
        // Phase → primary role mapping
        let (primary_role, candidates) = match &task.phase {
            WorkflowPhase::Intake => (
                AgentRole::Explorer,
                vec![AgentRole::Planner, AgentRole::Validator],
            ),
            WorkflowPhase::Triage => (
                AgentRole::Reviewer,
                vec![AgentRole::Validator, AgentRole::Explorer],
            ),
            WorkflowPhase::Analyze => (
                AgentRole::Explorer,
                vec![AgentRole::Auditor, AgentRole::Validator],
            ),
            WorkflowPhase::Plan => (
                AgentRole::Planner,
                vec![AgentRole::Reviewer, AgentRole::Executor],
            ),
            WorkflowPhase::Execute => (
                AgentRole::Executor,
                vec![AgentRole::Reviewer, AgentRole::Validator],
            ),
            WorkflowPhase::Validate => (
                AgentRole::Validator,
                vec![AgentRole::Reviewer, AgentRole::Auditor],
            ),
            WorkflowPhase::Escalate => (
                AgentRole::Escalator,
                vec![AgentRole::Auditor, AgentRole::Explainer],
            ),
            WorkflowPhase::Complete => (
                AgentRole::Auditor,
                vec![AgentRole::Compiler, AgentRole::Reviewer],
            ),
            WorkflowPhase::Failed => (
                AgentRole::Escalator,
                vec![AgentRole::Auditor, AgentRole::Explainer],
            ),
            WorkflowPhase::Custom(_) => (
                AgentRole::Explorer,
                vec![AgentRole::Planner, AgentRole::Validator],
            ),
        };

        // Override for Critical risk
        let selected_role = if matches!(task.risk_level, RiskLevel::Critical) {
            match &task.phase {
                WorkflowPhase::Intake => AgentRole::Explorer,
                WorkflowPhase::Triage => AgentRole::Escalator,
                WorkflowPhase::Analyze => AgentRole::Auditor,
                WorkflowPhase::Plan => AgentRole::Reviewer,
                WorkflowPhase::Execute => AgentRole::Reviewer,
                WorkflowPhase::Validate => AgentRole::Validator,
                WorkflowPhase::Escalate => AgentRole::Escalator,
                WorkflowPhase::Complete => AgentRole::Auditor,
                WorkflowPhase::Failed => AgentRole::Escalator,
                WorkflowPhase::Custom(_) => AgentRole::Escalator,
            }
        } else {
            primary_role
        };

        // Build candidate list: selected_role first, then others
        let mut candidate_roles = vec![selected_role.clone()];
        candidate_roles.extend(
            candidates
                .into_iter()
                .filter(|r| r != &selected_role)
                .take(2),
        );

        let confidence_band = match &task.phase {
            WorkflowPhase::Custom(_) => ConfidenceBand::Medium,
            _ => ConfidenceBand::High,
        };

        let reason_codes = vec![
            format!("phase:{:?}", task.phase),
            format!("risk:{:?}", task.risk_level),
        ];

        Ok(RoleDecision {
            selected_role,
            candidate_roles,
            confidence_band,
            reason_codes,
        })
    }
}
