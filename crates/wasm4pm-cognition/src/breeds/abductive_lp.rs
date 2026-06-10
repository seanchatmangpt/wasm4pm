use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use crate::breeds::support::closure::{forward_close, HornRule};
use std::collections::BTreeSet;

/// Abductive Logic Programming Breed: KKT abductive logic programming.
pub struct AbductiveLpBreed;

impl CognitionBreed for AbductiveLpBreed {
    fn id(&self) -> BreedId {
        BreedId::AbductiveLp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "abductive_logic_programming".to_string(),
            "kkt_abduction".to_string(),
            "subset_minimality".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let abducibles = input.facts.iter().filter(|f| f.key == "abducible").count();
        if abducibles > 12 {
            return Err("AbductiveLp breed refuses >12 abducibles".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut abducibles = Vec::new();
        let mut initial_facts = BTreeSet::new();

        for f in &input.facts {
            if f.key == "abducible" {
                abducibles.push(f.value.clone());
            } else {
                initial_facts.insert(f.value.clone());
            }
        }
        abducibles.sort(); // Lexicographic sorting

        let mut horn_rules = Vec::new();
        for r in &input.rules {
            horn_rules.push(HornRule {
                id: r.id.clone(),
                premises: r.premise.clone(),
                conclusion: r.conclusion.clone(),
            });
        }

        let observations: Vec<String> = input.goals.iter().map(|g| g.value.clone()).collect();

        let mut trace = Vec::new();
        let mut step_idx = 0;

        trace.push(TraceStep {
            step: step_idx,
            kind: "load-abducibles".to_string(),
            detail: format!("Loaded {} abducibles", abducibles.len()),
            depth: 0,
            objects: vec![],
        });
        step_idx += 1;

        let n = abducibles.len();
        let mut valid_deltas: Vec<BTreeSet<String>> = Vec::new();

        for size in 0..=n {
            // Generate combinations of given size using bitmasks
            for mask in 0..(1 << n) {
                if mask_count(mask) != size {
                    continue;
                }

                let mut candidate = BTreeSet::new();
                for i in 0..n {
                    if (mask & (1 << i)) != 0 {
                        candidate.insert(abducibles[i].clone());
                    }
                }

                trace.push(TraceStep {
                    step: step_idx,
                    kind: "candidate-delta".to_string(),
                    detail: format!("Candidate: {:?}", candidate),
                    depth: 1,
                    objects: vec![],
                });
                step_idx += 1;

                // Check subset minimality against valid_deltas
                let mut is_superset = false;
                for vd in &valid_deltas {
                    if vd.is_subset(&candidate) {
                        is_superset = true;
                        break;
                    }
                }

                if is_superset {
                    trace.push(TraceStep {
                        step: step_idx,
                        kind: "explain-reject".to_string(),
                        detail: "Violates subset minimality".to_string(),
                        depth: 1,
                        objects: vec![],
                    });
                    step_idx += 1;
                    continue;
                }

                let mut current_facts = initial_facts.clone();
                for c in &candidate {
                    current_facts.insert(c.clone());
                }

                let closure_res = forward_close(&current_facts, &horn_rules);
                
                trace.push(TraceStep {
                    step: step_idx,
                    kind: "derive".to_string(),
                    detail: format!("Derived facts: {:?}", closure_res.facts),
                    depth: 1,
                    objects: vec![],
                });
                step_idx += 1;

                trace.push(TraceStep {
                    step: step_idx,
                    kind: "ic-check".to_string(),
                    detail: "Checking integrity constraints".to_string(),
                    depth: 1,
                    objects: vec![],
                });
                step_idx += 1;

                let ic_satisfied = !closure_res.facts.contains("false");
                let obs_derived = observations.iter().all(|o| closure_res.facts.contains(o));

                if ic_satisfied && obs_derived {
                    trace.push(TraceStep {
                        step: step_idx,
                        kind: "explain-accept".to_string(),
                        detail: "Observation derived and IC satisfied".to_string(),
                        depth: 1,
                        objects: vec![],
                    });
                    step_idx += 1;
                    valid_deltas.push(candidate);
                } else {
                    trace.push(TraceStep {
                        step: step_idx,
                        kind: "explain-reject".to_string(),
                        detail: if !ic_satisfied { "IC violated".to_string() } else { "Observation not derived".to_string() },
                        depth: 1,
                        objects: vec![],
                    });
                    step_idx += 1;
                }
            }
        }

        trace.push(TraceStep {
            step: step_idx,
            kind: "minimal-set".to_string(),
            detail: format!("Found {} minimal explanations", valid_deltas.len()),
            depth: 0,
            objects: vec![],
        });

        let mut out_facts = Vec::new();
        let mut selected_strs = Vec::new();
        for (i, vd) in valid_deltas.iter().enumerate() {
            let mut sorted: Vec<_> = vd.iter().collect();
            sorted.sort();
            let s = format!("{{{}}}", sorted.into_iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", "));
            selected_strs.push(s.clone());
            out_facts.push(Fact {
                key: format!("explanation_{}", i),
                value: s,
            });
        }

        Ok(BreedOutput {
            breed: BreedId::AbductiveLp,
            candidates: vec![],
            facts: out_facts,
            selected: if selected_strs.is_empty() { None } else { Some(selected_strs.join(" | ")) },
            explanation: format!("Found {} minimal abductive explanations", valid_deltas.len()),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("AbductiveLp trace must not be empty".to_string());
        }
        if !output.inference_trace.iter().any(|s| s.kind == "minimal-set") {
            return Err("AbductiveLp trace must end with minimal-set".to_string());
        }
        Ok(())
    }
}

fn mask_count(mut mask: u32) -> usize {
    let mut c = 0;
    while mask > 0 {
        if mask & 1 == 1 { c += 1; }
        mask >>= 1;
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Rule, Goal};

    fn make_input(facts: Vec<(&str, &str)>, rules: Vec<Rule>, goals: Vec<&str>) -> BreedInput {
        BreedInput {
            intent: "test".to_string(),
            candidates: vec![],
            facts: facts.into_iter().map(|(k, v)| Fact { key: k.to_string(), value: v.to_string() }).collect(),
            cases: vec![],
            rules,
            goals: goals.into_iter().map(|g| Goal { id: g.to_string(), predicate: "obs".to_string(), value: g.to_string() }).collect(),
            state: vec![],
        }
    }

    #[test]
    fn test_hidden_oracle_minimality_and_ic() {
        // rules:
        // a -> obs
        // b -> obs
        // a, ic_trigger -> false  (IC)
        // abducibles: a, b
        // goals: obs
        let facts = vec![
            ("abducible", "a"),
            ("abducible", "b"),
            ("fact", "ic_trigger"),
        ];
        let rules = vec![
            Rule { id: "r1".to_string(), premise: vec!["a".to_string()], conclusion: "obs".to_string(), certainty: 1.0 },
            Rule { id: "r2".to_string(), premise: vec!["b".to_string()], conclusion: "obs".to_string(), certainty: 1.0 },
            Rule { id: "r3".to_string(), premise: vec!["a".to_string(), "ic_trigger".to_string()], conclusion: "false".to_string(), certainty: 1.0 },
        ];
        let input = make_input(facts, rules, vec!["obs"]);
        let output = AbductiveLpBreed.run(&input).unwrap();
        
        let mut trace_rejects = false;
        let mut reject_reason = "".to_string();
        for step in &output.inference_trace {
            if step.kind == "explain-reject" && step.detail.contains("IC") {
                trace_rejects = true;
                reject_reason = step.detail.clone();
            }
        }
        
        assert!(trace_rejects);
        assert_eq!(output.selected, Some("{b}".to_string()));
    }

    #[test]
    fn test_determinism() {
        let facts = vec![("abducible", "a"), ("abducible", "b")];
        let rules = vec![
            Rule { id: "r1".to_string(), premise: vec!["a".to_string()], conclusion: "obs".to_string(), certainty: 1.0 },
        ];
        let input = make_input(facts, rules, vec!["obs"]);
        let out1 = AbductiveLpBreed.run(&input).unwrap();
        let out2 = AbductiveLpBreed.run(&input).unwrap();
        assert_eq!(out1.facts, out2.facts);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }
}
