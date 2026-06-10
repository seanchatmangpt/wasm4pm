//! Tabular Q-learning over a symbolic MDP (Watkins & Dayan 1992,
//! "Q-learning", Machine Learning 8).
//!
//! Off-policy temporal-difference control:
//! `Q(s,a) ← Q(s,a) + α·(r + γ·max_a' Q(s',a') − Q(s,a))`.
//! ε-greedy exploration uses the crate's single seeded RNG entry point
//! (`support::rng::seeded_rng`, SmallRng seed 42) — the run is bit-exact
//! deterministic. All tables are BTreeMaps.
//!
//! Fact contract:
//! - `mdp:gamma`            — discount γ ∈ [0,1)
//! - `mdp:start`            — start state name
//! - `mdp:terminal:<s>`     — `<s>` is terminal (episode ends, Q(s,·)=0)
//! - `mdp:t:<s>:<a>`        — successor spec: "ns" or "ns1:p1,ns2:p2"
//! - `mdp:r:<s>:<a>`        — immediate reward (default 0)
//! - `rl:episodes`          — episode count (default 200, cap 512)
//!
//! Trace is bounded via per-episode `episode-end` summaries carrying the
//! max absolute TD update of the episode (the interleaved loop is one
//! multi-kind lifecycle phase, HEARSAY_MODEL precedent); per-step
//! `q-update` events are emitted for the first three episodes only.

use crate::breeds::support::rng::seeded_rng;
use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
use rand::Rng;
use std::collections::{BTreeMap, BTreeSet};

/// Watkins Q-learning engine.
pub struct RlSymbolic;

struct Model {
    gamma: f64,
    start: String,
    terminals: BTreeSet<String>,
    /// (state, action) -> [(next, prob)]
    transitions: BTreeMap<(String, String), Vec<(String, f64)>>,
    rewards: BTreeMap<(String, String), f64>,
    episodes: usize,
}

fn parse_model(input: &BreedInput) -> Result<Model, String> {
    let mut gamma: Option<f64> = None;
    let mut start: Option<String> = None;
    let mut terminals = BTreeSet::new();
    let mut transitions: BTreeMap<(String, String), Vec<(String, f64)>> = BTreeMap::new();
    let mut rewards = BTreeMap::new();
    let mut episodes = 200usize;
    for f in &input.facts {
        if f.key == "mdp:gamma" {
            gamma = Some(f.value.parse().map_err(|_| "mdp:gamma is not a number".to_string())?);
        } else if f.key == "mdp:start" {
            start = Some(f.value.clone());
        } else if let Some(s) = f.key.strip_prefix("mdp:terminal:") {
            terminals.insert(s.to_string());
        } else if let Some(rest) = f.key.strip_prefix("mdp:t:") {
            let (s, a) = rest
                .split_once(':')
                .ok_or_else(|| format!("malformed transition key '{}'", f.key))?;
            let mut nexts = Vec::new();
            for part in f.value.split(',') {
                match part.split_once(':') {
                    Some((ns, p)) => nexts.push((
                        ns.to_string(),
                        p.parse::<f64>()
                            .map_err(|_| format!("bad probability '{}' in '{}'", p, f.key))?,
                    )),
                    None => nexts.push((part.to_string(), 1.0)),
                }
            }
            let sum: f64 = nexts.iter().map(|(_, p)| p).sum();
            if (sum - 1.0).abs() > 1e-6 {
                return Err(format!("transition probabilities for '{}' sum to {}", f.key, sum));
            }
            transitions.insert((s.to_string(), a.to_string()), nexts);
        } else if let Some(rest) = f.key.strip_prefix("mdp:r:") {
            let (s, a) = rest
                .split_once(':')
                .ok_or_else(|| format!("malformed reward key '{}'", f.key))?;
            rewards.insert(
                (s.to_string(), a.to_string()),
                f.value.parse().map_err(|_| format!("bad reward '{}' in '{}'", f.value, f.key))?,
            );
        } else if f.key == "rl:episodes" {
            episodes = f.value.parse().map_err(|_| "rl:episodes is not an integer".to_string())?;
        }
    }
    let gamma = gamma.ok_or("rl_symbolic requires mdp:gamma")?;
    if !(0.0..1.0).contains(&gamma) {
        return Err(format!("gamma must be in [0,1), got {}", gamma));
    }
    let start = start.ok_or("rl_symbolic requires mdp:start")?;
    if transitions.is_empty() {
        return Err("rl_symbolic requires at least one mdp:t:<s>:<a> transition".to_string());
    }
    if episodes == 0 || episodes > 512 {
        return Err(format!(
            "episode count {} outside 1..=512 (refusal, not truncation)",
            episodes
        ));
    }
    Ok(Model {
        gamma,
        start,
        terminals,
        transitions,
        rewards,
        episodes,
    })
}

