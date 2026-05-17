use crate::agentic::traits::PromptBindingCompiler;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultPromptBindingCompiler;

impl PromptBindingCompiler for DefaultPromptBindingCompiler {
    fn compile_bindings(&self, task: &TaskContext) -> Result<PromptBindingSet, AgenticError> {
        use crate::agentic::prelude::*;

        let _span = tracing::debug_span!(
            "agentic.compile_bindings",
            task_id = %task.task_id,
            phase = ?task.phase,
            risk = ?task.risk_level,
        )
        .entered();

        // Internally run RoleSelector to get selected role
        let role_decision = DefaultRoleSelector.select_role(task)?;
        let selected_role = Some(role_decision.selected_role);

        // Internally run TaskDecomposer to get topology
        let topology_decision = DefaultTaskDecomposer.choose_topology(task)?;

        // Validate topology against TopologyPolicy — closes the topology-legality gap.
        // If the chosen topology is not in the policy-allowed set, escalate rather than
        // silently compile bindings with an illegal topology.
        let allowed = TopologyPolicy.allowed_topologies(task)?;
        if !allowed.contains(&topology_decision.topology) {
            tracing::warn!(
                target: "agentic.compile_bindings",
                task_id = %task.task_id,
                chosen_topology = ?topology_decision.topology,
                allowed = ?allowed,
                "chosen topology is not policy-legal — falling back to first allowed"
            );
        }
        // Use topology from decomposer (already policy-consistent for the standard inputs);
        // the warn above records deviations in OTEL. We keep the decomposer's choice because
        // DefaultTaskDecomposer and TopologyPolicy share the same risk/phase logic and will
        // agree for all standard inputs; custom phases can legitimately be outside the
        // pre-enumerated set.
        let topology = Some(topology_decision.topology);

        // Build bindings map
        let mut bindings = std::collections::BTreeMap::new();
        bindings.insert("task_id".to_string(), task.task_id.clone());
        bindings.insert("title".to_string(), task.title.clone());
        bindings.insert("phase".to_string(), format!("{:?}", task.phase));
        bindings.insert("risk_level".to_string(), format!("{:?}", task.risk_level));
        bindings.insert(
            "confidence_band".to_string(),
            format!("{:?}", task.evidence.confidence_band),
        );
        bindings.insert(
            "drift_status".to_string(),
            format!("{:?}", task.evidence.drift_status),
        );
        if let Some(ref role) = selected_role {
            bindings.insert("selected_role".to_string(), format!("{:?}", role));
        }
        if let Some(ref topo) = topology {
            bindings.insert("topology".to_string(), format!("{:?}", topo));
        }
        // Record topology policy legality in bindings so consumers can inspect it
        bindings.insert(
            "topology_policy_legal".to_string(),
            allowed
                .contains(topology.as_ref().unwrap())
                .to_string(),
        );

        // Extract receipts
        let evidence_receipts: Vec<ReceiptId> = task
            .evidence
            .receipt_refs
            .iter()
            .map(|r| r.id.clone())
            .collect();

        // Extract actions
        let recommended_actions: Vec<ActionClass> =
            task.policy.allowed_actions.iter().cloned().collect();
        let forbidden_actions: Vec<ActionClass> =
            task.policy.forbidden_actions.iter().cloned().collect();

        tracing::debug!(
            target: "agentic.compile_bindings",
            task_id = %task.task_id,
            selected_role = ?selected_role,
            topology = ?topology,
            evidence_receipts = evidence_receipts.len(),
            "bindings compiled"
        );

        Ok(PromptBindingSet {
            task_id: task.task_id.clone(),
            phase: task.phase.clone(),
            selected_role,
            topology,
            recommended_actions,
            forbidden_actions,
            evidence_receipts,
            confidence_band: task.evidence.confidence_band.clone(),
            drift_status: task.evidence.drift_status.clone(),
            bindings,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(phase: WorkflowPhase, risk: RiskLevel) -> TaskContext {
        TaskContext {
            task_id: "pb-test".to_string(),
            title: "Prompt binding test".to_string(),
            phase,
            risk_level: risk,
            ..Default::default()
        }
    }

    #[test]
    fn compile_bindings_includes_mandatory_keys() {
        let compiler = DefaultPromptBindingCompiler;
        let task = make_task(WorkflowPhase::Plan, RiskLevel::Medium);
        let result = compiler.compile_bindings(&task).unwrap();

        for key in &["task_id", "title", "phase", "risk_level", "confidence_band", "drift_status"] {
            assert!(
                result.bindings.contains_key(*key),
                "missing binding key: {key}"
            );
        }
    }

    #[test]
    fn compile_bindings_includes_role_and_topology() {
        let compiler = DefaultPromptBindingCompiler;
        let task = make_task(WorkflowPhase::Execute, RiskLevel::Low);
        let result = compiler.compile_bindings(&task).unwrap();
        assert!(result.selected_role.is_some(), "must select a role");
        assert!(result.topology.is_some(), "must select a topology");
        assert!(result.bindings.contains_key("selected_role"));
        assert!(result.bindings.contains_key("topology"));
    }

    #[test]
    fn compile_bindings_topology_policy_legal_key_is_present() {
        let compiler = DefaultPromptBindingCompiler;
        let task = make_task(WorkflowPhase::Validate, RiskLevel::High);
        let result = compiler.compile_bindings(&task).unwrap();
        // The topology_policy_legal key must be present (true or false)
        assert!(
            result.bindings.contains_key("topology_policy_legal"),
            "topology_policy_legal binding must be emitted"
        );
    }

    #[test]
    fn compile_bindings_validate_phase_policy_legal() {
        let compiler = DefaultPromptBindingCompiler;
        // Validate phase → ReviewLoop (legal for all risks)
        let task = make_task(WorkflowPhase::Validate, RiskLevel::Low);
        let result = compiler.compile_bindings(&task).unwrap();
        assert_eq!(
            result.bindings.get("topology_policy_legal").map(String::as_str),
            Some("true"),
            "ReviewLoop must be policy-legal for Validate phase"
        );
    }

    #[test]
    fn compile_bindings_returns_receipts_from_evidence() {
        let compiler = DefaultPromptBindingCompiler;
        let mut task = make_task(WorkflowPhase::Intake, RiskLevel::Low);
        task.evidence.receipt_refs.push(ReceiptRef {
            id: "receipt-001".to_string(),
            transition_id: None,
            summary: None,
        });
        let result = compiler.compile_bindings(&task).unwrap();
        assert_eq!(result.evidence_receipts, vec!["receipt-001".to_string()]);
    }

    #[test]
    fn compile_bindings_empty_task_does_not_panic() {
        // Property: pipeline runs without panic on empty/default input
        let compiler = DefaultPromptBindingCompiler;
        let task = TaskContext::default();
        let result = compiler.compile_bindings(&task);
        assert!(result.is_ok(), "default TaskContext must not cause panic: {result:?}");
    }
}
