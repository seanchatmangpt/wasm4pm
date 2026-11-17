use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Description Logic breed.
///
/// Surface-3 contract: `dl:subclass:` / `dl:conj:` / `dl:exists_rhs:` /
/// `dl:exists_lhs:` axioms; goals `dl:subsumes` `A:B`; EL completion rules
/// CR1–CR4 to fixpoint, then per-goal verdicts.
pub struct DescriptionLogic;

const MAX_CONCEPTS: usize = 32;

impl CognitionBreed for DescriptionLogic {
    fn id(&self) -> BreedId {
        BreedId::DescriptionLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "description_logic".to_string(),
            "ontological_subsumption".to_string(),
            "consistency_classification".to_string(),
            "transitive_closure".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.facts.is_empty() {
            return Err(
                "DescriptionLogic requires at least one fact in the knowledge base".to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        // ── Parse + normalize the TBox grammar ─────────────────────────
        let mut subclass_axioms: Vec<(String, String)> = Vec::new();
        let mut conj_axioms: Vec<(String, String, String)> = Vec::new();
        let mut exists_rhs: Vec<(String, String, String)> = Vec::new(); // (A, r, B)
        let mut exists_lhs: Vec<(String, String, String)> = Vec::new(); // (r, A, B)
        let mut concepts: BTreeSet<String> = BTreeSet::new();

        for f in &input.facts {
            if let Some(a) = f.key.strip_prefix("dl:subclass:") {
                concepts.insert(a.to_string());
                concepts.insert(f.value.clone());
                subclass_axioms.push((a.to_string(), f.value.clone()));
            } else if let Some(rest) = f.key.strip_prefix("dl:conj:") {
                let Some((a1, a2)) = rest.split_once('+') else {
                    return Err(BreedError {
                        breed: self.id(),
                        message: format!(
                            "malformed dl:conj key '{}' (expected dl:conj:<A1>+<A2>)",
                            f.key
                        ),
                    });
                };
                concepts.insert(a1.to_string());
                concepts.insert(a2.to_string());
                concepts.insert(f.value.clone());
                conj_axioms.push((a1.to_string(), a2.to_string(), f.value.clone()));
            } else if let Some(a) = f.key.strip_prefix("dl:exists_rhs:") {
                let Some((r, b)) = f.value.split_once('.') else {
                    return Err(BreedError {
                        breed: self.id(),
                        message: format!(
                            "malformed dl:exists_rhs value '{}' (expected '<r>.<B>')",
                            f.value
                        ),
                    });
                };
                concepts.insert(a.to_string());
                concepts.insert(b.to_string());
                exists_rhs.push((a.to_string(), r.to_string(), b.to_string()));
            } else if let Some(rest) = f.key.strip_prefix("dl:exists_lhs:") {
                let Some((r, a)) = rest.split_once('.') else {
                    return Err(BreedError {
                        breed: self.id(),
                        message: format!(
                            "malformed dl:exists_lhs key '{}' (expected dl:exists_lhs:<r>.<A>)",
                            f.key
                        ),
                    });
                };
                concepts.insert(a.to_string());
                concepts.insert(f.value.clone());
                exists_lhs.push((r.to_string(), a.to_string(), f.value.clone()));
            }
        }

        if subclass_axioms.len() + conj_axioms.len() + exists_rhs.len() + exists_lhs.len() == 0 {
            return Err(BreedError {
                breed: self.id(),
                message: "no dl:* axioms in the knowledge base".to_string(),
            });
        }
        if concepts.len() > MAX_CONCEPTS {
            return Err(BreedError {
                breed: self.id(),
                message: format!("concept count {} exceeds cap 32", concepts.len()),
            });
        }

        // Goals: dl:subsumes with value "A:B".
        if input.goals.is_empty() {
            return Err(BreedError {
                breed: self.id(),
                message: "no dl:subsumes goals to classify".to_string(),
            });
        }
        let mut queries: Vec<(String, String)> = Vec::new();
        for g in &input.goals {
            if g.predicate != "dl:subsumes" {
                continue;
            }
            let Some((a, b)) = g.value.split_once(':') else {
                return Err(BreedError {
                    breed: self.id(),
                    message: format!("malformed dl:subsumes goal value '{}'", g.value),
                });
            };
            queries.push((a.to_string(), b.to_string()));
        }
        if queries.is_empty() {
            return Err(BreedError {
                breed: self.id(),
                message: "no dl:subsumes goals to classify".to_string(),
            });
        }
        queries.sort();

        // ── normalize ──────────────────────────────────────────────────
        let mut trace = vec![TraceStep {
            step: 0,
            kind: "normalize".into(),
            detail: format!(
                "{} concepts, {} subclass, {} conj, {} exists-rhs, {} exists-lhs axioms",
                concepts.len(),
                subclass_axioms.len(),
                conj_axioms.len(),
                exists_rhs.len(),
                exists_lhs.len()
            ),
            depth: 0,
            objects: vec![],
        }];

        // ── EL completion ──────────────────────────────────────────────
        // S(A): subsumer sets (reflexive-closed); edges: (A, r, B) role edges.
        let mut s: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        for c in &concepts {
            s.entry(c.clone()).or_default().insert(c.clone());
        }
        let mut edges: BTreeSet<(String, String, String)> = BTreeSet::new();

        let mut step = |kind: &str, detail: String| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 1,
                objects: vec![],
            });
        };

