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

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
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
            let def = actions
                .entry(name.to_string())
                .or_insert_with(|| ActionDef {
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
        let has_action_facts = input.facts.iter().any(|f| {
            f.key.starts_with("action:")
                || f.key.starts_with("do:")
                || f.key.starts_with("poss:")
                || f.key.starts_with("sc:")
        });
        if !input.goals.is_empty() && input.rules.is_empty() && !has_action_facts {
            return Err(
                "situation_calculus requires at least one successor-state axiom rule".to_string(),
            );
        }
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
                    format!(
                        "fluent '{}' persists by inertia across {} steps",
                        f,
                        sequence.len()
                    ),
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

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["regress-step"])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, Fact};

    #[test]
    fn refuses_oversized_fluent_universe() {
        let mut facts = vec![Fact {
            key: "do:0".to_string(),
            value: "a1".to_string(),
        }];
        for i in 0..65 {
            facts.push(Fact {
                key: "action:a1:add".to_string(),
                value: format!("f{}", i),
            });
        }
        let input = BreedInput {
            intent: "sitcalc".to_string(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let err = SituationCalculus.run(&input).unwrap_err();
        assert!(err.message.contains("fluents > 64"));
    }

    #[test]
    fn refuses_missing_precondition() {
        let input = BreedInput {
            intent: "sitcalc".to_string(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "action:a1:pre".into(),
                    value: "f1".into(),
                },
                Fact {
                    key: "do:0".into(),
                    value: "a1".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let err = SituationCalculus.run(&input).unwrap_err();
        assert!(err.message.contains("precondition 'f1' does not hold"));
    }

    /// Falsification: Reiter 1991 blocks-world pickup/putdown fixture.
    /// After pickup_a then putdown_a: on_a_table, on_b_table, clear_a, clear_b,
    /// handempty, color_b_red must hold; on_a_b and holding_a must not.
    /// on_b_table and color_b_red persist by Reiter inertia (frame-persist trace).
    #[test]
    fn paper_fixture_blocks_world_pickup_putdown() {
        let input = BreedInput {
            intent: "blocks world".to_string(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "fluent:on_a_b".into(),
                    value: "true".into(),
                },
                Fact {
                    key: "fluent:on_b_table".into(),
                    value: "true".into(),
                },
                Fact {
                    key: "fluent:clear_a".into(),
                    value: "true".into(),
                },
                Fact {
                    key: "fluent:handempty".into(),
                    value: "true".into(),
                },
                Fact {
                    key: "fluent:color_b_red".into(),
                    value: "true".into(),
                },
                Fact {
                    key: "action:pickup_a:pre".into(),
                    value: "clear_a".into(),
                },
                Fact {
                    key: "action:pickup_a:pre".into(),
                    value: "handempty".into(),
                },
                Fact {
                    key: "action:pickup_a:pre".into(),
                    value: "on_a_b".into(),
                },
                Fact {
                    key: "action:pickup_a:add".into(),
                    value: "holding_a".into(),
                },
                Fact {
                    key: "action:pickup_a:add".into(),
                    value: "clear_b".into(),
                },
                Fact {
                    key: "action:pickup_a:del".into(),
                    value: "on_a_b".into(),
                },
                Fact {
                    key: "action:pickup_a:del".into(),
                    value: "handempty".into(),
                },
                Fact {
                    key: "action:pickup_a:del".into(),
                    value: "clear_a".into(),
                },
                Fact {
                    key: "action:putdown_a:pre".into(),
                    value: "holding_a".into(),
                },
                Fact {
                    key: "action:putdown_a:add".into(),
                    value: "on_a_table".into(),
                },
                Fact {
                    key: "action:putdown_a:add".into(),
                    value: "handempty".into(),
                },
                Fact {
                    key: "action:putdown_a:add".into(),
                    value: "clear_a".into(),
                },
                Fact {
                    key: "action:putdown_a:del".into(),
                    value: "holding_a".into(),
                },
                Fact {
                    key: "do:0".into(),
                    value: "pickup_a".into(),
                },
                Fact {
                    key: "do:1".into(),
                    value: "putdown_a".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = SituationCalculus.run(&input).unwrap();
        assert_eq!(
            out.selected.as_deref(),
            Some("s2"),
            "must end in situation s2"
        );
        let holds: Vec<String> = out
            .facts
            .iter()
            .filter(|f| f.key.starts_with("holds:"))
            .map(|f| f.key["holds:".len()..].to_string())
            .collect();
        // Must hold after sequence (Reiter 1991 expected)
        for f in &[
            "on_a_table",
            "on_b_table",
            "clear_a",
            "clear_b",
            "handempty",
            "color_b_red",
        ] {
            assert!(
                holds.contains(&f.to_string()),
                "fluent '{}' must hold in final situation (Reiter 1991)",
                f
            );
        }
        // Must NOT hold
        for f in &["on_a_b", "holding_a"] {
            assert!(
                !holds.contains(&f.to_string()),
                "fluent '{}' must NOT hold in final situation (Reiter 1991)",
                f
            );
        }
        // Frame inertia: on_b_table and color_b_red persist untouched
        let frame_persist_details: Vec<String> = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "frame-persist")
            .map(|t| t.detail.clone())
            .collect();
        assert!(
            frame_persist_details
                .iter()
                .any(|d| d.contains("on_b_table")),
            "on_b_table must appear in a frame-persist step (Reiter 1991 inertia)"
        );
        assert!(
            frame_persist_details
                .iter()
                .any(|d| d.contains("color_b_red")),
            "color_b_red must appear in a frame-persist step (Reiter 1991 inertia)"
        );
    }

    #[test]
    fn falsification_gate_successor_state_axiom() {
        let input = BreedInput {
            intent: "sitcalc".to_string(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "fluent:f1".into(),
                    value: "true".into(),
                },
                Fact {
                    key: "fluent:f2".into(),
                    value: "true".into(),
                },
                // a1 requires f1, adds f3, deletes f1
                Fact {
                    key: "action:a1:pre".into(),
                    value: "f1".into(),
                },
                Fact {
                    key: "action:a1:add".into(),
                    value: "f3".into(),
                },
                Fact {
                    key: "action:a1:del".into(),
                    value: "f1".into(),
                },
                // a2 requires f2 and f3, adds f4, deletes f2
                Fact {
                    key: "action:a2:pre".into(),
                    value: "f2".into(),
                },
                Fact {
                    key: "action:a2:pre".into(),
                    value: "f3".into(),
                },
                Fact {
                    key: "action:a2:add".into(),
                    value: "f4".into(),
                },
                Fact {
                    key: "action:a2:del".into(),
                    value: "f2".into(),
                },
                Fact {
                    key: "do:0".into(),
                    value: "a1".into(),
                },
                Fact {
                    key: "do:1".into(),
                    value: "a2".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = SituationCalculus.run(&input).unwrap();
        assert_eq!(out.selected.as_deref(), Some("s2"));
        let mut final_fluents: Vec<String> = out
            .facts
            .iter()
            .filter(|f| f.key.starts_with("holds:"))
            .map(|f| f.key.trim_start_matches("holds:").to_string())
            .collect();
        final_fluents.sort();
        assert_eq!(final_fluents, vec!["f3", "f4"]);
    }

    #[test]
    fn invariant_nop_action_preserves_situation() {
        let input = BreedInput {
            intent: "sitcalc".to_string(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "fluent:f1".into(),
                    value: "true".into(),
                },
                // Action 'nop' has no adds or dels, just a precondition
                Fact {
                    key: "action:nop:pre".into(),
                    value: "f1".into(),
                },
                Fact {
                    key: "do:0".into(),
                    value: "nop".into(),
                },
                Fact {
                    key: "do:1".into(),
                    value: "nop".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = SituationCalculus.run(&input).unwrap();
        let final_fluents: Vec<String> = out
            .facts
            .iter()
            .filter(|f| f.key.starts_with("holds:"))
            .map(|f| f.key.trim_start_matches("holds:").to_string())
            .collect();
        assert_eq!(final_fluents, vec!["f1"]);

        let persists = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "frame-persist")
            .count();
        assert_eq!(persists, 1);
    }
}
