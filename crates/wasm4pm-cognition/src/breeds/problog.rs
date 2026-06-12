//! ProbLog: probabilistic Horn logic by exact possible-worlds enumeration
//! (De Raedt, Kimmig & Toivonen 2007, IJCAI).
//!
//! A ProbLog program is a set of probabilistic facts `p::f` plus definite
//! rules. The success probability of a query q is the sum of the weights of
//! the total choices (possible worlds) in which q is derivable:
//! `P(q) = Σ_{L ⊆ F, L∪R ⊨ q} Π_{f∈L} p_f · Π_{f∉L} (1−p_f)`.
//! This module enumerates all 2^k worlds exactly (no approximation), running
//! the shared Horn forward-closure engine in each world.
//!
//! Contract:
//! - `pfact:<atom>` (value = probability in [0,1]) — probabilistic fact
//! - any other fact key — deterministic atom (always true)
//! - `input.rules` — definite Horn rules over atoms
//! - `goals[0].value` — the query atom
//!
//! Cap (refusal, never silent truncation): 1 ≤ k ≤ 12 probabilistic facts.

use crate::breeds::support::closure::{forward_close, HornRule};
use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};
use std::collections::BTreeSet;

/// Exact possible-worlds ProbLog engine.
pub struct Problog;

impl BoundedBreed for Problog {
    fn breed_name(&self) -> &'static str {
        "problog"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        let pf = pfacts(input).ok()?;
        if pf.len() > 12 {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!(
                    "complexity cap exceeded: {} probabilistic facts > 12 (refusal, not truncation)",
                    pf.len()
                ),
            });
        }
        None
    }
}

