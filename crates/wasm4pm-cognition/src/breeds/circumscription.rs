//! Predicate circumscription via minimal-model enumeration (McCarthy 1980).
//!
//! Circumscription minimizes abnormality: a conclusion is (cautiously)
//! entailed iff it holds in EVERY model whose set of true abnormality atoms
//! is subset-minimal. Abnormality atoms are atoms whose name starts with
//! `ab_`. Rule premises may negate an abnormality atom with the `not_`
//! prefix (e.g. `not_ab_bird_opus`) — negation is permitted ONLY on
//! `ab_`-atoms, which keeps enumeration exact.
//!
//! Model semantics: for a candidate abnormality set S the candidate model is
//! the Horn closure of `facts ∪ S` where a premise `not_ab_x` is satisfied
//! iff `ab_x ∉ S`. The candidate is a genuine model iff the closure derives
//! exactly the abnormality atoms in S (S is supported, nothing outside S is
//! forced) and does not derive the atom `false`.
//!
//! Cap (refusal, never silent truncation): ≤12 abnormality atoms.

use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};
use std::collections::BTreeSet;

/// McCarthy circumscription engine over `ab_` abnormality atoms.
pub struct Circumscription;

impl BoundedBreed for Circumscription {
    fn breed_name(&self) -> &'static str {
        "circumscription"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        let abs = ab_atoms(input);
        if abs.len() > 12 {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!(
                    "complexity cap exceeded: {} abnormality atoms > 12 (refusal, not truncation)",
                    abs.len()
                ),
            });
        }
        None
    }
}

fn ab_atoms(input: &BreedInput) -> BTreeSet<String> {
    let mut abs = BTreeSet::new();
    for r in &input.rules {
        if r.conclusion.starts_with("ab_") {
            abs.insert(r.conclusion.clone());
        }
        for p in &r.premise {
            if p.starts_with("ab_") {
                abs.insert(p.clone());
            } else if let Some(x) = p.strip_prefix("not_") {
                if x.starts_with("ab_") {
                    abs.insert(x.to_string());
                }
            }
        }
    }
    for f in &input.facts {
        if f.key.starts_with("ab_") {
            abs.insert(f.key.clone());
        }
    }
    abs
}

/// Horn closure of `facts ∪ S` with `not_ab_x` evaluated against S.
fn closure(input: &BreedInput, s: &BTreeSet<String>) -> Result<BTreeSet<String>, String> {
    let mut cur: BTreeSet<String> = input.facts.iter().map(|f| f.key.clone()).collect();
    cur.extend(s.iter().cloned());
    loop {
        let mut changed = false;
        for r in &input.rules {
            if cur.contains(&r.conclusion) {
                continue;
            }
            let mut sat = true;
            for p in &r.premise {
                if let Some(x) = p.strip_prefix("not_") {
                    if !x.starts_with("ab_") {
                        return Err(format!(
                            "negated premise '{}' is not an abnormality atom (only ab_ atoms may be negated)",
                            p
                        ));
                    }
                    if s.contains(x) {
                        sat = false;
                        break;
                    }
                } else if !cur.contains(p) {
                    sat = false;
                    break;
                }
            }
            if sat {
                cur.insert(r.conclusion.clone());
                changed = true;
            }
        }
        if !changed {
            return Ok(cur);
        }
    }
}

impl CognitionBreed for Circumscription {
    fn id(&self) -> BreedId {
        BreedId::Circumscription
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "minimal_model_entailment".to_string(),
            "abnormality_minimization".to_string(),
            "nonmonotonic_reasoning".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("circumscription requires at least one rule".to_string());
        }
        if input.goals.is_empty() {
            return Err("circumscription requires at least one goal atom to test entailment".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        for r in &input.rules {
            for p in &r.premise {
                if let Some(x) = p.strip_prefix("not_") {
                    if !x.starts_with("ab_") {
                        return Err(format!(
                            "rule '{}' negates non-abnormality atom '{}' — only ab_ atoms may be negated",
                            r.id, x
                        ));
                    }
                }
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        self.preconditions(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;
        let abs: Vec<String> = ab_atoms(input).into_iter().collect();
        let k = abs.len();

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

        push(
            &mut trace,
            "load-defaults",
            format!("{} rules; abnormality atoms: {{{}}}", input.rules.len(), abs.join(",")),
        );

        // Enumerate all candidate abnormality sets in bitmask order.
        let mut models: Vec<(BTreeSet<String>, BTreeSet<String>)> = Vec::new();
        for mask in 0u32..(1u32 << k) {
            let s: BTreeSet<String> = abs
                .iter()
                .enumerate()
                .filter(|(i, _)| mask & (1 << i) != 0)
                .map(|(_, a)| a.clone())
                .collect();
            let closed = closure(input, &s).map_err(|m| BreedError {
                breed: self.id(),
                message: m,
            })?;
            let derived_abs: BTreeSet<String> =
                closed.iter().filter(|a| abs.contains(*a)).cloned().collect();
            let consistent = derived_abs == s && !closed.contains("false");
            push(
                &mut trace,
                "enumerate-model",
                format!(
                    "S={{{}}} -> {}",
                    s.iter().cloned().collect::<Vec<_>>().join(","),
                    if consistent { "model" } else { "rejected" }
                ),
            );
            if consistent {
                models.push((s, closed));
            }
        }

        if models.is_empty() {
            return Err(BreedError {
                breed: self.id(),
                message: "no consistent model exists for the given theory".to_string(),
            });
        }

        // Keep subset-minimal abnormality sets; record each pruned model.
        let mut minimal: Vec<(BTreeSet<String>, BTreeSet<String>)> = Vec::new();
        for (s, closed) in &models {
            let dominated = models
                .iter()
                .any(|(s2, _)| s2 != s && s2.is_subset(s));
            if dominated {
                push(
                    &mut trace,
                    "minimize",
                    format!(
                        "pruned S={{{}}}: strictly larger than another model's abnormality set",
                        s.iter().cloned().collect::<Vec<_>>().join(",")
                    ),
                );
            } else {
                minimal.push((s.clone(), closed.clone()));
            }
        }

        // Cautious entailment: atom true in ALL minimal models.
        let mut facts: Vec<Fact> = Vec::new();
        let mut entailed_goals: Vec<String> = Vec::new();
        for g in &input.goals {
            let atom = &g.value;
            let entailed = minimal.iter().all(|(_, closed)| closed.contains(atom));
            push(
                &mut trace,
                "entail",
                format!(
                    "{} |= {} in {}/{} minimal models -> {}",
                    atom,
                    if entailed { "true" } else { "false" },
                    minimal.iter().filter(|(_, c)| c.contains(atom)).count(),
                    minimal.len(),
                    entailed
                ),
            );
            facts.push(Fact {
                key: format!("entailed:{}", atom),
                value: entailed.to_string(),
            });
            if entailed {
                entailed_goals.push(atom.clone());
            }
        }

        push(
            &mut trace,
            "decision",
            format!(
                "{} minimal models; cautiously entailed: {{{}}}",
                minimal.len(),
                entailed_goals.join(",")
            ),
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: entailed_goals.first().cloned(),
            explanation: format!(
                "circumscription over {} ab-atoms found {} models, {} minimal; entailed {}/{} goals",
                k,
                models.len(),
                minimal.len(),
                entailed_goals.len(),
                input.goals.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty_with_kinds(&["enumerate-model"])?;
        Ok(())
    }
}
