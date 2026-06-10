use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Goal, Rule, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet, HashSet};

/// Partial Order Plan Breed
pub struct PartialOrderPlan;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Step {
    id: usize,
    name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct CausalLink {
    provider: usize,
    condition: String,
    consumer: usize,
}

#[derive(Clone, Debug)]
struct PlanState {
    steps: BTreeMap<usize, Step>,
    orderings: BTreeSet<(usize, usize)>,
    links: BTreeSet<CausalLink>,
    open_conditions: BTreeSet<(String, usize)>, // (condition, consumer_id)
    step_effects: BTreeMap<usize, Vec<String>>,
    step_dels: BTreeMap<usize, Vec<String>>,
    step_preconds: BTreeMap<usize, Vec<String>>,
    next_step_id: usize,
}

impl PlanState {
    fn is_cyclic(&self) -> bool {
        let mut adj = BTreeMap::new();
        for s in self.steps.keys() {
            adj.insert(*s, Vec::new());
        }
        for (u, v) in &self.orderings {
            adj.entry(*u).or_default().push(*v);
        }
        let mut visited = BTreeSet::new();
        let mut rec_stack = BTreeSet::new();

        fn is_cyclic_util(
            node: usize,
            adj: &BTreeMap<usize, Vec<usize>>,
            visited: &mut BTreeSet<usize>,
            rec_stack: &mut BTreeSet<usize>,
        ) -> bool {
            if !visited.contains(&node) {
                visited.insert(node);
                rec_stack.insert(node);

                if let Some(neighbors) = adj.get(&node) {
                    for &n in neighbors {
                        if !visited.contains(&n) && is_cyclic_util(n, adj, visited, rec_stack) {
                            return true;
                        } else if rec_stack.contains(&n) {
                            return true;
                        }
                    }
                }
            }
            rec_stack.remove(&node);
            false
        }

        for &s in self.steps.keys() {
            if is_cyclic_util(s, &adj, &mut visited, &mut rec_stack) {
                return true;
            }
        }
        false
    }

    fn path_exists(&self, u: usize, v: usize) -> bool {
        let mut adj = BTreeMap::new();
        for s in self.steps.keys() {
            adj.insert(*s, Vec::new());
        }
        for (a, b) in &self.orderings {
            adj.entry(*a).or_default().push(*b);
        }
        let mut q = vec![u];
        let mut visited = BTreeSet::new();
        visited.insert(u);
        while let Some(curr) = q.pop() {
            if curr == v { return true; }
            if let Some(neighbors) = adj.get(&curr) {
                for &n in neighbors {
                    if !visited.contains(&n) {
                        visited.insert(n);
                        q.push(n);
                    }
                }
            }
        }
        false
    }
}

fn parse_adds(conclusion: &str) -> Vec<String> {
    conclusion
        .split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !s.starts_with('!'))
        .map(|s| s.to_string())
        .collect()
}

fn parse_dels(conclusion: &str) -> Vec<String> {
    conclusion
        .split(';')
        .filter_map(|s| s.trim().strip_prefix('!').map(|x| x.to_string()))
        .collect()
}

