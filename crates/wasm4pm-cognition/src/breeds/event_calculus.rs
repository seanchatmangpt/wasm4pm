//! Discrete Event Calculus (EC) solver (Kowalski 1986).
//!
//! Steps: `ec-load`, `ec-infer`, `ec-model`.
//! Supports initially, happens, initiates, terminates in facts and rules.

use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep};
use std::collections::{BTreeMap, BTreeSet};

/// Event Calculus Solver
pub struct EventCalculus;

impl CognitionBreed for EventCalculus {
    fn id(&self) -> BreedId {
        BreedId::EventCalculus
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "reasoning".to_string(),
            "event_calculus".to_string(),
            "temporal".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        // Must have at least some initially state or event declaration.
        // Two key conventions are supported:
        //   historical: key == "initially" / "happens" (comma-separated value)
        //   canonical (Kowalski-Sergot fixture): "ec:initially" / "ec:happens:<time>"
        let has_initially = input
            .facts
            .iter()
            .any(|f| f.key == "initially" || f.key == "ec:initially");
        let has_happens = input
            .facts
            .iter()
            .any(|f| f.key == "happens" || f.key.starts_with("ec:happens"));
        if !has_initially && !has_happens {
            return Err("Event Calculus requires initially facts or happens events".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        // 1. ec-load phase
        let mut initially = BTreeSet::new();
        let mut happens: BTreeMap<usize, Vec<String>> = BTreeMap::new(); // time -> Vec<event>
        let mut initiates = BTreeSet::new(); // (event, fluent)
        let mut terminates = BTreeSet::new(); // (event, fluent)
        let mut all_fluents = BTreeSet::new();

        for fact in &input.facts {
            // --- canonical `ec:` key convention (Kowalski-Sergot fixture) ---
            // ec:happens:<time> -> value=<event>
            // ec:initiates:<event> -> value=<fluent>
            // ec:terminates:<event> -> value=<fluent>
            // ec:initially -> value=<fluent>
            if let Some(time_str) = fact.key.strip_prefix("ec:happens:") {
                if let Ok(time) = time_str.trim().parse::<usize>() {
                    happens
                        .entry(time)
                        .or_default()
                        .push(fact.value.trim().to_string());
                }
            } else if let Some(event) = fact.key.strip_prefix("ec:initiates:") {
                let fluent = fact.value.trim().to_string();
                initiates.insert((event.trim().to_string(), fluent.clone()));
                all_fluents.insert(fluent);
            } else if let Some(event) = fact.key.strip_prefix("ec:terminates:") {
                let fluent = fact.value.trim().to_string();
                terminates.insert((event.trim().to_string(), fluent.clone()));
                all_fluents.insert(fluent);
            } else if fact.key == "ec:initially" {
                initially.insert(fact.value.trim().to_string());
                all_fluents.insert(fact.value.trim().to_string());
            // --- historical comma-separated value convention ---
            } else if fact.key == "initially" {
                initially.insert(fact.value.clone());
                all_fluents.insert(fact.value.clone());
            } else if fact.key == "happens" {
                if let Some(comma) = fact.value.find(',') {
                    let event = fact.value[..comma].trim().to_string();
                    if let Ok(time) = fact.value[comma + 1..].trim().parse::<usize>() {
                        happens.entry(time).or_default().push(event);
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

        // Parse HoldsAt goals: predicate "ec:holdsat", value "<fluent>@<time>".
        let mut queries: Vec<(String, String, usize)> = Vec::new(); // (goal_id, fluent, time)
        for goal in &input.goals {
            if goal.predicate == "ec:holdsat" {
                if let Some(at) = goal.value.rfind('@') {
                    let fluent = goal.value[..at].trim().to_string();
                    if let Ok(time) = goal.value[at + 1..].trim().parse::<usize>() {
                        all_fluents.insert(fluent.clone());
                        queries.push((goal.id.clone(), fluent, time));
                    }
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

        // Determine max time to run: cover the last event AND every queried time point,
        // so HoldsAt(fluent@t) can be answered by the persistence (inertia) timeline.
        let max_happens_time = happens.keys().max().cloned().unwrap_or(0);
        let max_query_time = queries.iter().map(|(_, _, t)| *t).max().unwrap_or(0);
        let max_time = max_happens_time.max(max_query_time) + 1;

        let mut holds = vec![BTreeSet::new(); max_time + 1];
        holds[0] = initially.clone();

        // 2. ec-infer phase
        for t in 0..max_time {
            let events_at_t = happens.get(&t).cloned().unwrap_or_default();
            let mut initiated_at_t = BTreeSet::new();
            let mut terminated_at_t = BTreeSet::new();

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
            let mut next_holds = BTreeSet::new();
            for f in &all_fluents {
                if initiated_at_t.contains(f) {
                    next_holds.insert(f.clone());
                } else if holds[t].contains(f) && !terminated_at_t.contains(f) {
                    next_holds.insert(f.clone());
                }
            }
            holds[t + 1] = next_holds;

            // Holds set rendered as a `;`-separated list so consumers can parse the full
            // (possibly multi-fluent) state without ambiguity against the `,` field separator.
            let holds_list = holds[t]
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .join(";");
            trace.push(TraceStep {
                step: trace.len(),
                kind: "ec-infer".to_string(),
                detail: format!(
                    "t={}: holds=[{}], happens={:?}, initiates={:?}, terminates={:?}",
                    t, holds_list, events_at_t, initiated_at_t, terminated_at_t
                ),
                depth: 0,
                objects: vec![],
            });
        }

        // 2b. ec-verdict phase: answer each HoldsAt(fluent@time) query against the
        // computed inertia timeline. This is the per-query surface the paper asks for.
        let mut verdicts: BTreeMap<String, bool> = BTreeMap::new();
        for (goal_id, fluent, time) in &queries {
            let holds_at = holds
                .get(*time)
                .map(|s| s.contains(fluent))
                .unwrap_or(false);
            verdicts.insert(format!("ec:verdict:{}@{}", fluent, time), holds_at);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "ec-verdict".to_string(),
                detail: format!("{}: HoldsAt({}@{}) = {}", goal_id, fluent, time, holds_at),
                depth: 0,
                objects: vec![],
            });
        }

        // 3. ec-model phase
        let final_holds = &holds[max_time];

        let explanation = format!(
            "Event Calculus model computed at t={}: holds={:?}; verdicts={:?}",
            max_time, final_holds, verdicts
        );

        trace.push(TraceStep {
            step: trace.len(),
            kind: "ec-model".to_string(),
            detail: explanation.clone(),
            depth: 0,
            objects: vec![],
        });

        // `selected` exposes per-query verdicts when queries are present, else final holds.
        let selected = if verdicts.is_empty() {
            Some(final_holds.iter().map(String::as_str).collect::<Vec<_>>().join(","))
        } else {
            Some(
                verdicts
                    .iter()
                    .map(|(k, v)| format!("{}={}", k, v))
                    .collect::<Vec<_>>()
                    .join(","),
            )
        };

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
        let kinds: BTreeSet<_> = output
            .inference_trace
            .iter()
            .map(|t| t.kind.clone())
            .collect();
        if !kinds.contains("ec-load") || !kinds.contains("ec-model") {
            return Err("Event Calculus trace missing required kinds".to_string());
        }
        Ok(())
    }
}
