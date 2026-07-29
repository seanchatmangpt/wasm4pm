//! Standing-bearing plan manufacture: PDDL text → temporal plan → admission → receipt.
//!
//! Successful and refused outcomes both carry deterministic BLAKE3 witnesses. The
//! policy-aware entry point is authoritative; the permissive entry point remains only
//! for compatibility with pre-GMRW callers.

use crate::admission::{
    admit_plan_labels, admit_plan_labels_with_policy, PlanAdmissionPolicy,
};
use crate::ground::{find_temporal_plan, ground_domain, PlanStep, TemporalPlan};
use crate::parse::{domain_from_pddl, problem_from_pddl, Domain, Problem};
use crate::schedule::max_parallelism;
use blake3::Hasher;
use std::collections::BTreeSet;

const RECEIPT_DOMAIN: &str = "wasm4pm.planner.manufacture-world.v2";

/// Serializable view of one admitted temporal plan step.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PlanStepView {
    /// Grounded action label.
    pub action_name: String,
    /// Grounded action arguments.
    pub args: Vec<String>,
    /// Scheduled start time.
    pub start_time: f64,
    /// Scheduled duration.
    pub duration: f64,
}

impl From<&PlanStep> for PlanStepView {
    fn from(step: &PlanStep) -> Self {
        Self {
            action_name: step.action_name.clone(),
            args: step.args.clone(),
            start_time: step.start_time,
            duration: step.duration,
        }
    }
}

/// Deterministic receipt for successful or refused plan manufacture.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ManufactureReceipt {
    /// Parsed domain name when available.
    pub domain_name: String,
    /// Parsed problem name when available.
    pub problem_name: String,
    /// Whether planning and explicit policy admission succeeded.
    pub admitted: bool,
    /// Typed textual refusal reason for non-admitted outcomes.
    pub refusal_reason: Option<String>,
    /// Admitted plan steps; empty for refusal.
    pub plan_steps: Vec<PlanStepView>,
    /// Plan makespan; zero for refusal.
    pub makespan: f64,
    /// Maximum scheduled parallelism; zero for refusal.
    pub max_parallelism: usize,
    /// BLAKE3 witness binding inputs, outcome, and plan or refusal.
    pub manufacture_chain: String,
}

