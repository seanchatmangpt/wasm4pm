//! Criterion benchmarks for agentic control primitives.
//!
//! Measures latency of each trait implementation:
//! - RoleSelector: phase-to-role mapping
//! - TaskDecomposer: risk-to-topology selection
//! - EvidenceSufficiencyChecker: evidence validation
//! - EscalationEngine: escalation decision logic
//! - ArtifactDispatcher: role-to-artifact mapping
//! - HandoffValidator: policy-based validation
//! - PromptBindingCompiler: binding compilation
//! - CounterfactualEvaluator: reward estimation
//! - JtbdRunner: full JTBD case execution

use criterion::{criterion_group, criterion_main, Criterion};
use wasm4pm::agentic::prelude::*;
use std::collections::BTreeSet;
use std::time::Duration;

fn make_task_context(
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
        task_id: "bench-task".to_string(),
        title: "Benchmark task".to_string(),
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

fn bench_role_selector(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/role_selector");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(1000);

    let selector = DefaultRoleSelector;
    let task = make_task_context(
        WorkflowPhase::Intake,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    group.bench_function("select_role", |b| {
        b.iter(|| selector.select_role(&task))
    });
    group.finish();
}

fn bench_task_decomposer(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/task_decomposer");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(1000);

    let decomposer = DefaultTaskDecomposer;
    let task = make_task_context(
        WorkflowPhase::Plan,
        RiskLevel::High,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    group.bench_function("choose_topology", |b| {
        b.iter(|| decomposer.choose_topology(&task))
    });
    group.finish();
}

fn bench_evidence_sufficiency(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/evidence_sufficiency");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(1000);

    let checker = DefaultEvidenceSufficiencyChecker;
    let task = make_task_context(
        WorkflowPhase::Execute,
        RiskLevel::Low,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    group.bench_function("is_sufficient", |b| {
        b.iter(|| checker.is_sufficient(&task))
    });

    group.bench_function("summarize_gaps", |b| {
        b.iter(|| checker.summarize_gaps(&task))
    });
    group.finish();
}

fn bench_escalation_engine(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/escalation_engine");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(1000);

    let engine = DefaultEscalationEngine;
    let task = make_task_context(
        WorkflowPhase::Execute,
        RiskLevel::Critical,
        ConfidenceBand::High,
        DriftStatus::TrendDetected,
    );

    group.bench_function("evaluate_escalation", |b| {
        b.iter(|| engine.evaluate_escalation(&task))
    });
    group.finish();
}

fn bench_artifact_dispatcher(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/artifact_dispatcher");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(1000);

    let dispatcher = DefaultArtifactDispatcher;
    let request = ArtifactRequest {
        artifact_families: vec![],
        task: make_task_context(
            WorkflowPhase::Execute,
            RiskLevel::Medium,
            ConfidenceBand::High,
            DriftStatus::Stable,
        ),
        selected_role: Some(AgentRole::Executor),
        selected_topology: None,
    };

    group.bench_function("plan_artifacts", |b| {
        b.iter(|| dispatcher.plan_artifacts(&request))
    });
    group.finish();
}

fn bench_handoff_validator(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/handoff_validator");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(1000);

    let validator = DefaultHandoffValidator;
    let req = HandoffRequest {
        from_agent: "agent-1".to_string(),
        to_role: AgentRole::Executor,
        task: make_task_context(
            WorkflowPhase::Execute,
            RiskLevel::Low,
            ConfidenceBand::High,
            DriftStatus::Stable,
        ),
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

    group.bench_function("validate_handoff", |b| {
        b.iter(|| validator.validate_handoff(&req))
    });
    group.finish();
}

fn bench_prompt_binding_compiler(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/prompt_binding_compiler");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(500); // Slightly higher cost due to internal selector/decomposer calls

    let compiler = DefaultPromptBindingCompiler;
    let task = make_task_context(
        WorkflowPhase::Plan,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    group.bench_function("compile_bindings", |b| {
        b.iter(|| compiler.compile_bindings(&task))
    });
    group.finish();
}

fn bench_counterfactual_evaluator(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/counterfactual_evaluator");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(500);

    let evaluator = DefaultCounterfactualEvaluator;
    let task = make_task_context(
        WorkflowPhase::Execute,
        RiskLevel::Medium,
        ConfidenceBand::High,
        DriftStatus::Stable,
    );

    group.bench_function("evaluate_options", |b| {
        b.iter(|| evaluator.evaluate_options(&task))
    });
    group.finish();
}

fn bench_jtbd_runner(c: &mut Criterion) {
    let mut group = c.benchmark_group("agentic/jtbd_runner");
    group.measurement_time(Duration::from_secs(3));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(100); // Lower sample size due to multiple trait calls per case

    let runner = DefaultJtbdRunner;
    let case = JtbdCase {
        case_id: "bench-case-001".to_string(),
        job_statement: "Benchmark JTBD case".to_string(),
        task: make_task_context(
            WorkflowPhase::Plan,
            RiskLevel::Medium,
            ConfidenceBand::High,
            DriftStatus::Stable,
        ),
        expected_role: Some(AgentRole::Planner),
        expected_topology: Some(SwarmTopology::Pipeline),
        expected_disposition: Some(DecisionDisposition::Allow),
        expected_artifacts: vec![ArtifactFamily::TaskPrompt],
        notes: vec![],
    };

    group.bench_function("run_case", |b| {
        b.iter(|| runner.run_case(&case))
    });
    group.finish();
}

criterion_group!(
    benches,
    bench_role_selector,
    bench_task_decomposer,
    bench_evidence_sufficiency,
    bench_escalation_engine,
    bench_artifact_dispatcher,
    bench_handoff_validator,
    bench_prompt_binding_compiler,
    bench_counterfactual_evaluator,
    bench_jtbd_runner
);
criterion_main!(benches);
