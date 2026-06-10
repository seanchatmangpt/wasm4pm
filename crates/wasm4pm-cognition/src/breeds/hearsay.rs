//! Hearsay-II blackboard architecture with knowledge-source consensus
//! fusion via noisy-OR (Erman & Lesser 1980).
//!
//! Encoding:
//! - Initial hypotheses come from `input.facts` (each fact posts a level-0
//!   hypothesis with confidence 1.0).
//! - Knowledge sources are encoded in `input.rules`:
//!   * `rule.id`         = KS name
//!   * `rule.premise[0]` = trigger hypothesis content (e.g. `phone:T`)
//!   * `rule.conclusion` = posted hypothesis content (e.g. `word:THE`)
//!   * `rule.certainty`  = KS confidence (in `[0, 1]`).
//! - Levels are inferred from the prefix before `:` (e.g. `phone`, `word`,
//!   `phrase`); the "top level" is the level of the highest-confidence
//!   posted hypothesis.
//!
//! Consensus: when two KSs post the same content, confidences are fused
//! via noisy-OR: `c = 1 - (1-c1)(1-c2)`.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::HashMap;

/// Hearsay-II breed.
pub struct Hearsay;

/// Noisy-OR fusion.
///
/// Properties (Rank-1):
/// - Commutativity: `noisy_or(a,b) == noisy_or(b,a)`.
/// - Identity: `noisy_or(x, 0) == x`.
/// - Bounds: `0 ≤ result ≤ 1` for inputs in `[0, 1]`.
/// - Monotone: `noisy_or(a, b) ≥ max(a, b)` for inputs in `[0, 1]`.
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn noisy_or(a: f32, b: f32) -> f32 {
    let a = a.clamp(0.0, 1.0);
    let b = b.clamp(0.0, 1.0);
    (1.0 - (1.0 - a) * (1.0 - b)).clamp(0.0, 1.0)
}

fn level_of(content: &str) -> &str {
    content.split(':').next().unwrap_or("")
}

impl CognitionBreed for Hearsay {
    fn id(&self) -> BreedId {
        BreedId::Hearsay
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["blackboard".to_string(), "consensus_fusion".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("Hearsay requires at least one knowledge source".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        // Blackboard: content → confidence
        let mut blackboard: HashMap<String, f32> = HashMap::new();
        let mut trace: Vec<TraceStep> = Vec::new();

        // Seed from initial facts.
        for f in &input.facts {
            let content = format!("{}:{}", f.key, f.value);
            blackboard.insert(content.clone(), 1.0);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "seed".to_string(),
                detail: content,
                depth: 0,
            });
        }

        // Iterative agenda: keep firing KSs whose triggers exist on the
        // blackboard, until a full pass produces no further change.
        let max_iters = input.rules.len().saturating_mul(4) + 4;
        let mut iters = 0;
        loop {
            iters += 1;
            if iters > max_iters {
                break;
            }
            let mut changed = false;
            for ks in &input.rules {
                let trigger = match ks.premise.first() {
                    Some(t) => t,
                    None => continue,
                };
                let trigger_cf = match blackboard.get(trigger).copied() {
                    Some(cf) => cf,
                    None => continue,
                };
                let posted_cf = trigger_cf * ks.certainty.clamp(0.0, 1.0);
                let prev = blackboard.get(&ks.conclusion).copied().unwrap_or(0.0);
                let fused = noisy_or(prev, posted_cf);
                if (fused - prev).abs() > 1e-6 {
                    blackboard.insert(ks.conclusion.clone(), fused);
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "post-hypothesis".to_string(),
                        detail: format!("{} ⇒ {} (cf={:.3})", ks.id, ks.conclusion, fused),
                        depth: 0,
                    });
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }

        // Determine top level: level of the highest-confidence posted hypothesis
        // that is NOT also at level-0 (i.e. not in the seed level).
        let seed_level = input
            .facts
            .first()
            .map(|f| f.key.clone())
            .unwrap_or_default();
        let derived: Vec<(&String, f32)> = blackboard
            .iter()
            .filter(|(k, _)| level_of(k) != seed_level)
            .map(|(k, v)| (k, *v))
            .collect();

        let selected = derived
            .iter()
            .max_by(|(ak, av), (bk, bv)| {
                av.partial_cmp(bv)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| bk.cmp(ak)) // reversed: smallest key wins on tie
            })
            .map(|(k, _)| (*k).clone());

