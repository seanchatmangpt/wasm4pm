use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet, HashSet};

/// Abductive Logic Programming (ALP) breed.
///
/// Surface-3 contract: `alp:abducible:<X>` / `alp:ic:<id>` facts, goal
/// predicate `alp:observe`; trace load-abducibles -> candidate-delta ->
/// derive -> explain-accept/explain-reject -> minimal-set.
pub struct AbductiveLp;

/// Render a Δ set the way the trace and output facts spell it: `{a,b}`.
fn render_delta(set: &[String]) -> String {
    let mut sorted: Vec<&String> = set.iter().collect();
    sorted.sort();
    let joined: Vec<&str> = sorted.iter().map(|s| s.as_str()).collect();
    format!("{{{}}}", joined.join(","))
}

/// All `k`-subsets of `0..n` in lexicographic order of their index tuples.
fn combinations(n: usize, k: usize) -> Vec<Vec<usize>> {
    let mut out = Vec::new();
    if k > n {
        return out;
    }
    let mut cur: Vec<usize> = (0..k).collect();
    loop {
        out.push(cur.clone());
        // advance to next lexicographic combination
        let mut i = k;
        while i > 0 {
            let idx = i - 1;
            if cur[idx] < n - (k - idx) {
                cur[idx] += 1;
                for j in (idx + 1)..k {
                    cur[j] = cur[j - 1] + 1;
                }
                break;
            }
            i -= 1;
        }
        if i == 0 {
            break;
        }
        if k == 0 {
            break;
        }
    }
    out
}

