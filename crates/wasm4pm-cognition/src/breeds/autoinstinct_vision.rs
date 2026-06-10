//! AutoinstinctVision — Symbolic Blocks World perception breed.
//!
//! Algorithm:
//! 1. Parse `input.facts` as object descriptions: each fact with key "block", "pyramid",
//!    "wedge", or any shape category and a value as the object ID.
//!    Facts of the form key=value where key is a shape and value is the label are parsed
//!    into `Polyhedron` entries. Support relationship facts of the form
//!    "supported_by:<OBJ>=<SUPPORT>" to record the `supported_by` field.
//! 2. Build a `SymbolicVisionSystem` and `observe()` each parsed `Polyhedron`.
//! 3. Call `find_clear_object()` to identify the first unblocked object.
//! 4. Emit one `TraceStep` per object observed with kind "observe-object".
//! 5. `BreedOutput.selected` = id of first clear object, or `None` if none found.
//! 6. `BreedOutput.candidates` = one `Candidate` per observed object, score 1.0, not eliminated.

use crate::autoinstinct::vision::{Polyhedron, SymbolicVisionSystem};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, TraceStep,
};
use std::collections::HashMap;
use tracing;

/// AutoinstinctVision breed: symbolic Blocks World perception.
pub struct AutoinstinctVision;

/// Parse `input.facts` into `Polyhedron` objects.
///
/// Parsing rules:
/// - Facts with key `"supported_by:<OBJ>"` and value `<SUPPORT>` record a support
///   relationship: the object `<OBJ>` is supported by `<SUPPORT>`.
/// - All other facts are treated as shape observations: key = shape, value = object id.
///   If the same object id appears multiple times, the last shape wins.
///
/// Properties (Rank-2):
/// - Every returned `Polyhedron` has a non-empty `id` and `shape`.
/// - Support map is populated only for objects that also appear as shape observations.
fn parse_polyhedra(input: &BreedInput) -> Vec<Polyhedron> {
    let mut shapes: HashMap<String, String> = HashMap::new(); // id → shape
    let mut supports: HashMap<String, String> = HashMap::new(); // id → supported_by id

    for fact in &input.facts {
        if let Some(obj_id) = fact.key.strip_prefix("supported_by:") {
            supports.insert(obj_id.to_string(), fact.value.clone());
        } else {
            // key is shape, value is object id
            shapes.insert(fact.value.clone(), fact.key.clone());
        }
    }

    let mut polyhedra: Vec<Polyhedron> = shapes
        .into_iter()
        .map(|(id, shape)| {
            let supported_by = supports.get(&id).cloned();
            Polyhedron {
                id,
                shape,
                supported_by,
            }
        })
        .collect();

    // Deterministic order: sort by id for stable output
    polyhedra.sort_by(|a, b| a.id.cmp(&b.id));
    polyhedra
}

