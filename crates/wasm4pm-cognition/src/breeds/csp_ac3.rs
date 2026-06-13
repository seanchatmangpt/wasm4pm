//! Constraint satisfaction via AC-3 + MAC backtracking — Mackworth 1977.
//!
//! Delegates to the proven `support::csp` solver: AC-3 to fixpoint, then
//! backtracking with MRV variable selection (lexicographic tie-break),
//! lexicographic value ordering, and MAC (arc consistency maintained after
//! each assignment).
//!
//! Input contract (facts):
//! - `csp-var` = `"Name:v1,v2,..."` (≤24 vars, domains ≤16),
//! - `csp-constraint` = `"X!=Y"` or `"X==Y"`.
//!
//! Trace kinds: `csp-init`(1,1) → {`csp-revise`,`csp-assign`,
//! `csp-backtrack`}(0,*) → `csp-verdict`(1,1).

use crate::breeds::support::breed_class::VerifierBreed;
use crate::breeds::support::csp::{CspSolver, TraceEvent};
use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};

/// AC-3 + MAC constraint satisfaction breed.
pub struct CspAc3;

impl BoundedBreed for CspAc3 {
    fn breed_name(&self) -> &'static str {
        "csp_ac3"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        let vars: Vec<&Fact> = input.facts.iter().filter(|f| f.key == "csp-var").collect();
        if vars.len() > 24 {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!("CSP vars exceeded limit: {} > 24", vars.len()),
            });
        }
        for v in vars {
            let parts: Vec<&str> = v.value.split(':').collect();
            if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
                // Malformed csp-var is a content error, reported by preconditions().
                continue;
            }
            let domain: Vec<&str> = parts[1].split(',').collect();
            if domain.len() > 16 {
                return Some(CognitionError::ComplexityCap {
                    breed: self.breed_name(),
                    detail: format!(
                        "CSP domain size exceeded limit: {} > 16 for var {}",
                        domain.len(),
                        parts[0]
                    ),
                });
            }
        }
        None
    }
}