impl CognitionBreed for AbductiveLp {
    fn id(&self) -> BreedId {
        BreedId::AbductiveLp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "abductive_logic_programming".to_string(),
            "integrity_constraints".to_string(),
            "explanation_generation".to_string(),
            "minimal_hypothesis".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("AbductiveLp requires at least one rule".to_string());
        }
        if !input.goals.iter().any(|g| g.predicate == "alp:observe") {
            return Err(
                "AbductiveLp requires an 'alp:observe' goal naming the observation to explain"
                    .to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        // ── Load abducibles + ICs ──────────────────────────────────────
        let mut abducibles: BTreeSet<String> = BTreeSet::new();
        let mut ics: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for f in &input.facts {
            if let Some(atom) = f.key.strip_prefix("alp:abducible:") {
                abducibles.insert(atom.to_string());
            } else if let Some(id) = f.key.strip_prefix("alp:ic:") {
                let atoms: Vec<String> = f.value.split(',').map(|s| s.trim().to_string()).collect();
                ics.insert(id.to_string(), atoms);
            }
        }
        // Rules with conclusion "false" are integrity constraints as well.
        for r in &input.rules {
            if r.conclusion == "false" {
                ics.insert(
                    r.id.clone(),
                    r.premise.iter().map(|s| s.to_string()).collect(),
                );
            }
        }

        let obs = input
            .goals
            .iter()
            .find(|g| g.predicate == "alp:observe")
            .map(|g| g.value.clone())
            .unwrap_or_default();

        let abducibles_list: Vec<String> = abducibles.iter().cloned().collect();
        let n_abd = abducibles_list.len();
        if n_abd > 16 {
            return Err(BreedError {
                breed: self.id(),
                message: format!(
                    "too many abducibles for exact ALP (max 16, got {})",
                    n_abd
                ),
            });
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "load-abducibles".into(),
            detail: format!(
                "A={{{}}}, {} ICs, observe '{}'",
                abducibles_list.join(","),
                ics.len(),
                obs
            ),
            depth: 0,
            objects: vec![],
        });

        // Context atoms: values of non-`alp:` facts (e.g. a `context:d` fact
        // contributes atom `d` to every least model).
        let context: BTreeSet<String> = input
            .facts
            .iter()
            .filter(|f| !f.key.starts_with("alp:") && !f.value.is_empty())
            .map(|f| f.value.clone())
            .collect();

        // Accepted Δ sets (sorted atom vectors) drive the minimality filter.
        let mut accepted: Vec<Vec<String>> = Vec::new();

        for size in 0..=n_abd {
            for combo in combinations(n_abd, size) {
                let names: Vec<String> = combo.iter().map(|&i| abducibles_list[i].clone()).collect();
                let delta_str = render_delta(&names);
                let names_set: HashSet<&String> = names.iter().collect();

                // Non-minimal: superset of an already-accepted Δ.
                if accepted
                    .iter()
                    .any(|acc| acc.iter().all(|a| names_set.contains(a)))
                {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "explain-reject".into(),
                        detail: format!("{delta_str} non-minimal (superset of accepted Δ)"),
                        depth: 1,
                        objects: vec![],
                    });
                    continue;
                }

                // Least model LM(P ∪ Δ): Δ + context facts + rule closure.
                let mut lm: HashSet<String> = HashSet::new();
                for a in &names {
                    lm.insert(a.clone());
                }
                lm.extend(context.iter().cloned());
                loop {
                    let mut added = false;
                    for r in &input.rules {
                        if r.conclusion == "false" || lm.contains(&r.conclusion) {
                            continue;
                        }
                        if r.premise.iter().all(|p| lm.contains(p)) {
                            lm.insert(r.conclusion.clone());
                            added = true;
                        }
                    }
                    if !added {
                        break;
                    }
                }

                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "candidate-delta".into(),
                    detail: format!("Δ={delta_str}"),
                    depth: 1,
                    objects: vec![],
                });
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "derive".into(),
                    detail: format!("|LM(P∪Δ)|={} atoms", lm.len()),
                    depth: 2,
                    objects: vec![],
                });

                // IC violation: any IC whose atoms are all in LM.
                let violated = ics.iter().find(|(_, atoms)| {
                    atoms.iter().all(|a| lm.contains(a))
                });
                if let Some((id, _)) = violated {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "explain-reject".into(),
                        detail: format!("Δ={delta_str}: IC violated, IC '{id}' fires"),
                        depth: 1,
                        objects: vec![],
                    });
                    continue;
                }

                if !lm.contains(&obs) {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "explain-reject".into(),
                        detail: format!("Δ={delta_str}: observation not derived, ICs ok"),
                        depth: 1,
                        objects: vec![],
                    });
                    continue;
                }

                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "explain-accept".into(),
                    detail: format!("Δ={delta_str} explains '{obs}'"),
                    depth: 1,
                    objects: vec![],
                });
                accepted.push(names);
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "minimal-set".into(),
            detail: format!("{} minimal explanation(s)", accepted.len()),
            depth: 0,
            objects: vec![],
        });

        // ── Output ─────────────────────────────────────────────────────
        let mut out_facts = Vec::new();
        for (i, exp) in accepted.iter().enumerate() {
            out_facts.push(Fact {
                key: format!("alp:explanation:{i}"),
                value: render_delta(exp),
            });
        }
        out_facts.push(Fact {
            key: "alp:explanation_count".to_string(),
            value: accepted.len().to_string(),
        });

        let selected = accepted
            .first()
            .map(|exp| render_delta(exp))
            .unwrap_or_default();

        let explanation = format!(
            "KKT abduction: {} minimal explanation(s) of '{}' over {} abducibles.",
            accepted.len(),
            obs,
            n_abd
        );


        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some(selected),
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let trace = &output.inference_trace;
        if trace.is_empty() {
            return Err("AbductiveLp must emit at least one trace step".to_string());
        }
        if trace[0].kind != "load-abducibles" {
            return Err("first trace step must be 'load-abducibles'".to_string());
        }
        if !trace.iter().any(|t| t.kind == "candidate-delta") {
            return Err("trace must contain at least one 'candidate-delta' step".to_string());
        }
        if !trace
            .iter()
            .any(|t| t.kind == "explain-accept" || t.kind == "explain-reject")
        {
            return Err(
                "trace must contain at least one explain-accept or explain-reject step"
                    .to_string(),
            );
        }
        let last = trace.last().unwrap();
        if last.kind != "minimal-set" {
            return Err("last trace step must be 'minimal-set'".to_string());
        }
        let count_fact = output
            .facts
            .iter()
            .find(|f| f.key == "alp:explanation_count")
            .ok_or("output must contain 'alp:explanation_count'")?;
        let expected = format!("{} minimal explanation(s)", count_fact.value);
        if last.detail != expected {
            return Err(format!(
                "minimal-set detail '{}' inconsistent with alp:explanation_count {}",
                last.detail, count_fact.value
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Goal, Rule};

    fn input(facts: Vec<Fact>, rules: Vec<Rule>, goals: Vec<Goal>) -> BreedInput {
        BreedInput {
            intent: "abduce".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules,
            goals,
            state: vec![],
        }
    }

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.to_string(),
            value: value.to_string(),
        }
    }

    fn rule(id: &str, premise: &[&str], conclusion: &str) -> Rule {
        Rule {
            id: id.to_string(),
            premise: premise.iter().map(|s| s.to_string()).collect(),
            conclusion: conclusion.to_string(),
            certainty: 1.0,
        }
    }

    fn goal(value: &str) -> Goal {
        Goal {
            id: "g0".to_string(),
            predicate: "alp:observe".to_string(),
            value: value.to_string(),
        }
    }

    /// Exact novel-input trace sequence from the oracle contract (plan risk #4
    /// mitigation): accept the singleton, reject its superset as non-minimal.
    #[test]
    fn oracle_novel_input_trace_sequence() {
        let input = input(
            vec![
                fact("alp:abducible:t_leak", "true"),
                fact("alp:abducible:t_surge", "true"),
            ],
            vec![rule("t_r0", &["t_leak"], "t_alarm")],
            vec![goal("t_alarm")],
        );
        let out = AbductiveLp.run(&input).unwrap();
        let details: Vec<(String, String)> = out
            .inference_trace
            .iter()
            .map(|t| (t.kind.clone(), t.detail.clone()))
            .collect();
        let expected = [
            ("load-abducibles", "A={t_leak,t_surge}, 0 ICs, observe 't_alarm'"),
            ("candidate-delta", "Δ={}"),
            ("derive", "|LM(P∪Δ)|=0 atoms"),
            ("explain-reject", "Δ={}: observation not derived, ICs ok"),
            ("candidate-delta", "Δ={t_leak}"),
            ("derive", "|LM(P∪Δ)|=2 atoms"),
            ("explain-accept", "Δ={t_leak} explains 't_alarm'"),
            ("candidate-delta", "Δ={t_surge}"),
            ("derive", "|LM(P∪Δ)|=1 atoms"),
            ("explain-reject", "Δ={t_surge}: observation not derived, ICs ok"),
            (
                "explain-reject",
                "{t_leak,t_surge} non-minimal (superset of accepted Δ)",
            ),
            ("minimal-set", "1 minimal explanation(s)"),
        ];
        for (i, (kind, detail)) in expected.iter().enumerate() {
            assert_eq!(details[i].0, *kind, "step {i} kind");
            assert_eq!(details[i].1, *detail, "step {i} detail");
        }
        assert_eq!(details.len(), expected.len());
        assert_eq!(out.facts[0].key, "alp:explanation:0");
        assert_eq!(out.facts[0].value, "{t_leak}");
        assert_eq!(out.selected.as_deref(), Some("{t_leak}"));
        assert_eq!(
            out.explanation,
            "KKT abduction: 1 minimal explanation(s) of 't_alarm' over 2 abducibles."
        );
    }

    /// IC fires over LM(P∪Δ) including context facts (plan risk #3).
    #[test]
    fn ic_evaluation_includes_context_facts() {
        let input = input(
            vec![
                fact("alp:abducible:a", "true"),
                fact("alp:abducible:b", "true"),
                fact("alp:abducible:c", "true"),
                fact("alp:abducible:d", "true"),
                fact("context", "d"),
            ],
            vec![
                rule("r1", &["a", "b"], "g"),
                rule("r2", &["c"], "g"),
                rule("r_ic", &["a", "d"], "false"),
            ],
            vec![goal("g")],
        );
        let out = AbductiveLp.run(&input).unwrap();
        assert_eq!(
            out.facts
                .iter()
                .find(|f| f.key == "alp:explanation_count")
                .unwrap()
                .value,
            "1"
        );
        assert_eq!(out.facts[0].value, "{c}");
        // {a} must have been IC-rejected over LM({a}) = {a,d} + closure.
        assert!(out.inference_trace.iter().any(|t| {
            t.kind == "explain-reject" && t.detail.contains("IC violated")
        }));
    }

    #[test]
    fn refuses_missing_observe_goal() {
        let input = input(
            vec![fact("alp:abducible:x", "true")],
            vec![rule("r0", &["x"], "y")],
            vec![Goal {
                id: "g0".into(),
                predicate: "entail".into(),
                value: "y".into(),
            }],
        );
        assert!(AbductiveLp.preconditions(&input).is_err());
    }

    #[test]
    fn refuses_too_many_abducibles() {
        let facts = (0..17)
            .map(|i| fact(&format!("alp:abducible:x{i}"), "true"))
            .collect();
        let input = input(facts, vec![rule("r0", &["x0"], "y")], vec![goal("y")]);
        assert!(AbductiveLp.run(&input).is_err());
    }
}
