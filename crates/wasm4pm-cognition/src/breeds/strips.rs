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
//!     a `!` prefix means delete from state.
//!   * `rule.certainty`      = unused (kept for serialization parity).
//! - Goals come from `input.goals` as `predicate=value`.
//! - Frame axioms (Fikes & Nilsson 1971) are encoded in `input.facts`:
//!   * `fact.key == "frame"` encodes: `atom,action1,action2,action3`
//!   * Meaning: this atom is preserved (not deleted) across these actions.

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Goal, Rule, StateAtom, TraceStep,
};
use std::collections::{HashMap, HashSet};
use tracing;

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
                let actions: HashSet<String> = parts[1..].iter().map(|s| s.to_string()).collect();
                axioms.insert(atom, FrameAxiom { actions });
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
    ActionEffect { adds, dels }
}

fn applicable(rule: &Rule, state: &HashSet<String>) -> bool {
    rule.premise.iter().all(|p| state.contains(p))
}

// NOTE: a frame-less `apply()` once lived here. It was unreachable — every
// caller now uses `apply_with_frames`, which is a strict superset (when
// `frame_axioms` is empty its behavior reduces to the old `apply()`). The
// dead-code copy was deleted as part of the iter-4 deferred-findings sweep.

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
        objects: vec![],
    });
    for action in actions {
        let eff = parse_effect(&action.conclusion);
        if !eff.adds.contains(&unsat) {
            continue;
        }
        if !applicable(action, state) {
            continue;
        }
        tracing::debug!(
            breed.step = "operator_selected",
            breed = "strips",
            "L1 inference step"
        );
        trace.push(TraceStep {
            step: trace.len(),
            kind: "try-action".to_string(),
            detail: action.id.clone(),
            depth: (MAX_PLAN_DEPTH - depth) as u32,
            objects: vec![],
        });
        tracing::debug!(
            breed.step = "precondition_checked",
            breed = "strips",
            "L1 inference step"
        );
        let next = apply_with_frames(action, state, frame_axioms);
        tracing::debug!(
            breed.step = "effect_applied",
            breed = "strips",
            "L1 inference step"
        );
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
        tracing::debug!(
            breed.step = "state_loaded",
            breed = "strips",
            "L1 inference step"
        );
        let goals = goal_strings(&input.goals);
        let frame_axioms = parse_frame_axioms(&input.facts);
        let mut trace: Vec<TraceStep> = Vec::new();

        // Pre-satisfaction check: if every goal atom is already in the initial
        // state, the empty plan IS the plan. Track this so `selected` can
        // distinguish `Some("")` (pre-satisfied) from `None` (unreachable).
        // Mirrors the GPS contract in `breeds/gps.rs`.
        let all_presatisfied = !goals.is_empty() && goals_satisfied(&goals, &initial);
        if all_presatisfied {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "check-presatisfied".to_string(),
                detail: format!("{} goals already satisfied in initial state", goals.len()),
                depth: 0,
                objects: vec![],
            });
        }

        if !frame_axioms.is_empty() {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "frame-axioms-loaded".to_string(),
                detail: format!("{} frame axioms", frame_axioms.len()),
                depth: 0,
                objects: vec![],
            });
        }

        let mut plan: Option<Vec<String>> = None;
        for d in 0..=MAX_PLAN_DEPTH {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "iterate-depth".to_string(),
                detail: format!("d={}", d),
                depth: 0,
                objects: vec![],
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
                objects: vec![],
            });
        }
        tracing::debug!(
            breed.step = "goal_tested",
            breed = "strips",
            "L1 inference step"
        );
        if !goals_satisfied(&goals, &s) {
            return Err(BreedError {
                breed: BreedId::Strips,
                message: "plan replay did not satisfy all goals".to_string(),
            });
        }

        let explanation = format!("STRIPS plan ({} steps): {}", plan.len(), plan.join(" → "));
        // Semantic contract for `selected` (mirrors GPS contract in
        // `breeds/gps.rs`):
        //   Some("op1,op2")  — non-empty plan that achieves the goals
        //   Some("")         — pre-satisfied goals: the empty plan IS the plan
        //   None             — only emitted when planning is unreachable.
        //                      Note: the `plan.ok_or_else` above already
        //                      converts unreachable into `BreedError`, so a
        //                      successful run reaching this point with an
        //                      empty plan necessarily means pre-satisfied.
        let selected = if !plan.is_empty() {
            Some(plan.join(","))
        } else if all_presatisfied {
            Some(String::new())
        } else {
            None
        };

        tracing::debug!(
            breed.step = "plan_emitted",
            breed = "strips",
            "L1 inference step"
        );
        Ok(BreedOutput {
            breed: BreedId::Strips,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Goal, Rule, StateAtom};

    /// Rank-1 invariant for iter-4 deferred finding (dead `apply()` removed):
    /// `apply_with_frames` with an EMPTY frame-axiom set MUST produce the
    /// exact same successor state the deleted `apply()` would have produced.
    /// This is what justified the deletion — the live path subsumes the dead
    /// path. If anyone ever resurrects a non-trivial difference between them,
    /// this test will catch the regression.
    #[test]
    fn apply_with_frames_subsumes_frameless_apply() {
        let rule = Rule {
            id: "pick_up_block".to_string(),
            premise: vec!["onTable=block".to_string()],
            conclusion: "inHand=block;!onTable=block".to_string(),
            certainty: 1.0,
        };
        let mut state: HashSet<String> = HashSet::new();
        state.insert("onTable=block".to_string());
        state.insert("clear=block".to_string());

        let empty_frames: HashMap<String, FrameAxiom> = HashMap::new();
        let next = apply_with_frames(&rule, &state, &empty_frames);

        // With no frame axioms: deletion of `onTable=block` MUST fire,
        // addition of `inHand=block` MUST fire, untouched `clear=block`
        // MUST persist. This is identical to the frame-less semantics
        // the deleted `apply()` would have provided.
        assert!(!next.contains("onTable=block"), "delete must fire");
        assert!(next.contains("inHand=block"), "add must fire");
        assert!(next.contains("clear=block"), "untouched atom must persist");
        assert_eq!(next.len(), 2);
    }

    /// Rank-2 (domain contract): the empty plan is a valid plan for goals
    /// that are already satisfied. The caller must be able to distinguish
    /// "empty plan because pre-satisfied" from "no plan exists".
    /// Returning `None` for both collapses the two cases and forces the
    /// caller to re-check state — a Rank-2 contract violation.
    /// Mirrors the GPS contract pinned in `breeds/gps.rs`.
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
        let out = Strips.run(&input).expect("run ok");
        assert_eq!(
            out.selected.as_deref(),
            Some(""),
            "pre-satisfied goal MUST return Some(\"\") (empty plan), not None"
        );
        // Trace must record the pre-satisfaction check.
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "check-presatisfied"));
    }

    /// Rank-2: with multiple goals, all pre-satisfied -> Some(""); planning
    /// remains short-circuited (no try-action or execute steps).
    #[test]
    fn all_goals_presatisfied_yields_empty_plan_no_actions() {
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
        let out = Strips.run(&input).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some(""));
        // No action should have been executed since goals were already met.
        assert!(!out.inference_trace.iter().any(|t| t.kind == "execute"));
        assert!(!out.inference_trace.iter().any(|t| t.kind == "try-action"));
    }

    /// Falsification: Fikes & Nilsson 1971 room-navigation fixture.
    /// Two-goal problem: turn-on-light then close-door1. The exact plan
    /// must be ["turn-on-light", "close-door1"] in that order. If the
    /// forward-search loop or goal ordering is wrong, a different sequence
    /// or failure results.
    #[test]
    fn paper_fixture_fikes_nilsson_1971_two_step_plan() {
        let input = BreedInput {
            intent: "turn on the light and close door1".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![
                Rule {
                    id: "turn-on-light".into(),
                    premise: vec!["light=off".into()],
                    conclusion: "light=on;!light=off".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "close-door1".into(),
                    premise: vec!["door1=open".into()],
                    conclusion: "door1=closed;!door1=open".into(),
                    certainty: 1.0,
                },
            ],
            goals: vec![
                Goal {
                    id: "g1".into(),
                    predicate: "light".into(),
                    value: "on".into(),
                },
                Goal {
                    id: "g2".into(),
                    predicate: "door1".into(),
                    value: "closed".into(),
                },
            ],
            state: vec![
                StateAtom {
                    predicate: "light".into(),
                    value: "off".into(),
                },
                StateAtom {
                    predicate: "door1".into(),
                    value: "open".into(),
                },
            ],
        };
        let out = Strips.run(&input).expect("should find a plan");
        assert_eq!(
            out.selected.as_deref(),
            Some("turn-on-light,close-door1"),
            "plan must be exactly [turn-on-light, close-door1] (Fikes & Nilsson 1971)"
        );
        // Verify via execute trace steps in correct order
        let executed: Vec<String> = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "execute")
            .map(|t| t.detail.clone())
            .collect();
        assert_eq!(
            executed,
            vec!["turn-on-light", "close-door1"],
            "execution trace must record exactly the 2 operators in order"
        );
    }

    /// Rank-2: a non-pre-satisfied, achievable goal must return a non-empty
    /// plan as `Some("act1,act2,...")` — verifies the positive (planned)
    /// branch still produces a comma-joined plan string.
    #[test]
    fn achievable_goal_returns_nonempty_plan_string() {
        let input = BreedInput {
            intent: "x".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![Rule {
                id: "act1".into(),
                premise: vec!["x=0".into()],
                conclusion: "y=1;!x=0".into(),
                certainty: 1.0,
            }],
            goals: vec![Goal {
                id: "g".into(),
                predicate: "y".into(),
                value: "1".into(),
            }],
            state: vec![StateAtom {
                predicate: "x".into(),
                value: "0".into(),
            }],
        };
        let out = Strips.run(&input).expect("run ok");
        assert_eq!(
            out.selected.as_deref(),
            Some("act1"),
            "achievable goal must return Some(\"act1\")"
        );
        // No pre-satisfied trace step since the goal wasn't initially met.
        assert!(!out
            .inference_trace
            .iter()
            .any(|t| t.kind == "check-presatisfied"));
    }
}
