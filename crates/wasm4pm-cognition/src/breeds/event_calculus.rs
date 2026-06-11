//! Event Calculus (Kowalski & Sergot, "A Logic-based Calculus of Events",
//! New Generation Computing 4(1), 1986) — discrete simplified event calculus.
//!
//! Narrative facts:
//! - `ec:happens:<t>`        value `<action>` — action occurs at integer time t
//! - `ec:initiates:<action>` value `<fluent>` — action initiates fluent
//! - `ec:terminates:<action>` value `<fluent>` — action terminates fluent
//! - `ec:initially`          value `<fluent>` — fluent holds at time 0
//!
//! Queries: goals `{ predicate: "ec:holdsat", value: "<fluent>@<t>" }`.
//!
//! Axioms (discrete EC):
//!   HoldsAt(f,t) ← Initially(f) ∧ ¬Clipped(0,f,t)
//!   HoldsAt(f,t) ← Happens(e,a) ∧ Initiates(a,f) ∧ e < t ∧ ¬Clipped(e,f,t)
//!   Clipped(t1,f,t2) ← Happens(e,a) ∧ Terminates(a,f) ∧ t1 ≤ e < t2
//!
//! Inertia: fluents persist until clipped. O(events² · queries).

use std::collections::BTreeMap;

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};

/// Maximum number of narrative events.
const MAX_EVENTS: usize = 64;

/// Discrete event-calculus breed.
pub struct EventCalculus;

struct Narrative {
    /// sorted (time, action)
    happens: Vec<(i64, String)>,
    /// action → initiated fluents
    initiates: BTreeMap<String, Vec<String>>,
    /// action → terminated fluents
    terminates: BTreeMap<String, Vec<String>>,
    /// fluents holding at time 0
    initially: Vec<String>,
}

fn parse_narrative(input: &BreedInput) -> Result<Narrative, String> {
    let mut n = Narrative {
        happens: vec![],
        initiates: BTreeMap::new(),
        terminates: BTreeMap::new(),
        initially: vec![],
    };
    for f in &input.facts {
        if let Some(t) = f.key.strip_prefix("ec:happens:") {
            let time: i64 = t
                .parse()
                .map_err(|_| format!("malformed ec:happens time '{}'", t))?;
            n.happens.push((time, f.value.trim().to_string()));
        } else if let Some(a) = f.key.strip_prefix("ec:initiates:") {
            n.initiates
                .entry(a.to_string())
                .or_default()
                .push(f.value.trim().to_string());
        } else if let Some(a) = f.key.strip_prefix("ec:terminates:") {
            n.terminates
                .entry(a.to_string())
                .or_default()
                .push(f.value.trim().to_string());
        } else if f.key == "ec:initially" {
            n.initially.push(f.value.trim().to_string());
        }
    }
    n.happens.sort();
    n.initially.sort();
    Ok(n)
}

impl Narrative {
    fn initiates(&self, action: &str, fluent: &str) -> bool {
        self.initiates
            .get(action)
            .map(|v| v.iter().any(|f| f == fluent))
            .unwrap_or(false)
    }

    fn terminates(&self, action: &str, fluent: &str) -> bool {
        self.terminates
            .get(action)
            .map(|v| v.iter().any(|f| f == fluent))
            .unwrap_or(false)
    }

    /// Clipped(t1, f, t2): some terminating event for f in [t1, t2).
    fn clipped(&self, t1: i64, fluent: &str, t2: i64) -> Option<(i64, String)> {
        self.happens
            .iter()
            .find(|(e, a)| *e >= t1 && *e < t2 && self.terminates(a, fluent))
            .cloned()
    }
}

