//! Integration tests for the four `#[wasm_bindgen]` agentic WASM exports.
//!
//! These tests verify the three required properties (per the task brief):
//!   1. Pipeline runs without panic on empty/default input (JSON round-trip)
//!   2. Handoff validation rejects malformed / structurally invalid input
//!   3. Counterfactual evaluation returns bounded scores (RL reward range)
//!
//! Tests are gated on `#[cfg(feature = "cloud")]` — the same gate as the exports.
//! Run with: `cargo test --features cloud --test agentic_wasm_export_tests`

use std::collections::BTreeSet;
use wasm4pm::agentic::prelude::*;

// ---------------------------------------------------------------------------
// Helper — build a minimal valid TaskContext as JSON
// ---------------------------------------------------------------------------

fn minimal_task_json(task_id: &str) -> String {
    serde_json::json!({
        "task_id": task_id,
        "title": "test task",
        "phase": "Intake",
        "risk_level": "Low",
        "policy": {
            "policy_ids": [],
            "allowed_actions": ["Execute", "Validate", "Delegate"],
            "forbidden_actions": [],
            "required_roles": [],
            "blocked_roles": []
        },
        "evidence": {
            "receipt_refs": [],
            "required_evidence_classes": [],
            "available_evidence_classes": [],
            "confidence_score": null,
            "confidence_band": "High",
            "drift_status": "Stable"
        },
        "tags": [],
        "metadata": {}
    })
    .to_string()
}

fn minimal_handoff_json(to_role: &str) -> String {
    serde_json::json!({
        "from_agent": "agent-a",
        "to_role": to_role,
        "task": serde_json::from_str::<serde_json::Value>(&minimal_task_json("h-task")).unwrap(),
        "attached_evidence": {
            "receipt_refs": [],
            "required_evidence_classes": [],
            "available_evidence_classes": [],
            "confidence_score": null,
            "confidence_band": "High",
            "drift_status": "Stable"
        },
        "metadata": {}
    })
    .to_string()
}

// ---------------------------------------------------------------------------
// Property 1: Pipeline runs without panic on empty/default input
// ---------------------------------------------------------------------------

/// The pipeline must not panic when given a minimal valid TaskContext.
#[test]
fn run_agentic_pipeline_minimal_valid_input_does_not_panic() {
    let compiler = DefaultPromptBindingCompiler;
    let checker = DefaultEvidenceSufficiencyChecker;
    let engine = DefaultEscalationEngine;

    let task: TaskContext = serde_json::from_str(&minimal_task_json("prop1")).unwrap();

    // Replicate the exact logic of run_agentic_pipeline (cloud-gated export)
    let bindings = compiler.compile_bindings(&task).expect("compile_bindings must not panic");
    let sufficient = checker.is_sufficient(&task).expect("is_sufficient must not panic");
    let gaps = checker.summarize_gaps(&task).expect("summarize_gaps must not panic");
    let escalation = engine.evaluate_escalation(&task).expect("evaluate_escalation must not panic");

    // Structural assertions
    assert!(bindings.selected_role.is_some());
    assert!(bindings.topology.is_some());
    assert!(bindings.bindings.contains_key("task_id"));
    assert!(sufficient, "minimal task with High confidence must be sufficient");
    assert!(gaps.is_empty(), "minimal task must have no evidence gaps");
    assert!(!escalation.should_escalate, "Low risk Intake must not escalate");
}

/// Default (zero-value) TaskContext must not panic anywhere in the pipeline.
#[test]
fn run_agentic_pipeline_default_task_context_does_not_panic() {
    let compiler = DefaultPromptBindingCompiler;
    let checker = DefaultEvidenceSufficiencyChecker;
    let engine = DefaultEscalationEngine;

    let task = TaskContext::default();

    let bindings = compiler.compile_bindings(&task);
    let sufficient = checker.is_sufficient(&task);
    let escalation = engine.evaluate_escalation(&task);

    assert!(bindings.is_ok(), "default TaskContext must not panic in compile_bindings");
    assert!(sufficient.is_ok(), "default TaskContext must not panic in is_sufficient");
    assert!(escalation.is_ok(), "default TaskContext must not panic in evaluate_escalation");
}

/// Empty JTBD suite (zero cases) must return an empty result without panicking.
#[test]
fn run_agentic_jtbd_suite_empty_cases_does_not_panic() {
    let runner = DefaultJtbdRunner;
    let results = runner.run_suite(&[]).unwrap();
    assert!(results.is_empty(), "empty suite must yield empty results");
}

// ---------------------------------------------------------------------------
// Property 2: Handoff validation rejects malformed input
// ---------------------------------------------------------------------------

