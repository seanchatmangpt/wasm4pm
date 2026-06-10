use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeSet, HashSet};

/// Circumscription (Tier P3): cautious entailment through prioritized predicate minimization.
pub struct Circumscription;

impl Circumscription {
    fn ground_input(input: &BreedInput) -> (HashSet<String>, Vec<crate::breeds::Rule>) {
        let mut base_facts = HashSet::new();
        let mut terms = HashSet::new();
        for f in &input.facts {
            if f.key.is_empty() {
                base_facts.insert(f.value.clone());
            } else {
                base_facts.insert(format!("{}:{}", f.key, f.value));
                terms.insert(f.value.clone());
            }
        }
        let mut ground_rules = Vec::new();
        for rule in &input.rules {
            if terms.is_empty() {
                ground_rules.push(rule.clone());
            } else {
                for t in &terms {
                    let mut ground = rule.clone();
                    for p in &mut ground.premise {
                        if !p.contains(':') {
                            *p = format!("{}:{}", p, t);
                        } else {
                            let parts: Vec<&str> = p.splitn(2, ':').collect();
                            if parts.len() == 2 && !parts[1].contains(':') {
                                *p = format!("{}:{}", p, t);
                            }
                        }
                    }
                    if !ground.conclusion.contains(':') {
                        ground.conclusion = format!("{}:{}", ground.conclusion, t);
                    } else {
                        let parts: Vec<&str> = ground.conclusion.splitn(2, ':').collect();
                        if parts.len() == 2 && !parts[1].contains(':') {
                            ground.conclusion = format!("{}:{}", ground.conclusion, t);
                        }
                    }
                    ground_rules.push(ground);
                }
            }
        }
        (base_facts, ground_rules)
    }
}

