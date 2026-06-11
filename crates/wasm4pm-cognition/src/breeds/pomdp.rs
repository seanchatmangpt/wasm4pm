//! POMDP: exact Bayes belief update + bounded point-based value iteration
//! (Kaelbling, Littman & Cassandra 1998, "Planning and acting in partially
//! observable stochastic domains", AIJ 101; PBVI: Pineau, Gordon & Thrun 2003).
//!
//! Model facts:
//! - `pomdp:states` / `pomdp:actions` / `pomdp:observations` — comma lists
//! - `pomdp:gamma` — discount in [0,1) (default 0.95)
//! - `pomdp:horizon` — PBVI backup count (default 3, cap 8)
//! - `pomdp:t:<a>:<s>:<s'>` — transition probability
//! - `pomdp:o:<a>:<s'>:<obs>` — observation probability
//! - `pomdp:r:<a>:<s>` — immediate reward (missing = 0)
//! - `pomdp:b0:<s>` — initial belief
//! - `pomdp:step:<i>` = `<action>|<obs>` — observed history to fold in
//!
//! Belief update (exact Bayes filter):
//!   b'(s') = O(o|a,s') · Σ_s T(s'|s,a) · b(s) / P(o|a,b)
//!
//! Latency resolution (per plan): global ≤ 100µs budget is kept via the
//! structural caps — belief points ≤ 16, horizon ≤ 8, refuse
//! |S|·|A|·|O| > 512. The PRD's 50–300µs POMDP budget is recorded as a note
//! in the latency doc; the caps are the paper-sanctioned PBVI approximation
//! knob, not silent truncation.
//!
//! Reuses `support::mdp`: `MdpModel::validate` checks the underlying-MDP
//! invariants and `value_iteration` supplies the QMDP upper bound recorded in
//! the `select-action` trace step.

use crate::breeds::support::mdp::{value_iteration, MdpModel};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeMap;

/// Exact-belief POMDP planner with bounded PBVI.
pub struct Pomdp;

const MAX_PRODUCT: usize = 512;
const MAX_BELIEF_POINTS: usize = 16;
const MAX_HORIZON: usize = 8;

struct Model {
    states: Vec<String>,
    actions: Vec<String>,
    obs: Vec<String>,
    gamma: f64,
    horizon: usize,
    /// t[a][s][s']
    t: Vec<Vec<Vec<f64>>>,
    /// o[a][s'][obs]
    o: Vec<Vec<Vec<f64>>>,
    /// r[a][s]
    r: Vec<Vec<f64>>,
    b0: Vec<f64>,
    /// (action index, observation index) history, in step order.
    history: Vec<(usize, usize)>,
}

fn idx_of(list: &[String], name: &str, what: &str) -> Result<usize, String> {
    list.iter()
        .position(|x| x == name)
        .ok_or_else(|| format!("unknown {} '{}'", what, name))
}

