//! Hayes Naive physics.

use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep};

/// Implementation of Hayes naive physics
pub struct NaivePhysicsBreed;

impl CognitionBreed for NaivePhysicsBreed {
    fn id(&self) -> BreedId {
        BreedId::NaivePhysics
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "support transitivity".to_string(),
            "unsupported->falls".to_string(),
            "containment transport".to_string(),
            "liquid spill".to_string(),
        ]
    }

    fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut obj_names: Vec<String> = Vec::new();

        let mut get_id = |name: &str, obj_names: &mut Vec<String>| -> Result<usize, BreedError> {
            if let Some(idx) = obj_names.iter().position(|n| n == name) {
                Ok(idx)
            } else {
                if obj_names.len() >= 64 {
                    return Err(BreedError {
                        breed: BreedId::NaivePhysics,
                        message: "too many objects (max 64)".to_string(),
                    });
                }
                obj_names.push(name.to_string());
                Ok(obj_names.len() - 1)
            }
        };

        let mut is_solid = 0u64;
        let mut is_liquid = 0u64;
        let mut is_floor = 0u64;
        let mut parents = [0u64; 64];
        let mut contained_by = [0u64; 64];

        for atom in &input.state {
            match atom.predicate.as_str() {
                "solid" => {
                    let id = get_id(&atom.value, &mut obj_names)?;
                    is_solid |= 1 << id;
                }
                "liquid" => {
                    let id = get_id(&atom.value, &mut obj_names)?;
                    is_liquid |= 1 << id;
                }
                "floor" => {
                    let id = get_id(&atom.value, &mut obj_names)?;
                    is_floor |= 1 << id;
                }
                "supports" => {
                    let parts: Vec<&str> = atom.value.split(",").map(|s| s.trim()).collect();
                    if parts.len() == 2 {
                        let parent = get_id(parts[0], &mut obj_names)?;
                        let child = get_id(parts[1], &mut obj_names)?;
                        parents[child] |= 1 << parent;
                    }
                }
                "contains" => {
                    let parts: Vec<&str> = atom.value.split(",").map(|s| s.trim()).collect();
                    if parts.len() == 2 {
                        let parent = get_id(parts[0], &mut obj_names)?;
                        let child = get_id(parts[1], &mut obj_names)?;
                        parents[child] |= 1 << parent;
                        contained_by[child] |= 1 << parent;
                    }
                }
                _ => {}
            }
        }

        let mut trace = Vec::new();
        let mut step_idx = 0;

        trace.push(TraceStep {
            step: step_idx,
            kind: "load-scene".to_string(),
            detail: format!("loaded {} objects", obj_names.len()),
            depth: 0,
            objects: vec![],
        });
        step_idx += 1;

        let mut falls = 0u64;
        let mut spills = 0u64;
        let n = obj_names.len();

        loop {
            let mut changed = false;
            for i in 0..n {
                // Check unsupported -> falls
                if (is_floor & (1 << i)) == 0 && (falls & (1 << i)) == 0 {
                    if (parents[i] & !falls) == 0 {
                        falls |= 1 << i;
                        changed = true;
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "apply-axiom".to_string(),
                            detail: format!("{} falls (unsupported)", obj_names[i]),
                            depth: 1,
                            objects: vec![("object".to_string(), obj_names[i].clone())],
                        });
                        step_idx += 1;
                    }
                }

                // Check liquid spill
                if (is_liquid & (1 << i)) != 0 && (spills & (1 << i)) == 0 {
                    if (contained_by[i] & !falls) == 0 {
                        spills |= 1 << i;
                        changed = true;
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "apply-axiom".to_string(),
                            detail: format!("{} spills (uncontained)", obj_names[i]),
                            depth: 1,
                            objects: vec![("object".to_string(), obj_names[i].clone())],
                        });
                        step_idx += 1;
                    }
                }
            }
            if !changed {
                break;
            }
        }

        for i in 0..n {
            if (falls & (1 << i)) != 0 {
                trace.push(TraceStep {
                    step: step_idx,
                    kind: "predict".to_string(),
                    detail: format!("{} will fall", obj_names[i]),
                    depth: 0,
                    objects: vec![("object".to_string(), obj_names[i].clone())],
                });
                step_idx += 1;
            }
            if (spills & (1 << i)) != 0 {
                trace.push(TraceStep {
                    step: step_idx,
                    kind: "predict".to_string(),
                    detail: format!("{} will spill", obj_names[i]),
                    depth: 0,
                    objects: vec![("object".to_string(), obj_names[i].clone())],
                });
                step_idx += 1;
            }
        }

        trace.push(TraceStep {
            step: step_idx,
            kind: "decision".to_string(),
            detail: "fixpoint reached".to_string(),
            depth: 0,
            objects: vec![],
        });

        let explanation = format!(
            "Naive physics evaluated {} objects. {} fell, {} spilled.",
            n,
            falls.count_ones(),
            spills.count_ones()
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: None,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _output: &BreedOutput) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Candidate, StateAtom};

    fn make_input(atoms: Vec<(&str, &str)>) -> BreedInput {
        BreedInput {
            intent: "test".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: atoms
                .into_iter()
                .map(|(p, v)| StateAtom {
                    predicate: p.to_string(),
                    value: v.to_string(),
                })
                .collect(),
        }
    }

    #[test]
    fn test_hidden_oracle() {
        let breed = NaivePhysicsBreed;
        let input = make_input(vec![
            ("solid", "box1"),
            ("solid", "box2"),
            ("solid", "box3"),
            ("solid", "box4"),
            ("supports", "box1,box2"),
            ("supports", "box2,box3"),
            ("supports", "box3,box4"),
        ]);

        let output = breed.run(&input).expect("should run");

        let trace = output.inference_trace;
        let fall_events: Vec<_> = trace
            .iter()
            .filter(|t| t.kind == "apply-axiom" && t.detail.contains("falls"))
            .map(|t| t.objects[0].1.clone())
            .collect();

        assert_eq!(fall_events.len(), 4, "all 4 boxes should fall");
        assert!(fall_events.contains(&"box1".to_string()));
        assert!(fall_events.contains(&"box2".to_string()));
        assert!(fall_events.contains(&"box3".to_string()));
        assert!(fall_events.contains(&"box4".to_string()));

        let pos1 = fall_events.iter().position(|x| x == "box1").unwrap();
        let pos2 = fall_events.iter().position(|x| x == "box2").unwrap();
        let pos3 = fall_events.iter().position(|x| x == "box3").unwrap();
        let pos4 = fall_events.iter().position(|x| x == "box4").unwrap();
        assert!(pos1 < pos2);
        assert!(pos2 < pos3);
        assert!(pos3 < pos4);
    }

    #[test]
    fn test_refusal_too_many_objects() {
        let breed = NaivePhysicsBreed;
        let mut atoms = vec![];
        for i in 0..65 {
            atoms.push(("solid".to_string(), format!("obj{}", i)));
        }
        let input = BreedInput {
            intent: "test".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: atoms.into_iter().map(|(p, v)| StateAtom { predicate: p, value: v }).collect(),
        };

        let result = breed.run(&input);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("too many objects"));
    }

    #[test]
    fn test_paper_grounded_determinism() {
        let breed = NaivePhysicsBreed;
        let input = make_input(vec![
            ("floor", "ground"),
            ("solid", "table"),
            ("liquid", "water"),
            ("solid", "cup"),
            ("supports", "ground,table"),
            ("supports", "table,cup"),
            ("contains", "cup,water"),
        ]);

        let output1 = breed.run(&input).expect("should run");
        let output2 = breed.run(&input).expect("should run");

        assert_eq!(output1.inference_trace, output2.inference_trace);

        let receipt1 = breed.receipt(&input, &output1);
        let receipt2 = breed.receipt(&input, &output2);

        assert_eq!(receipt1.combined_hash, receipt2.combined_hash);

        let falls = output1.inference_trace.iter().filter(|t| t.kind == "apply-axiom").count();
        assert_eq!(falls, 0);
    }

    #[test]
    fn test_liquid_spill_and_containment_transport() {
        let breed = NaivePhysicsBreed;
        let input = make_input(vec![
            ("liquid", "water"),
            ("solid", "cup"),
            ("contains", "cup,water"),
        ]);

        let output = breed.run(&input).expect("should run");

        let trace = output.inference_trace;
        let cup_falls = trace.iter().any(|t| t.detail == "cup falls (unsupported)");
        let water_spills = trace.iter().any(|t| t.detail == "water spills (uncontained)");
        assert!(cup_falls);
        assert!(water_spills);
    }
}
