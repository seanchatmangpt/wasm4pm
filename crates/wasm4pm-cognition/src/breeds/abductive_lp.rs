//! Abductive Logic Programming (Kakas, Kowalski & Toni, "Abductive Logic
//! Programming", Journal of Logic and Computation 2(6), 1992).
//!
//! Theory ⟨P, A, IC⟩:
//! - P  = input `rules` (definite Horn program; empty premise = fact)
//! - A  = abducibles: facts `alp:abducible:<a>` = "true"  (≤12)
//! - IC = integrity constraints: facts `alp:ic:<id>` = "a,b" — denial ← a ∧ b
//!        (the listed atoms must not ALL be derivable)
//! - O  = observation: goal `{ predicate: "alp:observe", value: <atom> }`
//!
//! An explanation Δ ⊆ A is accepted iff P ∪ Δ ⊢ O and every IC is satisfied.
//! Candidates are enumerated by size then lexicographically; subset-minimality
//! is enforced (a superset of an accepted Δ is rejected as non-minimal).

use std::collections::BTreeSet;

use crate::breeds::support::closure::{forward_close, HornRule};
use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};

/// Maximum number of abducibles (2^12 candidate sets).
const MAX_ABDUCIBLES: usize = 12;

/// KKT abductive logic programming breed.
pub struct AbductiveLp;

impl BoundedBreed for AbductiveLp {
    fn breed_name(&self) -> &'static str {
        "abductive_lp"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        let abd = abducibles(input);
        if abd.len() > MAX_ABDUCIBLES {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!(
                    "abducible count {} exceeds cap {}",
                    abd.len(),
                    MAX_ABDUCIBLES
                ),
            });
        }
        None
    }
}

fn abducibles(input: &BreedInput) -> Vec<String> {
    let mut set: BTreeSet<String> = BTreeSet::new();
    for f in &input.facts {
        if let Some(a) = f.key.strip_prefix("alp:abducible:") {
            set.insert(a.to_string());
        }
    }
    set.into_iter().collect()
}

fn integrity_constraints(input: &BreedInput) -> Vec<(String, Vec<String>)> {
    let mut ics: Vec<(String, Vec<String>)> = Vec::new();
    for f in &input.facts {
        if let Some(id) = f.key.strip_prefix("alp:ic:") {
            let atoms: Vec<String> = f
                .value
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            ics.push((id.to_string(), atoms));
        }
    }
    ics.sort();
    ics
}

fn horn_program(input: &BreedInput) -> Vec<HornRule> {
    input
        .rules
        .iter()
        .map(|r| HornRule {
            id: r.id.clone(),
            premises: r.premise.iter().map(|p| p.trim().to_string()).collect(),
            conclusion: r.conclusion.trim().to_string(),
        })
        .collect()
}

/// Subsets of `n` elements ordered by popcount then numeric (lex on sorted atoms).
fn subsets_by_size(n: usize) -> Vec<u32> {
    let mut masks: Vec<u32> = (0..(1u32 << n)).collect();
    masks.sort_by_key(|m| (m.count_ones(), *m));
    masks
}

fn render(mask: u32, atoms: &[String]) -> String {
    let parts: Vec<&str> = atoms
        .iter()
        .enumerate()
        .filter(|(i, _)| mask & (1 << i) != 0)
        .map(|(_, a)| a.as_str())
        .collect();
    format!("{{{}}}", parts.join(","))
}

