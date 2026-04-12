use crate::agentic::traits::ArtifactDispatcher;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultArtifactDispatcher;

impl ArtifactDispatcher for DefaultArtifactDispatcher {
    fn plan_artifacts(&self, req: &ArtifactRequest) -> Result<ArtifactPlan, AgenticError> {
        // Determine role: use selected_role if present, else derive from phase
        let role = req.selected_role.clone().unwrap_or(match &req.task.phase {
            WorkflowPhase::Intake => AgentRole::Explorer,
            WorkflowPhase::Triage => AgentRole::Reviewer,
            WorkflowPhase::Analyze => AgentRole::Explorer,
            WorkflowPhase::Plan => AgentRole::Planner,
            WorkflowPhase::Execute => AgentRole::Executor,
            WorkflowPhase::Validate => AgentRole::Validator,
            WorkflowPhase::Escalate => AgentRole::Escalator,
            WorkflowPhase::Complete => AgentRole::Auditor,
            WorkflowPhase::Failed => AgentRole::Escalator,
            WorkflowPhase::Custom(_) => AgentRole::Explorer,
        });

        // Role → artifacts mapping
        let artifact_families = match role {
            AgentRole::Explorer => vec![ArtifactFamily::SystemPrompt, ArtifactFamily::TaskPrompt],
            AgentRole::Planner => vec![ArtifactFamily::TaskPrompt, ArtifactFamily::DelegationPrompt],
            AgentRole::Executor => vec![ArtifactFamily::TaskPrompt, ArtifactFamily::DelegationPrompt],
            AgentRole::Validator => vec![ArtifactFamily::ValidationPrompt, ArtifactFamily::Report],
            AgentRole::Escalator => vec![ArtifactFamily::EscalationPrompt, ArtifactFamily::Ticket],
            AgentRole::Auditor => vec![ArtifactFamily::AuditNote, ArtifactFamily::ReceiptBundle],
            AgentRole::Reviewer => vec![ArtifactFamily::ValidationPrompt, ArtifactFamily::Report],
            AgentRole::Explainer => vec![ArtifactFamily::ExplanationPrompt, ArtifactFamily::Report],
            AgentRole::Compiler => vec![ArtifactFamily::SystemPrompt, ArtifactFamily::TaskPrompt],
            AgentRole::Custom(_) => vec![ArtifactFamily::TaskPrompt],
        };

        Ok(ArtifactPlan {
            artifact_families,
            reason_codes: vec![format!("role:{:?}", role)],
        })
    }
}
