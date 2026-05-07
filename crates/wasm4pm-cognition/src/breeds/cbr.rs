//! Case-Based Reasoning via Jaccard similarity (Schank 1983).
//!
//! Algorithm:
//! 1. Construct a fact-set from `input.facts` of `key=value` strings.
//! 2. For each `Case`, compute `sim = jaccard(fact_set, case_fact_set)`.
//! 3. Score each case as `sim * outcome_score`.
//! 4. Select the case with the maximum score (lex-tiebreak on case id).
//! 5. Recommend `selected = best_case.architecture`.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Case, CognitionBreed, Fact, TraceStep,
};
use std::collections::HashSet;

/// Case-Based Reasoning breed.
pub struct Cbr;

/// Jaccard similarity over two string sets.
///
/// Properties (Rank-1):
/// - Symmetry: `jaccard(a,b) == jaccard(b,a)`.
/// - Identity: `jaccard(a,a) == 1` for any non-empty set.
/// - Bounds: `0.0 ≤ result ≤ 1.0` always.
/// - Empty case: `jaccard(∅, ∅) == 0` (convention; empty intersection).
pub fn jaccard(a: &HashSet<String>, b: &HashSet<String>) -> f32 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }
    let inter = a.intersection(b).count() as f32;
    let union = a.union(b).count() as f32;
    if union == 0.0 {
        0.0
    } else {
        inter / union
    }
}

fn fact_set(facts: &[Fact]) -> HashSet<String> {
    facts
        .iter()
        .map(|f| format!("{}={}", f.key, f.value))
        .collect()
}

fn case_fact_set(case: &Case) -> HashSet<String> {
    fact_set(&case.facts)
}

impl CognitionBreed for Cbr {
    fn id(&self) -> BreedId {
        BreedId::Cbr
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["similarity_matching".to_string(), "jaccard".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.cases.is_empty() {
            return Err("CBR requires at least one case in the case ledger".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let query = fact_set(&input.facts);
        let mut trace: Vec<TraceStep> = Vec::new();
        let mut scored: Vec<(usize, f32, f32)> = Vec::new(); // (idx, sim, score)

        for (idx, case) in input.cases.iter().enumerate() {
            let case_set = case_fact_set(case);
            let sim = jaccard(&query, &case_set);
            let score = sim * case.outcome_score;
            scored.push((idx, sim, score));
            trace.push(TraceStep {
                step: trace.len(),
                kind: "score-case".to_string(),
                detail: format!("{} sim={:.3} score={:.3}", case.id, sim, score),
                depth: 0,
            });
        }

        // Highest score wins; tiebreak by case id ascending.
        scored.sort_by(|(ai, _, as_), (bi, _, bs_)| {
            bs_.partial_cmp(as_)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| input.cases[*ai].id.cmp(&input.cases[*bi].id))
        });

        let selected = scored
            .first()
            .filter(|(_, _, s)| *s > 0.0)
            .map(|(idx, _, _)| input.cases[*idx].architecture.clone());

        let explanation = match scored.first() {
            Some((idx, sim, score)) => format!(
                "CBR best={} sim={:.3} weighted={:.3}",
                input.cases[*idx].id, sim, score
            ),
            None => "CBR found no cases".to_string(),
        };

        Ok(BreedOutput {
            breed: BreedId::Cbr,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("CBR must score at least one case".to_string());
        }
        Ok(())
    }
}
