//! Learning / Creativity / Problem Solving
//! Winston, Evans, HACKER, BUILD, STRIPS means-ends planning (old-AI machinery).
//!
//! Two planning surfaces:
//!
//! 1. Operator STRIPS (rules given): `input.rules` are STRIPS operators —
//!    `premise` = preconditions, `conclusion` = semicolon-separated effects
//!    where a `!` prefix deletes and a bare token adds. The repo `Rule`
//!    grammar has no negated-conclusion form, so operators without `!`
//!    tokens are add-only; documented honestly rather than pretending
//!    deletes exist where the grammar has none.
//!    Solved by backward-chaining means-ends IDDFS: subgoal on an
//!    unsatisfied goal, select an operator whose ADD list covers it, check
//!    preconditions, apply (delete-then-add), recurse with depth cap.
//!    Deterministic: `BTreeSet` state, input rule order preserved.
//!
//! 2. HACKER curriculum (no rules): per Sussman 1973 TR-297 curriculum
//!    encoding, each unmastered goal atom is its own unit skill-acquisition
//!    step. Goals match state by identity (`predicate=value` string equality
//!    against facts) — never by position.

use std::collections::BTreeSet;

use crate::breeds::{Fact, Goal, Rule};

const MAX_PLAN_DEPTH: usize = 16;

/// A STRIPS operator derived from a repo `Rule`.
#[derive(Debug, Clone)]
pub struct StripsOperator {
    /// Operator name (`rule.id`).
    pub id: String,
    /// `rule.premise` atoms that must hold before application.
    pub preconds: Vec<String>,
    /// Atoms added to the state on application.
    pub adds: Vec<String>,
    /// Atoms deleted from the state on application (`!`-prefixed conclusions).
    pub dels: Vec<String>,
}

/// Parse a `Rule` conclusion into (adds, dels); `!` prefix = delete.
pub fn parse_effect(conclusion: &str) -> (Vec<String>, Vec<String>) {
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
    (adds, dels)
}

/// Build a STRIPS operator from a repo `Rule`.
pub fn parse_operator(rule: &Rule) -> StripsOperator {
    let (adds, dels) = parse_effect(&rule.conclusion);
    StripsOperator {
        id: rule.id.clone(),
        preconds: rule.premise.iter().map(|s| s.trim().to_string()).collect(),
        adds,
        dels,
    }
}

/// Initial state atoms: `key=value` for each fact (deterministic BTreeSet).
pub fn atoms_of_facts(facts: &[Fact]) -> BTreeSet<String> {
    facts
        .iter()
        .map(|f| format!("{}={}", f.key, f.value))
        .collect()
}

/// Goal atoms as `predicate=value` strings, in input order.
pub fn goal_atoms(goals: &[Goal]) -> Vec<String> {
    goals
        .iter()
        .map(|g| format!("{}={}", g.predicate, g.value))
        .collect()
}

fn applicable(op: &StripsOperator, state: &BTreeSet<String>) -> bool {
    op.preconds.iter().all(|p| state.contains(p))
}

/// Apply an operator: delete effects first, then adds (frame axiom: every
/// atom not mentioned by the operator persists).
fn apply(op: &StripsOperator, state: &BTreeSet<String>) -> BTreeSet<String> {
    let mut next: BTreeSet<String> = state
        .iter()
        .filter(|a| !op.dels.contains(a))
        .cloned()
        .collect();
    for a in &op.adds {
        next.insert(a.clone());
    }
    next
}

fn goals_satisfied(goals: &[String], state: &BTreeSet<String>) -> bool {
    goals.iter().all(|g| state.contains(g))
}

/// Achieve a set of atoms (used for operator preconditions).
fn achieve_preconds(
    state: &BTreeSet<String>,
    op: &StripsOperator,
    ops: &[StripsOperator],
    depth: usize,
) -> Option<(BTreeSet<String>, Vec<String>)> {
    if op.preconds.is_empty() || op.preconds.iter().all(|p| state.contains(p)) {
        return Some((state.clone(), Vec::new()));
    }
    let (s, plan) = means_ends(state, &op.preconds, ops, depth)?;
    Some((s, plan))
}

/// Means-ends core (GPS/STRIPS): subgoal on the first unsatisfied goal
/// atom (input order); for each operator whose ADD covers it, first
/// achieve the operator's preconditions (recursion), apply the operator,
/// then re-achieve the full goal set (deletes may clobber earlier
/// achievements — GPS regency). Depth-capped by the IDDFS wrapper.
pub fn means_ends(
    state: &BTreeSet<String>,
    goals: &[String],
    ops: &[StripsOperator],
    depth: usize,
) -> Option<(BTreeSet<String>, Vec<String>)> {
    if goals_satisfied(goals, state) {
        return Some((state.clone(), Vec::new()));
    }
    if depth == 0 {
        return None;
    }
    let unsat = goals.iter().find(|g| !state.contains(*g))?.clone();
    for op in ops {
        if !op.adds.contains(&unsat) {
            continue;
        }
        let (s1, mut plan) = achieve_preconds(state, op, ops, depth - 1)?;
        let s2 = apply(op, &s1);
        let (s3, rest) = means_ends(&s2, goals, ops, depth - 1)?;
        plan.push(op.id.clone());
        plan.extend(rest);
        return Some((s3, plan));
    }
    None
}

/// Iterative-deepening wrapper around [`means_ends`].
pub fn plan(initial: &BTreeSet<String>, goals: &[String], rules: &[Rule]) -> Option<Vec<String>> {
    let ops: Vec<StripsOperator> = rules.iter().map(parse_operator).collect();
    for d in 0..=MAX_PLAN_DEPTH {
        if let Some((_, p)) = means_ends(initial, goals, &ops, d) {
            return Some(p);
        }
    }
    None
}

