//! Constraint Logic Programming (Jaffar 1987).
//!
//! Rank-1 (mathematical theorem): Incremental constraint store with pure
//! propagation reaching fixed-point.

use crate::breeds::support::csp::{CspStore, TraceEvent};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep, Fact
};

/// Constraint Logic Programming breed
pub struct Clp;

impl CognitionBreed for Clp {
    fn id(&self) -> BreedId {
        BreedId::Clp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "incremental_constraint_store".to_string(),
            "arc_consistency_propagation".to_string(),
            "backtrack_free_inference".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let vars: Vec<&Fact> = input.facts.iter().filter(|f| f.key == "clp-var" || f.key == "csp-var").collect();
        if vars.is_empty() {
            return Err("CLP requires at least one variable".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut store = CspStore::new();

        for fact in &input.facts {
            if fact.key == "clp-var" || fact.key == "csp-var" {
                let parts: Vec<&str> = fact.value.split(':').collect();
                if parts.len() != 2 {
                    return Err(BreedError { breed: self.id(), message: format!("malformed var: {}", fact.value) });
                }
                let domain = parts[1].split(',').map(|s| s.to_string()).collect();
                store.add_var(parts[0], domain);
            } else if fact.key == "clp-constraint" || fact.key == "csp-constraint" {
                let ops = [">=", "<=", "!=", "==", "<", ">"];
                let mut found = false;
                for op in ops {
                    if fact.value.contains(op) {
                        let parts: Vec<&str> = fact.value.split(op).collect();
                        if parts.len() == 2 {
                            store.add_constraint(parts[0], parts[1], op);
                            found = true;
                            break;
                        }
                    }
                }
                if !found {
                    return Err(BreedError { breed: self.id(), message: format!("malformed constraint: {}", fact.value) });
                }
            }
        }

        let solution = store.solve();

        let mut trace = Vec::new();
        for (i, event) in store.trace.iter().enumerate() {
            let (kind, detail) = match event {
                TraceEvent::Init { vars, constraints } => (
                    "clp-init".to_string(),
                    format!("vars={} constraints={}", vars, constraints),
                ),
                TraceEvent::Propagate { var, domain } => (
                    "clp-propagate".to_string(),
                    format!("var={} domain={:?}", var, domain),
                ),
                TraceEvent::Revise { x, y, pruned } => (
                    "clp-revise".to_string(),
                    format!("x={} y={} pruned={}", x, y, pruned),
                ),
                TraceEvent::Assign { var, val } => (
                    "clp-assign".to_string(),
                    format!("var={} val={}", var, val),
                ),
                TraceEvent::Backtrack { var } => (
                    "clp-backtrack".to_string(),
                    format!("var={}", var),
                ),
                TraceEvent::Verdict { satisfiable } => (
                    "clp-verdict".to_string(),
                    format!("satisfiable={}", satisfiable),
                ),
            };

            trace.push(TraceStep {
                step: i,
                kind,
                detail,
                depth: 0,
                objects: vec![],
            });
        }

        let explanation = if let Some(ref sol) = solution {
            let mut parts: Vec<_> = sol.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
            parts.sort();
            format!("SAT: {}", parts.join(", "))
        } else {
            "UNSAT".to_string()
        };

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: if solution.is_some() { Some("sat".to_string()) } else { None },
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("CLP must emit at least one trace step".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cand(id: &str, score: f32) -> crate::breeds::Candidate {
        crate::breeds::Candidate {
            id: id.to_string(),
            score,
            eliminated: false,
            elimination_reason: None,
        }
    }

    fn fact(key: &str, value: &str) -> Fact {
        Fact { key: key.to_string(), value: value.to_string() }
    }

    fn input_with(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "solve".to_string(),
            candidates: vec![cand("sat", 1.0)],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_zero_backtrack_oracle() {
        // x<y<z<=3 over 1..5
        let facts = vec![
            fact("clp-var", "x:1,2,3,4,5"),
            fact("clp-var", "y:1,2,3,4,5"),
            fact("clp-var", "z:1,2,3,4,5"),
            fact("clp-var", "v3:3"),
            fact("clp-constraint", "x<y"),
            fact("clp-constraint", "y<z"),
            fact("clp-constraint", "z<=v3"),
        ];
        let input = input_with(facts);
        let out = Clp.run(&input).expect("success");
        assert_eq!(out.explanation, "SAT: v3=3, x=1, y=2, z=3");
        
        let backtrack_count = out.inference_trace.iter().filter(|t| t.kind == "clp-backtrack").count();
        assert_eq!(backtrack_count, 0, "must solve with zero backtracks");
        
        let has_propagate = out.inference_trace.iter().any(|t| t.kind == "clp-propagate");
        assert!(has_propagate, "must show propagation sequence");
    }

    #[test]
    fn refuses_domain_too_large() {
        let inp = input(vec![
            fact("clp:var:x", "1..100"),
            fact("clp:constraint:c1", "x=1"),
        ]);
        assert!(Clp.custom_check(&inp).is_some());
    }

    #[test]
    fn refuses_malformed_constraint() {
        let inp = input(vec![
            fact("clp:var:x", "1..5"),
            fact("clp:constraint:c1", "x<<<y"),
        ]);
        assert!(Clp.preconditions(&inp).is_err());
    }

    #[test]
    fn falsification_gate_alldiff_singleton_elimination() {
        let out = Clp
            .run(&input(vec![
                fact("clp:var:a", "1..1"),
                fact("clp:var:b", "1..3"),
                fact("clp:var:c", "1..3"),
                fact("clp:constraint:c1", "alldiff(a,b,c)"),
                fact("clp:constraint:c2", "b<c"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("a=1,b=2,c=3"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "clp:backtracks" && f.value == "0"));
    }

    #[test]
    fn invariant_order_independence() {
        let facts1 = vec![
            fact("clp:var:x", "1..5"),
            fact("clp:var:y", "1..5"),
            fact("clp:var:z", "1..5"),
            fact("clp:constraint:c1", "x<y"),
            fact("clp:constraint:c2", "y<z"),
        ];
        let facts2 = vec![
            fact("clp:var:z", "1..5"),
            fact("clp:var:y", "1..5"),
            fact("clp:var:x", "1..5"),
            fact("clp:constraint:c2", "y<z"),
            fact("clp:constraint:c1", "x<y"),
        ];
        let out1 = Clp.run(&input(facts1)).unwrap();
        let out2 = Clp.run(&input(facts2)).unwrap();

        let sol1 = out1.selected.unwrap();
        let sol2 = out2.selected.unwrap();
        assert_eq!(sol1, "x=1,y=2,z=3");
        assert_eq!(sol2, "x=1,y=2,z=3");
    }
}
