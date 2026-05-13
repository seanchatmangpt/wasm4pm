//! STRIPS-style precondition-based planner with iterative deepening
//! goal-regression search (Fikes & Nilsson 1971).
//!
//! Encoding (decoupled from `BreedInput.state`/`rules` shapes):
//! - State atoms are `predicate=value` strings, derived from
//!   `StateAtom { predicate, value }`.
//! - Actions are encoded in `input.rules`:
//!   * `rule.id`             = action name
//!   * `rule.premise`        = list of `predicate=value` preconditions
//!   * `rule.conclusion`     = `add1;add2;!del1` semicolon-separated;
//!                             a `!` prefix means delete from state.
//!   * `rule.certainty`      = unused (kept for serialization parity).
//! - Goals come from `input.goals` as `predicate=value`.
//! - Frame axioms (Fikes & Nilsson 1971) are encoded in `input.facts`:
//!   * `fact.key == "frame"` encodes: `atom,action1,action2,action3`
//!   * Meaning: this atom is preserved (not deleted) across these actions.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Goal, Rule, StateAtom, TraceStep,
};
use std::collections::{HashMap, HashSet};

/// STRIPS planner.
pub struct Strips;

const MAX_PLAN_DEPTH: usize = 16;

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

/// Frame axiom: atoms preserved across actions (Fikes & Nilsson 1971).
/// Encoded in input.facts as: fact.key="frame", fact.value="atom,action1,action2"
#[derive(Debug, Clone)]
struct FrameAxiom {
    atom: String,
    actions: HashSet<String>,
}

fn parse_frame_axioms(facts: &[crate::breeds::Fact]) -> HashMap<String, FrameAxiom> {
    let mut axioms = HashMap::new();
    for fact in facts {
        if fact.key == "frame" {
            // Format: "atom,action1,action2,action3"
            let parts: Vec<&str> = fact.value.split(',').map(|s| s.trim()).collect();
            if parts.len() > 1 {
                let atom = parts[0].to_string();
                let actions: HashSet<String> = parts[1..]
                    .iter()
                    .map(|s| s.to_string())
                    .collect();
                axioms.insert(atom.clone(), FrameAxiom { atom, actions });
            }
        }
    }
    axioms
}

#[derive(Debug, Clone)]
struct ActionEffect {
    adds: Vec<String>,
    dels: Vec<String>,
}

fn parse_effect(conclusion: &str) -> ActionEffect {
    let mut adds = Vec::new();
    let mut dels = Vec::new();
    for tok in conclusion.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if let Some(rest) = tok.strip_prefix('!') {
            dels.push(rest.to_string());
        } else {
            adds.push(tok.to_string());
        }
    }
    ActionEffect { adds, dels }
}

fn applicable(rule: &Rule, state: &HashSet<String>) -> bool {
    rule.premise.iter().all(|p| state.contains(p))
}

fn apply(rule: &Rule, state: &HashSet<String>) -> HashSet<String> {
    let eff = parse_effect(&rule.conclusion);
    let mut next: HashSet<String> = state
        .iter()
        .filter(|a| !eff.dels.contains(a))
        .cloned()
        .collect();
    for a in eff.adds {
        next.insert(a);
    }
    next
}

fn apply_with_frames(
    rule: &Rule,
    state: &HashSet<String>,
    frame_axioms: &HashMap<String, FrameAxiom>,
) -> HashSet<String> {
    let eff = parse_effect(&rule.conclusion);
    let mut next: HashSet<String> = state
        .iter()
        .filter(|a| {
            // Check if this atom has a frame axiom preserving it for this action.
            if let Some(frame) = frame_axioms.get(*a) {
                // If the action is in the frame's preserved-action set, keep the atom.
                frame.actions.contains(&rule.id)
            } else {
                // No frame axiom for this atom, so it gets deleted if in eff.dels.
                !eff.dels.contains(a)
            }
        })
        .cloned()
        .collect();
    for a in eff.adds {
        next.insert(a);
    }
    next
}

