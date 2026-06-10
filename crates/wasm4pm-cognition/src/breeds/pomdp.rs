//! Partially Observable Markov Decision Process (POMDP) belief update and PBVI.
//!
//! Rank-1 properties: exact Bayes update on the Tiger problem yields 0.85;
//! PBVI runs without crashing and correctly emits an action; bit-exact determinism.

use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
use std::collections::{BTreeMap, BTreeSet};

/// Partially Observable Markov Decision Process solver breed.
pub struct Pomdp;

impl CognitionBreed for Pomdp {
    fn id(&self) -> BreedId {
        BreedId::Pomdp
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["pomdp".to_string(), "bayes_update".to_string(), "pbvi".to_string()]
    }

    fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step = 0;

        let mut states_set = BTreeSet::new();
        let mut actions_set = BTreeSet::new();
        let mut obs_set = BTreeSet::new();
        
        let mut trans = BTreeMap::new();
        let mut obs_prob = BTreeMap::new();
        let mut reward = BTreeMap::new();
        let mut init_belief = BTreeMap::new();
        
        let mut history_str = String::new();
        let mut gamma = 0.9_f64;
        let mut horizon = 4;

        for f in &input.facts {
            if f.key == "pomdp:state" { states_set.insert(f.value.clone()); }
            else if f.key == "pomdp:action" { actions_set.insert(f.value.clone()); }
            else if f.key == "pomdp:obs" { obs_set.insert(f.value.clone()); }
            else if f.key == "pomdp:history" { history_str = f.value.clone(); }
            else if f.key == "pomdp:gamma" { gamma = f.value.parse().unwrap_or(0.9); }
            else if f.key == "pomdp:horizon" { horizon = f.value.parse().unwrap_or(4); }
            else if let Some(rest) = f.key.strip_prefix("pomdp:trans:") {
                let parts: Vec<&str> = rest.split(',').collect();
                if parts.len() == 3 {
                    if let Ok(v) = f.value.parse::<f64>() {
                        trans.insert((parts[0].to_string(), parts[1].to_string(), parts[2].to_string()), v);
                    }
                }
            } else if let Some(rest) = f.key.strip_prefix("pomdp:obs_prob:") {
                let parts: Vec<&str> = rest.split(',').collect();
                if parts.len() == 3 {
                    if let Ok(v) = f.value.parse::<f64>() {
                        obs_prob.insert((parts[0].to_string(), parts[1].to_string(), parts[2].to_string()), v);
                    }
                }
            } else if let Some(rest) = f.key.strip_prefix("pomdp:reward:") {
                let parts: Vec<&str> = rest.split(',').collect();
                if parts.len() == 2 {
                    if let Ok(v) = f.value.parse::<f64>() {
                        reward.insert((parts[0].to_string(), parts[1].to_string()), v);
                    }
                }
            } else if f.key == "pomdp:init" {
                let parts: Vec<&str> = f.value.split(':').collect();
                if parts.len() == 2 {
                    if let Ok(v) = parts[1].parse::<f64>() {
                        init_belief.insert(parts[0].to_string(), v);
                    }
                }
            }
        }

        let states: Vec<String> = states_set.into_iter().collect();
        let actions: Vec<String> = actions_set.into_iter().collect();
        let obs: Vec<String> = obs_set.into_iter().collect();

        if states.is_empty() {
            return Err(BreedError { breed: self.id(), message: "No states".into() });
        }
        if actions.is_empty() {
            return Err(BreedError { breed: self.id(), message: "No actions".into() });
        }

        if states.len() * actions.len() * obs.len() > 512 {
            return Err(BreedError { breed: self.id(), message: "RESOURCE_EXHAUSTED".into() });
        }

        trace.push(TraceStep {
            step, kind: "parse-model".into(), detail: format!("{} states, {} actions", states.len(), actions.len()), depth: 0, objects: vec![]
        });
        step += 1;

