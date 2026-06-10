use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Discrete Event Calculus Breed
pub struct EventCalculus;

impl CognitionBreed for EventCalculus {
    fn id(&self) -> BreedId {
        BreedId::EventCalculus
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["discrete_event_calculus".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.goals.is_empty() {
            return Err("EVENT-CALCULUS requires at least one holdsat goal".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut happens = Vec::new();
        let mut initiates = BTreeMap::new();
        let mut terminates = BTreeMap::new();
        let mut initially = BTreeSet::new();

        for fact in &input.facts {
            if let Some(val) = fact.key.strip_prefix("ec.happens:") {
                let parts: Vec<&str> = val.split(':').collect();
                if parts.len() == 2 {
                    if let Ok(t) = parts[1].parse::<i32>() {
                        happens.push((parts[0].to_string(), t));
                    }
                }
            } else if let Some(val) = fact.key.strip_prefix("ec.initiates:") {
                let parts: Vec<&str> = val.split(':').collect();
                if parts.len() == 2 {
                    initiates.entry(parts[0].to_string()).or_insert_with(BTreeSet::new).insert(parts[1].to_string());
                }
            } else if let Some(val) = fact.key.strip_prefix("ec.terminates:") {
                let parts: Vec<&str> = val.split(':').collect();
                if parts.len() == 2 {
                    terminates.entry(parts[0].to_string()).or_insert_with(BTreeSet::new).insert(parts[1].to_string());
                }
            } else if let Some(val) = fact.key.strip_prefix("ec.initially:") {
                initially.insert(val.to_string());
            }
        }

        happens.sort_by_key(|(_, t)| *t);

        trace.push(TraceStep {
            step: trace.len(),
            kind: "load-narrative".into(),
            detail: format!("loaded {} happens, {} initially", happens.len(), initially.len()),
            depth: 0,
            objects: vec![],
        });

        let mut results = Vec::new();
        let mut explanations = Vec::new();

        for goal in &input.goals {
            if goal.predicate == "holdsat" {
                if let Ok(query_time) = goal.value.parse::<i32>() {
                    let fluent = &goal.id;
                    
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "evaluate-happens".into(),
                        detail: format!("eval HoldsAt({}, {})", fluent, query_time),
                        depth: 0,
                        objects: vec![],
                    });

                    // clipped(t1, f, t2)
                    let mut clipped = |t1: i32, f: &str, t2: i32| -> bool {
                        let mut is_clipped = false;
                        for (e, t) in &happens {
                            if *t > t1 && *t < t2 {
                                if let Some(terms) = terminates.get(e) {
                                    if terms.contains(f) {
                                        is_clipped = true;
                                        break;
                                    }
                                }
                            }
                        }
                        trace.push(TraceStep {
                            step: trace.len(),
                            kind: "clipped-check".into(),
                            detail: format!("clipped({}, {}, {}) = {}", t1, f, t2, is_clipped),
                            depth: 1,
                            objects: vec![],
                        });
                        is_clipped
                    };

                    let mut holds = false;
                    
                    if initially.contains(fluent) && !clipped(0, fluent, query_time) {
                        holds = true;
                    } else {
                        for (e, t) in happens.iter().rev() {
                            if *t < query_time {
                                if let Some(inits) = initiates.get(e) {
                                    if inits.contains(fluent) && !clipped(*t, fluent, query_time) {
                                        holds = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "holdsat-verdict".into(),
                        detail: format!("HoldsAt({}, {}) = {}", fluent, query_time, holds),
                        depth: 0,
                        objects: vec![],
                    });
                    
                    results.push(holds);
                    explanations.push(format!("HoldsAt({}, {})={}", fluent, query_time, holds));
                }
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "answer".into(),
            detail: format!("results: {:?}", results),
            depth: 0,
            objects: vec![],
        });

        let selected = if results.iter().all(|&x| x) && !results.is_empty() {
            Some("all-hold".to_string())
        } else {
            Some("some-fail".to_string())
        };

        Ok(BreedOutput {
            breed: BreedId::EventCalculus,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation: explanations.join("; "),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if !output.inference_trace.iter().any(|t| t.kind == "answer") {
            return Err("Must output answer".to_string());
        }
        Ok(())
    }
}