impl CognitionBreed for AbductiveLp {
    fn id(&self) -> BreedId {
        BreedId::AbductiveLp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "abductive-explanation".to_string(),
            "integrity-constraints".to_string(),
            "subset-minimality".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let abd = abducibles(input);
        if abd.is_empty() {
            return Err("abductive_lp requires at least one alp:abducible:* fact".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        if !input.goals.iter().any(|g| g.predicate == "alp:observe") {
            return Err("abductive_lp requires an alp:observe goal".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let abd = abducibles(input);
        let ics = integrity_constraints(input);
        let program = horn_program(input);
        let observation = input
            .goals
            .iter()
            .find(|g| g.predicate == "alp:observe")
            .map(|g| g.value.trim().to_string())
            .ok_or_else(|| BreedError {
                breed: BreedId::AbductiveLp,
                message: "missing alp:observe goal".to_string(),
            })?;

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
            "load-abducibles",
            format!(
                "A={{{}}}, {} ICs, observe '{}'",
                abd.join(","),
                ics.len(),
                observation
            ),
            0,
        );

        let mut accepted: Vec<u32> = Vec::new();
        for mask in subsets_by_size(abd.len()) {
            // Subset-minimality: skip supersets of accepted explanations.
            if accepted.iter().any(|a| a & mask == *a) && !accepted.contains(&mask) {
                tr(
                    &mut trace,
                    "explain-reject",
                    format!(
                        "{} non-minimal (superset of accepted Δ)",
                        render(mask, &abd)
                    ),
                    1,
                );
                continue;
            }
            tr(
                &mut trace,
                "candidate-delta",
                format!("Δ={}", render(mask, &abd)),
                1,
            );

            let delta: BTreeSet<String> = abd
                .iter()
                .enumerate()
                .filter(|(i, _)| mask & (1 << i) != 0)
                .map(|(_, a)| a.clone())
                .collect();
            let closed = forward_close(&delta, &program);
            tr(
                &mut trace,
                "derive",
                format!("|LM(P∪Δ)|={} atoms", closed.facts.len()),
                2,
            );

            let derives_obs = closed.facts.contains(&observation);
            let mut ic_ok = true;
            for (id, atoms) in &ics {
                let violated = !atoms.is_empty() && atoms.iter().all(|a| closed.facts.contains(a));
                tr(
                    &mut trace,
                    "ic-check",
                    format!(
                        "IC {}: {}",
                        id,
                        if violated { "violated" } else { "satisfied" }
                    ),
                    2,
                );
                if violated {
                    ic_ok = false;
                }
            }

            if derives_obs && ic_ok {
                tr(
                    &mut trace,
                    "explain-accept",
                    format!("Δ={} explains '{}'", render(mask, &abd), observation),
                    1,
                );
                accepted.push(mask);
            } else {
                tr(
                    &mut trace,
                    "explain-reject",
                    format!(
                        "Δ={}: observation {}, ICs {}",
                        render(mask, &abd),
                        if derives_obs {
                            "derived"
                        } else {
                            "not derived"
                        },
                        if ic_ok { "ok" } else { "violated" }
                    ),
                    1,
                );
            }
        }

        let mut facts: Vec<Fact> = Vec::new();
        for (i, m) in accepted.iter().enumerate() {
            facts.push(Fact {
                key: format!("alp:explanation:{}", i),
                value: render(*m, &abd),
            });
        }
        facts.push(Fact {
            key: "alp:explanation_count".to_string(),
            value: accepted.len().to_string(),
        });
        tr(
            &mut trace,
            "minimal-set",
            format!("{} minimal explanation(s)", accepted.len()),
            0,
        );

        Ok(BreedOutput {
            breed: BreedId::AbductiveLp,
            candidates: input.candidates.clone(),
            facts,
            selected: accepted.first().map(|m| render(*m, &abd)),
            explanation: format!(
                "KKT abduction: {} minimal explanation(s) of '{}' over {} abducibles.",
                accepted.len(),
                observation,
                abd.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        tq.require_first("load-abducibles")?;
        tq.require_last("minimal-set")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Goal, Rule};

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.into(),
            value: value.into(),
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

    fn input(facts: Vec<Fact>, rules: Vec<Rule>, observe: &str) -> BreedInput {
        BreedInput {
            intent: "explain".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules,
            goals: vec![Goal {
                id: "o1".into(),
                predicate: "alp:observe".into(),
                value: observe.into(),
            }],
            state: vec![],
        }
    }

    /// {a} accepted; {a,b} excluded by subset-minimality.
    #[test]
    fn minimality_excludes_supersets() {
        let out = AbductiveLp
            .run(&input(
                vec![
                    fact("alp:abducible:a", "true"),
                    fact("alp:abducible:b", "true"),
                ],
                vec![rule("r1", vec!["a"], "obs")],
                "obs",
            ))
            .unwrap();
        let expls: Vec<&str> = out
            .facts
            .iter()
            .filter(|f| f.key.starts_with("alp:explanation:"))
            .map(|f| f.value.as_str())
            .collect();
        assert_eq!(expls, vec!["{a}"]);
    }

    /// IC forces rejection of the smallest Δ → correct answer is {b}.
    #[test]
    fn ic_rejects_smallest_delta() {
        let out = AbductiveLp
            .run(&input(
                vec![
                    fact("alp:abducible:a", "true"),
                    fact("alp:abducible:b", "true"),
                    fact("alp:ic:1", "a,obs"),
                ],
                vec![rule("r1", vec!["a"], "obs"), rule("r2", vec!["b"], "obs")],
                "obs",
            ))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("{b}"));
        let count = out
            .facts
            .iter()
            .find(|f| f.key == "alp:explanation_count")
            .unwrap();
        assert_eq!(count.value, "1");
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "ic-check" && t.detail.contains("violated")));
    }

    #[test]
    fn refuses_without_abducibles() {
        let inp = input(vec![], vec![rule("r1", vec!["a"], "obs")], "obs");
        assert!(AbductiveLp.preconditions(&inp).is_err());
    }
}