        let mut b = vec![0.0; states.len()];
        for (i, s) in states.iter().enumerate() {
            b[i] = *init_belief.get(s).unwrap_or(&0.0);
        }
        let sum: f64 = b.iter().sum();
        if sum > 0.0 {
            for v in &mut b { *v /= sum; }
        } else {
            b[0] = 1.0;
        }

        trace.push(TraceStep {
            step, kind: "init-belief".into(), detail: format!("{:?}", b), depth: 0, objects: vec![]
        });
        step += 1;

        let history: Vec<&str> = if history_str.is_empty() { vec![] } else { history_str.split(',').collect() };
        let mut i = 0;
        while i + 1 < history.len() {
            let a_str = history[i];
            let o_str = history[i+1];
            i += 2;

            let mut next_b = vec![0.0; states.len()];
            let mut total_prob = 0.0;

            for (s_prime_idx, s_prime) in states.iter().enumerate() {
                let p_o = *obs_prob.get(&(a_str.to_string(), s_prime.to_string(), o_str.to_string())).unwrap_or(&0.0);
                let mut sum_trans = 0.0;
                for (s_idx, s) in states.iter().enumerate() {
                    let p_t = *trans.get(&(s.to_string(), a_str.to_string(), s_prime.to_string())).unwrap_or(&0.0);
                    sum_trans += b[s_idx] * p_t;
                }
                next_b[s_prime_idx] = p_o * sum_trans;
                total_prob += next_b[s_prime_idx];
            }

            if total_prob > 1e-9 {
                for v in &mut next_b { *v /= total_prob; }
            }
            b = next_b;

            trace.push(TraceStep {
                step, kind: "belief-update".into(), detail: format!("{:?}", b), depth: 0, objects: vec![]
            });
            step += 1;
        }

        let mut belief_points = vec![b.clone()];

        trace.push(TraceStep {
            step, kind: "expand-belief-points".into(), detail: format!("1 points"), depth: 0, objects: vec![]
        });
        step += 1;

        let mut alphas: Vec<(usize, Vec<f64>)> = vec![(0, vec![0.0; states.len()])];
        horizon = horizon.min(8);

        for _ in 0..horizon {
            let mut next_alphas = Vec::new();
            for bp in &belief_points {
                let mut best_alpha = (0, vec![0.0; states.len()]);
                let mut best_val = f64::NEG_INFINITY;

                for (a_idx, a_str) in actions.iter().enumerate() {
                    let mut alpha_a = vec![0.0; states.len()];
                    for (s_idx, s) in states.iter().enumerate() {
                        alpha_a[s_idx] = *reward.get(&(s.to_string(), a_str.to_string())).unwrap_or(&0.0);
                    }

                    for o_str in &obs {
                        let mut best_o_alpha = vec![0.0; states.len()];
                        let mut best_o_val = f64::NEG_INFINITY;
                        
                        for (_, old_alpha) in &alphas {
                            let mut o_alpha = vec![0.0; states.len()];
                            let mut val = 0.0;
                            for (s_idx, s) in states.iter().enumerate() {
                                let mut expected = 0.0;
                                for (s_prime_idx, s_prime) in states.iter().enumerate() {
                                    let p_o = *obs_prob.get(&(a_str.to_string(), s_prime.to_string(), o_str.to_string())).unwrap_or(&0.0);
                                    let p_t = *trans.get(&(s.to_string(), a_str.to_string(), s_prime.to_string())).unwrap_or(&0.0);
                                    expected += p_t * p_o * old_alpha[s_prime_idx];
                                }
                                o_alpha[s_idx] = expected;
                                val += bp[s_idx] * expected;
                            }
                            if val > best_o_val {
                                best_o_val = val;
                                best_o_alpha = o_alpha;
                            }
                        }
                        for s_idx in 0..states.len() {
                            alpha_a[s_idx] += gamma * best_o_alpha[s_idx];
                        }
                    }

                    let val: f64 = bp.iter().zip(alpha_a.iter()).map(|(bx, ax)| bx * ax).sum();
                    if val > best_val {
                        best_val = val;
                        best_alpha = (a_idx, alpha_a);
                    }
                }
                next_alphas.push(best_alpha);
            }
            alphas = next_alphas;

            trace.push(TraceStep {
                step, kind: "pbvi-backup".into(), detail: format!("alphas={}", alphas.len()), depth: 0, objects: vec![]
            });
            step += 1;
        }

