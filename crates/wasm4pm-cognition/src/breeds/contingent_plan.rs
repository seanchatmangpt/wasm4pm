//! Contingent planning: AND-OR search over belief states with sensing actions
//! (Russell & Norvig, AIMA 3rd ed. §4.3.2 — searching with nondeterministic
//! actions / partial observability; vacuum-world AND-OR example).
//!
//! Facts:
//! - `cp:unknown` — comma list of unknown atoms (≤ 4 → ≤ 16 initial worlds)
//! - `cp:init:<atom>` = `true`/`false` — known initial atoms
//! - `cp:goal:<atom>` = `true`/`false` — goal literals (all must hold)
//! - `cp:act:<name>:pre` / `:add` / `:del` — physical action (lits `a` / `!a`)
//! - `cp:sense:<name>` = `<atom>` — sensing action splitting the belief
//!
//! Belief state = set of possible worlds (BTreeMap atom→bool, missing=false).
//! OR nodes choose an action (physical actions must be applicable in EVERY
//! world); sensing splits the belief into the atom-true and atom-false belief
//! halves, BOTH of which must reach the goal (AND node). Depth ≤ 12, belief
//! cycle check on the path. If no plan exists (e.g. the belief is uncertain
//! and no sensing action can split it), the breed REFUSES — it never emits a
//! linear plan that only works in some worlds.
//!
//! Plan tree serialization (fact `plan:tree`, replayable s-expression):
//!   `(act <name> <sub>)` | `(sense <name> <atom> <then> <else>)` | `(done)`

use crate::breeds::support::breed_class::PlannerBreed;
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// AND-OR contingent planner over belief states.
pub struct ContingentPlan;

const MAX_UNKNOWN: usize = 4;
const MAX_DEPTH: usize = 12;

type World = BTreeMap<String, bool>;
type Belief = BTreeSet<World>;

#[derive(Debug, Clone)]
struct Action {
    name: String,
    pre: Vec<(String, bool)>,
    add: Vec<String>,
    del: Vec<String>,
}

#[derive(Debug, Clone)]
enum PlanNode {
    Done,
    Act(String, Box<PlanNode>),
    Sense(String, String, Box<PlanNode>, Box<PlanNode>),
}

impl std::fmt::Display for PlanNode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlanNode::Done => write!(f, "(done)"),
            PlanNode::Act(n, sub) => write!(f, "(act {} {})", n, sub),
            PlanNode::Sense(n, atom, t, e) => write!(f, "(sense {} {} {} {})", n, atom, t, e),
        }
    }
}

impl PlanNode {
    fn serialize(&self) -> String {
        self.to_string()
    }
}

fn parse_lits(s: &str) -> Vec<(String, bool)> {
    s.split(',')
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| match l.strip_prefix('!') {
            Some(a) => (a.to_string(), false),
            None => (l.to_string(), true),
        })
        .collect()
}

fn parse_atoms(s: &str) -> Vec<String> {
    s.split(',')
        .map(|a| a.trim().to_string())
        .filter(|a| !a.is_empty())
        .collect()
}

struct Problem {
    unknown: Vec<String>,
    init: Vec<(String, bool)>,
    goal: Vec<(String, bool)>,
    actions: Vec<Action>,
    senses: Vec<(String, String)>, // (name, atom)
}

fn parse_problem(input: &BreedInput) -> Result<Problem, String> {
    let mut unknown = Vec::new();
    let mut init = Vec::new();
    let mut goal = Vec::new();
    let mut act_parts: BTreeMap<String, (Vec<(String, bool)>, Vec<String>, Vec<String>)> =
        BTreeMap::new();
    let mut senses = Vec::new();
    for f in &input.facts {
        if f.key == "cp:unknown" {
            unknown = parse_atoms(&f.value);
        } else if let Some(atom) = f.key.strip_prefix("cp:init:") {
            let v = f.value == "true";
            init.push((atom.to_string(), v));
        } else if let Some(atom) = f.key.strip_prefix("cp:goal:") {
            let v = f.value == "true";
            goal.push((atom.to_string(), v));
        } else if let Some(rest) = f.key.strip_prefix("cp:act:") {
            if let Some((name, part)) = rest.rsplit_once(':') {
                let entry = act_parts.entry(name.to_string()).or_default();
                match part {
                    "pre" => entry.0 = parse_lits(&f.value),
                    "add" => entry.1 = parse_atoms(&f.value),
                    "del" => entry.2 = parse_atoms(&f.value),
                    _ => return Err(format!("unknown action part '{}' in '{}'", part, f.key)),
                }
            }
        } else if let Some(name) = f.key.strip_prefix("cp:sense:") {
            senses.push((name.to_string(), f.value.clone()));
        }
    }
    if goal.is_empty() {
        return Err("contingent_plan requires at least one 'cp:goal:<atom>' fact".to_string());
    }
    if unknown.len() > MAX_UNKNOWN {
        return Err(format!("more than {} unknown atoms — refused", MAX_UNKNOWN));
    }
    let actions: Vec<Action> = act_parts
        .into_iter()
        .map(|(name, (pre, add, del))| Action {
            name,
            pre,
            add,
            del,
        })
        .collect();
    if actions.is_empty() && senses.is_empty() {
        return Err("no actions defined".to_string());
    }
    senses.sort();
    goal.sort();
    init.sort();
    unknown.sort();
    Ok(Problem {
        unknown,
        init,
        goal,
        actions,
        senses,
    })
}

