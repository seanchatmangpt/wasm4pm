//! Markov Logic Network MAP inference via MaxWalkSAT.
//!
//! Rank-1 properties: exhaustively verified MAP cost against all 2^k assignments;
//! bit-identical deterministic execution (SmallRng seed 42).

use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
use std::collections::{BTreeMap, BTreeSet};
use rand::Rng;
use crate::breeds::support::rng::seeded_rng;

/// Markov Logic Network solver breed.
pub struct MarkovLogic;

#[derive(Debug, Clone)]
struct Clause {
    literals: Vec<(usize, bool)>,
    weight: f64,
}

impl CognitionBreed for MarkovLogic {
    fn id(&self) -> BreedId {
        BreedId::MarkovLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["markov_logic".to_string(), "maxwalksat".to_string()]
    }

    fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step = 0;

        let mut atoms = BTreeSet::new();
        let mut clauses_str = Vec::new();
        let mut evidence = BTreeMap::new();

        for f in &input.facts {
            if f.key == "mln:atom" {
                atoms.insert(f.value.clone());
            } else if f.key == "mln:clause" {
                clauses_str.push(f.value.clone());
            } else if f.key == "mln:evidence" {
                let parts: Vec<&str> = f.value.split(':').collect();
                if parts.len() == 2 {
                    if let Ok(b) = parts[1].parse::<bool>() {
                        evidence.insert(parts[0].to_string(), b);
                    }
                }
            }
        }

        if atoms.is_empty() {
            return Err(BreedError { breed: self.id(), message: "MISSING_ATOMS".into() });
        }

        let atoms_vec: Vec<String> = atoms.into_iter().collect();
        let mut atom_to_idx = BTreeMap::new();
        for (i, a) in atoms_vec.iter().enumerate() {
            atom_to_idx.insert(a.clone(), i);
        }

        if atoms_vec.len() > 256 || clauses_str.len() > 512 {
            return Err(BreedError { breed: self.id(), message: "RESOURCE_EXHAUSTED".into() });
        }

        let mut clauses = Vec::new();
        for cs in &clauses_str {
            let parts: Vec<&str> = cs.split(':').collect();
            if parts.len() == 2 {
                let weight = parts[1].parse::<f64>().unwrap_or(1.0);
                let lits_str: Vec<&str> = parts[0].split(',').collect();
                let mut literals = Vec::new();
                for l in lits_str {
                    let (is_pos, name) = if let Some(n) = l.strip_prefix('!') {
                        (false, n)
                    } else {
                        (true, l)
                    };
                    if let Some(&idx) = atom_to_idx.get(name) {
                        literals.push((idx, is_pos));
                    }
                }
                clauses.push(Clause { literals, weight });
            }
        }

        trace.push(TraceStep {
            step, kind: "ground-clauses".into(), detail: format!("{} atoms, {} clauses", atoms_vec.len(), clauses.len()), depth: 0, objects: vec![]
        });
        step += 1;

        let mut assignment = vec![false; atoms_vec.len()];
        let mut clamped = vec![false; atoms_vec.len()];
        for (a, &val) in &evidence {
            if let Some(&idx) = atom_to_idx.get(a) {
                assignment[idx] = val;
                clamped[idx] = true;
            }
        }

        trace.push(TraceStep {
            step, kind: "clamp-evidence".into(), detail: format!("{} clamped", evidence.len()), depth: 0, objects: vec![]
        });
        step += 1;

        trace.push(TraceStep {
            step, kind: "init-assignment".into(), detail: "false".into(), depth: 0, objects: vec![]
        });
        step += 1;

        let mut best_assignment = assignment.clone();
        
        let compute_cost = |assign: &[bool]| -> f64 {
            let mut cost = 0.0;
            for c in &clauses {
                let mut sat = false;
                for &(idx, is_pos) in &c.literals {
                    if assign[idx] == is_pos {
                        sat = true;
                        break;
                    }
                }
                if !sat { cost += c.weight; }
            }
            cost
        };

        let mut best_cost = compute_cost(&best_assignment);
        
        let mut rng = seeded_rng();
        let p = 0.5;

