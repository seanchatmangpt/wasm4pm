use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, HashSet};
use rand::Rng;

/// ACT-R cognitive production cycle breed.
pub struct ActR;

impl CognitionBreed for ActR {
    fn id(&self) -> BreedId {
        BreedId::ActR
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "production_cycle".to_string(),
            "conflict_resolution".to_string(),
            "activation_retrieval".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("ActR requires at least one production rule".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_idx = 1;

        let mut chunks = BTreeMap::new();
        let mut goal_buffer = String::new();
        let mut retrieval_buffer = String::new();
        let mut noise = false;
        let mut tau = 0.0_f32;

        for f in &input.facts {
            if f.key.starts_with("chunk:") {
                let id = f.key.strip_prefix("chunk:").unwrap().to_string();
                let val = f.value.clone();
                let mut b = 0.0;
                let mut s = BTreeMap::new();
                let mut content = val.clone();

                if val.contains('|') {
                    let parts: Vec<&str> = val.splitn(2, '|').collect();
                    let meta = parts[0];
                    content = parts[1].to_string();

                    for item in meta.split(',') {
                        if item.starts_with("B:") {
                            b = item[2..].parse().unwrap_or(0.0);
                        } else if item.starts_with("S:") {
                            let s_parts: Vec<&str> = item[2..].split('=').collect();
                            if s_parts.len() == 2 {
                                s.insert(s_parts[0].to_string(), s_parts[1].parse().unwrap_or(0.0));
                            }
                        }
                    }
                }
                chunks.insert(id.clone(), (b, s, content));
                trace.push(TraceStep {
                    step: step_idx,
                    kind: "load-chunk".to_string(),
                    detail: format!("Loaded chunk {}", id),
                    depth: 0,
                    objects: vec![],
                });
                step_idx += 1;
            } else if f.key == "goal" {
                goal_buffer = f.value.clone();
            } else if f.key == "noise" && f.value == "true" {
                noise = true;
            } else if f.key == "tau" {
                tau = f.value.parse().unwrap_or(0.0);
            }
        }

        let mut rules = input.rules.clone();
        rules.sort_by(|a, b| {
            b.certainty.partial_cmp(&a.certainty).unwrap()
                .then_with(|| b.id.cmp(&a.id))
        });

        let mut cycle = 0;
        let mut rng = crate::breeds::support::rng::seeded_rng();

        loop {
            if cycle >= 32 {
                break;
            }
            cycle += 1;

            let mut matched_prod = None;
            for rule in &rules {
                let mut matched = true;
                for p in &rule.premise {
                    if p.starts_with("goal:") {
                        let pat = p.strip_prefix("goal:").unwrap();
                        if !goal_buffer.contains(pat) {
                            matched = false;
                            break;
                        }
                    } else if p.starts_with("retrieval:") {
                        let pat = p.strip_prefix("retrieval:").unwrap();
                        if !retrieval_buffer.contains(pat) {
                            matched = false;
                            break;
                        }
                    } else {
                        matched = false;
                        break;
                    }
                }
                if matched {
                    matched_prod = Some(rule);
                    break;
                }
            }

            if let Some(rule) = matched_prod {
                trace.push(TraceStep {
                    step: step_idx,
                    kind: "match-production".to_string(),
                    detail: format!("Matched {}", rule.id),
                    depth: 0,
                    objects: vec![],
                });
                step_idx += 1;

                trace.push(TraceStep {
                    step: step_idx,
                    kind: "fire-production".to_string(),
                    detail: format!("Fired {}", rule.id),
                    depth: 0,
                    objects: vec![],
                });
                step_idx += 1;

                let actions: Vec<&str> = rule.conclusion.split('|').collect();
                for act in &actions {
                    if act.starts_with("goal:") {
                        goal_buffer = act.strip_prefix("goal:").unwrap().to_string();
                    } else if act.starts_with("retrieve:") {
                        let pat = act.strip_prefix("retrieve:").unwrap();
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "retrieval-request".to_string(),
                            detail: format!("Requested {}", pat),
                            depth: 0,
                            objects: vec![],
                        });
                        step_idx += 1;

                        let mut best_chunk = None;
                        let mut best_activation = f32::NEG_INFINITY;

                        let goal_tokens: Vec<&str> = goal_buffer.split_whitespace().collect();

                        for (id, (b, s, content)) in &chunks {
                            if !content.contains(pat) {
                                continue;
                            }
                            let mut act_val = *b;
                            for t in &goal_tokens {
                                if let Some(s_ji) = s.get(*t) {
                                    act_val += 1.0 * s_ji;
                                }
                            }
                            if noise {
                                let p: f32 = rng.gen_range(0.0001..0.9999);
                                let noise_val = (p / (1.0 - p)).ln() * 0.1;
                                act_val += noise_val;
                            }

                            if act_val > best_activation {
                                best_activation = act_val;
                                best_chunk = Some((id.clone(), content.clone()));
                            }
                        }

                        if best_activation >= tau && best_chunk.is_some() {
                            let (id, content) = best_chunk.unwrap();
                            retrieval_buffer = content.clone();
                            trace.push(TraceStep {
                                step: step_idx,
                                kind: "retrieve-chunk".to_string(),
                                detail: format!("Retrieved {} with activation {:.3}", id, best_activation),
                                depth: 0,
                                objects: vec![],
                            });
                            step_idx += 1;
                        } else {
                            retrieval_buffer.clear();
                            trace.push(TraceStep {
                                step: step_idx,
                                kind: "retrieval-failure".to_string(),
                                detail: "No chunk above tau".to_string(),
                                depth: 0,
                                objects: vec![],
                            });
                            step_idx += 1;
                        }
                    } else if *act == "stop" {
                        break;
                    }
                }
                if actions.contains(&"stop") {
                    break;
                }
            } else {
                break;
            }
        }

        trace.push(TraceStep {
            step: step_idx,
            kind: "decision".to_string(),
            detail: format!("Goal: {}, Retrieval: {}", goal_buffer, retrieval_buffer),
            depth: 0,
            objects: vec![],
        });

        Ok(BreedOutput {
            breed: BreedId::ActR,
            candidates: vec![],
            facts: vec![
                Fact { key: "goal".to_string(), value: goal_buffer.clone() },
                Fact { key: "retrieval".to_string(), value: retrieval_buffer.clone() },
            ],
            selected: Some(goal_buffer.clone()),
            explanation: format!("ACT-R completed in {} cycles", cycle),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        let has_decision = output.inference_trace.iter().any(|t| t.kind == "decision");
        if !has_decision {
            return Err("ActR must emit decision step".to_string());
        }
        Ok(())
    }
}
