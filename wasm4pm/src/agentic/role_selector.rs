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

#[cfg(test)]
mod tests {
    use super::*;

    fn task(phase: WorkflowPhase, risk: RiskLevel) -> TaskContext {
        TaskContext {
            task_id: "t1".to_string(),
            phase,
            risk_level: risk,
            ..Default::default()
        }
    }

    #[test]
    fn intake_low_risk_selects_explorer() {
        let sel = DefaultRoleSelector;
        let d = sel
            .select_role(&task(WorkflowPhase::Intake, RiskLevel::Low))
            .unwrap();
        assert_eq!(d.selected_role, AgentRole::Explorer);
        assert!(matches!(d.confidence_band, ConfidenceBand::High));
    }

    #[test]
    fn critical_triage_escalates_to_escalator() {
        let sel = DefaultRoleSelector;
        let d = sel
            .select_role(&task(WorkflowPhase::Triage, RiskLevel::Critical))
            .unwrap();
        assert_eq!(d.selected_role, AgentRole::Escalator);
    }

    #[test]
    fn validate_phase_selects_validator() {
        let sel = DefaultRoleSelector;
        let d = sel
            .select_role(&task(WorkflowPhase::Validate, RiskLevel::Medium))
            .unwrap();
        assert_eq!(d.selected_role, AgentRole::Validator);
    }

    #[test]
    fn reason_codes_include_phase_and_risk() {
        let sel = DefaultRoleSelector;
        let d = sel
            .select_role(&task(WorkflowPhase::Execute, RiskLevel::High))
            .unwrap();
        assert!(d.reason_codes.iter().any(|r| r.starts_with("phase:")));
        assert!(d.reason_codes.iter().any(|r| r.starts_with("risk:")));
    }

    #[test]
    fn custom_phase_yields_medium_confidence() {
        let sel = DefaultRoleSelector;
        let d = sel
            .select_role(&task(
                WorkflowPhase::Custom("unusual".to_string()),
                RiskLevel::Low,
            ))
            .unwrap();
        assert!(matches!(d.confidence_band, ConfidenceBand::Medium));
    }

    #[test]
    fn candidate_roles_always_lead_with_selected_role() {
        let sel = DefaultRoleSelector;
        for phase in [
            WorkflowPhase::Intake,
            WorkflowPhase::Plan,
            WorkflowPhase::Execute,
            WorkflowPhase::Complete,
        ] {
            let d = sel.select_role(&task(phase, RiskLevel::Low)).unwrap();
            assert_eq!(
                d.candidate_roles.first(),
                Some(&d.selected_role),
                "selected_role must lead candidate_roles"
            );
        }
    }
}