impl VerifierBreed for CspAc3 {
    fn valid_verdicts(&self) -> &'static [&'static str] {
        &["sat", "unsat"]
    }
}

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
            return Err("csp_ac3 requires at least one csp-var fact".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        for v in vars {
            let parts: Vec<&str> = v.value.split(':').collect();
            if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
                return Err(format!("malformed csp-var: {}", v.value));
            }
        }
        for c in input.facts.iter().filter(|f| f.key == "csp-constraint") {
            if !c.value.contains("!=") && !c.value.contains("==") {
                return Err(format!("malformed csp-constraint: {}", c.value));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |message: String| BreedError {
            breed: BreedId::CspAc3,
            message,
        };
        let mut solver = CspSolver::new();

        for fact in &input.facts {
            if fact.key == "csp-var" {
                let parts: Vec<&str> = fact.value.split(':').collect();
                if parts.len() != 2 {
                    return Err(err(format!("malformed csp-var: {}", fact.value)));
                }
                let domain = parts[1].split(',').map(|s| s.trim().to_string()).collect();
                solver.add_var(parts[0].trim(), domain);
            } else if fact.key == "csp-constraint" {
                if fact.value.contains("!=") {
                    let parts: Vec<&str> = fact.value.split("!=").collect();
                    if parts.len() == 2 {
                        solver.add_constraint(parts[0].trim(), parts[1].trim(), "!=");
                    } else {
                        return Err(err(format!("malformed csp-constraint: {}", fact.value)));
                    }
                } else if fact.value.contains("==") {
                    let parts: Vec<&str> = fact.value.split("==").collect();
                    if parts.len() == 2 {
                        solver.add_constraint(parts[0].trim(), parts[1].trim(), "==");
                    } else {
                        return Err(err(format!("malformed csp-constraint: {}", fact.value)));
                    }
                } else {
                    return Err(err(format!("malformed csp-constraint: {}", fact.value)));
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
                TraceEvent::Assign { var, val } => {
                    ("csp-assign".to_string(), format!("var={} val={}", var, val))
                }
                TraceEvent::Backtrack { var } => {
                    ("csp-backtrack".to_string(), format!("var={}", var))
                }
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

        let (explanation, out_facts) = if let Some(ref sol) = solution {
            let mut parts: Vec<_> = sol.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
            parts.sort();
            let facts = parts
                .iter()
                .map(|p| {
                    let (k, v) = p.split_once('=').unwrap_or((p.as_str(), ""));
                    Fact {
                        key: format!("csp:assignment:{}", k),
                        value: v.to_string(),
                    }
                })
                .collect();
            (format!("SAT: {}", parts.join(", ")), facts)
        } else {
            ("UNSAT".to_string(), vec![])
        };

        Ok(BreedOutput {
            breed: BreedId::CspAc3,
            candidates: input.candidates.clone(),
            facts: {
                let mut f = input.facts.clone();
                f.extend(out_facts);
                f
            },
            selected: Some(if solution.is_some() { "sat" } else { "unsat" }.to_string()),
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        self.assert_verdict_valid(output)?;
        TraceQuery::from_output(output)
            .require_non_empty_with_kinds(&["csp-init", "csp-verdict"])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn var(name: &str, vals: &str) -> Fact {
        Fact {
            key: "csp-var".into(),
            value: format!("{}:{}", name, vals),
        }
    }

    fn con(c: &str) -> Fact {
        Fact {
            key: "csp-constraint".into(),
            value: c.into(),
        }
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "solve".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// 3-coloring triangle: lex-least solution must be X=B,Y=G,Z=R, not any other valid coloring.
    /// If the constraint evaluator confuses != with ==, explanation becomes "SAT: X=B,Y=B,Z=B".
    #[test]
    fn triangle_lex_least_coloring() {
        let out = CspAc3
            .run(&input(vec![
                var("X", "B,G,R"),
                var("Y", "B,G,R"),
                var("Z", "B,G,R"),
                con("X!=Y"),
                con("Y!=Z"),
                con("X!=Z"),
            ]))
            .expect("run ok");
        assert_eq!(
            out.explanation, "SAT: X=B, Y=G, Z=R",
            "lex-least coloring must be X=B,Y=G,Z=R under MRV+lex-value ordering"
        );
    }

    /// A 2-node binary graph with only 1 value per domain and != must be UNSAT.
    /// If AC-3 doesn't prune or backtracking doesn't detect failure, verdict is wrong.
    #[test]
    fn unsat_single_value_domains_with_neq() {
        let out = CspAc3
            .run(&input(vec![var("A", "red"), var("B", "red"), con("A!=B")]))
            .expect("run ok");
        assert_eq!(
            out.selected.as_deref(),
            Some("unsat"),
            "A=red B=red with A!=B is unsatisfiable"
        );
    }

    /// == constraint: two vars must have the same value; [1,2] domains → A=1,B=1 (lex).
    #[test]
    fn eq_constraint_selects_lex_first() {
        let out = CspAc3
            .run(&input(vec![var("A", "1,2"), var("B", "1,2"), con("A==B")]))
            .expect("run ok");
        assert_eq!(
            out.explanation, "SAT: A=1, B=1",
            "== constraint with lex-ordered domains must assign A=1,B=1"
        );
    }

    #[test]
    fn refuses_malformed_var() {
        assert!(CspAc3
            .preconditions(&input(vec![
                var("X", "1"),
                Fact {
                    key: "csp-var".into(),
                    value: "Nocolon".into()
                }
            ]))
            .is_err());
    }

    #[test]
    fn refuses_malformed_constraint() {
        assert!(CspAc3
            .preconditions(&input(vec![
                var("X", "1"),
                Fact {
                    key: "csp-constraint".into(),
                    value: "X>Y".into()
                }
            ]))
            .is_err());
    }

    #[test]
    fn falsification_gate_clique_exceeds_domain_size() {
        // A, B, C must all be different, but domains only have 2 values. Pigeonhole principle.
        let out = CspAc3
            .run(&input(vec![
                var("A", "1,2"),
                var("B", "1,2"),
                var("C", "1,2"),
                con("A!=B"),
                con("B!=C"),
                con("A!=C"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("unsat"));
    }

    #[test]
    fn invariant_variable_order_independence() {
        let f1 = vec![var("A", "1"), var("B", "2"), con("A!=B")];
        let f2 = vec![var("B", "2"), var("A", "1"), con("A!=B")];
        let out1 = CspAc3.run(&input(f1)).unwrap();
        let out2 = CspAc3.run(&input(f2)).unwrap();
        assert_eq!(out1.explanation, out2.explanation);
    }
}
