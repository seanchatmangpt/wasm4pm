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

impl Clp {
    /// Extract a variable name from a variable-declaring fact, supporting two encodings:
    /// - hyphen contract: key `clp-var`/`csp-var`, value `name:domain` (name before `:`)
    /// - colon contract:  key `clp:var:<name>`/`csp:var:<name>`, value is the domain
    fn var_name(fact: &Fact) -> Option<String> {
        if fact.key == "clp-var" || fact.key == "csp-var" {
            return fact.value.split(':').next().map(|s| s.trim().to_string());
        }
        for prefix in ["clp:var:", "csp:var:"] {
            if let Some(name) = fact.key.strip_prefix(prefix) {
                return Some(name.trim().to_string());
            }
        }
        None
    }

    fn is_constraint_key(key: &str) -> bool {
        key == "clp-constraint"
            || key == "csp-constraint"
            || key.starts_with("clp:constraint:")
            || key.starts_with("csp:constraint:")
    }

    /// Parse a variable's domain from its declaring fact into an explicit value list.
    /// Hyphen encoding carries the domain after `name:`; colon encoding uses the whole value.
    /// Domain syntax is either a comma list (`1,2,3`) or an inclusive range (`6..9`).
    fn parse_domain(fact: &Fact, name: &str) -> Result<Vec<String>, String> {
        let raw = if fact.key == "clp-var" || fact.key == "csp-var" {
            fact.value
                .split_once(':')
                .map(|(_, d)| d)
                .ok_or_else(|| format!("malformed var: {}", fact.value))?
        } else {
            fact.value.as_str()
        };
        let raw = raw.trim();
        if let Some((lo, hi)) = raw.split_once("..") {
            let lo: i64 = lo.trim().parse().map_err(|_| format!("malformed range for {}: {}", name, raw))?;
            let hi: i64 = hi.trim().parse().map_err(|_| format!("malformed range for {}: {}", name, raw))?;
            if hi < lo {
                return Err(format!("empty range for {}: {}", name, raw));
            }
            Ok((lo..=hi).map(|n| n.to_string()).collect())
        } else {
            Ok(raw.split(',').map(|s| s.trim().to_string()).collect())
        }
    }

    /// Post one constraint to the store. Supports binary comparisons between two variables
    /// (`x<y`), arithmetic-offset equalities (`x=y+3` / `x=y-3`), and unary comparisons
    /// against an integer constant (`y<4`), modelled as a binary constraint against a
    /// fresh singleton constant variable so propagation handles it uniformly.
    fn post_constraint(&self, store: &mut CspStore, raw: &str) -> Result<(), BreedError> {
        let expr: String = raw.chars().filter(|c| !c.is_whitespace()).collect();

        // Arithmetic offset: lhs = rhsvar (+|-) const.
        // Only when lhs is a bare identifier (not part of <=, >=, !=, ==).
        if let Some((lhs, rest)) = expr.split_once('=') {
            let lhs_clean = !lhs.is_empty()
                && !lhs.ends_with(['<', '>', '!', '=']);
            if lhs_clean && !rest.is_empty() {
                // Distinguish `==` (handled below) from single `=`.
                if !rest.starts_with('=') {
                    for sep in ['+', '-'] {
                        if let Some((rhs_var, konst)) = rest.split_once(sep) {
                            if konst.parse::<i64>().is_ok() {
                                let op = format!("={}{}", sep, konst);
                                store.add_constraint(lhs, rhs_var, &op);
                                return Ok(());
                            }
                        }
                    }
                    // plain equality `x=y` (no offset) → ==
                    if !rest.contains(['+', '-', '<', '>', '!']) {
                        return self.post_binary(store, lhs, rest, "==");
                    }
                }
            }
        }

        let ops = [">=", "<=", "!=", "==", "<", ">"];
        for op in ops {
            if let Some((lhs, rhs)) = expr.split_once(op) {
                // Ensure this is the leading operator occurrence.
                if expr.find(op) == Some(lhs.len()) {
                    return self.post_binary(store, lhs, rhs, op);
                }
            }
        }
        Err(BreedError { breed: self.id(), message: format!("malformed constraint: {}", raw) })
    }

    /// Post a binary comparison. If one side is an integer literal rather than a declared
    /// variable, introduce a singleton constant variable so the binary solver applies.
    fn post_binary(&self, store: &mut CspStore, lhs: &str, rhs: &str, op: &str) -> Result<(), BreedError> {
        let lhs = self.resolve_operand(store, lhs);
        let rhs = self.resolve_operand(store, rhs);
        store.add_constraint(&lhs, &rhs, op);
        Ok(())
    }

    fn resolve_operand(&self, store: &mut CspStore, operand: &str) -> String {
        if operand.parse::<i64>().is_ok() {
            let const_name = format!("__const_{}", operand);
            if !store.vars.contains_key(&const_name) {
                store.add_var(&const_name, vec![operand.to_string()]);
            }
            const_name
        } else {
            operand.to_string()
        }
    }
}

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
        let has_var = input.facts.iter().any(|f| Self::var_name(f).is_some());
        if !has_var {
            return Err("CLP requires at least one variable".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut store = CspStore::new();

        // Pass 1: declare variables.
        for fact in &input.facts {
            if let Some(name) = Self::var_name(fact) {
                let domain = Self::parse_domain(fact, &name).map_err(|m| BreedError {
                    breed: self.id(),
                    message: m,
                })?;
                store.add_var(&name, domain);
            }
        }

        // Pass 2: post constraints.
        for fact in &input.facts {
            if Self::is_constraint_key(&fact.key) {
                self.post_constraint(&mut store, &fact.value)?;
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
            let mut parts: Vec<_> = sol
                .iter()
                .filter(|(k, _)| !k.starts_with("__const_"))
                .map(|(k, v)| format!("{}={}", k, v))
                .collect();
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

}
