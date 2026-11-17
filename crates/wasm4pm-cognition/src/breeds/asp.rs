use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeSet;

/// Answer Set Programming (stable models) breed.
pub struct Asp;

impl CognitionBreed for Asp {
    fn id(&self) -> BreedId {
        BreedId::Asp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "answer_set_programming".to_string(),
            "stable_models".to_string(),
            "gelfond_lifschitz_reduct".to_string(),
            "negation_as_failure".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() && input.facts.is_empty() {
            return Err("ASP requires at least one rule or fact".to_string());
        }
        // Normal logic programs do not allow NAF literals in rule heads.
        for r in &input.rules {
            if r.conclusion.trim().starts_with("not ") {
                return Err(format!(
                    "ASP rule head cannot contain negation-as-failure: {}",
                    r.id
                ));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        // 1. Partition atoms. ALL fact atoms are forced-true (a fact is a zero-body
        // rule, so it is in the least model of every reduct). Rule-referenced atoms are
        // enumerated unless they are already forced by a fact. An atom appearing only
        // among candidate ids is never derivable, so it is absent from every stable
        // model. Enumerating forced atoms is wasted work and let unrelated admitted
        // context facts (e.g. benchmark noise rails) trip the 16-atom exact-solver cap
        // without changing any answer.
        let mut rule_atoms: BTreeSet<String> = BTreeSet::new();
        for r in &input.rules {
            rule_atoms.insert(r.conclusion.clone());
            for p in &r.premise {
                if let Some(atom) = p.strip_prefix("not ") {
                    rule_atoms.insert(atom.trim().to_string());
                } else {
                    rule_atoms.insert(p.clone());
                }
            }
        }

        // ALL fact atoms are forced-true assumptions of the program (a fact is a
        // zero-body rule), including atoms also referenced by rules as premises.
        // The "relation" noise-rail key is excluded.
        let mut forced_atoms: BTreeSet<String> = BTreeSet::new();
        for f in &input.facts {
            if !f.value.is_empty() {
                forced_atoms.insert(f.value.clone());
            }
            if !f.key.is_empty() && f.key != "relation" {
                forced_atoms.insert(f.key.clone());
            }
        }

        // Enumerate only rule-referenced atoms that are NOT already forced by facts;
        // forced atoms are constant across all interpretations.
        let atoms_list: Vec<String> = rule_atoms.difference(&forced_atoms).cloned().collect();

        // ground step: exactly 1, first. n = rule-referenced atoms, m = rules.
        trace.push(TraceStep {
            step: trace.len(),
            kind: "ground".to_string(),
            detail: format!(
                "{} atoms, {} rules",
                rule_atoms.len(),
                input.rules.len()
            ),
            depth: 0,
            objects: vec![],
        });

        // 2. Generate stable models. Enumerate assignments only over rule-referenced
        // non-fact atoms; fact atoms (including premise-referenced ones) are present in
        // every interpretation and every least model, and candidate-id atoms are present
        // in neither, so this yields exactly the same stable models as enumerating the
        // full atom set.
        let mut stable_models = Vec::new();
        let n_atoms = atoms_list.len();

        if n_atoms <= 16 {
            let limit = 1 << n_atoms;
            for mask in 0..limit {
                // Interpretation = forced fact atoms + this mask's rule atoms.
                let mut interpretation: BTreeSet<String> = forced_atoms.clone();
                for i in 0..n_atoms {
                    if (mask & (1 << i)) != 0 {
                        interpretation.insert(atoms_list[i].clone());
                    }
                }

                // NAF discard is determined by the interpretation alone: a rule is
                // dropped when any of its NAF premises holds in the interpretation.
                let dropped = input
                    .rules
                    .iter()
                    .filter(|r| {
                        r.premise.iter().any(|p| {
                            p.strip_prefix("not ")
                                .map(|atom| interpretation.contains(atom.trim()))
                                .unwrap_or(false)
                        })
                    })
                    .count();
                let kept = input.rules.len() - dropped;

                // guess-candidate: the mask as a candidate model M.
                let m_list: Vec<&str> = interpretation.iter().map(|s| s.as_str()).collect();
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "guess-candidate".to_string(),
                    detail: format!("M={{{}}}", m_list.join(",")),
                    depth: 0,
                    objects: vec![],
                });

                // reduct: rules surviving NAF discard vs NAF-discarded.
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "reduct".to_string(),
                    detail: format!("{} rules kept, {} dropped", kept, dropped),
                    depth: 0,
                    objects: vec![],
                });

                // Compute least model of the Gelfond-Lifschitz reduct P^M, seeded with
                // the forced facts (they are empty-body rules of the reduct).
                let mut least_model: BTreeSet<String> = forced_atoms.clone();
                loop {
                    let mut added = false;
                    for r in &input.rules {
                        let mut discard = false;
                        let mut pos_premises = Vec::new();
                        for p in &r.premise {
                            if let Some(atom) = p.strip_prefix("not ") {
                                if interpretation.contains(atom.trim()) {
                                    discard = true;
                                    break;
                                }
                            } else {
                                pos_premises.push(p.clone());
                            }
                        }
                        if !discard
                            && !least_model.contains(&r.conclusion)
                            && pos_premises
                                .iter()
                                .all(|p| least_model.contains(p))
                        {
                            least_model.insert(r.conclusion.clone());
                            added = true;
                        }
                    }
                    if !added {
                        break;
                    }
                }

                // least-model step: fixpoint of the reduct.
                let lm_list: Vec<&str> = least_model.iter().map(|s| s.as_str()).collect();
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "least-model".to_string(),
                    detail: format!("LM(P^M)={{{}}}", lm_list.join(",")),
                    depth: 0,
                    objects: vec![],
                });

                // If interpretation == least_model, then interpretation is stable!
                if interpretation == least_model {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "stable-accept".to_string(),
                        detail: format!("{} is a stable model", lm_list.join(",")),
                        depth: 0,
                        objects: vec![],
                    });
                    let model_atoms: Vec<String> = interpretation.into_iter().collect();
                    stable_models.push(model_atoms);
                } else {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "stable-reject".to_string(),
                        detail: format!(
                            "LM(P^M) != M ({{{}}} vs {{{}}})",
                            lm_list.join(","),
                            m_list.join(",")
                        ),
                        depth: 0,
                        objects: vec![],
                    });
                }
            }
        } else {
            return Err(BreedError {
                breed: BreedId::Asp,
                message: format!(
                    "Too many atoms for exact ASP solver (max 16, got {})",
                    n_atoms
                ),
            });
        }

        // Final answer-set summary step.
        trace.push(TraceStep {
            step: trace.len(),
            kind: "answer-set".to_string(),
            detail: format!("{} answer set(s)", stable_models.len()),
            depth: 0,
            objects: vec![],
        });

        // Set up output facts and selection
        let mut out_facts = Vec::new();
        out_facts.push(Fact {
            key: "stable_models_count".to_string(),
            value: stable_models.len().to_string(),
        });
        // Mirror fact required by the ASP oracle postcondition.
        out_facts.push(Fact {
            key: "asp:answer_set_count".to_string(),
            value: stable_models.len().to_string(),
        });

        let mut selected = None;
        let mut candidates = input.candidates.clone();

        if let Some(first_model) = stable_models.first() {
            for (i, atom) in first_model.iter().enumerate() {
                out_facts.push(Fact {
                    key: format!("model_0_{}", i),
                    value: atom.clone(),
                });
            }

            for cand in &mut candidates {
                if first_model.contains(&cand.id) {
                    cand.score = 1.0;
                    if selected.is_none() {
                        selected = Some(cand.id.clone());
                    }
                }
            }
        }

        let explanation = format!(
            "ASP: found {} stable model(s). Selected candidate: {:?}",
            stable_models.len(),
            selected
        );

        Ok(BreedOutput {
            breed: BreedId::Asp,
            candidates,
            facts: out_facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("ASP must emit at least one trace step".to_string());
        }
        if output.inference_trace[0].kind != "ground" {
            return Err("ASP trace must start with a ground step".to_string());
        }
        if output.inference_trace.last().map(|t| t.kind.as_str()) != Some("answer-set") {
            return Err("ASP trace must end with an answer-set step".to_string());
        }
        if !output.facts.iter().any(|f| f.key == "asp:answer_set_count") {
            return Err("ASP output must carry the asp:answer_set_count fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, Fact, Rule};

    fn input(facts: Vec<Fact>, rules: Vec<Rule>) -> BreedInput {
        BreedInput {
            intent: "solve".to_string(),
            facts,
            rules,
            candidates: vec![],
            cases: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn fact_used_as_premise_must_be_in_every_model() {
        // Fact p + rule p -> q: p is a fact, so it is in EVERY stable model; the only
        // stable model is {p, q}. (Regression: previously a fact atom referenced by a
        // rule premise was enumerated as flippable, yielding the spurious model {}.)
        let input = input(
            vec![Fact {
                key: "p".to_string(),
                value: String::new(),
            }],
            vec![Rule {
                id: "r1".to_string(),
                premise: vec!["p".to_string()],
                conclusion: "q".to_string(),
                certainty: 1.0,
            }],
        );
        Asp.preconditions(&input).unwrap();
        let out = Asp.run(&input).unwrap();
        let count: usize = out
            .facts
            .iter()
            .find(|f| f.key == "stable_models_count")
            .unwrap()
            .value
            .parse()
            .unwrap();
        assert_eq!(count, 1, "exactly one stable model");
        let model: Vec<&Fact> = out
            .facts
            .iter()
            .filter(|f| f.key.starts_with("model_0_"))
            .collect();
        let atoms: Vec<&str> = model.iter().map(|f| f.value.as_str()).collect();
        assert_eq!(atoms, vec!["p", "q"]);
    }
}