        // Asserted subclass axioms are CR1 applications (input order).
        for (a, b) in &subclass_axioms {
            s.get_mut(a).unwrap().insert(b.clone());
            step("apply-cr1", format!("{a} ⊑ {b} (via {a} ⊑ {b})"));
        }

        // emits exactly one apply-cr* detail.
        let mut changed = true;
        while changed {
            changed = false;

            // CR1: A ⊑ B, B ⊑ C ⇒ A ⊑ C  (via names the premise whose RHS is C)
            let mut cr1: Vec<(String, String, String)> = Vec::new(); // (A, B, C)
            for (a, bs) in &s {
                for b in bs {
                    if let Some(cs) = s.get(b) {
                        for c in cs {
                            if c != a && !bs.contains(c) {
                                cr1.push((a.clone(), b.clone(), c.clone()));
                            }
                        }
                    }
                }
            }
            cr1.sort();
            cr1.dedup();
            for (a, b, c) in cr1 {
                s.get_mut(&a).unwrap().insert(c.clone());
                changed = true;
                step("apply-cr1", format!("{a} ⊑ {c} (via {b} ⊑ {c})"));
            }

            // CR2: A1,A2 ∈ S(C), conj A1⊓A2⊑B ⇒ C ⊑ B
            let mut cr2: Vec<(String, String, String, String)> = Vec::new(); // (C, A1, A2, B)
            for (a1, a2, b) in &conj_axioms {
                for (c, cs) in &s {
                    if cs.contains(a1) && cs.contains(a2) && !cs.contains(b) {
                        cr2.push((c.clone(), a1.clone(), a2.clone(), b.clone()));
                    }
                }
            }
            cr2.sort();
            cr2.dedup();
            for (c, a1, a2, b) in cr2 {
                s.get_mut(&c).unwrap().insert(b.clone());
                changed = true;
                step("apply-cr2", format!("{c} ⊑ {b} (via {a1} ⊓ {a2})"));
            }

            // CR3: A ⊑ ∃r.B ⇒ ({A},{B}) ∈ R(r)
            let mut cr3: Vec<(String, String, String)> = Vec::new();
            for (a, r, b) in &exists_rhs {
                if !edges.contains(&(a.clone(), r.clone(), b.clone())) {
                    cr3.push((a.clone(), r.clone(), b.clone()));
                }
            }
            for (a, r, b) in cr3 {
                edges.insert((a.clone(), r.clone(), b.clone()));
                changed = true;
                step("apply-cr3", format!("({a},{b}) ∈ R({r})"));
            }

            // CR4: ∃r.A ⊑ B, ({C},{A}) ∈ R(r) ⇒ C ⊑ B
            let mut cr4: Vec<(String, String, String)> = Vec::new(); // (C, r, A)
            for (r, a, b) in &exists_lhs {
                for edge in &edges {
                    let (c, er, ea) = edge;
                    if er == r && ea == a && !s[c].contains(b) {
                        cr4.push((c.clone(), r.clone(), a.clone()));
                    }
                }
            }
            cr4.sort();
            cr4.dedup();
            for (c, r, a) in cr4 {
                let b = exists_lhs
                    .iter()
                    .find(|(lr, la, _)| lr == &r && la == &a)
                    .map(|(_, _, b)| b.clone())
                    .unwrap();
                s.get_mut(&c).unwrap().insert(b.clone());
                changed = true;
                step("apply-cr4", format!("{c} ⊑ {b} (via ∃{r}.{a})"));
            }
        }
        // ── fixpoint ───────────────────────────────────────────────────
        let total_subsumptions: usize = s.values().map(|cs| cs.len()).sum();
        let total_edges = edges.len();
        trace.push(TraceStep {
            step: trace.len(),
            kind: "fixpoint".into(),
            detail: format!(
                "saturated: {total_subsumptions} subsumptions, {total_edges} role edges"
            ),
            depth: 0,
            objects: vec![],
        });

