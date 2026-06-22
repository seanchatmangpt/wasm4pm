use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep, Candidate
};
use std::collections::{BTreeSet, HashMap};

/// Description Logic breed.
pub struct DescriptionLogic;

impl CognitionBreed for DescriptionLogic {
    fn id(&self) -> BreedId {
        BreedId::DescriptionLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "description_logic".to_string(),
            "ontological_subsumption".to_string(),
            "consistency_classification".to_string(),
            "transitive_closure".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.facts.is_empty() {
            return Err("DescriptionLogic requires at least one fact in the knowledge base".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_count = 0;

        trace.push(TraceStep {
            step: step_count,
            kind: "dl-load".to_string(),
            detail: format!("Loaded {} facts", input.facts.len()),
            depth: 0,
            objects: vec![],
        });
        step_count += 1;

        // TBox: subsumes(A, B) -> class A subsumes class B (B is a subclass of A)
        let mut subsumes: BTreeSet<(String, String)> = BTreeSet::new();
        // ABox: member(individual, class)
        let mut member: BTreeSet<(String, String)> = BTreeSet::new();
        // Disjointness: disjoint(A, B)
        let mut disjoint: BTreeSet<(String, String)> = BTreeSet::new();

        for f in &input.facts {
            if f.key == "subsumes" {
                let parts: Vec<&str> = f.value.split(',').collect();
                if parts.len() == 2 {
                    subsumes.insert((parts[0].trim().to_string(), parts[1].trim().to_string()));
                }
            } else if f.key == "subclass" {
                let parts: Vec<&str> = f.value.split(',').collect();
                if parts.len() == 2 {
                    // B is subclass of A -> A subsumes B
                    subsumes.insert((parts[1].trim().to_string(), parts[0].trim().to_string()));
                }
            } else if f.key == "class" || f.key == "class_assertion" || f.key == "type" {
                let parts: Vec<&str> = f.value.split(',').collect();
                if parts.len() == 2 {
                    member.insert((parts[0].trim().to_string(), parts[1].trim().to_string()));
                }
            } else if f.key == "disjoint" || f.key == "disjoint_classes" {
                let parts: Vec<&str> = f.value.split(',').collect();
                if parts.len() == 2 {
                    let c1 = parts[0].trim().to_string();
                    let c2 = parts[1].trim().to_string();
                    disjoint.insert((c1.clone(), c2.clone()));
                    disjoint.insert((c2, c1));
                }
            }
        }

        // 1. Transitive closure of subsumes (TBox reasoning)
        // Collect new (a,d) pairs into a BTreeSet each round — avoids cloning the full
        // set and deduplicates in one pass before committing to `subsumes`.
        loop {
            let new_pairs: BTreeSet<(String, String)> = subsumes
                .iter()
                .flat_map(|(a, b)| {
                    subsumes
                        .iter()
                        .filter(|(c, _)| b == c)
                        .filter_map(|(_, d)| {
                            if a != d && !subsumes.contains(&(a.clone(), d.clone())) {
                                Some((a.clone(), d.clone()))
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>()
                })
                .collect();
            if new_pairs.is_empty() {
                break;
            }
            for (a, d) in new_pairs {
                trace.push(TraceStep {
                    step: step_count,
                    kind: "dl-subsume".to_string(),
                    detail: format!("Derived: {} subsumes {}", a, d),
                    depth: 0,
                    objects: vec![("class".into(), a.clone()), ("class".into(), d.clone())],
                });
                step_count += 1;
                subsumes.insert((a, d));
            }
        }

        // 2. Propagate class membership (ABox reasoning)
        // If member(x, C) and subsumes(D, C) -> member(x, D)
        loop {
            let new_members: BTreeSet<(String, String)> = member
                .iter()
                .flat_map(|(x, c)| {
                    subsumes
                        .iter()
                        .filter(|(_, class_c)| c == class_c)
                        .filter_map(|(d, _)| {
                            if !member.contains(&(x.clone(), d.clone())) {
                                Some((x.clone(), d.clone()))
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>()
                })
                .collect();
            if new_members.is_empty() {
                break;
            }
            member.extend(new_members);
        }

        // 3. Consistency check
        let mut consistent = true;
        let mut clash_detail = String::new();

        for (x, c1) in &member {
            for (y, c2) in &member {
                if x == y && disjoint.contains(&(c1.clone(), c2.clone())) {
                    consistent = false;
                    clash_detail = format!("Individual '{}' belongs to disjoint classes '{}' and '{}'", x, c1, c2);
                    break;
                }
            }
            if !consistent {
                break;
            }
        }

        trace.push(TraceStep {
            step: step_count,
            kind: "dl-consistent".to_string(),
            detail: if consistent { "Ontology is consistent".to_string() } else { format!("Inconsistent: {}", clash_detail) },
            depth: 0,
            objects: vec![],
        });
        step_count += 1;

        let mut out_facts = Vec::new();
        out_facts.push(Fact {
            key: "consistent".to_string(),
            value: consistent.to_string(),
        });

        // BTreeSet iterates in ascending order — no sort scaffolding needed
        for (a, b) in &subsumes {
            out_facts.push(Fact {
                key: format!("subsumes:{}:{}", a, b),
                value: "true".to_string(),
            });
        }
        for (x, c) in &member {
            out_facts.push(Fact {
                key: format!("member:{}:{}", x, c),
                value: "true".to_string(),
            });
        }

        let mut candidates = input.candidates.clone();
        let selected = if consistent {
            // High score for candidates matching positive class memberships
            for cand in &mut candidates {
                if member.contains(&(cand.id.clone(), "ConsistentArchitecture".to_string())) {
                    cand.score = 1.0;
                } else {
                    cand.score = 0.5;
                }
            }
            Some("consistent".to_string())
        } else {
            // Eliminate all candidates if inconsistent
            for cand in &mut candidates {
                cand.eliminated = true;
                cand.elimination_reason = Some(format!("Ontology Inconsistency: {}", clash_detail));
                cand.score = 0.0;
            }
            Some("inconsistent".to_string())
        };

        Ok(BreedOutput {
            breed: BreedId::DescriptionLogic,
            candidates,
            facts: out_facts,
            selected,
            explanation: if consistent {
                "Description Logic: KB is consistent, subsumptions propagated successfully.".to_string()
            } else {
                format!("Description Logic: KB is inconsistent. {}", clash_detail)
            },
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("DescriptionLogic must emit at least one trace step".to_string());
        }
        let has_consistent = output.inference_trace.iter().any(|t| t.kind == "dl-consistent");
        if !has_consistent {
            return Err("DescriptionLogic trace must contain a dl-consistent step".to_string());
        }
        Ok(())
    }
}
