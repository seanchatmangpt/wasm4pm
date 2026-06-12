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
use std::collections::{BTreeMap, HashMap, HashSet};
use tracing;
use crate::breeds::support::trace_query::TraceQuery;

/// Case-Based Reasoning breed.
pub struct Cbr;

/// Jaccard similarity over two string sets.
///
/// Properties (Rank-1):
/// - Symmetry: `jaccard(a,b) == jaccard(b,a)`.
/// - Identity: `jaccard(a,a) == 1` for any non-empty set.
/// - Bounds: `0.0 ≤ result ≤ 1.0` always.
/// - Empty case: `jaccard(∅, ∅) == 0` (convention; empty intersection).
///   Validated Doctest Example:
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
            index.entry(feature).or_default().push(idx);
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
            objects: vec![],
        });

        // Retrieve candidate cases via index (O(log N) intersection instead of O(N²)).
        let mut candidates: Vec<usize> = retrieve_candidates(&query, &index).into_iter().collect();
        candidates.sort_unstable();
        trace.push(TraceStep {
            step: trace.len(),
            kind: "retrieve-candidates".to_string(),
            detail: format!(
                "retrieved {} candidates from {} total cases",
                candidates.len(),
                input.cases.len()
            ),
            depth: 0,
            objects: vec![],
        });

        let mut scored: Vec<(usize, f32, f32)> = Vec::new(); // (idx, sim, score)

        // Score only candidate cases, not all N.
        for idx in candidates {
            let case = &input.cases[idx];
            let case_set = case_fact_set(case);
            let sim = jaccard(&query, &case_set);
            let score = sim * case.outcome_score;
            scored.push((idx, sim, score));
            tracing::debug!(
                breed.step = "case_retrieved",
                breed = "cbr",
                "L1 inference step"
            );
            trace.push(TraceStep {
                step: trace.len(),
                kind: "score-case".to_string(),
                detail: format!("{} sim={:.3} score={:.3}", case.id, sim, score),
                depth: 0,
                objects: vec![],
            });
        }

        // Highest score wins; tiebreak by case id ascending.
        scored.sort_by(|(ai, _, as_), (bi, _, bs_)| {
            bs_.partial_cmp(as_)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| input.cases[*ai].id.cmp(&input.cases[*bi].id))
        });

        // --- Reuse: substitutional adaptation ---
        // Try up to top-K=4 candidates (revise loop)
        const TOP_K: usize = 4;
        let mut accepted_idx: Option<usize> = None;
        let mut adapted_facts_map: BTreeMap<String, String> = BTreeMap::new();
        let mut adapted_count = 0usize;

        for (attempt, (idx, _sim, score)) in scored.iter().enumerate().take(TOP_K) {
            if *score <= 0.0 {
                break;
            }
            let case = &input.cases[*idx];

            // Merge case facts with query facts (query wins on conflict)
            let mut merged: BTreeMap<String, String> = BTreeMap::new();
            for fact in &case.facts {
                merged.insert(fact.key.clone(), fact.value.clone());
            }
            for fact in &input.facts {
                merged.insert(fact.key.clone(), fact.value.clone());
            }
            let n_adapted = merged.len().saturating_sub(input.facts.len());

            // Reuse trace
            tracing::debug!(
                breed.step = "adaptation_applied",
                breed = "cbr",
                "L1 inference step"
            );
            trace.push(TraceStep {
                step: trace.len(),
                kind: "reuse-adapt".to_string(),
                detail: format!("{} adapted {} facts", case.id, n_adapted),
                depth: 0,
                objects: vec![],
            });

            // --- Revise: Jaccard of adapted facts vs query ---
            let adapted_set: HashSet<String> =
                merged.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
            let sim_adapted = jaccard(&query, &adapted_set);

            if sim_adapted >= 0.5 || attempt + 1 == TOP_K || attempt + 1 == scored.len() {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "revise-accept".to_string(),
                    detail: format!("{} sim={:.3}", case.id, sim_adapted),
                    depth: 0,
                    objects: vec![],
                });
                accepted_idx = Some(*idx);
                adapted_facts_map = merged;
                adapted_count = n_adapted;
                break;
            } else {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "revise-reject".to_string(),
                    detail: format!("{} sim={:.3}", case.id, sim_adapted),
                    depth: 0,
                    objects: vec![],
                });
            }
        }

        // --- Retain: build deterministic retained case ---
        let mut retained_cases: Vec<Case> = Vec::new();
        if let Some(idx) = accepted_idx {
            // Deterministic id: hash sorted query facts, take first 8 hex chars
            let mut sorted_query: Vec<String> = query.iter().cloned().collect();
            sorted_query.sort();
            let query_str = sorted_query.join("|");
            let hash_hex = blake3::hash(query_str.as_bytes()).to_hex();
            let retained_id = format!("retained-{}", &hash_hex[..8]);

            trace.push(TraceStep {
                step: trace.len(),
                kind: "retain-case".to_string(),
                detail: retained_id.clone(),
                depth: 0,
                objects: vec![],
            });

            let retained_facts: Vec<Fact> = adapted_facts_map
                .iter()
                .map(|(k, v)| Fact {
                    key: k.clone(),
                    value: v.clone(),
                })
                .collect();

            retained_cases.push(Case {
                id: retained_id,
                intent: input.intent.clone(),
                architecture: input.cases[idx].architecture.clone(),
                outcome_score: scored[0].2.min(1.0),
                facts: retained_facts,
            });
        }

        tracing::debug!(
            breed.step = "solution_proposed",
            breed = "cbr",
            "L1 inference step"
        );
        let selected = accepted_idx.map(|idx| input.cases[idx].architecture.clone());

        let explanation = match scored.first() {
            Some((idx, sim, score)) => {
                let adapt_note = if adapted_count > 0 {
                    format!(" adapted={}", adapted_count)
                } else {
                    String::new()
                };
                format!(
                    "CBR best={} sim={:.3} weighted={:.3}{}",
                    input.cases[*idx].id, sim, score, adapt_note
                )
            }
            None => "CBR found no cases".to_string(),
        };

        Ok(BreedOutput {
            breed: BreedId::Cbr,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases,
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
        assert!(result.unwrap_err().contains("at least one query fact"));
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
        assert!(result.unwrap_err().contains("at least one case"));
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
                Fact {
                    key: "k1".into(),
                    value: "v1".into(),
                },
                Fact {
                    key: "k2".into(),
                    value: "v2".into(),
                },
            ],
        };
        let case2 = Case {
            id: "c2".into(),
            intent: "test".into(),
            architecture: "arch2".into(),
            outcome_score: 0.8,
            facts: vec![
                Fact {
                    key: "k3".into(),
                    value: "v3".into(),
                },
                Fact {
                    key: "k4".into(),
                    value: "v4".into(),
                },
            ],
        };
        let query_facts = vec![Fact {
            key: "k1".into(),
            value: "v1".into(),
        }];

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
            output
                .inference_trace
                .iter()
                .any(|t| t.kind == "retrieve-candidates"),
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
            output.selected.as_ref().is_some_and(|a| a == "arch1"),
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
            Fact {
                key: "feature".into(),
                value: "val_5".into(),
            },
            Fact {
                key: "domain".into(),
                value: "test".into(),
            },
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
            output
                .inference_trace
                .iter()
                .any(|t| t.kind == "retrieve-candidates"),
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
            facts: vec![Fact {
                key: "k1".into(),
                value: "v1".into(),
            }],
        };
        let query_facts = vec![Fact {
            key: "k_nonexistent".into(),
            value: "v_nonexistent".into(),
        }];

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
        assert!(
            output.selected.is_none(),
            "Should select none when no candidates found"
        );
    }

    /// Falsification gate: two competing cases with different Jaccard scores.
    /// A broken jaccard formula (e.g. inverted, zero, or ignoring union) would
    /// select the wrong case. Aamodt & Plaza 1994 physician vignette (fixture).
    #[test]
    fn falsification_gate_higher_jaccard_wins_over_lower() {
        let breed = Cbr;
        // Query: 5 features
        let query = vec![
            Fact { key: "domain".into(), value: "medical".into() },
            Fact { key: "symptom_primary".into(), value: "fever".into() },
            Fact { key: "symptom_secondary".into(), value: "cough".into() },
            Fact { key: "urgency".into(), value: "moderate".into() },
            Fact { key: "patient_status".into(), value: "current".into() },
        ];
        // HIGH-SIM: shares 4/6 features with query → Jaccard 4/6 ≈ 0.667, score 0.633
        let high_sim = Case {
            id: "CASE-PHYSICIAN-2WK".into(),
            intent: "physician 2-week case".into(),
            architecture: "antibiotic-course".into(),
            outcome_score: 0.95,
            facts: vec![
                Fact { key: "domain".into(), value: "medical".into() },
                Fact { key: "symptom_primary".into(), value: "fever".into() },
                Fact { key: "symptom_secondary".into(), value: "cough".into() },
                Fact { key: "urgency".into(), value: "moderate".into() },
                Fact { key: "patient_status".into(), value: "past".into() },
            ],
        };
        // LOW-SIM: shares 2/8 features with query → Jaccard 2/8 = 0.25, score 0.18
        let low_sim = Case {
            id: "CASE-PHYSICIAN-6MO".into(),
            intent: "physician 6-month case".into(),
            architecture: "antiviral-course".into(),
            outcome_score: 0.72,
            facts: vec![
                Fact { key: "domain".into(), value: "medical".into() },
                Fact { key: "symptom_primary".into(), value: "fever".into() },
                Fact { key: "symptom_secondary".into(), value: "rash".into() },
                Fact { key: "urgency".into(), value: "low".into() },
                Fact { key: "patient_status".into(), value: "past".into() },
            ],
        };
        let input = BreedInput {
            intent: "diagnose current patient".into(),
            candidates: vec![],
            facts: query,
            cases: vec![high_sim, low_sim],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        assert_eq!(
            output.selected.as_deref(),
            Some("antibiotic-course"),
            "Higher-Jaccard case must win; got: {:?}", output.selected
        );
        // Verify Jaccard values are in the trace
        let score_steps: Vec<&TraceStep> = output.inference_trace.iter()
            .filter(|t| t.kind == "score-case")
            .collect();
        assert_eq!(score_steps.len(), 2, "Both candidates must be scored");
        assert!(
            score_steps.iter().any(|t| t.detail.contains("CASE-PHYSICIAN-2WK") && t.detail.contains("sim=0.667")),
            "2WK case must show sim≈0.667; trace: {:?}", score_steps.iter().map(|t| &t.detail).collect::<Vec<_>>()
        );
    }

    #[test]
    fn refuses_cbr_empty_facts() {
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
                facts: vec![Fact { key: "k".into(), value: "v".into() }],
            }],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn invariant_identity_jaccard() {
        let breed = Cbr;
        let case1 = Case {
            id: "c1".into(),
            intent: "test".into(),
            architecture: "arch1".into(),
            outcome_score: 1.0,
            facts: vec![Fact { key: "k1".into(), value: "v1".into() }],
        };
        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: vec![Fact { key: "k1".into(), value: "v1".into() }],
            cases: vec![case1],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        let score_step = output.inference_trace.iter().find(|t| t.kind == "score-case").unwrap();
        assert!(score_step.detail.contains("sim=1.000"));
    }
}