        // ── classify-verdict (sorted queries) ─────────────────────────
        let mut verdict_facts: Vec<Fact> = Vec::new();
        for (a, b) in &queries {
            let verdict = s.get(a).map_or(false, |cs| cs.contains(b));
            let bstr = if verdict { "true" } else { "false" };
            trace.push(TraceStep {
                step: trace.len(),
                kind: "classify-verdict".into(),
                detail: format!("{a} ⊑ {b} : {bstr}"),
                depth: 0,
                objects: vec![],
            });
            verdict_facts.push(Fact {
                key: format!("dl:verdict:{a}:{b}"),
                value: bstr.to_string(),
            });
        }

        let verdict_str = |(a, b): &(String, String)| {
            let v = s.get(a).map_or(false, |cs| cs.contains(b));
            format!("{a}⊑{b}={v}")
        };
        let selected = queries.first().map(verdict_str).unwrap_or_default();
        let verdicts_joined: Vec<String> = queries.iter().map(verdict_str).collect();

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: verdict_facts,
            selected: Some(selected),
            explanation: format!(
                "EL completion (CR1–CR4) to fixpoint over {} concepts; verdicts: {}",
                concepts.len(),
                verdicts_joined.join(", ")
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let trace = &output.inference_trace;
        if trace.is_empty() {
            return Err("DescriptionLogic must emit at least one trace step".to_string());
        }
        if trace[0].kind != "normalize" {
            return Err("first trace step must be 'normalize'".to_string());
        }
        if !trace.iter().any(|t| t.kind == "fixpoint") {
            return Err("trace must contain a 'fixpoint' step".to_string());
        }
        let fp = trace.iter().position(|t| t.kind == "fixpoint").unwrap();
        let cv = trace.iter().position(|t| t.kind == "classify-verdict");
        let Some(cv_pos) = cv else {
            return Err("trace must contain 'classify-verdict' steps".to_string());
        };
        if fp > cv_pos {
            return Err("'fixpoint' must precede 'classify-verdict'".to_string());
        }
        let goal_count = trace.iter().filter(|t| t.kind == "classify-verdict").count();
        let fact_count = output.facts.iter().filter(|f| f.key.starts_with("dl:verdict:")).count();
        if goal_count != fact_count {
            return Err(format!(
                "classify-verdict count {} != dl:verdict fact count {}",
                goal_count, fact_count
            ));
        }
        if !output.facts.iter().any(|f| f.key.starts_with("dl:verdict:")) {
            return Err("output must contain at least one 'dl:verdict:' fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Fact, Goal};

    fn fact(key: &str, value: &str) -> Fact {
        Fact { key: key.to_string(), value: value.to_string() }
    }

    fn sub_goal(value: &str) -> Goal {
        Goal { id: "q".into(), predicate: "dl:subsumes".into(), value: value.into() }
    }

    fn input(facts: Vec<Fact>, goals: Vec<Goal>) -> BreedInput {
        BreedInput {
            intent: "classify".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals,
            state: vec![],
        }
    }

    #[test]
    fn oracle_novel_input_full_trace() {
        let input = input(
            vec![
                fact("dl:subclass:t_Cat", "t_Mammal"),
                fact("dl:subclass:t_Mammal", "t_Animal"),
            ],
            vec![sub_goal("t_Cat:t_Animal")],
        );
        let out = DescriptionLogic.run(&input).unwrap();
        let details: Vec<(String, String)> = out
            .inference_trace
            .iter()
            .map(|t| (t.kind.clone(), t.detail.clone()))
            .collect();
        let expected = [
            ("normalize", "3 concepts, 2 subclass, 0 conj, 0 exists-rhs, 0 exists-lhs axioms"),
            ("apply-cr1", "t_Cat ⊑ t_Mammal (via t_Cat ⊑ t_Mammal)"),
            ("apply-cr1", "t_Mammal ⊑ t_Animal (via t_Mammal ⊑ t_Animal)"),
            ("apply-cr1", "t_Cat ⊑ t_Animal (via t_Mammal ⊑ t_Animal)"),
            ("fixpoint", "saturated: 6 subsumptions, 0 role edges"),
            ("classify-verdict", "t_Cat ⊑ t_Animal : true"),
        ];
        assert_eq!(details, expected.iter().map(|(k, d)| (k.to_string(), d.to_string())).collect::<Vec<_>>());
        assert_eq!(out.facts[0].key, "dl:verdict:t_Cat:t_Animal");
        assert_eq!(out.facts[0].value, "true");
        assert_eq!(out.selected.as_deref(), Some("t_Cat⊑t_Animal=true"));
        assert_eq!(
            out.explanation,
            "EL completion (CR1–CR4) to fixpoint over 3 concepts; verdicts: t_Cat⊑t_Animal=true"
        );
    }

    #[test]
    fn boundary_forward_vs_reverse() {
        let facts = vec![
            fact("dl:subclass:t_Cat", "t_Mammal"),
            fact("dl:subclass:t_Mammal", "t_Animal"),
        ];
        let fwd = DescriptionLogic
            .run(&input(facts.clone(), vec![sub_goal("t_Cat:t_Animal")]))
            .unwrap();
        let rev = DescriptionLogic
            .run(&input(facts, vec![sub_goal("t_Animal:t_Cat")]))
            .unwrap();
        assert_eq!(fwd.facts[0].value, "true");
        assert_eq!(rev.facts[0].value, "false");
    }

    #[test]
    fn full_cr_chain_baader_example() {
        // Canonical oracle-spec fixture: all four CRs fire; both directions queried.
        let input = input(
            vec![
                fact("dl:subclass:Pericarditis", "Inflammation"),
                fact("dl:subclass:Inflammation", "Disease"),
                fact("dl:exists_rhs:Pericarditis", "has_location.Heart"),
                fact("dl:exists_lhs:has_location.Heart", "HasLocationHeart"),
                fact("dl:conj:Disease+HasLocationHeart", "HeartDisease"),
            ],
            vec![
                sub_goal("Pericarditis:HeartDisease"),
                sub_goal("HeartDisease:Pericarditis"),
            ],
        );
        let out = DescriptionLogic.run(&input).unwrap();
        for kind in ["apply-cr1", "apply-cr2", "apply-cr3", "apply-cr4"] {
            assert!(
                out.inference_trace.iter().any(|t| t.kind == kind),
                "missing {kind}"
            );
        }
        let verdicts: std::collections::HashMap<String, String> = out
            .facts
            .iter()
            .map(|f| (f.key.clone(), f.value.clone()))
            .collect();
        assert_eq!(verdicts["dl:verdict:Pericarditis:HeartDisease"], "true");
        assert_eq!(verdicts["dl:verdict:HeartDisease:Pericarditis"], "false");
    }

    #[test]
    fn refuses_malformed_conj_and_exists_and_goals() {
        // dl:conj without '+' (the U4 oracle refusal input).
        let r1 = DescriptionLogic.run(&input(
            vec![fact("dl:conj:t_Cat", "t_Animal")],
            vec![sub_goal("t_Cat:t_Animal")],
        ));
        assert!(r1.is_err());
        // dl:exists_rhs without '.' in value.
        let r2 = DescriptionLogic.run(&input(
            vec![fact("dl:exists_rhs:t_Cat", "t_rel_uo_Cat")],
            vec![sub_goal("t_Cat:t_Animal")],
        ));
        assert!(r2.is_err());
        // dl:exists_lhs key without '.'.
        let r3 = DescriptionLogic.run(&input(
            vec![fact("dl:exists_lhs:t_rel", "t_Animal")],
            vec![sub_goal("t_Cat:t_Animal")],
        ));
        assert!(r3.is_err());
        // goal value without ':'.
        let r4 = DescriptionLogic.run(&input(
            vec![fact("dl:subclass:t_Cat", "t_Animal")],
            vec![sub_goal("t_Cat_uo_Animal")],
        ));
        assert!(r4.is_err());
    }

    #[test]
    fn refuses_no_axioms_no_goals_and_cap() {
        let no_axioms = input(
            vec![fact("unrelated", "thing")],
            vec![sub_goal("A:B")],
        );
        assert!(DescriptionLogic.run(&no_axioms).is_err());

        let no_goals = input(vec![fact("dl:subclass:A", "B")], vec![]);
        assert!(DescriptionLogic.run(&no_goals).is_err());

        // >32 distinct concepts.
        let mut facts = Vec::new();
        for i in 0..40 {
            facts.push(fact(&format!("dl:subclass:C{i}"), "Root"));
        }
        let over_cap = input(facts, vec![sub_goal("C0:Root")]);
        assert!(DescriptionLogic.run(&over_cap).is_err());
    }
}
