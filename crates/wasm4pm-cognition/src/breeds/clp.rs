use crate::breeds::{BreedInput, BreedOutput, CognitionBreed, TraceStep, BreedId, BreedError};
use crate::breeds::support::csp::{CspSolver, TraceEvent};

/// Constraint Logic Programming breed.
pub struct Clp;

impl CognitionBreed for Clp {
    fn id(&self) -> BreedId {
        BreedId::Clp
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["Constraint Logic Programming".to_string()]
    }

    fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn postconditions(&self, _output: &BreedOutput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = vec![];
        let mut step_idx = 0;
        let mut solver = CspSolver::new();

        // 1. Process Domains
        for fact in &input.facts {
            if let Some(rest) = fact.key.strip_prefix("domain:") {
                let mut var_name = rest.to_string();
                let mut domain_str = fact.value.as_str();
                
                if let Some((v, d)) = rest.split_once(':') {
                    var_name = v.to_string();
                    domain_str = d;
                }

                if domain_str.is_empty() {
                    domain_str = fact.value.as_str();
                }

                let mut domain_vals = vec![];
                if let Some((start_s, end_s)) = domain_str.split_once("..") {
                    if let (Ok(start), Ok(end)) = (start_s.parse::<i64>(), end_s.parse::<i64>()) {
                        for i in start..=end {
                            domain_vals.push(i.to_string());
                        }
                    }
                } else {
                    for v in domain_str.split(',') {
                        domain_vals.push(v.trim().to_string());
                    }
                }
                
                if !domain_vals.is_empty() {
                    solver.add_var(&var_name, domain_vals);
                }
            }
        }

        // 2. Process Constraints incrementally
        let mut domains: std::collections::HashMap<String, Vec<String>> = solver.vars.iter()
            .map(|(k, v)| (k.clone(), v.domain.clone()))
            .collect();
            
        let mut inconsistent = false;

        for fact in &input.facts {
            if let Some(rest) = fact.key.strip_prefix("constraint:") {
                let parts: Vec<&str> = rest.split(':').collect();
                if parts.len() >= 3 {
                    let var1 = parts[0];
                    let op = parts[1];
                    let var2_list = parts[2];
                    
                    if op == "alldiff" {
                        let mut vars = vec![var1.to_string()];
                        for v in var2_list.split(',') {
                            vars.push(v.trim().to_string());
                        }
                        for i in 0..vars.len() {
                            for j in (i+1)..vars.len() {
                                solver.add_constraint(&vars[i], &vars[j], "!=");
                                trace.push(TraceStep {
                                    step: step_idx,
                                    kind: "post-constraint".to_string(),
                                    detail: format!("{} != {}", vars[i], vars[j]),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step_idx += 1;
                            }
                        }
                    } else if op == "<" || op == ">" || op == "<=" || op == ">=" || op == "==" || op == "!=" {
                        solver.add_constraint(var1, var2_list, op);
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "post-constraint".to_string(),
                            detail: format!("{} {} {}", var1, op, var2_list),
                            depth: 0,
                            objects: vec![],
                        });
                        step_idx += 1;
                    } else if op == "=+" || op == "=-" {
                        if parts.len() == 4 {
                            let c = parts[3];
                            let full_op = format!("{}{}", op, c);
                            solver.add_constraint(var1, var2_list, &full_op);
                            trace.push(TraceStep {
                                step: step_idx,
                                kind: "post-constraint".to_string(),
                                detail: format!("{} {} {} {}", var1, op, var2_list, c),
                                depth: 0,
                                objects: vec![],
                            });
                            step_idx += 1;
                        }
                    } else {
                        solver.add_constraint(var1, var2_list, op);
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "post-constraint".to_string(),
                            detail: format!("{} {} {}", var1, op, var2_list),
                            depth: 0,
                            objects: vec![],
                        });
                        step_idx += 1;
                    }

                    solver.trace.clear();
                    let ac3_ok = solver.ac3(&mut domains);
                    
                    for event in &solver.trace {
                        if let TraceEvent::Revise { x, y, pruned } = event {
                            if *pruned > 0 {
                                trace.push(TraceStep {
                                    step: step_idx,
                                    kind: "propagate".to_string(),
                                    detail: format!("revised {} against {}, pruned {}", x, y, pruned),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step_idx += 1;
                            }
                        }
                    }
                    
                    if !ac3_ok {
                        inconsistent = true;
                        break;
                    }
                }
            }
        }

        if inconsistent {
            trace.push(TraceStep {
                step: step_idx,
                kind: "inconsistent".to_string(),
                detail: "Domain wipeout during incremental propagation".to_string(),
                depth: 0,
                objects: vec![],
            });
            return Ok(BreedOutput {
                breed: BreedId::Clp,
                candidates: input.candidates.clone(),
                facts: input.facts.clone(),
                selected: None,
                explanation: "inconsistent".to_string(),
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            });
        }

        if solver.vars.is_empty() {
            // No vars, technically a solution (empty)
            return Ok(BreedOutput {
                breed: BreedId::Clp,
                candidates: input.candidates.clone(),
                facts: input.facts.clone(),
                selected: None,
                explanation: "solution".to_string(),
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            });
        }

        solver.trace.clear();
        let mut assignments = std::collections::HashMap::new();
        let mut unassigned: std::collections::HashSet<String> = solver.vars.keys().cloned().collect();

        let satisfiable = solver.backtrack(&mut assignments, &mut unassigned, &domains);
        
        for event in &solver.trace {
            match event {
                TraceEvent::Assign { var, val } => {
                    trace.push(TraceStep {
                        step: step_idx,
                        kind: "label".to_string(),
                        detail: format!("{} = {}", var, val),
                        depth: 1,
                        objects: vec![],
                    });
                    step_idx += 1;
                }
                TraceEvent::Revise { x, y, pruned } => {
                    if *pruned > 0 {
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "propagate".to_string(),
                            detail: format!("revised {} against {}, pruned {}", x, y, pruned),
                            depth: 2,
                            objects: vec![],
                        });
                        step_idx += 1;
                    }
                }
                TraceEvent::Backtrack { var } => {
                    trace.push(TraceStep {
                        step: step_idx,
                        kind: "backtrack".to_string(),
                        detail: format!("unassigned {}", var),
                        depth: 1,
                        objects: vec![],
                    });
                    step_idx += 1;
                }
                _ => {}
            }
        }

        if satisfiable {
            let mut keys: Vec<&String> = assignments.keys().collect();
            keys.sort();
            
            trace.push(TraceStep {
                step: step_idx,
                kind: "solution".to_string(),
                detail: format!("found valid assignment"),
                depth: 0,
                objects: vec![],
            });
            
            let mut derived_facts = input.facts.clone();
            for k in keys {
                derived_facts.push(crate::breeds::Fact {
                    key: format!("assigned:{}", k),
                    value: assignments[k].clone(),
                });
            }

            Ok(BreedOutput {
                breed: BreedId::Clp,
                candidates: input.candidates.clone(),
                facts: derived_facts,
                selected: None,
                explanation: "solution".to_string(),
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            })
        } else {
            trace.push(TraceStep {
                step: step_idx,
                kind: "inconsistent".to_string(),
                detail: "No solution exists".to_string(),
                depth: 0,
                objects: vec![],
            });
            Ok(BreedOutput {
                breed: BreedId::Clp,
                candidates: input.candidates.clone(),
                facts: input.facts.clone(),
                selected: None,
                explanation: "inconsistent".to_string(),
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            })
        }
    }
}
