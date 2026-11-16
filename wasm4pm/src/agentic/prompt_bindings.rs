use crate::agentic::traits::PromptBindingCompiler;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultPromptBindingCompiler;

impl PromptBindingCompiler for DefaultPromptBindingCompiler {
    fn compile_bindings(&self, task: &TaskContext) -> Result<PromptBindingSet, AgenticError> {
        use crate::agentic::prelude::*;

        // Internally run RoleSelector to get selected role
        let role_decision = DefaultRoleSelector.select_role(task)?;
        let selected_role = Some(role_decision.selected_role);

        // Internally run TaskDecomposer to get topology
        let topology_decision = DefaultTaskDecomposer.choose_topology(task)?;
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
