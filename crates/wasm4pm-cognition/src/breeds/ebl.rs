//! Explanation-based learning — Mitchell, Keller & Kedar-Cabelli 1986 (EBG).
//!
//! Three phases:
//! 1. **Explain** — SLD backward chaining (unification with variable
//!    renaming, depth cap 32) proves the training goal from facts + the
//!    domain theory, producing a proof tree.
//! 2. **Generalize** — EGGS-style goal regression over the proof tree: the
//!    goal's constants are replaced by fresh variables (`?targetN`, one per
//!    argument position) and the substitutions of the proof are replayed
//!    symbolically, propagating variables instead of training constants.
//! 3. **Operationalize** — the leaves of the generalized proof become the
//!    premise of a new operational rule, emitted as an `ebl:rule` fact
//!    (`"p1, p2 => head"`).
//!
//! Anti-fraud postcondition: the learned rule MUST contain at least one
//! variable (a ground "learned rule" is memorization, not generalization).
//!
//! Input contract: facts are ground atoms in their keys (e.g.
//! `has_handle(obj1)`); rules use `?var` arguments; goals[0] is the training
//! example (`predicate` holds the goal atom when `value == "true"`).
//!
//! Trace kinds: `ebl-explain`(1,*) → `ebl-generalize`(1,*) →
//! `ebl-operationalize`(1,1).

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, Rule, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Explanation-based learning breed.
pub struct Ebl;

#[derive(Clone, Debug, PartialEq)]
struct Term {
    pred: String,
    args: Vec<String>,
}

impl Term {
    fn parse(s: &str) -> Self {
        if let Some(idx) = s.find('(') {
            if s.ends_with(')') {
                let pred = s[0..idx].to_string();
                let args_str = &s[idx + 1..s.len() - 1];
                let args = if args_str.is_empty() {
                    vec![]
                } else {
                    args_str.split(',').map(|a| a.trim().to_string()).collect()
                };
                return Term { pred, args };
            }
        }
        Term {
            pred: s.to_string(),
            args: vec![],
        }
    }

    fn render(&self) -> String {
        if self.args.is_empty() {
            self.pred.clone()
        } else {
            format!("{}({})", self.pred, self.args.join(","))
        }
    }
}

type Subst = BTreeMap<String, String>;

fn apply_subst_var(var: &str, subst: &Subst) -> String {
    let mut current = var.to_string();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    while let Some(next) = subst.get(&current) {
        if next == &current || seen.contains(next) {
            break;
        }
        seen.insert(current.clone());
        current = next.clone();
    }
    current
}

fn apply_subst_term(t: &Term, subst: &Subst) -> Term {
    Term {
        pred: t.pred.clone(),
        args: t.args.iter().map(|a| apply_subst_var(a, subst)).collect(),
    }
}

fn unify(t1: &Term, t2: &Term, subst: &mut Subst) -> bool {
    if t1.pred != t2.pred || t1.args.len() != t2.args.len() {
        return false;
    }
    for (a1, a2) in t1.args.iter().zip(t2.args.iter()) {
        let v1 = apply_subst_var(a1, subst);
        let v2 = apply_subst_var(a2, subst);
        if v1 == v2 {
            continue;
        }
        if v1.starts_with('?') {
            subst.insert(v1, v2);
        } else if v2.starts_with('?') {
            subst.insert(v2, v1);
        } else {
            return false;
        }
    }
    true
}

fn rename_vars(t: &Term, suffix: &str) -> Term {
    Term {
        pred: t.pred.clone(),
        args: t
            .args
            .iter()
            .map(|a| {
                if a.starts_with('?') {
                    format!("{}{}", a, suffix)
                } else {
                    a.clone()
                }
            })
            .collect(),
    }
}

#[derive(Clone, Debug)]
enum ProofNode {
    Fact(Term),
    RuleNode {
        rule: Rule,
        children: Vec<ProofNode>,
    },
}

fn explain(
    goal: &Term,
    rules: &[Rule],
    facts: &BTreeSet<String>,
    depth: usize,
    subst: &mut Subst,
    trace: &mut Vec<TraceStep>,
) -> Option<ProofNode> {
    if depth == 0 {
        return None;
    }
    let goal_subst = apply_subst_term(goal, subst);
    if facts.contains(&goal_subst.render()) {
        trace.push(TraceStep {
            step: trace.len(),
            kind: "ebl-explain".to_string(),
            detail: format!("fact: {}", goal_subst.render()),
            depth: depth as u32,
            objects: vec![],
        });
        return Some(ProofNode::Fact(goal_subst));
    }
    for rule in rules {
        let head = Term::parse(&rule.conclusion);
        let suffix = format!("_{}", depth);
        let mut local_subst = subst.clone();
        let renamed_head = rename_vars(&head, &suffix);
        if unify(&goal_subst, &renamed_head, &mut local_subst) {
            let mut children = Vec::new();
            let mut all_success = true;
            for p in &rule.premise {
                let p_term = rename_vars(&Term::parse(p), &suffix);
                if let Some(child) =
                    explain(&p_term, rules, facts, depth - 1, &mut local_subst, trace)
                {
                    children.push(child);
                } else {
                    all_success = false;
                    break;
                }
            }
            if all_success {
                *subst = local_subst;
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "ebl-explain".to_string(),
                    detail: format!("rule: {}", rule.id),
                    depth: depth as u32,
                    objects: vec![("rule".to_string(), rule.id.clone())],
                });
                return Some(ProofNode::RuleNode {
                    rule: rule.clone(),
                    children,
                });
            }
        }
    }
    None
}

