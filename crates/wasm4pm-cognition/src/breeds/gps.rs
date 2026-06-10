//! GPS (General Problem Solver) — means-ends gap reduction (Newell & Shaw 1963).
//!
//! Algorithm:
//! 1. Identify the *first* unsatisfied goal atom (the "gap").
//! 2. Look up an operator (rule) whose effect adds that atom.
//! 3. If the operator's preconditions hold, apply it and recurse.
//! 4. Otherwise, recursively solve the operator's preconditions as
//!    subgoals (depth-limited).
//!
//! Encoding: same as STRIPS — `rule.premise` are precondition atoms,
//! `rule.conclusion` is `;`-separated effects, atoms are `pred=val`.
//! `input.goals` and `input.state` carry the planning problem.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Goal, Rule, StateAtom, TraceStep,
};
use std::collections::HashSet;
use tracing;

/// GPS planner.
pub struct Gps;

const MAX_RECURSION: u32 = 32;

fn atoms_of(state: &[StateAtom]) -> HashSet<String> {
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

fn first_gap(goals: &[String], state: &HashSet<String>) -> Option<String> {
    goals.iter().find(|g| !state.contains(*g)).cloned()
}

fn solve(
    state: &mut HashSet<String>,
    goal: &str,
    actions: &[Rule],
    plan: &mut Vec<String>,
    trace: &mut Vec<TraceStep>,
    depth: u32,
    visiting: &mut HashSet<String>,
) -> Result<(), String> {
    if state.contains(goal) {
        return Ok(());
    }
    if depth >= MAX_RECURSION {
        return Err(format!("recursion limit reached on goal {}", goal));
    }
    if !visiting.insert(goal.to_string()) {
        return Err(format!("cycle detected on goal {}", goal));
    }
    trace.push(TraceStep {
        step: trace.len(),
        kind: "reduce-gap".to_string(),
        detail: goal.to_string(),
        depth,
        objects: vec![],
    });
    let mut last_err = format!("no operator produces {}", goal);
    for action in actions {
        let adds = parse_adds(&action.conclusion);
        if !adds.contains(&goal.to_string()) {
            continue;
        }
        tracing::debug!(breed.step = "operator_selected", breed = "gps", operator = %action.id, "L1 inference step");
        // Try to satisfy preconditions recursively.
        let snapshot = state.clone();
        let mut ok = true;
        for pre in &action.premise {
            if let Err(e) = solve(state, pre, actions, plan, trace, depth + 1, visiting) {
                last_err = e;
                ok = false;
                break;
            }
        }
        if !ok {
            *state = snapshot;
            continue;
        }
        // Apply.
        for d in parse_dels(&action.conclusion) {
            state.remove(&d);
        }
        for a in adds {
            state.insert(a);
        }
        tracing::debug!(breed.step = "operator_applied", breed = "gps", operator = %action.id, "L1 inference step");
        plan.push(action.id.clone());
        trace.push(TraceStep {
            step: trace.len(),
            kind: "apply-operator".to_string(),
            detail: action.id.clone(),
            depth,
            objects: vec![],
        });
        visiting.remove(goal);
        return Ok(());
    }
    visiting.remove(goal);
    Err(last_err)
}

impl CognitionBreed for Gps {
    fn id(&self) -> BreedId {
        BreedId::Gps
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["means_ends_analysis".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err("GPS requires at least one goal".to_string());
        }
        if input.rules.is_empty() {
            return Err("GPS requires at least one operator".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut state = atoms_of(&input.state);
        let goals = goal_strings(&input.goals);
        let mut plan: Vec<String> = Vec::new();
        let mut trace: Vec<TraceStep> = Vec::new();

        // Check for pre-satisfied goals. Track whether ALL goals were already
        // satisfied at entry — this distinguishes "empty plan because nothing
        // needed to be done" (Some("")) from "no plan exists" (None).
        let mut all_presatisfied = !input.goals.is_empty();
        for goal in &input.goals {
            if input
                .state
                .iter()
                .any(|s| s.predicate == goal.predicate && s.value == goal.value)
            {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "check-presatisfied".into(),
                    detail: format!("goal {} is already satisfied", goal.id),
                    depth: 0,
                    objects: vec![],
                });
            } else {
                all_presatisfied = false;
            }
        }

        let mut last_gap_count = goals.iter().filter(|g| !state.contains(*g)).count() + 1;
        while let Some(gap) = first_gap(&goals, &state) {
            tracing::debug!(breed.step = "goal_selected", breed = "gps", goal = %gap, "L1 inference step");
            let gap_count = goals.iter().filter(|g| !state.contains(*g)).count();
            tracing::debug!(
                breed.step = "difference_computed",
                breed = "gps",
                gap_count = gap_count,
                "L1 inference step"
            );
            if gap_count >= last_gap_count {
                return Err(BreedError {
                    breed: BreedId::Gps,
                    message: format!("gap not strictly decreasing on iteration for {}", gap),
                });
            }
            last_gap_count = gap_count;
            let mut visiting = HashSet::new();
            if let Err(e) = solve(
                &mut state,
                &gap,
                &input.rules,
                &mut plan,
                &mut trace,
                0,
                &mut visiting,
            ) {
                return Err(BreedError {
                    breed: BreedId::Gps,
                    message: e,
                });
            }
        }
        tracing::debug!(
            breed.step = "goal_achieved",
            breed = "gps",
            plan_ops = plan.len(),
            "L1 inference step"
        );

        let explanation = format!("GPS plan ({} ops): {}", plan.len(), plan.join(" → "));
        // Semantic contract for `selected`:
        //   Some("op1,op2")  — non-empty plan that achieves the goals
        //   Some("")         — pre-satisfied goals: the empty plan IS the plan
        //   None             — only emitted when planning is unreachable;
        //                      with strict gap-decreasing guard above, the
        //                      planning loop either succeeds or returns Err,
        //                      so None here means "no goals at entry that
        //                      weren't already satisfied AND nothing happened"
        //                      which collapses into the all_presatisfied case.
        let selected = if !plan.is_empty() {
            Some(plan.join(","))
        } else if all_presatisfied {
            Some(String::new())
        } else {
            None
        };

        Ok(BreedOutput {
            breed: BreedId::Gps,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("GPS must record at least one gap reduction".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Goal, Rule, StateAtom};

    /// Rank-2 (domain contract): the empty plan is a valid plan for goals
    /// that are already satisfied. The caller must be able to distinguish
    /// "empty plan because pre-satisfied" from "no plan exists".
    /// Returning `None` for both collapses the two cases and forces the
    /// caller to re-check state — a Rank-2 contract violation.
    #[test]
    fn presatisfied_goal_returns_empty_plan_not_none() {
        let input = BreedInput {
            intent: "x".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![Rule {
                id: "dummy".into(),
                premise: vec![],
                conclusion: "anything".into(),
                certainty: 1.0,
            }],
            goals: vec![Goal {
                id: "g".into(),
                predicate: "done".into(),
                value: "yes".into(),
            }],
            state: vec![StateAtom {
                predicate: "done".into(),
                value: "yes".into(),
            }],
        };
        let out = Gps.run(&input).expect("run ok");
        assert_eq!(
            out.selected.as_deref(),
            Some(""),
            "pre-satisfied goal MUST return Some(\"\") (empty plan), not None"
        );
        // Trace still records the check-presatisfied evidence.
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "check-presatisfied"));
    }

    /// Rank-2: with multiple goals, all pre-satisfied -> Some(""); planning
    /// remains short-circuited (no apply-operator steps).
    #[test]
    fn all_goals_presatisfied_yields_empty_plan_no_operators() {
        let input = BreedInput {
            intent: "x".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![Rule {
                id: "noop".into(),
                premise: vec![],
                conclusion: "noop_effect".into(),
                certainty: 1.0,
            }],
            goals: vec![
                Goal {
                    id: "g1".into(),
                    predicate: "a".into(),
                    value: "1".into(),
                },
                Goal {
                    id: "g2".into(),
                    predicate: "b".into(),
                    value: "2".into(),
                },
            ],
            state: vec![
                StateAtom {
                    predicate: "a".into(),
                    value: "1".into(),
                },
                StateAtom {
                    predicate: "b".into(),
                    value: "2".into(),
                },
            ],
        };
        let out = Gps.run(&input).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some(""));
        assert!(!out
            .inference_trace
            .iter()
            .any(|t| t.kind == "apply-operator"));
    }
}
