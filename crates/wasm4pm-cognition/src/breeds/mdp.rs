//! MDP: value iteration to the Bellman fixed point (Bellman, "Dynamic
//! Programming", Princeton University Press, 1957). Wraps the proven
//! `support::mdp::value_iteration` combinator.
//!
//! Model facts:
//! - `mdp:gamma`             value `<f64>`          — discount γ ∈ [0,1)
//! - `mdp:trans:<s>:<a>`     value `s':p;s'':p`     — transition distribution
//! - `mdp:reward:<s>:<a>`    value `<f64>`          — immediate reward (default 0)
//!
//! States and actions are induced from the trans facts (sorted lex). Per-(s,a)
//! probabilities must sum to 1 ± 1e-6 (precondition; enforced again by
//! `MdpModel::validate`).

use std::collections::{BTreeMap, BTreeSet};

use crate::breeds::support::mdp::{value_iteration, MdpModel};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};

/// Maximum number of states.
const MAX_STATES: usize = 16;
/// Value-iteration accuracy: ‖V − V*‖∞ < EPSILON.
const EPSILON: f64 = 1e-6;

/// MDP value-iteration breed.
pub struct Mdp;

fn parse_model(input: &BreedInput) -> Result<MdpModel, String> {
    let mut gamma: Option<f64> = None;
    let mut state_names: BTreeSet<String> = BTreeSet::new();
    let mut action_names: BTreeSet<String> = BTreeSet::new();
    let mut raw_trans: Vec<(String, String, String)> = Vec::new();
    let mut raw_rewards: Vec<(String, String, f64)> = Vec::new();

    for f in &input.facts {
        if f.key == "mdp:gamma" {
            gamma = Some(
                f.value
                    .trim()
                    .parse()
                    .map_err(|_| format!("malformed mdp:gamma '{}'", f.value))?,
            );
        } else if let Some(rest) = f.key.strip_prefix("mdp:trans:") {
            let (s, a) = rest
                .split_once(':')
                .ok_or_else(|| format!("malformed mdp:trans key '{}'", f.key))?;
            state_names.insert(s.to_string());
            action_names.insert(a.to_string());
            for part in f.value.split(';').map(str::trim).filter(|p| !p.is_empty()) {
                let (ns, _) = part
                    .split_once(':')
                    .ok_or_else(|| format!("malformed transition '{}' (need s:p)", part))?;
                state_names.insert(ns.trim().to_string());
            }
            raw_trans.push((s.to_string(), a.to_string(), f.value.clone()));
        } else if let Some(rest) = f.key.strip_prefix("mdp:reward:") {
            let (s, a) = rest
                .split_once(':')
                .ok_or_else(|| format!("malformed mdp:reward key '{}'", f.key))?;
            let r: f64 = f
                .value
                .trim()
                .parse()
                .map_err(|_| format!("malformed reward '{}'", f.value))?;
            raw_rewards.push((s.to_string(), a.to_string(), r));
        }
    }

    let gamma = gamma.ok_or("missing mdp:gamma fact")?;
    if raw_trans.is_empty() {
        return Err("mdp requires at least one mdp:trans:<s>:<a> fact".to_string());
    }
    if state_names.len() > MAX_STATES {
        return Err(format!(
            "state count {} exceeds cap {}",
            state_names.len(),
            MAX_STATES
        ));
    }

    let states: Vec<String> = state_names.into_iter().collect();
    let actions: Vec<String> = action_names.into_iter().collect();
    let sid = |n: &str| states.iter().position(|x| x == n);
    let aid = |n: &str| actions.iter().position(|x| x == n);

    let mut transitions: BTreeMap<(usize, usize), Vec<(usize, f64)>> = BTreeMap::new();
    for (s, a, spec) in &raw_trans {
        let si = sid(s).ok_or_else(|| format!("unknown state '{}'", s))?;
        let ai = aid(a).ok_or_else(|| format!("unknown action '{}'", a))?;
        let mut nexts: Vec<(usize, f64)> = Vec::new();
        for part in spec.split(';').map(str::trim).filter(|p| !p.is_empty()) {
            let (ns, p) = part.split_once(':').unwrap();
            let ni = sid(ns.trim()).ok_or_else(|| format!("unknown next state '{}'", ns))?;
            let prob: f64 = p
                .trim()
                .parse()
                .map_err(|_| format!("malformed probability '{}'", p))?;
            nexts.push((ni, prob));
        }
        transitions.insert((si, ai), nexts);
    }
    let mut rewards: BTreeMap<(usize, usize), f64> = BTreeMap::new();
    for (s, a, r) in &raw_rewards {
        let si = sid(s).ok_or_else(|| format!("unknown reward state '{}'", s))?;
        let ai = aid(a).ok_or_else(|| format!("unknown reward action '{}'", a))?;
        rewards.insert((si, ai), *r);
    }

    Ok(MdpModel {
        states,
        actions,
        transitions,
        rewards,
        gamma,
    })
}

