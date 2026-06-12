//! MYCIN-style forward-chaining rule engine with Shortliffe-Buchanan
//! certainty-factor combination (Shortliffe 1976).
//!
//! Algorithm:
//! 1. Working memory holds (key, value) → CF mappings.
//! 2. Each iteration: select highest |certainty| rule whose premise is
//!    satisfied (lex-tiebreak on rule id) and which has not yet fired.
//! 3. Premise CF is the min of the CFs of the premise atoms.
//! 4. New conclusion CF is `combine_cf(existing, rule.certainty * premise_cf)`.
//! 5. Loop terminates when no further rule is applicable, or after
//!    `2 * rules.len()` iterations (cycle defence).

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::support::certainty::combine_cf;
use std::collections::{BTreeMap, BTreeSet};
use tracing;

/// MYCIN production-rule engine.
pub struct Mycin;

fn premise_satisfied(premise: &str, working_memory: &BTreeMap<String, f32>) -> Option<f32> {
    working_memory.get(premise).copied().filter(|cf| *cf > 0.2)
}

impl CognitionBreed for Mycin {
    fn id(&self) -> BreedId {
        BreedId::Mycin
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "forward_chaining".to_string(),
            "certainty_factors".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("MYCIN requires at least one rule".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut working_memory: BTreeMap<String, f32> = BTreeMap::new();
        for f in &input.facts {
            let key = format!("{}={}", f.key, f.value);
            working_memory.insert(key, 1.0);
            working_memory.insert(f.value.clone(), 1.0);
        }

        let mut fired: BTreeSet<String> = BTreeSet::new();
        // Keys derived by rule conclusions (distinguishes inferences from seed facts).
        let mut derived: BTreeSet<String> = BTreeSet::new();
        // Premises consumed by fired rules (a conclusion used downstream is not terminal).
        let mut consumed_premises: BTreeSet<String> = BTreeSet::new();
        let mut trace: Vec<TraceStep> = Vec::new();
        let max_iters = input.rules.len().saturating_mul(2);

        for _ in 0..max_iters {
            let mut applicable: Vec<(usize, f32)> = Vec::new();
            for (idx, rule) in input.rules.iter().enumerate() {
                if fired.contains(&rule.id) {
                    continue;
                }
                let mut min_cf = 1.0_f32;
                let mut all_sat = true;
                for p in &rule.premise {
                    match premise_satisfied(p, &working_memory) {
                        Some(cf) => min_cf = min_cf.min(cf),
                        None => {
                            all_sat = false;
                            break;
                        }
                    }
                }
                if all_sat {
                    applicable.push((idx, min_cf));
                }
            }
            if applicable.is_empty() {
                tracing::debug!(breed.step = "threshold_checked", "MYCIN L1 step");
                break;
            }
            applicable.sort_by(|(ai, _), (bi, _)| {
                let ar = &input.rules[*ai];
                let br = &input.rules[*bi];
                br.certainty
                    .abs()
                    .partial_cmp(&ar.certainty.abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| ar.id.cmp(&br.id))
            });
            let (idx, premise_cf) = applicable[0];
            let rule = &input.rules[idx];
            fired.insert(rule.id.clone());

            tracing::debug!(breed.step = "rule_selected", rule_id = %rule.id, "MYCIN L1 step");
            tracing::debug!(
                breed.step = "premise_matched",
                matched = true,
                "MYCIN L1 step"
            );

            let inferred_cf = rule.certainty * premise_cf;
            let prev = working_memory.get(&rule.conclusion).copied().unwrap_or(0.0);
            let new_cf = combine_cf(prev, inferred_cf);
            working_memory.insert(rule.conclusion.clone(), new_cf);
            derived.insert(rule.conclusion.clone());
            for p in &rule.premise {
                consumed_premises.insert(p.clone());
            }

            tracing::debug!(breed.step = "cf_accumulated", "MYCIN L1 step");

            trace.push(TraceStep {
                step: trace.len(),
                kind: "fire-rule".to_string(),
                detail: format!("{} ⇒ {} (cf={:.3})", rule.id, rule.conclusion, new_cf),
                depth: 0,
                objects: vec![],
            });
        }

        // Pick selected: the diagnostic answer is the terminal conclusion of the
        // inference chain — a rule-derived conclusion that is NOT itself consumed as
        // a premise by any fired rule (e.g. therapy=penicillin, not the intermediate
        // organism=streptococcus). Seed facts are excluded entirely. Among terminal
        // conclusions, highest CF wins; tiebreak = smallest key (deterministic).
        // Fallback: if every derived conclusion feeds another rule (cyclic/no leaf),
        // select the highest-CF derived conclusion outright.
        let select_from = |only_terminal: bool| -> Option<String> {
            let mut candidates: Vec<(String, f32)> = working_memory
                .iter()
                .filter(|(k, _)| derived.contains(*k))
                .filter(|(k, _)| !only_terminal || !consumed_premises.contains(*k))
                .filter(|(_, v)| **v > 0.0)
                .map(|(k, v)| (k.clone(), *v))
                .collect();
            candidates.sort_by(|(ak, av), (bk, bv)| bv.total_cmp(av).then_with(|| ak.cmp(bk)));
            candidates.into_iter().next().map(|(k, _)| k)
        };
        let selected = select_from(true).or_else(|| select_from(false));

        let original: BTreeSet<String> = input
            .facts
            .iter()
            .map(|f| format!("{}={}", f.key, f.value))
            .collect();
        let mut new_facts: Vec<Fact> = Vec::new();
        for (k, cf) in working_memory.iter() {
            if !original.contains(k) && *cf > 0.0 {
                if let Some((kk, vv)) = k.split_once('=') {
                    new_facts.push(Fact {
                        key: kk.to_string(),
                        value: vv.to_string(),
                    });
                } else {
                    new_facts.push(Fact {
                        key: k.clone(),
                        value: format!("cf={:.3}", cf),
                    });
                }
            }
        }
        new_facts.sort_by(|a, b| a.key.cmp(&b.key).then_with(|| a.value.cmp(&b.value)));

        let explanation = format!(
            "MYCIN fired {} rules; final selection {:?}",
            trace.len(),
            selected
        );

        tracing::debug!(breed.step = "diagnosis_emitted", "MYCIN L1 step");

        Ok(BreedOutput {
            breed: BreedId::Mycin,
            candidates: input.candidates.clone(),
            facts: new_facts,
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
    use crate::breeds::{BreedInput, Fact, Rule};

    fn make_input(facts: Vec<Fact>, rules: Vec<Rule>) -> BreedInput {
        BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules,
            goals: vec![],
            state: vec![],
        }
    }

    // CF exactly 0.2 should NOT propagate (premise_satisfied requires CF > 0.2)
    #[test]
    fn test_cf_threshold_boundary_below() {
        let input = make_input(
            vec![Fact {
                key: "x".into(),
                value: "1".into(),
            }],
            vec![
                Rule {
                    id: "r1".into(),
                    premise: vec!["x=1".into()],
                    conclusion: "y=boundary".into(),
                    certainty: 0.2,
                },
                Rule {
                    id: "r2".into(),
                    premise: vec!["y=boundary".into()],
                    conclusion: "z=reached".into(),
                    certainty: 0.9,
                },
            ],
        );
        let output = Mycin.run(&input).expect("run ok");
        let r2_fired = output
            .inference_trace
            .iter()
            .any(|t| t.detail.contains("z=reached"));
        assert!(
            !r2_fired,
            "r2 must not fire when premise CF == 0.2 (strict > 0.2 threshold)"
        );
    }

    // CF 0.201 is above threshold → chained rule fires
    #[test]
    fn test_cf_threshold_boundary_above() {
        let input = make_input(
            vec![Fact {
                key: "x".into(),
                value: "1".into(),
            }],
            vec![
                Rule {
                    id: "r1".into(),
                    premise: vec!["x=1".into()],
                    conclusion: "y=above".into(),
                    certainty: 0.201,
                },
                Rule {
                    id: "r2".into(),
                    premise: vec!["y=above".into()],
                    conclusion: "z=reached".into(),
                    certainty: 0.9,
                },
            ],
        );
        let output = Mycin.run(&input).expect("run ok");
        let r2_fired = output
            .inference_trace
            .iter()
            .any(|t| t.detail.contains("z=reached"));
        assert!(r2_fired, "r2 must fire when premise CF > 0.2");
    }

    // Tie-break: when two inferred conclusions share the highest CF, smallest key wins.
    // We produce two k=v conclusions of identical certainty and verify the selected
    // is the lexicographically smaller one. The seed fact value is seeded as a bare
    // string (no '='), so it cannot appear as selected.
    #[test]
    fn test_tie_break_smallest_key_wins() {
        // Seed: "status" = "active"  → WM gets "status=active"=1.0 AND "active"=1.0
        // "status=active" contains '=' so it will compete. We need it NOT to outrank
        // our two conclusions. Give conclusions CF > 1.0? No, CF is clamped to 1.0.
        // Instead: make the seed fact NOT produce a k=v entry that contains '='.
        // The seed inserts "status=active" (CF=1.0). Both rule conclusions are 0.7.
        // "status=active" (1.0) wins. So this test verifies determinism of the seed
        // value itself AND that tie between inferred conclusions is broken by key order.
        // For a pure tie-break test, use certainty 1.0 for both conclusions:
        let input = make_input(
            vec![Fact {
                key: "trigger".into(),
                value: "on".into(),
            }],
            vec![
                Rule {
                    id: "r-z".into(),
                    premise: vec!["trigger=on".into()],
                    conclusion: "z=winner".into(),
                    certainty: 1.0,
                },
                Rule {
                    id: "r-a".into(),
                    premise: vec!["trigger=on".into()],
                    conclusion: "a=winner".into(),
                    certainty: 1.0,
                },
            ],
        );
        let output = Mycin.run(&input).expect("run ok");
        // trigger=on seeded at CF=1.0; both z=winner and a=winner inferred at CF=1.0.
        // Three candidates tie at CF=1.0. Sorted by key ascending: "a=winner" < "trigger=on" < "z=winner".
        // Smallest key wins → selected == "a=winner".
        assert_eq!(
            output.selected.as_deref(),
            Some("a=winner"),
            "smallest key must win tie"
        );
    }

    /// Shortliffe & Buchanan 1975, §11.2 (p.238) + §11.4 (p.247):
    /// RULE050: gram-positive + coccus + chains → organism=streptococcus (CF 0.7)
    /// RULE071: organism=streptococcus + allergy-penicillin=no → therapy=penicillin (CF 0.9)
    /// Combined: organism_cf = 0.7 (direct rule); therapy_cf = 0.9 × 0.7 = 0.63
    #[test]
    fn shortliffe_1975_organism_cf_07_therapy_cf_063() {
        use crate::breeds::support::certainty::combine_cf;
        let input = make_input(
            vec![
                Fact { key: "gram-stain".into(), value: "gram-positive".into() },
                Fact { key: "morphology".into(), value: "coccus".into() },
                Fact { key: "growth-conformation".into(), value: "chains".into() },
                Fact { key: "site".into(), value: "blood".into() },
                Fact { key: "allergy-penicillin".into(), value: "no".into() },
            ],
            vec![
                Rule {
                    id: "RULE050-class".into(),
                    premise: vec![
                        "gram-positive".into(),
                        "coccus".into(),
                        "chains".into(),
                    ],
                    conclusion: "organism=streptococcus".into(),
                    certainty: 0.7,
                },
                Rule {
                    id: "RULE071-class".into(),
                    premise: vec![
                        "organism=streptococcus".into(),
                        "allergy-penicillin=no".into(),
                    ],
                    conclusion: "therapy=penicillin".into(),
                    certainty: 0.9,
                },
            ],
        );
        let output = Mycin.run(&input).expect("run ok");

        // organism_cf = 0.7 (rule certainty * min premise CF = 0.7 * 1.0)
        let organism_cf = output.inference_trace.iter()
            .find(|t| t.kind == "fire-rule" && t.detail.contains("organism=streptococcus"))
            .expect("RULE050 must fire");
        assert!(organism_cf.detail.contains("0.700"), "organism CF must be 0.700, got: {}", organism_cf.detail);

        // therapy_cf = 0.9 * 0.7 = 0.63 (rule certainty * premise CF)
        let therapy_step = output.inference_trace.iter()
            .find(|t| t.kind == "fire-rule" && t.detail.contains("therapy=penicillin"))
            .expect("RULE071 must fire");
        assert!(therapy_step.detail.contains("0.630"), "therapy CF must be 0.630, got: {}", therapy_step.detail);

        // The terminal conclusion is therapy=penicillin (not the intermediate organism)
        assert_eq!(output.selected.as_deref(), Some("therapy=penicillin"),
            "terminal conclusion must be therapy=penicillin");
    }

    // Cycle defence: A→B cycle terminates within 2*rules.len() iterations
    #[test]
    fn test_cycle_defence() {
        let input = make_input(
            vec![Fact {
                key: "a".into(),
                value: "start".into(),
            }],
            vec![
                Rule {
                    id: "r1".into(),
                    premise: vec!["a=start".into()],
                    conclusion: "b=mid".into(),
                    certainty: 0.9,
                },
                Rule {
                    id: "r2".into(),
                    premise: vec!["b=mid".into()],
                    conclusion: "a=cycle".into(),
                    certainty: 0.8,
                },
            ],
        );
        let output = Mycin.run(&input).expect("cycle must terminate");
        assert!(
            output.inference_trace.len() <= 4,
            "cycle must terminate; trace len={}",
            output.inference_trace.len()
        );
    }
}
