//! SAM: Script Applier Mechanism (Schank & Abelson, "Scripts, Plans, Goals
//! and Understanding", Lawrence Erlbaum, 1977).
//!
//! Built-in script inventory (restaurant, airport) with ordered scenes and a
//! scene→role mapping. Observed story events are supplied as facts:
//! - `sam:event:<i>` value "<scene>" or "<scene>:<actor>"
//!   (processed in ascending numeric order of <i>)
//!
//! Processing: select the script with maximal scene-vocabulary overlap (lex
//! tiebreak); align observed events to the script's scene sequence with a
//! monotone scan (a longest-common-subsequence on the already-ordered story);
//! bind actors to scene roles; infer exactly the unobserved scenes strictly
//! between the first and last matched scene (bounded gap inference — scenes
//! after the last observation are NOT inferred).

use std::collections::BTreeMap;

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};

/// Maximum number of observed events.
const MAX_EVENTS: usize = 64;

/// SAM script-application breed.
pub struct ScriptSam;

struct Script {
    name: &'static str,
    scenes: &'static [&'static str],
    /// role of the default actor in each scene (parallel to scenes)
    roles: &'static [&'static str],
}

/// Built-in script inventory (Schank & Abelson ch. 3 restaurant track,
/// plus an airport track for transfer tests).
const SCRIPTS: &[Script] = &[
    Script {
        name: "airport",
        scenes: &["checkin", "security", "board", "fly", "land"],
        roles: &[
            "passenger",
            "passenger",
            "passenger",
            "passenger",
            "passenger",
        ],
    },
    Script {
        name: "restaurant",
        scenes: &["enter", "order", "eat", "pay", "leave"],
        roles: &["customer", "customer", "customer", "customer", "customer"],
    },
];

fn parse_events(input: &BreedInput) -> Result<Vec<(String, Option<String>)>, String> {
    let mut indexed: Vec<(usize, String, Option<String>)> = Vec::new();
    for f in &input.facts {
        if let Some(i) = f.key.strip_prefix("sam:event:") {
            let idx: usize = i
                .parse()
                .map_err(|_| format!("malformed sam:event index '{}'", i))?;
            let (scene, actor) = match f.value.split_once(':') {
                Some((s, a)) => (s.trim().to_string(), Some(a.trim().to_string())),
                None => (f.value.trim().to_string(), None),
            };
            indexed.push((idx, scene, actor));
        }
    }
    indexed.sort_by_key(|(i, _, _)| *i);
    Ok(indexed.into_iter().map(|(_, s, a)| (s, a)).collect())
}