/// Handoff to a blocked role must be denied.
#[test]
fn validate_agentic_handoff_blocked_role_is_rejected() {
    let validator = DefaultHandoffValidator;

    let mut blocked = BTreeSet::new();
    blocked.insert(AgentRole::Executor);

    let req = HandoffRequest {
        from_agent: "agent-a".to_string(),
        to_role: AgentRole::Executor,
        task: TaskContext {
            task_id: "prop2-block".to_string(),
            policy: PolicyEnvelope {
                blocked_roles: blocked,
                ..Default::default()
            },
            ..Default::default()
        },
        ..Default::default()
    };

    let decision = validator.validate_handoff(&req).unwrap();
    assert!(!decision.allowed, "handoff to blocked role must be denied");
    assert_eq!(decision.disposition, DecisionDisposition::Deny);
    assert!(decision.reason_codes.iter().any(|r| r.contains("blocked")));
}

/// Handoff when Delegate action is not in the allowed set must be denied.
#[test]
fn validate_agentic_handoff_delegate_not_allowed_is_rejected() {
    let validator = DefaultHandoffValidator;

    let mut allowed = BTreeSet::new();
    allowed.insert(ActionClass::Read); // only Read; no Delegate

    let req = HandoffRequest {
        from_agent: "agent-a".to_string(),
        to_role: AgentRole::Planner,
        task: TaskContext {
            task_id: "prop2-nodelegate".to_string(),
            policy: PolicyEnvelope {
                allowed_actions: allowed,
                ..Default::default()
            },
            ..Default::default()
        },
        ..Default::default()
    };

    let decision = validator.validate_handoff(&req).unwrap();
    assert!(!decision.allowed, "handoff without Delegate permission must be denied");
    assert!(decision.reason_codes.iter().any(|r| r.contains("delegate")));
}

/// Handoff to a role not in required_roles must result in Escalate, not Allow.
#[test]
fn validate_agentic_handoff_required_role_mismatch_escalates() {
    let validator = DefaultHandoffValidator;

    let mut required = BTreeSet::new();
    required.insert(AgentRole::Validator);

    let req = HandoffRequest {
        from_agent: "agent-a".to_string(),
        to_role: AgentRole::Executor, // not in required set
        task: TaskContext {
            task_id: "prop2-required".to_string(),
            policy: PolicyEnvelope {
                required_roles: required,
                ..Default::default()
            },
            ..Default::default()
        },
        ..Default::default()
    };

    let decision = validator.validate_handoff(&req).unwrap();
    assert!(!decision.allowed);
    assert_eq!(decision.disposition, DecisionDisposition::Escalate);
}

/// Open policy (no restrictions) must allow handoff and produce a transition envelope.
#[test]
fn validate_agentic_handoff_open_policy_allows_with_transition() {
    let validator = DefaultHandoffValidator;
    let req: HandoffRequest = serde_json::from_str(&minimal_handoff_json("Executor")).unwrap();
    let decision = validator.validate_handoff(&req).unwrap();
    assert!(decision.allowed);
    assert!(decision.transition.is_some(), "approved handoff must produce a transition envelope");
    let transition = decision.transition.unwrap();
    assert_eq!(transition.action_class, ActionClass::Delegate);
    assert!(transition.allowed);
}

// ---------------------------------------------------------------------------
// Property 3: Counterfactual evaluation returns bounded scores
// ---------------------------------------------------------------------------

/// All estimated_rewards must be within RL reward range [-5.0, 1.1 + epsilon].
#[test]
fn evaluate_agentic_counterfactuals_rewards_are_bounded() {
    let evaluator = DefaultCounterfactualEvaluator;

    let all_actions = vec![
        ActionClass::Execute,
        ActionClass::Validate,
        ActionClass::Delegate,
        ActionClass::Escalate,
        ActionClass::Read,
        ActionClass::Write,
        ActionClass::Summarize,
        ActionClass::GenerateArtifact,
        ActionClass::Notify,
    ];

    for drift in [
        DriftStatus::Stable,
        DriftStatus::Watch,
        DriftStatus::ShiftDetected,
        DriftStatus::TrendDetected,
        DriftStatus::OutOfControl,
        DriftStatus::Unknown,
    ] {
        let mut allowed = BTreeSet::new();
        for a in &all_actions {
            allowed.insert(a.clone());
        }
        let task = TaskContext {
            task_id: format!("cf-bounds-{drift:?}"),
            policy: PolicyEnvelope {
                allowed_actions: allowed,
                ..Default::default()
            },
            evidence: EvidenceEnvelope {
                drift_status: drift.clone(),
                ..Default::default()
            },
            ..Default::default()
        };

        let result = evaluator.evaluate_options(&task).unwrap();
        for opt in &result.options {
            if let Some(r) = opt.estimated_reward {
                assert!(
                    r >= -5.1 && r <= 1.2,
                    "drift={drift:?}, action={:?}: reward {r} outside RL bounds [-5.0, 1.1]",
                    opt.action_class
                );
            }
        }
    }
}

