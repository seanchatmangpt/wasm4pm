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
        if matches!(task.phase, WorkflowPhase::Failed | WorkflowPhase::Escalate) {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn task(phase: WorkflowPhase, risk: RiskLevel, drift: DriftStatus) -> TaskContext {
        TaskContext {
            task_id: "t-esc".to_string(),
            phase,
            risk_level: risk,
            evidence: EvidenceEnvelope {
                drift_status: drift,
                ..Default::default()
            },
            ..Default::default()
        }
    }

    #[test]
    fn stable_low_risk_does_not_escalate() {
        let engine = DefaultEscalationEngine;
        let d = engine
            .evaluate_escalation(&task(
                WorkflowPhase::Execute,
                RiskLevel::Low,
                DriftStatus::Stable,
            ))
            .unwrap();
        assert!(!d.should_escalate);
        assert!(d.target_role.is_none());
    }

    #[test]
    fn out_of_control_drift_triggers_escalation() {
        let engine = DefaultEscalationEngine;
        let d = engine
            .evaluate_escalation(&task(
                WorkflowPhase::Execute,
                RiskLevel::Low,
                DriftStatus::OutOfControl,
            ))
            .unwrap();
        assert!(d.should_escalate);
        assert_eq!(d.target_role, Some(AgentRole::Escalator));
        assert!(d.reason_codes.iter().any(|r| r.contains("drift")));
    }

    #[test]
    fn critical_risk_always_escalates() {
        let engine = DefaultEscalationEngine;
        let d = engine
            .evaluate_escalation(&task(
                WorkflowPhase::Plan,
                RiskLevel::Critical,
                DriftStatus::Stable,
            ))
            .unwrap();
        assert!(d.should_escalate);
        assert!(d.reason_codes.iter().any(|r| r.contains("risk")));
    }

    #[test]
    fn failed_phase_triggers_escalation() {
        let engine = DefaultEscalationEngine;
        let d = engine
            .evaluate_escalation(&task(
                WorkflowPhase::Failed,
                RiskLevel::Low,
                DriftStatus::Stable,
            ))
            .unwrap();
        assert!(d.should_escalate);
        assert!(d.reason_codes.iter().any(|r| r.contains("phase")));
    }

    #[test]
    fn trend_detected_drift_triggers_escalation() {
        let engine = DefaultEscalationEngine;
        let d = engine
            .evaluate_escalation(&task(
                WorkflowPhase::Analyze,
                RiskLevel::Medium,
                DriftStatus::TrendDetected,
            ))
            .unwrap();
        assert!(d.should_escalate);
    }
}
