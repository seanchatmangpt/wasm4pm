//! ASP: Answer Set Programming via Gelfond–Lifschitz stable-model semantics
//! (Gelfond & Lifschitz, "The Stable Model Semantics for Logic Programming",
//! ICLP/SLP 1988).
//!
//! Self-contained (prolog8 has no negation-as-failure): the program is the
//! input `rules` vector, where a premise atom prefixed with `"not "` is a
//! negation-as-failure literal. A rule with an empty premise is a fact.
//!
//! Algorithm: enumerate every candidate set M over the (≤12) atoms as a u32
//! bitmask in ascending order; build the Gelfond–Lifschitz reduct P^M (drop
//! rules with a NAF literal `not b` where b ∈ M, strip remaining NAF
//! literals); compute the least Horn model of the reduct via
//! `support::closure::forward_close`; accept iff the least model equals M.

use std::collections::BTreeSet;

use crate::breeds::support::closure::{forward_close, HornRule};
use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};
use crate::breeds::support::trace_query::TraceQuery;

/// Maximum number of distinct atoms (2^12 = 4096 candidate sets).
const MAX_ATOMS: usize = 12;

/// ASP breed: Gelfond–Lifschitz stable models by candidate enumeration.
pub struct Asp;

impl BoundedBreed for Asp {
    fn breed_name(&self) -> &'static str {
        "asp"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        let atoms = atom_universe(input);
        if atoms.len() > MAX_ATOMS {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!(
                    "ASP atom universe {} exceeds cap {} (2^n candidate enumeration)",
                    atoms.len(),
                    MAX_ATOMS
                ),
            });
        }
        None
    }
}

/// Strip a `"not "` prefix, returning (is_naf, atom).
fn parse_literal(lit: &str) -> (bool, &str) {
    match lit.strip_prefix("not ") {
        Some(atom) => (true, atom.trim()),
        None => (false, lit.trim()),
    }
}

/// Collect the sorted atom universe of a program.
fn atom_universe(input: &BreedInput) -> BTreeSet<String> {
    let mut atoms = BTreeSet::new();
    for r in &input.rules {
        atoms.insert(r.conclusion.trim().to_string());
        for p in &r.premise {
            let (_, a) = parse_literal(p);
            atoms.insert(a.to_string());
        }
    }
    atoms
}

/// Render a candidate bitmask as a sorted comma-joined atom set.
fn render_set(mask: u32, atoms: &[String]) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for (i, a) in atoms.iter().enumerate() {
        if mask & (1 << i) != 0 {
            parts.push(a);
        }
    }
    parts.join(",")
}

