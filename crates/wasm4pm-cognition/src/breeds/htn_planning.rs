//! HTN planning — SHOP2-style total-order decomposition (Nau et al. 2003).
//!
//! Tasks come from goals (each goal value is a task: a compound task name or
//! an `op:<name>` primitive). Rules encode the domain:
//! - `method:<task>:<variant>` — premise = preconditions over `pred=val`
//!   state atoms, conclusion = `;`-separated subtask list,
//! - `op:<name>` — premise = preconditions, conclusion = `;`-separated
//!   effects (`atom` adds, `!atom` deletes).
//!
//! Chronological backtracking over method choice (declaration order), depth
//! cap 64, expansion cap 512. After planning, the plan is REPLAYED against
//! the initial state (self-audit): a plan that does not replay is refused.
//!
//! Trace kinds: {`htn-decompose`,`htn-apply`,`htn-backtrack`}(1,*) →
//! `htn-plan`(1,1).

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, Rule, StateAtom, TraceStep,
};
use std::collections::BTreeSet;

/// SHOP2-style HTN planning breed.
pub struct HtnPlanning;

fn atoms_of(state: &[StateAtom]) -> BTreeSet<String> {
    state
        .iter()
        .map(|a| format!("{}={}", a.predicate, a.value))
        .collect()
}

fn applicable(rule: &Rule, state: &BTreeSet<String>) -> bool {
    rule.premise.iter().all(|p| state.contains(p))
}

fn apply_effect(rule: &Rule, state: &BTreeSet<String>) -> BTreeSet<String> {
    let mut next = state.clone();
    for tok in rule
        .conclusion
        .split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if let Some(rest) = tok.strip_prefix('!') {
            next.remove(rest);
        } else {
            next.insert(tok.to_string());
        }
    }
    next
}

#[allow(clippy::too_many_arguments)]
fn htn_seek(
    state: &BTreeSet<String>,
    tasks: &[String],
    rules: &[Rule],
    depth: usize,
    expansion_count: &mut usize,
    trace: &mut Vec<TraceStep>,
) -> Option<Vec<String>> {
    if tasks.is_empty() {
        return Some(vec![]);
    }
    if depth > 64 || *expansion_count > 512 {
        return None;
    }
    *expansion_count += 1;

    let t1 = &tasks[0];
    let rest = &tasks[1..];

    if t1.starts_with("op:") {
        if let Some(op_rule) = rules.iter().find(|r| r.id == *t1) {
            if applicable(op_rule, state) {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "htn-apply".to_string(),
                    detail: t1.clone(),
                    depth: depth as u32,
                    objects: vec![("operator".to_string(), t1.clone())],
                });
                let next_state = apply_effect(op_rule, state);
                if let Some(plan_rest) =
                    htn_seek(&next_state, rest, rules, depth + 1, expansion_count, trace)
                {
                    let mut plan = vec![t1.clone()];
                    plan.extend(plan_rest);
                    return Some(plan);
                }
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "htn-backtrack".to_string(),
                    detail: t1.clone(),
                    depth: depth as u32,
                    objects: vec![("operator".to_string(), t1.clone())],
                });
            }
        }
    } else {
        let prefix = format!("method:{}:", t1);
        for m_rule in rules.iter().filter(|r| r.id.starts_with(&prefix)) {
            if applicable(m_rule, state) {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "htn-decompose".to_string(),
                    detail: m_rule.id.clone(),
                    depth: depth as u32,
                    objects: vec![("method".to_string(), m_rule.id.clone())],
                });
                let subtasks: Vec<String> = m_rule
                    .conclusion
                    .split(';')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                let mut new_tasks = subtasks;
                new_tasks.extend_from_slice(rest);
                if let Some(plan) =
                    htn_seek(state, &new_tasks, rules, depth + 1, expansion_count, trace)
                {
                    return Some(plan);
                }
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "htn-backtrack".to_string(),
                    detail: m_rule.id.clone(),
                    depth: depth as u32,
                    objects: vec![("method".to_string(), m_rule.id.clone())],
                });
            }
        }
    }
    None
}

impl CognitionBreed for HtnPlanning {
    fn id(&self) -> BreedId {
        BreedId::HtnPlanning
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "htn_planning".to_string(),
            "total_order_decomposition".to_string(),
            "chronological_backtracking".to_string(),
            "plan_replay_self_audit".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err("htn_planning requires at least one initial task (in goals)".to_string());
        }
        if input.rules.is_empty() {
            return Err("htn_planning requires at least one method: or op: rule".to_string());
        }
        if !input
            .rules
            .iter()
            .any(|r| r.id.starts_with("method:") || r.id.starts_with("op:"))
        {
            return Err("htn_planning rules must use method:<task>:<variant> or op:<name> ids"
                .to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let initial = atoms_of(&input.state);
        let tasks: Vec<String> = input.goals.iter().map(|g| g.value.clone()).collect();
        let mut trace = Vec::new();
        let mut expansion_count = 0;

        let plan = htn_seek(
            &initial,
            &tasks,
            &input.rules,
            0,
            &mut expansion_count,
            &mut trace,
        )
        .ok_or_else(|| BreedError {
            breed: BreedId::HtnPlanning,
            message: format!("no plan found (expanded {} nodes)", expansion_count),
        })?;

        // Plan replay self-audit.
        let mut audit_state = initial.clone();
        for step in &plan {
            let op_rule = input
                .rules
                .iter()
                .find(|r| r.id == *step)
                .ok_or_else(|| BreedError {
                    breed: BreedId::HtnPlanning,
                    message: format!("plan references unknown operator {}", step),
                })?;
            if !applicable(op_rule, &audit_state) {
                return Err(BreedError {
                    breed: BreedId::HtnPlanning,
                    message: format!("plan self-audit failed at {}", step),
                });
            }
            audit_state = apply_effect(op_rule, &audit_state);
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "htn-plan".to_string(),
            detail: plan.join(","),
            depth: 0,
            objects: vec![("decision".to_string(), "plan".to_string())],
        });

        let mut out_facts = input.facts.clone();
        out_facts.push(Fact {
            key: "htn:plan".to_string(),
            value: plan.join(","),
        });

        Ok(BreedOutput {
            breed: BreedId::HtnPlanning,
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some(plan.join(",")),
            explanation: format!(
                "HTN plan found with {} steps after {} expansions (replay self-audit passed)",
                plan.len(),
                expansion_count
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace (fraud signal)".to_string());
        }
        if !output
            .inference_trace
            .iter()
            .any(|t| matches!(t.kind.as_str(), "htn-decompose" | "htn-apply" | "htn-backtrack"))
        {
            return Err("trace must contain decomposition/apply/backtrack steps".to_string());
        }
        if output
            .inference_trace
            .iter()
            .filter(|t| t.kind == "htn-plan")
            .count()
            != 1
        {
            return Err("trace must contain exactly one htn-plan step".to_string());
        }
        Ok(())
    }
}
