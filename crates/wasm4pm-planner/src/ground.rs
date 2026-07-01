//! Grounding + greedy tick-based temporal planner — a fresh implementation
//! of the same algorithmic shape validated in bcinr-pddl this session
//! (durative actions concurrently gated on shared numeric fluents), with
//! one fix applied from day one instead of rediscovered: an already
//! in-flight grounded action instance must not be started again against
//! itself while its first instance is still running (bcinr-pddl's
//! `ground.rs` had exactly this bug — same-tick guard only, no in-flight
//! check — found via live testing of `route_capability_plan` and fixed
//! there; applied here from the start).
//!
//! Bounded (the "8/64 discipline", re-derived for this crate rather than
//! reusing bcinr-pddl's `PDDL8_MAX_*` constants): grounding is capped at
//! [`MAX_GROUND`] instances, planning at [`MAX_PLAN_DEPTH`] scheduling ticks.

use crate::parse::{Atom, CompareOp, Condition, Domain, Effect, Problem, Timed};
use std::collections::{BTreeSet, HashMap};

pub const MAX_GROUND: usize = 64;
pub const MAX_PLAN_DEPTH: usize = 64;

#[derive(Debug, Clone, PartialEq)]
pub enum PlanError {
    TooManyGroundInstances,
    NoPlanFound,
}

impl std::fmt::Display for PlanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlanError::TooManyGroundInstances => {
                write!(f, "grounding exceeds MAX_GROUND ({MAX_GROUND})")
            }
            PlanError::NoPlanFound => {
                write!(f, "bounded plan search exhausted without reaching the goal")
            }
        }
    }
}

impl std::error::Error for PlanError {}

#[derive(Debug, Clone)]
pub struct GroundAction {
    pub schema_name: String,
    pub args: Vec<String>,
    pub duration: f64,
    pub conditions: Vec<Timed<Condition>>,
    pub effects: Vec<Timed<Effect>>,
}

fn substitute(name: &str, bindings: &HashMap<String, String>) -> String {
    bindings
        .get(name)
        .cloned()
        .unwrap_or_else(|| name.to_string())
}

fn substitute_atom(atom: &Atom, bindings: &HashMap<String, String>) -> Atom {
    Atom {
        pred: atom.pred.clone(),
        args: atom.args.iter().map(|a| substitute(a, bindings)).collect(),
    }
}

fn substitute_condition(c: &Condition, bindings: &HashMap<String, String>) -> Condition {
    match c {
        Condition::Atom(a) => Condition::Atom(substitute_atom(a, bindings)),
        Condition::Not(inner) => Condition::Not(Box::new(substitute_condition(inner, bindings))),
        Condition::Compare(f, op, v) => Condition::Compare(f.clone(), op.clone(), *v),
    }
}

fn substitute_effect(e: &Effect, bindings: &HashMap<String, String>) -> Effect {
    match e {
        Effect::Add(a) => Effect::Add(substitute_atom(a, bindings)),
        Effect::Del(a) => Effect::Del(substitute_atom(a, bindings)),
        Effect::Increase(f, v) => Effect::Increase(f.clone(), *v),
        Effect::Decrease(f, v) => Effect::Decrease(f.clone(), *v),
    }
}

/// Ground every durative-action schema over every combination of problem
/// objects (parameter arity is small in practice for this slice's fixed
/// capability-style domains, so a simple cartesian product is sufficient).
pub fn ground_domain(domain: &Domain, problem: &Problem) -> Result<Vec<GroundAction>, PlanError> {
    let mut out = Vec::new();
    for schema in &domain.durative_actions {
        let combos = cartesian_product(problem.objects.len(), schema.params.len());
        for combo in combos {
            if out.len() >= MAX_GROUND {
                return Err(PlanError::TooManyGroundInstances);
            }
            let bindings: HashMap<String, String> = schema
                .params
                .iter()
                .zip(combo.iter())
                .map(|(p, &idx)| (p.clone(), problem.objects[idx].clone()))
                .collect();
            let args: Vec<String> = schema.params.iter().map(|p| bindings[p].clone()).collect();
            out.push(GroundAction {
                schema_name: schema.name.clone(),
                args,
                duration: schema.duration,
                conditions: schema
                    .conditions
                    .iter()
                    .map(|t| Timed {
                        at_end: t.at_end,
                        inner: substitute_condition(&t.inner, &bindings),
                    })
                    .collect(),
                effects: schema
                    .effects
                    .iter()
                    .map(|t| Timed {
                        at_end: t.at_end,
                        inner: substitute_effect(&t.inner, &bindings),
                    })
                    .collect(),
            });
        }
    }
    Ok(out)
}

fn cartesian_product(n_objects: usize, arity: usize) -> Vec<Vec<usize>> {
    if arity == 0 {
        return vec![vec![]];
    }
    let mut result = vec![vec![]];
    for _ in 0..arity {
        let mut next = Vec::new();
        for combo in &result {
            for i in 0..n_objects {
                let mut c = combo.clone();
                c.push(i);
                next.push(c);
            }
        }
        result = next;
    }
    result
}