        let mut best_action_idx = 0;
        let mut best_val = f64::NEG_INFINITY;
        for (a_idx, alpha) in &alphas {
            let val: f64 = b.iter().zip(alpha.iter()).map(|(bx, ax)| bx * ax).sum();
            if val > best_val {
                best_val = val;
                best_action_idx = *a_idx;
            }
        }

        let selected_action = actions[best_action_idx].clone();

        trace.push(TraceStep {
            step, kind: "select-action".into(), detail: selected_action.clone(), depth: 0, objects: vec![]
        });

        let mut out_facts = Vec::new();
        for (i, s) in states.iter().enumerate() {
            out_facts.push(Fact {
                key: format!("posterior_{}", s),
                value: format!("{:.6}", b[i]),
            });
        }
        out_facts.push(Fact {
            key: "action".into(),
            value: selected_action.clone(),
        });

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some(selected_action),
            explanation: "POMDP PBVI".into(),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Empty trace".into());
        }
        Ok(())
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::BreedInput;
    use crate::breeds::Fact;

    #[test]
    fn test_pomdp_paper_grounded_and_hidden_oracle() {
        let json = include_str!("../../tests/fixtures/papers/pomdp.json");
        let fixture: serde_json::Value = serde_json::from_str(json).unwrap();
        
        let mut facts = Vec::new();
        for f in fixture["input"]["facts"].as_array().unwrap() {
            facts.push(Fact {
                key: f["key"].as_str().unwrap().to_string(),
                value: f["value"].as_str().unwrap().to_string(),
            });
        }
        
        let input = BreedInput {
            intent: "solve_tiger".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        
        let breed = Pomdp;
        let out = breed.run(&input).expect("run failed");
        
        let mut posterior = 0.0;
        for f in &out.facts {
            if f.key == "posterior_tiger_left" {
                posterior = f.value.parse::<f64>().unwrap();
            }
        }
        
        let expected = fixture["expected"]["posterior_tiger_left"].as_f64().unwrap();
        assert!((posterior - expected).abs() < 1e-4, "{} != {}", posterior, expected);
        
        let mut action = "";
        for f in &out.facts {
            if f.key == "action" {
                action = &f.value;
            }
        }
        assert_eq!(action, fixture["expected"]["action"].as_str().unwrap());
    }

    #[test]
    fn test_pomdp_determinism() {
        let json = include_str!("../../tests/fixtures/papers/pomdp.json");
        let fixture: serde_json::Value = serde_json::from_str(json).unwrap();
        
        let mut facts = Vec::new();
        for f in fixture["input"]["facts"].as_array().unwrap() {
            facts.push(Fact {
                key: f["key"].as_str().unwrap().to_string(),
                value: f["value"].as_str().unwrap().to_string(),
            });
        }
        
        let input = BreedInput {
            intent: "solve_tiger".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        
        let breed = Pomdp;
        let out1 = breed.run(&input).expect("run failed");
        let out2 = breed.run(&input).expect("run failed");
        
        assert_eq!(out1.facts, out2.facts);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }

    #[test]
    fn test_pomdp_refusal() {
        let input = BreedInput {
            intent: "solve_tiger".into(),
            candidates: vec![],
            facts: vec![], // Empty facts should fail
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let breed = Pomdp;
        let out = breed.run(&input);
        assert!(out.is_err() || out.unwrap().inference_trace.iter().any(|t| t.kind == "refusal"));
    }
}