fn solve(
    plan: PlanState,
    rules: &[Rule],
    trace: &mut Vec<TraceStep>,
    depth: u32,
) -> Result<PlanState, String> {
    if depth > 64 {
        trace.push(TraceStep {
            step: trace.len(),
            kind: "backtrack".into(),
            detail: "depth limit".into(),
            depth,
            objects: vec![],
        });
        return Err("depth limit reached".to_string());
    }

    if plan.open_conditions.is_empty() {
        return Ok(plan);
    }

    let (condition, consumer) = plan.open_conditions.iter().next().unwrap().clone();
    
    trace.push(TraceStep {
        step: trace.len(),
        kind: "open-condition".into(),
        detail: format!("{} for {}", condition, consumer),
        depth,
        objects: vec![],
    });

    let mut new_plan = plan.clone();
    new_plan.open_conditions.remove(&(condition.clone(), consumer));

    // Find providers: existing steps or new actions
    let mut providers = Vec::new();
    for (&id, effects) in &plan.step_effects {
        if id != consumer && effects.contains(&condition) && !plan.path_exists(consumer, id) {
            providers.push((id, None));
        }
    }
    for r in rules {
        if parse_adds(&r.conclusion).contains(&condition) {
            providers.push((plan.next_step_id, Some(r.clone())));
        }
    }

    for (provider_id, opt_rule) in providers {
        let mut branch_plan = new_plan.clone();

        if let Some(r) = opt_rule {
            let id = branch_plan.next_step_id;
            branch_plan.next_step_id += 1;
            branch_plan.steps.insert(id, Step { id, name: r.id.clone() });
            branch_plan.step_effects.insert(id, parse_adds(&r.conclusion));
            branch_plan.step_dels.insert(id, parse_dels(&r.conclusion));
            branch_plan.step_preconds.insert(id, r.premise.clone());
            branch_plan.orderings.insert((0, id)); // Start < new
            branch_plan.orderings.insert((id, 1)); // new < Finish
            for p in &r.premise {
                branch_plan.open_conditions.insert((p.clone(), id));
            }
            trace.push(TraceStep {
                step: trace.len(),
                kind: "add-step".into(),
                detail: format!("{}: {}", id, r.id),
                depth,
                objects: vec![],
            });
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "add-link".into(),
            detail: format!("{} -> {} -> {}", provider_id, condition, consumer),
            depth,
            objects: vec![],
        });

        branch_plan.links.insert(CausalLink {
            provider: provider_id,
            condition: condition.clone(),
            consumer,
        });
        branch_plan.orderings.insert((provider_id, consumer));

        if branch_plan.is_cyclic() {
            continue;
        }

        let mut all_threats = Vec::new();
        for link in &branch_plan.links {
            for (&step_id, dels) in &branch_plan.step_dels {
                if step_id != link.provider && step_id != link.consumer && dels.contains(&link.condition) {
                    if !branch_plan.path_exists(step_id, link.provider) && !branch_plan.path_exists(link.consumer, step_id) {
                        all_threats.push((step_id, link.clone()));
                    }
                }
            }
        }

        // Wait, the above is a bit clunky. Let's write it cleaner:
        let res = resolve_threats(branch_plan, &all_threats, 0, rules, trace, depth);
        if let Ok(resolved_plan) = res {
            if let Ok(final_plan) = solve(resolved_plan, rules, trace, depth + 1) {
                return Ok(final_plan);
            }
        }
    }
    
    trace.push(TraceStep {
        step: trace.len(),
        kind: "backtrack".into(),
        detail: format!("failed to satisfy {}", condition),
        depth,
        objects: vec![],
    });

    Err("No valid plan branch".to_string())
}

fn resolve_threats(
    plan: PlanState,
    threats: &[(usize, CausalLink)],
    idx: usize,
    rules: &[Rule],
    trace: &mut Vec<TraceStep>,
    depth: u32,
) -> Result<PlanState, String> {
    if idx >= threats.len() {
        return Ok(plan);
    }
    let (threat_id, link) = &threats[idx];
    
    if plan.path_exists(*threat_id, link.provider) || plan.path_exists(link.consumer, *threat_id) {
        return resolve_threats(plan, threats, idx + 1, rules, trace, depth);
    }

    trace.push(TraceStep {
        step: trace.len(),
        kind: "detect-threat".into(),
        detail: format!("{} threatens {} -> {} -> {}", threat_id, link.provider, link.condition, link.consumer),
        depth,
        objects: vec![],
    });

    // Try Promotion (threat < provider)
    let mut promo_plan = plan.clone();
    promo_plan.orderings.insert((*threat_id, link.provider));
    if !promo_plan.is_cyclic() {
        trace.push(TraceStep {
            step: trace.len(),
            kind: "promote".into(),
            detail: format!("{} < {}", threat_id, link.provider),
            depth,
            objects: vec![],
        });
        if let Ok(res) = resolve_threats(promo_plan, threats, idx + 1, rules, trace, depth) {
            return Ok(res);
        }
    }

    // Try Demotion (consumer < threat)
    let mut demo_plan = plan.clone();
    demo_plan.orderings.insert((link.consumer, *threat_id));
    if !demo_plan.is_cyclic() {
        trace.push(TraceStep {
            step: trace.len(),
            kind: "demote".into(),
            detail: format!("{} < {}", link.consumer, threat_id),
            depth,
            objects: vec![],
        });
        if let Ok(res) = resolve_threats(demo_plan, threats, idx + 1, rules, trace, depth) {
            return Ok(res);
        }
    }

    Err("Unresolvable threat".to_string())
}

