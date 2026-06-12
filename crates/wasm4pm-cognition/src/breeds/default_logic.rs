//! Default logic — Reiter 1980 (normal defaults with justifications).
//!
//! Rules encode semi-normal defaults:
//! - plain premise atoms are prerequisites,
//! - `unless:<atom>` premise entries are justifications (the default is
//!   blocked if `<atom>` is in the extension at evaluation time),
//! - `not_<atom>` conclusions encode classical negation atoms.
//!
//! Semantics (documented deviation from full Reiter extension enumeration,
//! sanctioned by the P1 plan's "deterministic fixpoint in specificity
//! order"): defaults are applied to fixpoint in a fixed specificity order
//! (premise count desc, certainty desc, lex id), so more specific rules fire
//! before less specific defaults and block them. After the fixpoint, every
//! fired rule's justifications are RE-VALIDATED against the final extension;
//! if a violator was derived after a default fired, the run is refused (the
//! computed set would not be a Reiter extension under this order).
//!
//! Trace kinds: `default-load`(1,1) → {`default-fire`,`default-block`}(1,*)
//! → `default-extension`(1,1).

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};
use crate::breeds::support::trace_query::TraceQuery;

/// Reiter default-logic breed.
pub struct DefaultLogic;

impl CognitionBreed for DefaultLogic {
    fn id(&self) -> BreedId {
        BreedId::DefaultLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "reiter_normal_defaults".to_string(),
            "nonmonotonic_reasoning".to_string(),
            "specificity_fixpoint".to_string(),
            "justification_blocking".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("default_logic requires at least one rule".to_string());
        }
        if input.facts.is_empty() {
            return Err("default_logic requires at least one fact".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        trace.push(TraceStep {
            step: 0,
            kind: "default-load".to_string(),
            detail: format!(
                "loaded {} rules over {} facts",
                input.rules.len(),
                input.facts.len()
            ),
            depth: 0,
            objects: vec![],
        });

        let mut extension: BTreeSet<String> =
            input.facts.iter().map(|f| f.value.clone()).collect();

        let mut rules = input.rules.clone();
        // Specificity order: REAL prerequisite count desc (justifications
        // excluded), certainty desc, lex id asc.
        let prereq_count =
            |r: &crate::breeds::Rule| r.premise.iter().filter(|p| !p.starts_with("unless:")).count();
        rules.sort_by(|a, b| {
            prereq_count(b)
                .cmp(&prereq_count(a))
                .then_with(|| {
                    b.certainty
                        .partial_cmp(&a.certainty)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| a.id.cmp(&b.id))
        });

        let mut fired_rules: BTreeSet<String> = BTreeSet::new();
        let mut blocked_rules: BTreeSet<String> = BTreeSet::new();
        // Justifications of fired rules, for final re-validation.
        let mut fired_justifications: BTreeMap<String, Vec<String>> = BTreeMap::new();

        loop {
            let mut changed = false;
            for rule in &rules {
                if fired_rules.contains(&rule.id) || blocked_rules.contains(&rule.id) {
                    continue;
                }
                let mut prereqs_met = true;
                let mut justification_violator = None;
                let mut justifications = Vec::new();
                for p in &rule.premise {
                    if let Some(violator) = p.strip_prefix("unless:") {
                        justifications.push(violator.to_string());
                        if extension.contains(violator) {
                            justification_violator = Some(violator.to_string());
                        }
                    } else if !extension.contains(p) {
                        prereqs_met = false;
                        break;
                    }
                }
                if prereqs_met {
                    if let Some(violator) = justification_violator {
                        trace.push(TraceStep {
                            step: trace.len(),
                            kind: "default-block".to_string(),
                            detail: format!("rule {} blocked by violator {}", rule.id, violator),
                            depth: 0,
                            objects: vec![("rule".to_string(), rule.id.clone())],
                        });
                        blocked_rules.insert(rule.id.clone());
                    } else {
                        trace.push(TraceStep {
                            step: trace.len(),
                            kind: "default-fire".to_string(),
                            detail: format!("fired rule {} inferring {}", rule.id, rule.conclusion),
                            depth: 0,
                            objects: vec![("rule".to_string(), rule.id.clone())],
                        });
                        extension.insert(rule.conclusion.clone());
                        fired_rules.insert(rule.id.clone());
                        fired_justifications.insert(rule.id.clone(), justifications);
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }

        // Re-validate every fired rule's justifications against the FINAL
        // extension (DL-1 audit fix): a late-derived violator means the
        // computed set is not a Reiter extension under this order.
        for (rule_id, justifications) in &fired_justifications {
            for j in justifications {
                if extension.contains(j) {
                    return Err(BreedError {
                        breed: BreedId::DefaultLogic,
                        message: format!(
                            "not a Reiter extension: rule {} fired but justification violator {} was derived later",
                            rule_id, j
                        ),
                    });
                }
            }
        }

        if fired_rules.is_empty() && blocked_rules.is_empty() {
            return Err(BreedError {
                breed: BreedId::DefaultLogic,
                message: "no default fired or was blocked (rules never applicable)".to_string(),
            });
        }

        let sorted_extension: Vec<String> = extension.into_iter().collect(); // BTreeSet: sorted
        let ext_str = sorted_extension.join(", ");

        trace.push(TraceStep {
            step: trace.len(),
            kind: "default-extension".to_string(),
            detail: format!("extension: {}", ext_str),
            depth: 0,
            objects: vec![("decision".to_string(), "extension".to_string())],
        });

        let facts: Vec<Fact> = sorted_extension
            .iter()
            .map(|v| Fact {
                key: format!("ext:{}", v),
                value: v.clone(),
            })
            .collect();

        Ok(BreedOutput {
            breed: BreedId::DefaultLogic,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(ext_str.clone()),
            explanation: format!(
                "default logic extension with {} atoms ({} fired, {} blocked)",
                sorted_extension.len(),
                fired_rules.len(),
                blocked_rules.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["default-extension"])?;
        if !output
            .inference_trace
            .iter()
            .any(|t| t.kind == "default-fire" || t.kind == "default-block")
        {
            return Err("trace must contain at least one default-fire or default-block".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, Fact, Rule};

    #[test]
    fn refuses_no_rules_or_facts() {
        let breed = DefaultLogic;
        let input = BreedInput::default();
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn refuses_late_derived_violator() {
        let breed = DefaultLogic;
        let input = BreedInput {
            facts: vec![Fact { key: "f".into(), value: "A".into() }],
            rules: vec![
                Rule {
                    id: "r1".into(),
                    premise: vec!["A".into(), "unless:B".into()],
                    conclusion: "C".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "r2".into(),
                    premise: vec!["C".into()],
                    conclusion: "B".into(),
                    certainty: 1.0,
                },
            ],
            ..Default::default()
        };
        let res = breed.run(&input);
        assert!(res.is_err());
        assert!(res.unwrap_err().message.contains("derived later"));
    }


    #[test]
    fn falsification_tweety_penguin_reiter_1980() {
        // Reiter 1980 Section 1.1 — canonical Tweety example.
        // Tweety is a penguin; penguins are birds; birds fly by default UNLESS not_flies.
        // The extension must contain {penguin, bird, not_flies} and must NOT contain flies.
        // Verbatim from tests/fixtures/papers/default_logic.json.
        let breed = DefaultLogic;
        let input = BreedInput {
            facts: vec![Fact { key: "obs:tweety".into(), value: "penguin".into() }],
            rules: vec![
                Rule {
                    id: "r_isa".into(),
                    premise: vec!["penguin".into()],
                    conclusion: "bird".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "r_penguin".into(),
                    premise: vec!["penguin".into()],
                    conclusion: "not_flies".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "r_birds_fly".into(),
                    premise: vec!["bird".into(), "unless:not_flies".into()],
                    conclusion: "flies".into(),
                    certainty: 0.9,
                },
            ],
            ..Default::default()
        };
        let out = breed.run(&input).expect("Tweety run must succeed");
        let ext = out.selected.as_deref().unwrap_or("");
        // Extension must contain these atoms.
        for atom in &["bird", "not_flies", "penguin"] {
            assert!(
                ext.split(", ").any(|a| a == *atom),
                "extension must contain '{}'; got: {}",
                atom,
                ext
            );
        }
        // Extension must NOT contain 'flies' — the default is blocked by not_flies.
        assert!(
            !ext.split(", ").any(|a| a == "flies"),
            "extension must NOT contain 'flies' (Tweety cannot fly); got: {}",
            ext
        );
        // A block step must appear in the trace.
        assert!(
            out.inference_trace.iter().any(|t| t.kind == "default-block"),
            "trace must include a default-block step for r_birds_fly"
        );
    }

    #[test]
    fn invariant_idempotency() {
        let breed = DefaultLogic;
        let input = BreedInput {
            facts: vec![Fact { key: "f".into(), value: "A".into() }],
            rules: vec![
                Rule {
                    id: "r1".into(),
                    premise: vec!["A".into(), "unless:B".into()],
                    conclusion: "C".into(),
                    certainty: 1.0,
                },
            ],
            ..Default::default()
        };
        let out1 = breed.run(&input).unwrap();
        
        let new_facts: Vec<Fact> = out1.facts.clone();
        let input2 = BreedInput {
            facts: new_facts,
            rules: input.rules.clone(),
            ..Default::default()
        };
        let out2 = breed.run(&input2).unwrap();
        
        assert_eq!(out1.selected, out2.selected);
    }
}
