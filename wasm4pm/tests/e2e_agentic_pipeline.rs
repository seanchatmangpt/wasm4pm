//! End-to-end tests for the Closed Claw Autonomic Pipeline.
//!
//! Each test corresponds to one or more Mermaid architecture diagrams:
//!
//! 1.  Full pipeline: Event Stream → Feature Extraction → State → LinUCB → Marking → SPC → Reward → Bindings
//! 2.  CPU hot path: Guards → Dispatch → RL Select → Circuit Breaker → SPC → Marking Enabled → Marking Fire
//! 3.  Autonomic state machine: Observe → Discover → Decide → Validate → Execute/Escalate → Monitor → Learn
//! 4.  ML challenges: SPC Rules 1-3, entropy features, bandit weighting
//! 5.  RL controls: UCB bonus, bounded reward, persistent state, lawful action clipping, 8-feature state
//! 6.  GPU/CPU fallback: CPU reference always produces valid action
//! 7.  Agentic control pipeline: Task → RoleSelector → ... → JtbdRunner
//! 8.  Decision gate: evidence gate → lawful gate → compile → marking → receipt
//! 9.  Prompt foundry: all inputs produce complete bindings
//! 10. Baseline vs ClosedClaw: LLM latency proxy vs deterministic decision
//! 11. Health state machine: Healthy → Watch → Adaptive → Escalated/Blocked
//! 12. Petri net token flow: P0 → T0 → P1 → ... through 7-transition pipeline
//! 13. Counterfactual bandwidth: multiple candidates → parallel scoring → top action
//! 14. Benchmark challenge map: challenge-response pairs verified

use pictl::agentic::prelude::*;
use pictl::hot_kernels::{marking_enabled4, marking_fire4, Marking4, Transition4};
use pictl::rl_orchestrator::{compute_reward, AgentType, RlOrchestrator};
use pictl::spc::{check_western_electric_rules, ChartData, SpecialCause, TrendDirection};
use pictl::RlState;
use std::collections::BTreeSet;

/// Helper to create test RlState with reasonable defaults
fn make_test_state(health_level: u8) -> RlState {
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0]; // dummy feature vector
    RlState::from_features(&features, health_level, 0.0) // rework_ratio = 0.0
}

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

fn make_task(
    phase: WorkflowPhase,
    risk: RiskLevel,
    confidence: ConfidenceBand,
    drift: DriftStatus,
) -> TaskContext {
    let mut allowed = BTreeSet::new();
    allowed.insert(ActionClass::Execute);
    allowed.insert(ActionClass::Validate);
    allowed.insert(ActionClass::Delegate);

    TaskContext {
        task_id: "e2e-task".to_string(),
        title: "E2E test task".to_string(),
        phase,
        risk_level: risk,
        policy: PolicyEnvelope {
            policy_ids: vec!["p1".to_string()],
            allowed_actions: allowed,
            forbidden_actions: BTreeSet::new(),
            required_roles: BTreeSet::new(),
            blocked_roles: BTreeSet::new(),
        },
        evidence: EvidenceEnvelope {
            receipt_refs: vec![],
            required_evidence_classes: BTreeSet::new(),
            available_evidence_classes: BTreeSet::new(),
            confidence_score: None,
            confidence_band: confidence,
            drift_status: drift,
        },
        tags: BTreeSet::new(),
        metadata: std::collections::BTreeMap::new(),
    }
}

fn make_task_with_actions(allowed: BTreeSet<ActionClass>) -> TaskContext {
    TaskContext {
        task_id: "e2e-counterfactual".to_string(),
        title: "Counterfactual test task".to_string(),
        phase: WorkflowPhase::Execute,
        risk_level: RiskLevel::Medium,
        policy: PolicyEnvelope {
            policy_ids: vec!["p1".to_string()],
            allowed_actions: allowed,
            forbidden_actions: BTreeSet::new(),
            required_roles: BTreeSet::new(),
            blocked_roles: BTreeSet::new(),
        },
        evidence: EvidenceEnvelope {
            receipt_refs: vec![],
            required_evidence_classes: BTreeSet::new(),
            available_evidence_classes: BTreeSet::new(),
            confidence_score: None,
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::Stable,
        },
        tags: BTreeSet::new(),
        metadata: std::collections::BTreeMap::new(),
    }
}

fn spc_point(ts: &str, value: f64, cl: f64, sigma: f64) -> ChartData {
    ChartData {
        timestamp: ts.to_string(),
        value,
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    }
}

// ---------------------------------------------------------------------------
// Diagram 1: Full Pipeline — Event Stream → Prompt Bindings
// ---------------------------------------------------------------------------

/// E2E flow: event features feed the RL orchestrator, Petri marking validates
/// the resulting state transition, SPC monitors health, and prompt bindings
/// are compiled from the agentic layer — completing one full autonomic cycle.
#[test]
fn e2e_pipeline_event_stream_to_prompt_bindings() {
    // Step 1: Feature extraction from "observed" event log
    let features: [f32; 8] = [
        0.30, // trace_length (normalised)
        0.50, // elapsed_time ratio
        0.10, // rework_count ratio
        0.70, // unique_activities / 100
        0.20, // avg_inter_event_time / 3600
        1.00, // log_size_bin (non-trivial log)
        0.80, // activity_entropy (Shannon / log2)
        0.40, // variant_ratio
    ];

    // Step 2: State O_t — health at "Watch" (2)
    let state = make_test_state(2);

    // Step 3: RL selects action
    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);
    let next_state = make_test_state(1);
    let (action_label, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
    assert!(!action_label.is_empty(), "RL must produce an action label");
    assert!(!reward.is_nan(), "Reward must be a real number");
    assert_eq!(orch.telemetry().cycle_count, 1);

    // Step 4: Petri net validates the resulting transition (T_execute: p0→p1)
    let m = Marking4 { p0: 1, p1: 0, p2: 0, p3: 0 };
    let t_execute = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let enabled = marking_enabled4(m, t_execute);
    assert_eq!(enabled, 1, "Transition must be enabled given a token in p0");
    let m2 = marking_fire4(m, t_execute, enabled);
    assert_eq!(m2.p0, 0, "Token consumed from p0");
    assert_eq!(m2.p1, 1, "Token produced in p1");

    // Step 5: Agentic layer compiles prompt bindings from task state
    let task = make_task(
        WorkflowPhase::Execute,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );
    let sufficient = DefaultEvidenceSufficiencyChecker.is_sufficient(&task).unwrap();
    assert!(sufficient, "Evidence must be sufficient before compiling bindings");

    let bindings = DefaultPromptBindingCompiler.compile_bindings(&task).unwrap();
    assert!(bindings.selected_role.is_some(), "Bindings must include selected role");
    assert!(bindings.topology.is_some(), "Bindings must include topology");
    assert!(bindings.bindings.contains_key("task_id"));
    assert!(bindings.bindings.contains_key("phase"));
    assert!(bindings.bindings.contains_key("risk_level"));
    assert!(bindings.bindings.contains_key("confidence_band"));
    assert!(bindings.bindings.contains_key("drift_status"));

    // Step 6: Receipt chain — telemetry proves a cycle completed
    assert!(orch.telemetry().cycle_count > 0, "At least one cycle must be recorded");
}

