use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use crate::breeds::support::closure::{forward_close, HornRule};
use std::collections::BTreeSet;

/// ASP Breed: Answer Set Programming via Gelfond-Lifschitz reduct.
pub struct AspBreed;

impl CognitionBreed for AspBreed {
    fn id(&self) -> BreedId {
        BreedId::Asp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "answer_set_programming".to_string(),
            "gelfond_lifschitz".to_string(),
            "nonmonotonic_reasoning".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let mut atoms = BTreeSet::new();
        for f in &input.facts {
            atoms.insert(f.value.clone());
        }
        for r in &input.rules {
            atoms.insert(r.conclusion.clone());
            for p in &r.premise {
                if let Some(stripped) = p.strip_prefix("not ") {
                    atoms.insert(stripped.to_string());
                } else {
                    atoms.insert(p.clone());
                }
            }
        }
        if atoms.len() > 12 {
            return Err("ASP breed refuses >12 choice atoms".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        // Collect atoms
        let mut atoms_set = BTreeSet::new();
        for f in &input.facts {
            atoms_set.insert(f.value.clone());
        }
        for r in &input.rules {
            atoms_set.insert(r.conclusion.clone());
            for p in &r.premise {
                if let Some(stripped) = p.strip_prefix("not ") {
                    atoms_set.insert(stripped.to_string());
                } else {
                    atoms_set.insert(p.clone());
                }
            }
        }
        let atoms: Vec<String> = atoms_set.into_iter().collect();
        let n = atoms.len();

        let mut trace = Vec::new();
        let mut step_idx = 0;
        
        trace.push(TraceStep {
            step: step_idx,
            kind: "ground".to_string(),
            detail: format!("Found {} choice atoms", n),
            depth: 0,
            objects: vec![],
        });
        step_idx += 1;

        let initial_facts: BTreeSet<String> = input.facts.iter().map(|f| f.value.clone()).collect();
        let mut answer_sets = Vec::new();

        for mask in 0..(1 << n) {
            let mut candidate = BTreeSet::new();
            for i in 0..n {
                if (mask & (1 << i)) != 0 {
                    candidate.insert(atoms[i].clone());
                }
            }

            trace.push(TraceStep {
                step: step_idx,
                kind: "guess-candidate".to_string(),
                detail: format!("Candidate: {:?}", candidate),
                depth: 1,
                objects: vec![],
            });
            step_idx += 1;

            // Compute reduct
            let mut reduct_rules = Vec::new();

            for r in &input.rules {
                let mut keep_rule = true;
                let mut pos_premises = Vec::new();

                for p in &r.premise {
                    if let Some(neg_atom) = p.strip_prefix("not ") {
                        if candidate.contains(neg_atom) {
                            keep_rule = false;
                            break;
                        }
                    } else {
                        pos_premises.push(p.clone());
                    }
                }

                if keep_rule {
                    reduct_rules.push(HornRule {
                        id: r.id.clone(),
                        premises: pos_premises,
                        conclusion: r.conclusion.clone(),
                    });
                }
            }

            trace.push(TraceStep {
                step: step_idx,
                kind: "reduct".to_string(),
                detail: format!("Reduct has {} rules", reduct_rules.len()),
                depth: 1,
                objects: vec![],
            });
            step_idx += 1;

            let closure_res = forward_close(&initial_facts, &reduct_rules);

            trace.push(TraceStep {
                step: step_idx,
                kind: "least-model".to_string(),
                detail: format!("Least model: {:?}", closure_res.facts),
                depth: 1,
                objects: vec![],
            });
            step_idx += 1;

            if closure_res.facts == candidate {
                trace.push(TraceStep {
                    step: step_idx,
                    kind: "stable-accept".to_string(),
                    detail: "Candidate is a stable model".to_string(),
                    depth: 1,
                    objects: vec![],
                });
                step_idx += 1;
                answer_sets.push(candidate);
            } else {
                trace.push(TraceStep {
                    step: step_idx,
                    kind: "stable-reject".to_string(),
                    detail: "Candidate differs from least model".to_string(),
                    depth: 1,
                    objects: vec![],
                });
                step_idx += 1;
            }
        }

        answer_sets.sort(); // Lexicographic sorting of sets
        let mut final_answer_set_strs = Vec::new();
        for aset in &answer_sets {
            let mut sorted: Vec<_> = aset.iter().collect();
            sorted.sort();
            final_answer_set_strs.push(format!("{{{}}}", sorted.into_iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")));
        }

        trace.push(TraceStep {
            step: step_idx,
            kind: "answer-set".to_string(),
            detail: format!("Found {} answer sets", answer_sets.len()),
            depth: 0,
            objects: vec![],
        });

        // The facts will just be strings representing each answer set
        let out_facts = final_answer_set_strs.iter().enumerate().map(|(i, s)| Fact {
            key: format!("answer_set_{}", i),
            value: s.clone(),
        }).collect();

        Ok(BreedOutput {
            breed: BreedId::Asp,
            candidates: vec![],
            facts: out_facts,
            selected: if final_answer_set_strs.is_empty() { None } else { Some(final_answer_set_strs.join(" | ")) },
            explanation: format!("ASP Gelfond-Lifschitz found {} stable models", answer_sets.len()),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("ASP trace must not be empty".to_string());
        }
        if !output.inference_trace.iter().any(|s| s.kind == "answer-set") {
            return Err("ASP trace must end with answer-set".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Rule;

    fn make_input(facts: Vec<&str>, rules: Vec<Rule>) -> BreedInput {
        BreedInput {
            intent: "test".to_string(),
            candidates: vec![],
            facts: facts.into_iter().map(|f| Fact { key: f.to_string(), value: f.to_string() }).collect(),
            cases: vec![],
            rules,
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_hidden_oracle_even_loop() {
        let rules = vec![
            Rule { id: "r1".to_string(), premise: vec!["not b".to_string()], conclusion: "a".to_string(), certainty: 1.0 },
            Rule { id: "r2".to_string(), premise: vec!["not a".to_string()], conclusion: "b".to_string(), certainty: 1.0 },
        ];
        let input = make_input(vec![], rules);
        let output = AspBreed.run(&input).unwrap();
        // Answer sets: {a}, {b}
        assert_eq!(output.facts.len(), 2);
    }

    #[test]
    fn test_hidden_oracle_odd_loop() {
        let rules = vec![
            Rule { id: "r1".to_string(), premise: vec!["not a".to_string()], conclusion: "a".to_string(), certainty: 1.0 },
        ];
        let input = make_input(vec![], rules);
        let output = AspBreed.run(&input).unwrap();
        assert_eq!(output.facts.len(), 0);
    }

    #[test]
    fn test_hidden_oracle_nonmonotonic() {
        let rules = vec![
            Rule { id: "r1".to_string(), premise: vec!["bird".to_string(), "not abnormal".to_string()], conclusion: "flies".to_string(), certainty: 1.0 },
        ];
        let input1 = make_input(vec!["bird"], rules.clone());
        let out1 = AspBreed.run(&input1).unwrap();
        assert!(out1.selected.as_ref().unwrap().contains("flies"));
        
        let input2 = make_input(vec!["bird", "abnormal"], rules);
        let out2 = AspBreed.run(&input2).unwrap();
        assert!(out2.selected.is_none() || !out2.selected.as_ref().unwrap().contains("flies"));
    }

    #[test]
    fn test_determinism() {
        let rules = vec![
            Rule { id: "r1".to_string(), premise: vec!["not b".to_string()], conclusion: "a".to_string(), certainty: 1.0 },
        ];
        let input = make_input(vec![], rules);
        let out1 = AspBreed.run(&input).unwrap();
        let out2 = AspBreed.run(&input).unwrap();
        assert_eq!(out1.facts, out2.facts);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }
}