impl CognitionBreed for Mdp {
    fn id(&self) -> BreedId {
        BreedId::Mdp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "value-iteration".to_string(),
            "bellman-fixed-point".to_string(),
            "greedy-policy-extraction".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let model = parse_model(input)?;
        model.validate()
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let model = parse_model(input).map_err(|m| BreedError {
            breed: BreedId::Mdp,
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

        model.validate().map_err(|m| BreedError {
            breed: BreedId::Mdp,
            message: m,
        })?;
        tr(
            &mut trace,
            "validate-model",
            format!(
                "{} states, {} actions, gamma={:.6}",
                model.states.len(),
                model.actions.len(),
                model.gamma
            ),
            0,
        );

        let result = value_iteration(&model, EPSILON).map_err(|m| BreedError {
            breed: BreedId::Mdp,
            message: m,
        })?;

        // Emit one sweep step per performed sweep (bounded summary granularity:
        // when sweeps exceed 64, emit every ceil(n/64)-th sweep marker).
        let stride = result.sweeps.div_ceil(64).max(1);
        for i in (0..result.sweeps).step_by(stride) {
            tr(&mut trace, "sweep", format!("sweep {}", i + 1), 1);
        }
        tr(
            &mut trace,
            "converged",
            format!(
                "{} sweeps, residual={:.3e} (threshold eps={:.0e})",
                result.sweeps, result.residual, EPSILON
            ),
            0,
        );

        let mut facts: Vec<Fact> = Vec::new();
        for (i, s) in model.states.iter().enumerate() {
            facts.push(Fact {
                key: format!("mdp:value:{}", s),
                value: format!("{:.6}", result.values[i]),
            });
        }
        for (i, s) in model.states.iter().enumerate() {
            let a = &model.actions[result.policy[i]];
            tr(&mut trace, "extract-policy", format!("{} -> {}", s, a), 1);
            facts.push(Fact {
                key: format!("mdp:policy:{}", s),
                value: a.clone(),
            });
        }

        let policy_str = model
            .states
            .iter()
            .enumerate()
            .map(|(i, s)| format!("{}:{}", s, model.actions[result.policy[i]]))
            .collect::<Vec<_>>()
            .join(",");

        Ok(BreedOutput {
            breed: BreedId::Mdp,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(policy_str),
            explanation: format!(
                "Value iteration converged in {} sweeps (residual {:.3e}); greedy policy extracted.",
                result.sweeps, result.residual
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace (FM-5 fraud signal)".to_string());
        }
        if output.inference_trace.first().map(|t| t.kind.as_str()) != Some("validate-model") {
            return Err("first step must be 'validate-model'".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "converged") {
            return Err("missing 'converged' step".to_string());
        }
        if !output.facts.iter().any(|f| f.key.starts_with("mdp:policy:")) {
            return Err("missing mdp:policy fact".to_string());
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
            intent: "solve mdp".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// Closed form: single self-loop state, R=1, γ=0.5 → V = R/(1−γ) = 2 exactly.
    #[test]
    fn closed_form_self_loop() {
        let out = Mdp
            .run(&input(vec![
                fact("mdp:gamma", "0.5"),
                fact("mdp:trans:s1:loop", "s1:1.0"),
                fact("mdp:reward:s1:loop", "1.0"),
            ]))
            .unwrap();
        let v: f64 = out
            .facts
            .iter()
            .find(|f| f.key == "mdp:value:s1")
            .unwrap()
            .value
            .parse()
            .unwrap();
        assert!((v - 2.0).abs() < 1e-4, "V(s1) = {} != 2", v);
    }

    /// Bellman residual at every state < 1e-4 (fixed-point identity).
    #[test]
    fn bellman_residual_everywhere() {
        let facts = vec![
            fact("mdp:gamma", "0.9"),
            fact("mdp:trans:s0:go", "s1:1.0"),
            fact("mdp:trans:s0:stay", "s0:1.0"),
            fact("mdp:reward:s0:stay", "0.1"),
            fact("mdp:trans:s1:go", "goal:1.0"),
            fact("mdp:reward:s1:go", "2.0"),
            fact("mdp:trans:goal:stay", "goal:1.0"),
        ];
        let model = parse_model(&input(facts.clone())).unwrap();
        let out = Mdp.run(&input(facts)).unwrap();
        let v: Vec<f64> = model
            .states
            .iter()
            .map(|s| {
                out.facts
                    .iter()
                    .find(|f| f.key == format!("mdp:value:{}", s))
                    .unwrap()
                    .value
                    .parse()
                    .unwrap()
            })
            .collect();
        for s in 0..model.states.len() {
            let best = model
                .actions_in(s)
                .iter()
                .map(|&a| model.q_value(s, a, &v))
                .fold(f64::NEG_INFINITY, f64::max);
            assert!(
                (best - v[s]).abs() < 1e-4,
                "Bellman residual at state {} is {}",
                s,
                (best - v[s]).abs()
            );
        }
        // Optimal policy: go beats stay at s0 (1.8 > 1.0).
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "mdp:policy:s0" && f.value == "go"));
    }

    #[test]
    fn refuses_bad_probabilities() {
        let inp = input(vec![
            fact("mdp:gamma", "0.5"),
            fact("mdp:trans:s1:a", "s1:0.5"),
        ]);
        assert!(Mdp.preconditions(&inp).is_err());
    }

    #[test]
    fn refuses_gamma_one() {
        let inp = input(vec![
            fact("mdp:gamma", "1.0"),
            fact("mdp:trans:s1:a", "s1:1.0"),
        ]);
        assert!(Mdp.preconditions(&inp).is_err());
    }
}