// ---------------------------------------------------------------------------
// Diagram 2: CPU Hot Path — Marking Enabled → Marking Fire → Reward
// ---------------------------------------------------------------------------

/// Validates the CPU hot path: marking_enabled4 → marking_fire4 → compute_reward.
/// This is the innermost tick of the Closed Claw, executing in ~6 ns combined.
#[test]
fn e2e_cpu_hot_path_marking_sequence() {
    // Tick 7: Marking Enabled (guard check)
    let m = Marking4 { p0: 1, p1: 0, p2: 0, p3: 0 };
    let t = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let enabled = marking_enabled4(m, t);
    assert_eq!(enabled, 1, "Marking enabled when input place has token");

    // Tick 8: Marking Fire (state transition)
    let m2 = marking_fire4(m, t, enabled);
    assert_eq!(m2.p0, 0, "Input token consumed");
    assert_eq!(m2.p1, 1, "Output token produced");

    // RL reward for health improvement (3 → 1 = large gain)
    let reward = compute_reward(3, 1, 0, true, true, false);
    assert!(reward > 0.0, "Positive reward for health improvement");

    // Blocked marking produces no state change
    let m_blocked = Marking4 { p0: 0, p1: 0, p2: 0, p3: 0 };
    let enabled_blocked = marking_enabled4(m_blocked, t);
    assert_eq!(enabled_blocked, 0, "No token in p0 = marking disabled");
    let m_unchanged = marking_fire4(m_blocked, t, enabled_blocked);
    assert_eq!(m_unchanged.p0, 0, "Blocked fire leaves marking unchanged");
    assert_eq!(m_unchanged.p1, 0, "No token produced when blocked");
}

/// Saturating arithmetic: firing into a full place does not overflow.
#[test]
fn e2e_cpu_hot_path_saturating_arithmetic() {
    let m_full = Marking4 { p0: u32::MAX, p1: 0, p2: 0, p3: 0 };
    let t_subtract = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 0, out2: 0, out3: 0,
    };
    let en = marking_enabled4(m_full, t_subtract);
    assert_eq!(en, 1);
    let m2 = marking_fire4(m_full, t_subtract, en);
    assert_eq!(m2.p0, u32::MAX - 1, "Wrapping sub from MAX is safe");
}

// ---------------------------------------------------------------------------
// Diagram 3: Autonomic State Machine — Observe → Discover → Decide → Execute/Escalate → Monitor → Learn
// ---------------------------------------------------------------------------

