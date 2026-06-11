//! Frame-based inheritance — Minsky 1974.
//!
//! Slot resolution walks the isa-chain from the queried frame upward; at each
//! frame an OWN slot value is preferred over a DEFAULT slot value, and the
//! nearest frame on the chain wins (inferential distance: a child's value
//! overrides any ancestor default). Cycles in the isa-chain are a run error.
//!
//! Input contract:
//! - intent = `"resolve <frame> <slot>"`,
//! - facts `frame:<F>:isa` = parent frame,
//! - facts `frame:<F>:slot:<s>` = own value,
//! - facts `frame:<F>:slot:<s>:default` = default value.
//!
//! Trace kinds: `frame-load`(1,1) → `frame-walk`(1,*) → `frame-resolve`(1,1)
//! (the resolve step is emitted even when the slot is unresolved, with an
//! `unresolved` detail, so the lifecycle is always complete).

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};
use crate::breeds::support::trace_query::TraceQuery;

/// Minsky frame-inheritance breed (module name avoids collision with
/// `frame.rs`, which is ELIZA).
pub struct FramesInheritance;

impl CognitionBreed for FramesInheritance {
    fn id(&self) -> BreedId {
        BreedId::FramesInheritance
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "frame_inheritance".to_string(),
            "slot_resolution".to_string(),
            "inferential_distance".to_string(),
            "cycle_detection".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let parts: Vec<&str> = input.intent.split_whitespace().collect();
        if parts.len() != 3 || parts[0] != "resolve" {
            return Err("intent must be 'resolve <frame> <slot>'".to_string());
        }
        if !input.facts.iter().any(|f| f.key.starts_with("frame:")) {
            return Err("frames_inheritance requires at least one frame: fact".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |message: String| BreedError {
            breed: BreedId::FramesInheritance,
            message,
        };
        let parts: Vec<&str> = input.intent.split_whitespace().collect();
        if parts.len() != 3 || parts[0] != "resolve" {
            return Err(err("intent must be 'resolve <frame> <slot>'".to_string()));
        }
        let target_frame = parts[1].to_string();
        let target_slot = parts[2].to_string();

        let mut isa_map: BTreeMap<String, String> = BTreeMap::new();
        let mut own_slots: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
        let mut default_slots: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
        let mut frames: BTreeSet<String> = BTreeSet::new();

        for fact in &input.facts {
            let key_parts: Vec<&str> = fact.key.split(':').collect();
            if key_parts.first() != Some(&"frame") {
                continue;
            }
            match key_parts.as_slice() {
                ["frame", f, "isa"] => {
                    isa_map.insert(f.to_string(), fact.value.clone());
                    frames.insert(f.to_string());
                    frames.insert(fact.value.clone());
                }
                ["frame", f, "slot", s] => {
                    own_slots
                        .entry(f.to_string())
                        .or_default()
                        .insert(s.to_string(), fact.value.clone());
                    frames.insert(f.to_string());
                }
                ["frame", f, "slot", s, "default"] => {
                    default_slots
                        .entry(f.to_string())
                        .or_default()
                        .insert(s.to_string(), fact.value.clone());
                    frames.insert(f.to_string());
                }
                _ => {
                    return Err(err(format!("malformed frame fact key '{}'", fact.key)));
                }
            }
        }

        let mut trace = Vec::new();
        trace.push(TraceStep {
            step: 0,
            kind: "frame-load".to_string(),
            detail: format!(
                "loaded {} frames ({} isa links)",
                frames.len(),
                isa_map.len()
            ),
            depth: 0,
            objects: vec![],
        });

        // isa-chain walk with cycle detection; own slot beats default at each
        // frame; the nearest frame wins (inferential distance).
        let mut current_frame = target_frame.clone();
        let mut visited: BTreeSet<String> = BTreeSet::new();
        let mut result: Option<(String, String, &'static str)> = None;
        let mut distance: u32 = 0;

        loop {
            if !visited.insert(current_frame.clone()) {
                return Err(err(format!("isa cycle detected at {}", current_frame)));
            }
            trace.push(TraceStep {
                step: trace.len(),
                kind: "frame-walk".to_string(),
                detail: format!("walking {}", current_frame),
                depth: distance,
                objects: vec![("frame".to_string(), current_frame.clone())],
            });
            if let Some(val) = own_slots
                .get(&current_frame)
                .and_then(|s| s.get(&target_slot))
            {
                result = Some((val.clone(), current_frame.clone(), "own"));
                break;
            }
            if let Some(val) = default_slots
                .get(&current_frame)
                .and_then(|s| s.get(&target_slot))
            {
                result = Some((val.clone(), current_frame.clone(), "default"));
                break;
            }
            match isa_map.get(&current_frame) {
                Some(parent) => {
                    current_frame = parent.clone();
                    distance += 1;
                }
                None => break,
            }
        }

        let (selected, explanation, out_facts, resolve_detail) = match result {
            Some((val, found_frame, kind)) => (
                Some(val.clone()),
                format!(
                    "resolved {}.{} = {} at {} ({}, distance {})",
                    target_frame, target_slot, val, found_frame, kind, distance
                ),
                vec![Fact {
                    key: format!("frame:resolved:{}:{}", target_frame, target_slot),
                    value: val.clone(),
                }],
                format!(
                    "{} slot {} resolved to {} at {} ({})",
                    target_frame, target_slot, val, found_frame, kind
                ),
            ),
            None => (
                None,
                format!("could not resolve {}.{}", target_frame, target_slot),
                vec![],
                format!("{} slot {} unresolved", target_frame, target_slot),
            ),
        };

        trace.push(TraceStep {
            step: trace.len(),
            kind: "frame-resolve".to_string(),
            detail: resolve_detail,
            depth: distance,
            objects: vec![("decision".to_string(), "resolve".to_string())],
        });

        Ok(BreedOutput {
            breed: BreedId::FramesInheritance,
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["frame-walk"])?;
        if output
            .inference_trace
            .iter()
            .filter(|t| t.kind == "frame-resolve")
            .count()
            != 1
        {
            return Err("trace must contain exactly one frame-resolve step".to_string());
        }
        Ok(())
    }
}
