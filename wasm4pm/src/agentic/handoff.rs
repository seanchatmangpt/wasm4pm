use crate::agentic::traits::HandoffValidator;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultHandoffValidator;

impl HandoffValidator for DefaultHandoffValidator {
    fn validate_handoff(&self, req: &HandoffRequest) -> Result<HandoffDecision, AgenticError> {
        let policy = &req.task.policy;

        // Gate 1: Check if to_role is blocked
        if policy.blocked_roles.contains(&req.to_role) {
            return Ok(HandoffDecision {
                allowed: false,
                disposition: DecisionDisposition::Deny,
                transition: None,
                reason_codes: vec![format!("role:blocked:{:?}", req.to_role)],
            });
        }

        // Gate 2: Check if Delegate action is allowed (if any allowed_actions are specified)
        if !policy.allowed_actions.is_empty() && !policy.allowed_actions.contains(&ActionClass::Delegate) {
            return Ok(HandoffDecision {
                allowed: false,
                disposition: DecisionDisposition::Deny,
                transition: None,
                reason_codes: vec!["action:delegate:not_allowed".to_string()],
            });
        }

        // Gate 3: Check required roles constraint
        if !policy.required_roles.is_empty() && !policy.required_roles.contains(&req.to_role) {
            return Ok(HandoffDecision {
                allowed: false,
                disposition: DecisionDisposition::Escalate,
                transition: None,
                reason_codes: vec![format!("role:required_mismatch:{:?}", req.to_role)],
            });
        }

        // All gates passed: allow handoff
        let transition_id = format!("{}-handoff", req.task.task_id);
        let transition = TransitionEnvelope {
            transition_id,
            phase: req.task.phase.clone(),
            action_class: ActionClass::Delegate,
            disposition: DecisionDisposition::Allow,
            allowed: true,
            reason_codes: vec!["handoff:approved".to_string()],
        };

        Ok(HandoffDecision {
            allowed: true,
            disposition: DecisionDisposition::Allow,
            transition: Some(transition),
            reason_codes: vec!["policy:satisfied".to_string()],
        })
    }
}