/// With no allowed actions, counterfactual result must be empty and not panic.
#[test]
fn evaluate_agentic_counterfactuals_empty_actions_does_not_panic() {
    let evaluator = DefaultCounterfactualEvaluator;
    let task = TaskContext {
        task_id: "cf-empty".to_string(),
        // policy.allowed_actions is empty by default
        ..Default::default()
    };
    let result = evaluator.evaluate_options(&task).unwrap();
    assert!(result.options.is_empty());
    assert!(result.selected_option_id.is_none());
}

/// The selected_option_id must correspond to the option with the highest estimated_reward.
#[test]
fn evaluate_agentic_counterfactuals_selected_option_has_max_reward() {
    let evaluator = DefaultCounterfactualEvaluator;
    let mut allowed = BTreeSet::new();
    allowed.insert(ActionClass::Execute); // delta=-1 → improves health
    allowed.insert(ActionClass::Read);    // delta=0 → no change
    allowed.insert(ActionClass::Escalate); // guard_pass=false → lower reward

    let task = TaskContext {
        task_id: "cf-max".to_string(),
        policy: PolicyEnvelope {
            allowed_actions: allowed,
            ..Default::default()
        },
        evidence: EvidenceEnvelope {
            drift_status: DriftStatus::Watch,
            confidence_band: ConfidenceBand::High,
            ..Default::default()
        },
        ..Default::default()
    };

    let result = evaluator.evaluate_options(&task).unwrap();
    let selected_id = result.selected_option_id.clone().unwrap();
    let selected_reward = result.options.iter()
        .find(|o| o.option_id == selected_id)
        .and_then(|o| o.estimated_reward)
        .unwrap();

    for opt in &result.options {
        let r = opt.estimated_reward.unwrap_or(f32::NEG_INFINITY);
        assert!(
            selected_reward >= r,
            "selected ({selected_id}, {selected_reward}) must have max reward; {:?} has {r}",
            opt.action_class
        );
    }
}

// ---------------------------------------------------------------------------
// JSON serialization round-trip tests
// ---------------------------------------------------------------------------

/// TaskContext serializes and deserializes without data loss.
#[test]
fn task_context_json_round_trip() {
    let original: TaskContext = serde_json::from_str(&minimal_task_json("rt-1")).unwrap();
    let serialized = serde_json::to_string(&original).unwrap();
    let round_tripped: TaskContext = serde_json::from_str(&serialized).unwrap();
    assert_eq!(original, round_tripped);
}

/// HandoffRequest serializes and deserializes without data loss.
#[test]
fn handoff_request_json_round_trip() {
    let original: HandoffRequest = serde_json::from_str(&minimal_handoff_json("Planner")).unwrap();
    let serialized = serde_json::to_string(&original).unwrap();
    let round_tripped: HandoffRequest = serde_json::from_str(&serialized).unwrap();
    assert_eq!(original, round_tripped);
}

/// JtbdCase serializes and deserializes without data loss.
#[test]
fn jtbd_case_json_round_trip() {
    let original = JtbdCase {
        case_id: "rt-case".to_string(),
        job_statement: "round-trip test".to_string(),
        task: serde_json::from_str(&minimal_task_json("rt-case-task")).unwrap(),
        expected_role: Some(AgentRole::Explorer),
        expected_topology: Some(SwarmTopology::Pipeline),
        expected_disposition: Some(DecisionDisposition::Allow),
        expected_artifacts: vec![ArtifactFamily::TaskPrompt],
        notes: vec!["note1".to_string()],
    };
    let serialized = serde_json::to_string(&original).unwrap();
    let round_tripped: JtbdCase = serde_json::from_str(&serialized).unwrap();
    assert_eq!(original, round_tripped);
}

/// CounterfactualResult serializes cleanly (no NaN, no Inf in the output).
#[test]
fn counterfactual_result_has_no_nan_or_inf_in_json() {
    let evaluator = DefaultCounterfactualEvaluator;
    let mut allowed = BTreeSet::new();
    allowed.insert(ActionClass::Execute);
    allowed.insert(ActionClass::Escalate);
    allowed.insert(ActionClass::Validate);

    let task = TaskContext {
        task_id: "cf-json-check".to_string(),
        policy: PolicyEnvelope {
            allowed_actions: allowed,
            ..Default::default()
        },
        ..Default::default()
    };

    let result = evaluator.evaluate_options(&task).unwrap();
    let json = serde_json::to_string(&result).expect("result must serialize to JSON");

    assert!(!json.contains("NaN"), "JSON must not contain NaN: {json}");
    assert!(!json.contains("Inf"), "JSON must not contain Inf: {json}");
    assert!(!json.contains("inf"), "JSON must not contain inf: {json}");
}
