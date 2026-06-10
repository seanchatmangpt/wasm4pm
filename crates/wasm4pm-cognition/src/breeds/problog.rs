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
use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
use std::collections::BTreeSet;

/// Exact possible-worlds ProbLog engine.
pub struct Problog;

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
        if pf.len() > 12 {
            return Err(format!(
                "complexity cap exceeded: {} probabilistic facts > 12 (refusal, not truncation)",
                pf.len()
            ));
        }
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

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace — no evidence of world enumeration".to_string());
        }
        if !output
            .inference_trace
            .iter()
            .any(|t| t.kind == "enumerate-world")
        {
            return Err("no enumerate-world step — enumeration did not run".to_string());
        }
        Ok(())
    }
}