/// EGGS goal regression: replay the proof with the generalized goal,
/// collecting the generalized leaves (operational preconditions).
fn generalize_proof(
    node: &ProofNode,
    gen_goal: &Term,
    gen_subst: &mut Subst,
    trace: &mut Vec<TraceStep>,
    depth: usize,
) -> Vec<Term> {
    match node {
        ProofNode::Fact(_) => {
            vec![apply_subst_term(gen_goal, gen_subst)]
        }
        ProofNode::RuleNode { rule, children } => {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "ebl-generalize".to_string(),
                detail: format!("rule: {}", rule.id),
                depth: depth as u32,
                objects: vec![("rule".to_string(), rule.id.clone())],
            });
            let head = rename_vars(&Term::parse(&rule.conclusion), &format!("_g{}", depth));
            unify(gen_goal, &head, gen_subst);
            let mut leaves = Vec::new();
            for (i, child) in children.iter().enumerate() {
                let premise_term =
                    rename_vars(&Term::parse(&rule.premise[i]), &format!("_g{}", depth));
                let gen_subgoal = apply_subst_term(&premise_term, gen_subst);
                leaves.extend(generalize_proof(child, &gen_subgoal, gen_subst, trace, depth + 1));
            }
            leaves
        }
    }
}

impl CognitionBreed for Ebl {
    fn id(&self) -> BreedId {
        BreedId::Ebl
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "explanation_based_learning".to_string(),
            "sld_backward_chaining".to_string(),
            "eggs_goal_regression".to_string(),
            "operationalization".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err("ebl requires at least one goal (the training example)".to_string());
        }
        if input.rules.is_empty() {
            return Err("ebl requires a domain theory (rules)".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let fact_set: BTreeSet<String> = input.facts.iter().map(|f| f.key.clone()).collect();

        // Defensive refusal (mirrors preconditions): raw-run paths must not panic.
        if input.goals.is_empty() {
            return Err(BreedError {
                breed: BreedId::Ebl,
                message: "ebl requires at least one goal (the training example)".to_string(),
            });
        }

        // Training goal: goals[0]; value "true" means predicate IS the atom.
        let goal_str = if input.goals[0].value == "true" {
            input.goals[0].predicate.clone()
        } else {
            format!("{}({})", input.goals[0].predicate, input.goals[0].value)
        };
        let goal = Term::parse(&goal_str);

        let mut subst: Subst = BTreeMap::new();
        let proof = explain(&goal, &input.rules, &fact_set, 32, &mut subst, &mut trace)
            .ok_or_else(|| BreedError {
                breed: BreedId::Ebl,
                message: "ebl explain phase failed: could not prove goal".to_string(),
            })?;

        // Generalized target goal: every constant argument becomes a fresh
        // variable (?target0, ?target1, …) — multi-argument goals included.
        let mut gen_goal = goal.clone();
        for (i, arg) in gen_goal.args.iter_mut().enumerate() {
            if !arg.starts_with('?') {
                *arg = format!("?target{}", i);
            }
        }

        let mut gen_subst: Subst = BTreeMap::new();
        let leaves = generalize_proof(&proof, &gen_goal, &mut gen_subst, &mut trace, 0);
        let generalized_leaves: Vec<String> = leaves
            .iter()
            .map(|l| apply_subst_term(l, &gen_subst).render())
            .collect();
        let generalized_head = apply_subst_term(&gen_goal, &gen_subst).render();
        let rule_str = format!("{} => {}", generalized_leaves.join(", "), generalized_head);

        trace.push(TraceStep {
            step: trace.len(),
            kind: "ebl-operationalize".to_string(),
            detail: rule_str.clone(),
            depth: 0,
            objects: vec![("decision".to_string(), "learned-rule".to_string())],
        });

        let mut facts = input.facts.clone();
        facts.push(Fact {
            key: "ebl:rule".to_string(),
            value: rule_str.clone(),
        });

        Ok(BreedOutput {
            breed: BreedId::Ebl,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(rule_str),
            explanation: format!(
                "EBL operationalized a new rule from the proof of {}",
                goal_str
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        let rule_fact = output
            .facts
            .iter()
            .find(|f| f.key == "ebl:rule")
            .ok_or_else(|| "ebl must emit an ebl:rule fact".to_string())?;
        if !rule_fact.value.contains('?') {
            return Err(
                "learned rule must contain >= 1 variable (ground rule = memorization fraud)"
                    .to_string(),
            );
        }
        let kinds: BTreeSet<&str> = output
            .inference_trace
            .iter()
            .map(|t| t.kind.as_str())
            .collect();
        for required in ["ebl-explain", "ebl-generalize", "ebl-operationalize"] {
            if !kinds.contains(required) {
                return Err(format!("ebl trace missing required kind '{}'", required));
            }
        }
        Ok(())
    }
}
