use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Abductive Inference to Best Explanation Breed
pub struct AbductiveIbe;

impl CognitionBreed for AbductiveIbe {
    fn id(&self) -> BreedId {
        BreedId::AbductiveIbe
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["inference_to_best_explanation".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let obs_count = input.facts.iter().filter(|f| f.key.starts_with("observation:")).count();
        let hyp_count = input.facts.iter().filter(|f| f.key.starts_with("hyp:")).count();
        if obs_count == 0 {
            return Err("ABDUCTIVE-IBE requires at least one observation".to_string());
        }
        if hyp_count == 0 {
            return Err("ABDUCTIVE-IBE requires at least one hypothesis".to_string());
        }
        if hyp_count > 10 {
            return Err("ABDUCTIVE-IBE capped at 10 hypotheses".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut observations = BTreeSet::new();
        let mut hyps = BTreeMap::new();
        let mut explains = BTreeMap::new();

        for fact in &input.facts {
            if let Some(obs) = fact.key.strip_prefix("observation:") {
                observations.insert(obs.to_string());
            } else if let Some(hyp) = fact.key.strip_prefix("hyp:") {
                if let Ok(cost) = fact.value.parse::<f32>() {
                    hyps.insert(hyp.to_string(), cost);
                }
            } else if let Some(hyp_obs) = fact.key.strip_prefix("explains:") {
                let parts: Vec<&str> = hyp_obs.split(':').collect();
                if parts.len() == 2 {
                    let hyp = parts[0].to_string();
                    let obs = parts[1].to_string();
                    explains.entry(hyp).or_insert_with(BTreeSet::new).insert(obs);
                }
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "collect-observations".into(),
            detail: format!("found {} observations", observations.len()),
            depth: 0,
            objects: vec![],
        });

        let mut best_score = f32::NEG_INFINITY;
        let mut best_hyps: Vec<String> = Vec::new();

        let hyp_names: Vec<String> = hyps.keys().cloned().collect();
        let mut candidates = Vec::new();

        // Singletons
        for h in &hyp_names {
            candidates.push(vec![h.clone()]);
        }
        // Pairs
        for i in 0..hyp_names.len() {
            for j in (i + 1)..hyp_names.len() {
                candidates.push(vec![hyp_names[i].clone(), hyp_names[j].clone()]);
            }
        }

        for mut hyp_set in candidates {
            hyp_set.sort();
            let mut covered = BTreeSet::new();
            let mut total_cost = 0.0;
            for h in &hyp_set {
                if let Some(obs_set) = explains.get(h) {
                    for o in obs_set {
                        if observations.contains(o) {
                            covered.insert(o.clone());
                        }
                    }
                }
                total_cost += hyps.get(h).unwrap_or(&0.0);
            }

            let coverage_val = covered.len() as f32;
            let score = coverage_val - 0.1 * total_cost;

            trace.push(TraceStep {
                step: trace.len(),
                kind: "score-hypothesis".into(),
                detail: format!("set {:?} score {}", hyp_set, score),
                depth: 0,
                objects: vec![],
            });

            trace.push(TraceStep {
                step: trace.len(),
                kind: "compare".into(),
                detail: format!("compare {} vs {}", score, best_score),
                depth: 0,
                objects: vec![],
            });

            if score > best_score {
                best_score = score;
                best_hyps = hyp_set;
            } else if (score - best_score).abs() < 1e-6 {
                let current_str = hyp_set.join(",");
                let best_str = best_hyps.join(",");
                if current_str < best_str {
                    best_hyps = hyp_set;
                }
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "best-explanation".into(),
            detail: format!("best: {:?} score {}", best_hyps, best_score),
            depth: 0,
            objects: vec![],
        });

        let explanation = format!("IBE selected {:?} with score {}", best_hyps, best_score);
        let selected = if best_hyps.is_empty() { None } else { Some(best_hyps.join(",")) };

        Ok(BreedOutput {
            breed: BreedId::AbductiveIbe,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if !output.inference_trace.iter().any(|t| t.kind == "best-explanation") {
            return Err("Must output best-explanation".to_string());
        }
        Ok(())
    }
}