fn parse_model(input: &BreedInput) -> Result<Model, String> {
    let get = |key: &str| -> Option<&str> {
        input
            .facts
            .iter()
            .find(|f| f.key == key)
            .map(|f| f.value.as_str())
    };
    let list = |key: &str| -> Result<Vec<String>, String> {
        Ok(get(key)
            .ok_or_else(|| format!("pomdp requires fact '{}'", key))?
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect())
    };
    let states = list("pomdp:states")?;
    let actions = list("pomdp:actions")?;
    let obs = list("pomdp:observations")?;
    if states.is_empty() || actions.is_empty() || obs.is_empty() {
        return Err("states, actions and observations must be non-empty".to_string());
    }
    let product = states.len() * actions.len() * obs.len();
    if product > MAX_PRODUCT {
        return Err(format!(
            "|S|·|A|·|O| = {} exceeds {} — model refused (PBVI structural cap)",
            product, MAX_PRODUCT
        ));
    }
    let gamma: f64 = get("pomdp:gamma")
        .unwrap_or("0.95")
        .parse()
        .map_err(|_| "bad gamma".to_string())?;
    if !(0.0..1.0).contains(&gamma) {
        return Err(format!("gamma must be in [0,1), got {}", gamma));
    }
    let horizon: usize = get("pomdp:horizon")
        .unwrap_or("3")
        .parse()
        .map_err(|_| "bad horizon".to_string())?;
    if horizon == 0 || horizon > MAX_HORIZON {
        return Err(format!("horizon must be in 1..={}, got {}", MAX_HORIZON, horizon));
    }

    let ns = states.len();
    let na = actions.len();
    let no = obs.len();
    let mut t = vec![vec![vec![0.0; ns]; ns]; na];
    let mut o = vec![vec![vec![0.0; no]; ns]; na];
    let mut r = vec![vec![0.0; ns]; na];
    let mut b0 = vec![0.0; ns];
    let mut steps: Vec<(usize, usize, usize)> = Vec::new(); // (i, a, o)

    for f in &input.facts {
        let parts: Vec<&str> = f.key.split(':').collect();
        match parts.as_slice() {
            ["pomdp", "t", a, s, sp] => {
                let p: f64 = f.value.parse().map_err(|_| format!("bad prob '{}'", f.value))?;
                t[idx_of(&actions, a, "action")?][idx_of(&states, s, "state")?]
                    [idx_of(&states, sp, "state")?] = p;
            }
            ["pomdp", "o", a, sp, ob] => {
                let p: f64 = f.value.parse().map_err(|_| format!("bad prob '{}'", f.value))?;
                o[idx_of(&actions, a, "action")?][idx_of(&states, sp, "state")?]
                    [idx_of(&obs, ob, "observation")?] = p;
            }
            ["pomdp", "r", a, s] => {
                let v: f64 = f.value.parse().map_err(|_| format!("bad reward '{}'", f.value))?;
                r[idx_of(&actions, a, "action")?][idx_of(&states, s, "state")?] = v;
            }
            ["pomdp", "b0", s] => {
                let p: f64 = f.value.parse().map_err(|_| format!("bad prob '{}'", f.value))?;
                b0[idx_of(&states, s, "state")?] = p;
            }
            ["pomdp", "step", i] => {
                let i: usize = i.parse().map_err(|_| format!("bad step index in '{}'", f.key))?;
                let (a, ob) = f
                    .value
                    .split_once('|')
                    .ok_or_else(|| format!("step '{}' must be '<action>|<obs>'", f.key))?;
                steps.push((
                    i,
                    idx_of(&actions, a.trim(), "action")?,
                    idx_of(&obs, ob.trim(), "observation")?,
                ));
            }
            _ => {}
        }
    }

    // Stochasticity checks.
    let close = |x: f64| (x - 1.0).abs() <= 1e-6;
    if !close(b0.iter().sum::<f64>()) {
        return Err("initial belief pomdp:b0 must sum to 1±1e-6".to_string());
    }
    for a in 0..na {
        for s in 0..ns {
            if !close(t[a][s].iter().sum::<f64>()) {
                return Err(format!(
                    "T({},{},·) does not sum to 1±1e-6",
                    actions[a], states[s]
                ));
            }
            if !close(o[a][s].iter().sum::<f64>()) {
                return Err(format!(
                    "O({},{},·) does not sum to 1±1e-6",
                    actions[a], states[s]
                ));
            }
        }
    }
    if steps.len() > 32 {
        return Err("observation history exceeds 32 steps".to_string());
    }
    steps.sort();
    let history = steps.into_iter().map(|(_, a, ob)| (a, ob)).collect();

    Ok(Model {
        states,
        actions,
        obs,
        gamma,
        horizon,
        t,
        o,
        r,
        b0,
        history,
    })
}

/// Exact Bayes belief update; returns Err on a zero-probability observation.
fn belief_update(m: &Model, b: &[f64], a: usize, ob: usize) -> Result<Vec<f64>, String> {
    let ns = m.states.len();
    let mut bp = vec![0.0; ns];
    for sp in 0..ns {
        let pred: f64 = (0..ns).map(|s| m.t[a][s][sp] * b[s]).sum();
        bp[sp] = m.o[a][sp][ob] * pred;
    }
    let norm: f64 = bp.iter().sum();
    if norm <= 1e-12 {
        return Err(format!(
            "observation '{}' has probability 0 under action '{}'",
            m.obs[ob], m.actions[a]
        ));
    }
    for v in bp.iter_mut() {
        *v /= norm;
    }
    Ok(bp)
}