fn hex(bytes: &[u8; 32]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn input_witness(label: &str, text: &str) -> String {
    let mut hasher = Hasher::new_derive_key(RECEIPT_DOMAIN);
    hasher.update(label.as_bytes());
    hasher.update(text.as_bytes());
    hex(hasher.finalize().as_bytes())
}

fn parsed_domain_witness(domain: &Domain) -> String {
    let mut hasher = Hasher::new_derive_key(RECEIPT_DOMAIN);
    hasher.update(b"domain");
    hasher.update(domain.name.as_bytes());
    for action in &domain.durative_actions {
        hasher.update(action.name.as_bytes());
    }
    hex(hasher.finalize().as_bytes())
}

fn parsed_problem_witness(problem: &Problem) -> String {
    let mut hasher = Hasher::new_derive_key(RECEIPT_DOMAIN);
    hasher.update(b"problem");
    hasher.update(problem.name.as_bytes());
    hasher.update(problem.domain.as_bytes());
    for object in &problem.objects {
        hasher.update(object.as_bytes());
    }
    hex(hasher.finalize().as_bytes())
}

fn plan_chain(plan: &TemporalPlan) -> String {
    let mut hasher = Hasher::new_derive_key(RECEIPT_DOMAIN);
    hasher.update(b"plan");
    for step in &plan.steps {
        hasher.update(step.action_name.as_bytes());
        for argument in &step.args {
            hasher.update(argument.as_bytes());
        }
        hasher.update(&step.start_time.to_le_bytes());
        hasher.update(&step.duration.to_le_bytes());
    }
    hasher.update(&plan.makespan.to_le_bytes());
    hex(hasher.finalize().as_bytes())
}

fn outcome_chain(
    domain_input: &str,
    problem_input: &str,
    domain_parsed: &str,
    problem_parsed: &str,
    outcome: &str,
) -> String {
    let mut hasher = Hasher::new_derive_key(RECEIPT_DOMAIN);
    hasher.update(domain_input.as_bytes());
    hasher.update(problem_input.as_bytes());
    hasher.update(domain_parsed.as_bytes());
    hasher.update(problem_parsed.as_bytes());
    hasher.update(outcome.as_bytes());
    hex(hasher.finalize().as_bytes())
}

/// Manufacture a plan under an explicit default-deny action policy.
///
/// Every parser, grounding, planning, or admission failure returns a non-admitted
/// receipt with a non-empty witness chain.
#[must_use]
pub fn manufacture_world_with_policy(
    domain_text: &str,
    problem_text: &str,
    policy: &PlanAdmissionPolicy,
) -> ManufactureReceipt {
    manufacture_world_inner(domain_text, problem_text, Some(policy))
}

/// Legacy compatibility entry point that permits the finite labels discovered in the plan.
///
/// New GMRW callers should use [`manufacture_world_with_policy`].
#[must_use]
pub fn manufacture_world(domain_text: &str, problem_text: &str) -> ManufactureReceipt {
    manufacture_world_inner(domain_text, problem_text, None)
}

fn manufacture_world_inner(
    domain_text: &str,
    problem_text: &str,
    policy: Option<&PlanAdmissionPolicy>,
) -> ManufactureReceipt {
    let domain_input = input_witness("domain-input", domain_text);
    let problem_input = input_witness("problem-input", problem_text);

    let domain = match domain_from_pddl(domain_text) {
        Ok(domain) => domain,
        Err(error) => {
            return refused(
                String::new(),
                String::new(),
                format!("domain parse failed: {error}"),
                &domain_input,
                &problem_input,
                "",
                "",
            );
        }
    };
    let domain_parsed = parsed_domain_witness(&domain);

    let problem = match problem_from_pddl(problem_text) {
        Ok(problem) => problem,
        Err(error) => {
            return refused(
                domain.name.clone(),
                String::new(),
                format!("problem parse failed: {error}"),
                &domain_input,
                &problem_input,
                &domain_parsed,
                "",
            );
        }
    };
    let problem_parsed = parsed_problem_witness(&problem);

    let ground_actions = match ground_domain(&domain, &problem) {
        Ok(actions) => actions,
        Err(error) => {
            return refused(
                domain.name.clone(),
                problem.name.clone(),
                format!("grounding failed: {error}"),
                &domain_input,
                &problem_input,
                &domain_parsed,
                &problem_parsed,
            );
        }
    };

    let plan = match find_temporal_plan(&ground_actions, &problem) {
        Ok(plan) => plan,
        Err(error) => {
            return refused(
                domain.name.clone(),
                problem.name.clone(),
                format!("planning failed: {error}"),
                &domain_input,
                &problem_input,
                &domain_parsed,
                &problem_parsed,
            );
        }
    };

    let labels: BTreeSet<String> = plan
        .steps
        .iter()
        .map(|step| step.action_name.clone())
        .collect();
    let admitted = match policy {
        Some(policy) => admit_plan_labels_with_policy(&labels, policy).1,
        None => admit_plan_labels(&labels).1,
    };
    if !admitted {
        return refused(
            domain.name.clone(),
            problem.name.clone(),
            "action policy refused one or more grounded plan labels".to_string(),
            &domain_input,
            &problem_input,
            &domain_parsed,
            &problem_parsed,
        );
    }

    let plan_witness = plan_chain(&plan);
    let chain = outcome_chain(
        &domain_input,
        &problem_input,
        &domain_parsed,
        &problem_parsed,
        &format!("admitted:{plan_witness}"),
    );

    ManufactureReceipt {
        domain_name: domain.name,
        problem_name: problem.name,
        admitted: true,
        refusal_reason: None,
        plan_steps: plan.steps.iter().map(PlanStepView::from).collect(),
        makespan: plan.makespan,
        max_parallelism: max_parallelism(&plan),
        manufacture_chain: chain,
    }
}

fn refused(
    domain_name: String,
    problem_name: String,
    reason: String,
    domain_input: &str,
    problem_input: &str,
    domain_parsed: &str,
    problem_parsed: &str,
) -> ManufactureReceipt {
    let chain = outcome_chain(
        domain_input,
        problem_input,
        domain_parsed,
        problem_parsed,
        &format!("refused:{reason}"),
    );
    ManufactureReceipt {
        domain_name,
        problem_name,
        admitted: false,
        refusal_reason: Some(reason),
        plan_steps: Vec::new(),
        makespan: 0.0,
        max_parallelism: 0,
        manufacture_chain: chain,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOMAIN: &str = r#"
(define (domain d)
  (:requirements :durative-actions :numeric-fluents :typing)
  (:predicates (done ?w))
  (:functions (cap))
  (:durative-action work
    :parameters (?w - worker)
    :duration (= ?duration 5)
    :condition (at start (>= (cap) 1))
    :effect (and (at start (decrease (cap) 1)) (at end (increase (cap) 1)) (at end (done ?w)))))
"#;

    fn problem(capacity: u32) -> String {
        format!(
            r#"(define (problem p)
  (:domain d)
  (:objects w1 w2 - worker)
  (:init (= (cap) {capacity}))
  (:goal (and (done w1) (done w2))))"#
        )
    }

    #[test]
    fn compatibility_path_is_admitted_and_witnessed() {
        let receipt = manufacture_world(DOMAIN, &problem(2));
        assert!(receipt.admitted, "refusal={:?}", receipt.refusal_reason);
        assert!(!receipt.manufacture_chain.is_empty());
        assert_eq!(receipt.max_parallelism, 2);
    }

    #[test]
    fn policy_path_is_default_deny() {
        let receipt = manufacture_world_with_policy(
            DOMAIN,
            &problem(2),
            &PlanAdmissionPolicy::default_deny(),
        );
        assert!(!receipt.admitted);
        assert!(receipt
            .refusal_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("action policy refused")));
        assert!(!receipt.manufacture_chain.is_empty());
    }

    #[test]
    fn explicit_policy_admits_grounded_action() {
        let policy = PlanAdmissionPolicy::default_deny().allow_label("work");
        let receipt = manufacture_world_with_policy(DOMAIN, &problem(2), &policy);
        assert!(receipt.admitted, "refusal={:?}", receipt.refusal_reason);
    }

    #[test]
    fn malformed_domain_returns_receipted_refusal() {
        let receipt = manufacture_world("not valid pddl", &problem(2));
        assert!(!receipt.admitted);
        assert!(receipt.refusal_reason.is_some());
        assert!(!receipt.manufacture_chain.is_empty());
    }
}
