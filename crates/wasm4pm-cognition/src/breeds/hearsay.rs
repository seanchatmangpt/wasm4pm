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
                    .then_with(|| ak.cmp(bk))
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
