use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Rule, StateAtom, TraceStep,
};
use std::collections::HashSet;

/// Hierarchical Task Network Planning breed
pub struct HtnPlanning;

fn atoms_of(state: &[StateAtom]) -> HashSet<String> {
    state
        .iter()
        .map(|a| format!("{}={}", a.predicate, a.value))
        .collect()
}

fn applicable(rule: &Rule, state: &HashSet<String>) -> bool {
    rule.premise.iter().all(|p| state.contains(p))
}

fn apply_effect(rule: &Rule, state: &HashSet<String>) -> HashSet<String> {
    let mut next = state.clone();
    for tok in rule.conclusion.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if let Some(rest) = tok.strip_prefix('!') {
            next.remove(rest);
        } else {
            next.insert(tok.to_string());
        }
    }
    next
}

fn htn_seek(
    state: &HashSet<String>,
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
                    objects: vec![],
                });
                let next_state = apply_effect(op_rule, state);
                if let Some(plan_rest) = htn_seek(&next_state, rest, rules, depth + 1, expansion_count, trace) {
                    let mut plan = vec![t1.clone()];
                    plan.extend(plan_rest);
                    return Some(plan);
                }
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "htn-backtrack".to_string(),
                    detail: t1.clone(),
                    depth: depth as u32,
                    objects: vec![],
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
                    objects: vec![],
                });

                let subtasks: Vec<String> = m_rule.conclusion
                    .split(';')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();

                let mut new_tasks = subtasks;
                new_tasks.extend_from_slice(rest);

                if let Some(plan) = htn_seek(state, &new_tasks, rules, depth + 1, expansion_count, trace) {
                    return Some(plan);
                }

                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "htn-backtrack".to_string(),
                    detail: m_rule.id.clone(),
                    depth: depth as u32,
                    objects: vec![],
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
        vec!["htn_planning".to_string(), "total_order_decomposition".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err("HTN requires at least one initial task (encoded in goals)".to_string());
        }
        if input.rules.is_empty() {
            return Err("HTN requires at least one rule (method or op)".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let initial = atoms_of(&input.state);
        let tasks: Vec<String> = input.goals.iter().map(|g| g.value.clone()).collect();
        let mut trace = Vec::new();
        let mut expansion_count = 0;

        let plan_opt = htn_seek(&initial, &tasks, &input.rules, 0, &mut expansion_count, &mut trace);

        let plan = match plan_opt {
            Some(p) => p,
            None => {
                return Err(BreedError {
                    breed: BreedId::HtnPlanning,
                    message: format!("no plan found (expanded {} nodes)", expansion_count),
                });
            }
        };

        // Self-audit plan replay
        let mut audit_state = initial.clone();
        for step in &plan {
            let op_rule = input.rules.iter().find(|r| r.id == *step).ok_or_else(|| BreedError {
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
            objects: vec![],
        });

        Ok(BreedOutput {
            breed: BreedId::HtnPlanning,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: Some(plan.join(",")),
            explanation: format!("HTN plan found with {} steps", plan.len()),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("HTN planning must record trace steps".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Goal, Rule, StateAtom};

    #[test]
    fn htn_planning_hidden_oracle_backtrack() {
        let input = BreedInput {
            intent: "travel".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            state: vec![
                StateAtom { predicate: "at".into(), value: "home".into() },
                StateAtom { predicate: "cash".into(), value: "low".into() },
            ],
            goals: vec![
                Goal { id: "g1".into(), predicate: "task".into(), value: "travel".into() },
            ],
            rules: vec![
                Rule {
                    id: "method:travel:taxi".into(),
                    premise: vec!["at=home".into()], // Applicable!
                    conclusion: "op:hail_taxi;op:pay_taxi".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "method:travel:walk".into(),
                    premise: vec!["at=home".into()],
                    conclusion: "op:walk".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "op:hail_taxi".into(),
                    premise: vec![],
                    conclusion: "in=taxi".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "op:pay_taxi".into(),
                    premise: vec!["in=taxi".into(), "cash=high".into()], // Will fail!
                    conclusion: "!in=taxi;at=dest".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "op:walk".into(),
                    premise: vec![],
                    conclusion: "!at=home;at=dest".into(),
                    certainty: 1.0,
                },
            ],
        };

        let out = HtnPlanning.run(&input).expect("should find walk plan");
        assert_eq!(out.selected.as_deref(), Some("op:walk"));
        
        let backtrack_steps = out.inference_trace.iter().filter(|t| t.kind == "htn-backtrack").count();
        assert!(backtrack_steps > 0, "Must contain htn-backtrack step");
        
        let plan_steps = out.inference_trace.iter().filter(|t| t.kind == "htn-plan").count();
        assert_eq!(plan_steps, 1, "Must contain exactly one htn-plan step");
    }

    #[test]
    fn htn_planning_determinism() {
        let input = BreedInput {
            intent: "simple".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            state: vec![],
            goals: vec![Goal { id: "g1".into(), predicate: "task".into(), value: "t1".into() }],
            rules: vec![
                Rule { id: "method:t1:m1".into(), premise: vec![], conclusion: "op:o1".into(), certainty: 1.0 },
                Rule { id: "op:o1".into(), premise: vec![], conclusion: "done=yes".into(), certainty: 1.0 },
            ],
        };
        let out1 = HtnPlanning.run(&input).unwrap();
        let out2 = HtnPlanning.run(&input).unwrap();
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }
}
