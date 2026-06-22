//! Markov Decision Process (MDP) value iteration (Bellman 1957).
//!
//! Steps: `mdp-init`, `mdp-iterate`, `mdp-policy`.
//! Uses transitions, rewards, states, actions and gamma from facts.

use crate::breeds::support::mdp::MdpModel;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, HashSet};

/// Markov Decision Process solver
pub struct Mdp;

impl CognitionBreed for Mdp {
    fn id(&self) -> BreedId {
        BreedId::Mdp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "reinforcement_learning".to_string(),
            "planning".to_string(),
            "mdp".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        // Two accepted encodings:
        //   (a) explicit `state` + `action` facts, or
        //   (b) the `mdp:trans:<state>:<action>` transition encoding from which
        //       states and actions are derived (Bellman 1957 chain fixtures).
        let has_states = input.facts.iter().any(|f| f.key == "state");
        let has_actions = input.facts.iter().any(|f| f.key == "action");
        let has_transitions = input.facts.iter().any(|f| f.key.starts_with("mdp:trans:"));
        if (has_states && has_actions) || has_transitions {
            Ok(())
        } else {
            Err("MDP requires state+action facts or mdp:trans: transitions".to_string())
        }
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        let mut states = Vec::new();
        let mut actions = Vec::new();
        let mut transition_facts = Vec::new();
        let mut reward_facts = Vec::new();
        let mut gamma = 0.9;

        // Prefixed encoding (Bellman 1957 chain fixtures):
        //   mdp:gamma                       -> "0.9"
        //   mdp:trans:<state>:<action>      -> "<next_state>:<prob>" (';'-sep for multiple)
        //   mdp:reward:<state>:<action>     -> "<reward>"
        // States and actions are derived from the transition keys/values in
        // first-seen order. Normalised into the same comma-separated
        // `transition_facts`/`reward_facts` form the loops below consume.
        let mut register_state = |s: &str, states: &mut Vec<String>| {
            if !states.iter().any(|e| e == s) {
                states.push(s.to_string());
            }
        };

        for fact in &input.facts {
            if let Some(rest) = fact.key.strip_prefix("mdp:trans:") {
                // rest = "<state>:<action>"
                if let Some((s_from, action)) = rest.split_once(':') {
                    register_state(s_from, &mut states);
                    if !actions.iter().any(|a| a == action) {
                        actions.push(action.to_string());
                    }
                    // value = "<next_state>:<prob>[;<next_state>:<prob>...]"
                    for outcome in fact.value.split(';') {
                        if let Some((s_to, prob)) = outcome.rsplit_once(':') {
                            register_state(s_to, &mut states);
                            transition_facts.push(format!(
                                "{},{},{},{}",
                                s_from,
                                action,
                                s_to,
                                prob.trim()
                            ));
                        }
                    }
                }
            } else if let Some(rest) = fact.key.strip_prefix("mdp:reward:") {
                // rest = "<state>:<action>"
                if let Some((state, action)) = rest.split_once(':') {
                    reward_facts.push(format!("{},{},{}", state, action, fact.value.trim()));
                }
            } else if fact.key == "mdp:gamma" || fact.key == "gamma" {
                if let Ok(g) = fact.value.parse::<f64>() {
                    gamma = g;
                }
            } else if fact.key == "state" {
                register_state(&fact.value, &mut states);
            } else if fact.key == "action" {
                if !actions.iter().any(|a| a == &fact.value) {
                    actions.push(fact.value.clone());
                }
            } else if fact.key == "transition" {
                transition_facts.push(fact.value.clone());
            } else if fact.key == "reward" {
                reward_facts.push(fact.value.clone());
            }
        }

        let mut state_to_idx = BTreeMap::new();
        for (i, s) in states.iter().enumerate() {
            state_to_idx.insert(s.clone(), i);
        }
        let mut action_to_idx = BTreeMap::new();
        for (i, a) in actions.iter().enumerate() {
            action_to_idx.insert(a.clone(), i);
        }

        let mut transitions: BTreeMap<(usize, usize), Vec<(usize, f64)>> = BTreeMap::new();
        for tf in transition_facts {
            let parts: Vec<&str> = tf.split(',').map(|s| s.trim()).collect();
            if parts.len() == 4 {
                let s_from = parts[0].to_string();
                let action = parts[1].to_string();
                let s_to = parts[2].to_string();
                if let Ok(prob) = parts[3].parse::<f64>() {
                    if let (Some(&u), Some(&a), Some(&v)) = (
                        state_to_idx.get(&s_from),
                        action_to_idx.get(&action),
                        state_to_idx.get(&s_to),
                    ) {
                        transitions.entry((u, a)).or_default().push((v, prob));
                    }
                }
            }
        }

        let mut rewards = BTreeMap::new();
        for rf in reward_facts {
            let parts: Vec<&str> = rf.split(',').map(|s| s.trim()).collect();
            if parts.len() == 3 {
                let state = parts[0].to_string();
                let action = parts[1].to_string();
                if let Ok(rew) = parts[2].parse::<f64>() {
                    if let (Some(&u), Some(&a)) =
                        (state_to_idx.get(&state), action_to_idx.get(&action))
                    {
                        rewards.insert((u, a), rew);
                    }
                }
            }
        }

        let model = MdpModel {
            states: states.clone(),
            actions: actions.clone(),
            transitions,
            rewards,
            gamma,
        };

        model.validate().map_err(|e| BreedError {
            breed: self.id(),
            message: format!("MDP validation failed: {}", e),
        })?;

        trace.push(TraceStep {
            step: trace.len(),
            kind: "mdp-init".to_string(),
            detail: format!(
                "MDP initialized: states={}, actions={}, gamma={}",
                states.len(),
                actions.len(),
                gamma
            ),
            depth: 0,
            objects: vec![],
        });

        // Value iteration with tracing
        let epsilon = 1e-4;
        let threshold = if gamma > 0.0 {
            epsilon * (1.0 - gamma) / gamma
        } else {
            epsilon
        };

        let n = states.len();
        let mut v = vec![0.0; n];
        let mut sweeps = 0;
        loop {
            let mut delta = 0.0_f64;
            let mut next = vec![0.0; n];
            for s in 0..n {
                let acts = model.actions_in(s);
                let best = acts
                    .iter()
                    .map(|&a| model.q_value(s, a, &v))
                    .fold(f64::NEG_INFINITY, f64::max);
                next[s] = best;
                delta = delta.max((best - v[s]).abs());
            }
            v = next;
            sweeps += 1;

            trace.push(TraceStep {
                step: trace.len(),
                kind: "mdp-iterate".to_string(),
                detail: format!("Sweep {}: delta={:.6}, values={:?}", sweeps, delta, v),
                depth: 0,
                objects: vec![],
            });

            if delta < threshold || sweeps >= 1000 {
                break;
            }
        }

        // Greedy policy extraction
        let mut policy = Vec::with_capacity(n);
        let mut policy_strs = Vec::new();
        for s in 0..n {
            let acts = model.actions_in(s);
            let mut best_a = acts[0];
            let mut best_q = f64::NEG_INFINITY;
            for &a in &acts {
                let q = model.q_value(s, a, &v);
                if q > best_q + 1e-12 {
                    best_q = q;
                    best_a = a;
                }
            }
            policy.push(best_a);
            policy_strs.push(format!("{}:{}", states[s], actions[best_a]));
        }

        let explanation = format!(
            "MDP value iteration converged in {} sweeps. Optimal policy: {}",
            sweeps,
            policy_strs.join(", ")
        );

        trace.push(TraceStep {
            step: trace.len(),
            kind: "mdp-policy".to_string(),
            detail: explanation.clone(),
            depth: 0,
            objects: vec![],
        });

        let selected = Some(policy_strs.join(","));

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
            return Err("MDP must record sweep steps".to_string());
        }
        let kinds: HashSet<_> = output
            .inference_trace
            .iter()
            .map(|t| t.kind.clone())
            .collect();
        if !kinds.contains("mdp-init")
            || !kinds.contains("mdp-iterate")
            || !kinds.contains("mdp-policy")
        {
            return Err("MDP trace missing required kinds".to_string());
        }
        Ok(())
    }
}