#[derive(Debug, Clone)]
pub struct PlanStep {
    pub start_time: f64,
    pub duration: f64,
    pub action_name: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct TemporalPlan {
    pub steps: Vec<PlanStep>,
    pub makespan: f64,
}

fn eval_condition(
    cond: &Condition,
    state: &BTreeSet<(String, Vec<String>)>,
    fn_vals: &HashMap<String, f64>,
) -> bool {
    match cond {
        Condition::Atom(a) => state.contains(&(a.pred.clone(), a.args.clone())),
        Condition::Not(inner) => !eval_condition(inner, state, fn_vals),
        Condition::Compare(f, op, v) => {
            let l = fn_vals.get(f).copied().unwrap_or(0.0);
            match op {
                CompareOp::Ge => l >= *v,
                CompareOp::Le => l <= *v,
                CompareOp::Gt => l > *v,
                CompareOp::Lt => l < *v,
                CompareOp::Eq => (l - *v).abs() < 1e-9,
            }
        }
    }
}

fn apply_effect(
    eff: &Effect,
    state: &mut BTreeSet<(String, Vec<String>)>,
    fn_vals: &mut HashMap<String, f64>,
) {
    match eff {
        Effect::Add(a) => {
            state.insert((a.pred.clone(), a.args.clone()));
        }
        Effect::Del(a) => {
            state.remove(&(a.pred.clone(), a.args.clone()));
        }
        Effect::Increase(f, v) => {
            *fn_vals.entry(f.clone()).or_insert(0.0) += v;
        }
        Effect::Decrease(f, v) => {
            *fn_vals.entry(f.clone()).or_insert(0.0) -= v;
        }
    }
}

/// Greedy tick-based scheduler: at each tick, start every applicable
/// grounded action not already in flight, then advance to the next
/// completion. See the module doc for the in-flight guard this
/// implementation applies from the start.
pub fn find_temporal_plan(
    ground_actions: &[GroundAction],
    problem: &Problem,
) -> Result<TemporalPlan, PlanError> {
    let mut state: BTreeSet<(String, Vec<String>)> = problem
        .init_atoms
        .iter()
        .map(|a| (a.pred.clone(), a.args.clone()))
        .collect();
    let mut fn_vals = problem.init_fn_values.clone();
    let goal_ok = |state: &BTreeSet<(String, Vec<String>)>| {
        problem
            .goal
            .iter()
            .all(|g| state.contains(&(g.pred.clone(), g.args.clone())))
    };

    let mut steps: Vec<PlanStep> = Vec::new();
    let mut current_time = 0.0_f64;
    let mut pending: Vec<(f64, usize)> = Vec::new();

    for _iteration in 0..MAX_PLAN_DEPTH {
        if goal_ok(&state) {
            let makespan = steps
                .iter()
                .map(|s| s.start_time + s.duration)
                .fold(0.0_f64, f64::max);
            return Ok(TemporalPlan { steps, makespan });
        }

        let mut started_this_tick: BTreeSet<usize> = BTreeSet::new();
        for _pass in 0..ground_actions.len().max(1) {
            let mut started_this_pass = false;
            for (i, ga) in ground_actions.iter().enumerate() {
                if started_this_tick.contains(&i) {
                    continue;
                }
                // In-flight guard (see module doc): an instance already
                // pending must not be started again against itself.
                if pending.iter().any(|(_, idx)| *idx == i) {
                    continue;
                }

                let applicable = ga
                    .conditions
                    .iter()
                    .filter(|t| !t.at_end)
                    .all(|t| eval_condition(&t.inner, &state, &fn_vals));
                if !applicable {
                    continue;
                }

                for t in ga.effects.iter().filter(|t| !t.at_end) {
                    apply_effect(&t.inner, &mut state, &mut fn_vals);
                }
                steps.push(PlanStep {
                    start_time: current_time,
                    duration: ga.duration,
                    action_name: ga.schema_name.clone(),
                    args: ga.args.clone(),
                });
                pending.push((current_time + ga.duration, i));
                started_this_tick.insert(i);
                started_this_pass = true;
            }
            if !started_this_pass {
                break;
            }
        }

        if let Some(min_pos) = pending
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(p, _)| p)
        {
            let (end, idx) = pending.remove(min_pos);
            current_time = end;
            for t in ground_actions[idx].effects.iter().filter(|t| t.at_end) {
                apply_effect(&t.inner, &mut state, &mut fn_vals);
            }
        } else if started_this_tick.is_empty() {
            break;
        }
    }

    if goal_ok(&state) {
        let makespan = steps
            .iter()
            .map(|s| s.start_time + s.duration)
            .fold(0.0_f64, f64::max);
        return Ok(TemporalPlan { steps, makespan });
    }
    Err(PlanError::NoPlanFound)
}
