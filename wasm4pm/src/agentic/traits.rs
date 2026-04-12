use crate::agentic::types::*;

pub trait RoleSelector {
    fn select_role(&self, task: &TaskContext) -> Result<RoleDecision, AgenticError>;
}

pub trait TaskDecomposer {
    fn choose_topology(&self, task: &TaskContext) -> Result<TopologyDecision, AgenticError>;
}

pub trait HandoffValidator {
    fn validate_handoff(&self, req: &HandoffRequest) -> Result<HandoffDecision, AgenticError>;
}

pub trait EvidenceSufficiencyChecker {
    fn is_sufficient(&self, task: &TaskContext) -> Result<bool, AgenticError>;

    fn summarize_gaps(&self, task: &TaskContext) -> Result<Vec<String>, AgenticError>;
}

pub trait EscalationEngine {
    fn evaluate_escalation(&self, task: &TaskContext) -> Result<EscalationDecision, AgenticError>;
}

pub trait ArtifactDispatcher {
    fn plan_artifacts(&self, req: &ArtifactRequest) -> Result<ArtifactPlan, AgenticError>;
}

pub trait PromptBindingCompiler {
    fn compile_bindings(&self, task: &TaskContext) -> Result<PromptBindingSet, AgenticError>;
}

pub trait CounterfactualEvaluator {
    fn evaluate_options(&self, task: &TaskContext) -> Result<CounterfactualResult, AgenticError>;
}

pub trait JtbdRunner {
    fn run_case(&self, case: &JtbdCase) -> Result<JtbdResult, AgenticError>;

    fn run_suite(&self, cases: &[JtbdCase]) -> Result<Vec<JtbdResult>, AgenticError>;
}
