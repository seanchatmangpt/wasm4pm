//! Markov Decision Process model + deterministic value iteration (Bellman
//! 1957), shared by `mdp`, `rl_symbolic`, and `pomdp`.
//!
//! Rank-1 properties proven below: the closed-form fixed point
//! `V = R / (1 - γ)` for a self-loop MDP; Bellman residual below tolerance at
//! every state on convergence; greedy policy extraction with lexicographic
//! (lowest-index) tie-breaking; determinism (bit-identical double run).

use std::collections::BTreeMap;

/// A finite MDP. States and actions are indices into `states` / `actions`.
#[derive(Debug, Clone, PartialEq)]
pub struct MdpModel {
    /// State labels (index = state id).
    pub states: Vec<String>,
    /// Action labels (index = action id).
    pub actions: Vec<String>,
    /// `(state, action)` → list of `(next_state, probability)`.
    /// A missing entry means the action is unavailable in that state.
    pub transitions: BTreeMap<(usize, usize), Vec<(usize, f64)>>,
    /// `(state, action)` → immediate reward. Missing entries default to 0.
    pub rewards: BTreeMap<(usize, usize), f64>,
    /// Discount factor, must satisfy `0 <= gamma < 1`.
    pub gamma: f64,
}

impl MdpModel {
    /// Validate model invariants: γ ∈ [0,1), per-(s,a) probabilities sum to
    /// 1 ± 1e-6, all indices in range, every state has at least one action.
    pub fn validate(&self) -> Result<(), String> {
        if !(0.0..1.0).contains(&self.gamma) {
            return Err(format!("gamma must be in [0,1), got {}", self.gamma));
        }
        if self.states.is_empty() {
            return Err("MDP must have at least one state".to_string());
        }
        let mut has_action = vec![false; self.states.len()];
        for (&(s, a), nexts) in &self.transitions {
            if s >= self.states.len() || a >= self.actions.len() {
                return Err(format!("transition index out of range: ({}, {})", s, a));
            }
            let mut sum = 0.0;
            for &(ns, p) in nexts {
                if ns >= self.states.len() {
                    return Err(format!("next-state index out of range: {}", ns));
                }
                if !(0.0..=1.0).contains(&p) {
                    return Err(format!("probability out of range: {}", p));
                }
                sum += p;
            }
            if (sum - 1.0).abs() > 1e-6 {
                return Err(format!(
                    "probabilities for ({}, {}) sum to {} (must be 1±1e-6)",
                    s, a, sum
                ));
            }
            has_action[s] = true;
        }
        if let Some(s) = has_action.iter().position(|&h| !h) {
            return Err(format!("state {} ('{}') has no action", s, self.states[s]));
        }
        Ok(())
    }

    /// Actions available in state `s`, in ascending index order.
    pub fn actions_in(&self, s: usize) -> Vec<usize> {
        self.transitions
            .range((s, 0)..(s + 1, 0))
            .map(|(&(_, a), _)| a)
            .collect()
    }

    /// Q-value of `(s, a)` under value function `v`.
    pub fn q_value(&self, s: usize, a: usize, v: &[f64]) -> f64 {
        let r = self.rewards.get(&(s, a)).copied().unwrap_or(0.0);
        let future: f64 = self
            .transitions
            .get(&(s, a))
            .map(|nexts| nexts.iter().map(|&(ns, p)| p * v[ns]).sum())
            .unwrap_or(0.0);
        r + self.gamma * future
    }
}

/// Result of value iteration.
#[derive(Debug, Clone, PartialEq)]
pub struct ValueIterationResult {
    /// Converged value function, indexed by state.
    pub values: Vec<f64>,
    /// Greedy policy: per-state best action index (lex-least on ties).
    pub policy: Vec<usize>,
    /// Number of full sweeps performed.
    pub sweeps: usize,
    /// Final max-norm Bellman residual.
    pub residual: f64,
}

