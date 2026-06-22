use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep, Candidate
};
use std::collections::HashSet;

/// Answer Set Programming (stable models) breed.
pub struct Asp;

impl CognitionBreed for Asp {
    fn id(&self) -> BreedId {
        BreedId::Asp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "answer_set_programming".to_string(),
            "stable_models".to_string(),
            "gelfond_lifschitz_reduct".to_string(),
            "negation_as_failure".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() && input.facts.is_empty() {
            return Err("ASP requires at least one rule or fact".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        trace.push(TraceStep {
            step: trace.len(),
            kind: "asp-load".to_string(),
            detail: format!("Loaded {} rules, {} facts", input.rules.len(), input.facts.len()),
            depth: 0,
            objects: vec![],
        });

        // 1. Gather all unique atoms
        let mut all_atoms = HashSet::new();
        for r in &input.rules {
            all_atoms.insert(r.conclusion.clone());
            for p in &r.premise {
                if let Some(atom) = p.strip_prefix("not ") {
                    all_atoms.insert(atom.trim().to_string());
                } else {
                    all_atoms.insert(p.clone());
                }
            }
        }
        for f in &input.facts {
            if !f.value.is_empty() {
                all_atoms.insert(f.value.clone());
            }
            if !f.key.is_empty() && f.key != "relation" {
                all_atoms.insert(f.key.clone());
            }
        }
        for c in &input.candidates {
            all_atoms.insert(c.id.clone());
        }

        let mut atoms_list: Vec<String> = all_atoms.into_iter().collect();
        atoms_list.sort();

        trace.push(TraceStep {
            step: trace.len(),
            kind: "asp-solve".to_string(),
            detail: format!("Solving over {} atoms: {:?}", atoms_list.len(), atoms_list),
            depth: 0,
            objects: vec![],
        });

        // 2. Generate stable models
        let mut stable_models = Vec::new();
        let n_atoms = atoms_list.len();
        
        if n_atoms <= 16 {
            let limit = 1 << n_atoms;
            for mask in 0..limit {
                let mut interpretation = HashSet::new();
                for i in 0..n_atoms {
                    if (mask & (1 << i)) != 0 {
                        interpretation.insert(atoms_list[i].clone());
                    }
                }

                // Compute Gelfond-Lifschitz reduct P^I
                let mut reduct_rules = Vec::new();

                // Facts
                for f in &input.facts {
                    if !f.value.is_empty() {
                        reduct_rules.push((f.value.clone(), Vec::new()));
                    }
                    if !f.key.is_empty() && f.key != "relation" {
                        reduct_rules.push((f.key.clone(), Vec::new()));
                    }
                }

                let mut rule_ok = true;
                for r in &input.rules {
                    let mut pos_premises = Vec::new();
                    let mut discard = false;
                    for p in &r.premise {
                        if let Some(atom) = p.strip_prefix("not ") {
                            let atom_trimmed = atom.trim();
                            if interpretation.contains(atom_trimmed) {
                                discard = true;
                                break;
                            }
                        } else {
                            pos_premises.push(p.clone());
                        }
                    }
                    if !discard {
                        reduct_rules.push((r.conclusion.clone(), pos_premises));
                    }
                }

                // Compute least model of P^I
                let mut least_model = HashSet::new();
                loop {
                    let mut added = false;
                    for (head, premises) in &reduct_rules {
                        if !least_model.contains(head) {
                            let all_met = premises.iter().all(|p| least_model.contains(p));
                            if all_met {
                                least_model.insert(head.clone());
                                added = true;
                            }
                        }
                    }
                    if !added {
                        break;
                    }
                }

                // If interpretation == least_model, then interpretation is stable!
                if interpretation == least_model {
                    let mut model_atoms: Vec<String> = interpretation.into_iter().collect();
                    model_atoms.sort();
                    stable_models.push(model_atoms);
                }
            }
        } else {
            return Err(BreedError {
                breed: BreedId::Asp,
                message: format!("Too many atoms for exact ASP solver (max 16, got {})", n_atoms),
            });
        }

        // Trace stable models
        for (idx, model) in stable_models.iter().enumerate() {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "asp-model".to_string(),
                detail: format!("Model {}: {:?}", idx, model),
                depth: 0,
                objects: vec![],
            });
        }

        // Set up output facts and selection
        let mut out_facts = Vec::new();
        out_facts.push(Fact {
            key: "stable_models_count".to_string(),
            value: stable_models.len().to_string(),
        });

        let mut selected = None;
        let mut candidates = input.candidates.clone();

        if let Some(first_model) = stable_models.first() {
            for (i, atom) in first_model.iter().enumerate() {
                out_facts.push(Fact {
                    key: format!("model_0_{}", i),
                    value: atom.clone(),
                });
            }

            for cand in &mut candidates {
                if first_model.contains(&cand.id) {
                    cand.score = 1.0;
                    if selected.is_none() {
                        selected = Some(cand.id.clone());
                    }
                }
            }
        }

        let explanation = format!(
            "ASP: found {} stable model(s). Selected candidate: {:?}",
            stable_models.len(),
            selected
        );

        Ok(BreedOutput {
            breed: BreedId::Asp,
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
            return Err("ASP must emit at least one trace step".to_string());
        }
        let has_load = output.inference_trace.iter().any(|t| t.kind == "asp-load");
        let has_solve = output.inference_trace.iter().any(|t| t.kind == "asp-solve");
        if !has_load || !has_solve {
            return Err("ASP trace must contain asp-load and asp-solve".to_string());
        }
        Ok(())
    }
}