fn holds(world: &World, atom: &str, val: bool) -> bool {
    world.get(atom).copied().unwrap_or(false) == val
}

fn goal_satisfied(belief: &Belief, goal: &[(String, bool)]) -> bool {
    belief
        .iter()
        .all(|w| goal.iter().all(|(a, v)| holds(w, a, *v)))
}

fn apply(world: &World, act: &Action) -> World {
    let mut w = world.clone();
    for d in &act.del {
        w.insert(d.clone(), false);
    }
    for a in &act.add {
        w.insert(a.clone(), true);
    }
    w
}

struct Search<'a> {
    p: &'a Problem,
    trace: Vec<TraceStep>,
}

impl<'a> Search<'a> {
    fn push(&mut self, kind: &str, detail: String, depth: u32) {
        self.trace.push(TraceStep {
            step: self.trace.len(),
            kind: kind.to_string(),
            detail,
            depth,
            objects: vec![],
        });
    }

    fn or_search(
        &mut self,
        belief: &Belief,
        depth: usize,
        path: &mut Vec<Belief>,
    ) -> Option<PlanNode> {
        if goal_satisfied(belief, &self.p.goal) {
            self.push(
                "goal-reached",
                format!("{} world(s) satisfy the goal", belief.len()),
                depth as u32,
            );
            return Some(PlanNode::Done);
        }
        if depth >= MAX_DEPTH || path.contains(belief) {
            return None;
        }
        path.push(belief.clone());

        // Physical actions (sorted by name): applicable iff pre holds in EVERY world.
        for act in &self.p.actions {
            let applicable = belief
                .iter()
                .all(|w| act.pre.iter().all(|(a, v)| holds(w, a, *v)));
            self.push(
                "or-expand",
                format!(
                    "action '{}': {}",
                    act.name,
                    if applicable {
                        "applicable in all worlds"
                    } else {
                        "not applicable in all worlds"
                    }
                ),
                depth as u32,
            );
            if !applicable {
                continue;
            }
            let next: Belief = belief.iter().map(|w| apply(w, act)).collect();
            if let Some(sub) = self.or_search(&next, depth + 1, path) {
                path.pop();
                return Some(PlanNode::Act(act.name.clone(), Box::new(sub)));
            }
        }

        // Sensing actions: split the belief on the sensed atom (AND node).
        for (name, atom) in &self.p.senses {
            let b_true: Belief = belief
                .iter()
                .filter(|w| holds(w, atom, true))
                .cloned()
                .collect();
            let b_false: Belief = belief
                .iter()
                .filter(|w| holds(w, atom, false))
                .cloned()
                .collect();
            if b_true.is_empty() || b_false.is_empty() {
                continue; // sensing is uninformative here
            }
            self.push(
                "sense-branch",
                format!(
                    "sense '{}' on '{}': {} true-world(s) / {} false-world(s)",
                    name,
                    atom,
                    b_true.len(),
                    b_false.len()
                ),
                depth as u32,
            );
            let then_plan = self.or_search(&b_true, depth + 1, path);
            let else_plan = then_plan
                .as_ref()
                .and_then(|_| self.or_search(&b_false, depth + 1, path));
            if let (Some(t), Some(e)) = (then_plan, else_plan) {
                self.push(
                    "and-join",
                    format!("both branches of '{}' on '{}' reach the goal", name, atom),
                    depth as u32,
                );
                path.pop();
                return Some(PlanNode::Sense(
                    name.clone(),
                    atom.clone(),
                    Box::new(t),
                    Box::new(e),
                ));
            }
        }

        path.pop();
        None
    }
}

impl PlannerBreed for ContingentPlan {
    fn required_trace_kinds(&self) -> &'static [&'static str] {
        &["plan-complete"]
    }
}

impl CognitionBreed for ContingentPlan {
    fn id(&self) -> BreedId {
        BreedId::ContingentPlan
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "and_or_belief_search".to_string(),
            "sensing_actions".to_string(),
            "conditional_plan_trees".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        parse_problem(input).map(|_| ())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: BreedId::ContingentPlan,
            message: m,
        };
        let p = parse_problem(input).map_err(err)?;

        // Initial belief: known atoms fixed, every assignment of the unknowns.
        let mut belief: Belief = BTreeSet::new();
        let u = p.unknown.len();
        for mask in 0..(1usize << u) {
            let mut w: World = BTreeMap::new();
            for (a, v) in &p.init {
                w.insert(a.clone(), *v);
            }
            for (i, a) in p.unknown.iter().enumerate() {
                w.insert(a.clone(), mask & (1 << i) != 0);
            }
            belief.insert(w);
        }