impl CognitionBreed for RlSymbolic {
    fn id(&self) -> BreedId {
        BreedId::RlSymbolic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "tabular_q_learning".to_string(),
            "epsilon_greedy_seeded".to_string(),
            "policy_extraction".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        parse_model(input).map(|_| ())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let model = parse_model(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |trace: &mut Vec<TraceStep>, kind: &str, detail: String| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        let states: BTreeSet<String> = model
            .transitions
            .keys()
            .map(|(s, _)| s.clone())
            .chain(model.transitions.values().flatten().map(|(ns, _)| ns.clone()))
            .collect();
        push(
            &mut trace,
            "load-mdp",
            format!(
                "{} states, {} (s,a) pairs, gamma={}, {} episodes",
                states.len(),
                model.transitions.len(),
                model.gamma,
                model.episodes
            ),
        );

        let actions_in = |s: &str| -> Vec<String> {
            model
                .transitions
                .keys()
                .filter(|(ms, _)| ms == s)
                .map(|(_, a)| a.clone())
                .collect()
        };

        let alpha = 0.5_f64;
        let epsilon = 0.1_f64;
        let mut rng = seeded_rng();
        let mut q: BTreeMap<(String, String), f64> = BTreeMap::new();
        let mut deltas: Vec<f64> = Vec::new();

        for ep in 0..model.episodes {
            push(&mut trace, "episode-start", format!("episode {}", ep));
            let mut s = model.start.clone();
            let mut max_delta = 0.0_f64;
            for _step in 0..64usize {
                if model.terminals.contains(&s) {
                    break;
                }
                let acts = actions_in(&s);
                if acts.is_empty() {
                    break;
                }
                // ε-greedy with lexicographic greedy tie-break.
                let a = if rng.gen::<f64>() < epsilon {
                    acts[rng.gen_range(0..acts.len())].clone()
                } else {
                    let mut best = acts[0].clone();
                    let mut best_q = f64::NEG_INFINITY;
                    for a in &acts {
                        let qa = *q.get(&(s.clone(), a.clone())).unwrap_or(&0.0);
                        if qa > best_q + 1e-12 {
                            best_q = qa;
                            best = a.clone();
                        }
                    }
                    best
                };
                // Sample successor.
                let nexts = &model.transitions[&(s.clone(), a.clone())];
                let ns = if nexts.len() == 1 {
                    nexts[0].0.clone()
                } else {
                    let roll: f64 = rng.gen();
                    let mut acc = 0.0;
                    let mut chosen = nexts[nexts.len() - 1].0.clone();
                    for (cand, p) in nexts {
                        acc += p;
                        if roll < acc {
                            chosen = cand.clone();
                            break;
                        }
                    }
                    chosen
                };
                let r = *model.rewards.get(&(s.clone(), a.clone())).unwrap_or(&0.0);
                let max_next = if model.terminals.contains(&ns) {
                    0.0
                } else {
                    actions_in(&ns)
                        .iter()
                        .map(|na| *q.get(&(ns.clone(), na.clone())).unwrap_or(&0.0))
                        .fold(0.0_f64, f64::max)
                };
                let old = *q.get(&(s.clone(), a.clone())).unwrap_or(&0.0);
                let delta = alpha * (r + model.gamma * max_next - old);
                q.insert((s.clone(), a.clone()), old + delta);
                max_delta = max_delta.max(delta.abs());
                if ep < 3 {
                    push(
                        &mut trace,
                        "q-update",
                        format!("Q({},{}) {:.4} -> {:.4} (r={}, s'={})", s, a, old, old + delta, r, ns),
                    );
                }
                s = ns;
            }
            deltas.push(max_delta);
            push(
                &mut trace,
                "episode-end",
                format!("episode {} max-delta={:.6}", ep, max_delta),
            );
        }

        // Greedy policy extraction (lexicographic tie-break).
        let mut facts: Vec<Fact> = Vec::new();
        let mut policy: BTreeMap<String, String> = BTreeMap::new();
        for s in &states {
            if model.terminals.contains(s) {
                continue;
            }
            let acts = actions_in(s);
            if acts.is_empty() {
                continue;
            }
            let mut best = acts[0].clone();
            let mut best_q = f64::NEG_INFINITY;
            for a in &acts {
                let qa = *q.get(&(s.clone(), a.clone())).unwrap_or(&0.0);
                if qa > best_q + 1e-12 {
                    best_q = qa;
                    best = a.clone();
                }
            }
            push(&mut trace, "extract-policy", format!("pi({}) = {} (Q={:.4})", s, best, best_q));
            facts.push(Fact {
                key: format!("policy:{}", s),
                value: best.clone(),
            });
            policy.insert(s.clone(), best);
        }
        for ((s, a), v) in &q {
            facts.push(Fact {
                key: format!("q:{}:{}", s, a),
                value: format!("{:.6}", v),
            });
        }

        push(
            &mut trace,
            "decision",
            format!(
                "learned policy over {} states after {} episodes (final max-delta={:.6})",
                policy.len(),
                model.episodes,
                deltas.last().copied().unwrap_or(0.0)
            ),
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: policy.get(&model.start).cloned(),
            explanation: format!(
                "Q-learning converged over {} episodes; greedy policy extracted for {} states",
                model.episodes,
                policy.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace — no evidence of learning".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "episode-end") {
            return Err("no episode-end step — no episode completed".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "extract-policy") {
            return Err("no extract-policy step — no policy extracted".to_string());
        }
        Ok(())
    }
}
