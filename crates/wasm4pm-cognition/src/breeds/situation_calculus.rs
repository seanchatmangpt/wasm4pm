//! Situation calculus with Reiter successor-state axioms (Reiter 1991).
//!
//! The situation calculus solves the frame problem via successor-state
//! axioms: a fluent holds after `do(a, s)` iff the action added it, or it
//! held in `s` and the action did not delete it. This module implements
//! progression of an initial situation through an ordered action sequence,
//! recording one `regress-step` per action (the lifecycle kind named after
//! the regression operator of Reiter's axiomatization) and one
//! `frame-persist` step per initial fluent that survives the entire
//! sequence untouched — machine evidence that frame inertia, not
//! re-derivation, carried the fluent forward.
//!
//! Fact contract:
//! - `fluent:<f>`        — fluent `<f>` holds in the initial situation S0
//! - `action:<a>:pre`    — value names a precondition fluent of action `<a>` (repeatable)
//! - `action:<a>:add`    — value names a fluent added by `<a>` (repeatable)
//! - `action:<a>:del`    — value names a fluent deleted by `<a>` (repeatable)
//! - `do:<n>`            — value names the action executed at step `<n>` (0-based, contiguous)
//!
//! Caps (refusals, never silent truncation): ≤64 fluents, ≤32 steps.

use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
use std::collections::{BTreeMap, BTreeSet};

/// Reiter successor-state-axiom progression engine.
pub struct SituationCalculus;

struct ActionDef {
    pre: BTreeSet<String>,
    add: BTreeSet<String>,
    del: BTreeSet<String>,
}

fn parse_domain(
    input: &BreedInput,
) -> Result<(BTreeSet<String>, BTreeMap<String, ActionDef>, Vec<String>), String> {
    let mut fluents: BTreeSet<String> = BTreeSet::new();
    let mut actions: BTreeMap<String, ActionDef> = BTreeMap::new();
    let mut do_steps: BTreeMap<usize, String> = BTreeMap::new();

    for f in &input.facts {
        if let Some(name) = f.key.strip_prefix("fluent:") {
            fluents.insert(name.to_string());
        } else if let Some(rest) = f.key.strip_prefix("action:") {
            let (name, slot) = rest
                .rsplit_once(':')
                .ok_or_else(|| format!("malformed action fact key '{}'", f.key))?;
            let def = actions.entry(name.to_string()).or_insert_with(|| ActionDef {
                pre: BTreeSet::new(),
                add: BTreeSet::new(),
                del: BTreeSet::new(),
            });
            match slot {
                "pre" => {
                    def.pre.insert(f.value.clone());
                }
                "add" => {
                    def.add.insert(f.value.clone());
                }
                "del" => {
                    def.del.insert(f.value.clone());
                }
                other => return Err(format!("unknown action slot '{}' in '{}'", other, f.key)),
            }
        } else if let Some(n) = f.key.strip_prefix("do:") {
            let idx: usize = n
                .parse()
                .map_err(|_| format!("non-numeric do index '{}'", n))?;
            do_steps.insert(idx, f.value.clone());
        }
    }

    // do: indices must be contiguous from 0.
    let mut sequence: Vec<String> = Vec::new();
    for (expected, (idx, action)) in do_steps.iter().enumerate() {
        if *idx != expected {
            return Err(format!(
                "do: sequence must be contiguous from 0; missing do:{}",
                expected
            ));
        }
        sequence.push(action.clone());
    }
    Ok((fluents, actions, sequence))
}

impl CognitionBreed for SituationCalculus {
    fn id(&self) -> BreedId {
        BreedId::SituationCalculus
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "successor_state_axioms".to_string(),
            "frame_problem_inertia".to_string(),
            "action_progression".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let (fluents, actions, sequence) = parse_domain(input)?;
        if sequence.is_empty() {
            return Err("situation_calculus requires at least one do:<n> action step".to_string());
        }
        if sequence.len() > 32 {
            return Err(format!(
                "complexity cap exceeded: {} action steps > 32 (refusal, not truncation)",
                sequence.len()
            ));
        }
        // Count the full fluent universe (initial + every add/del mention).
        let mut universe = fluents.clone();
        for def in actions.values() {
            universe.extend(def.pre.iter().cloned());
            universe.extend(def.add.iter().cloned());
            universe.extend(def.del.iter().cloned());
        }
        if universe.len() > 64 {
            return Err(format!(
                "complexity cap exceeded: {} fluents > 64 (refusal, not truncation)",
                universe.len()
            ));
        }
        for a in &sequence {
            if !actions.contains_key(a) {
                return Err(format!("do step references undefined action '{}'", a));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        self.preconditions(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;
        let (initial, actions, sequence) = parse_domain(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |trace: &mut Vec<TraceStep>, kind: &str, detail: String| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        push(
            &mut trace,
            "load-axioms",
            format!(
                "S0 |= {{{}}}; {} actions; {} steps",
                initial.iter().cloned().collect::<Vec<_>>().join(","),
                actions.len(),
                sequence.len()
            ),
        );

        let mut current = initial.clone();
        let mut touched: BTreeSet<String> = BTreeSet::new();

        for (n, a) in sequence.iter().enumerate() {
            let def = &actions[a];
            // Poss(a, s): all preconditions must hold in the current situation.
            for p in &def.pre {
                if !current.contains(p) {
                    return Err(BreedError {
                        breed: self.id(),
                        message: format!(
                            "action '{}' at step {} not possible: precondition '{}' does not hold",
                            a, n, p
                        ),
                    });
                }
            }
            // Successor-state axiom: F(do(a,s)) ≡ a adds F ∨ (F(s) ∧ a does not delete F).
            for d in &def.del {
                current.remove(d);
                touched.insert(d.clone());
            }
            for ad in &def.add {
                current.insert(ad.clone());
                touched.insert(ad.clone());
            }
            push(
                &mut trace,
                "regress-step",
                format!(
                    "do({}, s{}) -> s{}: +{{{}}} -{{{}}}",
                    a,
                    n,
                    n + 1,
                    def.add.iter().cloned().collect::<Vec<_>>().join(","),
                    def.del.iter().cloned().collect::<Vec<_>>().join(",")
                ),
            );
        }

        // Frame inertia: initial fluents never touched by any executed action.
        for f in &initial {
            if !touched.contains(f) {
                push(
                    &mut trace,
                    "frame-persist",
                    format!("fluent '{}' persists by inertia across {} steps", f, sequence.len()),
                );
            }
        }

        let final_situation: Vec<String> = current.iter().cloned().collect();
        push(
            &mut trace,
            "decision",
            format!("final situation |= {{{}}}", final_situation.join(",")),
        );

        let facts: Vec<Fact> = current
            .iter()
            .map(|f| Fact {
                key: format!("holds:{}", f),
                value: "true".to_string(),
            })
            .collect();

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: Some(format!("s{}", sequence.len())),
            explanation: format!(
                "situation_calculus progressed {} actions; {} fluents hold in the final situation; {} fluents persisted by frame inertia",
                sequence.len(),
                current.len(),
                initial.iter().filter(|f| !touched.contains(*f)).count()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace — no evidence of progression".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "regress-step") {
            return Err("no regress-step recorded — no action was progressed".to_string());
        }
        Ok(())
    }
}