impl CognitionBreed for PartialOrderPlan {
    fn id(&self) -> BreedId {
        BreedId::PartialOrderPlan
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["partial_order_planning".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err("PARTIAL-ORDER-PLAN requires at least one goal".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        
        let mut plan = PlanState {
            steps: BTreeMap::new(),
            orderings: BTreeSet::new(),
            links: BTreeSet::new(),
            open_conditions: BTreeSet::new(),
            step_effects: BTreeMap::new(),
            step_dels: BTreeMap::new(),
            step_preconds: BTreeMap::new(),
            next_step_id: 2,
        };

        // Start step (0)
        let mut init_effects = Vec::new();
        for a in &input.state {
            init_effects.push(format!("{}={}", a.predicate, a.value));
        }
        plan.steps.insert(0, Step { id: 0, name: "Start".into() });
        plan.step_effects.insert(0, init_effects);
        plan.step_dels.insert(0, vec![]);
        plan.step_preconds.insert(0, vec![]);

        // Finish step (1)
        let mut finish_preconds = Vec::new();
        for g in &input.goals {
            let cond = format!("{}={}", g.predicate, g.value);
            finish_preconds.push(cond.clone());
            plan.open_conditions.insert((cond, 1));
        }
        plan.steps.insert(1, Step { id: 1, name: "Finish".into() });
        plan.step_effects.insert(1, vec![]);
        plan.step_dels.insert(1, vec![]);
        plan.step_preconds.insert(1, finish_preconds);

        plan.orderings.insert((0, 1));

        trace.push(TraceStep {
            step: trace.len(),
            kind: "init-plan".into(),
            detail: "Start and Finish nodes initialized".into(),
            depth: 0,
            objects: vec![],
        });

        match solve(plan, &input.rules, &mut trace, 0) {
            Ok(final_plan) => {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "plan-complete".into(),
                    detail: format!("{} steps", final_plan.steps.len()),
                    depth: 0,
                    objects: vec![],
                });

                // Topo sort
                let mut adj = BTreeMap::new();
                let mut in_degree = BTreeMap::new();
                for &s in final_plan.steps.keys() {
                    adj.insert(s, Vec::new());
                    in_degree.insert(s, 0);
                }
                for (u, v) in &final_plan.orderings {
                    adj.entry(*u).or_default().push(*v);
                    *in_degree.entry(*v).or_default() += 1;
                }
                
                let mut q = Vec::new();
                for (&s, &d) in &in_degree {
                    if d == 0 { q.push(s); }
                }
                
                let mut ordered = Vec::new();
                while let Some(curr) = q.pop() {
                    ordered.push(curr);
                    for &n in adj.get(&curr).unwrap() {
                        let d = in_degree.get_mut(&n).unwrap();
                        *d -= 1;
                        if *d == 0 {
                            q.push(n);
                        }
                    }
                }

                let mut op_names = Vec::new();
                for id in ordered {
                    if id != 0 && id != 1 {
                        op_names.push(final_plan.steps[&id].name.clone());
                    }
                }

                Ok(BreedOutput {
                    breed: BreedId::PartialOrderPlan,
                    candidates: input.candidates.clone(),
                    facts: input.facts.clone(),
                    selected: Some(op_names.join(",")),
                    explanation: format!("SNLP produced plan of length {}", op_names.len()),
                    inference_trace: trace,
                    ocel_log: None,
                    retained_cases: vec![],
                })
            }
            Err(e) => Err(BreedError {
                breed: BreedId::PartialOrderPlan,
                message: e,
            }),
        }
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if !output.inference_trace.iter().any(|t| t.kind == "plan-complete") {
            return Err("Must output plan-complete".to_string());
        }
        Ok(())
    }
}