impl CognitionBreed for Circumscription {
    fn id(&self) -> BreedId {
        BreedId::Circumscription
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "cautious_entailment".to_string(),
            "subset_minimal_ab".to_string(),
            "model_enumeration".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let (_, rules) = Self::ground_input(input);
        let mut ab_atoms = BTreeSet::new();
        for fact in &input.facts {
            if fact.value.starts_with("ab:") {
                ab_atoms.insert(fact.value.clone());
            }
        }
        for rule in &rules {
            if rule.conclusion.starts_with("ab:") {
                ab_atoms.insert(rule.conclusion.clone());
            }
            for p in &rule.premise {
                if let Some(ab) = p.strip_prefix("not_ab:") {
                    ab_atoms.insert(format!("ab:{}", ab));
                } else if p.starts_with("ab:") {
                    ab_atoms.insert(p.clone());
                }
            }
        }
        if ab_atoms.len() > 12 {
            return Err("Too many ab-atoms (>12)".into());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_idx = 0;

        let (base_facts, rules) = Self::ground_input(input);

        let mut ab_atoms_set = BTreeSet::new();
        for fact in &base_facts {
            if fact.starts_with("ab:") {
                ab_atoms_set.insert(fact.clone());
            }
        }
        for rule in &rules {
            if rule.conclusion.starts_with("ab:") {
                ab_atoms_set.insert(rule.conclusion.clone());
            }
            for p in &rule.premise {
                if let Some(ab) = p.strip_prefix("not_ab:") {
                    ab_atoms_set.insert(format!("ab:{}", ab));
                } else if p.starts_with("ab:") {
                    ab_atoms_set.insert(p.clone());
                }
            }
        }
        let ab_atoms: Vec<String> = ab_atoms_set.into_iter().collect();

        trace.push(TraceStep {
            step: step_idx,
            kind: "load-defaults".to_string(),
            detail: format!("Found {} ab-atoms", ab_atoms.len()),
            depth: 0,
            objects: vec![],
        });
        step_idx += 1;

        let num_models = 1 << ab_atoms.len();
        let mut consistent_models = Vec::new();

        for mask in 0..num_models {
            let mut chosen_ab = HashSet::new();
            for (i, atom) in ab_atoms.iter().enumerate() {
                if (mask & (1 << i)) != 0 {
                    chosen_ab.insert(atom.clone());
                }
            }

            let mut derived = base_facts.clone();
            for ab in &chosen_ab {
                derived.insert(ab.clone());
            }

            loop {
                let mut changed = false;
                for rule in &rules {
                    if derived.contains(&rule.conclusion) {
                        continue;
                    }
                    let mut prereqs_met = true;
                    for p in &rule.premise {
                        if let Some(ab) = p.strip_prefix("not_ab:") {
                            if chosen_ab.contains(&format!("ab:{}", ab)) {
                                prereqs_met = false;
                                break;
                            }
                        } else if p.starts_with("not_") {
                            let pos = p.strip_prefix("not_").unwrap();
                            if derived.contains(pos) {
                                prereqs_met = false;
                                break;
                            }
                        } else {
                            if !derived.contains(p) {
                                prereqs_met = false;
                                break;
                            }
                        }
                    }
                    if prereqs_met {
                        derived.insert(rule.conclusion.clone());
                        changed = true;
                    }
                }
                if !changed {
                    break;
                }
            }

            let mut is_consistent = true;
            for atom in &derived {
                if atom.starts_with("ab:") && !chosen_ab.contains(atom) {
                    is_consistent = false;
                    break;
                }
                if let Some(pos) = atom.strip_prefix("not_") {
                    if derived.contains(pos) {
                        is_consistent = false;
                        break;
                    }
                }
            }

            if is_consistent {
                trace.push(TraceStep {
                    step: step_idx,
                    kind: "enumerate-model".to_string(),
                    detail: format!("Consistent model with ab: {:?}", chosen_ab),
                    depth: 0,
                    objects: vec![],
                });
                step_idx += 1;
                consistent_models.push((chosen_ab, derived));
            }
        }

        if consistent_models.is_empty() {
            return Err(BreedError {
                breed: BreedId::Circumscription,
                message: "No consistent models found".into(),
            });
        }

        let mut minimal_models = Vec::new();
        for (i, (ab_i, _)) in consistent_models.iter().enumerate() {
            let mut is_minimal = true;
            for (j, (ab_j, _)) in consistent_models.iter().enumerate() {
                if i != j && ab_j.is_subset(ab_i) && ab_j.len() < ab_i.len() {
                    is_minimal = false;
                    trace.push(TraceStep {
                        step: step_idx,
                        kind: "minimize".to_string(),
                        detail: format!("Pruned model {:?} because {:?} is smaller", ab_i, ab_j),
                        depth: 0,
                        objects: vec![],
                    });
                    step_idx += 1;
                    break;
                }
            }
            if is_minimal {
                minimal_models.push(consistent_models[i].clone());
            }
        }

        if minimal_models.is_empty() {
            return Err(BreedError {
                breed: BreedId::Circumscription,
                message: "No minimal models found".into(),
            });
        }

        let mut entailed: BTreeSet<String> = minimal_models[0].1.iter().cloned().collect();
        for (_, derived) in minimal_models.iter().skip(1) {
            entailed.retain(|e| derived.contains(e));
        }

        let mut sorted_entailed: Vec<String> = entailed.into_iter().collect();
        sorted_entailed.sort();
        let entailed_str = sorted_entailed.join(", ");

        trace.push(TraceStep {
            step: step_idx,
            kind: "entail".to_string(),
            detail: format!("Entailed {} facts", sorted_entailed.len()),
            depth: 0,
            objects: vec![],
        });
        step_idx += 1;

        trace.push(TraceStep {
            step: step_idx,
            kind: "decision".to_string(),
            detail: format!("Cautious entailment: {}", entailed_str),
            depth: 0,
            objects: vec![],
        });

        // The selected string should be the derived conclusion, i.e. the one that isn't in base_facts
        let selected = sorted_entailed.iter()
            .find(|&a| !base_facts.contains(a))
            .cloned()
            .unwrap_or_else(|| entailed_str.clone());

        let output_facts = sorted_entailed.into_iter().enumerate().map(|(i, f)| Fact {
            key: format!("entailed:{}", i),
            value: f,
        }).collect();

        Ok(BreedOutput {
            breed: BreedId::Circumscription,
            candidates: vec![],
            facts: output_facts,
            selected: Some(selected),
            explanation: format!("Cautious entailment: {}", entailed_str),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        let kinds: BTreeSet<String> = output.inference_trace.iter().map(|t| t.kind.clone()).collect();
        if !kinds.contains("load-defaults") {
            return Err("Missing load-defaults".into());
        }
        if !kinds.contains("decision") {
            return Err("Missing decision".into());
        }
        Ok(())
    }
}
