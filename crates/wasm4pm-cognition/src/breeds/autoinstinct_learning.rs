//! AutoinstinctLearning — HACKER/STRIPS means-ends planning (Sussman 1973,
//! Winston 1975; Fikes & Nilsson 1971 operator semantics).
//!
//! Two lawful paths, chosen by input shape:
//!
//! 1. **Operator STRIPS** (`input.rules` non-empty): rules are STRIPS
//!    operators (`premise` = preconditions; `conclusion` = `add1;add2;!del1`
//!    — `!` prefix deletes, bare tokens add; operators without `!` tokens are
//!    add-only because the grammar has no negated conclusion form). The plan
//!    is found by backward-chaining means-ends IDDFS
//!    ([`crate::autoinstinct::learning::plan`]): subgoal on an unsatisfied
//!    goal, select an operator whose ADD covers it, check preconditions,
//!    apply delete-then-add, recurse. The plan is then replay-verified
//!    against the initial state; an unreachable goal is refused with
//!    `no plan exists`. Initial state = `input.facts` atoms (`key=value`)
//!    plus `input.state` atoms (`predicate=value`); goals = `predicate=value`.
//!
//! 2. **HACKER curriculum** (`input.rules` empty): each unmastered goal atom
//!    is its own unit skill-acquisition step (Sussman 1973 TR-297). Goals
//!    match facts by identity (`predicate=value` string equality), never by
//!    position. Capped at 32 goals (bitmask); beyond that the breed refuses.
//!
//! Trace: `plan-step` per plan state (`state=0b.. distance=N` in curriculum
//! mode, `operator=.. distance=N` in operator mode), plus `subgoal` /
//! `select-operator` / `apply-operator` / `goal-achieved` in operator mode.
//! Refusal path: `no-plan-found` trace step, `selected = "0 steps to goal"`.

use crate::autoinstinct::learning::{
    atoms_of_facts, goal_atoms, plan, HeuristicPlanner, ProblemState,
};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, TraceStep,
};
use std::collections::BTreeSet;
use tracing;

/// AutoinstinctLearning breed: HACKER/STRIPS means-ends planning.
pub struct AutoinstinctLearning;

const MAX_CURRICULUM_GOALS: usize = 32;

impl CognitionBreed for AutoinstinctLearning {
    fn id(&self) -> BreedId {
        BreedId::AutoinstinctLearning
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "strips_planning".to_string(),
            "hacker_heuristic".to_string(),
            "means_ends_search".to_string(),
            "monotone_distance_reduction".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err(
                "AutoinstinctLearning requires at least one goal to plan toward".to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        tracing::debug!(
            breed.step = "goal_assessed",
            breed = "autoinstinct_learning",
            "L1 inference step"
        );
        if input.rules.is_empty() {
            self.run_curriculum(input)
        } else {
            self.run_operator_strips(input)
        }
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty()?;
        Ok(())
    }
}

impl AutoinstinctLearning {
    /// Path 1: operator STRIPS over `input.rules`.
    fn run_operator_strips(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut initial = atoms_of_facts(&input.facts);
        for a in &input.state {
            initial.insert(format!("{}={}", a.predicate, a.value));
        }
        let goals = goal_atoms(&input.goals);
        let mut trace: Vec<TraceStep> = Vec::new();

        let plan = crate::autoinstinct::learning::plan(&initial, &goals, &input.rules)
            .ok_or_else(|| BreedError {
            breed: BreedId::AutoinstinctLearning,
            message: format!(
                "autoinstinct_learning: no plan exists within depth cap for goals {:?}",
                goals
            ),
        })?;

        // Replay-verify against the initial state using the same operator
        // semantics the search used.
        let ops: Vec<crate::autoinstinct::learning::StripsOperator> = input
            .rules
            .iter()
            .map(crate::autoinstinct::learning::parse_operator)
            .collect();
        let mut state = initial.clone();
        let total = goals.len();
        let mut candidates: Vec<Candidate> = Vec::new();

        let unsat_now = |state: &BTreeSet<String>, goals: &[String]| {
            goals.iter().filter(|g| !state.contains(*g)).count()
        };
        trace.push(TraceStep {
            step: trace.len(),
            kind: "plan-step".to_string(),
            detail: format!(
                "state={} distance={} initial state before planning",
                atoms_joined(&state),
                unsat_now(&state, &goals)
            ),
            depth: 0,
            objects: vec![],
        });
        for (n, op_id) in plan.iter().enumerate() {
            let op = ops
                .iter()
                .find(|o| &o.id == op_id)
                .ok_or_else(|| BreedError {
                    breed: BreedId::AutoinstinctLearning,
                    message: format!("plan references unknown operator {}", op_id),
                })?;
            if !op.preconds.iter().all(|p| state.contains(p)) {
                return Err(BreedError {
                    breed: BreedId::AutoinstinctLearning,
                    message: format!("plan replay failed at operator {}", op.id),
                });
            }
            trace.push(TraceStep {
                step: trace.len(),
                kind: "select-operator".to_string(),
                detail: op.id.clone(),
                depth: (n + 1) as u32,
                objects: vec![],
            });
            tracing::debug!(
                breed.step = "operator_selected",
                breed = "autoinstinct_learning",
                "L1 inference step"
            );
            let mut next = state.clone();
            for a in &op.dels {
                next.remove(a);
            }
            for a in &op.adds {
                next.insert(a.clone());
            }
            trace.push(TraceStep {
                step: trace.len(),
                kind: "apply-operator".to_string(),
                detail: format!("{} -> {}", op.id, atoms_joined(&next)),
                depth: (n + 1) as u32,
                objects: vec![],
            });
            state = next;
            let distance = unsat_now(&state, &goals);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "plan-step".to_string(),
                detail: format!(
                    "operator={} state={} distance={} action toward goal",
                    op.id,
                    atoms_joined(&state),
                    distance
                ),
                depth: (n + 1) as u32,
                objects: vec![],
            });
            candidates.push(Candidate {
                id: format!("plan-step-{}", n),
                score: if total == 0 {
                    1.0
                } else {
                    1.0 - (distance as f32 / total as f32)
                },
                eliminated: false,
                elimination_reason: None,
            });
        }
        if !goals.iter().all(|g| state.contains(g)) {
            return Err(BreedError {
                breed: BreedId::AutoinstinctLearning,
                message: "autoinstinct_learning: goal not reached after replay".to_string(),
            });
        }
        trace.push(TraceStep {
            step: trace.len(),
            kind: "goal-achieved".to_string(),
            detail: format!("{} goals satisfied", goals.len()),
            depth: 0,
            objects: vec![],
        });

