use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep, Fact,
};
use crate::breeds::support::formula::Formula;
use std::collections::{HashMap, HashSet};

/// CTL model checking breed.
pub struct CtlCheck;

impl CognitionBreed for CtlCheck {
    fn id(&self) -> BreedId {
        BreedId::CtlCheck
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["model_checking".to_string(), "ctl".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let formula = input.facts.iter().find(|f| f.key == "ctl:formula");
        if formula.is_none() {
            return Err("Missing ctl:formula fact".to_string());
        }
        
        let states = input.facts.iter().filter(|f| f.key.starts_with("state:")).count();
        if states > 64 {
            return Err(format!("States exceed 64 (count={})", states));
        }

        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let formula_str = input.facts.iter().find(|f| f.key == "ctl:formula").unwrap().value.clone();
        let initial_state = input.facts.iter().find(|f| f.key == "ctl:initial").map(|f| f.value.clone());
        
        let mut states = HashSet::new();
        let mut transitions: HashMap<String, HashSet<String>> = HashMap::new();
        let mut labels: HashMap<String, HashSet<String>> = HashMap::new();

        for fact in &input.facts {
            if let Some(s) = fact.key.strip_prefix("state:") {
                states.insert(s.to_string());
                transitions.entry(s.to_string()).or_default();
                labels.entry(s.to_string()).or_default();
            }
        }

        for fact in &input.facts {
            if let Some(edge) = fact.key.strip_prefix("transition:") {
                let parts: Vec<&str> = edge.split(":").collect();
                if parts.len() == 2 {
                    let from = parts[0].to_string();
                    let to = parts[1].to_string();
                    states.insert(from.clone());
                    states.insert(to.clone());
                    transitions.entry(from).or_default().insert(to);
                }
            } else if let Some(lbl) = fact.key.strip_prefix("label:") {
                let parts: Vec<&str> = lbl.split(":").collect();
                if parts.len() == 2 {
                    let state = parts[0].to_string();
                    let prop = parts[1].to_string();
                    labels.entry(state).or_default().insert(prop);
                }
            }
        }

        let mut trace = Vec::new();
        let mut step = 0;

        let parsed_formula = Formula::parse(&formula_str).map_err(|e| BreedError {
            breed: self.id(),
            message: format!("Formula parse error: {}", e),
        })?;

        trace.push(TraceStep {
            step,
            kind: "parse-formula".to_string(),
            detail: parsed_formula.to_string(),
            depth: 0,
            objects: vec![],
        });
        step += 1;

        let mut subformulas = HashSet::new();
        fn collect_subformulas(f: &Formula, out: &mut HashSet<Formula>) {
            out.insert(f.clone());
            match f {
                Formula::Not(a) | Formula::Next(a) | Formula::Eventually(a) | Formula::Globally(a) |
                Formula::AllPaths(a) | Formula::ExistsPath(a) => collect_subformulas(a, out),
                Formula::And(a, b) | Formula::Or(a, b) | Formula::Implies(a, b) |
                Formula::Until(a, b) | Formula::Release(a, b) => {
                    collect_subformulas(a, out);
                    collect_subformulas(b, out);
                }
                _ => {}
            }
        }
        collect_subformulas(&parsed_formula, &mut subformulas);
        let mut subformulas: Vec<Formula> = subformulas.into_iter().collect();
        subformulas.sort_by_key(|f| f.size());

        let mut sat: HashMap<Formula, HashSet<String>> = HashMap::new();

        let ex = |set: &HashSet<String>, trans: &HashMap<String, HashSet<String>>| -> HashSet<String> {
            let mut res = HashSet::new();
            for (u, v_set) in trans {
                if !v_set.is_disjoint(set) {
                    res.insert(u.clone());
                }
            }
            res
        };

        let ax = |set: &HashSet<String>, trans: &HashMap<String, HashSet<String>>, states: &HashSet<String>| -> HashSet<String> {
            let mut res = HashSet::new();
            for u in states {
                if let Some(v_set) = trans.get(u) {
                    if !v_set.is_empty() && v_set.is_subset(set) {
                        res.insert(u.clone());
                    }
                }
            }
            res
        };

        for sub_f in subformulas {
            let sat_states = match &sub_f {
                Formula::True => states.clone(),
                Formula::False => HashSet::new(),
                Formula::Atom(p) => {
                    let mut res = HashSet::new();
                    for (s, l) in &labels {
                        if l.contains(p) {
                            res.insert(s.clone());
                        }
                    }
                    res
                }
                Formula::Not(a) => {
                    let a_sat = sat.get(&**a).unwrap();
                    states.difference(a_sat).cloned().collect()
                }
                Formula::And(a, b) => {
                    let a_sat = sat.get(&**a).unwrap();
                    let b_sat = sat.get(&**b).unwrap();
                    a_sat.intersection(b_sat).cloned().collect()
                }
                Formula::Or(a, b) => {
                    let a_sat = sat.get(&**a).unwrap();
                    let b_sat = sat.get(&**b).unwrap();
                    a_sat.union(b_sat).cloned().collect()
                }
                Formula::Implies(a, b) => {
                    let a_sat = sat.get(&**a).unwrap();
                    let b_sat = sat.get(&**b).unwrap();
                    let not_a: HashSet<_> = states.difference(a_sat).cloned().collect();
                    not_a.union(b_sat).cloned().collect()
                }
                Formula::AllPaths(inner) => {
                    match &**inner {
                        Formula::Next(f) => {
                            let f_sat = sat.get(&**f).unwrap();
                            ax(f_sat, &transitions, &states)
                        }
                        Formula::Globally(f) => {
                            let f_sat = sat.get(&**f).unwrap();
                            let mut y = f_sat.clone();
                            loop {
                                trace.push(TraceStep {
                                    step,
                                    kind: "fixpoint-iterate".to_string(),
                                    detail: format!("AG: |Y|={}", y.len()),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                let ax_y = ax(&y, &transitions, &states);
                                let y_next: HashSet<_> = y.intersection(&ax_y).cloned().collect();
                                if y_next == y { break; }
                                y = y_next;
                            }
                            y
                        }
                        Formula::Eventually(f) => {
                            let f_sat = sat.get(&**f).unwrap();
                            let mut y = f_sat.clone();
                            loop {
                                trace.push(TraceStep {
                                    step,
                                    kind: "fixpoint-iterate".to_string(),
                                    detail: format!("AF: |Y|={}", y.len()),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                let ax_y = ax(&y, &transitions, &states);
                                let y_next: HashSet<_> = y.union(&ax_y).cloned().collect();
                                if y_next == y { break; }
                                y = y_next;
                            }
                            y
                        }
                        Formula::Until(a, b) => {
                            let a_sat = sat.get(&**a).unwrap();
                            let b_sat = sat.get(&**b).unwrap();
                            let mut y = b_sat.clone();
                            loop {
                                trace.push(TraceStep {
                                    step,
                                    kind: "fixpoint-iterate".to_string(),
                                    detail: format!("AU: |Y|={}", y.len()),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                let ax_y = ax(&y, &transitions, &states);
                                let a_and_ax_y: HashSet<_> = a_sat.intersection(&ax_y).cloned().collect();
                                let y_next: HashSet<_> = y.union(&a_and_ax_y).cloned().collect();
                                if y_next == y { break; }
                                y = y_next;
                            }
                            y
                        }
                        Formula::Release(a, b) => {
                            let a_sat = sat.get(&**a).unwrap();
                            let b_sat = sat.get(&**b).unwrap();
                            let mut y = b_sat.clone();
                            loop {
                                trace.push(TraceStep {
                                    step,
                                    kind: "fixpoint-iterate".to_string(),
                                    detail: format!("AR: |Y|={}", y.len()),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                let ax_y = ax(&y, &transitions, &states);
                                let a_or_ax_y: HashSet<_> = a_sat.union(&ax_y).cloned().collect();
                                let y_next: HashSet<_> = y.intersection(&a_or_ax_y).cloned().collect();
                                if y_next == y { break; }
                                y = y_next;
                            }
                            y
                        }
                        _ => HashSet::new(),
                    }
                }
                Formula::ExistsPath(inner) => {
                    match &**inner {
                        Formula::Next(f) => {
                            let f_sat = sat.get(&**f).unwrap();
                            ex(f_sat, &transitions)
                        }
                        Formula::Globally(f) => {
                            let f_sat = sat.get(&**f).unwrap();
                            let mut y = f_sat.clone();
                            loop {
                                trace.push(TraceStep {
                                    step,
                                    kind: "fixpoint-iterate".to_string(),
                                    detail: format!("EG: |Y|={}", y.len()),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                let ex_y = ex(&y, &transitions);
                                let y_next: HashSet<_> = y.intersection(&ex_y).cloned().collect();
                                if y_next == y { break; }
                                y = y_next;
                            }
                            y
                        }
                        Formula::Eventually(f) => {
                            let f_sat = sat.get(&**f).unwrap();
                            let mut y = f_sat.clone();
                            loop {
                                trace.push(TraceStep {
                                    step,
                                    kind: "fixpoint-iterate".to_string(),
                                    detail: format!("EF: |Y|={}", y.len()),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                let ex_y = ex(&y, &transitions);
                                let y_next: HashSet<_> = y.union(&ex_y).cloned().collect();
                                if y_next == y { break; }
                                y = y_next;
                            }
                            y
                        }
                        Formula::Until(a, b) => {
                            let a_sat = sat.get(&**a).unwrap();
                            let b_sat = sat.get(&**b).unwrap();
                            let mut y = b_sat.clone();
                            loop {
                                trace.push(TraceStep {
                                    step,
                                    kind: "fixpoint-iterate".to_string(),
                                    detail: format!("EU: |Y|={}", y.len()),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                let ex_y = ex(&y, &transitions);
                                let a_and_ex_y: HashSet<_> = a_sat.intersection(&ex_y).cloned().collect();
                                let y_next: HashSet<_> = y.union(&a_and_ex_y).cloned().collect();
                                if y_next == y { break; }
                                y = y_next;
                            }
                            y
                        }
                        Formula::Release(a, b) => {
                            let a_sat = sat.get(&**a).unwrap();
                            let b_sat = sat.get(&**b).unwrap();
                            let mut y = b_sat.clone();
                            loop {
                                trace.push(TraceStep {
                                    step,
                                    kind: "fixpoint-iterate".to_string(),
                                    detail: format!("ER: |Y|={}", y.len()),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                let ex_y = ex(&y, &transitions);
                                let a_or_ex_y: HashSet<_> = a_sat.union(&ex_y).cloned().collect();
                                let y_next: HashSet<_> = y.intersection(&a_or_ex_y).cloned().collect();
                                if y_next == y { break; }
                                y = y_next;
                            }
                            y
                        }
                        _ => HashSet::new(),
                    }
                }
                _ => HashSet::new(),
            };

            trace.push(TraceStep {
                step,
                kind: "label-states".to_string(),
                detail: format!("{} holds in {} states", sub_f, sat_states.len()),
                depth: 0,
                objects: vec![],
            });
            step += 1;

            sat.insert(sub_f.clone(), sat_states);
        }

        let mut holds = false;
        if let Some(init) = &initial_state {
            holds = sat.get(&parsed_formula).unwrap().contains(init);
        } else if !states.is_empty() {
            holds = states.iter().all(|s| sat.get(&parsed_formula).unwrap().contains(s));
        }

        let mut new_facts = Vec::new();
        if !holds {
            if let Formula::AllPaths(inner) = &parsed_formula {
                if let Formula::Eventually(p) = &**inner {
                    if let Some(init) = &initial_state {
                        let af_p_sat = sat.get(&parsed_formula).unwrap();
                        let mut visited = HashSet::new();
                        let mut queue = vec![(init.clone(), vec![init.clone()])];
                        visited.insert(init.clone());
                        let mut found_path = None;

                        while let Some((curr, path)) = queue.pop() {
                            if path.len() > 64 {
                                found_path = Some(path);
                                break;
                            }
                            if let Some(nexts) = transitions.get(&curr) {
                                let mut stuck = true;
                                let mut sorted_nexts: Vec<_> = nexts.iter().collect();
                                sorted_nexts.sort(); // determinism
                                for next in sorted_nexts {
                                    if !af_p_sat.contains(next) {
                                        stuck = false;
                                        if visited.contains(next) {
                                            let mut new_path = path.clone();
                                            new_path.push(next.clone());
                                            found_path = Some(new_path);
                                            break;
                                        } else {
                                            visited.insert(next.clone());
                                            let mut new_path = path.clone();
                                            new_path.push(next.clone());
                                            queue.push((next.clone(), new_path));
                                        }
                                    }
                                }
                                if found_path.is_some() { break; }
                                if stuck {
                                    found_path = Some(path);
                                    break;
                                }
                            } else {
                                found_path = Some(path);
                                break;
                            }
                        }

                        if let Some(path) = found_path {
                            for (i, st) in path.iter().enumerate() {
                                trace.push(TraceStep {
                                    step,
                                    kind: "counterexample-step".to_string(),
                                    detail: format!("path[{}]={}", i, st),
                                    depth: 0,
                                    objects: vec![],
                                });
                                step += 1;
                                new_facts.push(Fact {
                                    key: format!("cex:step:{}", i),
                                    value: st.clone(),
                                });
                            }
                        }
                    }
                }
            }
        }

        trace.push(TraceStep {
            step,
            kind: "decision".to_string(),
            detail: holds.to_string(),
            depth: 0,
            objects: vec![],
        });

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: [&input.facts[..], &new_facts[..]].concat(),
            selected: Some(holds.to_string()),
            explanation: format!("CTL formula evaluated to {}", holds),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        let has_parse = output.inference_trace.iter().any(|t| t.kind == "parse-formula");
        let has_decision = output.inference_trace.iter().any(|t| t.kind == "decision");
        let has_label = output.inference_trace.iter().any(|t| t.kind == "label-states");
        if !has_parse || !has_decision || !has_label {
            return Err("Missing required trace steps (parse-formula, label-states, decision)".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    fn test_input(formula: &str, init: &str, states: &[&str], trans: &[(&str, &str)], labels: &[(&str, &str)]) -> BreedInput {
        let mut facts = vec![
            Fact { key: "ctl:formula".into(), value: formula.into() },
            Fact { key: "ctl:initial".into(), value: init.into() },
        ];
        for s in states {
            facts.push(Fact { key: format!("state:{}", s), value: "".into() });
        }
        for (u, v) in trans {
            facts.push(Fact { key: format!("transition:{}:{}", u, v), value: "".into() });
        }
        for (s, p) in labels {
            facts.push(Fact { key: format!("label:{}:{}", s, p), value: "".into() });
        }
        BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_hidden_oracle_ef_holds_af_fails() {
        let breed = CtlCheck;
        // Novel structure:
        // s0 -> s1
        // s0 -> s2
        // s1 -> s1 (loop, !p)
        // s2 -> s3 (p holds at s3)
        // s3 -> s3
        let input_af = test_input(
            "A F p", "s0", 
            &["s0", "s1", "s2", "s3"],
            &[("s0", "s1"), ("s0", "s2"), ("s1", "s1"), ("s2", "s3"), ("s3", "s3")],
            &[("s3", "p")]
        );
        let out_af = breed.run(&input_af).unwrap();
        assert_eq!(out_af.selected.as_deref(), Some("false"));
        let has_cex = out_af.inference_trace.iter().any(|t| t.kind == "counterexample-step");
        assert!(has_cex);

        let input_ef = test_input(
            "E F p", "s0", 
            &["s0", "s1", "s2", "s3"],
            &[("s0", "s1"), ("s0", "s2"), ("s1", "s1"), ("s2", "s3"), ("s3", "s3")],
            &[("s3", "p")]
        );
        let out_ef = breed.run(&input_ef).unwrap();
        assert_eq!(out_ef.selected.as_deref(), Some("true"));
    }

    #[test]
    fn test_refusal_too_many_states() {
        let breed = CtlCheck;
        let mut facts = vec![Fact { key: "ctl:formula".into(), value: "E F p".into() }];
        for i in 0..65 {
            facts.push(Fact { key: format!("state:{}", i), value: "".into() });
        }
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let err = breed.preconditions(&input).unwrap_err();
        assert!(err.contains("States exceed 64"));
    }

    #[test]
    fn test_paper_grounded_determinism() {
        let breed = CtlCheck;
        let input1 = test_input(
            "A G (p -> A F q)", "s0", 
            &["s0", "s1", "s2"],
            &[("s0", "s1"), ("s1", "s2"), ("s2", "s2")],
            &[("s0", "p"), ("s2", "q")]
        );
        let out1 = breed.run(&input1).unwrap();
        let out2 = breed.run(&input1).unwrap();
        assert_eq!(out1.selected, out2.selected);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }
}