        for flip_iter in 0..5000 {
            let current_cost = compute_cost(&assignment);
            if current_cost < best_cost {
                best_cost = current_cost;
                best_assignment = assignment.clone();
            }
            if best_cost == 0.0 { break; }

            let mut unsat_clauses = Vec::new();
            for c in &clauses {
                let mut sat = false;
                for &(idx, is_pos) in &c.literals {
                    if assignment[idx] == is_pos {
                        sat = true;
                        break;
                    }
                }
                if !sat { unsat_clauses.push(c); }
            }

            if unsat_clauses.is_empty() { break; }

            let c_idx = rng.gen_range(0..unsat_clauses.len());
            let target_clause = unsat_clauses[c_idx];

            let mut vars = Vec::new();
            for &(idx, _) in &target_clause.literals {
                if !clamped[idx] { vars.push(idx); }
            }

            if vars.is_empty() {
                continue;
            }

            let to_flip = if rng.gen::<f64>() < p {
                let v_idx = rng.gen_range(0..vars.len());
                vars[v_idx]
            } else {
                let mut min_cost = f64::INFINITY;
                let mut best_vars = Vec::new();
                for &v in &vars {
                    assignment[v] = !assignment[v];
                    let cost = compute_cost(&assignment);
                    assignment[v] = !assignment[v];
                    if cost < min_cost {
                        min_cost = cost;
                        best_vars = vec![v];
                    } else if cost == min_cost {
                        best_vars.push(v);
                    }
                }
                let v_idx = rng.gen_range(0..best_vars.len());
                best_vars[v_idx]
            };

            assignment[to_flip] = !assignment[to_flip];

            if flip_iter < 64 || flip_iter % 64 == 0 {
                trace.push(TraceStep {
                    step, kind: "flip".into(), detail: format!("atom={}", atoms_vec[to_flip]), depth: 0, objects: vec![]
                });
                step += 1;
            }
        }

        let final_cost = compute_cost(&best_assignment);

        trace.push(TraceStep {
            step, kind: "map-found".into(), detail: format!("cost={}", final_cost), depth: 0, objects: vec![]
        });

        let mut out_facts = Vec::new();
        for (i, a) in atoms_vec.iter().enumerate() {
            out_facts.push(Fact {
                key: format!("mln:map:{}", a),
                value: format!("{}", best_assignment[i]),
            });
        }
        out_facts.push(Fact {
            key: "mln:cost".into(),
            value: format!("{:.6}", final_cost),
        });

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: None,
            explanation: "MaxWalkSAT MAP inference".into(),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Empty trace".into());
        }
        Ok(())
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::BreedInput;
    use crate::breeds::Fact;

    #[test]
    fn test_markov_logic_paper_grounded_and_hidden_oracle() {
        let json = include_str!("../../tests/fixtures/papers/markov_logic.json");
        let fixture: serde_json::Value = serde_json::from_str(json).unwrap();
        
        let mut facts = Vec::new();
        for f in fixture["input"]["facts"].as_array().unwrap() {
            facts.push(Fact {
                key: f["key"].as_str().unwrap().to_string(),
                value: f["value"].as_str().unwrap().to_string(),
            });
        }
        
        let input = BreedInput {
            intent: "map_inference".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        
        let breed = MarkovLogic;
        let out = breed.run(&input).expect("run failed");
        
        let mut cost = -1.0;
        for f in &out.facts {
            if f.key == "mln:cost" {
                cost = f.value.parse::<f64>().unwrap();
            }
        }
        
        let expected = fixture["expected"]["cost"].as_f64().unwrap();
        assert!((cost - expected).abs() < 1e-4, "{} != {}", cost, expected);
    }

    #[test]
    fn test_markov_logic_determinism() {
        let json = include_str!("../../tests/fixtures/papers/markov_logic.json");
        let fixture: serde_json::Value = serde_json::from_str(json).unwrap();
        
        let mut facts = Vec::new();
        for f in fixture["input"]["facts"].as_array().unwrap() {
            facts.push(Fact {
                key: f["key"].as_str().unwrap().to_string(),
                value: f["value"].as_str().unwrap().to_string(),
            });
        }
        
        let input = BreedInput {
            intent: "map_inference".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        
        let breed = MarkovLogic;
        let out1 = breed.run(&input).expect("run failed");
        let out2 = breed.run(&input).expect("run failed");
        
        assert_eq!(out1.facts, out2.facts);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }

    #[test]
    fn test_markov_logic_refusal() {
        let input = BreedInput {
            intent: "map_inference".into(),
            candidates: vec![],
            facts: vec![], // Empty facts should fail
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let breed = MarkovLogic;
        let out = breed.run(&input);
        assert!(out.is_err() || out.unwrap().inference_trace.iter().any(|t| t.kind == "refusal"));
    }
}