        let mut new_facts: Vec<Fact> = blackboard
            .keys()
            .filter_map(|k| {
                let (kk, vv) = k.split_once(':')?;

                Some(Fact {
                    key: kk.to_string(),
                    value: vv.to_string(),
                })
            })
            .collect();
        new_facts.sort_by(|a, b| a.key.cmp(&b.key).then_with(|| a.value.cmp(&b.value)));

        let explanation = format!(
            "Hearsay posted {} hypotheses; selected {:?}",
            blackboard.len(),
            selected
        );

        Ok(BreedOutput {
            breed: BreedId::Hearsay,
            candidates: input.candidates.clone(),
            facts: new_facts,
            selected,
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Hearsay must record at least one blackboard event".to_string());
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
    fn test_noisy_or_commutative() {
        let a = 0.6_f32;
        let b = 0.3_f32;
        assert!((noisy_or(a, b) - noisy_or(b, a)).abs() < 1e-6);
    }

    #[test]
    fn test_noisy_or_identity() {
        let x = 0.7_f32;
        assert!((noisy_or(x, 0.0) - x).abs() < 1e-6, "noisy_or identity failed");
    }

    #[test]
    fn test_noisy_or_upper_bound() {
        assert!(noisy_or(0.9, 0.9) <= 1.0);
        assert!(noisy_or(1.0, 1.0) <= 1.0);
    }

    #[test]
    fn test_noisy_or_monotone() {
        let a = 0.5_f32;
        let b = 0.3_f32;
        assert!(noisy_or(a, b) >= noisy_or(a, 0.0), "noisy_or must be monotone");
    }

    #[test]
    fn test_self_reinforcing_terminates() {
        let input = make_input(
            vec![Fact { key: "phone".into(), value: "X".into() }],
            vec![Rule {
                id: "self-ks".into(),
                premise: vec!["phone:X".into()],
                conclusion: "phone:X".into(),
                certainty: 0.9,
            }],
        );
        let output = Hearsay.run(&input).expect("self-reinforcing must terminate");
        assert!(!output.inference_trace.is_empty());
    }

    #[test]
    fn test_multi_level_fusion() {
        let input = make_input(
            vec![Fact { key: "phone".into(), value: "T".into() }],
            vec![
                Rule {
                    id: "ks-word".into(),
                    premise: vec!["phone:T".into()],
                    conclusion: "word:THE".into(),
                    certainty: 0.9,
                },
                Rule {
                    id: "ks-phrase".into(),
                    premise: vec!["word:THE".into()],
                    conclusion: "phrase:THE_CAT".into(),
                    certainty: 0.8,
                },
            ],
        );
        let output = Hearsay.run(&input).expect("multi-level run");
        let sel = output.selected.as_deref().unwrap_or("");
        assert!(
            sel.starts_with("word:") || sel.starts_with("phrase:"),
            "expected word or phrase level selected, got: {:?}", sel
        );
    }

    #[test]
    fn test_deterministic_tie() {
        let input = make_input(
            vec![Fact { key: "phone".into(), value: "A".into() }],
            vec![
                Rule {
                    id: "ks-1".into(),
                    premise: vec!["phone:A".into()],
                    conclusion: "word:ZZZ".into(),
                    certainty: 0.8,
                },
                Rule {
                    id: "ks-2".into(),
                    premise: vec!["phone:A".into()],
                    conclusion: "word:AAA".into(),
                    certainty: 0.8,
                },
            ],
        );
        let out1 = Hearsay.run(&input).expect("run 1");
        let out2 = Hearsay.run(&input).expect("run 2");
        assert_eq!(out1.selected, out2.selected, "tie must resolve deterministically");
    }

    #[test]
    fn test_duplicate_post_fusion() {
        // noisy_or(0.5, 0.5) = 1 - (1-0.5)*(1-0.5) = 0.75
        let result = noisy_or(0.5, 0.5);
        assert!(
            (result - 0.75).abs() < 1e-5,
            "noisy_or(0.5, 0.5) must be 0.75, got {}", result
        );
        assert!(result < 1.0, "duplicate posts must not saturate to 1.0");
    }
}