impl CognitionBreed for ScriptSam {
    fn id(&self) -> BreedId {
        BreedId::ScriptSam
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "script-selection".to_string(),
            "scene-alignment".to_string(),
            "bounded-gap-inference".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let events = parse_events(input)?;
        if events.is_empty() {
            return Err("script_sam requires at least one sam:event:* fact".to_string());
        }
        if events.len() > MAX_EVENTS {
            return Err(format!(
                "event count {} exceeds cap {}",
                events.len(),
                MAX_EVENTS
            ));
        }
        let any_known = events
            .iter()
            .any(|(s, _)| SCRIPTS.iter().any(|sc| sc.scenes.contains(&s.as_str())));
        if !any_known {
            return Err("no observed event matches any known script vocabulary".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let events = parse_events(input).map_err(|m| BreedError {
            breed: BreedId::ScriptSam,
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

        // Script selection: max vocabulary overlap, lex-least name tiebreak.
        let mut best: Option<(&Script, usize)> = None;
        for sc in SCRIPTS {
            let overlap = events
                .iter()
                .filter(|(s, _)| sc.scenes.contains(&s.as_str()))
                .count();
            let better = match best {
                None => true,
                Some((b, bo)) => overlap > bo || (overlap == bo && sc.name < b.name),
            };
            if better {
                best = Some((sc, overlap));
            }
        }
        let (script, overlap) = best.unwrap();
        if overlap == 0 {
            return Err(BreedError {
                breed: BreedId::ScriptSam,
                message: "no script matches the observed events".to_string(),
            });
        }
        tr(
            &mut trace,
            "select-script",
            format!(
                "'{}' (overlap {}/{} events)",
                script.name,
                overlap,
                events.len()
            ),
            0,
        );

        // Monotone alignment: scan scenes left-to-right matching events in order.
        let mut bindings: BTreeMap<String, String> = BTreeMap::new();
        let mut matched: Vec<usize> = Vec::new(); // scene indices, ascending
        let mut scene_cursor = 0usize;
        for (s, actor) in &events {
            if let Some(pos) = script.scenes[scene_cursor..].iter().position(|sc| sc == s) {
                let scene_idx = scene_cursor + pos;
                tr(
                    &mut trace,
                    "align-event",
                    format!("'{}' -> scene {} of '{}'", s, scene_idx, script.name),
                    1,
                );
                if let Some(a) = actor {
                    let role = script.roles[scene_idx].to_string();
                    if !bindings.contains_key(&role) {
                        tr(&mut trace, "bind-role", format!("{} := {}", role, a), 2);
                    }
                    bindings.entry(role).or_insert_with(|| a.clone());
                }
                matched.push(scene_idx);
                scene_cursor = scene_idx + 1;
            } else {
                tr(
                    &mut trace,
                    "align-event",
                    format!("'{}' unmatched (out of script order or unknown)", s),
                    1,
                );
            }
        }
        if matched.is_empty() {
            return Err(BreedError {
                breed: BreedId::ScriptSam,
                message: "no observed event aligned monotonically with the script".to_string(),
            });
        }

        // Gap inference: scenes strictly between first and last matched, unobserved.
        let first = *matched.first().unwrap();
        let last = *matched.last().unwrap();
        let mut inferred: Vec<String> = Vec::new();
        let default_actor = bindings.values().next().cloned();
        for idx in (first + 1)..last {
            if !matched.contains(&idx) {
                let scene = script.scenes[idx].to_string();
                tr(
                    &mut trace,
                    "infer-gap",
                    format!(
                        "scene '{}' inferred (filler: {})",
                        scene,
                        default_actor.as_deref().unwrap_or("unbound")
                    ),
                    1,
                );
                inferred.push(scene);
            }
        }

        tr(
            &mut trace,
            "summary",
            format!(
                "script '{}': {} aligned, {} inferred, {} role binding(s)",
                script.name,
                matched.len(),
                inferred.len(),
                bindings.len()
            ),
            0,
        );

        let mut facts = vec![Fact {
            key: "sam:script".to_string(),
            value: script.name.to_string(),
        }];
        for s in &inferred {
            facts.push(Fact {
                key: format!("sam:inferred:{}", s),
                value: default_actor
                    .clone()
                    .unwrap_or_else(|| "unbound".to_string()),
            });
        }
        for (role, actor) in &bindings {
            facts.push(Fact {
                key: format!("sam:role:{}", role),
                value: actor.clone(),
            });
        }
        facts.push(Fact {
            key: "sam:inferred_count".to_string(),
            value: inferred.len().to_string(),
        });

        Ok(BreedOutput {
            breed: BreedId::ScriptSam,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(script.name.to_string()),
            explanation: format!(
                "SAM applied script '{}': aligned {} events, inferred gap scenes [{}].",
                script.name,
                matched.len(),
                inferred.join(",")
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        tq.require_first("select-script")?;
        tq.require_last("summary")?;
        if !output.facts.iter().any(|f| f.key == "sam:script") {
            return Err("missing sam:script fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.into(),
            value: value.into(),
        }
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "understand story".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// Airport: observing only checkin + fly infers exactly {security, board},
    /// NOT land (bounded inference past the last observation).
    #[test]
    fn airport_bounded_gap_inference() {
        let out = ScriptSam
            .run(&input(vec![
                fact("sam:event:1", "checkin:zara"),
                fact("sam:event:2", "fly:zara"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("airport"));
        let inferred: Vec<&str> = out
            .facts
            .iter()
            .filter_map(|f| f.key.strip_prefix("sam:inferred:"))
            .collect();
        assert_eq!(inferred, vec!["security", "board"]);
        assert!(!inferred.contains(&"land"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "sam:inferred:security" && f.value == "zara"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "sam:role:passenger" && f.value == "zara"));
    }

    /// Restaurant (Schank & Abelson 1977): "John went to a restaurant. He
    /// ordered. He paid and left." → the eating scene is inferred for John.
    #[test]
    fn restaurant_infers_eating() {
        let out = ScriptSam
            .run(&input(vec![
                fact("sam:event:1", "enter:john"),
                fact("sam:event:2", "order:john"),
                fact("sam:event:3", "pay:john"),
                fact("sam:event:4", "leave:john"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("restaurant"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "sam:inferred:eat" && f.value == "john"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "sam:inferred_count" && f.value == "1"));
    }

    #[test]
    fn refuses_unknown_vocabulary() {
        let inp = input(vec![fact("sam:event:1", "teleport:zz")]);
        assert!(ScriptSam.preconditions(&inp).is_err());
    }
}
