use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep, Candidate
};
use std::collections::{BTreeSet, HashSet};

/// Abductive Logic Programming (ALP) breed.
pub struct AbductiveLp;

impl CognitionBreed for AbductiveLp {
    fn id(&self) -> BreedId {
        BreedId::AbductiveLp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "abductive_logic_programming".to_string(),
            "integrity_constraints".to_string(),
            "explanation_generation".to_string(),
            "minimal_hypothesis".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("AbductiveLp requires at least one rule".to_string());
        }
        if input.goals.is_empty() {
            return Err("AbductiveLp requires at least one goal to explain".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_count = 0;

        // 1. Load abducibles, rules, and integrity constraints
        let mut abducibles: BTreeSet<String> = BTreeSet::new();
        for f in &input.facts {
            if f.key == "abducible" {
                abducibles.insert(f.value.clone());
            }
        }
        // Fallback: if no abducibles are explicitly declared, treat all undefined atoms
        // appearing in premises but not in conclusions/facts as abducibles.
        if abducibles.is_empty() {
            let mut defined = HashSet::new();
            for r in &input.rules {
                defined.insert(r.conclusion.clone());
            }
            for f in &input.facts {
                if !f.value.is_empty() {
                    defined.insert(f.value.clone());
                }
            }
            for r in &input.rules {
                for p in &r.premise {
                    if !defined.contains(p) && p != "false" {
                        abducibles.insert(p.clone());
                    }
                }
            }
        }

        trace.push(TraceStep {
            step: step_count,
            kind: "alp-load".to_string(),
            detail: format!("Loaded {} rules, {} abducibles", input.rules.len(), abducibles.len()),
            depth: 0,
            objects: vec![],
        });
        step_count += 1;

        let abducibles_list: Vec<String> = abducibles.into_iter().collect();

        trace.push(TraceStep {
            step: step_count,
            kind: "alp-abduce".to_string(),
            detail: format!("Abducing explanations over: {:?}", abducibles_list),
            depth: 0,
            objects: vec![],
        });
        step_count += 1;

        // 2. Search for valid explanations by exploring subsets of abducibles.
        // We want a minimal subset E of abducibles such that P U E derives all goals and violates no ICs.
        let mut valid_explanations = Vec::new();
        let n_abducibles = abducibles_list.len();

        if n_abducibles <= 16 {
            let limit = 1 << n_abducibles;
            for mask in 0..limit {
                let mut hypothesis: BTreeSet<String> = BTreeSet::new();
                for i in 0..n_abducibles {
                    if (mask & (1 << i)) != 0 {
                        hypothesis.insert(abducibles_list[i].clone());
                    }
                }

                // Compute least model of P U hypothesis
                let mut model = HashSet::new();
                // Initialize with facts and hypothesis
                for f in &input.facts {
                    if f.key != "abducible" && !f.value.is_empty() {
                        model.insert(f.value.clone());
                    }
                }
                for atom in &hypothesis {
                    model.insert(atom.clone());
                }

                loop {
                    let mut added = false;
                    for r in &input.rules {
                        if r.conclusion != "false" && !model.contains(&r.conclusion) {
                            let all_met = r.premise.iter().all(|p| model.contains(p));
                            if all_met {
                                model.insert(r.conclusion.clone());
                                added = true;
                            }
                        }
                    }
                    if !added {
                        break;
                    }
                }

                // Verify goals are satisfied
                let goals_satisfied = input.goals.iter().all(|g| model.contains(&g.value) || model.contains(&g.predicate));

                // Verify integrity constraints (rules with conclusion "false" must not fire)
                let mut ic_violated = false;
                for r in &input.rules {
                    if r.conclusion == "false" {
                        let all_met = r.premise.iter().all(|p| model.contains(p));
                        if all_met {
                            ic_violated = true;
                            break;
                        }
                    }
                }

                if goals_satisfied && !ic_violated {
                    let hyp_list: Vec<String> = hypothesis.into_iter().collect();
                    valid_explanations.push(hyp_list);
                }
            }
        } else {
            return Err(BreedError {
                breed: BreedId::AbductiveLp,
                message: format!("Too many abducibles for exact ALP (max 16, got {})", n_abducibles),
            });
        }

        // Sort valid explanations: first by size (minimal first), then lexicographically
        valid_explanations.sort_by(|a, b| {
            a.len().cmp(&b.len()).then_with(|| a.cmp(b))
        });

        // Filter for minimality: keep an explanation only if no subset of it is also a valid explanation.
        let mut minimal_explanations: Vec<Vec<String>> = Vec::new();
        for exp in valid_explanations {
            let exp_set: HashSet<&String> = exp.iter().collect();
            let mut is_minimal = true;
            for min_exp in &minimal_explanations {
                if min_exp.iter().all(|item| exp_set.contains(item)) {
                    is_minimal = false;
                    break;
                }
            }
            if is_minimal {
                minimal_explanations.push(exp);
            }
        }
        let valid_explanations = minimal_explanations;

        // Trace the top explanations found
        for (idx, explanation) in valid_explanations.iter().enumerate() {
            trace.push(TraceStep {
                step: step_count,
                kind: "alp-hypothesis".to_string(),
                detail: format!("Explanation {}: {:?}", idx, explanation),
                depth: 0,
                objects: vec![],
            });
            step_count += 1;
        }

        let mut out_facts = Vec::new();
        out_facts.push(Fact {
            key: "explanations_count".to_string(),
            value: valid_explanations.len().to_string(),
        });

        let mut selected = None;
        let mut candidates = input.candidates.clone();

        if let Some(best_explanation) = valid_explanations.first() {
            // Store the best explanation atoms as facts
            for (i, atom) in best_explanation.iter().enumerate() {
                out_facts.push(Fact {
                    key: format!("explanation_0_{}", i),
                    value: atom.clone(),
                });
            }

            // Select candidate if its ID is in the best explanation
            for cand in &mut candidates {
                if best_explanation.contains(&cand.id) {
                    cand.score = 1.0;
                    if selected.is_none() {
                        selected = Some(cand.id.clone());
                    }
                }
            }
        }

        let explanation = format!(
            "ALP: generated {} explanations. Best explanation: {:?}",
            valid_explanations.len(),
            valid_explanations.first()
        );

        Ok(BreedOutput {
            breed: BreedId::AbductiveLp,
            candidates,
            facts: out_facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("AbductiveLp must emit at least one trace step".to_string());
        }
        let has_load = output.inference_trace.iter().any(|t| t.kind == "alp-load");
        let has_abduce = output.inference_trace.iter().any(|t| t.kind == "alp-abduce");
        if !has_load || !has_abduce {
            return Err("AbductiveLp trace must contain alp-load and alp-abduce".to_string());
        }
        Ok(())
    }
}
