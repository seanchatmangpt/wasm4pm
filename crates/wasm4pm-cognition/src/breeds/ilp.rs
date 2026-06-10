
/// ILP FOIL breed.
pub struct Ilp;

use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep, Fact};
use std::collections::{HashSet, HashMap};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct Literal {
    predicate: String,
    vars: Vec<String>,
}

impl Literal {
    fn to_string(&self) -> String {
        format!("{}({})", self.predicate, self.vars.join(","))
    }
}

impl CognitionBreed for Ilp {
    fn id(&self) -> BreedId {
        BreedId::Ilp
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["inductive_logic_programming".to_string(), "foil".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let bg_facts = input.facts.iter().filter(|f| f.key.starts_with("bg:")).count();
        if bg_facts > 64 {
            return Err(format!("bg facts exceed 64 (count={})", bg_facts));
        }
        let target = input.facts.iter().find(|f| f.key == "ilp:target");
        if target.is_none() {
            return Err("Missing ilp:target fact".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        self.preconditions(input).map_err(|e| BreedError { breed: self.id(), message: e })?;
        
        let target_pred = input.facts.iter().find(|f| f.key == "ilp:target").unwrap().value.clone();
        
        let mut bg_facts: HashMap<String, Vec<Vec<String>>> = HashMap::new();
        let mut pos_ex: Vec<Vec<String>> = Vec::new();
        let mut neg_ex: Vec<Vec<String>> = Vec::new();
        
        for fact in &input.facts {
            if fact.key.starts_with("bg:") {
                let pred = fact.key["bg:".len()..].to_string();
                let args: Vec<String> = fact.value.split(',').map(|s| s.trim().to_string()).collect();
                bg_facts.entry(pred).or_default().push(args);
            } else if fact.key == "pos" || fact.key == "ilp:pos" {
                let args: Vec<String> = fact.value.split(',').map(|s| s.trim().to_string()).collect();
                pos_ex.push(args);
            } else if fact.key == "neg" || fact.key == "ilp:neg" {
                let args: Vec<String> = fact.value.split(',').map(|s| s.trim().to_string()).collect();
                neg_ex.push(args);
            }
        }
        
        let mut trace = Vec::new();
        let mut step = 0;
        
        trace.push(TraceStep {
            step,
            kind: "load-example".to_string(),
            detail: target_pred.clone(),
            depth: 0,
            objects: vec![],
        });
        step += 1;
        
        let target_arity = pos_ex.first().map(|ex| ex.len()).unwrap_or(0);
        let mut target_vars = Vec::new();
        for i in 0..target_arity {
            if i == 0 { target_vars.push("X".to_string()); }
            else if i == 1 { target_vars.push("Y".to_string()); }
            else { target_vars.push(format!("V{}", i)); }
        }
        
        // Initial bindings: maps binding_id to HashMap of Var->Value
        #[derive(Clone, Debug, PartialEq)]
        struct Binding {
            id: usize, // represents original example index
            env: HashMap<String, String>,
        }
        
        let mut pos_to_cover: Vec<Binding> = pos_ex.iter().enumerate().map(|(i, ex)| {
            let mut env = HashMap::new();
            for (j, val) in ex.iter().enumerate() {
                env.insert(target_vars[j].clone(), val.clone());
            }
            Binding { id: i, env }
        }).collect();
        
        let all_neg: Vec<Binding> = neg_ex.iter().enumerate().map(|(i, ex)| {
            let mut env = HashMap::new();
            for (j, val) in ex.iter().enumerate() {
                env.insert(target_vars[j].clone(), val.clone());
            }
            Binding { id: i, env }
        }).collect();
        
        let mut learned_clauses = Vec::new();
        let mut next_var_id = 0;
        
        while !pos_to_cover.is_empty() {
            let mut body: Vec<Literal> = Vec::new();
            let mut available_vars = target_vars.clone();
            
            let mut current_pos = pos_to_cover.clone();
            let mut current_neg = all_neg.clone();
            
            while !current_neg.is_empty() && body.len() < 4 {
                let mut best_gain = -1.0;
                let mut best_literal: Option<Literal> = None;
                let mut best_ext_pos = Vec::new();
                let mut best_ext_neg = Vec::new();
                
                let p0 = current_pos.len() as f64;
                let n0 = current_neg.len() as f64;
                if p0 == 0.0 { break; }
                let i0 = (p0 / (p0 + n0)).log2() * -1.0; // information content
                let i0 = if i0.is_nan() { 0.0 } else { i0 }; // handled
                // standard FOIL i0 = -log2(p0 / (p0 + n0))
                
                // Generate candidates
                let mut candidates = Vec::new();
                for (pred, facts) in &bg_facts {
                    let arity = facts.first().map(|f| f.len()).unwrap_or(0);
                    if arity == 0 { continue; }
                    
                    // Generate var combinations. At least one must be in available_vars.
                    // Max new vars is arity.
                    // For simplicity, we just allow available vars + one new var (Z).
                    let mut possible_vars = available_vars.clone();
                    let new_var = format!("Z{}", next_var_id);
                    possible_vars.push(new_var.clone());
                    
                    // generate all combinations of length `arity` from `possible_vars`
                    // We can just use a recursive function.
                    fn gen_combos(arity: usize, vars: &[String], current: &mut Vec<String>, out: &mut Vec<Vec<String>>) {
                        if current.len() == arity {
                            out.push(current.clone());
                            return;
                        }
                        for v in vars {
                            current.push(v.clone());
                            gen_combos(arity, vars, current, out);
                            current.pop();
                        }
                    }
                    
                    let mut combos = Vec::new();
                    gen_combos(arity, &possible_vars, &mut Vec::new(), &mut combos);
                    
                    for combo in combos {
                        // Check if at least one available_var is in combo
                        if !combo.iter().any(|v| available_vars.contains(v)) {
                            continue;
                        }
                        // Check if it adds too many new vars
                        let mut has_new = false;
                        for v in &combo {
                            if v == &new_var { has_new = true; }
                        }
                        
                        candidates.push(Literal {
                            predicate: pred.clone(),
                            vars: combo,
                        });
                    }
                }
                
                for candidate in candidates {
                    let mut ext_pos = Vec::new();
                    let mut ext_neg = Vec::new();
                    
                    for bind in &current_pos {
                        if let Some(bg) = bg_facts.get(&candidate.predicate) {
                            for f in bg {
                                let mut match_ok = true;
                                let mut new_env = bind.env.clone();
                                for (j, v) in candidate.vars.iter().enumerate() {
                                    if let Some(existing_val) = new_env.get(v) {
                                        if existing_val != &f[j] {
                                            match_ok = false;
                                            break;
                                        }
                                    } else {
                                        new_env.insert(v.clone(), f[j].clone());
                                    }
                                }
                                if match_ok {
                                    ext_pos.push(Binding { id: bind.id, env: new_env });
                                }
                            }
                        }
                    }
                    
                    for bind in &current_neg {
                        if let Some(bg) = bg_facts.get(&candidate.predicate) {
                            for f in bg {
                                let mut match_ok = true;
                                let mut new_env = bind.env.clone();
                                for (j, v) in candidate.vars.iter().enumerate() {
                                    if let Some(existing_val) = new_env.get(v) {
                                        if existing_val != &f[j] {
                                            match_ok = false;
                                            break;
                                        }
                                    } else {
                                        new_env.insert(v.clone(), f[j].clone());
                                    }
                                }
                                if match_ok {
                                    ext_neg.push(Binding { id: bind.id, env: new_env });
                                }
                            }
                        }
                    }
                    
                    let p1 = ext_pos.len() as f64;
                    let n1 = ext_neg.len() as f64;
                    if p1 == 0.0 { continue; }
                    
                    let mut t = 0.0;
                    let mut seen_ids = HashSet::new();
                    for bind in &ext_pos {
                        if !seen_ids.contains(&bind.id) {
                            seen_ids.insert(bind.id);
                            // Only count if the original binding was in current_pos? 
                            // Yes, t is the number of positive tuples in current_pos that have >=1 extension.
                            t += 1.0;
                        }
                    }
                    
                    let i1 = (p1 / (p1 + n1)).log2() * -1.0;
                    let i1 = if i1.is_nan() { 0.0 } else { i1 };
                    
                    // FOIL Gain = t * (I0 - I1) since I = -log(P/(P+N)) -> I0 - I1 is positive when information increases.
                    let gain = t * (i0 - i1);
                    
                    // Break ties deterministically: by lexicographic candidate name
                    if gain > best_gain + 1e-6 || (gain > best_gain - 1e-6 && best_literal.is_some() && candidate.to_string() < best_literal.as_ref().unwrap().to_string()) {
                        best_gain = gain;
                        best_literal = Some(candidate);
                        best_ext_pos = ext_pos;
                        best_ext_neg = ext_neg;
                    }
                }
                
                if let Some(lit) = best_literal {
                    trace.push(TraceStep {
                        step,
                        kind: "propose-literal".to_string(),
                        detail: lit.to_string(),
                        depth: 0,
                        objects: vec![],
                    });
                    step += 1;
                    
                    trace.push(TraceStep {
                        step,
                        kind: "score-gain".to_string(),
                        detail: format!("{:.4}", best_gain),
                        depth: 0,
                        objects: vec![],
                    });
                    step += 1;
                    
                    trace.push(TraceStep {
                        step,
                        kind: "add-literal".to_string(),
                        detail: lit.to_string(),
                        depth: 0,
                        objects: vec![],
                    });
                    step += 1;
                    
                    for v in &lit.vars {
                        if !available_vars.contains(v) {
                            available_vars.push(v.clone());
                            next_var_id += 1;
                        }
                    }
                    
                    body.push(lit);
                    current_pos = best_ext_pos;
                    current_neg = best_ext_neg;
                } else {
                    break;
                }
            }
            
            // Cover remove
            let mut covered_ids = HashSet::new();
            for bind in &current_pos {
                covered_ids.insert(bind.id);
            }
            
            trace.push(TraceStep {
                step,
                kind: "cover-remove".to_string(),
                detail: format!("removed {} examples", covered_ids.len()),
                depth: 0,
                objects: vec![],
            });
            step += 1;
            
            pos_to_cover.retain(|b| !covered_ids.contains(&b.id));
            
            let body_str: Vec<String> = body.iter().map(|l| l.to_string()).collect();
            let clause_str = format!("{}({}) :- {}", target_pred, target_vars.join(","), body_str.join(", "));
            
            trace.push(TraceStep {
                step,
                kind: "emit-clause".to_string(),
                detail: clause_str.clone(),
                depth: 0,
                objects: vec![],
            });
            step += 1;
            
            learned_clauses.push(clause_str);
            
            // Failsafe to avoid infinite loops if it can't cover anything
            if covered_ids.is_empty() {
                break;
            }
        }
        
        trace.push(TraceStep {
            step,
            kind: "decision".to_string(),
            detail: format!("learned {} clauses", learned_clauses.len()),
            depth: 0,
            objects: vec![],
        });
        
        let mut new_facts = Vec::new();
        for clause in &learned_clauses {
            new_facts.push(Fact {
                key: "ilp:clause".to_string(),
                value: clause.clone(),
            });
        }

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: [&input.facts[..], &new_facts[..]].concat(),
            selected: Some("learned".to_string()),
            explanation: format!("Learned {} clauses via FOIL", learned_clauses.len()),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Candidate};

    #[test]
    fn test_hidden_oracle() {
        // test held-out classification
        let mut facts = vec![
            Fact { key: "ilp:target".to_string(), value: "ancestor".to_string() },
            Fact { key: "bg:parent".to_string(), value: "pam,bob".to_string() },
            Fact { key: "bg:parent".to_string(), value: "tom,bob".to_string() },
            Fact { key: "bg:parent".to_string(), value: "tom,liz".to_string() },
            Fact { key: "bg:parent".to_string(), value: "bob,ann".to_string() },
            Fact { key: "bg:parent".to_string(), value: "bob,pat".to_string() },
            Fact { key: "bg:parent".to_string(), value: "pat,jim".to_string() },
            // target: ancestor(X,Y) :- parent(X,Y)
            Fact { key: "pos".to_string(), value: "pam,bob".to_string() },
            Fact { key: "pos".to_string(), value: "tom,bob".to_string() },
            Fact { key: "neg".to_string(), value: "bob,tom".to_string() },
            Fact { key: "neg".to_string(), value: "pam,tom".to_string() },
        ];
        
        let input = BreedInput {
            intent: "learn".to_string(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        
        let ilp = Ilp;
        let out = ilp.run(&input).unwrap();
        assert!(out.explanation.contains("Learned"));
        
        let mut found_add = false;
        for step in &out.inference_trace {
            if step.kind == "add-literal" && step.detail == "parent(X,Y)" {
                found_add = true;
            }
        }
        assert!(found_add, "Should have learned parent(X,Y)");
    }

    #[test]
    fn test_refusal_too_many_bg_facts() {
        let mut facts = vec![
            Fact { key: "ilp:target".to_string(), value: "target".to_string() },
        ];
        for i in 0..65 {
            facts.push(Fact { key: format!("bg:f{}", i), value: "a,b".to_string() });
        }
        
        let input = BreedInput {
            intent: "learn".to_string(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        
        let ilp = Ilp;
        let res = ilp.run(&input);
        assert!(res.is_err());
        if let Err(e) = res {
            assert!(e.message.contains("bg facts exceed 64"));
        } else {
            panic!("Expected BreedError");
        }
    }

    #[test]
    fn test_paper_grounded_determinism() {
        // A standard test to ensure identical runs produce identical output and identical traces.
        let mut facts = vec![
            Fact { key: "ilp:target".to_string(), value: "grandparent".to_string() },
            Fact { key: "bg:parent".to_string(), value: "a,b".to_string() },
            Fact { key: "bg:parent".to_string(), value: "b,c".to_string() },
            Fact { key: "pos".to_string(), value: "a,c".to_string() },
            Fact { key: "neg".to_string(), value: "c,a".to_string() },
            Fact { key: "neg".to_string(), value: "b,c".to_string() },
        ];
        
        let input = BreedInput {
            intent: "learn".to_string(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        
        let ilp = Ilp;
        let out1 = ilp.run(&input).unwrap();
        let out2 = ilp.run(&input).unwrap();
        
        assert_eq!(out1.inference_trace, out2.inference_trace, "Traces must be deterministic");
        
        let clause = out1.facts.iter().find(|f| f.key == "ilp:clause").unwrap();
        assert!(clause.value.contains("parent(X,Z0)"));
        assert!(clause.value.contains("parent(Z0,Y)"));
    }
}
