//! AutoinstinctLearning — STRIPS/HACKER bitwise heuristic planning (Winston 1975).
//!
//! Algorithm:
//! 1. Encode input.goals as a bitmask: bit i = 1 iff goal i must be satisfied.
//! 2. Encode input.facts as an initial state bitmask: bit i = 1 iff fact i is true.
//! 3. Build a `HeuristicPlanner` from crate::autoinstinct::learning.
//! 4. Call `HeuristicPlanner::solve(initial_state)` (greedy monotone descent).
//! 5. Emit one `TraceStep` per plan step with kind "plan-step".
//! 6. If no goals exist or solve returns a trivial single-state plan, emit
//!    kind "no-plan-found" with certainty 0.0 but still return Ok.
//! 7. BreedOutput.selected = format!("{} steps to goal", plan.len()).
//! 8. BreedOutput.candidates holds each plan-step state as a string.

use crate::autoinstinct::learning::{HeuristicPlanner, ProblemState};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, TraceStep,
};

/// AutoinstinctLearning breed: STRIPS/HACKER heuristic planning via bitwise goal state search.
pub struct AutoinstinctLearning;

impl CognitionBreed for AutoinstinctLearning {
    fn id(&self) -> BreedId {
        BreedId::AutoinstinctLearning
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "strips_planning".to_string(),
            "hacker_heuristic".to_string(),
            "bitwise_goal_search".to_string(),
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
        // Encode goals as bitmask: bit i = goal i must be satisfied.
        let goal_mask: u32 = input
            .goals
            .iter()
            .enumerate()
            .map(|(i, _)| 1u32 << (i.min(31)))
            .fold(0u32, |acc, b| acc | b);

        // Encode facts as initial state bitmask: bit i = fact i is present.
        let initial_features: u32 = input
            .facts
            .iter()
            .enumerate()
            .map(|(i, _)| 1u32 << (i.min(31)))
            .fold(0u32, |acc, b| acc | b);

        let planner = HeuristicPlanner::new(goal_mask);
        let initial_state = ProblemState {
            features: initial_features,
        };
        let plan = planner.solve(initial_state);

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut plan_candidates: Vec<Candidate> = Vec::new();

        if plan.is_empty() || (plan.len() == 1 && planner.heuristic_distance(&plan[0]) > 0) {
            // Solver stuck or degenerate: emit single "no-plan-found" step.
            trace.push(TraceStep {
                step: 0,
                kind: "no-plan-found".to_string(),
                detail: format!(
                    "initial_features={:#010b} goal_mask={:#010b} distance={}",
                    initial_features,
                    goal_mask,
                    planner.heuristic_distance(&plan[0])
                ),
                depth: 0,
            });
            return Ok(BreedOutput {
                breed: BreedId::AutoinstinctLearning,
                candidates: plan_candidates,
                facts: input.facts.clone(),
                selected: Some("0 steps to goal".to_string()),
                explanation: "AutoinstinctLearning: no plan found — initial state already stuck or goal unreachable".to_string(),
                inference_trace: trace,
            });
        }

        // Emit a trace step and candidate for each plan state.
        for (n, state) in plan.iter().enumerate() {
            let distance = planner.heuristic_distance(state);
            trace.push(TraceStep {
                step: n,
                kind: "plan-step".to_string(),
                detail: format!(
                    "state={:#010b} distance={} action toward goal: flip next missing bit",
                    state.features, distance
                ),
                depth: 0,
            });
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

        let final_state = plan.last().unwrap();
        let final_distance = planner.heuristic_distance(final_state);
        let goal_reached = final_distance == 0;

        let explanation = format!(
            "AutoinstinctLearning: {} plan steps, goal_mask={:#010b}, final_state={:#010b}, goal_reached={}",
            plan.len(),
            goal_mask,
            final_state.features,
            goal_reached
        );

        Ok(BreedOutput {
            breed: BreedId::AutoinstinctLearning,
            candidates: plan_candidates,
            facts: input.facts.clone(),
            selected: Some(format!("{} steps to goal", plan.len())),
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err(
                "AutoinstinctLearning must emit at least one inference trace step".to_string(),
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Fact, Goal};

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
        (0..n)
            .map(|i| Fact {
                key: format!("fact{}", i),
                value: "true".to_string(),
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
        };
        assert!(breed.postconditions(&bad_output).is_err());
    }

    #[test]
    fn run_selected_contains_steps_to_goal() {
        let breed = AutoinstinctLearning;
        // 4 goals, 0 initial facts → need 4 plan steps to reach goal
        let input = empty_input(make_goals(4), vec![]);
        let output = breed.run(&input).expect("run ok");
        assert!(
            output.selected.as_ref().unwrap().contains("steps to goal"),
            "selected must describe steps to goal, got: {:?}",
            output.selected
        );
    }

    /// Rank-1: plan trace steps must be monotonically non-increasing in distance.
    /// Every step either holds or reduces the gap to the goal (never regresses).
    #[test]
    fn trace_distances_are_monotonically_nonincreasing() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(4), vec![]);
        let output = breed.run(&input).expect("run ok");

        // Extract distances from trace step details ("distance=N").
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

    /// Rank-2: when all goals are already satisfied by initial facts,
    /// the plan has exactly 1 state and selected says "1 steps to goal".
    #[test]
    fn presatisfied_goals_yield_single_state_plan() {
        let breed = AutoinstinctLearning;
        // 4 goals, 4 initial facts → initial bitmask already satisfies goal mask
        let input = empty_input(make_goals(4), make_facts(4));
        let output = breed.run(&input).expect("run ok");
        assert_eq!(
            output.selected.as_deref(),
            Some("1 steps to goal"),
            "pre-satisfied plan must report 1 step"
        );
    }

    #[test]
    fn run_roundtrips_through_postconditions() {
        let breed = AutoinstinctLearning;
        let input = empty_input(make_goals(3), make_facts(1));
        let output = breed.run(&input).expect("run ok");
        assert!(breed.postconditions(&output).is_ok());
    }
}
