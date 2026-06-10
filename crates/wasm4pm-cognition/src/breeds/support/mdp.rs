use std::collections::BTreeMap;

#[derive(Debug, Clone)]
/// Represents a transition to a next state with a probability and reward.
pub struct Transition {
    /// The next state.
    pub next_state: String,
    /// The probability of this transition.
    pub prob: f32,
    /// The reward for this transition.
    pub reward: f32,
}

#[derive(Debug, Clone)]
/// The Markov Decision Process model.
pub struct MdpModel {
    /// Discount factor.
    pub gamma: f32,
    // state -> action -> Vec<Transition>
    /// Transitions from state to action to next state.
    pub transitions: BTreeMap<String, BTreeMap<String, Vec<Transition>>>,
}

impl MdpModel {
    /// Validates the MDP model.
    pub fn validate(&self) -> Result<(), String> {
        if self.gamma < 0.0 || self.gamma >= 1.0 {
            return Err("gamma must be in [0, 1)".into());
        }
        for (s, actions) in &self.transitions {
            for (a, trans) in actions {
                let sum_prob: f32 = trans.iter().map(|t| t.prob).sum();
                if (sum_prob - 1.0).abs() > 1e-6 {
                    return Err(format!("probabilities for state {} action {} sum to {}, expected 1.0", s, a, sum_prob));
                }
            }
        }
        Ok(())
    }
}

/// Runs deterministic value iteration to ε(1−γ)/γ.
/// Returns (V, policy, residual, sweeps).
pub fn value_iteration(
    model: &MdpModel,
    epsilon: f32,
) -> Result<(BTreeMap<String, f32>, BTreeMap<String, String>, f32, usize), String> {
    model.validate()?;

    let mut v: BTreeMap<String, f32> = BTreeMap::new();
    // Initialize V to 0
    for s in model.transitions.keys() {
        v.insert(s.clone(), 0.0);
    }
    // Also include any next_state not in keys
    for actions in model.transitions.values() {
        for trans in actions.values() {
            for t in trans {
                if !v.contains_key(&t.next_state) {
                    v.insert(t.next_state.clone(), 0.0);
                }
            }
        }
    }

    let mut residual = 0.0;
    let mut sweeps = 0;
    let max_sweeps = 100_000;
    let threshold = epsilon * (1.0 - model.gamma) / model.gamma;

    loop {
        let mut delta = 0.0_f32;
        let mut next_v = v.clone();

        for s in model.transitions.keys() {
            let actions = &model.transitions[s];
            if actions.is_empty() {
                continue;
            }

            let mut max_val = f32::NEG_INFINITY;
            for (a, trans) in actions {
                let mut q = 0.0;
                for t in trans {
                    q += t.prob * (t.reward + model.gamma * v.get(&t.next_state).unwrap_or(&0.0));
                }
                if q > max_val {
                    max_val = q;
                }
            }
            
            let old_val = v[s];
            delta = delta.max((old_val - max_val).abs());
            next_v.insert(s.clone(), max_val);
        }

        v = next_v;
        sweeps += 1;
        residual = delta;

        if delta < threshold || sweeps >= max_sweeps {
            break;
        }
    }

    // Extract greedy policy (lexicographic tie-breaking on action id)
    let mut policy = BTreeMap::new();
    for s in model.transitions.keys() {
        let actions = &model.transitions[s];
        if actions.is_empty() {
            continue;
        }

        let mut best_a = None;
        let mut best_q = f32::NEG_INFINITY;

        for (a, trans) in actions {
            let mut q = 0.0;
            for t in trans {
                q += t.prob * (t.reward + model.gamma * v.get(&t.next_state).unwrap_or(&0.0));
            }
            // Tie-break: if q > best_q, or (q == best_q AND a < best_a)
            // Float equality is tricky, use epsilon
            if q > best_q + 1e-6 || (q >= best_q - 1e-6 && best_a.map_or(true, |ba: &String| a < ba)) {
                best_q = q;
                best_a = Some(a);
            }
        }
        if let Some(a) = best_a {
            policy.insert(s.clone(), a.clone());
        }
    }

    Ok((v, policy, residual, sweeps))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mdp_value_iteration_chain() {
        // 4-state chain with closed-form V(s1) = R / (1-gamma) = 2.0 (if R=1, gamma=0.5)
        let mut transitions = BTreeMap::new();
        
        let mut s1_actions = BTreeMap::new();
        s1_actions.insert("loop".to_string(), vec![Transition { next_state: "s1".to_string(), prob: 1.0, reward: 1.0 }]);
        transitions.insert("s1".to_string(), s1_actions);

        let model = MdpModel {
            gamma: 0.5,
            transitions,
        };

        let (v, policy, residual, sweeps) = value_iteration(&model, 1e-4).unwrap();
        
        // Exact Bellman fixed-point identity
        let v_s1 = v["s1"];
        let expected = 1.0 / (1.0 - 0.5); // 2.0
        assert!((v_s1 - expected).abs() < 1e-4, "V(s1)={} expected={}", v_s1, expected);
        assert_eq!(policy["s1"], "loop");
    }

    #[test]
    fn test_mdp_validation_fails() {
        let mut transitions = BTreeMap::new();
        let mut s1_actions = BTreeMap::new();
        s1_actions.insert("a".to_string(), vec![Transition { next_state: "s2".to_string(), prob: 0.5, reward: 1.0 }]);
        transitions.insert("s1".to_string(), s1_actions);
        let model = MdpModel { gamma: 0.9, transitions };
        assert!(model.validate().is_err(), "Should fail because probabilities don't sum to 1");
    }
}