impl CognitionBreed for Asp {
    fn id(&self) -> BreedId {
        BreedId::Asp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "stable-model-semantics".to_string(),
            "negation-as-failure".to_string(),
            "answer-set-enumeration".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("ASP requires at least one program rule".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        for r in &input.rules {
            if r.conclusion.trim().is_empty() {
                return Err(format!("rule '{}' has empty conclusion", r.id));
            }
            if r.conclusion.trim().starts_with("not ") {
                return Err(format!(
                    "rule '{}' has NAF literal in head (not allowed in normal programs)",
                    r.id
                ));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let atoms: Vec<String> = atom_universe(input).into_iter().collect();
        let n = atoms.len();
        let idx_of = |a: &str| atoms.iter().position(|x| x == a).unwrap_or(usize::MAX);

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut step = 0usize;
        let mut tr = |trace: &mut Vec<TraceStep>, kind: &str, detail: String, depth: u32| {
            trace.push(TraceStep {
                step,
                kind: kind.to_string(),
                detail,
                depth,
                objects: vec![],
            });
            step += 1;
        };

        tr(
            &mut trace,
            "ground",
            format!("{} atoms, {} rules", n, input.rules.len()),
            0,
        );

        let mut answer_sets: Vec<u32> = Vec::new();
        for mask in 0u32..(1u32 << n) {
            tr(
                &mut trace,
                "guess-candidate",
                format!("M={{{}}}", render_set(mask, &atoms)),
                1,
            );

            // Gelfond–Lifschitz reduct P^M
            let mut reduct: Vec<HornRule> = Vec::new();
            let mut dropped = 0usize;
            'rules: for r in &input.rules {
                let mut premises: Vec<String> = Vec::new();
                for p in &r.premise {
                    let (naf, atom) = parse_literal(p);
                    if naf {
                        let i = idx_of(atom);
                        if i != usize::MAX && mask & (1 << i) != 0 {
                            dropped += 1;
                            continue 'rules; // not b fails: b ∈ M, drop rule
                        }
                        // not b succeeds: strip the literal
                    } else {
                        premises.push(atom.to_string());
                    }
                }
                reduct.push(HornRule {
                    id: r.id.clone(),
                    premises,
                    conclusion: r.conclusion.trim().to_string(),
                });
            }
            tr(
                &mut trace,
                "reduct",
                format!("{} rules kept, {} dropped", reduct.len(), dropped),
                2,
            );

            let closed = forward_close(&BTreeSet::new(), &reduct);
            let mut lm_mask = 0u32;
            for a in &closed.facts {
                let i = idx_of(a);
                if i != usize::MAX {
                    lm_mask |= 1 << i;
                }
            }
            tr(
                &mut trace,
                "least-model",
                format!("LM(P^M)={{{}}}", render_set(lm_mask, &atoms)),
                2,
            );

            if lm_mask == mask {
                tr(
                    &mut trace,
                    "stable-accept",
                    format!("{{{}}} is a stable model", render_set(mask, &atoms)),
                    1,
                );
                answer_sets.push(mask);
            } else {
                tr(
                    &mut trace,
                    "stable-reject",
                    format!(
                        "LM(P^M) != M ({{{}}} vs {{{}}})",
                        render_set(lm_mask, &atoms),
                        render_set(mask, &atoms)
                    ),
                    1,
                );
            }
        }

        let mut facts: Vec<Fact> = Vec::new();
        for (i, m) in answer_sets.iter().enumerate() {
            facts.push(Fact {
                key: format!("asp:answer_set:{}", i),
                value: render_set(*m, &atoms),
            });
        }
        facts.push(Fact {
            key: "asp:answer_set_count".to_string(),
            value: answer_sets.len().to_string(),
        });
        tr(
            &mut trace,
            "answer-set",
            format!("{} answer set(s)", answer_sets.len()),
            0,
        );

        let selected = answer_sets.first().map(|m| render_set(*m, &atoms));
        let explanation = format!(
            "Gelfond–Lifschitz enumeration over {} atoms ({} candidates): {} stable model(s).",
            n,
            1u32 << n,
            answer_sets.len()
        );

        Ok(BreedOutput {
            breed: BreedId::Asp,
            candidates: input.candidates.clone(),
            facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["ground"])?;
        if output
            .inference_trace
            .last()
            .map(|t| t.kind != "answer-set")
            .unwrap_or(true)
        {
            return Err("final step must be 'answer-set'".to_string());
        }
        if !output
            .facts
            .iter()
            .any(|f| f.key == "asp:answer_set_count")
        {
            return Err("missing asp:answer_set_count fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Rule;

    fn input(rules: Vec<Rule>) -> BreedInput {
        BreedInput {
            intent: "asp".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules,
            goals: vec![],
            state: vec![],
        }
    }

    fn rule(id: &str, premise: Vec<&str>, conclusion: &str) -> Rule {
        Rule {
            id: id.into(),
            premise: premise.into_iter().map(String::from).collect(),
            conclusion: conclusion.into(),
            certainty: 1.0,
        }
    }

    /// Even loop {a :- not b. b :- not a.} has exactly the two stable models {a} and {b}.
    #[test]
    fn even_loop_two_stable_models() {
        let out = Asp
            .run(&input(vec![
                rule("r1", vec!["not b"], "a"),
                rule("r2", vec!["not a"], "b"),
            ]))
            .unwrap();
        let count = out
            .facts
            .iter()
            .find(|f| f.key == "asp:answer_set_count")
            .unwrap();
        assert_eq!(count.value, "2");
        let sets: Vec<&str> = out
            .facts
            .iter()
            .filter(|f| f.key.starts_with("asp:answer_set:"))
            .map(|f| f.value.as_str())
            .collect();
        assert_eq!(sets, vec!["a", "b"]);
    }

    /// Odd loop {a :- not a.} has zero stable models.
    #[test]
    fn odd_loop_zero_stable_models() {
        let out = Asp.run(&input(vec![rule("r1", vec!["not a"], "a")])).unwrap();
        let count = out
            .facts
            .iter()
            .find(|f| f.key == "asp:answer_set_count")
            .unwrap();
        assert_eq!(count.value, "0");
        assert!(out.selected.is_none());
    }

    /// Definite programs: unique stable model == least Horn model.
    #[test]
    fn definite_program_least_model() {
        let out = Asp
            .run(&input(vec![
                rule("f1", vec![], "p"),
                rule("r1", vec!["p"], "q"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("p,q"));
    }

    /// Non-monotonicity: adding `abnormal` retracts `flies`.
    #[test]
    fn nonmonotonic_retraction() {
        let base = vec![
            rule("f1", vec![], "bird"),
            rule("r1", vec!["bird", "not abnormal"], "flies"),
        ];
        let out1 = Asp.run(&input(base.clone())).unwrap();
        assert_eq!(out1.selected.as_deref(), Some("bird,flies"));

        let mut with_ab = base;
        with_ab.push(rule("f2", vec![], "abnormal"));
        let out2 = Asp.run(&input(with_ab)).unwrap();
        assert_eq!(out2.selected.as_deref(), Some("abnormal,bird"));
    }

    #[test]
    fn refuses_oversized_universe() {
        let rules: Vec<Rule> = (0..13).map(|i| rule(&format!("f{}", i), vec![], &format!("a{}", i))).collect();
        assert!(Asp.preconditions(&input(rules)).is_err());
    }

    #[test]
    fn refuses_naf_in_head() {
        assert!(Asp.preconditions(&input(vec![rule("r1", vec!["a"], "not b")])).is_err());
    }

    #[test]
    fn refuses_empty_program() {
        assert!(Asp.preconditions(&input(vec![])).is_err());
    }

    #[test]
    fn falsification_gate_gelfond_lifschitz_reduct() {
        // P:
        // f1: a
        // r1: b :- not a.
        // M={a} should be a stable model.
        // M={a,b} should not be, because reduct P^{a,b} drops r1, least model is {a} != {a,b}.
        // If the reduct logic incorrectly keeps r1 when 'not a' fails, we'd get {a,b} as stable.
        let out = Asp.run(&input(vec![
            rule("f1", vec![], "a"),
            rule("r1", vec!["not a"], "b"),
        ])).unwrap();
        let sets: Vec<&str> = out.facts.iter()
            .filter(|f| f.key.starts_with("asp:answer_set:"))
            .map(|f| f.value.as_str())
            .collect();
        assert_eq!(sets, vec!["a"]);
    }

    #[test]
    fn invariant_rule_order_independence() {
        // The stable models of P should be invariant to the permutation of its rules.
        let r1 = rule("r1", vec!["not b"], "a");
        let r2 = rule("r2", vec!["not a"], "b");
        
        let out1 = Asp.run(&input(vec![r1.clone(), r2.clone()])).unwrap();
        let out2 = Asp.run(&input(vec![r2, r1])).unwrap();
        
        let mut sets1: Vec<&str> = out1.facts.iter()
            .filter(|f| f.key.starts_with("asp:answer_set:"))
            .map(|f| f.value.as_str())
            .collect();
        let mut sets2: Vec<&str> = out2.facts.iter()
            .filter(|f| f.key.starts_with("asp:answer_set:"))
            .map(|f| f.value.as_str())
            .collect();
        
        sets1.sort();
        sets2.sort();
        
        assert_eq!(sets1, sets2);
    }
}
