use crate::agentic::traits::EscalationEngine;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultEscalationEngine;

impl EscalationEngine for DefaultEscalationEngine {
    fn evaluate_escalation(&self, task: &TaskContext) -> Result<EscalationDecision, AgenticError> {
        let mut should_escalate = false;
        let mut reason_codes = vec![];

        // Drift-based escalation
        if matches!(
            task.evidence.drift_status,
            DriftStatus::OutOfControl | DriftStatus::TrendDetected
        ) {
            should_escalate = true;
            reason_codes.push(format!("drift:{:?}", task.evidence.drift_status));
        }

        // Risk-based escalation (Critical always escalates)
        if matches!(task.risk_level, RiskLevel::Critical) {
            should_escalate = true;
            reason_codes.push(format!("risk:{:?}", task.risk_level));
        }

        // Phase-based escalation
        if matches!(
            task.phase,
            WorkflowPhase::Failed | WorkflowPhase::Escalate
        ) {
            should_escalate = true;
            reason_codes.push(format!("phase:{:?}", task.phase));
        }

        let target_role = if should_escalate {
            Some(AgentRole::Escalator)
        } else {
            None
        };

        Ok(EscalationDecision {
            should_escalate,
            target_role,
            reason_codes,
        })
    }
}