impl CognitionBreed for EventCalculus {
    fn id(&self) -> BreedId {
        BreedId::EventCalculus
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "holdsat-queries".to_string(),
            "inertia".to_string(),
            "clipping".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let n = parse_narrative(input)?;
        if n.happens.is_empty() && n.initially.is_empty() {
            return Err("event_calculus requires a narrative (ec:happens/ec:initially facts)".to_string());
        }
        if n.happens.len() > MAX_EVENTS {
            return Err(format!(
                "event count {} exceeds cap {}",
                n.happens.len(),
                MAX_EVENTS
            ));
        }
        let queries: Vec<&crate::breeds::Goal> = input
            .goals
            .iter()
            .filter(|g| g.predicate == "ec:holdsat")
            .collect();
        if queries.is_empty() {
            return Err("event_calculus requires at least one ec:holdsat query goal".to_string());
        }
        for q in queries {
            let ok = q
                .value
                .split_once('@')
                .map(|(f, t)| !f.is_empty() && t.parse::<i64>().is_ok())
                .unwrap_or(false);
            if !ok {
                return Err(format!(
                    "malformed ec:holdsat query '{}' (need fluent@time)",
                    q.value
                ));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let n = parse_narrative(input).map_err(|m| BreedError {
            breed: BreedId::EventCalculus,
            message: m,
        })?;

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut step = 0usize;
        let mut tr = |trace: &mut Vec<TraceStep>, kind: &str, detail: String, depth: u32| {
            trace.push(TraceStep {
                step,
                kind: kind.to_string(),
                detail,
                depth,
                objects: vec![],
            });
            step += 1;
        };

        tr(
            &mut trace,
            "ec-load",
            format!(
                "{} events, {} initially-fluents",
                n.happens.len(),
                n.initially.len()
            ),
            0,
        );

        let mut facts: Vec<Fact> = Vec::new();
        let mut verdicts: Vec<String> = Vec::new();
        for q in input.goals.iter().filter(|g| g.predicate == "ec:holdsat") {
            let (fluent, t_str) = q.value.split_once('@').unwrap();
            let t: i64 = t_str.parse().unwrap();

            let mut holds = false;
            // Axiom 1: Initially(f) ∧ ¬Clipped(0,f,t)
            if n.initially.iter().any(|f| f == fluent) {
                match n.clipped(0, fluent, t) {
                    None => {
                        tr(
                            &mut trace,
                            "ec-infer",
                            format!("Clipped(0,{},{}) = false (initial persistence)", fluent, t),
                            1,
                        );
                        holds = true;
                    }
                    Some((e, a)) => {
                        tr(
                            &mut trace,
                            "ec-infer",
                            format!("Clipped(0,{},{}) = true (by '{}'@{})", fluent, t, a, e),
                            1,
                        );
                    }
                }
            }
            // Axiom 2: latest initiating event before t, unclipped since.
            if !holds {
                for (e, a) in n.happens.iter().filter(|(e, _)| *e < t) {
                    if !n.initiates(a, fluent) {
                        continue;
                    }
                    tr(
                        &mut trace,
                        "ec-infer",
                        format!("Happens({},{}) initiates {}", a, e, fluent),
                        1,
                    );
                    match n.clipped(*e, fluent, t) {
                        None => {
                            tr(
                                &mut trace,
                                "ec-infer",
                                format!("Clipped({},{},{}) = false (inertia)", e, fluent, t),
                                2,
                            );
                            holds = true;
                        }
                        Some((ce, ca)) => {
                            tr(
                                &mut trace,
                                "ec-infer",
                                format!("Clipped({},{},{}) = true (by '{}'@{})", e, fluent, t, ca, ce),
                                2,
                            );
                        }
                    }
                }
            }

            tr(
                &mut trace,
                "ec-infer",
                format!("HoldsAt({},{}) = {}", fluent, t, holds),
                0,
            );
            facts.push(Fact {
                key: format!("ec:verdict:{}@{}", fluent, t),
                value: holds.to_string(),
            });
            verdicts.push(format!("{}@{}={}", fluent, t, holds));
        }

        tr(&mut trace, "ec-model", format!("{} verdict(s)", verdicts.len()), 0);

        Ok(BreedOutput {
            breed: BreedId::EventCalculus,
            candidates: input.candidates.clone(),
            facts,
            selected: verdicts.first().cloned(),
            explanation: format!(
                "Discrete event calculus over {} events: {}",
                n.happens.len(),
                verdicts.join("; ")
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        tq.require_first("ec-load")?;
        tq.require_last("ec-model")?;
        if !output.facts.iter().any(|f| f.key.starts_with("ec:verdict:")) {
            return Err("missing ec:verdict fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Goal;

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.into(),
            value: value.into(),
        }
    }

    fn input(facts: Vec<Fact>, queries: Vec<&str>) -> BreedInput {
        BreedInput {
            intent: "narrative".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: queries
                .into_iter()
                .enumerate()
                .map(|(i, q)| Goal {
                    id: format!("q{}", i),
                    predicate: "ec:holdsat".into(),
                    value: q.into(),
                })
                .collect(),
            state: vec![],
        }
    }

    /// Light on@2 / off@5 / on@7: inertia at 4, clipped at 6, re-initiated at 9.
    #[test]
    fn light_switch_inertia_and_clipping() {
        let facts = vec![
            fact("ec:happens:2", "switch_on"),
            fact("ec:happens:5", "switch_off"),
            fact("ec:happens:7", "switch_on"),
            fact("ec:initiates:switch_on", "on"),
            fact("ec:terminates:switch_off", "on"),
        ];
        let out = EventCalculus
            .run(&input(facts, vec!["on@4", "on@6", "on@9"]))
            .unwrap();
        let v = |k: &str| {
            out.facts
                .iter()
                .find(|f| f.key == k)
                .map(|f| f.value.clone())
                .unwrap()
        };
        assert_eq!(v("ec:verdict:on@4"), "true");
        assert_eq!(v("ec:verdict:on@6"), "false");
        assert_eq!(v("ec:verdict:on@9"), "true");
    }

    /// Initially-fluent persists until clipped.
    #[test]
    fn initially_persists() {
        let facts = vec![
            fact("ec:initially", "alive"),
            fact("ec:happens:3", "shoot"),
            fact("ec:terminates:shoot", "alive"),
        ];
        let out = EventCalculus
            .run(&input(facts, vec!["alive@2", "alive@5"]))
            .unwrap();
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "ec:verdict:alive@2" && f.value == "true"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "ec:verdict:alive@5" && f.value == "false"));
    }

    #[test]
    fn refuses_without_query() {
        let facts = vec![fact("ec:initially", "on")];
        assert!(EventCalculus.preconditions(&input(facts, vec![])).is_err());
    }
}
