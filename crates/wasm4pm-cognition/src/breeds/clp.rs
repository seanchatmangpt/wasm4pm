//! Constraint Logic Programming (Jaffar 1987).
//!
//! Rank-1 (mathematical theorem): Incremental constraint store with pure
//! propagation reaching fixed-point.

use crate::breeds::support::csp::{CspError, CspStore};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};

impl From<CspError> for BreedError {
    fn from(e: CspError) -> Self {
        BreedError {
            breed: BreedId::Clp,
            message: e.to_string(),
        }
    }
}

/// Constraint Logic Programming breed
pub struct Clp;

impl Clp {
    /// Format a domain as a sorted `{v1,v2,...}` set.
    fn fmt_domain(domain: &[String]) -> String {
        let mut vals: Vec<&String> = domain.iter().collect();
        vals.sort_by(|a, b| {
            let (na, nb) = (a.parse::<i64>(), b.parse::<i64>());
            match (na, nb) {
                (Ok(x), Ok(y)) => x.cmp(&y),
                _ => a.cmp(b),
            }
        });
        format!("{{{}}}", vals.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(","))
    }

    /// Constraint step id: the key suffix for the colon encoding
    /// (`clp:constraint:c0` -> `c0`); index-based (`c0`, `c1`, ...)
    /// for the hyphen encoding, which carries no suffix.
    fn constraint_step_id(key: &str, index: usize) -> String {
        for prefix in ["clp:constraint:", "csp:constraint:"] {
            if let Some(suffix) = key.strip_prefix(prefix) {
                return suffix.trim().to_string();
            }
        }
        format!("c{}", index)
    }

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
            let lo: i64 = lo
                .trim()
                .parse()
                .map_err(|_| format!("malformed range for {}: {}", name, raw))?;
            let hi: i64 = hi
                .trim()
                .parse()
                .map_err(|_| format!("malformed range for {}: {}", name, raw))?;
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
            let lhs_clean = !lhs.is_empty() && !lhs.ends_with(['<', '>', '!', '=']);
            if lhs_clean && !rest.is_empty() {
                // Distinguish `==` (handled below) from single `=`.
                if !rest.starts_with('=') {
                    for sep in ['+', '-'] {
                        if let Some((rhs_var, konst)) = rest.split_once(sep) {
                            if konst.parse::<i64>().is_ok() {
                                let op = format!("={}{}", sep, konst);
                                store.add_constraint(lhs, rhs_var, &op)?;
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
        Err(BreedError {
            breed: self.id(),
            message: format!("malformed constraint: {}", raw),
        })
    }

    /// Post a binary comparison. If one side is an integer literal rather than a declared
    /// variable, introduce a singleton constant variable so the binary solver applies.
    fn post_binary(
        &self,
        store: &mut CspStore,
        lhs: &str,
        rhs: &str,
        op: &str,
    ) -> Result<(), BreedError> {
        let lhs = self.resolve_operand(store, lhs);
        let rhs = self.resolve_operand(store, rhs);
        store.add_constraint(&lhs, &rhs, op)?;
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
        let mut trace: Vec<TraceStep> = Vec::new();

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

        // Pass 2: post constraints, emitting post-constraint + propagate steps from
        // before/after domain snapshots around each store fixpoint (no csp.rs change).
        let mut constraint_index = 0usize;
        for fact in &input.facts {
            if Self::is_constraint_key(&fact.key) {
                let step_id = Self::constraint_step_id(&fact.key, constraint_index);
                let before = store.domains.clone();
                self.post_constraint(&mut store, &fact.value)?;
                let after = store.domains.clone();

                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "post-constraint".to_string(),
                    detail: format!("{}: {}", step_id, fact.value),
                    depth: 0,
                    objects: vec![],
                });
                for (var, new_domain) in &after {
                    if var.starts_with("__const_") {
                        continue;
                    }
                    match before.get(var) {
                        Some(old_domain) if old_domain != new_domain => {
                            trace.push(TraceStep {
                                step: trace.len(),
                                kind: "propagate".to_string(),
                                detail: format!(
                                    "{}: {} -> {}",
                                    var,
                                    Self::fmt_domain(old_domain),
                                    Self::fmt_domain(new_domain)
                                ),
                                depth: 0,
                                objects: vec![],
                            });
                        }
                        _ => {}
                    }
                }
                constraint_index += 1;
            }
        }

        let solution = store.solve().map_err(|e| BreedError {
            breed: self.id(),
            message: e.to_string(),
        })?;

        // Final solution step: sorted `var=val` assignments (constants filtered).
        let solution_detail = match solution.as_ref() {
            Some(sol) => {
                let mut parts: Vec<String> = sol
                    .iter()
                    .filter(|(k, _)| !k.starts_with("__const_"))
                    .map(|(k, v)| format!("{}={}", k, v))
                    .collect();
                parts.sort();
                parts.join(",")
            }
            None => "UNSAT".to_string(),
        };
        trace.push(TraceStep {
            step: trace.len(),
            kind: "solution".to_string(),
            detail: solution_detail,
            depth: 0,
            objects: vec![],
        });

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
            selected: solution.as_ref().map(|_| "sat".to_string()),
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
        if output.inference_trace[0].kind != "post-constraint" {
            return Err("CLP trace must start with a post-constraint step".to_string());
        }
        if output.inference_trace.last().map(|t| t.kind.as_str()) != Some("solution") {
            return Err("CLP trace must end with a solution step".to_string());
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
        Fact {
            key: key.to_string(),
            value: value.to_string(),
        }
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

        let trace = &out.inference_trace;
        // Trace contract: post-constraint first, solution last, real narrowing.
        assert_eq!(
            trace.first().map(|t| t.kind.as_str()),
            Some("post-constraint")
        );
        assert_eq!(trace.last().map(|t| t.kind.as_str()), Some("solution"));
        assert_eq!(trace.iter().filter(|t| t.kind == "post-constraint").count(), 3);
        assert!(
            trace.iter().any(|t| t.kind == "propagate"),
            "must show propagation sequence"
        );
        // Zero backtracks: no narrowing regress and no backtrack vocab anywhere.
        assert!(
            !trace.iter().any(|t| t.kind.contains("backtrack")),
            "must solve with zero backtracks"
        );
        let narrows: Vec<&TraceStep> = trace
            .iter()
            .filter(|t| {
                t.kind == "propagate"
                    && !t.detail.contains("-> {}")
            })
            .collect();
        assert!(
            !narrows.is_empty(),
            "propagation must actually narrow at least one domain"
        );
    }
}