fn goals_satisfied(goals: &[String], state: &HashSet<String>) -> bool {
    goals.iter().all(|g| state.contains(g))
}

fn idfs(
    state: &HashSet<String>,
    goals: &[String],
    actions: &[Rule],
    depth: usize,
    trace: &mut Vec<TraceStep>,
    frame_axioms: &HashMap<String, FrameAxiom>,
) -> Option<Vec<String>> {
    if goals_satisfied(goals, state) {
        return Some(Vec::new());
    }
    if depth == 0 {
        return None;
    }
    // Pick first unsatisfied goal.
    let unsat = goals.iter().find(|g| !state.contains(*g))?.clone();
    trace.push(TraceStep {
        step: trace.len(),
        kind: "subgoal".to_string(),
        detail: unsat.clone(),
        depth: (MAX_PLAN_DEPTH - depth) as u32,
    });
    for action in actions {
        let eff = parse_effect(&action.conclusion);
        if !eff.adds.contains(&unsat) {
            continue;
        }
        if !applicable(action, state) {
            continue;
        }
        trace.push(TraceStep {
            step: trace.len(),
            kind: "try-action".to_string(),
            detail: action.id.clone(),
            depth: (MAX_PLAN_DEPTH - depth) as u32,
        });
        let next = apply_with_frames(action, state, frame_axioms);
        if let Some(rest) = idfs(&next, goals, actions, depth - 1, trace, frame_axioms) {
            let mut plan = vec![action.id.clone()];
            plan.extend(rest);
            return Some(plan);
        }
    }
    None
}

impl CognitionBreed for Strips {
    fn id(&self) -> BreedId {
        BreedId::Strips
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["planning".to_string(), "goal_regression".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err("STRIPS requires at least one goal".to_string());
        }
        if input.rules.is_empty() {
            return Err("STRIPS requires at least one action rule".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let initial = atoms_of(&input.state);
        let goals = goal_strings(&input.goals);
        let frame_axioms = parse_frame_axioms(&input.facts);
        let mut trace: Vec<TraceStep> = Vec::new();

        if !frame_axioms.is_empty() {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "frame-axioms-loaded".to_string(),
                detail: format!("{} frame axioms", frame_axioms.len()),
                depth: 0,
            });
        }

        let mut plan: Option<Vec<String>> = None;
        for d in 0..=MAX_PLAN_DEPTH {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "iterate-depth".to_string(),
                detail: format!("d={}", d),
                depth: 0,
            });
            if let Some(p) = idfs(&initial, &goals, &input.rules, d, &mut trace, &frame_axioms) {
                plan = Some(p);
                break;
            }
        }

        let plan = plan.ok_or_else(|| BreedError {
            breed: BreedId::Strips,
            message: format!("unreachable goal within depth {}", MAX_PLAN_DEPTH),
        })?;

        // Verify by replay.
        let mut s = initial.clone();
        for step in &plan {
            let action = input
                .rules
                .iter()
                .find(|r| &r.id == step)
                .ok_or_else(|| BreedError {
                    breed: BreedId::Strips,
                    message: format!("plan references unknown action {}", step),
                })?;
            if !applicable(action, &s) {
                return Err(BreedError {
                    breed: BreedId::Strips,
                    message: format!("plan replay failed at action {}", action.id),
                });
            }
            s = apply_with_frames(action, &s, &frame_axioms);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "execute".to_string(),
                detail: action.id.clone(),
                depth: 0,
            });
        }
        if !goals_satisfied(&goals, &s) {
            return Err(BreedError {
                breed: BreedId::Strips,
                message: "plan replay did not satisfy all goals".to_string(),
            });
        }

        let explanation = format!(
            "STRIPS plan ({} steps): {}",
            plan.len(),
            plan.join(" → ")
        );
        let selected = if plan.is_empty() {
            None
        } else {
            Some(plan.join(","))
        };

        Ok(BreedOutput {
            breed: BreedId::Strips,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("STRIPS must record search steps".to_string());
        }
        Ok(())
    }
}