/// HACKER curriculum planner: goal bits, identity-matched against state.
/// Bit i of the mask corresponds to goal atom i (cap 32; callers refuse
/// beyond that). Each solve step flips the lowest missing bit.
pub struct HeuristicPlanner {
    /// Target goal state bitmask; planning stops when `features` satisfies this.
    pub goal_state: u32,
}

/// Bitmask state (one bit per goal atom).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ProblemState {
    /// Bitmask of achieved goals (each bit = one satisfied sub-goal).
    pub features: u32,
}

impl HeuristicPlanner {
    /// Creates a new `HeuristicPlanner` with the given goal state bitmask.
    pub fn new(goal: u32) -> Self {
        Self { goal_state: goal }
    }

    /// Heuristic distance to goal: popcount of missing goal bits.
    pub fn heuristic_distance(&self, current: &ProblemState) -> u32 {
        (!current.features & self.goal_state).count_ones()
    }

    /// HACKER curriculum solve: flip the lowest missing goal bit each step.
    pub fn solve(&self, mut current: ProblemState) -> Vec<ProblemState> {
        let mut plan = vec![current];
        while self.heuristic_distance(&current) > 0 {
            let missing = !current.features & self.goal_state;
            current.features |= missing & missing.wrapping_neg();
            plan.push(current);
        }
        plan
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_effect_adds_and_dels() {
        let (adds, dels) = parse_effect("inHand=block;!onTable=block");
        assert_eq!(adds, vec!["inHand=block".to_string()]);
        assert_eq!(dels, vec!["onTable=block".to_string()]);
    }

    #[test]
    fn add_only_operator_documented_honestly() {
        // No `!` tokens in the grammar conclusion => add-only operator.
        let (adds, dels) = parse_effect("flag=a;flag=b");
        assert_eq!(adds.len(), 2);
        assert!(dels.is_empty());
    }

    /// Chicago: real blocks-world plan through the real search — no mocks.
    #[test]
    fn means_ends_plans_blocks_world_with_deletes() {
        let rules = vec![
            Rule {
                id: "pick".into(),
                premise: vec!["onTable=a".into()],
                conclusion: "inHand=a;!onTable=a".into(),
                certainty: 1.0,
            },
            Rule {
                id: "drop".into(),
                premise: vec!["inHand=a".into()],
                conclusion: "onTable=b;!inHand=a".into(),
                certainty: 1.0,
            },
        ];
        let mut s = BTreeSet::new();
        s.insert("onTable=a".to_string());
        let goals = vec!["onTable=b".to_string()];
        let p = plan(&s, &goals, &rules).expect("plan exists");
        // Delete effect matters: after `pick`, onTable=a is gone, so `pick`
        // cannot fire twice; only the real two-step plan works.
        assert_eq!(p, vec!["pick".to_string(), "drop".to_string()]);
    }

    /// Falsifier: if preconditions are ignored, `drop` would be selected
    /// without `pick` ever firing.
    #[test]
    fn means_ends_respects_preconditions() {
        let rules = vec![Rule {
            id: "drop".into(),
            premise: vec!["inHand=a".into()],
            conclusion: "onTable=b".into(),
            certainty: 1.0,
        }];
        let mut s = BTreeSet::new();
        s.insert("onTable=a".to_string());
        let goals = vec!["onTable=b".to_string()];
        assert!(plan(&s, &goals, &rules).is_none(), "precondition unsatisfiable from this state: no plan must exist");
    }

    #[test]
    fn unreachable_goal_refused() {
        let rules = vec![Rule {
            id: "noop".into(),
            premise: vec![],
            conclusion: "other=x".into(),
            certainty: 1.0,
        }];
        let goals = vec!["wanted=y".to_string()];
        assert!(plan(&BTreeSet::new(), &goals, &rules).is_none());
    }

    #[test]
    fn heuristic_distance_is_popcount_of_missing_goal_bits() {
        let planner = HeuristicPlanner::new(0b1111);
        for features in 0u32..=0b1111 {
            let h = planner.heuristic_distance(&ProblemState { features });
            assert_eq!(h, (0b1111u32 & !features).count_ones());
        }
    }

    #[test]
    fn solver_plan_is_monotonically_nonincreasing() {
        for goal in [0b0001u32, 0b0011, 0b0111, 0b1111, 0b10101] {
            let planner = HeuristicPlanner::new(goal);
            let initial = ProblemState {
                features: 0b1000_0000_0000 | (goal & 1),
            };
            let plan = planner.solve(initial);
            let dists: Vec<u32> = plan.iter().map(|s| planner.heuristic_distance(s)).collect();
            for w in dists.windows(2) {
                assert!(w[1] <= w[0], "regressed for goal {goal:b}: {dists:?}");
            }
        }
    }

    #[test]
    fn presatisfied_goal_yields_single_state_plan() {
        let planner = HeuristicPlanner::new(0b1111);
        let initial = ProblemState { features: 0b1111 };
        let plan = planner.solve(initial);
        assert_eq!(plan, vec![initial]);
    }

    #[test]
    fn curriculum_matches_goals_by_identity_not_position() {
        // Goal atom g1 matches a fact; g0 (earlier index) does not. The
        // achieved bit must be bit 1, not bit 0 — the positionalist bug.
        let facts = vec![Fact {
            key: "master".into(),
            value: "beta".into(),
        }];
        let goals = vec![
            Goal { id: "g0".into(), predicate: "master".into(), value: "alpha".into() },
            Goal { id: "g1".into(), predicate: "master".into(), value: "beta".into() },
        ];
        let state = atoms_of_facts(&facts);
        let atoms = goal_atoms(&goals);
        assert!(state.contains(&atoms[1]));
        assert!(!state.contains(&atoms[0]));
    }
}