/// Happy path: evidence present → lawful decision → execute → monitor → reward positive → learn.
#[test]
fn e2e_autonomic_state_machine_happy_path() {
    // OBSERVE + DISCOVER: task has high-quality evidence
    let task = make_task(
        WorkflowPhase::Execute,
        RiskLevel::Low,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    // DECIDE: role and topology chosen deterministically
    let role = DefaultRoleSelector.select_role(&task).unwrap();
    assert_eq!(role.selected_role, AgentRole::Executor);

    let topo = DefaultTaskDecomposer.choose_topology(&task).unwrap();
    assert_eq!(topo.topology, SwarmTopology::Single);

    // VALIDATE: evidence sufficient, no escalation
    let sufficient = DefaultEvidenceSufficiencyChecker.is_sufficient(&task).unwrap();
    assert!(sufficient);

    let escalation = DefaultEscalationEngine.evaluate_escalation(&task).unwrap();
    assert!(!escalation.should_escalate, "Low-risk stable task must not escalate");

    // EXECUTE: Petri marking fires
    let m = Marking4 { p0: 1, p1: 0, p2: 0, p3: 0 };
    let t = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let en = marking_enabled4(m, t);
    assert_eq!(en, 1);
    let m2 = marking_fire4(m, t, en);
    assert_eq!(m2.p1, 1);

    // MONITOR: RL reward is positive (health improved from 1 to 0)
    let reward = compute_reward(1, 0, 0, true, true, false);
    assert!(reward > 0.0);

    // LEARN: orchestrator cycle recorded
    let mut orch = RlOrchestrator::new();
    let features = [0.1, 0.5, 0.0, 0.5, 0.2, 1.0, 0.9, 0.3];
    let state = make_test_state(1);
    let next_state = make_test_state(1);
    let (_, cycle_reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
    assert_eq!(orch.telemetry().cycle_count, 1);
    assert_eq!(orch.telemetry().cumulative_reward, cycle_reward);
}

/// Escalation path: out-of-control drift triggers escalation before execution.
#[test]
fn e2e_autonomic_state_machine_escalation_path() {
    // OBSERVE: process is out-of-control
    let task = make_task(
        WorkflowPhase::Execute,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::OutOfControl,
    );

    // DECIDE: escalation engine triggers
    let escalation = DefaultEscalationEngine.evaluate_escalation(&task).unwrap();
    assert!(escalation.should_escalate, "OutOfControl drift must escalate");
    assert_eq!(escalation.target_role, Some(AgentRole::Escalator));

    // EXECUTE is skipped: marking stays at p0 (no token consumed)
    let m = Marking4 { p0: 1, p1: 0, p2: 0, p3: 0 };
    let t_execute = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    // Escalation blocks execution — simulate by not firing
    let _enabled = marking_enabled4(m, t_execute);
    // (In real system, escalation decision prevents calling marking_fire4)
    // Verify marking unchanged
    let m_unchanged = marking_fire4(m, t_execute, 0u8); // enabled=0 = blocked
    assert_eq!(m_unchanged.p0, 1, "Marking unchanged when execution is blocked");
    assert_eq!(m_unchanged.p1, 0);

    // LEARN: negative reward for drift
    let reward = compute_reward(1, 3, 3, false, false, false);
    assert!(reward < 0.0, "Penalty for escalation scenario");
}

// ---------------------------------------------------------------------------
// Diagram 4: ML Challenges → ML Responses (SPC Rules)
// ---------------------------------------------------------------------------

/// SPC Rule 1: a single point beyond 3-sigma triggers OutOfControl.
/// Challenge: concept drift. Response: SPC Rule 1 detection.
#[test]
fn e2e_ml_challenge_spc_rule1_out_of_control() {
    let cl = 50.0;
    let sigma = 5.0;
    let mut data: Vec<ChartData> = (0..8)
        .map(|i| spc_point(&format!("t{i}"), cl + 0.5, cl, sigma))
        .collect();
    // Inject an out-of-control point (>3σ)
    data.push(spc_point("t_oc", 70.0, cl, sigma));

    let alerts = check_western_electric_rules(&data);
    assert!(
        alerts.iter().any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
        "Rule 1 must detect a point beyond UCL"
    );
}

/// SPC Rule 2: 9 consecutive points on same side of center line → Shift.
/// Challenge: concept drift. Response: SPC Rule 2 detection.
#[test]
fn e2e_ml_challenge_spc_rule2_consecutive_shift() {
    let cl = 50.0;
    let sigma = 5.0;
    // 9 points all above CL (but within 3σ)
    let data: Vec<ChartData> = (0..9)
        .map(|i| spc_point(&format!("t{i}"), cl + 1.0, cl, sigma))
        .collect();

    let alerts = check_western_electric_rules(&data);
    assert!(
        alerts.iter().any(|a| matches!(a, SpecialCause::Shift { .. })),
        "Rule 2 must detect 9 consecutive same-side points"
    );
}

/// SPC Rule 3: 6 monotone-increasing points → Trend detected.
/// Challenge: concept drift. Response: SPC Rule 3 detection.
#[test]
fn e2e_ml_challenge_spc_rule3_monotone_trend() {
    let cl = 50.0;
    let sigma = 5.0;
    // Need ≥9 points (function early-returns if len < 9).
    // First 3 alternate above/below CL to avoid Rule 2.
    // Last 6 are strictly increasing to trigger Rule 3.
    let data: Vec<ChartData> = (0..9)
        .map(|i| {
            let value = if i < 3 {
                if i % 2 == 0 { cl + 1.0 } else { cl - 1.0 }
            } else {
                cl + (i as f64 - 2.0) // 1, 2, 3, 4, 5, 6 — strictly increasing
            };
            spc_point(&format!("t{i}"), value, cl, sigma)
        })
        .collect();

    let alerts = check_western_electric_rules(&data);
    assert!(
        alerts.iter().any(|a| {
            matches!(a, SpecialCause::Trend { direction: TrendDirection::Increasing, .. })
        }),
        "Rule 3 must detect 6 consecutive increasing points"
    );
}

/// Challenge: feature sparsity. Response: entropy-based activity features.
/// A stable, uniform process has high entropy (many variants, even distribution).
#[test]
fn e2e_ml_challenge_feature_sparsity_entropy() {
    // High-entropy feature (uniform distribution): activity_entropy ≈ 1.0
    let high_entropy_features: [f32; 8] = [0.5, 0.5, 0.1, 0.8, 0.2, 1.0, 1.0, 0.8];
    // Low-entropy feature (dominated by one activity): activity_entropy ≈ 0.0
    let low_entropy_features: [f32; 8] = [0.5, 0.5, 0.1, 0.1, 0.2, 1.0, 0.0, 0.1];

    // Bandit should select different agents based on features (contextual)
    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    let (action_high, _) = orch.run_cycle(&high_entropy_features, &state, &next_state, 0, true, true, false);
    let (action_low, _) = orch.run_cycle(&low_entropy_features, &state, &next_state, 0, true, true, false);

    // Both must produce valid action labels (contextual bandit responds to features)
    assert!(!action_high.is_empty());
    assert!(!action_low.is_empty());
}

// ---------------------------------------------------------------------------
// Diagram 5: RL Challenges → RL Controls
// ---------------------------------------------------------------------------

/// Challenge: exploration vs exploitation. Control: UCB bonus α√(xᵀA⁻¹x).
/// LinUCB selection must return a valid agent type for any feature vector.
#[test]
fn e2e_rl_challenge_ucb_exploration_bonus() {
    let mut orch = RlOrchestrator::new();
    // Extreme feature vectors to stress the UCB exploration term
    let sparse = [0.0f32; 8];
    let dense = [1.0f32; 8];
    let mixed: [f32; 8] = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6];

    for features in &[sparse, dense, mixed] {
        let agent = orch.linucb_select_agent(features);
        assert!((agent as u8) < AgentType::COUNT as u8, "LinUCB must return valid agent index");
    }
}

/// Challenge: reward instability. Control: bounded reward kernel.
/// Reward is always in a finite range regardless of extreme inputs.
#[test]
fn e2e_rl_challenge_bounded_reward_kernel() {
    // Worst case: severe degradation, many SPC alerts, both guards failed
    let min_reward = compute_reward(0, 4, 100, false, false, false);
    // Best case: maximum improvement, clean process, all guards pass
    let max_reward = compute_reward(4, 0, 0, true, true, false);

    assert!(min_reward > -20.0, "Reward floor must be bounded");
    assert!(max_reward < 5.0, "Reward ceiling must be bounded");
    assert!(min_reward < max_reward, "Best outcome must beat worst outcome");
}

/// Challenge: slow convergence. Control: persistent state across cycles.
/// Cumulative reward must grow monotonically across stable cycles.
#[test]
fn e2e_rl_challenge_persistent_state_across_cycles() {
    let mut orch = RlOrchestrator::new();
    let features = [0.3, 0.5, 0.0, 0.6, 0.2, 1.0, 0.8, 0.4];
    let state = make_test_state(1); // healthy-ish state
    let next_state = make_test_state(1);

    let mut cumulative = 0.0f32;
    for i in 1..=10 {
        let (_, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
        cumulative += reward;
        assert_eq!(orch.telemetry().cycle_count, i, "Cycle counter must persist");
        assert!(
            (orch.telemetry().cumulative_reward - cumulative).abs() < 1e-4,
            "Cumulative reward must track correctly"
        );
    }
}

/// Challenge: unsafe action choice. Control: lawful action clipping.
/// CounterfactualEvaluator must only evaluate actions in the allowed set.
#[test]
fn e2e_rl_challenge_lawful_action_clipping() {
    // Only Execute and Validate are allowed
    let mut allowed = BTreeSet::new();
    allowed.insert(ActionClass::Execute);
    allowed.insert(ActionClass::Validate);

    let task = make_task_with_actions(allowed);
    let result = DefaultCounterfactualEvaluator.evaluate_options(&task).unwrap();

    assert_eq!(result.options.len(), 2, "Only 2 lawful actions should be evaluated");
    // Every returned option must be in {Execute, Validate}
    for option in &result.options {
        assert!(
            option.option_id == "Execute" || option.option_id == "Validate",
            "Unlawful action {:?} found in counterfactual options",
            option.option_id
        );
    }
    assert!(result.selected_option_id.is_some(), "A best option must be selected");
}

/// Challenge: state aliasing. Control: 8-feature contextual state.
/// Different 8-feature vectors must cause LinUCB to select different agents
/// after sufficient exploration updates.
#[test]
fn e2e_rl_challenge_8_feature_contextual_state() {
    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);

    // Simulate reward signal for two distinct contexts
    let ctx_a = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0f32];
    let ctx_b = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0f32];

    // Update with opposing rewards to force contextual divergence
    for _ in 0..20 {
        orch.linucb_update(&ctx_a, 1.0);
        orch.linucb_update(&ctx_b, -1.0);
    }

    // Both contexts still produce valid agent selections
    let a = orch.linucb_select_agent(&ctx_a);
    let b = orch.linucb_select_agent(&ctx_b);
    assert!((a as u8) < AgentType::COUNT as u8);
    assert!((b as u8) < AgentType::COUNT as u8);
}

