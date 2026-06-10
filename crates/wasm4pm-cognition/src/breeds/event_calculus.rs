//! Discrete Event Calculus (EC) solver (Kowalski 1986).
//!
//! Steps: `ec-load`, `ec-infer`, `ec-model`.
//! Supports initially, happens, initiates, terminates in facts and rules.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, Rule, TraceStep,
};
use std::collections::{HashMap, HashSet};

/// Event Calculus Solver
pub struct EventCalculus;

impl CognitionBreed for EventCalculus {
    fn id(&self) -> BreedId {
        BreedId::EventCalculus
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["reasoning".to_string(), "event_calculus".to_string(), "temporal".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        // Must have at least some initially state or event declaration
        let has_initially = input.facts.iter().any(|f| f.key == "initially");
        let has_happens = input.facts.iter().any(|f| f.key == "happens");
        if !has_initially && !has_happens {
            return Err("Event Calculus requires initially facts or happens events".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        // 1. ec-load phase
        let mut initially = HashSet::new();
        let mut happens = HashMap::new(); // time -> Vec<event>
        let mut initiates = HashSet::new(); // (event, fluent)
        let mut terminates = HashSet::new(); // (event, fluent)
        let mut all_fluents = HashSet::new();

        for fact in &input.facts {
            if fact.key == "initially" {
                initially.insert(fact.value.clone());
                all_fluents.insert(fact.value.clone());
            } else if fact.key == "happens" {
                if let Some(comma) = fact.value.find(',') {
                    let event = fact.value[..comma].trim().to_string();
                    if let Ok(time) = fact.value[comma + 1..].trim().parse::<usize>() {
                        happens.entry(time).or_insert_with(Vec::new).push(event);
                    }
                }
            } else if fact.key == "initiates" {
                if let Some(comma) = fact.value.find(',') {
                    let event = fact.value[..comma].trim().to_string();
                    let fluent = fact.value[comma + 1..].trim().to_string();
                    initiates.insert((event, fluent.clone()));
                    all_fluents.insert(fluent);
                }
            } else if fact.key == "terminates" {
                if let Some(comma) = fact.value.find(',') {
                    let event = fact.value[..comma].trim().to_string();
                    let fluent = fact.value[comma + 1..].trim().to_string();
                    terminates.insert((event, fluent.clone()));
                    all_fluents.insert(fluent);
                }
            }
        }

        // Also extract fluents from rules
        for rule in &input.rules {
            if rule.conclusion.starts_with("initiates=") {
                let fluent = rule.conclusion["initiates=".len()..].trim().to_string();
                all_fluents.insert(fluent);
            } else if rule.conclusion.starts_with("terminates=") {
                let fluent = rule.conclusion["terminates=".len()..].trim().to_string();
                all_fluents.insert(fluent);
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "ec-load".to_string(),
            detail: format!(
                "Loaded: initially={:?}, happens_steps={}, initiates_rules={}",
                initially,
                happens.len(),
                initiates.len() + terminates.len()
            ),
            depth: 0,
            objects: vec![],
        });

        // Determine max time to run
        let max_happens_time = happens.keys().max().cloned().unwrap_or(0);
        let max_time = max_happens_time + 1;

        let mut holds = vec![HashSet::new(); max_time + 1];
        holds[0] = initially.clone();

        // 2. ec-infer phase
        for t in 0..max_time {
            let events_at_t = happens.get(&t).cloned().unwrap_or_default();
            let mut initiated_at_t = HashSet::new();
            let mut terminated_at_t = HashSet::new();

            // Fact-based transitions
            for e in &events_at_t {
                for (init_e, init_f) in &initiates {
                    if init_e == e {
                        initiated_at_t.insert(init_f.clone());
                    }
                }
                for (term_e, term_f) in &terminates {
                    if term_e == e {
                        terminated_at_t.insert(term_f.clone());
                    }
                }
            }

            // Rule-based transitions
            for rule in &input.rules {
                let premise_ok = rule.premise.iter().all(|p| {
                    if p.starts_with("happens=") {
                        let ev = p["happens=".len()..].trim();
                        events_at_t.iter().any(|e| e == ev)
                    } else if p.starts_with("holds=") {
                        let fl = p["holds=".len()..].trim();
                        holds[t].contains(fl)
                    } else {
                        // fallback: treat as fluent hold check
                        holds[t].contains(p)
                    }
                });

                if premise_ok {
                    if rule.conclusion.starts_with("initiates=") {
                        let f = rule.conclusion["initiates=".len()..].trim().to_string();
                        initiated_at_t.insert(f);
                    } else if rule.conclusion.starts_with("terminates=") {
                        let f = rule.conclusion["terminates=".len()..].trim().to_string();
                        terminated_at_t.insert(f);
                    }
                }
            }

            // Next step holds:
            let mut next_holds = HashSet::new();
            for f in &all_fluents {
                if initiated_at_t.contains(f) {
                    next_holds.insert(f.clone());
                } else if holds[t].contains(f) && !terminated_at_t.contains(f) {
                    next_holds.insert(f.clone());
                }
            }
            holds[t + 1] = next_holds;

            trace.push(TraceStep {
                step: trace.len(),
                kind: "ec-infer".to_string(),
                detail: format!(
                    "t={}: holds={:?}, happens={:?}, initiates={:?}, terminates={:?}",
                    t, holds[t], events_at_t, initiated_at_t, terminated_at_t
                ),
                depth: 0,
                objects: vec![],
            });
        }

        // 3. ec-model phase
        let final_holds = &holds[max_time];
        let mut final_holds_vec: Vec<String> = final_holds.iter().cloned().collect();
        final_holds_vec.sort();

        let explanation = format!(
            "Event Calculus model computed at t={}: holds={:?}",
            max_time, final_holds_vec
        );

        trace.push(TraceStep {
            step: trace.len(),
            kind: "ec-model".to_string(),
            detail: explanation.clone(),
            depth: 0,
            objects: vec![],
        });

        let selected = Some(final_holds_vec.join(","));

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Event Calculus must record inference steps".to_string());
        }
        let kinds: HashSet<_> = output.inference_trace.iter().map(|t| t.kind.clone()).collect();
        if !kinds.contains("ec-load") || !kinds.contains("ec-model") {
            return Err("Event Calculus trace missing required kinds".to_string());
        }
        Ok(())
    }
}
