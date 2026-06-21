use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};
use std::collections::{HashMap, HashSet};

/// Frame-based inheritance with overrides (Minsky 1974).
pub struct FramesInheritance;

impl CognitionBreed for FramesInheritance {
    fn id(&self) -> BreedId {
        BreedId::FramesInheritance
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "frame-based-inheritance".to_string(),
            "slot-resolution".to_string(),
            "cycle-detection".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.intent.is_empty() {
            return Err("intent cannot be empty".to_string());
        }
        let parts: Vec<&str> = input.intent.split_whitespace().collect();
        if parts.len() != 3 || parts[0] != "resolve" {
            return Err("intent must be 'resolve <frame> <slot>'".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let parts: Vec<&str> = input.intent.split_whitespace().collect();
        if parts.len() < 3 || parts[0] != "resolve" {
            return Err(BreedError { breed: self.id(), message: "intent must be 'resolve <frame> <slot>'".to_string() });
        }
        let target_frame = parts[1].to_string();
        let target_slot = parts[2].to_string();

        let mut trace = Vec::new();
        let mut isa_map: HashMap<String, String> = HashMap::new();
        let mut own_slots: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut default_slots: HashMap<String, HashMap<String, String>> = HashMap::new();

        // Facts: frame:<F>:isa=<Parent> or frame:<F>:isa with value=<Parent>
        // Depending on `Fact` shape. Assume key = "frame:<F>:isa", value = "<Parent>"
        for fact in &input.facts {
            let key_parts: Vec<&str> = fact.key.split(':').collect();
            if key_parts.len() == 3 && key_parts[0] == "frame" && key_parts[2] == "isa" {
                isa_map.insert(key_parts[1].to_string(), fact.value.clone());
            } else if key_parts.len() == 4 && key_parts[0] == "frame" && key_parts[2] == "slot" {
                let f = key_parts[1].to_string();
                let s = key_parts[3].to_string();
                own_slots.entry(f).or_default().insert(s, fact.value.clone());
            } else if key_parts.len() == 5 && key_parts[0] == "frame" && key_parts[2] == "slot" && key_parts[4] == "default" {
                let f = key_parts[1].to_string();
                let s = key_parts[3].to_string();
                default_slots.entry(f).or_default().insert(s, fact.value.clone());
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "frame-load".to_string(),
            detail: format!("Loaded {} frames", own_slots.len() + default_slots.len() + isa_map.len()),
            depth: 0,
            objects: vec![],
        });

        let mut current_frame = target_frame.clone();
        let mut visited = HashSet::new();
        let mut result = None;
        let mut distance = 0;
        let mut default_val = None;
        let mut default_frame = None;

        loop {
            if visited.contains(&current_frame) {
                return Err(BreedError {
                    breed: self.id(),
                    message: format!("isa cycle detected at {}", current_frame),
                });
            }
            visited.insert(current_frame.clone());

            trace.push(TraceStep {
                step: trace.len(),
                kind: "frame-walk".to_string(),
                detail: format!("walking {}", current_frame),
                depth: distance,
                objects: vec![],
            });

            if let Some(slots) = own_slots.get(&current_frame) {
                if let Some(val) = slots.get(&target_slot) {
                    result = Some((val.clone(), current_frame.clone(), "own".to_string()));
                    break;
                }
            }
            
            if default_val.is_none() {
                if let Some(slots) = default_slots.get(&current_frame) {
                    if let Some(val) = slots.get(&target_slot) {
                        default_val = Some(val.clone());
                        default_frame = Some(current_frame.clone());
                    }
                }
            }

            if let Some(parent) = isa_map.get(&current_frame) {
                current_frame = parent.clone();
                distance += 1;
            } else {
                break;
            }
        }

        if result.is_none() {
            if let Some((v, f)) = default_val.zip(default_frame) {
                result = Some((v, f, "default".to_string()));
            }
        }

        if let Some((val, found_frame, kind)) = result {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "frame-resolve".to_string(),
                detail: format!("{} slot {} resolved to {} at {} ({})", target_frame, target_slot, val, found_frame, kind),
                depth: distance,
                objects: vec![],
            });
            Ok(BreedOutput {
                breed: self.id(),
                candidates: vec![],
                facts: vec![],
                selected: Some(val.clone()),
                explanation: format!("resolved {} {} to {} at distance {}", target_frame, target_slot, val, distance),
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            })
        } else {
            Ok(BreedOutput {
                breed: self.id(),
                candidates: vec![],
                facts: vec![],
                selected: None,
                explanation: format!("could not resolve {} {}", target_frame, target_slot),
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            })
        }
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("inference trace is empty".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, Fact};

    #[test]
    fn test_frames_inheritance_refusal() {
        let breed = FramesInheritance;
        let input = BreedInput {
            intent: "invalid intent".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn test_frames_inheritance_hidden_oracle() {
        let breed = FramesInheritance;
        let input = BreedInput {
            intent: "resolve zilk color".to_string(),
            candidates: vec![],
            facts: vec![
                Fact { key: "frame:zilk:isa".to_string(), value: "welp".to_string() },
                Fact { key: "frame:welp:isa".to_string(), value: "snorf".to_string() },
                Fact { key: "frame:snorf:slot:color:default".to_string(), value: "blue".to_string() },
                Fact { key: "frame:welp:slot:color:default".to_string(), value: "red".to_string() },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = breed.run(&input).expect("should succeed");
        assert_eq!(out.selected, Some("red".to_string()));
        
        let walk_steps: Vec<_> = out.inference_trace.iter().filter(|s| s.kind == "frame-walk").collect();
        assert_eq!(walk_steps.len(), 3);
    }
    
    #[test]
    fn test_frames_inheritance_cycle_detection() {
        let breed = FramesInheritance;
        let input = BreedInput {
            intent: "resolve zilk color".to_string(),
            candidates: vec![],
            facts: vec![
                Fact { key: "frame:zilk:isa".to_string(), value: "welp".to_string() },
                Fact { key: "frame:welp:isa".to_string(), value: "zilk".to_string() },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let res = breed.run(&input);
        assert!(res.is_err());
        assert!(res.unwrap_err().message.contains("cycle detected"));
    }
}
