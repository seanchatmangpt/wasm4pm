//! `manufacture_world`-equivalent: domain/problem text → admitted temporal
//! plan → BLAKE3 witness chain. Same witnessing shape as bcinr-pddl's
//! `llm_bridge.rs::manufacture_world`, re-implemented fresh here since this
//! crate has no dependency on bcinr-pddl.

use crate::admission::admit_plan_labels;
use crate::ground::{find_temporal_plan, ground_domain, PlanStep, TemporalPlan};
use crate::parse::{domain_from_pddl, problem_from_pddl, Domain, Problem};
use crate::schedule::max_parallelism;
use blake3::Hasher;
use std::collections::BTreeSet;

#[derive(Debug, Clone, serde::Serialize)]
pub struct PlanStepView {
    pub action_name: String,
    pub args: Vec<String>,
    pub start_time: f64,
    pub duration: f64,
}

impl From<&PlanStep> for PlanStepView {
    fn from(s: &PlanStep) -> Self {
        PlanStepView {
            action_name: s.action_name.clone(),
            args: s.args.clone(),
            start_time: s.start_time,
            duration: s.duration,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ManufactureReceipt {
    pub domain_name: String,
    pub problem_name: String,
    pub admitted: bool,
    pub refusal_reason: Option<String>,
    pub plan_steps: Vec<PlanStepView>,
    pub makespan: f64,
    pub max_parallelism: usize,
    pub manufacture_chain: String,
}

fn hex(b: &[u8; 32]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn domain_witness(domain: &Domain) -> String {
    let mut h = Hasher::new();
    h.update(domain.name.as_bytes());
    for da in &domain.durative_actions {
        h.update(da.name.as_bytes());
    }
    hex(h.finalize().as_bytes())
}

fn problem_witness(problem: &Problem) -> String {
    let mut h = Hasher::new();
    h.update(problem.name.as_bytes());
    h.update(problem.domain.as_bytes());
    for o in &problem.objects {
        h.update(o.as_bytes());
    }
    hex(h.finalize().as_bytes())
}

fn plan_chain(plan: &TemporalPlan) -> String {
    let mut h = Hasher::new();
    for step in &plan.steps {
        h.update(step.action_name.as_bytes());
        h.update(&step.start_time.to_le_bytes());
        h.update(&step.duration.to_le_bytes());
    }
    hex(h.finalize().as_bytes())
}

fn manufacture_chain(domain_w: &str, problem_w: &str, plan_c: &str, goal_reached: bool) -> String {
    let mut h = Hasher::new();
    h.update(domain_w.as_bytes());
    h.update(problem_w.as_bytes());
    h.update(plan_c.as_bytes());
    h.update(if goal_reached { b"1" } else { b"0" });
    hex(h.finalize().as_bytes())
}

/// Full pipeline: PDDL text -> ground -> plan -> admission -> receipt.
/// Always returns a receipt (admitted=false with refusal_reason on any
/// failure, never a bare error) — same convention as bcinr-pddl's
/// `manufacture_world`.
pub fn manufacture_world(domain_text: &str, problem_text: &str) -> ManufactureReceipt {
    let domain = match domain_from_pddl(domain_text) {
        Ok(d) => d,
        Err(e) => {
            return refused(
                String::new(),
                String::new(),
                format!("domain parse failed: {e}"),
            )
        }
    };
    let problem = match problem_from_pddl(problem_text) {
        Ok(p) => p,
        Err(e) => {
            return refused(
                domain.name.clone(),
                String::new(),
                format!("problem parse failed: {e}"),
            )
        }
    };

    let ground_actions = match ground_domain(&domain, &problem) {
        Ok(g) => g,
        Err(e) => {
            return refused(
                domain.name.clone(),
                problem.name.clone(),
                format!("grounding failed: {e}"),
            )
        }
    };

    let plan = match find_temporal_plan(&ground_actions, &problem) {
        Ok(p) => p,
        Err(e) => {
            return refused(
                domain.name.clone(),
                problem.name.clone(),
                format!("planning failed: {e}"),
            )
        }
    };

    let labels: BTreeSet<String> = plan.steps.iter().map(|s| s.action_name.clone()).collect();
    let (_, admitted) = admit_plan_labels(&labels);
    if !admitted {
        return refused(
            domain.name.clone(),
            problem.name.clone(),
            "admission gate rejected one or more action labels".to_string(),
        );
    }

    let dw = domain_witness(&domain);
    let pw = problem_witness(&problem);
    let pc = plan_chain(&plan);
    let chain = manufacture_chain(&dw, &pw, &pc, true);

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

fn refused(domain_name: String, problem_name: String, reason: String) -> ManufactureReceipt {
    ManufactureReceipt {
        domain_name,
        problem_name,
        admitted: false,
        refusal_reason: Some(reason),
        plan_steps: vec![],
        makespan: 0.0,
        max_parallelism: 0,
        manufacture_chain: String::new(),
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
    fn admitted_and_witnessed_for_a_feasible_problem() {
        let receipt = manufacture_world(DOMAIN, &problem(2));
        assert!(
            receipt.admitted,
            "refusal_reason={:?}",
            receipt.refusal_reason
        );
        assert!(!receipt.manufacture_chain.is_empty());
        assert_eq!(receipt.max_parallelism, 2);
    }

    #[test]
    fn refused_on_malformed_domain_text() {
        let receipt = manufacture_world("not valid pddl", &problem(2));
        assert!(!receipt.admitted);
        assert!(receipt.refusal_reason.is_some());
    }
}
