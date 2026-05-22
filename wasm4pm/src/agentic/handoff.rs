use crate::agentic::traits::HandoffValidator;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultHandoffValidator;

impl HandoffValidator for DefaultHandoffValidator {
    fn validate_handoff(&self, req: &HandoffRequest) -> Result<HandoffDecision, AgenticError> {
        let span = tracing::debug_span!(
            "autonomic.handoff_validation",
            task_id = %req.task.task_id,
            from = %req.from_agent,
            to_role = ?req.to_role,
        )
        .entered();

        let policy = &req.task.policy;

        // Gate 1: Check if to_role is blocked
        let gate_1_pass = !policy.blocked_roles.contains(&req.to_role);
        if !gate_1_pass {
            span.record("allowed", false);
            span.record("gate_1_pass", false);
            span.record("gate_2_pass", false); // Not evaluated
            span.record("gate_3_pass", false); // Not evaluated
            span.record("disposition", "Deny");
            return Ok(HandoffDecision {
                allowed: false,
                disposition: DecisionDisposition::Deny,
                transition: None,
                reason_codes: vec![format!("role:blocked:{:?}", req.to_role)],
            });
        }

        // Gate 2: Check if Delegate action is allowed (if any allowed_actions are specified)
        let gate_2_pass = policy.allowed_actions.is_empty()
            || policy.allowed_actions.contains(&ActionClass::Delegate);
        if !gate_2_pass {
            span.record("allowed", false);
            span.record("gate_1_pass", true);
            span.record("gate_2_pass", false);
            span.record("gate_3_pass", false); // Not evaluated
            span.record("disposition", "Deny");
            return Ok(HandoffDecision {
                allowed: false,
                disposition: DecisionDisposition::Deny,
                transition: None,
                reason_codes: vec!["action:delegate:not_allowed".to_string()],
            });
        }

        // Gate 3: Check required roles constraint
        let gate_3_pass =
            policy.required_roles.is_empty() || policy.required_roles.contains(&req.to_role);
        if !gate_3_pass {
            span.record("allowed", false);
            span.record("gate_1_pass", true);
            span.record("gate_2_pass", true);
            span.record("gate_3_pass", false);
            span.record("disposition", "Escalate");
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

        // Emit OTEL fields per Cycle 40 spec
        span.record("allowed", true);
        span.record("gate_1_pass", gate_1_pass);
        span.record("gate_2_pass", gate_2_pass);
        span.record("gate_3_pass", gate_3_pass);
        span.record("disposition", "Allow");

        tracing::debug!(
            target: "autonomic.handoff_validation",
            task_id = %req.task.task_id,
            allowed = true,
            gate_1_pass,
            gate_2_pass,
            gate_3_pass,
            "handoff approved"
        );

        Ok(HandoffDecision {
            allowed: true,
            disposition: DecisionDisposition::Allow,
            transition: Some(transition),
            reason_codes: vec!["policy:satisfied".to_string()],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    fn make_req(
        to_role: AgentRole,
        blocked: Vec<AgentRole>,
        allowed_actions: Vec<ActionClass>,
        required_roles: Vec<AgentRole>,
    ) -> HandoffRequest {
        let mut blocked_set = BTreeSet::new();
        for r in blocked {
            blocked_set.insert(r);
        }
        let mut allowed_set = BTreeSet::new();
        for a in allowed_actions {
            allowed_set.insert(a);
        }
        let mut required_set = BTreeSet::new();
        for r in required_roles {
            required_set.insert(r);
        }
        HandoffRequest {
            from_agent: "agent-a".to_string(),
            to_role,
            task: TaskContext {
                task_id: "t-ho".to_string(),
                policy: PolicyEnvelope {
                    blocked_roles: blocked_set,
                    allowed_actions: allowed_set,
                    required_roles: required_set,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        }
    }

    #[test]
    fn open_policy_allows_handoff() {
        let validator = DefaultHandoffValidator;
        let req = make_req(AgentRole::Executor, vec![], vec![], vec![]);
        let d = validator.validate_handoff(&req).unwrap();
        assert!(d.allowed);
        assert_eq!(d.disposition, DecisionDisposition::Allow);
        assert!(d.transition.is_some());
    }

    #[test]
    fn blocked_role_denies_handoff() {
        let validator = DefaultHandoffValidator;
        let req = make_req(
            AgentRole::Executor,
            vec![AgentRole::Executor],
            vec![],
            vec![],
        );
        let d = validator.validate_handoff(&req).unwrap();
        assert!(!d.allowed);
        assert_eq!(d.disposition, DecisionDisposition::Deny);
        assert!(d.reason_codes.iter().any(|r| r.contains("blocked")));
    }

    #[test]
    fn delegate_action_not_in_allowed_set_denies() {
        let validator = DefaultHandoffValidator;
        // allowed_actions set is non-empty and does NOT contain Delegate
        let req = make_req(AgentRole::Executor, vec![], vec![ActionClass::Read], vec![]);
        let d = validator.validate_handoff(&req).unwrap();
        assert!(!d.allowed);
        assert!(d.reason_codes.iter().any(|r| r.contains("delegate")));
    }

    #[test]
    fn delegate_action_allowed_when_in_set() {
        let validator = DefaultHandoffValidator;
        let req = make_req(
            AgentRole::Executor,
            vec![],
            vec![ActionClass::Delegate, ActionClass::Read],
            vec![],
        );
        let d = validator.validate_handoff(&req).unwrap();
        assert!(d.allowed);
    }

    #[test]
    fn required_role_mismatch_escalates() {
        let validator = DefaultHandoffValidator;
        // Required: Validator, but we're handing off to Executor
        let req = make_req(
            AgentRole::Executor,
            vec![],
            vec![],
            vec![AgentRole::Validator],
        );
        let d = validator.validate_handoff(&req).unwrap();
        assert!(!d.allowed);
        assert_eq!(d.disposition, DecisionDisposition::Escalate);
    }

    #[test]
    fn transition_envelope_carries_task_id() {
        let validator = DefaultHandoffValidator;
        let req = make_req(AgentRole::Planner, vec![], vec![], vec![]);
        let d = validator.validate_handoff(&req).unwrap();
        let transition = d.transition.unwrap();
        assert!(transition.transition_id.contains("t-ho"));
    }
}
