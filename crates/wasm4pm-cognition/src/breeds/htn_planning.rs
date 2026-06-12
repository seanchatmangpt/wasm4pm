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

use crate::breeds::support::breed_class::PlannerBreed;
use crate::breeds::support::trace_query::TraceQuery;
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

impl PlannerBreed for HtnPlanning {
    fn required_trace_kinds(&self) -> &'static [&'static str] {
        &["htn-plan"]
    }
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

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        self.assert_plan_trace_complete(output)?;
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        if !(tq.has_kind("htn-decompose") || tq.has_kind("htn-apply") || tq.has_kind("htn-backtrack"))
        {
            return Err("trace must contain decomposition/apply/backtrack steps".to_string());
        }
        tq.require_count("htn-plan", 1)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, CognitionBreed, Goal, Rule, StateAtom};

    #[test]
    fn refuses_missing_initial_task() {
        let breed = HtnPlanning;
        let input = BreedInput {
            goals: vec![],
            rules: vec![Rule { id: "op:do_nothing".to_string(), premise: vec![], conclusion: "".to_string(), certainty: 1.0 }],
            ..Default::default()
        };
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn falsification_gate_chronological_backtracking() {
        let breed = HtnPlanning;
        let input = BreedInput {
            state: vec![StateAtom { predicate: "money".to_string(), value: "10".to_string() }],
            goals: vec![Goal { id: "g1".to_string(), predicate: "".to_string(), value: "buy_item".to_string() }],
            rules: vec![
                Rule { id: "method:buy_item:credit".to_string(), premise: vec![], conclusion: "op:swipe_card".to_string(), certainty: 1.0 },
                Rule { id: "method:buy_item:cash".to_string(), premise: vec!["money=10".to_string()], conclusion: "op:pay_cash".to_string(), certainty: 1.0 },
                Rule { id: "op:swipe_card".to_string(), premise: vec!["credit=true".to_string()], conclusion: "".to_string(), certainty: 1.0 },
                Rule { id: "op:pay_cash".to_string(), premise: vec!["money=10".to_string()], conclusion: "!money=10;item=true".to_string(), certainty: 1.0 },
            ],
            ..Default::default()
        };
        let out = breed.run(&input).unwrap();
        assert_eq!(out.selected.as_deref().unwrap(), "op:pay_cash");
        let tq = TraceQuery::from_output(&out);
        assert!(tq.has_kind("htn-backtrack"));
    }

    #[test]
    fn invariant_plan_concatenation() {
        let breed = HtnPlanning;
        let input1 = BreedInput {
            state: vec![StateAtom { predicate: "ready".to_string(), value: "true".to_string() }],
            goals: vec![Goal { id: "g1".to_string(), predicate: "".to_string(), value: "op:act1".to_string() }],
            rules: vec![
                Rule { id: "op:act1".to_string(), premise: vec!["ready=true".to_string()], conclusion: "done1=true".to_string(), certainty: 1.0 },
                Rule { id: "op:act2".to_string(), premise: vec!["ready=true".to_string()], conclusion: "done2=true".to_string(), certainty: 1.0 },
            ],
            ..Default::default()
        };
        let mut input2 = input1.clone();
        input2.goals = vec![
            Goal { id: "g1".to_string(), predicate: "".to_string(), value: "op:act1".to_string() },
            Goal { id: "g2".to_string(), predicate: "".to_string(), value: "op:act2".to_string() },
        ];

        
        let out1 = breed.run(&input1).unwrap();
        let out2 = breed.run(&input2).unwrap();
        
        assert_eq!(out1.selected.unwrap(), "op:act1");
        assert_eq!(out2.selected.unwrap(), "op:act1,op:act2");
    }
}
