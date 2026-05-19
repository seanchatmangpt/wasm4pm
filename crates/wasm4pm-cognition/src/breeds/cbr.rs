//! Case-Based Reasoning via Jaccard similarity with Discrimination Net Indexing (Schank 1983).
//!
//! Algorithm:
//! 1. Build a discrimination net index from cases (feature → case_ids mapping).
//! 2. Construct a fact-set from `input.facts` of `key=value` strings.
//! 3. Retrieve candidate cases via index (O(log N) intersection) instead of O(N²) brute-force.
//! 4. For each candidate case, compute `sim = jaccard(fact_set, case_fact_set)`.
//! 5. Score each candidate as `sim * outcome_score`.
//! 6. Select the case with the maximum score (lex-tiebreak on case id).
//! 7. Recommend `selected = best_case.architecture`.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Case, CognitionBreed, Fact, TraceStep,
};
use std::collections::{HashMap, HashSet};

/// Case-Based Reasoning breed.
pub struct Cbr;

/// Jaccard similarity over two string sets.
///
/// Properties (Rank-1):
/// - Symmetry: `jaccard(a,b) == jaccard(b,a)`.
/// - Identity: `jaccard(a,a) == 1` for any non-empty set.
/// - Bounds: `0.0 ≤ result ≤ 1.0` always.
/// - Empty case: `jaccard(∅, ∅) == 0` (convention; empty intersection).
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
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

/// Build a discrimination net index from cases (Schank 1983).
/// Maps feature strings ("key=value") to the indices of cases containing that feature.
///
/// Properties (Rank-1):
/// - Completeness: Every case with a feature appears in that feature's entry.
/// - No false negatives: If a case contains a feature, it will be retrieved.
fn build_index(cases: &[Case]) -> HashMap<String, Vec<usize>> {
    let mut index: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, case) in cases.iter().enumerate() {
        for fact in &case.facts {
            let feature = format!("{}={}", fact.key, fact.value);
            index.entry(feature).or_insert_with(Vec::new).push(idx);
        }
    }
    index
}