/// Deterministic value iteration to the `epsilon`-optimal fixed point.
///
/// Sweeps states in ascending index order; stops when the max-norm update
/// delta falls below `epsilon * (1 - γ) / γ` (or `epsilon` when γ = 0), which
/// guarantees `‖V - V*‖∞ < epsilon`. Hard cap of 100 000 sweeps.
pub fn value_iteration(model: &MdpModel, epsilon: f64) -> Result<ValueIterationResult, String> {
    model.validate()?;
    if epsilon <= 0.0 {
        return Err(format!("epsilon must be > 0, got {}", epsilon));
    }
    let threshold = if model.gamma > 0.0 {
        epsilon * (1.0 - model.gamma) / model.gamma
    } else {
        epsilon
    };
    let n = model.states.len();
    let mut v = vec![0.0_f64; n];
    let mut sweeps = 0usize;
    let mut delta;
    loop {
        delta = 0.0_f64;
        let mut next = vec![0.0_f64; n];
        for (s, slot) in next.iter_mut().enumerate() {
            let best = model
                .actions_in(s)
                .iter()
                .map(|&a| model.q_value(s, a, &v))
                .fold(f64::NEG_INFINITY, f64::max);
            *slot = best;
            delta = delta.max((best - v[s]).abs());
        }
        v = next;
        sweeps += 1;
        if delta < threshold || sweeps >= 100_000 {
            break;
        }
    }
    if sweeps >= 100_000 {
        return Err("value iteration failed to converge within 100000 sweeps".to_string());
    }
    // Greedy policy with lex-least tie-break (first action within 1e-12 of max).
    let mut policy = Vec::with_capacity(n);
    let mut residual = 0.0_f64;
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
        residual = residual.max((best_q - v[s]).abs());
    }
    Ok(ValueIterationResult {
        values: v,
        policy,
        sweeps,
        residual,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Single state, single self-loop action with reward R: V* = R / (1 - γ).
    fn self_loop(r: f64, gamma: f64) -> MdpModel {
        let mut transitions = BTreeMap::new();
        transitions.insert((0, 0), vec![(0, 1.0)]);
        let mut rewards = BTreeMap::new();
        rewards.insert((0, 0), r);
        MdpModel {
            states: vec!["s0".to_string()],
            actions: vec!["loop".to_string()],
            transitions,
            rewards,
            gamma,
        }
    }

    #[test]
    fn closed_form_fixed_point() {
        // R=1, γ=0.5 → V = 1 / (1 - 0.5) = 2 (the plan's oracle).
        let m = self_loop(1.0, 0.5);
        let r = value_iteration(&m, 1e-6).unwrap();
        assert!((r.values[0] - 2.0).abs() < 1e-5, "V={}", r.values[0]);
        assert_eq!(r.policy, vec![0]);
    }

    #[test]
    fn bellman_residual_below_tolerance_everywhere() {
        // Two-state chain: s0 --go--> s1 (reward 5), s1 self-loops (reward 1), γ=0.9.
        // V*(s1) = 1/(1-0.9) = 10; V*(s0) = 5 + 0.9·10 = 14.
        let mut transitions = BTreeMap::new();
        transitions.insert((0, 0), vec![(1, 1.0)]);
        transitions.insert((1, 0), vec![(1, 1.0)]);
        let mut rewards = BTreeMap::new();
        rewards.insert((0, 0), 5.0);
        rewards.insert((1, 0), 1.0);
        let m = MdpModel {
            states: vec!["s0".to_string(), "s1".to_string()],
            actions: vec!["go".to_string()],
            transitions,
            rewards,
            gamma: 0.9,
        };
        let r = value_iteration(&m, 1e-4).unwrap();
        assert!((r.values[1] - 10.0).abs() < 1e-3);
        assert!((r.values[0] - 14.0).abs() < 1e-3);
        // Bellman fixed-point identity at every state.
        for s in 0..2 {
            for a in m.actions_in(s) {
                let q = m.q_value(s, a, &r.values);
                assert!(q <= r.values[s] + 1e-4);
            }
        }
        assert!(r.residual < 1e-4);
    }

    #[test]
    fn greedy_policy_lex_least_tie_break() {
        // Two actions with identical Q → policy must pick action 0.
        let mut transitions = BTreeMap::new();
        transitions.insert((0, 0), vec![(0, 1.0)]);
        transitions.insert((0, 1), vec![(0, 1.0)]);
        let mut rewards = BTreeMap::new();
        rewards.insert((0, 0), 3.0);
        rewards.insert((0, 1), 3.0);
        let m = MdpModel {
            states: vec!["s".to_string()],
            actions: vec!["a".to_string(), "b".to_string()],
            transitions,
            rewards,
            gamma: 0.5,
        };
        let r = value_iteration(&m, 1e-6).unwrap();
        assert_eq!(r.policy, vec![0]);
    }

    #[test]
    fn deterministic_double_run() {
        let m = self_loop(2.5, 0.8);
        let a = value_iteration(&m, 1e-8).unwrap();
        let b = value_iteration(&m, 1e-8).unwrap();
        assert_eq!(a, b); // bit-exact, including sweep count
    }

    #[test]
    fn validation_rejects_bad_models() {
        let mut m = self_loop(1.0, 1.0);
        assert!(value_iteration(&m, 1e-6).is_err()); // gamma = 1
        m.gamma = 0.5;
        m.transitions.insert((0, 0), vec![(0, 0.5)]); // probs sum to 0.5
        assert!(m.validate().is_err());
        let m2 = MdpModel {
            states: vec!["s0".to_string(), "orphan".to_string()],
            actions: vec!["a".to_string()],
            transitions: {
                let mut t = BTreeMap::new();
                t.insert((0, 0), vec![(0, 1.0)]);
                t
            },
            rewards: BTreeMap::new(),
            gamma: 0.5,
        };
        assert!(m2.validate().unwrap_err().contains("no action"));
    }

    #[test]
    fn gamma_zero_is_myopic() {
        let m = self_loop(7.0, 0.0);
        let r = value_iteration(&m, 1e-9).unwrap();
        assert!((r.values[0] - 7.0).abs() < 1e-9);
    }
}