        let mut search = Search {
            p: &p,
            trace: Vec::new(),
        };
        search.push(
            "init-belief",
            format!("{} possible world(s), {} unknown atom(s)", belief.len(), u),
            0,
        );

        let mut path = Vec::new();
        let plan = search.or_search(&belief, 0, &mut path);
        let mut trace = search.trace;

        let plan = plan.ok_or_else(|| {
            err(
                "no contingent plan exists (a linear plan valid in only some worlds is refused)"
                    .to_string(),
            )
        })?;

        let serialized = plan.serialize();
        trace.push(TraceStep {
            step: trace.len(),
            kind: "plan-complete".to_string(),
            detail: serialized.clone(),
            depth: 0,
            objects: vec![],
        });

        let facts = vec![Fact {
            key: "plan:tree".to_string(),
            value: serialized.clone(),
        }];

        Ok(BreedOutput {
            breed: BreedId::ContingentPlan,
            candidates: input.candidates.clone(),
            facts,
            explanation: format!(
                "Contingent plan over {} initial world(s): {}",
                belief.len(),
                serialized
            ),
            selected: Some(serialized),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        self.assert_plan_trace_complete(output)?;
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["plan-complete"])?;
        if !output.facts.iter().any(|f| f.key == "plan:tree") {
            return Err("missing plan:tree fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(k: &str, v: &str) -> Fact {
        Fact {
            key: k.into(),
            value: v.into(),
        }
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "plan".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// AIMA-style vacuum: dirt is unknown; suck requires knowing there IS dirt.
    fn vacuum() -> Vec<Fact> {
        vec![
            fact("cp:unknown", "dirt"),
            fact("cp:goal:dirt", "false"),
            fact("cp:act:suck:pre", "dirt"),
            fact("cp:act:suck:del", "dirt"),
            fact("cp:sense:check-dirt", "dirt"),
        ]
    }

    #[test]
    fn vacuum_plan_has_exactly_one_sense_node() {
        let out = ContingentPlan.run(&input(vacuum())).expect("run ok");
        let tree = out.facts.iter().find(|f| f.key == "plan:tree").unwrap();
        assert_eq!(
            tree.value,
            "(sense check-dirt dirt (act suck (done)) (done))"
        );
        assert_eq!(tree.value.matches("(sense ").count(), 1);
    }

    #[test]
    fn without_sensing_must_refuse_not_emit_linear_plan() {
        let facts: Vec<Fact> = vacuum()
            .into_iter()
            .filter(|f| !f.key.starts_with("cp:sense:"))
            .collect();
        let res = ContingentPlan.run(&input(facts));
        assert!(res.is_err(), "uncertain belief with no sensing must refuse");
    }

    #[test]
    fn fully_known_world_plans_without_sensing() {
        let facts = vec![
            fact("cp:init:dirt", "true"),
            fact("cp:goal:dirt", "false"),
            fact("cp:act:suck:pre", "dirt"),
            fact("cp:act:suck:del", "dirt"),
        ];
        let out = ContingentPlan.run(&input(facts)).expect("run ok");
        let tree = out.facts.iter().find(|f| f.key == "plan:tree").unwrap();
        assert_eq!(tree.value, "(act suck (done))");
    }

    #[test]
    fn refuses_missing_goal() {
        assert!(ContingentPlan
            .preconditions(&input(vec![fact("cp:act:a:add", "x")]))
            .is_err());
    }

    #[test]
    fn refuses_too_many_unknowns() {
        let mut f = vacuum();
        f[0].value = "a,b,c,d,e".into();
        assert!(ContingentPlan.preconditions(&input(f)).is_err());
    }

    #[test]
    fn refuses_malformed_action_part() {
        let mut f = vacuum();
        f.push(fact("cp:act:suck:invalid", "dirt"));
        assert!(ContingentPlan.preconditions(&input(f)).is_err());
    }

    #[test]
    fn falsification_gate_must_reach_goal_in_all_branches() {
        let f = vec![
            fact("cp:unknown", "A"),
            fact("cp:goal:G", "true"),
            fact("cp:sense:check-A", "A"),
            fact("cp:act:do-T:pre", "A"),
            fact("cp:act:do-T:add", "G"),
        ];
        let out = ContingentPlan.run(&input(f));
        assert!(out.is_err(), "Must refuse if else branch cannot reach goal");
    }

    #[test]
    fn invariant_already_at_goal_yields_done() {
        let f = vec![
            fact("cp:init:A", "true"),
            fact("cp:goal:A", "true"),
            fact("cp:act:dummy:add", "B"),
        ];
        let out = ContingentPlan.run(&input(f)).unwrap();
        let tree = out.facts.iter().find(|f| f.key == "plan:tree").unwrap();
        assert_eq!(tree.value, "(done)");
    }
}