fn pfacts(input: &BreedInput) -> Result<Vec<(String, f64)>, String> {
    let mut out: Vec<(String, f64)> = Vec::new();
    for f in &input.facts {
        if let Some(atom) = f.key.strip_prefix("pfact:") {
            let p: f64 = f
                .value
                .parse()
                .map_err(|_| format!("pfact '{}' has non-numeric probability '{}'", atom, f.value))?;
            if !(0.0..=1.0).contains(&p) {
                return Err(format!("pfact '{}' probability {} out of [0,1]", atom, p));
            }
            out.push((atom.to_string(), p));
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

impl CognitionBreed for Problog {
    fn id(&self) -> BreedId {
        BreedId::Problog
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "probabilistic_horn_logic".to_string(),
            "exact_possible_worlds".to_string(),
            "success_probability".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let pf = pfacts(input)?;
        if pf.is_empty() {
            return Err("problog requires at least one pfact:<atom> probabilistic fact".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        if input.goals.is_empty() {
            return Err("problog requires a query goal (goals[0].value = query atom)".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        self.preconditions(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;
        let pf = pfacts(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;
        let query = input.goals[0].value.clone();
        let k = pf.len();

        let deterministic: BTreeSet<String> = input
            .facts
            .iter()
            .filter(|f| !f.key.starts_with("pfact:"))
            .map(|f| f.key.clone())
            .collect();
        let rules: Vec<HornRule> = input
            .rules
            .iter()
            .map(|r| HornRule {
                id: r.id.clone(),
                premises: r.premise.clone(),
                conclusion: r.conclusion.clone(),
            })
            .collect();

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |trace: &mut Vec<TraceStep>, kind: &str, detail: String| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        for (atom, p) in &pf {
            push(&mut trace, "load-pfact", format!("{:.6}::{}", p, atom));
        }

        let mut prob: f64 = 0.0;
        for mask in 0u32..(1u32 << k) {
            let mut world = deterministic.clone();
            let mut weight = 1.0_f64;
            let mut chosen: Vec<&str> = Vec::new();
            for (i, (atom, p)) in pf.iter().enumerate() {
                if mask & (1 << i) != 0 {
                    world.insert(atom.clone());
                    weight *= p;
                    chosen.push(atom);
                } else {
                    weight *= 1.0 - p;
                }
            }
            let derived = forward_close(&world, &rules).facts.contains(&query);
            push(
                &mut trace,
                "enumerate-world",
                format!(
                    "world {{{}}} w={:.6} |= {} : {}",
                    chosen.join(","),
                    weight,
                    query,
                    derived
                ),
            );
            if derived {
                prob += weight;
                push(
                    &mut trace,
                    "sum-weight",
                    format!("+{:.6} -> P={:.6}", weight, prob),
                );
            }
        }

        let formatted = format!("{:.6}", prob);
        push(
            &mut trace,
            "decision",
            format!("P({}) = {} over {} worlds", query, formatted, 1u32 << k),
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: vec![Fact {
                key: format!("prob:{}", query),
                value: formatted.clone(),
            }],
            selected: Some(formatted.clone()),
            explanation: format!(
                "problog enumerated {} possible worlds exactly; P({}) = {}",
                1u32 << k,
                query,
                formatted
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["enumerate-world"])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Goal, Rule};

    fn input_with_pfacts(pfacts: Vec<(&str, &str)>, query: &str) -> BreedInput {
        BreedInput {
            facts: pfacts.into_iter().map(|(k, v)| Fact { key: k.to_string(), value: v.to_string() }).collect(),
            candidates: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![Goal { id: "q".to_string(), predicate: "q".to_string(), value: query.to_string() }],
            intent: String::new(),
            state: vec![],
        }
    }

    #[test]
    fn refuses_over_12_pfacts() {
        let mut input = input_with_pfacts(vec![], "query");
        for i in 0..13 {
            input.facts.push(Fact { key: format!("pfact:c{}", i), value: "0.5".to_string() });
        }
        let res = Problog.run(&input);
        assert!(res.is_err());
        assert!(res.unwrap_err().message.contains("complexity cap exceeded"));
    }

    #[test]
    fn refuses_missing_query() {
        let mut input = input_with_pfacts(vec![("pfact:c1", "0.5")], "");
        input.goals.clear();
        let res = Problog.run(&input);
        assert!(res.is_err());
        assert!(res.unwrap_err().message.contains("requires a query goal"));
    }

    #[test]
    fn refuses_out_of_bounds_probability() {
        let input = input_with_pfacts(vec![("pfact:c1", "1.5")], "q");
        let res = Problog.run(&input);
        assert!(res.is_err());
        assert!(res.unwrap_err().message.contains("out of [0,1]"));
    }

    #[test]
    fn falsification_gate_exact_probability() {
        let mut input = input_with_pfacts(vec![("pfact:c1", "0.5"), ("pfact:c2", "0.5")], "a");
        input.rules.push(Rule { id: "r1".to_string(), premise: vec!["c1".to_string()], conclusion: "a".to_string(), certainty: 1.0 });
        input.rules.push(Rule { id: "r2".to_string(), premise: vec!["c2".to_string()], conclusion: "a".to_string(), certainty: 1.0 });
        
        let out = Problog.run(&input).expect("should run");
        assert_eq!(out.selected.unwrap(), "0.750000");
    }

    /// De Raedt, Kimmig & Toivonen 2007 (IJCAI), Section 2:
    /// rain (0.2), sprinkler (0.2), hose (0.3) → wet via three rules.
    /// Noisy-OR: P(wet) = 1 - (1-0.2)(1-0.2)(1-0.3) = 1 - 0.448 = 0.552 exactly.
    #[test]
    fn de_raedt_2007_wet_probability_is_0552() {
        let mut inp = input_with_pfacts(
            vec![("pfact:hose", "0.3"), ("pfact:rain", "0.2"), ("pfact:sprinkler", "0.2")],
            "wet",
        );
        inp.rules.push(Rule { id: "r-rain".into(), premise: vec!["rain".into()], conclusion: "wet".into(), certainty: 1.0 });
        inp.rules.push(Rule { id: "r-sprinkler".into(), premise: vec!["sprinkler".into()], conclusion: "wet".into(), certainty: 1.0 });
        inp.rules.push(Rule { id: "r-hose".into(), premise: vec!["hose".into()], conclusion: "wet".into(), certainty: 1.0 });

        let out = Problog.run(&inp).expect("run ok");
        // Exact oracle: 0.552 (tolerance 1e-6 per fixture)
        assert_eq!(out.selected.as_deref(), Some("0.552000"),
            "P(wet) = 1-0.8*0.8*0.7 = 0.552 (De Raedt et al. 2007)");
        // Exactly 8 worlds enumerated (2^3)
        let world_count = out.inference_trace.iter().filter(|t| t.kind == "enumerate-world").count();
        assert_eq!(world_count, 8, "2^3 = 8 worlds must be enumerated");
    }

    #[test]
    fn invariant_monotonicity() {
        let mut input1 = input_with_pfacts(vec![("pfact:c1", "0.5"), ("pfact:c2", "0.5")], "a");
        input1.rules.push(Rule { id: "r1".to_string(), premise: vec!["c1".to_string()], conclusion: "a".to_string(), certainty: 1.0 });
        
        let p1: f64 = Problog.run(&input1).unwrap().selected.unwrap().parse().unwrap();
        
        input1.rules.push(Rule { id: "r2".to_string(), premise: vec!["c2".to_string()], conclusion: "a".to_string(), certainty: 1.0 });
        let p2: f64 = Problog.run(&input1).unwrap().selected.unwrap().parse().unwrap();
        
        assert!(p2 >= p1, "Probability must be monotonic with added rules");
    }
}

