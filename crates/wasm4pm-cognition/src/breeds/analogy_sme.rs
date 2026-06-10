use crate::breeds::support::sexpr::Sexpr;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Structure Mapping Engine (SME) analogy breed.
pub struct AnalogySme;

#[derive(Debug, Clone)]
struct LocalMatch {
    b_idx: usize,
    t_idx: usize,
    score: f32,
    bindings: BTreeMap<String, String>,
}

fn match_trees(b: &Sexpr, t: &Sexpr, bindings: &mut BTreeMap<String, String>) -> Option<f32> {
    match (b, t) {
        (Sexpr::Atom(ba), Sexpr::Atom(ta)) => {
            if let Some(existing) = bindings.get(ba) {
                if existing != ta {
                    return None;
                }
            } else if bindings.values().any(|v| v == ta) {
                return None;
            } else {
                bindings.insert(ba.clone(), ta.clone());
            }
            Some(1.0)
        }
        (Sexpr::List(bl), Sexpr::List(tl)) => {
            if bl.is_empty() || tl.is_empty() || bl.len() != tl.len() {
                return None;
            }
            if bl[0] != tl[0] {
                return None;
            }
            let mut child_sum = 0.0;
            for i in 1..bl.len() {
                if let Some(s) = match_trees(&bl[i], &tl[i], bindings) {
                    child_sum += s;
                } else {
                    return None;
                }
            }
            Some(1.0 + child_sum * 2.0)
        }
        _ => None,
    }
}

fn substitute(expr: &Sexpr, bindings: &BTreeMap<String, String>) -> Sexpr {
    match expr {
        Sexpr::Atom(a) => {
            if let Some(t) = bindings.get(a) {
                Sexpr::Atom(t.clone())
            } else {
                Sexpr::Atom(a.clone())
            }
        }
        Sexpr::List(items) => {
            Sexpr::List(items.iter().map(|item| substitute(item, bindings)).collect())
        }
    }
}

impl CognitionBreed for AnalogySme {
    fn id(&self) -> BreedId {
        BreedId::AnalogySme
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "sme_greedy_merge".to_string(),
            "structure_mapping".to_string(),
            "candidate_inferences".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let base_count = input.facts.iter().filter(|f| f.key.starts_with("base:")).count();
        let target_count = input.facts.iter().filter(|f| f.key.starts_with("target:")).count();
        if base_count > 32 || target_count > 32 {
            return Err("AnalogySme bounded to <=32 exprs per side".to_string());
        }
        if base_count == 0 {
            return Err("AnalogySme requires at least one base expression".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_idx = 1;

        let mut bases = Vec::new();
        let mut targets = Vec::new();

        for f in &input.facts {
            if f.key.starts_with("base:") {
                let expr = Sexpr::parse(&f.value)
                    .map_err(|e| BreedError { breed: BreedId::AnalogySme, message: format!("MALFORMED_SEXPR: {}", e) })?;
                bases.push(expr);
            } else if f.key.starts_with("target:") {
                let expr = Sexpr::parse(&f.value)
                    .map_err(|e| BreedError { breed: BreedId::AnalogySme, message: format!("MALFORMED_SEXPR: {}", e) })?;
                targets.push(expr);
            }
        }

        trace.push(TraceStep {
            step: step_idx,
            kind: "parse-expr".to_string(),
            detail: format!("Parsed {} base and {} target expressions", bases.len(), targets.len()),
            depth: 0,
            objects: vec![],
        });
        step_idx += 1;

        let mut local_matches = Vec::new();
        for (b_idx, b) in bases.iter().enumerate() {
            for (t_idx, t) in targets.iter().enumerate() {
                let mut bindings = BTreeMap::new();
                if let Some(score) = match_trees(b, t, &mut bindings) {
                    local_matches.push(LocalMatch {
                        b_idx,
                        t_idx,
                        score,
                        bindings: bindings.clone(),
                    });
                    trace.push(TraceStep {
                        step: step_idx,
                        kind: "local-match".to_string(),
                        detail: format!("Match base {} to target {} score {}", b_idx, t_idx, score),
                        depth: 0,
                        objects: vec![],
                    });
                    step_idx += 1;
                }
            }
        }

        local_matches.sort_by(|a, b| {
            b.score.partial_cmp(&a.score).unwrap()
                .then_with(|| a.b_idx.cmp(&b.b_idx))
                .then_with(|| a.t_idx.cmp(&b.t_idx))
        });

        let mut gmap_bindings = BTreeMap::new();
        let mut gmap_b_idx = BTreeSet::new();
        let mut gmap_t_idx = BTreeSet::new();
        let mut gmap_score = 0.0;

        for m in local_matches {
            if gmap_b_idx.contains(&m.b_idx) || gmap_t_idx.contains(&m.t_idx) {
                continue;
            }
            let mut consistent = true;
            for (k, v) in &m.bindings {
                if let Some(existing) = gmap_bindings.get(k) {
                    if existing != v {
                        consistent = false;
                        break;
                    }
                } else if gmap_bindings.values().any(|ex_v| ex_v == v) {
                    consistent = false;
                    break;
                }
            }
            if consistent {
                for (k, v) in m.bindings {
                    gmap_bindings.insert(k, v);
                }
                gmap_b_idx.insert(m.b_idx);
                gmap_t_idx.insert(m.t_idx);
                gmap_score += m.score;

                trace.push(TraceStep {
                    step: step_idx,
                    kind: "merge-gmap".to_string(),
                    detail: format!("Merged local match {}->{} cumulative score {}", m.b_idx, m.t_idx, gmap_score),
                    depth: 0,
                    objects: vec![],
                });
                step_idx += 1;
            }
        }

        let mut inferences = Vec::new();
        for (b_idx, b) in bases.iter().enumerate() {
            if !gmap_b_idx.contains(&b_idx) {
                let mut shares_atom = false;
                let mut stack = vec![b];
                while let Some(expr) = stack.pop() {
                    match expr {
                        Sexpr::Atom(a) => {
                            if gmap_bindings.contains_key(&a.clone()) {
                                shares_atom = true;
                                break;
                            }
                        }
                        Sexpr::List(items) => {
                            for item in items {
                                stack.push(item);
                            }
                        }
                    }
                }

                if shares_atom {
                    let inf = substitute(&b, &gmap_bindings);
                    let inf_str = inf.to_string();
                    inferences.push(inf_str.clone());
                    trace.push(TraceStep {
                        step: step_idx,
                        kind: "candidate-inference".to_string(),
                        detail: format!("Inferred {}", inf_str),
                        depth: 0,
                        objects: vec![],
                    });
                    step_idx += 1;
                }
            }
        }

        inferences.sort();
        let facts = inferences.iter().enumerate().map(|(i, inf)| Fact {
            key: format!("inference:{}", i),
            value: inf.clone(),
        }).collect();

        trace.push(TraceStep {
            step: step_idx,
            kind: "decision".to_string(),
            detail: format!("Gmap score {}, {} inferences", gmap_score, inferences.len()),
            depth: 0,
            objects: vec![],
        });

        Ok(BreedOutput {
            breed: BreedId::AnalogySme,
            candidates: vec![],
            facts,
            selected: Some(format!("score:{:?}", gmap_score)),
            explanation: format!("SME analogy mapped with score {}", gmap_score),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        let has_decision = output.inference_trace.iter().any(|t| t.kind == "decision");
        if !has_decision {
            return Err("AnalogySme must emit decision step".to_string());
        }
        Ok(())
    }
}
