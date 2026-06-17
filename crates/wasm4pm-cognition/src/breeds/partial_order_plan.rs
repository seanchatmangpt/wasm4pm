//! Partial Order Planning (POP) algorithm (McAllester 1991).
//!
//! Steps: `pop-init`, `pop-resolve`, `pop-plan`.
//! Encoding is compatible with STRIPS-style rules and state.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Goal, Rule, StateAtom, TraceStep,
};
use std::collections::{HashMap, HashSet};

/// Partial Order Planner
pub struct PartialOrderPlan;

#[derive(Clone, Debug)]
struct Step {
    id: usize,
    action_name: String, // "start", "end", or rule.id
    preconditions: Vec<String>,
    adds: Vec<String>,
    dels: Vec<String>,
}

#[derive(Clone, Debug)]
struct CausalLink {
    from: usize,
    to: usize,
    condition: String,
}

#[derive(Debug, Clone)]
struct ActionEffect {
    adds: Vec<String>,
    dels: Vec<String>,
}

fn parse_effect(conclusion: &str) -> ActionEffect {
    let mut adds = Vec::new();
    let mut dels = Vec::new();
    for tok in conclusion
        .split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if let Some(rest) = tok.strip_prefix('!') {
            dels.push(rest.to_string());
        } else {
            adds.push(tok.to_string());
        }
    }
    ActionEffect { adds, dels }
}

fn atoms_of(state: &[StateAtom]) -> Vec<String> {
    state
        .iter()
        .map(|a| format!("{}={}", a.predicate, a.value))
        .collect()
}

fn goal_strings(goals: &[Goal]) -> Vec<String> {
    goals
        .iter()
        .map(|g| format!("{}={}", g.predicate, g.value))
        .collect()
}

fn has_path(start: usize, end: usize, num_nodes: usize, orderings: &HashSet<(usize, usize)>) -> bool {
    let mut adj = vec![vec![]; num_nodes];
    for &(u, v) in orderings {
        adj[u].push(v);
    }
    let mut visited = vec![false; num_nodes];
    let mut queue = std::collections::VecDeque::new();
    queue.push_back(start);
    visited[start] = true;
    while let Some(u) = queue.pop_front() {
        if u == end {
            return true;
        }
        for &v in &adj[u] {
            if !visited[v] {
                visited[v] = true;
                queue.push_back(v);
            }
        }
    }
    false
}

fn is_consistent(num_steps: usize, orderings: &HashSet<(usize, usize)>) -> bool {
    let mut adj = vec![vec![]; num_steps];
    let mut in_degree = vec![0; num_steps];
    for &(u, v) in orderings {
        adj[u].push(v);
        in_degree[v] += 1;
    }
    let mut queue = std::collections::VecDeque::new();
    for i in 0..num_steps {
        if in_degree[i] == 0 {
            queue.push_back(i);
        }
    }
    let mut count = 0;
    while let Some(u) = queue.pop_front() {
        count += 1;
        for &v in &adj[u] {
            in_degree[v] -= 1;
            if in_degree[v] == 0 {
                queue.push_back(v);
            }
        }
    }
    count == num_steps
}

fn topological_sort(num_steps: usize, orderings: &HashSet<(usize, usize)>) -> Vec<usize> {
    let mut adj = vec![vec![]; num_steps];
    let mut in_degree = vec![0; num_steps];
    for &(u, v) in orderings {
        adj[u].push(v);
        in_degree[v] += 1;
    }
    let mut queue = std::collections::VecDeque::new();
    for i in 0..num_steps {
        if in_degree[i] == 0 {
            queue.push_back(i);
        }
    }
    let mut result = Vec::new();
    while let Some(u) = queue.pop_front() {
        result.push(u);
        for &v in &adj[u] {
            in_degree[v] -= 1;
            if in_degree[v] == 0 {
                queue.push_back(v);
            }
        }
    }
    result
}

fn resolve_threats(
    steps: &Vec<Step>,
    orderings: &mut HashSet<(usize, usize)>,
    causal_links: &Vec<CausalLink>,
    trace: &mut Vec<TraceStep>,
    depth: usize,
) -> bool {
    let num_steps = steps.len();
    for link in causal_links {
        for step in steps {
            if step.id == link.from || step.id == link.to {
                continue;
            }
            if step.dels.contains(&link.condition) {
                // A step is a threat if it deletes the condition and it is not already constrained
                // to be before the source or after the destination.
                let is_before = has_path(step.id, link.from, num_steps, orderings);
                let is_after = has_path(link.to, step.id, num_steps, orderings);
                
                if is_before || is_after {
                    continue;
                }

                // Potential threat detected
                let cannot_be_before = has_path(link.from, step.id, num_steps, orderings);
                let cannot_be_after = has_path(step.id, link.to, num_steps, orderings);
                
                if cannot_be_before && cannot_be_after {
                    // Threat is unresolvable
                    return false;
                }

                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "detect-threat".to_string(),
                    detail: format!("Threat detected: step {} deletes '{}' required by link {}->{}", step.id, link.condition, link.from, link.to),
                    depth: depth as u32,
                    objects: vec![],
                });

                if !cannot_be_before {
                    // Try demotion: step < link.from
                    let mut orderings_backup = orderings.clone();
                    orderings.insert((step.id, link.from));
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "demote".to_string(),
                        detail: format!("Attempting demotion: {} < {}", step.id, link.from),
                        depth: depth as u32,
                        objects: vec![],
                    });
                    if is_consistent(num_steps, orderings) {
                        if resolve_threats(steps, orderings, causal_links, trace, depth) {
                            return true;
                        }
                    }
                    *orderings = orderings_backup;
                }

                if !cannot_be_after {
                    // Try promotion: link.to < step
                    let mut orderings_backup = orderings.clone();
                    orderings.insert((link.to, step.id));
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "promote".to_string(),
                        detail: format!("Attempting promotion: {} < {}", link.to, step.id),
                        depth: depth as u32,
                        objects: vec![],
                    });
                    if is_consistent(num_steps, orderings) {
                        if resolve_threats(steps, orderings, causal_links, trace, depth) {
                            return true;
                        }
                    }
                    *orderings = orderings_backup;
                }

                return false;
            }
        }
    }
    true
}

