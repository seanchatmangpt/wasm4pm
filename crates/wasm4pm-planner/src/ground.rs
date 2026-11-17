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
    /// A durative action's `at end` condition did not hold at the action's
    /// end tick. The witness names the action schema and the tick.
    AtEndConditionFailed { action: String, tick: f64 },
    /// A durative action's at-start condition did not hold at its start tick.
    StartConditionFailed { action: String, tick: f64 },
    /// Two overlapping durative actions write a shared atom where at least
    /// one write is a delete (interference).
    ConcurrentEffectConflict {
        first: String,
        second: String,
        atom: String,
    },
    /// A plan step carried a non-finite time.
    NonFiniteTime { action: String, field: &'static str },
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
            PlanError::AtEndConditionFailed { action, tick } => write!(
                f,
                "at-end condition of action {action:?} failed at tick {tick}"
            ),
            PlanError::StartConditionFailed { action, tick } => write!(
                f,
                "at-start condition of action {action:?} failed at tick {tick}"
            ),
            PlanError::ConcurrentEffectConflict {
                first,
                second,
                atom,
            } => write!(
                f,
                "concurrent actions {first:?} and {second:?} conflict on atom ({atom})"
            ),
            PlanError::NonFiniteTime { action, field } => {
                write!(f, "plan step {action:?} has non-finite {field} time")
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
    let goal_ok = |state: &BTreeSet<(String, Vec<String>)>,
                   fn_vals: &HashMap<String, f64>| {
        problem
            .goal
            .iter()
            .all(|g| eval_condition(g, state, fn_vals))
    };

    let mut steps: Vec<PlanStep> = Vec::new();
    let mut current_time = 0.0_f64;
    let mut pending: Vec<(f64, usize)> = Vec::new();

    for _iteration in 0..MAX_PLAN_DEPTH {
        if goal_ok(&state, &fn_vals) {
            let makespan = steps
                .iter()
                .map(|s| s.start_time + s.duration)
                .fold(0.0_f64, f64::max);
            let plan = TemporalPlan { steps, makespan };
            validate_temporal_plan(ground_actions, problem, &plan)?;
            return Ok(plan);
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
            // At-end conditions are validated at the action's end tick,
            // before its persistent effects land (soundness fix).
            let ga = &ground_actions[idx];
            let at_end_ok = ga
                .conditions
                .iter()
                .filter(|t| t.at_end)
                .all(|t| eval_condition(&t.inner, &state, &fn_vals));
            if !at_end_ok {
                return Err(PlanError::AtEndConditionFailed {
                    action: ga.schema_name.clone(),
                    tick: end,
                });
            }
            for t in ga.effects.iter().filter(|t| t.at_end) {
                apply_effect(&t.inner, &mut state, &mut fn_vals);
            }
        } else if started_this_tick.is_empty() {
            break;
        }
    }

    if goal_ok(&state, &fn_vals) {
        let makespan = steps
            .iter()
            .map(|s| s.start_time + s.duration)
            .fold(0.0_f64, f64::max);
        let plan = TemporalPlan { steps, makespan };
        validate_temporal_plan(ground_actions, problem, &plan)?;
        return Ok(plan);
    }
    Err(PlanError::NoPlanFound)
}

/// Affected atoms of a grounded action: every atom written by any of its
/// (start- or end-timed) add/delete effects.
fn affected_atoms(ga: &GroundAction) -> BTreeSet<(String, Vec<String>)> {
    ga.effects
        .iter()
        .filter_map(|t| match &t.inner {
            Effect::Add(a) | Effect::Del(a) => Some((a.pred.clone(), a.args.clone())),
            Effect::Increase(..) | Effect::Decrease(..) => None,
        })
        .collect()
}

/// Validate a candidate plan against the grounded domain: replay every step
/// in time order (ends before starts at the same tick, matching the
/// scheduler's overlap semantics), check at-start and at-end conditions at
/// their ticks, and reject concurrent-step interference (overlapping
/// effect windows writing a shared atom where at least one write is a
/// delete). Returns the named violation on failure.
///
/// # Errors
/// The first violated condition, a concurrent delete-vs-use conflict, or a
/// non-finite step time, as a typed [`PlanError`] witness.
pub fn validate_temporal_plan(
    ground_actions: &[GroundAction],
    problem: &Problem,
    plan: &TemporalPlan,
) -> Result<(), PlanError> {
    let mut lookup: HashMap<(&str, &Vec<String>), &GroundAction> = HashMap::new();
    for ga in ground_actions {
        lookup.insert((ga.schema_name.as_str(), &ga.args), ga);
    }

    // Concurrent-interference check: overlap + shared affected atom with at
    // least one delete among the two writers.
    let mut effects_by_step: Vec<BTreeSet<(String, Vec<String>)>> = Vec::with_capacity(plan.steps.len());
    for step in &plan.steps {
        if !step.start_time.is_finite() {
            return Err(PlanError::NonFiniteTime {
                action: step.action_name.clone(),
                field: "start",
            });
        }
        if !step.duration.is_finite() {
            return Err(PlanError::NonFiniteTime {
                action: step.action_name.clone(),
                field: "duration",
            });
        }
        let ga = lookup
            .get(&(step.action_name.as_str(), &step.args))
            .ok_or_else(|| PlanError::NoPlanFound)?;
        effects_by_step.push(affected_atoms(ga));
    }
    for i in 0..plan.steps.len() {
        for j in (i + 1)..plan.steps.len() {
            let (a, b) = (&plan.steps[i], &plan.steps[j]);
            let a_end = a.start_time + a.duration;
            let b_end = b.start_time + b.duration;
            let overlaps = a.start_time < b_end && b.start_time < a_end;
            if !overlaps {
                continue;
            }
            for atom in effects_by_step[i].intersection(&effects_by_step[j]) {
                let deletes = writes_delete(&plan.steps[i], &lookup, atom)
                    || writes_delete(&plan.steps[j], &lookup, atom);
                if deletes {
                    return Err(PlanError::ConcurrentEffectConflict {
                        first: format!("{}{:?}", a.action_name, a.args),
                        second: format!("{}{:?}", b.action_name, b.args),
                        atom: format!("{}{:?}", atom.0, atom.1),
                    });
                }
            }
        }
    }

    // Replay: order events by tick; at equal ticks all ends precede starts
    // (a step ending at t frees the state for a step starting at t).
    #[derive(PartialEq)]
    enum EventKind {
        End,
        Start,
    }
    let mut events: Vec<(f64, EventKind, usize)> = Vec::new();
    for (i, step) in plan.steps.iter().enumerate() {
        events.push((step.start_time, EventKind::Start, i));
        events.push((step.start_time + step.duration, EventKind::End, i));
    }
    events.sort_by(|x, y| {
        x.0.partial_cmp(&y.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| match (&x.1, &y.1) {
                (EventKind::End, EventKind::Start) => std::cmp::Ordering::Less,
                (EventKind::Start, EventKind::End) => std::cmp::Ordering::Greater,
                _ => std::cmp::Ordering::Equal,
            })
    });

    let mut state: BTreeSet<(String, Vec<String>)> = problem
        .init_atoms
        .iter()
        .map(|a| (a.pred.clone(), a.args.clone()))
        .collect();
    let mut fn_vals = problem.init_fn_values.clone();

    for (tick, kind, idx) in events {
        let step = &plan.steps[idx];
        let ga = lookup
            .get(&(step.action_name.as_str(), &step.args))
            .copied()
            .ok_or_else(|| PlanError::NoPlanFound)?;
        if matches!(kind, EventKind::End) {
            let at_end_ok = ga
                .conditions
                .iter()
                .filter(|t| t.at_end)
                .all(|t| eval_condition(&t.inner, &state, &fn_vals));
            if !at_end_ok {
                return Err(PlanError::AtEndConditionFailed {
                    action: step.action_name.clone(),
                    tick,
                });
            }
            for t in ga.effects.iter().filter(|t| t.at_end) {
                apply_effect(&t.inner, &mut state, &mut fn_vals);
            }
        } else {
            let at_start_ok = ga
                .conditions
                .iter()
                .filter(|t| !t.at_end)
                .all(|t| eval_condition(&t.inner, &state, &fn_vals));
            if !at_start_ok {
                return Err(PlanError::StartConditionFailed {
                    action: step.action_name.clone(),
                    tick,
                });
            }
            for t in ga.effects.iter().filter(|t| !t.at_end) {
                apply_effect(&t.inner, &mut state, &mut fn_vals);
            }
        }
    }

    let goal_ok = problem
        .goal
        .iter()
        .all(|g| eval_condition(g, &state, &fn_vals));
    if !goal_ok {
        return Err(PlanError::NoPlanFound);
    }
    Ok(())
}

fn writes_delete(
    step: &PlanStep,
    lookup: &HashMap<(&str, &Vec<String>), &GroundAction>,
    atom: &(String, Vec<String>),
) -> bool {
    lookup
        .get(&(step.action_name.as_str(), &step.args))
        .map(|ga| {
            ga.effects.iter().any(|t| match &t.inner {
                Effect::Del(a) => a.pred == atom.0 && a.args == atom.1,
                _ => false,
            })
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::{domain_from_pddl, problem_from_pddl};

    fn plan_for(domain_text: &str, problem_text: &str) -> Result<TemporalPlan, PlanError> {
        let domain = domain_from_pddl(domain_text).expect("domain parses");
        let problem = problem_from_pddl(problem_text).expect("problem parses");
        let ground = ground_domain(&domain, &problem).expect("grounds");
        find_temporal_plan(&ground, &problem)
    }

    const AT_END_DOMAIN: &str = r#"
(define (domain d)
  (:requirements :durative-actions :numeric-fluents)
  (:predicates (done) (gate))
  (:durative-action work
    :parameters ()
    :duration (= ?duration 5)
    :condition (and (at start (gate)) (at end (gate)))
    :effect (and (at start (not (gate))) (at end (done)))))"#;

    #[test]
    fn unmet_at_end_condition_rejects_plan() {
        // `gate` is deleted at start, so the at-end (gate) cannot hold.
        // Before the soundness fix this plan was accepted; now it is invalid
        // with a witness naming the action and tick.
        let problem = r#"(define (problem p)
  (:domain d)
  (:objects)
  (:init (gate))
  (:goal (done)))"#;
        let err = plan_for(AT_END_DOMAIN, problem).expect_err("plan must be refused");
        match err {
            PlanError::AtEndConditionFailed { action, tick } => {
                assert_eq!(action, "work");
                assert!((tick - 5.0).abs() < 1e-9);
            }
            other => panic!("expected AtEndConditionFailed, got {other:?}"),
        }
    }

    #[test]
    fn met_at_end_condition_admits_plan() {
        let domain = r#"
(define (domain d)
  (:requirements :durative-actions :numeric-fluents)
  (:predicates (done) (gate))
  (:durative-action work
    :parameters ()
    :duration (= ?duration 5)
    :condition (at start (gate))
    :effect (and (at end (done)) (at end (gate)))))"#;
        let problem = r#"(define (problem p)
  (:domain d)
  (:objects)
  (:init (gate))
  (:goal (done)))"#;
        plan_for(domain, problem).expect("plan valid when at-end condition holds");
    }

    #[test]
    fn conflicting_concurrent_deletes_rejected() {
        // Two distinct schemas both delete (res) at start: their effect
        // windows overlap on a shared atom with a delete -> conflict. (The
        // in-flight guard already prevents double-starting one instance, so
        // two schemas are required to expose the interference check.)
        let domain = r#"
(define (domain d)
  (:requirements :durative-actions :numeric-fluents)
  (:predicates (res) (done))
  (:durative-action work1
    :parameters ()
    :duration (= ?duration 5)
    :effect (and (at start (not (res))) (at end (done))))
  (:durative-action work2
    :parameters ()
    :duration (= ?duration 5)
    :effect (and (at start (not (res))) (at end (done)))))"#;
        let problem_text = r#"(define (problem p)
  (:domain d)
  (:objects)
  (:init (res))
  (:goal (done)))"#;
        let err = plan_for(domain, problem_text).expect_err("conflict must be refused");
        assert!(
            matches!(err, PlanError::ConcurrentEffectConflict { .. }),
            "got {err}"
        );
    }

    #[test]
    fn negative_goal_enforced() {
        // Goal (not (bad)) with nothing able to delete (bad): unreachable.
        let domain = r#"
(define (domain d)
  (:requirements :durative-actions)
  (:predicates (bad) (done))
  (:durative-action noop
    :parameters ()
    :duration (= ?duration 1)
    :effect (at end (done))))"#;
        let problem = r#"(define (problem p)
  (:domain d)
  (:objects)
  (:init (bad))
  (:goal (not (bad))))"#;
        let err = plan_for(domain, problem).expect_err("negative goal must be enforced");
        assert_eq!(err, PlanError::NoPlanFound);
    }

    #[test]
    fn negative_goal_satisfied_by_delete() {
        let domain = r#"
(define (domain d)
  (:requirements :durative-actions)
  (:predicates (bad) (done))
  (:durative-action clean
    :parameters ()
    :duration (= ?duration 1)
    :effect (and (at end (not (bad))) (at end (done)))))"#;
        let problem = r#"(define (problem p)
  (:domain d)
  (:objects)
  (:init (bad))
  (:goal (not (bad))))"#;
        plan_for(domain, problem).expect("clean deletes bad, satisfying the negative goal");
    }

    #[test]
    fn numeric_fluent_goal_evaluated() {
        let domain = r#"
(define (domain d)
  (:requirements :durative-actions :numeric-fluents)
  (:functions (charge))
  (:durative-action drain
    :parameters ()
    :duration (= ?duration 1)
    :effect (at end (decrease (charge) 1))))"#;
        // charge must fall to <= 1: two drains (3 -> 2 -> 1) required.
        let problem = r#"(define (problem p)
  (:domain d)
  (:objects)
  (:init (= (charge) 3))
  (:goal (<= (charge) 1)))"#;
        let plan = plan_for(domain, problem).expect("numeric goal evaluated, not ignored");
        assert_eq!(plan.steps.len(), 2);
    }

    #[test]
    fn validation_flags_nonfinite_times() {
        let domain = domain_from_pddl(AT_END_DOMAIN).unwrap();
        let problem = problem_from_pddl(
            r#"(define (problem p) (:domain d) (:objects) (:init (gate)) (:goal (done)))"#,
        )
        .unwrap();
        let ground = ground_domain(&domain, &problem).unwrap();
        let plan = TemporalPlan {
            steps: vec![PlanStep {
                start_time: f64::NAN,
                duration: 5.0,
                action_name: "work".to_string(),
                args: vec![],
            }],
            makespan: 5.0,
        };
        let err = validate_temporal_plan(&ground, &problem, &plan).expect_err("NaN refused");
        assert!(matches!(err, PlanError::NonFiniteTime { .. }), "got {err}");
    }
}