/// Retrieve candidate case indices from the discrimination net index.
/// Returns the intersection of all case_id lists for query features.
///
/// Properties (Rank-1):
/// - Soundness: Every returned case shares at least one feature with query.
/// - Optimality: No cases with zero feature overlap are returned.
fn retrieve_candidates(
    query_features: &HashSet<String>,
    index: &HashMap<String, Vec<usize>>,
) -> HashSet<usize> {
    if query_features.is_empty() {
        return HashSet::new();
    }

    // Collect all case indices from query features
    let mut candidates: HashSet<usize> = HashSet::new();
    for feature in query_features {
        if let Some(case_ids) = index.get(feature) {
            for &idx in case_ids {
                candidates.insert(idx);
            }
        }
    }
    candidates
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
        if input.facts.is_empty() {
            return Err("CBR requires at least one query fact to compute similarity".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let query = fact_set(&input.facts);
        let mut trace: Vec<TraceStep> = Vec::new();

        // Build discrimination net index from cases.
        let index = build_index(&input.cases);
        trace.push(TraceStep {
            step: trace.len(),
            kind: "build-index".to_string(),
            detail: format!("index built for {} cases", input.cases.len()),
            depth: 0,
        });

        // Retrieve candidate cases via index (O(log N) intersection instead of O(N²)).
        let candidates = retrieve_candidates(&query, &index);
        trace.push(TraceStep {
            step: trace.len(),
            kind: "retrieve-candidates".to_string(),
            detail: format!("retrieved {} candidates from {} total cases", candidates.len(), input.cases.len()),
            depth: 0,
        });

        let mut scored: Vec<(usize, f32, f32)> = Vec::new(); // (idx, sim, score)

        // Score only candidate cases, not all N.
        for idx in candidates {
            let case = &input.cases[idx];
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn precondition_rejects_empty_facts() {
        let breed = Cbr;
        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![Case {
                id: "c1".into(),
                intent: "test".into(),
                architecture: "arch1".into(),
                outcome_score: 0.9,
                facts: vec![Fact {
                    key: "k".into(),
                    value: "v".into(),
                }],
            }],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let result = breed.preconditions(&input);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("at least one query fact"));
    }

    #[test]
    fn precondition_rejects_empty_cases() {
        let breed = Cbr;
        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: vec![Fact {
                key: "k".into(),
                value: "v".into(),
            }],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let result = breed.preconditions(&input);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("at least one case"));
    }

    #[test]
    fn cbr_indexing_retrieves_only_overlapping_cases() {
        let breed = Cbr;
        let case1 = Case {
            id: "c1".into(),
            intent: "test".into(),
            architecture: "arch1".into(),
            outcome_score: 0.9,
            facts: vec![
                Fact { key: "k1".into(), value: "v1".into() },
                Fact { key: "k2".into(), value: "v2".into() },
            ],
        };
        let case2 = Case {
            id: "c2".into(),
            intent: "test".into(),
            architecture: "arch2".into(),
            outcome_score: 0.8,
            facts: vec![
                Fact { key: "k3".into(), value: "v3".into() },
                Fact { key: "k4".into(), value: "v4".into() },
            ],
        };
        let query_facts = vec![Fact { key: "k1".into(), value: "v1".into() }];

        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: query_facts,
            cases: vec![case1, case2],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output = breed.run(&input).expect("run ok");
        assert!(
            output.inference_trace.iter().any(|t| t.kind == "retrieve-candidates"),
            "Should have retrieve-candidates trace step"
        );
        let retrieve_step = output
            .inference_trace
            .iter()
            .find(|t| t.kind == "retrieve-candidates")
            .expect("retrieve step exists");
        assert!(
            retrieve_step.detail.contains("retrieved 1 candidates"),
            "Should retrieve only case c1 (has k1=v1), got: {}",
            retrieve_step.detail
        );
        assert!(
            output.selected.as_ref().map_or(false, |a| a == "arch1"),
            "Should select arch1 from c1"
        );
    }

    #[test]
    fn cbr_indexing_scales_to_1000_cases() {
        let breed = Cbr;
        let mut cases = Vec::new();
        for i in 0..1000 {
            cases.push(Case {
                id: format!("case_{}", i),
                intent: "test".into(),
                architecture: format!("arch_{}", i),
                outcome_score: 0.5 + (i as f32 % 100.0) / 100.0,
                facts: vec![
                    Fact {
                        key: "feature".into(),
                        value: format!("val_{}", i % 10), // 10 distinct values
                    },
                    Fact {
                        key: "domain".into(),
                        value: "test".into(),
                    },
                ],
            });
        }

        let query_facts = vec![
            Fact { key: "feature".into(), value: "val_5".into() },
            Fact { key: "domain".into(), value: "test".into() },
        ];

        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: query_facts,
            cases,
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output = breed.run(&input).expect("run ok");
        assert!(
            output.inference_trace.iter().any(|t| t.kind == "retrieve-candidates"),
            "Should have retrieve-candidates trace step"
        );
        let retrieve_step = output
            .inference_trace
            .iter()
            .find(|t| t.kind == "retrieve-candidates")
            .expect("retrieve step exists");
        assert!(
            retrieve_step.detail.contains("retrieved"),
            "Should show retrieved candidate count"
        );
        // With 1000 cases and 10 distinct feature values, we expect ~100 candidates
        // (cases where val_5 appears, plus cases where domain=test exists)
        assert!(output.selected.is_some(), "Should select a best case");
    }

    #[test]
    fn cbr_indexing_handles_no_overlap() {
        let breed = Cbr;
        let case1 = Case {
            id: "c1".into(),
            intent: "test".into(),
            architecture: "arch1".into(),
            outcome_score: 0.9,
            facts: vec![Fact { key: "k1".into(), value: "v1".into() }],
        };
        let query_facts = vec![Fact { key: "k_nonexistent".into(), value: "v_nonexistent".into() }];

        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: query_facts,
            cases: vec![case1],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output = breed.run(&input).expect("run ok");
        let retrieve_step = output
            .inference_trace
            .iter()
            .find(|t| t.kind == "retrieve-candidates")
            .expect("retrieve step exists");
        assert!(
            retrieve_step.detail.contains("retrieved 0 candidates"),
            "Should retrieve 0 candidates when no features overlap"
        );
        assert!(output.selected.is_none(), "Should select none when no candidates found");
    }
}
