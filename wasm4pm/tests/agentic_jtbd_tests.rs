use pictl::agentic::prelude::*;
use std::collections::BTreeSet;

fn make_task_context(
    title: &str,
    phase: WorkflowPhase,
    risk_level: RiskLevel,
    confidence_band: ConfidenceBand,
    drift_status: DriftStatus,
) -> TaskContext {
    let mut allowed_actions = BTreeSet::new();
    allowed_actions.insert(ActionClass::Execute);
    allowed_actions.insert(ActionClass::Validate);
    allowed_actions.insert(ActionClass::Delegate);

    TaskContext {
        task_id: "task-001".to_string(),
        title: title.to_string(),
        phase,
        risk_level,
        policy: PolicyEnvelope {
            policy_ids: vec!["policy-1".to_string()],
            allowed_actions,
            forbidden_actions: BTreeSet::new(),
            required_roles: BTreeSet::new(),
            blocked_roles: BTreeSet::new(),
        },
        evidence: EvidenceEnvelope {
            receipt_refs: vec![],
            required_evidence_classes: BTreeSet::new(),
            available_evidence_classes: BTreeSet::new(),
            confidence_score: None,
            confidence_band,
            drift_status,
        },
        tags: BTreeSet::new(),
        metadata: std::collections::BTreeMap::new(),
    }
}

#[test]
fn role_selector_intake_maps_to_explorer() {
    let role_selector = DefaultRoleSelector;
    let task = make_task_context("Intake", WorkflowPhase::Intake, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable);

    let result = role_selector.select_role(&task).unwrap();
    assert_eq!(result.selected_role, AgentRole::Explorer);
}

#[test]
fn role_selector_triage_maps_to_reviewer() {
    let role_selector = DefaultRoleSelector;
    let task = make_task_context("Triage", WorkflowPhase::Triage, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable);

    let result = role_selector.select_role(&task).unwrap();
    assert_eq!(result.selected_role, AgentRole::Reviewer);
}

#[test]
fn role_selector_critical_risk_overrides_to_escalator() {
    let role_selector = DefaultRoleSelector;
    let task = make_task_context("Triage", WorkflowPhase::Triage, RiskLevel::Critical, ConfidenceBand::High, DriftStatus::Stable);

    let result = role_selector.select_role(&task).unwrap();
    assert_eq!(result.selected_role, AgentRole::Escalator);
}

#[test]
fn task_decomposer_low_risk_maps_to_single() {
    let decomposer = DefaultTaskDecomposer;
    let task = make_task_context("Execute", WorkflowPhase::Execute, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable);

    let result = decomposer.choose_topology(&task).unwrap();
    assert_eq!(result.topology, SwarmTopology::Single);
}

#[test]
fn task_decomposer_validate_phase_maps_to_reviewloop() {
    let decomposer = DefaultTaskDecomposer;
    let task = make_task_context("Validate", WorkflowPhase::Validate, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable);

    let result = decomposer.choose_topology(&task).unwrap();
    assert_eq!(result.topology, SwarmTopology::ReviewLoop);
}

#[test]
fn evidence_sufficiency_all_present_is_sufficient() {
    let checker = DefaultEvidenceSufficiencyChecker;
    let mut task = make_task_context("Test", WorkflowPhase::Intake, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable);
    task.evidence.required_evidence_classes.insert("log".to_string());
    task.evidence.available_evidence_classes.insert("log".to_string());

    let result = checker.is_sufficient(&task).unwrap();
    assert!(result);
}

#[test]
fn evidence_sufficiency_low_confidence_is_insufficient() {
    let checker = DefaultEvidenceSufficiencyChecker;
    let task = make_task_context("Test", WorkflowPhase::Intake, RiskLevel::Low, ConfidenceBand::Low, DriftStatus::Stable);

    let result = checker.is_sufficient(&task).unwrap();
    assert!(!result);
}

#[test]
fn escalation_engine_critical_risk_escalates() {
    let engine = DefaultEscalationEngine;
    let task = make_task_context("Test", WorkflowPhase::Intake, RiskLevel::Critical, ConfidenceBand::High, DriftStatus::Stable);

    let result = engine.evaluate_escalation(&task).unwrap();
    assert!(result.should_escalate);
    assert_eq!(result.target_role, Some(AgentRole::Escalator));
}