fn pop_search(
    steps: &mut Vec<Step>,
    orderings: &mut HashSet<(usize, usize)>,
    causal_links: &mut Vec<CausalLink>,
    actions: &[Rule],
    trace: &mut Vec<TraceStep>,
    depth: usize,
) -> bool {
    if depth > 50 {
        return false;
    }

    let mut open_pre = None;
    for step in steps.iter() {
        for pre in &step.preconditions {
            let has_link = causal_links.iter().any(|l| l.to == step.id && &l.condition == pre);
            if !has_link {
                open_pre = Some((step.id, pre.clone()));
                break;
            }
        }
        if open_pre.is_some() {
            break;
        }
    }

    let (s_need, pre) = match open_pre {
        None => return true,
        Some(x) => x,
    };

    trace.push(TraceStep {
        step: trace.len(),
        kind: "pop-resolve".to_string(),
        detail: format!("Resolving open precondition '{}' for step {}", pre, s_need),
        depth: depth as u32,
        objects: vec![],
    });

    let mut candidates = Vec::new();
    for step in steps.iter() {
        if step.adds.contains(&pre) {
            candidates.push((step.id, false, None));
        }
    }

    for rule in actions {
        let eff = parse_effect(&rule.conclusion);
        if eff.adds.contains(&pre) {
            candidates.push((0, true, Some(rule)));
        }
    }

    for (s_add, is_new, rule_opt) in candidates {
        let steps_orig = steps.clone();
        let orderings_orig = orderings.clone();
        let causal_links_orig = causal_links.clone();

        let s_add_id = if is_new {
            let rule = rule_opt.unwrap();
            let new_id = steps.len();
            let eff = parse_effect(&rule.conclusion);
            steps.push(Step {
                id: new_id,
                action_name: rule.id.clone(),
                preconditions: rule.premise.clone(),
                adds: eff.adds,
                dels: eff.dels,
            });
            orderings.insert((0, new_id));
            orderings.insert((new_id, 1));
            new_id
        } else {
            s_add
        };

        orderings.insert((s_add_id, s_need));
        causal_links.push(CausalLink {
            from: s_add_id,
            to: s_need,
            condition: pre.clone(),
        });

        if !is_consistent(steps.len(), orderings) {
            *steps = steps_orig;
            *orderings = orderings_orig;
            *causal_links = causal_links_orig;
            continue;
        }

        if resolve_threats(steps, orderings, causal_links, trace, depth) {
            if pop_search(steps, orderings, causal_links, actions, trace, depth + 1) {
                return true;
            }
        }

        *steps = steps_orig;
        *orderings = orderings_orig;
        *causal_links = causal_links_orig;
    }

    false
}

impl CognitionBreed for PartialOrderPlan {
    fn id(&self) -> BreedId {
        BreedId::PartialOrderPlan
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["planning".to_string(), "partial_order".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err("Partial Order Planner requires at least one goal".to_string());
        }
        if input.rules.is_empty() {
            return Err("Partial Order Planner requires at least one action rule".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        trace.push(TraceStep {
            step: trace.len(),
            kind: "pop-init".to_string(),
            detail: "Initialized plan with start and end steps".to_string(),
            depth: 0,
            objects: vec![],
        });

        let initial_state = atoms_of(&input.state);
        let goals = goal_strings(&input.goals);

        let mut steps = vec![
            Step {
                id: 0,
                action_name: "start".to_string(),
                preconditions: vec![],
                adds: initial_state,
                dels: vec![],
            },
            Step {
                id: 1,
                action_name: "end".to_string(),
                preconditions: goals,
                adds: vec![],
                dels: vec![],
            },
        ];

        let mut orderings = HashSet::new();
        orderings.insert((0, 1));
        let mut causal_links = Vec::new();

        let success = pop_search(&mut steps, &mut orderings, &mut causal_links, &input.rules, &mut trace, 0);

        if !success {
            return Err(BreedError {
                breed: self.id(),
                message: "No valid partial order plan found".to_string(),
            });
        }

        let sorted = topological_sort(steps.len(), &orderings);
        let plan_actions: Vec<String> = sorted
            .into_iter()
            .map(|id| steps[id].action_name.clone())
            .filter(|name| name != "start" && name != "end")
            .collect();

        let selected = if plan_actions.is_empty() {
            Some("".to_string())
        } else {
            Some(plan_actions.join(","))
        };

        let explanation = format!(
            "Partial Order Plan found ({} steps): {}",
            plan_actions.len(),
            plan_actions.join(" → ")
        );

        trace.push(TraceStep {
            step: trace.len(),
            kind: "pop-plan".to_string(),
            detail: explanation.clone(),
            depth: 0,
            objects: vec![],
        });

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Partial Order Planner must record search steps".to_string());
        }
        let kinds: HashSet<_> = output.inference_trace.iter().map(|t| t.kind.clone()).collect();
        if !kinds.contains("pop-init") || !kinds.contains("pop-plan") {
            return Err("Partial Order Planner trace missing required kinds".to_string());
        }
        Ok(())
    }
}
