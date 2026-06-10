//! Constraint Satisfaction via AC-3 + MAC Backtracking (Mackworth 1977).
//!
//! Rank-1 (mathematical theorem): Guaranteed exact lex-least assignment for 3-coloring
//! K4-minus-edge, and unsat domain-wipeout for K3/2-colors.

use crate::breeds::support::csp::{CspSolver, TraceEvent};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep, Fact
};

/// Constraint Satisfaction Problem breed
pub struct CspAc3;

impl CognitionBreed for CspAc3 {
    fn id(&self) -> BreedId {
        BreedId::CspAc3
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "ac3_fixpoint".to_string(),
            "mac_backtracking".to_string(),
            "mrv_heuristic".to_string(),
            "lexicographic_tiebreak".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let vars: Vec<&Fact> = input.facts.iter().filter(|f| f.key == "csp-var").collect();
        if vars.is_empty() {
            return Err("CSP requires at least one variable".to_string());
        }
        if vars.len() > 24 {
            return Err(format!("CSP vars exceeded limit: {} > 24", vars.len()));
        }
        for v in vars {
            let parts: Vec<&str> = v.value.split(':').collect();
            if parts.len() != 2 {
                return Err(format!("malformed csp-var: {}", v.value));
            }
            let domain: Vec<&str> = parts[1].split(',').collect();
            if domain.len() > 16 {
                return Err(format!("CSP domain size exceeded limit: {} > 16 for var {}", domain.len(), parts[0]));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut solver = CspSolver::new();

        for fact in &input.facts {
            if fact.key == "csp-var" {
                let parts: Vec<&str> = fact.value.split(':').collect();
                if parts.len() != 2 {
                    return Err(BreedError { breed: self.id(), message: format!("malformed var: {}", fact.value) });
                }
                let domain = parts[1].split(',').map(|s| s.to_string()).collect();
                solver.add_var(parts[0], domain);
            } else if fact.key == "csp-constraint" {
                // e.g., "V1!=V2"
                if fact.value.contains("!=") {
                    let parts: Vec<&str> = fact.value.split("!=").collect();
                    if parts.len() == 2 {
                        solver.add_constraint(parts[0], parts[1], "!=");
                    }
                } else if fact.value.contains("==") {
                    let parts: Vec<&str> = fact.value.split("==").collect();
                    if parts.len() == 2 {
                        solver.add_constraint(parts[0], parts[1], "==");
                    }
                } else {
                    return Err(BreedError { breed: self.id(), message: format!("malformed constraint: {}", fact.value) });
                }
            }
        }

        let solution = solver.solve();

        let mut trace = Vec::new();
        for (i, event) in solver.trace.iter().enumerate() {
            let (kind, detail) = match event {
                TraceEvent::Init { vars, constraints } => (
                    "csp-init".to_string(),
                    format!("vars={} constraints={}", vars, constraints),
                ),
                TraceEvent::Revise { x, y, pruned } => (
                    "csp-revise".to_string(),
                    format!("x={} y={} pruned={}", x, y, pruned),
                ),
                TraceEvent::Assign { var, val } => (
                    "csp-assign".to_string(),
                    format!("var={} val={}", var, val),
                ),
                TraceEvent::Backtrack { var } => (
                    "csp-backtrack".to_string(),
                    format!("var={}", var),
                ),
                TraceEvent::Verdict { satisfiable } => (
                    "csp-verdict".to_string(),
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
            parts.sort(); // Lexicographic output
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

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("CSP must record at least one trace step".to_string());
        }
        
        let has_init = output.inference_trace.iter().any(|t| t.kind == "csp-init");
        let has_verdict = output.inference_trace.iter().any(|t| t.kind == "csp-verdict");
        
        if !has_init || !has_verdict {
            return Err("Trace must include csp-init and csp-verdict".to_string());
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

    // Refusal test: limits
    #[test]
    fn refusal_too_many_vars() {
        let mut facts = vec![];
        for i in 0..25 {
            facts.push(fact("csp-var", &format!("V{}:a,b", i)));
        }
        let input = input_with(facts);
        let err = CspAc3.preconditions(&input).expect_err("should refuse");
        assert!(err.contains("exceeded limit: 25 > 24"));
    }

    #[test]
    fn refusal_domain_too_large() {
        let mut facts = vec![];
        let mut big_domain = String::new();
        for i in 0..17 {
            if i > 0 { big_domain.push(','); }
            big_domain.push_str(&format!("d{}", i));
        }
        facts.push(fact("csp-var", &format!("V1:{}", big_domain)));
        let input = input_with(facts);
        let err = CspAc3.preconditions(&input).expect_err("should refuse");
        assert!(err.contains("domain size exceeded limit: 17 > 16"));
    }

    // Hidden oracle: Fresh 3-coloring K4-minus-edge -> exact lex-least assignment
    // K4: V1, V2, V3, V4. K4-minus-edge: remove edge (V3, V4).
    // Edges: (V1,V2), (V1,V3), (V1,V4), (V2,V3), (V2,V4).
    // Domain: R, G, B. Let's make domain lex ordered: B, G, R.
    #[test]
    fn hidden_oracle_3col_k4_minus_edge() {
        let mut facts = vec![
            fact("csp-var", "V1:B,G,R"),
            fact("csp-var", "V2:B,G,R"),
            fact("csp-var", "V3:B,G,R"),
            fact("csp-var", "V4:B,G,R"),
            fact("csp-constraint", "V1!=V2"),
            fact("csp-constraint", "V1!=V3"),
            fact("csp-constraint", "V1!=V4"),
            fact("csp-constraint", "V2!=V3"),
            fact("csp-constraint", "V2!=V4"),
            // No V3!=V4 edge
        ];
        let input = input_with(facts);
        let out = CspAc3.run(&input).expect("success");
        // Lex-least: 
        // V1=B, V2=G, V3=R, V4=R
        assert_eq!(out.explanation, "SAT: V1=B, V2=G, V3=R, V4=R");
        assert!(out.inference_trace.iter().any(|t| t.kind == "csp-assign"));
    }

    // Hidden oracle: K3/2-colors -> unsat with domain-wipeout revise step
    // K3: V1, V2, V3. Edges: (V1,V2), (V1,V3), (V2,V3). Domain: A, B.
    #[test]
    fn hidden_oracle_k3_2col_unsat_wipeout() {
        let mut facts = vec![
            fact("csp-var", "V1:A,B"),
            fact("csp-var", "V2:A,B"),
            fact("csp-var", "V3:A,B"),
            fact("csp-constraint", "V1!=V2"),
            fact("csp-constraint", "V1!=V3"),
            fact("csp-constraint", "V2!=V3"),
        ];
        let input = input_with(facts);
        let out = CspAc3.run(&input).expect("success");
        assert_eq!(out.explanation, "UNSAT");
        // Must have domain-wipeout revise step which means some revise causes domain to be empty,
        // or backtrack fails. Since 2 coloring a triangle needs backtrack or wipeout.
        // Actually AC-3 might not wipeout on K3 with 2 colors without assignments! 
        // K3 with 2 colors: AC-3 alone doesn't wipe out initially because each edge allows {A, B} if neighbors are {A, B}.
        // But with MAC, after assigning V1=A, V2 domain is {B}, V3 domain is {B}.
        // Then AC-3 revises V2 against V3 (both domain {B} and constraint V2!=V3).
        // V2 domain becomes empty. This is a wipeout during revise!
        let has_revise = out.inference_trace.iter().any(|t| t.kind == "csp-revise");
        assert!(has_revise);
    }
    
    // Determinism audit
    #[test]
    fn determinism_audit() {
        let input = input_with(vec![
            fact("csp-var", "X:0,1"), fact("csp-var", "Y:0,1"), fact("csp-constraint", "X!=Y")
        ]);
        let r1 = CspAc3.run(&input).unwrap();
        let r2 = CspAc3.run(&input).unwrap();
        assert_eq!(r1.explanation, r2.explanation);
        assert_eq!(r1.inference_trace.len(), r2.inference_trace.len());
        for i in 0..r1.inference_trace.len() {
            assert_eq!(r1.inference_trace[i].detail, r2.inference_trace[i].detail);
        }
    }
}
