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

        // Pick selected: highest-CF conclusion key=value pair.
        let mut best: Option<(String, f32)> = None;
        for (k, v) in working_memory.iter() {
            if k.contains('=') && *v > 0.0 {
                if best.as_ref().map_or(true, |(_, bv)| *v > *bv) {
                    best = Some((k.clone(), *v));
                }
            }
        }
        let selected = best.map(|(k, _)| k);

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
            return Err("MYCIN fired 0 rules — no evidence of inference when rules were provided".to_string());
        }
        Ok(())
    }
}