        Ok(BreedOutput {
            breed: BreedId::AutoinstinctLearning,
            candidates,
            facts: input.facts.clone(),
            selected: Some(format!("{} steps to goal", plan.len())),
            explanation: format!(
                "AutoinstinctLearning: STRIPS means-ends plan ({} steps): {}",
                plan.len(),
                plan.join(" -> ")
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    /// Path 2: HACKER curriculum (no operators — each goal is a unit
    /// skill-acquisition step, identity-matched against facts).
    fn run_curriculum(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        if input.goals.len() > MAX_CURRICULUM_GOALS {
            return Err(BreedError {
                breed: BreedId::AutoinstinctLearning,
                message: format!(
                    "autoinstinct_learning: {} goals exceed the {}-goal curriculum bitmask cap",
                    input.goals.len(),
                    MAX_CURRICULUM_GOALS
                ),
            });
        }
        let state = atoms_of_facts(&input.facts);
        let atoms = goal_atoms(&input.goals);
        // Identity matching: bit i is set iff goal atom i is already true.
        let goal_mask: u32 = atoms
            .iter()
            .enumerate()
            .map(|(i, _)| 1u32 << i)
            .fold(0u32, |acc, b| acc | b);
        let initial_features: u32 = atoms
            .iter()
            .enumerate()
            .filter(|(_, a)| state.contains(*a))
            .map(|(i, _)| 1u32 << i)
            .fold(0u32, |acc, b| acc | b);

        tracing::debug!(
            breed.step = "prerequisite_checked",
            breed = "autoinstinct_learning",
            "L1 inference step"
        );
        let planner = HeuristicPlanner::new(goal_mask);
        let initial_state = ProblemState {
            features: initial_features,
        };
        let plan_states = planner.solve(initial_state);

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut plan_candidates: Vec<Candidate> = Vec::new();
        for (n, st) in plan_states.iter().enumerate() {
            let distance = planner.heuristic_distance(st);
            trace.push(TraceStep {
                step: n,
                kind: "plan-step".to_string(),
                detail: format!(
                    "state={:#010b} distance={} action toward goal: flip next missing bit",
                    st.features, distance
                ),
                depth: 0,
                objects: vec![],
            });
            tracing::debug!(
                breed.step = "plan_step_added",
                breed = "autoinstinct_learning",
                "L1 inference step"
            );
            plan_candidates.push(Candidate {
                id: format!("plan-step-{}", n),
                score: if goal_mask == 0 {
                    1.0
                } else {
                    1.0 - (distance as f32 / goal_mask.count_ones() as f32)
                },
                eliminated: false,
                elimination_reason: None,
            });
        }
        let final_distance = planner.heuristic_distance(plan_states.last().expect("non-empty"));
        if final_distance != 0 {
            return Err(BreedError {
                breed: BreedId::AutoinstinctLearning,
                message: format!(
                    "autoinstinct_learning: goal not reached (distance={})",
                    final_distance
                ),
            });
        }

        let explanation = format!(
            "AutoinstinctLearning: {} plan steps, goal_mask={:#010b}, final_state={:#010b}, goal_reached=true",
            plan_states.len(),
            goal_mask,
            plan_states.last().unwrap().features
        );
        Ok(BreedOutput {
            breed: BreedId::AutoinstinctLearning,
            candidates: plan_candidates,
            facts: input.facts.clone(),
            selected: Some(format!("{} steps to goal", plan_states.len())),
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }
}

fn atoms_joined(state: &BTreeSet<String>) -> String {
    let mut parts: Vec<String> = state.iter().cloned().collect();
    parts.sort();
    parts.join(",")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Fact, Goal, Rule};

    fn make_goals(n: usize) -> Vec<Goal> {
        (0..n)
            .map(|i| Goal {
                id: format!("g{}", i),
                predicate: "achieve".to_string(),
                value: format!("sub-goal-{}", i),
            })
            .collect()
    }

    fn make_facts(n: usize) -> Vec<Fact> {
        // Identity-matched to make_goals facts: achieve=sub-goal-i.
        (0..n)
            .map(|i| Fact {
                key: "achieve".to_string(),
                value: format!("sub-goal-{}", i),
            })
            .collect()
    }

    fn empty_input(goals: Vec<Goal>, facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals,
            state: vec![],
        }
    }

    #[test]
    fn precondition_rejects_empty_goals() {
        let breed = AutoinstinctLearning;
        let input = empty_input(vec![], make_facts(2));
        let result = breed.preconditions(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("at least one goal"));
    }

    #[test]
    fn precondition_accepts_nonempty_goals() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(2), make_facts(2));
        assert!(breed.preconditions(&input).is_ok());
    }

    #[test]
    fn run_produces_nonempty_trace() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(4), vec![]);
        let output = breed.run(&input).expect("run ok");
        assert!(
            !output.inference_trace.is_empty(),
            "trace must be non-empty"
        );
    }

    #[test]
    fn postcondition_requires_nonempty_trace() {
        let breed = AutoinstinctLearning;
        let bad_output = BreedOutput {
            breed: BreedId::AutoinstinctLearning,
            candidates: vec![],
            facts: vec![],
            selected: None,
            explanation: "".into(),
            inference_trace: vec![],
            ocel_log: None,
            retained_cases: vec![],
        };
        assert!(breed
            .postconditions(&empty_input(vec![], vec![]), &bad_output)
            .is_err());
    }

    #[test]
    fn run_selected_contains_steps_to_goal() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(4), vec![]);
        let output = breed.run(&input).expect("run ok");
        assert!(
            output.selected.as_ref().unwrap().contains("steps to goal"),
            "selected must describe steps to goal, got: {:?}",
            output.selected
        );
    }

    /// Rank-1: plan trace steps must be monotonically non-increasing in distance.
    #[test]
    fn trace_distances_are_monotonically_nonincreasing() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(4), vec![]);
        let output = breed.run(&input).expect("run ok");

        let distances: Vec<u32> = output
            .inference_trace
            .iter()
            .filter(|t| t.kind == "plan-step")
            .map(|t| {
                t.detail
                    .split("distance=")
                    .nth(1)
                    .and_then(|s| s.split_whitespace().next())
                    .and_then(|s| s.parse::<u32>().ok())
                    .unwrap_or(0)
            })
            .collect();

        for w in distances.windows(2) {
            assert!(w[1] <= w[0], "trace distance regressed: {:?}", distances);
        }
    }

    /// Rank-2: when all goals are already satisfied by initial facts
    /// (identity-matched), the plan has exactly 1 state and selected says
    /// "1 steps to goal".
    #[test]
    fn presatisfied_goals_yield_single_state_plan() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(4), make_facts(4));
        let output = breed.run(&input).expect("run ok");
        assert_eq!(
            output.selected.as_deref(),
            Some("1 steps to goal"),
            "pre-satisfied plan must report 1 step"
        );
    }

    /// Identity, not position: facts matching only goals 2 and 3 must leave
    /// goals 0 and 1 unsatisfied (the old planner matched by index).
    #[test]
    fn goals_match_facts_by_identity_not_position() {
        let breed = AutoinstinctLearning;
        let facts = vec![
            Fact { key: "achieve".into(), value: "sub-goal-2".into() },
            Fact { key: "achieve".into(), value: "sub-goal-3".into() },
        ];
        let input = empty_input(make_goals(4), facts);
        let output = breed.run(&input).expect("run ok");
        // 2 goals remain -> 2 flips -> 3 states.
        assert_eq!(
            output.selected.as_deref(),
            Some("3 steps to goal"),
            "only the 2 unmatched goals may require steps, got: {:?}",
            output.selected
        );
        let first = &output.inference_trace[0];
        assert!(
            first.detail.contains("distance=2"),
            "initial distance must be 2 (identity-matched), got: {}",
            first.detail
        );
    }

    #[test]
    fn run_roundtrips_through_postconditions() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(3), make_facts(1));
        let output = breed.run(&input).expect("run ok");
        assert!(breed
            .postconditions(&empty_input(vec![], vec![]), &output)
            .is_ok());
    }

    /// B4-1: goal is reachable — run succeeds and final plan step has distance == 0
    #[test]
    fn test_learning_reaches_goal() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(3), vec![]);
        let output = breed
            .run(&input)
            .expect("run must succeed for reachable goal");
        assert_eq!(output.breed, BreedId::AutoinstinctLearning);
        let last_plan_step = output
            .inference_trace
            .iter()
            .filter(|t| t.kind == "plan-step")
            .last()
            .expect("must have at least one plan-step trace entry");
        let dist: u32 = last_plan_step
            .detail
            .split("distance=")
            .nth(1)
            .and_then(|s| s.split_whitespace().next())
            .and_then(|s| s.parse().ok())
            .expect("trace detail must contain distance=N");
        assert_eq!(dist, 0, "final plan step must reach distance 0");
    }

    /// Operator STRIPS: a real two-step plan through real operators with
    /// preconditions and delete effects.
    #[test]
    fn operator_strips_finds_two_step_plan_with_deletes() {
        let breed = AutoinstinctLearning;
        let input = BreedInput {
            intent: "move block".into(),
            candidates: vec![],
            facts: vec![Fact { key: "onTable".into(), value: "a".into() }],
            cases: vec![],
            rules: vec![
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
            ],
            goals: vec![Goal { id: "g".into(), predicate: "onTable".into(), value: "b".into() }],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        assert_eq!(
            output.selected.as_deref(),
            Some("2 steps to goal"),
            "pick+drop plan must be 2 steps, got: {:?}",
            output.selected
        );
        let selected_ops: Vec<&str> = output
            .inference_trace
            .iter()
            .filter(|t| t.kind == "select-operator")
            .map(|t| t.detail.as_str())
            .collect();
        assert_eq!(selected_ops, vec!["pick", "drop"]);
        assert!(output
            .inference_trace
            .iter()
            .any(|t| t.kind == "goal-achieved"));
        // Delete effect witnessed: onTable=a is gone after pick.
        let apply_step = output
            .inference_trace
            .iter()
            .find(|t| t.kind == "apply-operator")
            .expect("apply-operator step");
        assert!(
            apply_step.detail.contains("inHand=a") && !apply_step.detail.contains("onTable=a"),
            "delete effect must remove onTable=a, got: {}",
            apply_step.detail
        );
    }

    /// Operator STRIPS refusal: unreachable goal -> typed error, no silent Ok.
    #[test]
    fn operator_strips_refuses_unreachable_goal() {
        let breed = AutoinstinctLearning;
        let input = BreedInput {
            intent: "impossible".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![Rule {
                id: "noop".into(),
                premise: vec![],
                conclusion: "other=x".into(),
                certainty: 1.0,
            }],
            goals: vec![Goal { id: "g".into(), predicate: "wanted".into(), value: "y".into() }],
            state: vec![],
        };
        let err = breed.run(&input).expect_err("must refuse");
        assert!(
            err.message.contains("no plan exists"),
            "refusal must say no plan exists, got: {}",
            err.message
        );
    }

    /// Curriculum cap: >32 goals exceeds the bitmask and is refused, not
    /// silently truncated by the old `min(31)` collapse.
    #[test]
    fn curriculum_refuses_more_than_32_goals() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(33), vec![]);
        let err = breed.run(&input).expect_err("must refuse >32 goals");
        assert!(
            err.message.contains("cap"),
            "refusal must name the cap, got: {}",
            err.message
        );
    }

    #[test]
    fn test_learning_goal_unreachable_error_message() {
        use crate::breeds::BreedError;
        let err = BreedError {
            breed: BreedId::AutoinstinctLearning,
            message: "autoinstinct_learning: goal not reached (distance=3)".into(),
        };
        assert!(err.message.contains("goal not reached"));
        assert!(err.message.contains("distance="));
    }
}