#[test]
fn escalation_engine_out_of_control_drift_escalates() {
    let engine = DefaultEscalationEngine;
    let task = make_task_context("Test", WorkflowPhase::Intake, RiskLevel::Low, ConfidenceBand::High, DriftStatus::OutOfControl);

    let result = engine.evaluate_escalation(&task).unwrap();
    assert!(result.should_escalate);
}

#[test]
fn artifact_dispatcher_explorer_artifacts() {
    let dispatcher = DefaultArtifactDispatcher;
    let request = ArtifactRequest {
        artifact_families: vec![],
        task: make_task_context("Test", WorkflowPhase::Intake, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable),
        selected_role: Some(AgentRole::Explorer),
        selected_topology: None,
    };

    let result = dispatcher.plan_artifacts(&request).unwrap();
    assert!(result.artifact_families.contains(&ArtifactFamily::SystemPrompt));
    assert!(result.artifact_families.contains(&ArtifactFamily::TaskPrompt));
}

#[test]
fn handoff_validator_allows_delegatable_to_allowed_role() {
    let validator = DefaultHandoffValidator;
    let req = HandoffRequest {
        from_agent: "agent-1".to_string(),
        to_role: AgentRole::Explorer,
        task: make_task_context("Test", WorkflowPhase::Intake, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable),
        attached_evidence: EvidenceEnvelope {
            receipt_refs: vec![],
            required_evidence_classes: BTreeSet::new(),
            available_evidence_classes: BTreeSet::new(),
            confidence_score: None,
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::Stable,
        },
        metadata: std::collections::BTreeMap::new(),
    };

    let result = validator.validate_handoff(&req).unwrap();
    assert!(result.allowed);
    assert_eq!(result.disposition, DecisionDisposition::Allow);
}

#[test]
fn prompt_binding_compiler_includes_role_and_topology() {
    let compiler = DefaultPromptBindingCompiler;
    let task = make_task_context("Test", WorkflowPhase::Plan, RiskLevel::Medium, ConfidenceBand::High, DriftStatus::Stable);

    let result = compiler.compile_bindings(&task).unwrap();
    assert!(result.selected_role.is_some());
    assert!(result.topology.is_some());
    assert!(result.bindings.contains_key("task_id"));
    assert!(result.bindings.contains_key("phase"));
}

#[test]
fn counterfactual_evaluator_selects_highest_reward_option() {
    let evaluator = DefaultCounterfactualEvaluator;
    let task = make_task_context("Test", WorkflowPhase::Intake, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable);

    let result = evaluator.evaluate_options(&task).unwrap();
    assert!(!result.options.is_empty());
    assert!(result.selected_option_id.is_some());
}

#[test]
fn jtbd_runner_checks_role_assertion() {
    let runner = DefaultJtbdRunner;
    let case = JtbdCase {
        case_id: "jtbd-role-001".to_string(),
        job_statement: "When intake arrives, route to explorer".to_string(),
        task: make_task_context("Intake task", WorkflowPhase::Intake, RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable),
        expected_role: Some(AgentRole::Explorer),
        expected_topology: None,
        expected_disposition: None,
        expected_artifacts: vec![],
        notes: vec![],
    };

    let result = runner.run_case(&case).unwrap();
    assert!(result.passed);
    assert!(result.assertions.iter().any(|a| a.name == "expected_role" && a.passed));
}

#[test]
fn jtbd_runner_full_case_with_all_assertions() {
    let runner = DefaultJtbdRunner;
    let case = JtbdCase {
        case_id: "jtbd-full-001".to_string(),
        job_statement: "Full job card for planning phase".to_string(),
        task: make_task_context("Plan task", WorkflowPhase::Plan, RiskLevel::Medium, ConfidenceBand::High, DriftStatus::Stable),
        expected_role: Some(AgentRole::Planner),
        expected_topology: Some(SwarmTopology::Pipeline),
        expected_disposition: Some(DecisionDisposition::Allow),
        expected_artifacts: vec![ArtifactFamily::TaskPrompt, ArtifactFamily::DelegationPrompt],
        notes: vec!["Full case test".to_string()],
    };

    let result = runner.run_case(&case).unwrap();
    assert!(result.passed);
    assert_eq!(result.assertions.len(), 4); // role, topology, disposition, artifacts
}