fn fmt_belief(m: &Model, b: &[f64]) -> String {
    m.states
        .iter()
        .zip(b.iter())
        .map(|(s, p)| format!("{}={:.6}", s, p))
        .collect::<Vec<_>>()
        .join(", ")
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

impl CognitionBreed for Pomdp {
    fn id(&self) -> BreedId {
        BreedId::Pomdp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "bayes_belief_update".to_string(),
            "pbvi".to_string(),
            "partially_observable_planning".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        parse_model(input).map(|_| ())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: BreedId::Pomdp,
            message: m,
        };
        let m = parse_model(input).map_err(err)?;
        let ns = m.states.len();
        let na = m.actions.len();
        let no = m.obs.len();

        // Underlying-MDP validation + QMDP bound via the shared combinator.
        let mdp = MdpModel {
            states: m.states.clone(),
            actions: m.actions.clone(),
            transitions: {
                let mut tr = BTreeMap::new();
                for a in 0..na {
                    for s in 0..ns {
                        tr.insert(
                            (s, a),
                            (0..ns).map(|sp| (sp, m.t[a][s][sp])).collect::<Vec<_>>(),
                        );
                    }
                }
                tr
            },
            rewards: {
                let mut rw = BTreeMap::new();
                for a in 0..na {
                    for s in 0..ns {
                        rw.insert((s, a), m.r[a][s]);
                    }
                }
                rw
            },
            gamma: m.gamma,
        };
        let vi = value_iteration(&mdp, 1e-6).map_err(|e| err(format!("underlying MDP invalid: {}", e)))?;

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |kind: &str, detail: String, trace: &mut Vec<TraceStep>| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        push(
            "parse-model",
            format!("|S|={} |A|={} |O|={} gamma={:.6} horizon={}", ns, na, no, m.gamma, m.horizon),
            &mut trace,
        );

        let mut belief = m.b0.clone();
        push("init-belief", fmt_belief(&m, &belief), &mut trace);

        // Fold in observation history with exact Bayes updates.
        for &(a, ob) in &m.history {
            belief = belief_update(&m, &belief, a, ob).map_err(err)?;
            push(
                "belief-update",
                format!(
                    "a={} o={} -> {}",
                    m.actions[a],
                    m.obs[ob],
                    fmt_belief(&m, &belief)
                ),
                &mut trace,
            );
        }

        // Expand belief point set: b0, history beliefs, then one-step successors.
        let mut points: Vec<Vec<f64>> = vec![m.b0.clone()];
        let mut add_point = |b: &[f64], points: &mut Vec<Vec<f64>>| {
            if points.len() >= MAX_BELIEF_POINTS {
                return;
            }
            let dup = points
                .iter()
                .any(|p| p.iter().zip(b.iter()).map(|(x, y)| (x - y).abs()).sum::<f64>() < 1e-9);
            if !dup {
                points.push(b.to_vec());
            }
        };
        add_point(&belief, &mut points);
        let base = points.clone();
        for b in &base {
            for a in 0..na {
                for ob in 0..no {
                    if let Ok(bp) = belief_update(&m, b, a, ob) {
                        add_point(&bp, &mut points);
                    }
                }
            }
        }
        push(
            "expand-belief-points",
            format!("{} belief points (cap {})", points.len(), MAX_BELIEF_POINTS),
            &mut trace,
        );

        // PBVI backups. Alpha vectors tagged with the action.
        let mut gamma_set: Vec<(usize, Vec<f64>)> = vec![(0, vec![0.0; ns])];
        for h in 0..m.horizon {
            let mut next: Vec<(usize, Vec<f64>)> = Vec::new();
            for b in &points {
                let mut best: Option<(usize, Vec<f64>, f64)> = None;
                for a in 0..na {
                    // alpha_ab = r_a + gamma * sum_o argmax_alpha (b · g_{a,o,alpha})
                    let mut alpha_ab: Vec<f64> = (0..ns).map(|s| m.r[a][s]).collect();
                    for ob in 0..no {
                        let mut best_g: Option<(f64, Vec<f64>)> = None;
                        for (_, alpha) in &gamma_set {
                            let g: Vec<f64> = (0..ns)
                                .map(|s| {
                                    (0..ns)
                                        .map(|sp| m.t[a][s][sp] * m.o[a][sp][ob] * alpha[sp])
                                        .sum()
                                })
                                .collect();
                            let val = dot(b, &g);
                            if best_g.as_ref().map(|(v, _)| val > v + 1e-12).unwrap_or(true) {
                                best_g = Some((val, g));
                            }
                        }
                        if let Some((_, g)) = best_g {
                            for s in 0..ns {
                                alpha_ab[s] += m.gamma * g[s];
                            }
                        }
                    }
                    let val = dot(b, &alpha_ab);
                    if best.as_ref().map(|(_, _, v)| val > v + 1e-12).unwrap_or(true) {
                        best = Some((a, alpha_ab, val));
                    }
                }
                if let Some((a, alpha, _)) = best {
                    let dup = next.iter().any(|(na2, v)| {
                        *na2 == a
                            && v.iter().zip(alpha.iter()).all(|(x, y)| (x - y).abs() < 1e-12)
                    });
                    if !dup {
                        next.push((a, alpha));
                    }
                }
            }
            gamma_set = next;
            let v0 = gamma_set
                .iter()
                .map(|(_, alpha)| dot(&m.b0, alpha))
                .fold(f64::NEG_INFINITY, f64::max);
            push(
                "pbvi-backup",
                format!("h={} |Gamma|={} V(b0)={:.6}", h + 1, gamma_set.len(), v0),
                &mut trace,
            );
        }

        // Select action at the current (post-history) belief; lex-least on ties.
        let mut best_a = 0usize;
        let mut best_v = f64::NEG_INFINITY;
        for (a, alpha) in &gamma_set {
            let v = dot(&belief, alpha);
            if v > best_v + 1e-12 {
                best_v = v;
                best_a = *a;
            }
        }
        let qmdp: f64 = belief.iter().zip(vi.values.iter()).map(|(b, v)| b * v).sum();
        push(
            "select-action",
            format!(
                "action={} V(b)={:.6} (QMDP upper bound {:.6})",
                m.actions[best_a], best_v, qmdp
            ),
            &mut trace,
        );

        let mut facts = vec![
            Fact {
                key: "pomdp:action".to_string(),
                value: m.actions[best_a].clone(),
            },
            Fact {
                key: "pomdp:value".to_string(),
                value: format!("{:.6}", best_v),
            },
        ];
        for (s, p) in m.states.iter().zip(belief.iter()) {
            facts.push(Fact {
                key: format!("pomdp:belief:{}", s),
                value: format!("{:.6}", p),
            });
        }

        Ok(BreedOutput {
            breed: BreedId::Pomdp,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(m.actions[best_a].clone()),
            explanation: format!(
                "POMDP: {} Bayes updates, PBVI horizon {} over {} belief points; action '{}' (V={:.6})",
                m.history.len(),
                m.horizon,
                points.len(),
                m.actions[best_a],
                best_v
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "select-action") {
            return Err("missing select-action step".to_string());
        }
        if !output.facts.iter().any(|f| f.key.starts_with("pomdp:belief:")) {
            return Err("missing pomdp:belief facts".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(k: &str, v: &str) -> Fact {
        Fact {
            key: k.into(),
            value: v.into(),
        }
    }

    /// Kaelbling/Littman/Cassandra 1998 tiger problem.
    pub fn tiger_facts() -> Vec<Fact> {
        let mut f = vec![
            fact("pomdp:states", "tiger-left,tiger-right"),
            fact("pomdp:actions", "listen,open-left,open-right"),
            fact("pomdp:observations", "hear-left,hear-right"),
            fact("pomdp:gamma", "0.95"),
            fact("pomdp:horizon", "3"),
            fact("pomdp:b0:tiger-left", "0.5"),
            fact("pomdp:b0:tiger-right", "0.5"),
        ];
        // listen: identity transition, 0.85-accurate observation, reward -1.
        for s in ["tiger-left", "tiger-right"] {
            for sp in ["tiger-left", "tiger-right"] {
                f.push(fact(
                    &format!("pomdp:t:listen:{}:{}", s, sp),
                    if s == sp { "1.0" } else { "0.0" },
                ));
            }
            f.push(fact(&format!("pomdp:r:listen:{}", s), "-1.0"));
        }
        f.push(fact("pomdp:o:listen:tiger-left:hear-left", "0.85"));
        f.push(fact("pomdp:o:listen:tiger-left:hear-right", "0.15"));
        f.push(fact("pomdp:o:listen:tiger-right:hear-left", "0.15"));
        f.push(fact("pomdp:o:listen:tiger-right:hear-right", "0.85"));
        // open-*: reset to uniform, uninformative obs.
        for a in ["open-left", "open-right"] {
            for s in ["tiger-left", "tiger-right"] {
                for sp in ["tiger-left", "tiger-right"] {
                    f.push(fact(&format!("pomdp:t:{}:{}:{}", a, s, sp), "0.5"));
                }
                for ob in ["hear-left", "hear-right"] {
                    f.push(fact(&format!("pomdp:o:{}:{}:{}", a, s, ob), "0.5"));
                }
            }
        }
        f.push(fact("pomdp:r:open-left:tiger-left", "-100.0"));
        f.push(fact("pomdp:r:open-left:tiger-right", "10.0"));
        f.push(fact("pomdp:r:open-right:tiger-left", "10.0"));
        f.push(fact("pomdp:r:open-right:tiger-right", "-100.0"));
        f
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "plan".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn tiger_posterior_after_one_hear_left_is_085() {
        let mut f = tiger_facts();
        f.push(fact("pomdp:step:0", "listen|hear-left"));
        let out = Pomdp.run(&input(f)).expect("run ok");
        let b = out
            .facts
            .iter()
            .find(|x| x.key == "pomdp:belief:tiger-left")
            .unwrap();
        // 0.85*0.5 / (0.85*0.5 + 0.15*0.5) = 0.85 exactly.
        assert_eq!(b.value, "0.850000");
    }

    #[test]
    fn tiger_posterior_after_two_hear_left() {
        let mut f = tiger_facts();
        f.push(fact("pomdp:step:0", "listen|hear-left"));
        f.push(fact("pomdp:step:1", "listen|hear-left"));
        let out = Pomdp.run(&input(f)).expect("run ok");
        let b = out
            .facts
            .iter()
            .find(|x| x.key == "pomdp:belief:tiger-left")
            .unwrap();
        // 0.85² / (0.85² + 0.15²) = 0.7225/0.745 = 289/298 = 0.969799 (6 dp).
        assert_eq!(b.value, "0.969799");
    }

    #[test]
    fn tiger_three_hear_left_opens_right_door() {
        let mut f = tiger_facts();
        f.push(fact("pomdp:step:0", "listen|hear-left"));
        f.push(fact("pomdp:step:1", "listen|hear-left"));
        f.push(fact("pomdp:step:2", "listen|hear-left"));
        let out = Pomdp.run(&input(f)).expect("run ok");
        // Belief 0.997 tiger-left: opening the right door dominates listening.
        assert_eq!(out.selected.as_deref(), Some("open-right"));
    }

    #[test]
    fn tampered_o_matrix_shifts_posterior() {
        let mut f = tiger_facts();
        for x in f.iter_mut() {
            if x.key == "pomdp:o:listen:tiger-left:hear-left" {
                x.value = "0.6".into();
            }
            if x.key == "pomdp:o:listen:tiger-left:hear-right" {
                x.value = "0.4".into();
            }
        }
        f.push(fact("pomdp:step:0", "listen|hear-left"));
        let out = Pomdp.run(&input(f)).expect("run ok");
        let b = out
            .facts
            .iter()
            .find(|x| x.key == "pomdp:belief:tiger-left")
            .unwrap();
        // 0.6*0.5 / (0.6*0.5 + 0.15*0.5) = 0.8 — NOT 0.85.
        assert_eq!(b.value, "0.800000");
    }

    #[test]
    fn refuses_oversized_model() {
        let mut f = tiger_facts();
        // 9 states * 8 actions * 8 obs = 576 > 512 — caps must refuse (names only;
        // precondition checks the cap before stochasticity).
        for x in f.iter_mut() {
            if x.key == "pomdp:states" {
                x.value = "s1,s2,s3,s4,s5,s6,s7,s8,s9".into();
            }
            if x.key == "pomdp:actions" {
                x.value = "a1,a2,a3,a4,a5,a6,a7,a8".into();
            }
            if x.key == "pomdp:observations" {
                x.value = "o1,o2,o3,o4,o5,o6,o7,o8".into();
            }
        }
        let e = Pomdp.preconditions(&input(f)).unwrap_err();
        assert!(e.contains("exceeds 512"), "got: {}", e);
    }

    #[test]
    fn refuses_nonstochastic_rows() {
        let mut f = tiger_facts();
        for x in f.iter_mut() {
            if x.key == "pomdp:t:listen:tiger-left:tiger-left" {
                x.value = "0.7".into();
            }
        }
        assert!(Pomdp.preconditions(&input(f)).is_err());
    }
}
