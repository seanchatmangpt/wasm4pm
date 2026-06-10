use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Description Logic Breed: EL++ completion rules for subsumption.
pub struct DescriptionLogicBreed;

impl CognitionBreed for DescriptionLogicBreed {
    fn id(&self) -> BreedId {
        BreedId::DescriptionLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "description_logic".to_string(),
            "el_plus_plus".to_string(),
            "subsumption_completion".to_string(),
        ]
    }

    fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut sub_rules = Vec::new(); // C -> D
        let mut conj_rules = Vec::new(); // C1, C2 -> D
        let mut exists_rhs = Vec::new(); // C -> r, D
        let mut exists_lhs = Vec::new(); // r, C -> D

        let mut concepts = BTreeSet::new();

        for f in &input.facts {
            if f.key == "dl.subclass" {
                let parts: Vec<&str> = f.value.split(':').collect();
                if parts.len() == 2 {
                    sub_rules.push((parts[0].to_string(), parts[1].to_string()));
                    concepts.insert(parts[0].to_string());
                    concepts.insert(parts[1].to_string());
                }
            } else if f.key == "dl.conj_subclass" {
                let parts: Vec<&str> = f.value.split(':').collect();
                if parts.len() == 3 {
                    conj_rules.push((parts[0].to_string(), parts[1].to_string(), parts[2].to_string()));
                    concepts.insert(parts[0].to_string());
                    concepts.insert(parts[1].to_string());
                    concepts.insert(parts[2].to_string());
                }
            } else if f.key == "dl.exists_rhs" {
                let parts: Vec<&str> = f.value.split(':').collect();
                if parts.len() == 3 {
                    exists_rhs.push((parts[0].to_string(), parts[1].to_string(), parts[2].to_string()));
                    concepts.insert(parts[0].to_string());
                    concepts.insert(parts[2].to_string());
                }
            } else if f.key == "dl.exists_lhs" {
                let parts: Vec<&str> = f.value.split(':').collect();
                if parts.len() == 3 {
                    exists_lhs.push((parts[0].to_string(), parts[1].to_string(), parts[2].to_string()));
                    concepts.insert(parts[1].to_string());
                    concepts.insert(parts[2].to_string());
                }
            }
        }

        let mut trace = Vec::new();
        let mut step_idx = 0;

        trace.push(TraceStep {
            step: step_idx,
            kind: "normalize".to_string(),
            detail: format!("Loaded {} concepts", concepts.len()),
            depth: 0,
            objects: vec![],
        });
        step_idx += 1;

        let mut s_map: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut r_map: BTreeMap<(String, String), BTreeSet<String>> = BTreeMap::new();

        for c in &concepts {
            let mut set = BTreeSet::new();
            set.insert(c.clone());
            set.insert("top".to_string());
            s_map.insert(c.clone(), set);
        }

        loop {
            let mut changed = false;

            // CR1
            for c in &concepts {
                for (c_prime, d) in &sub_rules {
                    if s_map.get(c).unwrap().contains(c_prime) {
                        if !s_map.get(c).unwrap().contains(d) {
                            s_map.get_mut(c).unwrap().insert(d.clone());
                            trace.push(TraceStep {
                                step: step_idx,
                                kind: "apply-cr1".to_string(),
                                detail: format!("S({}) += {}", c, d),
                                depth: 1,
                                objects: vec![],
                            });
                            step_idx += 1;
                            changed = true;
                        }
                    }
                }
            }

            // CR2
            for c in &concepts {
                for (c1, c2, d) in &conj_rules {
                    let set = s_map.get(c).unwrap();
                    if set.contains(c1) && set.contains(c2) && !set.contains(d) {
                        s_map.get_mut(c).unwrap().insert(d.clone());
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "apply-cr2".to_string(),
                            detail: format!("S({}) += {}", c, d),
                            depth: 1,
                            objects: vec![],
                        });
                        step_idx += 1;
                        changed = true;
                    }
                }
            }

            // CR3
            for c in &concepts {
                for (c_prime, r, d) in &exists_rhs {
                    if s_map.get(c).unwrap().contains(c_prime) {
                        let roles = r_map.entry((c.clone(), d.clone())).or_insert_with(BTreeSet::new);
                        if !roles.contains(r) {
                            roles.insert(r.clone());
                            trace.push(TraceStep {
                                step: step_idx,
                                kind: "apply-cr3".to_string(),
                                detail: format!("R({}, {}) += {}", c, d, r),
                                depth: 1,
                                objects: vec![],
                            });
                            step_idx += 1;
                            changed = true;
                        }
                    }
                }
            }

            // CR4
            let r_map_clone = r_map.clone();
            for ((c, d), roles) in &r_map_clone {
                let c = c.clone();
                let d = d.clone();
                for r in roles {
                    for (r2, d_prime, e) in &exists_lhs {
                        if r == r2 && s_map.get(&d).unwrap().contains(d_prime) {
                            if !s_map.get(&c).unwrap().contains(e) {
                                s_map.get_mut(&c).unwrap().insert(e.clone());
                                trace.push(TraceStep {
                                    step: step_idx,
                                    kind: "apply-cr4".to_string(),
                                    detail: format!("S({}) += {}", c, e),
                                    depth: 1,
                                    objects: vec![],
                                });
                                step_idx += 1;
                                changed = true;
                            }
                        }
                    }
                }
            }

            if !changed {
                break;
            }
        }

        trace.push(TraceStep {
            step: step_idx,
            kind: "fixpoint".to_string(),
            detail: "CR1-4 saturation complete".to_string(),
            depth: 0,
            objects: vec![],
        });
        step_idx += 1;

        let mut out_facts = Vec::new();
        for (c, subsumers) in &s_map {
            for s in subsumers {
                if s != "top" && s != c {
                    out_facts.push(Fact {
                        key: "derived.subclass".to_string(),
                        value: format!("{}:{}", c, s),
                    });
                }
            }
        }

        out_facts.sort_by_key(|f| f.value.clone());

        trace.push(TraceStep {
            step: step_idx,
            kind: "classify-verdict".to_string(),
            detail: format!("Derived {} subsumptions", out_facts.len()),
            depth: 0,
            objects: vec![],
        });

        Ok(BreedOutput {
            breed: BreedId::DescriptionLogic,
            candidates: vec![],
            facts: out_facts,
            selected: None,
            explanation: "EL++ description logic classified ontology".to_string(),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("DescriptionLogic trace must not be empty".to_string());
        }
        if !output.inference_trace.iter().any(|s| s.kind == "classify-verdict") {
            return Err("DescriptionLogic trace must end with classify-verdict".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_input(facts: Vec<(&str, &str)>) -> BreedInput {
        BreedInput {
            intent: "test".to_string(),
            candidates: vec![],
            facts: facts.into_iter().map(|(k, v)| Fact { key: k.to_string(), value: v.to_string() }).collect(),
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_hidden_oracle_role_chain() {
        let facts = vec![
            ("dl.exists_rhs", "C:r:D"),
            ("dl.subclass", "D:D_prime"),
            ("dl.exists_lhs", "r:D_prime:E"),
        ];
        let input = make_input(facts);
        let output = DescriptionLogicBreed.run(&input).unwrap();
        
        let c_sub_e = output.facts.iter().any(|f| f.value == "C:E");
        let e_sub_c = output.facts.iter().any(|f| f.value == "E:C");
        assert!(c_sub_e);
        assert!(!e_sub_c);
    }

    #[test]
    fn test_determinism() {
        let facts = vec![
            ("dl.exists_rhs", "C:r:D"),
            ("dl.subclass", "D:D_prime"),
            ("dl.exists_lhs", "r:D_prime:E"),
        ];
        let input = make_input(facts);
        let out1 = DescriptionLogicBreed.run(&input).unwrap();
        let out2 = DescriptionLogicBreed.run(&input).unwrap();
        assert_eq!(out1.facts, out2.facts);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }
}
