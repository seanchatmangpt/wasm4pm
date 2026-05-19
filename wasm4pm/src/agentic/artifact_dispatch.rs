use crate::agentic::traits::ArtifactDispatcher;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultArtifactDispatcher;

impl ArtifactDispatcher for DefaultArtifactDispatcher {
    fn plan_artifacts(&self, req: &ArtifactRequest) -> Result<ArtifactPlan, AgenticError> {
        let mut span = tracing::debug_span!(
            "autonomic.artifact_dispatch",
            task_id = %req.task.task_id,
            selected_role = ?req.selected_role,
        )
        .entered();

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
            AgentRole::Planner => {
                vec![ArtifactFamily::TaskPrompt, ArtifactFamily::DelegationPrompt]
            }
            AgentRole::Executor => {
                vec![ArtifactFamily::TaskPrompt, ArtifactFamily::DelegationPrompt]
            }
            AgentRole::Validator => vec![ArtifactFamily::ValidationPrompt, ArtifactFamily::Report],
            AgentRole::Escalator => vec![ArtifactFamily::EscalationPrompt, ArtifactFamily::Ticket],
            AgentRole::Auditor => vec![ArtifactFamily::AuditNote, ArtifactFamily::ReceiptBundle],
            AgentRole::Reviewer => vec![ArtifactFamily::ValidationPrompt, ArtifactFamily::Report],
            AgentRole::Explainer => vec![ArtifactFamily::ExplanationPrompt, ArtifactFamily::Report],
            AgentRole::Compiler => vec![ArtifactFamily::SystemPrompt, ArtifactFamily::TaskPrompt],
            AgentRole::Custom(_) => vec![ArtifactFamily::TaskPrompt],
        };

        // Emit OTEL fields per Cycle 40 spec
        let artifact_family_names: Vec<String> = artifact_families
            .iter()
            .map(|af| format!("{:?}", af))
            .collect();
        let artifact_count = artifact_family_names.len();

        span.record("role", format!("{:?}", role));
        span.record("artifact_families", artifact_family_names.join(","));
        span.record("artifact_count", artifact_count);

        tracing::debug!(
            target: "autonomic.artifact_dispatch",
            task_id = %req.task.task_id,
            role = ?role,
            artifact_count,
            "artifact plan complete"
        );

        Ok(ArtifactPlan {
            artifact_families,
            reason_codes: vec![format!("role:{:?}", role)],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(role: Option<AgentRole>, phase: WorkflowPhase) -> ArtifactRequest {
        ArtifactRequest {
            artifact_families: vec![],
            task: TaskContext {
                task_id: "ad-test".to_string(),
                phase,
                ..Default::default()
            },
            selected_role: role,
            selected_topology: None,
        }
    }

    #[test]
    fn explorer_role_yields_system_and_task_prompts() {
        let d = DefaultArtifactDispatcher;
        let plan = d.plan_artifacts(&req(Some(AgentRole::Explorer), WorkflowPhase::Intake)).unwrap();
        assert!(plan.artifact_families.contains(&ArtifactFamily::SystemPrompt));
        assert!(plan.artifact_families.contains(&ArtifactFamily::TaskPrompt));
    }

    #[test]
    fn validator_role_yields_validation_prompt_and_report() {
        let d = DefaultArtifactDispatcher;
        let plan = d.plan_artifacts(&req(Some(AgentRole::Validator), WorkflowPhase::Validate)).unwrap();
        assert!(plan.artifact_families.contains(&ArtifactFamily::ValidationPrompt));
        assert!(plan.artifact_families.contains(&ArtifactFamily::Report));
    }

    #[test]
    fn escalator_role_yields_escalation_prompt_and_ticket() {
        let d = DefaultArtifactDispatcher;
        let plan = d.plan_artifacts(&req(Some(AgentRole::Escalator), WorkflowPhase::Escalate)).unwrap();
        assert!(plan.artifact_families.contains(&ArtifactFamily::EscalationPrompt));
        assert!(plan.artifact_families.contains(&ArtifactFamily::Ticket));
    }

    #[test]
    fn auditor_role_yields_audit_note_and_receipt_bundle() {
        let d = DefaultArtifactDispatcher;
        let plan = d.plan_artifacts(&req(Some(AgentRole::Auditor), WorkflowPhase::Complete)).unwrap();
        assert!(plan.artifact_families.contains(&ArtifactFamily::AuditNote));
        assert!(plan.artifact_families.contains(&ArtifactFamily::ReceiptBundle));
    }

    #[test]
    fn no_selected_role_derives_from_phase_intake() {
        let d = DefaultArtifactDispatcher;
        let plan = d.plan_artifacts(&req(None, WorkflowPhase::Intake)).unwrap();
        // Intake → Explorer → SystemPrompt + TaskPrompt
        assert!(plan.artifact_families.contains(&ArtifactFamily::SystemPrompt));
    }

    #[test]
    fn reason_codes_contain_role_name() {
        let d = DefaultArtifactDispatcher;
        let plan = d.plan_artifacts(&req(Some(AgentRole::Planner), WorkflowPhase::Plan)).unwrap();
        assert!(plan.reason_codes.iter().any(|r| r.contains("Planner")));
    }

    #[test]
    fn custom_role_yields_task_prompt() {
        let d = DefaultArtifactDispatcher;
        let plan = d.plan_artifacts(&req(
            Some(AgentRole::Custom("unusual".to_string())),
            WorkflowPhase::Plan,
        ))
        .unwrap();
        assert!(plan.artifact_families.contains(&ArtifactFamily::TaskPrompt));
        assert_eq!(plan.artifact_families.len(), 1);
    }

    #[test]
    fn default_artifact_request_does_not_panic() {
        // Property: empty/default input must never panic
        let d = DefaultArtifactDispatcher;
        let result = d.plan_artifacts(&ArtifactRequest::default());
        assert!(result.is_ok(), "default ArtifactRequest must not panic: {result:?}");
    }
}
