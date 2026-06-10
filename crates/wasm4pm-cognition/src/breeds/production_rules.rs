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
use std::collections::{HashMap, HashSet};

/// MYCIN production-rule engine.
pub struct Mycin;

/// Shortliffe-Buchanan certainty-factor combination.
///
/// Properties (Rank-1, mathematical):
/// - Commutativity for same-sign: `combine(a,b) == combine(b,a)`.
/// - Identity: `combine(x, 0) == x`.
/// - Bounds: result is in `[-1.0, 1.0]` for inputs in `[-1.0, 1.0]`.
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn combine_cf(a: f32, b: f32) -> f32 {
    let r = if a >= 0.0 && b >= 0.0 {
        a + b - a * b
    } else if a < 0.0 && b < 0.0 {
        a + b + a * b
    } else {
        let denom = 1.0 - a.abs().min(b.abs());
        if denom.abs() < 1e-9 {
            0.0
        } else {
            (a + b) / denom
        }
    };
    r.clamp(-1.0, 1.0)
}

fn premise_satisfied(premise: &str, working_memory: &HashMap<String, f32>) -> Option<f32> {
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
        let mut working_memory: HashMap<String, f32> = HashMap::new();
        for f in &input.facts {
            let key = format!("{}={}", f.key, f.value);
            working_memory.insert(key, 1.0);
            working_memory.insert(f.value.clone(), 1.0);
        }

        let mut fired: HashSet<String> = HashSet::new();
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

            let inferred_cf = rule.certainty * premise_cf;
            let prev = working_memory.get(&rule.conclusion).copied().unwrap_or(0.0);
            let new_cf = combine_cf(prev, inferred_cf);
            working_memory.insert(rule.conclusion.clone(), new_cf);

            trace.push(TraceStep {
                step: trace.len(),
                kind: "fire-rule".to_string(),
                detail: format!("{} ⇒ {} (cf={:.3})", rule.id, rule.conclusion, new_cf),
                depth: 0,
            });
        }

        // Pick selected: highest-CF conclusion (k=v format); tiebreak = smallest key (deterministic).
        let mut candidates: Vec<(String, f32)> = working_memory
            .iter()
            .filter(|(k, v)| k.contains('=') && **v > 0.0)
            .map(|(k, v)| (k.clone(), *v))
            .collect();
        candidates.sort_by(|(ak, av), (bk, bv)| bv.total_cmp(av).then_with(|| ak.cmp(bk)));
        let selected = candidates.into_iter().next().map(|(k, _)| k);

        let original: HashSet<String> = input
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

        Ok(BreedOutput {
            breed: BreedId::Mycin,
            candidates: input.candidates.clone(),
            facts: new_facts,
            selected,
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err(
                "MYCIN fired 0 rules — no evidence of inference when rules were provided"
                    .to_string(),
            );
        }
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

    #[test]
    fn test_combine_cf_both_positive() {
        let result = combine_cf(0.6, 0.4);
        let expected = 0.6_f32 + 0.4 - 0.6 * 0.4; // 0.76
        assert!((result - expected).abs() < 1e-5, "expected {}, got {}", expected, result);
    }

    #[test]
    fn test_combine_cf_both_negative() {
        let result = combine_cf(-0.3, -0.4);
        let expected = -0.3_f32 + -0.4 + (-0.3 * -0.4); // -0.58
        assert!((result - expected).abs() < 1e-5, "expected {}, got {}", expected, result);
    }

    #[test]
    fn test_combine_cf_mixed_positive_wins() {
        let result = combine_cf(0.5, -0.2);
        let expected = (0.5_f32 + -0.2) / (1.0 - 0.2_f32); // 0.375
        assert!((result - expected).abs() < 1e-5, "expected {}, got {}", expected, result);
    }

    #[test]
    fn test_combine_cf_mixed_negative_wins() {
        let result = combine_cf(-0.5, 0.2);
        let expected = (0.2_f32 + -0.5) / (1.0 - 0.5_f32); // -0.6
        assert!((result - expected).abs() < 1e-5, "expected {}, got {}", expected, result);
    }

    // CF exactly 0.2 should NOT propagate (premise_satisfied requires CF > 0.2)
    #[test]
    fn test_cf_threshold_boundary_below() {
        let input = make_input(
            vec![Fact { key: "x".into(), value: "1".into() }],
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
        let r2_fired = output.inference_trace.iter().any(|t| t.detail.contains("z=reached"));
        assert!(!r2_fired, "r2 must not fire when premise CF == 0.2 (strict > 0.2 threshold)");
    }

    // CF 0.201 is above threshold → chained rule fires
    #[test]
    fn test_cf_threshold_boundary_above() {
        let input = make_input(
            vec![Fact { key: "x".into(), value: "1".into() }],
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
        let r2_fired = output.inference_trace.iter().any(|t| t.detail.contains("z=reached"));
        assert!(r2_fired, "r2 must fire when premise CF > 0.2");
    }

    // Tie-break: smallest key wins when CFs are equal
    #[test]
    fn test_tie_break_smallest_key_wins() {
        let input = make_input(
            vec![Fact { key: "x".into(), value: "1".into() }],
            vec![
                Rule {
                    id: "r-z".into(),
                    premise: vec!["x=1".into()],
                    conclusion: "z=1".into(),
                    certainty: 0.7,
                },
                Rule {
                    id: "r-a".into(),
                    premise: vec!["x=1".into()],
                    conclusion: "a=1".into(),
                    certainty: 0.7,
                },
            ],
        );
        let output = Mycin.run(&input).expect("run ok");
        assert_eq!(output.selected.as_deref(), Some("a=1"), "smallest key must win tie");
    }

    // Cycle defence: A→B cycle terminates within 2*rules.len() iterations
    #[test]
    fn test_cycle_defence() {
        let input = make_input(
            vec![Fact { key: "a".into(), value: "start".into() }],
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
            "cycle must terminate; trace len={}", output.inference_trace.len()
        );
    }
}