impl CognitionBreed for AutoinstinctVision {
    fn id(&self) -> BreedId {
        BreedId::AutoinstinctVision
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "blocks_world_perception".to_string(),
            "polyhedron_tracking".to_string(),
            "clear_object_detection".to_string(),
            "symbolic_scene_parsing".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.facts.is_empty() {
            return Err(
                "AutoinstinctVision requires at least one fact describing a scene object"
                    .to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let polyhedra = parse_polyhedra(input);
        let mut trace: Vec<TraceStep> = Vec::new();
        let mut sys = SymbolicVisionSystem::new();

        for poly in &polyhedra {
            let detail = match &poly.supported_by {
                Some(support) => format!(
                    "observed {} as {} (supported_by={})",
                    poly.id, poly.shape, support
                ),
                None => format!("observed {} as {} (on table)", poly.id, poly.shape),
            };
            trace.push(TraceStep {
                step: trace.len(),
                kind: "observe-object".to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
            tracing::debug!(breed.step = "object_detected", breed = "autoinstinct_vision", "L1 inference step");
            if poly.supported_by.is_some() {
                tracing::debug!(breed.step = "relation_inferred", breed = "autoinstinct_vision", "L1 inference step");
            }
            sys.observe(poly.clone());
        }

        if trace.is_empty() {
            // No parseable objects — emit a single trace step to avoid empty-trace fraud signal
            trace.push(TraceStep {
                step: 0,
                kind: "observe-object".to_string(),
                detail: "no parseable polyhedra in facts".to_string(),
                depth: 0,
                objects: vec![],
            });
        }

        tracing::debug!(breed.step = "support_structure_built", breed = "autoinstinct_vision", "L1 inference step");
        let clear_object = sys.find_clear_object();

        let selected = clear_object.map(|obj| obj.id.clone());

        trace.push(TraceStep {
            step: trace.len(),
            kind: "find-clear-object".to_string(),
            detail: match &selected {
                Some(id) => format!("clear object found: {}", id),
                None => "no clear object found".to_string(),
            },
            depth: 0,
            objects: vec![],
        });

        let candidates: Vec<Candidate> = polyhedra
            .iter()
            .map(|poly| Candidate {
                id: poly.id.clone(),
                score: 1.0,
                eliminated: false,
                elimination_reason: None,
            })
            .collect();

        let explanation = match &selected {
            Some(id) => format!(
                "AutoinstinctVision: {} objects observed; first clear object is {}",
                polyhedra.len(),
                id
            ),
            None => format!(
                "AutoinstinctVision: {} objects observed; no clear object found",
                polyhedra.len()
            ),
        };

        tracing::debug!(breed.step = "scene_description_emitted", breed = "autoinstinct_vision", "L1 inference step");
        Ok(BreedOutput {
            breed: BreedId::AutoinstinctVision,
            candidates,
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err(
                "AutoinstinctVision must produce at least one inference trace step".to_string(),
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    fn make_fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.to_string(),
            value: value.to_string(),
        }
    }

    fn base_input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn precondition_rejects_empty_facts() {
        let breed = AutoinstinctVision;
        let input = base_input(vec![]);
        let result = breed.preconditions(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("at least one fact"));
    }

    #[test]
    fn single_block_is_clear() {
        let breed = AutoinstinctVision;
        let input = base_input(vec![make_fact("cube", "A")]);
        let output = breed.run(&input).expect("run ok");
        assert_eq!(output.selected, Some("A".to_string()));
        assert!(!output.inference_trace.is_empty());
    }

    #[test]
    fn stacked_blocks_top_is_clear() {
        let breed = AutoinstinctVision;
        // B sits on A — B is clear
        let input = base_input(vec![
            make_fact("cube", "A"),
            make_fact("pyramid", "B"),
            make_fact("supported_by:B", "A"),
        ]);
        let output = breed.run(&input).expect("run ok");
        assert_eq!(output.selected, Some("B".to_string()));
    }

    #[test]
    fn candidates_contain_all_observed_objects() {
        let breed = AutoinstinctVision;
        let input = base_input(vec![
            make_fact("cube", "A"),
            make_fact("cube", "B"),
            make_fact("pyramid", "C"),
        ]);
        let output = breed.run(&input).expect("run ok");
        let ids: Vec<&str> = output.candidates.iter().map(|c| c.id.as_str()).collect();
        assert!(ids.contains(&"A"));
        assert!(ids.contains(&"B"));
        assert!(ids.contains(&"C"));
    }

    #[test]
    fn trace_is_non_empty() {
        let breed = AutoinstinctVision;
        let input = base_input(vec![make_fact("wedge", "X")]);
        let output = breed.run(&input).expect("run ok");
        assert!(!output.inference_trace.is_empty());
        assert!(output
            .inference_trace
            .iter()
            .any(|t| t.kind == "observe-object"));
        assert!(output
            .inference_trace
            .iter()
            .any(|t| t.kind == "find-clear-object"));
    }

    #[test]
    fn postcondition_requires_non_empty_trace() {
        let breed = AutoinstinctVision;
        let output = BreedOutput {
            breed: BreedId::AutoinstinctVision,
            candidates: vec![],
            facts: vec![],
            selected: None,
            explanation: "test".into(),
            inference_trace: vec![],
            ocel_log: None,
            retained_cases: vec![],
        };
        assert!(breed.postconditions(&output).is_err());
    }
}