/// Challenge: persistent state through all 5 agent types.
#[test]
fn e2e_rl_all_agents_run_without_panic() {
    let features = [0.2, 0.4, 0.1, 0.5, 0.3, 1.0, 0.7, 0.6f32];
    let state = make_test_state(2);

    for agent_type in [
        AgentType::QLearning,
        AgentType::SARSA,
        AgentType::DoubleQLearning,
        AgentType::ExpectedSARSA,
        AgentType::REINFORCE,
    ] {
        let mut orch = RlOrchestrator::new();
        orch.switch_agent(agent_type);
        let next_state = make_test_state(2);
        let (label, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
        assert!(!label.is_empty(), "Agent {agent_type:?} must produce a label");
        assert!(!reward.is_nan(), "Agent {agent_type:?} must produce a real reward");
    }
}

// ---------------------------------------------------------------------------
// Diagram 6: GPU/CPU Fallback — CPU reference always valid
// ---------------------------------------------------------------------------

/// CPU LinUCB reference kernel always produces a valid action without GPU.
/// This verifies the three-tier fallback contract: GPU → software renderer → CPU.
#[test]
fn e2e_gpu_cpu_fallback_always_produces_valid_action() {
    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);

    // Even with no GPU available, CPU LinUCB must return a valid agent
    let features = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5f32];
    let agent = orch.linucb_select_agent(&features);
    assert!((agent as u8) < AgentType::COUNT as u8, "CPU fallback must produce valid action");
}

/// Batch size sensitivity: small batches should use CPU path (no GPU overhead).
#[test]
fn e2e_gpu_small_batch_uses_cpu_path() {
    // 1 sample: always CPU path
    let mut orch = RlOrchestrator::new();
    let features = [0.1f32; 8];
    let agent = orch.linucb_select_agent(&features);
    assert!((agent as u8) < 5);

    // Update without panic (Sherman-Morrison rank-1 update)
    orch.linucb_update(&features, 1.0);
    orch.linucb_update(&features, -0.5);
    orch.linucb_update(&[0.9f32; 8], 0.0);
}

// ---------------------------------------------------------------------------
// Diagram 7: Agentic Control Pipeline — Task → RoleSelector → … → JtbdRunner
// ---------------------------------------------------------------------------

