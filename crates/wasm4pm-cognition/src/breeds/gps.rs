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
    });
    let mut last_err = format!("no operator produces {}", goal);
    for action in actions {
        let adds = parse_adds(&action.conclusion);
        if !adds.contains(&goal.to_string()) {
            continue;
        }
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
        plan.push(action.id.clone());
        trace.push(TraceStep {
            step: trace.len(),
            kind: "apply-operator".to_string(),
            detail: action.id.clone(),
            depth,
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

        let mut last_gap_count = goals.iter().filter(|g| !state.contains(*g)).count() + 1;
        while let Some(gap) = first_gap(&goals, &state) {
            let gap_count = goals.iter().filter(|g| !state.contains(*g)).count();
            if gap_count >= last_gap_count {
                return Err(BreedError {
                    breed: BreedId::Gps,
                    message: format!(
                        "gap not strictly decreasing on iteration for {}",
                        gap
                    ),
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

        let explanation = format!(
            "GPS plan ({} ops): {}",
            plan.len(),
            plan.join(" → ")
        );
        let selected = if plan.is_empty() {
            None
        } else {
            Some(plan.join(","))
        };

        Ok(BreedOutput {
            breed: BreedId::Gps,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("GPS must record at least one gap reduction".to_string());
        }
        Ok(())
    }
}