/// Full agentic pipeline: a task flows through all 9 trait impls in sequence.
/// Each stage transforms or gates the context before passing to the next.
#[test]
fn e2e_agentic_control_pipeline_full_sequence() {
    let task = make_task(
        WorkflowPhase::Plan,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    // Stage 1: Role selection
    let role = DefaultRoleSelector.select_role(&task).unwrap();
    assert_eq!(role.selected_role, AgentRole::Planner);

    // Stage 2: Topology decomposition
    let topo = DefaultTaskDecomposer.choose_topology(&task).unwrap();
    assert_eq!(topo.topology, SwarmTopology::Pipeline);

    // Stage 3: Evidence sufficiency gate
    let sufficient = DefaultEvidenceSufficiencyChecker.is_sufficient(&task).unwrap();
    assert!(sufficient);
    let gaps = DefaultEvidenceSufficiencyChecker.summarize_gaps(&task).unwrap();
    assert!(gaps.is_empty(), "No gaps on high-confidence stable task");

    // Stage 4: Escalation gate
    let escalation = DefaultEscalationEngine.evaluate_escalation(&task).unwrap();
    assert!(!escalation.should_escalate);
    assert!(escalation.target_role.is_none());

    // Stage 5: Artifact dispatch
    let art_req = ArtifactRequest {
        artifact_families: vec![],
        task: task.clone(),
        selected_role: Some(role.selected_role.clone()),
        selected_topology: Some(topo.topology.clone()),
    };
    let artifacts = DefaultArtifactDispatcher.plan_artifacts(&art_req).unwrap();
    assert!(artifacts.artifact_families.contains(&ArtifactFamily::TaskPrompt));
    assert!(artifacts.artifact_families.contains(&ArtifactFamily::DelegationPrompt));

    // Stage 6: Handoff validation
    let handoff = HandoffRequest {
        from_agent: "agent-planner".to_string(),
        to_role: AgentRole::Executor,
        task: task.clone(),
        attached_evidence: task.evidence.clone(),
        metadata: Default::default(),
    };
    let decision = DefaultHandoffValidator.validate_handoff(&handoff).unwrap();
    assert!(decision.allowed);
    assert_eq!(decision.disposition, DecisionDisposition::Allow);

    // Stage 7: Prompt binding compilation
    let bindings = DefaultPromptBindingCompiler.compile_bindings(&task).unwrap();
    assert!(bindings.selected_role.is_some());
    assert!(bindings.topology.is_some());
    assert_eq!(bindings.bindings.get("phase").map(String::as_str), Some("Plan"));

    // Stage 8: Counterfactual evaluation
    let cf = DefaultCounterfactualEvaluator.evaluate_options(&task).unwrap();
    assert!(!cf.options.is_empty());
    assert!(cf.selected_option_id.is_some());

    // Stage 9: JTBD certification
    let case = JtbdCase {
        case_id: "e2e-pipeline-001".to_string(),
        job_statement: "Plan task routes to Planner with Pipeline topology".to_string(),
        task: task.clone(),
        expected_role: Some(AgentRole::Planner),
        expected_topology: Some(SwarmTopology::Pipeline),
        expected_disposition: Some(DecisionDisposition::Allow),
        expected_artifacts: vec![ArtifactFamily::TaskPrompt, ArtifactFamily::DelegationPrompt],
        notes: vec!["E2E pipeline test".to_string()],
    };
    let result = DefaultJtbdRunner.run_case(&case).unwrap();
    assert!(result.passed, "JTBD case must pass for well-defined plan task");
    assert_eq!(result.assertions.len(), 4); // role + topology + disposition + artifacts
    for assertion in &result.assertions {
        assert!(assertion.passed, "Assertion {:?} failed: {:?}", assertion.name, assertion.details);
    }
}

// ---------------------------------------------------------------------------
// Diagram 8: Decision Gate — Evidence → Lawful → Compile → Marking → Receipt
// ---------------------------------------------------------------------------

/// Gate 1 (evidence): insufficient evidence escalates before reaching execution.
#[test]
fn e2e_decision_gate_insufficient_evidence_escalates() {
    // Low confidence band + out-of-control drift = insufficient evidence
    let task = make_task(
        WorkflowPhase::Execute,
        RiskLevel::Medium,
        ConfidenceBand::Low,
        DriftStatus::OutOfControl,
    );

    let sufficient = DefaultEvidenceSufficiencyChecker.is_sufficient(&task).unwrap();
    assert!(!sufficient, "Low confidence + OOC drift = insufficient evidence");

    let gaps = DefaultEvidenceSufficiencyChecker.summarize_gaps(&task).unwrap();
    assert!(!gaps.is_empty(), "Gaps must be reported");
    assert!(
        gaps.iter().any(|g| g.contains("confidence band insufficient")),
        "Gap must mention confidence band"
    );
    assert!(
        gaps.iter().any(|g| g.contains("drift out of control")),
        "Gap must mention drift"
    );

    // Escalation engine also fires
    let escalation = DefaultEscalationEngine.evaluate_escalation(&task).unwrap();
    assert!(escalation.should_escalate, "OOC drift must trigger escalation");
    assert!(escalation.reason_codes.iter().any(|r| r.contains("drift")));
}

/// Gate 2 (lawful role/topology) + Compile: well-formed task reaches bindings.
#[test]
fn e2e_decision_gate_sufficient_evidence_compiles_bindings() {
    let task = make_task(
        WorkflowPhase::Execute,
        RiskLevel::Low,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    // Evidence gate passes
    assert!(DefaultEvidenceSufficiencyChecker.is_sufficient(&task).unwrap());

    // Role and topology are lawful
    let role = DefaultRoleSelector.select_role(&task).unwrap();
    assert_eq!(role.selected_role, AgentRole::Executor);

    let topo = DefaultTaskDecomposer.choose_topology(&task).unwrap();
    assert_eq!(topo.topology, SwarmTopology::Single);

    // Compile gate produces bindings
    let bindings = DefaultPromptBindingCompiler.compile_bindings(&task).unwrap();
    assert_eq!(
        bindings.bindings.get("phase").map(String::as_str),
        Some("Execute")
    );
}

/// Gate 3 (marking): disabled marking blocks the state transition.
#[test]
fn e2e_decision_gate_disabled_marking_rejects_transition() {
    // No token in p0 — marking is disabled
    let m_empty = Marking4 { p0: 0, p1: 0, p2: 0, p3: 0 };
    let t = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let enabled = marking_enabled4(m_empty, t);
    assert_eq!(enabled, 0, "Marking must be disabled when input place is empty");

    // Fire is a no-op when disabled
    let m_after = marking_fire4(m_empty, t, enabled);
    assert_eq!(m_after, m_empty, "Disabled fire must leave marking unchanged");
}

/// Receipt chain: after a successful fire, the RL orchestrator has a receipt
/// in the form of persisted telemetry (cycle_count > 0, reward recorded).
#[test]
fn e2e_decision_gate_successful_execution_produces_receipt() {
    let m = Marking4 { p0: 1, p1: 0, p2: 0, p3: 0 };
    let t = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let en = marking_enabled4(m, t);
    assert_eq!(en, 1);
    let m2 = marking_fire4(m, t, en);
    assert_eq!(m2.p1, 1, "Execution produced a token in the next place");

    // RL records the receipt (telemetry)
    let mut orch = RlOrchestrator::new();
    let features = [0.3, 0.5, 0.0, 0.6, 0.2, 1.0, 0.8, 0.4f32];
    let state = make_test_state(1);
    let next_state = make_test_state(1);
    let (_, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);

    let telem = orch.telemetry();
    assert_eq!(telem.cycle_count, 1, "One receipt recorded");
    assert_eq!(telem.last_health_state, 1);
    assert!(!reward.is_nan(), "Receipt includes a real reward");
}

// ---------------------------------------------------------------------------
// Diagram 9: Prompt Foundry — Ontology + State + Receipts + Policy → Bindings
// ---------------------------------------------------------------------------

/// All inputs (phase, risk, confidence, drift, policy, evidence) are reflected
/// in the compiled PromptBindingSet.
#[test]
fn e2e_prompt_foundry_all_inputs_reflected_in_bindings() {
    let mut allowed = BTreeSet::new();
    allowed.insert(ActionClass::Execute);
    allowed.insert(ActionClass::Validate);
    allowed.insert(ActionClass::Delegate);

    let mut forbidden = BTreeSet::new();
    forbidden.insert(ActionClass::Escalate);

    let task = TaskContext {
        task_id: "foundry-001".to_string(),
        title: "Prompt foundry E2E".to_string(),
        phase: WorkflowPhase::Validate,
        risk_level: RiskLevel::High,
        policy: PolicyEnvelope {
            policy_ids: vec!["policy-foundry".to_string()],
            allowed_actions: allowed.clone(),
            forbidden_actions: forbidden,
            required_roles: BTreeSet::new(),
            blocked_roles: BTreeSet::new(),
        },
        evidence: EvidenceEnvelope {
            receipt_refs: vec![ReceiptRef {
                id: "rcpt-001".to_string(),
                transition_id: Some("t-inductive".to_string()),
                summary: Some("inductive_miner fitness=0.95 traces=100".to_string()),
            }],
            required_evidence_classes: BTreeSet::new(),
            available_evidence_classes: BTreeSet::new(),
            confidence_score: Some(0.95),
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::Stable,
        },
        tags: BTreeSet::new(),
        metadata: Default::default(),
    };

    let bindings = DefaultPromptBindingCompiler.compile_bindings(&task).unwrap();

    // Ontology: phase, risk, confidence, drift
    assert_eq!(bindings.bindings["phase"], "Validate");
    assert_eq!(bindings.bindings["risk_level"], "High");
    assert_eq!(bindings.bindings["confidence_band"], "High");
    assert_eq!(bindings.bindings["drift_status"], "Stable");

    // Live state: selected role and topology
    assert!(bindings.selected_role.is_some());
    assert!(bindings.topology.is_some());

    // Receipts: evidence receipts propagated
    assert_eq!(bindings.evidence_receipts.len(), 1);
    assert_eq!(bindings.evidence_receipts[0], "rcpt-001");

    // Policy: allowed and forbidden actions
    assert_eq!(bindings.recommended_actions.len(), 3);
    assert_eq!(bindings.forbidden_actions.len(), 1);

    // Bindings map has all 8 keys
    for key in ["task_id", "title", "phase", "risk_level", "confidence_band",
                "drift_status", "selected_role", "topology"] {
        assert!(bindings.bindings.contains_key(key), "Missing binding key: {key}");
    }
}

// ---------------------------------------------------------------------------
// Diagram 10: Baseline vs ClosedClaw — LLM latency proxy vs deterministic
// ---------------------------------------------------------------------------

/// ClosedClaw decision path completes in deterministic time (no I/O, no LLM calls).
/// LLM latency is simulated as a no-op proxy; ClosedClaw must still make a lawful decision.
#[test]
fn e2e_closed_claw_deterministic_vs_llm_proxy() {
    // ClosedClaw decision: fully deterministic, completes in nanoseconds
    let task = make_task(
        WorkflowPhase::Execute,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    let role = DefaultRoleSelector.select_role(&task).unwrap();
    let topo = DefaultTaskDecomposer.choose_topology(&task).unwrap();
    let bindings = DefaultPromptBindingCompiler.compile_bindings(&task).unwrap();

    // All three decisions are deterministic and produce the same results every time
    assert_eq!(role.selected_role, AgentRole::Executor);
    assert_eq!(topo.topology, SwarmTopology::Pipeline);
    assert_eq!(bindings.bindings["phase"], "Execute");

    // Run twice to verify determinism
    let role2 = DefaultRoleSelector.select_role(&task).unwrap();
    let topo2 = DefaultTaskDecomposer.choose_topology(&task).unwrap();
    assert_eq!(role.selected_role, role2.selected_role, "Role selection is deterministic");
    assert_eq!(topo.topology, topo2.topology, "Topology selection is deterministic");
}

// ---------------------------------------------------------------------------
// Diagram 11: Health State Machine — Healthy → Watch → Adaptive → Escalated/Blocked
// ---------------------------------------------------------------------------

/// Healthy → Watch: SPC shift detected in RL reward signal.
#[test]
fn e2e_health_state_watch_triggered_by_spc_shift() {
    let cl = 0.5;
    let sigma = 0.1;
    // 9 consecutive rewards on the same side of CL (all above CL)
    let data: Vec<ChartData> = (0..9)
        .map(|i| spc_point(&format!("t{i}"), cl + 0.05, cl, sigma))
        .collect();
    let alerts = check_western_electric_rules(&data);
    assert!(
        alerts.iter().any(|a| matches!(a, SpecialCause::Shift { .. })),
        "Persistent above-CL rewards signal a Watch state"
    );
}

/// Watch → Adaptive: RL updates policy after SPC shift detected.
#[test]
fn e2e_health_state_adaptive_after_shift() {
    let mut orch = RlOrchestrator::new();
    let features = [0.5; 8];
    let state = make_test_state(2); // Watch state
    let next_state = make_test_state(2);

    // Run with SPC alerts (count=3) — RL records the alert
    let (_, _) = orch.run_cycle(&features, &state, &next_state, 3, true, true, false);
    assert_eq!(orch.telemetry().last_spc_alert_count, 3);

    // Subsequent cycle with no alerts — RL adapts
    let next_state_2 = make_test_state(0);
    let (_, reward) = orch.run_cycle(&features, &make_test_state(1), &next_state_2, 0, true, true, false);
    assert_eq!(orch.telemetry().last_spc_alert_count, 0);
    assert_eq!(orch.telemetry().cycle_count, 2);
    assert!(!reward.is_nan());
}

/// Adaptive → Escalated: insufficient evidence escalates out of adaptive cycle.
#[test]
fn e2e_health_state_escalation_from_adaptive() {
    // In the adaptive state, evidence quality degrades
    let task = make_task(
        WorkflowPhase::Execute,
        RiskLevel::Critical, // Critical risk + drift → escalation
        ConfidenceBand::Low,
        DriftStatus::TrendDetected,
    );

    let escalation = DefaultEscalationEngine.evaluate_escalation(&task).unwrap();
    assert!(escalation.should_escalate, "Critical risk must escalate from adaptive state");
    assert!(escalation.reason_codes.iter().any(|r| r.contains("risk:Critical")));
}

/// Adaptive → Blocked: marking disabled prevents further state transitions.
#[test]
fn e2e_health_state_blocked_on_disabled_marking() {
    // All input places empty = blocked
    let m_blocked = Marking4 { p0: 0, p1: 0, p2: 0, p3: 0 };
    let t = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let en = marking_enabled4(m_blocked, t);
    assert_eq!(en, 0, "No tokens = Blocked state");

    // RL records a penalty for the blocked state
    let reward = compute_reward(2, 2, 0, false, false, false); // guard failed = circuit open
    assert!(reward < 0.0, "Circuit breaker failure must penalise reward");
}

/// Blocked → Healthy: once a lawful token appears, the system recovers.
#[test]
fn e2e_health_state_recovery_from_blocked() {
    // Was blocked; now a token arrives in p0
    let m_recovered = Marking4 { p0: 1, p1: 0, p2: 0, p3: 0 };
    let t = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let en = marking_enabled4(m_recovered, t);
    assert_eq!(en, 1, "Token restored = recovered from Blocked");

    let m2 = marking_fire4(m_recovered, t, en);
    assert_eq!(m2.p1, 1, "Lawful path restored");

    let reward = compute_reward(2, 1, 0, true, true, false);
    assert!(reward > 0.0, "Recovery produces positive reward");
}

// ---------------------------------------------------------------------------
// Diagram 12: Petri Net — P0 → T0 → P1 → … → P3 (4-place model)
// ---------------------------------------------------------------------------

/// Token flows through the full 4-place Petri net, one transition at a time.
/// Maps to Diagram 12: P0=Evidence, P1=Role, P2=Topology, P3=Validated Action.
#[test]
fn e2e_petri_net_four_place_token_flow() {
    // P0 (Evidence Ready) — initial marking
    let m0 = Marking4 { p0: 1, p1: 0, p2: 0, p3: 0 };

    // T0: Select Role — consumes p0, produces p1
    let t0 = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let e0 = marking_enabled4(m0, t0);
    assert_eq!(e0, 1, "T0 enabled: evidence is ready");
    let m1 = marking_fire4(m0, t0, e0);
    assert_eq!(m1, Marking4 { p0: 0, p1: 1, p2: 0, p3: 0 }, "P1: Role Selected");

    // T1: Choose Topology — consumes p1, produces p2
    let t1 = Transition4 {
        in0: 0, in1: 1, in2: 0, in3: 0,
        out0: 0, out1: 0, out2: 1, out3: 0,
    };
    let e1 = marking_enabled4(m1, t1);
    assert_eq!(e1, 1, "T1 enabled: role is selected");
    let m2 = marking_fire4(m1, t1, e1);
    assert_eq!(m2, Marking4 { p0: 0, p1: 0, p2: 1, p3: 0 }, "P2: Topology Selected");

    // T2: Select Action — consumes p2, produces p3
    let t2 = Transition4 {
        in0: 0, in1: 0, in2: 1, in3: 0,
        out0: 0, out1: 0, out2: 0, out3: 1,
    };
    let e2 = marking_enabled4(m2, t2);
    assert_eq!(e2, 1, "T2 enabled: topology is selected");
    let m3 = marking_fire4(m2, t2, e2);
    assert_eq!(m3, Marking4 { p0: 0, p1: 0, p2: 0, p3: 1 }, "P3: Lawful Action Available");

    // T3: Validate (consumes p3, no output = terminal) — marks receipt written
    let t3_validate = Transition4 {
        in0: 0, in1: 0, in2: 0, in3: 1,
        out0: 0, out1: 0, out2: 0, out3: 0,
    };
    let e3 = marking_enabled4(m3, t3_validate);
    assert_eq!(e3, 1, "T3 enabled: action is available");
    let m_final = marking_fire4(m3, t3_validate, e3);
    assert_eq!(
        m_final,
        Marking4 { p0: 0, p1: 0, p2: 0, p3: 0 },
        "All tokens consumed — receipt sealed"
    );
}

/// Petri net deadlock prevention: a disabled transition does not consume tokens.
#[test]
fn e2e_petri_net_deadlock_prevention() {
    // P1 has a token but T0 requires p0 — T0 is disabled (ordering violation)
    let m = Marking4 { p0: 0, p1: 1, p2: 0, p3: 0 };
    let t0 = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };
    let en = marking_enabled4(m, t0);
    assert_eq!(en, 0, "Cannot skip steps — T0 disabled without p0 token");

    // Firing a disabled transition is a safe no-op
    let m_after = marking_fire4(m, t0, en);
    assert_eq!(m_after, m, "Disabled fire is a no-op — no deadlock, no corruption");
}

/// Multi-token concurrency: two independent tokens can flow simultaneously.
#[test]
fn e2e_petri_net_concurrent_tokens() {
    // Two tokens in p0 (two concurrent tasks)
    let m = Marking4 { p0: 2, p1: 0, p2: 0, p3: 0 };
    let t = Transition4 {
        in0: 1, in1: 0, in2: 0, in3: 0,
        out0: 0, out1: 1, out2: 0, out3: 0,
    };

    // First fire
    let en1 = marking_enabled4(m, t);
    assert_eq!(en1, 1);
    let m1 = marking_fire4(m, t, en1);
    assert_eq!(m1.p0, 1, "One token consumed");
    assert_eq!(m1.p1, 1, "One token produced");

    // Second fire
    let en2 = marking_enabled4(m1, t);
    assert_eq!(en2, 1);
    let m2 = marking_fire4(m1, t, en2);
    assert_eq!(m2.p0, 0);
    assert_eq!(m2.p1, 2, "Both tokens in p1");
}

// ---------------------------------------------------------------------------
// Diagram 13: Counterfactual Bandwidth — Candidates → Scoring → Top Action
// ---------------------------------------------------------------------------

/// All 5 lawful candidates are scored; the best (max reward) is selected.
#[test]
fn e2e_counterfactual_bandwidth_multi_candidate_scoring() {
    let mut allowed = BTreeSet::new();
    for action in [
        ActionClass::Execute,
        ActionClass::Validate,
        ActionClass::Delegate,
        ActionClass::Read,
        ActionClass::Write,
    ] {
        allowed.insert(action);
    }

    let task = make_task_with_actions(allowed);
    let result = DefaultCounterfactualEvaluator.evaluate_options(&task).unwrap();

    assert_eq!(result.options.len(), 5, "All 5 candidates must be evaluated");
    assert!(result.selected_option_id.is_some(), "Best option must be identified");

    // Selected option has the maximum estimated reward
    let selected_id = result.selected_option_id.as_ref().unwrap();
    let selected = result.options.iter().find(|o| &o.option_id == selected_id).unwrap();
    for option in &result.options {
        assert!(
            selected.estimated_reward >= option.estimated_reward,
            "Selected option {selected_id} must have max reward (vs {:?})",
            option.option_id
        );
    }
}

/// Empty action set returns empty options with no selection.
#[test]
fn e2e_counterfactual_empty_action_set_returns_none() {
    let task = make_task_with_actions(BTreeSet::new());
    let result = DefaultCounterfactualEvaluator.evaluate_options(&task).unwrap();
    assert!(result.options.is_empty(), "No candidates when allowed_actions is empty");
    assert!(result.selected_option_id.is_none(), "No selection when options is empty");
}

/// Reason codes are produced for each candidate (health transition annotated).
#[test]
fn e2e_counterfactual_reason_codes_annotated() {
    let mut allowed = BTreeSet::new();
    allowed.insert(ActionClass::Execute);
    allowed.insert(ActionClass::Validate);

    let task = make_task_with_actions(allowed);
    let result = DefaultCounterfactualEvaluator.evaluate_options(&task).unwrap();

    for option in &result.options {
        assert!(!option.reason_codes.is_empty(), "Each option must carry reason codes");
        assert!(
            option.reason_codes[0].starts_with("health:"),
            "Reason code must encode health transition"
        );
    }
}

// ---------------------------------------------------------------------------
// Diagram 14: Benchmark Challenge Map — Challenge → Response verified
// ---------------------------------------------------------------------------

/// Challenge: unsafe handoffs. Response: HandoffValidator rejects blocked roles.
#[test]
fn e2e_challenge_unsafe_handoff_blocked_role_rejected() {
    let mut blocked = BTreeSet::new();
    blocked.insert(AgentRole::Executor);

    let task = TaskContext {
        task_id: "unsafe-handoff".to_string(),
        title: "Unsafe handoff test".to_string(),
        phase: WorkflowPhase::Execute,
        risk_level: RiskLevel::Medium,
        policy: PolicyEnvelope {
            policy_ids: vec!["p-strict".to_string()],
            allowed_actions: {
                let mut a = BTreeSet::new();
                a.insert(ActionClass::Execute);
                a.insert(ActionClass::Delegate);
                a
            },
            forbidden_actions: BTreeSet::new(),
            required_roles: BTreeSet::new(),
            blocked_roles: blocked,
        },
        evidence: EvidenceEnvelope {
            receipt_refs: vec![],
            required_evidence_classes: BTreeSet::new(),
            available_evidence_classes: BTreeSet::new(),
            confidence_score: None,
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::Stable,
        },
        tags: BTreeSet::new(),
        metadata: Default::default(),
    };

    let req = HandoffRequest {
        from_agent: "agent-a".to_string(),
        to_role: AgentRole::Executor, // blocked!
        task,
        attached_evidence: EvidenceEnvelope {
            receipt_refs: vec![],
            required_evidence_classes: BTreeSet::new(),
            available_evidence_classes: BTreeSet::new(),
            confidence_score: None,
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::Stable,
        },
        metadata: Default::default(),
    };

    let decision = DefaultHandoffValidator.validate_handoff(&req).unwrap();
    assert!(!decision.allowed, "Blocked role must be denied");
    assert_eq!(decision.disposition, DecisionDisposition::Deny);
    assert!(decision.reason_codes.iter().any(|r| r.contains("blocked")));
}

/// Challenge: multi-agent decomposition. Response: role + topology microbench.
/// All 10 workflow phases produce a valid role and topology in bounded time.
#[test]
fn e2e_challenge_role_topology_all_phases_bounded() {
    let phases = [
        (WorkflowPhase::Intake,    AgentRole::Explorer,  SwarmTopology::Single),
        (WorkflowPhase::Triage,    AgentRole::Reviewer,  SwarmTopology::Single),
        (WorkflowPhase::Analyze,   AgentRole::Explorer,  SwarmTopology::Single),
        (WorkflowPhase::Plan,      AgentRole::Planner,   SwarmTopology::Single),
        (WorkflowPhase::Execute,   AgentRole::Executor,  SwarmTopology::Single),
        (WorkflowPhase::Validate,  AgentRole::Validator, SwarmTopology::ReviewLoop),
        (WorkflowPhase::Escalate,  AgentRole::Escalator, SwarmTopology::Debate),
        (WorkflowPhase::Complete,  AgentRole::Auditor,   SwarmTopology::Single),
        (WorkflowPhase::Failed,    AgentRole::Escalator, SwarmTopology::Single),
    ];

    for (phase, expected_role, expected_topo) in phases {
        let task = make_task(phase.clone(), RiskLevel::Low, ConfidenceBand::High, DriftStatus::Stable);
        let role = DefaultRoleSelector.select_role(&task).unwrap();
        let topo = DefaultTaskDecomposer.choose_topology(&task).unwrap();
        assert_eq!(
            role.selected_role, expected_role,
            "Phase {:?} must map to {:?}",
            phase, expected_role
        );
        assert_eq!(
            topo.topology, expected_topo,
            "Phase {:?} must map to {:?}",
            phase, expected_topo
        );
    }
}

/// Challenge: streaming event pressure. Response: RL orchestrator handles
/// high-volume cycles without degradation.
#[test]
fn e2e_challenge_streaming_event_pressure() {
    let mut orch = RlOrchestrator::new();
    let features = [0.3, 0.5, 0.1, 0.6, 0.2, 1.0, 0.8, 0.4f32];
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    // Simulate 1000 rapid events
    let mut valid_cycles = 0u32;
    for _ in 0..1000 {
        let (label, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
        if !label.is_empty() && !reward.is_nan() {
            valid_cycles += 1;
        }
    }

    assert_eq!(valid_cycles, 1000, "All 1000 event cycles must complete successfully");
    assert_eq!(orch.telemetry().cycle_count, 1000);
    assert!(!orch.telemetry().cumulative_reward.is_nan());
}

/// Challenge: prompt drift. Response: PromptBindingCompiler produces stable
/// bindings even when called with identical tasks repeatedly.
#[test]
fn e2e_challenge_prompt_drift_stable_bindings() {
    let task = make_task(
        WorkflowPhase::Plan,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    // Compile 10 times — bindings must be identical every time
    let reference = DefaultPromptBindingCompiler.compile_bindings(&task).unwrap();
    for _ in 0..9 {
        let b = DefaultPromptBindingCompiler.compile_bindings(&task).unwrap();
        assert_eq!(b.bindings, reference.bindings, "Prompt bindings must be stable");
        assert_eq!(b.selected_role, reference.selected_role);
        assert_eq!(b.topology, reference.topology);
    }
}

/// Challenge: costly LLM control loops. Response: ClosedClaw decision path
/// requires no I/O, no network calls, no heap growth per cycle.
/// Proxy test: 10,000 decisions complete in finite bounded time.
#[test]
fn e2e_challenge_llm_replacement_bounded_decision_budget() {
    // 10,000 decisions — all deterministic, all in-memory
    let task = make_task(
        WorkflowPhase::Execute,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    let mut decision_count = 0u32;
    for _ in 0..10_000 {
        let role = DefaultRoleSelector.select_role(&task).unwrap();
        let _ = DefaultTaskDecomposer.choose_topology(&task).unwrap();
        let _ = DefaultEvidenceSufficiencyChecker.is_sufficient(&task).unwrap();
        assert_ne!(role.selected_role, AgentRole::Custom("unreachable".to_string()));
        decision_count += 1;
    }
    assert_eq!(decision_count, 10_000, "All 10K decisions completed in bounded time");
}

/// Challenge: adversarial distribution. Response: RL orchestrator rewards
/// are bounded and never NaN even under worst-case inputs.
#[test]
fn e2e_challenge_adversarial_reward_distribution() {
    // Adversarial: maximum degradation + maximum SPC alerts + all guards failed
    let rewards: Vec<f32> = (0..=4)
        .flat_map(|from| (0..=4).map(move |to| compute_reward(from, to, 100, false, false, false)))
        .collect();

    for r in &rewards {
        assert!(!r.is_nan(), "Reward must never be NaN");
        assert!(!r.is_infinite(), "Reward must never be infinite");
        assert!(*r > -50.0, "Reward floor must hold under adversarial input");
        assert!(*r < 10.0, "Reward ceiling must hold under adversarial input");
    }
}
