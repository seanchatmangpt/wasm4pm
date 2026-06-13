//! CTL model checking by fixed-point labeling (Clarke, Emerson & Sistla
//! 1986, "Automatic verification of finite-state concurrent systems using
//! temporal logic specifications", ACM TOPLAS 8(2)).
//!
//! The checker labels every state with the subformulas it satisfies, using
//! the existential normal-form base { EX, EU, EG }:
//! - `EX p`        — pre-image of the p-states
//! - `E(p U q)`    — least fixed point: q ∪ (p ∩ EX ·)
//! - `EG p`        — greatest fixed point: p ∩ EX ·
//! Universal operators reduce by duality (AX p = ¬EX¬p, AF p = ¬EG¬p,
//! AG p = ¬E(true U ¬p), A(p U q) = ¬E(¬q U (¬p∧¬q)) ∧ ¬EG¬q).
//!
//! Counterexamples (emitted edge-by-edge as `counterexample-step`):
//! - failing `AG p`: a shortest path from init to a ¬p state
//! - failing `AF p`: a lasso inside EG¬p (path + cycle)
//! - failing `AX p`: a single edge to a ¬p successor
//!
//! Fact contract: `ts:init` (initial state), `ts:edge:<s>` = "t1,t2",
//! `ts:label:<s>` = "p,q", `ctl:formula` = formula text (shared Pratt
//! parser; `A`/`E` must wrap a temporal operator). Caps (refusals):
//! ≤64 states; the transition relation must be total.

use crate::breeds::support::breed_class::VerifierBreed;
use crate::breeds::support::formula::Formula;
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Clarke–Emerson–Sistla CTL labeling checker.
pub struct CtlCheck;

struct Ts {
    states: Vec<String>,
    index: BTreeMap<String, usize>,
    succ: Vec<Vec<usize>>,
    labels: Vec<BTreeSet<String>>,
    init: usize,
}

fn parse_ts(input: &BreedInput) -> Result<(Ts, String), String> {
    let mut names: BTreeSet<String> = BTreeSet::new();
    let mut edges: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut labels: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut init: Option<String> = None;
    let mut formula: Option<String> = None;
    for f in &input.facts {
        if f.key == "ts:init" {
            init = Some(f.value.clone());
            names.insert(f.value.clone());
        } else if let Some(s) = f.key.strip_prefix("ts:edge:") {
            names.insert(s.to_string());
            let targets: Vec<String> = f
                .value
                .split(',')
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .collect();
            for t in &targets {
                names.insert(t.clone());
            }
            edges.entry(s.to_string()).or_default().extend(targets);
        } else if let Some(s) = f.key.strip_prefix("ts:label:") {
            names.insert(s.to_string());
            labels.entry(s.to_string()).or_default().extend(
                f.value
                    .split(',')
                    .map(|a| a.trim().to_string())
                    .filter(|a| !a.is_empty()),
            );
        } else if f.key == "ctl:formula" {
            formula = Some(f.value.clone());
        }
    }
    let formula = formula.ok_or("ctl_check requires a ctl:formula fact")?;
    if names.is_empty() {
        return Err("ctl_check requires a transition system (ts:edge:<s> facts)".to_string());
    }
    if names.len() > 64 {
        return Err(format!(
            "complexity cap exceeded: {} states > 64 (refusal, not truncation)",
            names.len()
        ));
    }
    let states: Vec<String> = names.into_iter().collect();
    let index: BTreeMap<String, usize> = states
        .iter()
        .enumerate()
        .map(|(i, s)| (s.clone(), i))
        .collect();
    let mut succ: Vec<Vec<usize>> = vec![Vec::new(); states.len()];
    for (s, ts) in &edges {
        for t in ts {
            succ[index[s]].push(index[t]);
        }
    }
    for v in &mut succ {
        v.sort_unstable();
        v.dedup();
    }
    if let Some(s) = succ.iter().position(|v| v.is_empty()) {
        return Err(format!(
            "transition relation is not total: state '{}' has no successor",
            states[s]
        ));
    }
    let init = init.unwrap_or_else(|| states[0].clone());
    let init = *index
        .get(&init)
        .ok_or_else(|| format!("ts:init '{}' is not a known state", init))?;
    let labels: Vec<BTreeSet<String>> = states
        .iter()
        .map(|s| labels.get(s).cloned().unwrap_or_default())
        .collect();
    Ok((
        Ts {
            states,
            index,
            succ,
            labels,
            init,
        },
        formula,
    ))
}

struct Checker<'a> {
    ts: &'a Ts,
    trace: Vec<TraceStep>,
}

impl<'a> Checker<'a> {
    fn push(&mut self, kind: &str, detail: String) {
        self.trace.push(TraceStep {
            step: self.trace.len(),
            kind: kind.to_string(),
            detail,
            depth: 0,
            objects: vec![],
        });
    }

    fn all(&self) -> BTreeSet<usize> {
        (0..self.ts.states.len()).collect()
    }

    fn complement(&self, s: &BTreeSet<usize>) -> BTreeSet<usize> {
        self.all().difference(s).copied().collect()
    }

    /// Pre-image: states with at least one successor in `s`.
    fn ex(&self, s: &BTreeSet<usize>) -> BTreeSet<usize> {
        (0..self.ts.states.len())
            .filter(|&i| self.ts.succ[i].iter().any(|t| s.contains(t)))
            .collect()
    }

    /// Least fixed point for E(p U q).
    fn eu(&mut self, p: &BTreeSet<usize>, q: &BTreeSet<usize>) -> BTreeSet<usize> {
        let mut z = q.clone();
        loop {
            let pre = self.ex(&z);
            let next: BTreeSet<usize> = z
                .union(&p.intersection(&pre).copied().collect())
                .copied()
                .collect();
            self.push("fixpoint-iterate", format!("EU lfp |Z|={}", next.len()));
            if next == z {
                return z;
            }
            z = next;
        }
    }

    /// Greatest fixed point for EG p.
    fn eg(&mut self, p: &BTreeSet<usize>) -> BTreeSet<usize> {
        let mut z = p.clone();
        loop {
            let pre = self.ex(&z);
            let next: BTreeSet<usize> = z.intersection(&pre).copied().collect();
            self.push("fixpoint-iterate", format!("EG gfp |Z|={}", next.len()));
            if next == z {
                return z;
            }
            z = next;
        }
    }

    fn eval(&mut self, f: &Formula) -> Result<BTreeSet<usize>, String> {
        let sat = match f {
            Formula::True => self.all(),
            Formula::False => BTreeSet::new(),
            Formula::Atom(a) => (0..self.ts.states.len())
                .filter(|&i| self.ts.labels[i].contains(a))
                .collect(),
            Formula::Not(a) => {
                let s = self.eval(a)?;
                self.complement(&s)
            }
            Formula::And(a, b) => {
                let sa = self.eval(a)?;
                let sb = self.eval(b)?;
                sa.intersection(&sb).copied().collect()
            }
            Formula::Or(a, b) => {
                let sa = self.eval(a)?;
                let sb = self.eval(b)?;
                sa.union(&sb).copied().collect()
            }
            Formula::Implies(a, b) => {
                let sa = self.eval(a)?;
                let sb = self.eval(b)?;
                self.complement(&sa).union(&sb).copied().collect()
            }
            Formula::ExistsPath(inner) => match inner.as_ref() {
                Formula::Next(p) => {
                    let sp = self.eval(p)?;
                    self.ex(&sp)
                }
                Formula::Until(p, q) => {
                    let sp = self.eval(p)?;
                    let sq = self.eval(q)?;
                    self.eu(&sp, &sq)
                }
                Formula::Eventually(p) => {
                    let sp = self.eval(p)?;
                    let all = self.all();
                    self.eu(&all, &sp)
                }
                Formula::Globally(p) => {
                    let sp = self.eval(p)?;
                    self.eg(&sp)
                }
                Formula::Release(p, q) => {
                    // E(p R q) = ¬A(¬p U ¬q)
                    let a = Formula::AllPaths(Box::new(Formula::Until(
                        Box::new(Formula::Not(p.clone())),
                        Box::new(Formula::Not(q.clone())),
                    )));
                    let s = self.eval(&a)?;
                    self.complement(&s)
                }
                other => return Err(format!("E must wrap a temporal operator, got {}", other)),
            },
            Formula::AllPaths(inner) => match inner.as_ref() {
                Formula::Next(p) => {
                    // AX p = ¬EX¬p
                    let sp = self.eval(p)?;
                    let np = self.complement(&sp);
                    let exnp = self.ex(&np);
                    self.complement(&exnp)
                }
                Formula::Eventually(p) => {
                    // AF p = ¬EG¬p
                    let sp = self.eval(p)?;
                    let np = self.complement(&sp);
                    let egnp = self.eg(&np);
                    self.complement(&egnp)
                }
                Formula::Globally(p) => {
                    // AG p = ¬E(true U ¬p)
                    let sp = self.eval(p)?;
                    let np = self.complement(&sp);
                    let all = self.all();
                    let efnp = self.eu(&all, &np);
                    self.complement(&efnp)
                }
                Formula::Until(p, q) => {
                    // A(p U q) = ¬E(¬q U (¬p∧¬q)) ∧ ¬EG¬q
                    let sp = self.eval(p)?;
                    let sq = self.eval(q)?;
                    let np = self.complement(&sp);
                    let nq = self.complement(&sq);
                    let both: BTreeSet<usize> = np.intersection(&nq).copied().collect();
                    let e1 = self.eu(&nq, &both);
                    let e2 = self.eg(&nq);
                    let bad: BTreeSet<usize> = e1.union(&e2).copied().collect();
                    self.complement(&bad)
                }
                Formula::Release(p, q) => {
                    // A(p R q) = ¬E(¬p U ¬q)
                    let np = Formula::Not(p.clone());
                    let nq = Formula::Not(q.clone());
                    let snp = self.eval(&np)?;
                    let snq = self.eval(&nq)?;
                    let e = self.eu(&snp, &snq);
                    self.complement(&e)
                }
                other => return Err(format!("A must wrap a temporal operator, got {}", other)),
            },
            Formula::Next(_)
            | Formula::Eventually(_)
            | Formula::Globally(_)
            | Formula::Until(_, _)
            | Formula::Release(_, _) => {
                return Err(format!(
                "'{}' is a path formula — every temporal operator must be wrapped by A or E in CTL",
                f
            ))
            }
        };
        self.push(
            "label-states",
            format!("[{}] holds in {} states", f, sat.len()),
        );
        Ok(sat)
    }
}

/// BFS shortest path from `from` to any state in `goal`.
fn bfs_path(ts: &Ts, from: usize, goal: &BTreeSet<usize>) -> Option<Vec<usize>> {
    let mut prev: BTreeMap<usize, usize> = BTreeMap::new();
    let mut seen: BTreeSet<usize> = BTreeSet::new();
    let mut queue = std::collections::VecDeque::new();
    queue.push_back(from);
    seen.insert(from);
    while let Some(s) = queue.pop_front() {
        if goal.contains(&s) {
            let mut path = vec![s];
            let mut cur = s;
            while let Some(&p) = prev.get(&cur) {
                path.push(p);
                cur = p;
            }
            path.reverse();
            return Some(path);
        }
        for &t in &ts.succ[s] {
            if seen.insert(t) {
                prev.insert(t, s);
                queue.push_back(t);
            }
        }
    }
    None
}

impl VerifierBreed for CtlCheck {
    fn valid_verdicts(&self) -> &'static [&'static str] {
        &["holds", "fails"]
    }
}

impl CognitionBreed for CtlCheck {
    fn id(&self) -> BreedId {
        BreedId::CtlCheck
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "ctl_fixed_point_labeling".to_string(),
            "counterexample_generation".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let (_, formula) = parse_ts(input)?;
        Formula::parse(&formula).map_err(|e| format!("formula parse error: {}", e))?;
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: self.id(),
            message: m,
        };
        let (ts, formula_text) = parse_ts(input).map_err(&err)?;
        let formula = Formula::parse(&formula_text)
            .map_err(|e| err(format!("formula parse error: {}", e)))?;

        let mut checker = Checker {
            ts: &ts,
            trace: Vec::new(),
        };
        checker.push(
            "parse-formula",
            format!(
                "{} over {} states (init={})",
                formula,
                ts.states.len(),
                ts.states[ts.init]
            ),
        );
        let sat = checker.eval(&formula).map_err(&err)?;
        let holds = sat.contains(&ts.init);

        // Counterexample emission for failing top-level A-formulas.
        let mut cex_facts: Vec<Fact> = Vec::new();
        if !holds {
            if let Formula::AllPaths(inner) = &formula {
                let path: Option<Vec<usize>> = match inner.as_ref() {
                    Formula::Globally(p) => {
                        // Witness for E F ¬p: shortest path to a ¬p state.
                        let sp = checker.eval(p).map_err(&err)?;
                        let np = checker.complement(&sp);
                        bfs_path(&ts, ts.init, &np)
                    }
                    Formula::Eventually(p) => {
                        // Witness for EG¬p: path inside EG¬p until a state repeats (lasso).
                        let sp = checker.eval(p).map_err(&err)?;
                        let np = checker.complement(&sp);
                        let egnp = checker.eg(&np);
                        let mut path = vec![ts.init];
                        let mut seen = BTreeSet::new();
                        seen.insert(ts.init);
                        let mut cur = ts.init;
                        loop {
                            let next = ts.succ[cur].iter().copied().find(|t| egnp.contains(t));
                            match next {
                                Some(t) => {
                                    path.push(t);
                                    cur = t;
                                    if !seen.insert(t) {
                                        break; // lasso closed
                                    }
                                }
                                None => break,
                            }
                        }
                        Some(path)
                    }
                    Formula::Next(p) => {
                        let sp = checker.eval(p).map_err(&err)?;
                        ts.succ[ts.init]
                            .iter()
                            .copied()
                            .find(|t| !sp.contains(t))
                            .map(|t| vec![ts.init, t])
                    }
                    _ => None,
                };
                if let Some(path) = path {
                    for (i, w) in path.windows(2).enumerate() {
                        let edge = format!("{}->{}", ts.states[w[0]], ts.states[w[1]]);
                        checker.push("counterexample-step", edge.clone());
                        cex_facts.push(Fact {
                            key: format!("cex:{}", i),
                            value: edge,
                        });
                    }
                }
            }
        }

        checker.push(
            "decision",
            format!(
                "{} {} at init state {}",
                formula,
                if holds { "HOLDS" } else { "FAILS" },
                ts.states[ts.init]
            ),
        );
        let _ = &ts.index;

        let mut facts = vec![Fact {
            key: "ctl:verdict".to_string(),
            value: if holds {
                "holds".to_string()
            } else {
                "fails".to_string()
            },
        }];
        facts.extend(cex_facts);

        let trace = checker.trace;
        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: Some(if holds {
                "holds".to_string()
            } else {
                "fails".to_string()
            }),
            explanation: format!(
                "CTL labeling decided '{}' {} at '{}' over {} states",
                formula,
                if holds { "holds" } else { "fails" },
                ts.states[ts.init],
                ts.states.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        self.assert_verdict_valid(output)?;
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["label-states"])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, Fact};

    #[test]
    fn refuses_missing_formula() {
        let breed = CtlCheck;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "ts:init".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s0".into(),
                    value: "s0".into(),
                },
            ],
            ..Default::default()
        };
        assert!(breed.preconditions(&input).is_err() || breed.run(&input).is_err());
    }

    #[test]
    fn refuses_over_64_states() {
        let breed = CtlCheck;
        let mut facts = vec![Fact {
            key: "ctl:formula".into(),
            value: "E F p".into(),
        }];
        for i in 0..65 {
            facts.push(Fact {
                key: format!("ts:edge:s{}", i),
                value: format!("s{}", i),
            });
        }
        let input = BreedInput {
            facts,
            ..Default::default()
        };
        let res = breed.run(&input);
        assert!(res.is_err());
        assert!(res.unwrap_err().message.contains("64"));
    }

    #[test]
    fn refuses_non_total_relation() {
        let breed = CtlCheck;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "ctl:formula".into(),
                    value: "E F p".into(),
                },
                Fact {
                    key: "ts:edge:s0".into(),
                    value: "s1".into(),
                },
                // s1 has no outgoing edge
            ],
            ..Default::default()
        };
        let res = breed.run(&input);
        assert!(res.is_err());
        assert!(res.unwrap_err().message.contains("not total"));
    }

    #[test]
    fn falsification_gate_ctl_lasso() {
        let breed = CtlCheck;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "ctl:formula".into(),
                    value: "A F q".into(),
                },
                Fact {
                    key: "ts:init".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s0".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:edge:s1".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:label:s0".into(),
                    value: "p".into(),
                },
                Fact {
                    key: "ts:label:s1".into(),
                    value: "q".into(),
                },
            ],
            ..Default::default()
        };
        let out = breed.run(&input).expect("should run");
        assert_eq!(out.selected.unwrap(), "holds");

        let input_fail = BreedInput {
            facts: vec![
                Fact {
                    key: "ctl:formula".into(),
                    value: "A G p".into(),
                },
                Fact {
                    key: "ts:init".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s0".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:edge:s1".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:label:s0".into(),
                    value: "p".into(),
                },
            ],
            ..Default::default()
        };
        let out_fail = breed.run(&input_fail).expect("should run");
        assert_eq!(out_fail.selected.unwrap(), "fails");
    }

    #[test]
    fn falsification_ag_holds_2state_loop() {
        // 2-state loop s0→s1→s0; both labeled p.
        // AG p must HOLD at s0 — if the fixed-point labeling is wrong it would fail.
        let breed = CtlCheck;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "ctl:formula".into(),
                    value: "A G p".into(),
                },
                Fact {
                    key: "ts:init".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s0".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:edge:s1".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:label:s0".into(),
                    value: "p".into(),
                },
                Fact {
                    key: "ts:label:s1".into(),
                    value: "p".into(),
                },
            ],
            ..Default::default()
        };
        let out = breed.run(&input).expect("should run");
        assert_eq!(
            out.selected.as_deref(),
            Some("holds"),
            "AG p must hold when every reachable state satisfies p"
        );
        // No counterexample facts should be emitted.
        assert!(
            out.facts.iter().all(|f| !f.key.starts_with("cex:")),
            "no counterexample steps expected when formula holds"
        );
    }

    #[test]
    fn falsification_ag_fails_with_counterexample() {
        // 2-state system s0→s1 (s1 self-loops); s1 has p=false.
        // AG p must FAIL and emit at least one counterexample step.
        let breed = CtlCheck;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "ctl:formula".into(),
                    value: "A G p".into(),
                },
                Fact {
                    key: "ts:init".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s0".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:edge:s1".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:label:s0".into(),
                    value: "p".into(),
                },
                // s1 has NO p label
            ],
            ..Default::default()
        };
        let out = breed.run(&input).expect("should run");
        assert_eq!(
            out.selected.as_deref(),
            Some("fails"),
            "AG p must fail when s1 does not satisfy p"
        );
        // At least one counterexample edge must be emitted (s0->s1).
        assert!(
            out.facts.iter().any(|f| f.key.starts_with("cex:")),
            "counterexample steps must be emitted when AG fails"
        );
        // The counterexample must include the edge s0->s1.
        assert!(
            out.facts
                .iter()
                .any(|f| f.key.starts_with("cex:") && f.value.contains("s0")),
            "counterexample must start from initial state s0"
        );
    }

    #[test]
    fn falsification_fixture_mutual_exclusion() {
        // Clarke-Emerson-Sistla 1986 Fig example: AG !(c1 & c2) HOLDS.
        // Verbatim from tests/fixtures/papers/ctl_check.json.
        let breed = CtlCheck;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "ts:init".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s0".into(),
                    value: "s1,s3".into(),
                },
                Fact {
                    key: "ts:edge:s1".into(),
                    value: "s2,s5".into(),
                },
                Fact {
                    key: "ts:edge:s2".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s3".into(),
                    value: "s4,s5".into(),
                },
                Fact {
                    key: "ts:edge:s4".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s5".into(),
                    value: "s6,s7".into(),
                },
                Fact {
                    key: "ts:edge:s6".into(),
                    value: "s3".into(),
                },
                Fact {
                    key: "ts:edge:s7".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:label:s1".into(),
                    value: "t1".into(),
                },
                Fact {
                    key: "ts:label:s2".into(),
                    value: "c1".into(),
                },
                Fact {
                    key: "ts:label:s3".into(),
                    value: "t2".into(),
                },
                Fact {
                    key: "ts:label:s4".into(),
                    value: "c2".into(),
                },
                Fact {
                    key: "ts:label:s5".into(),
                    value: "t1,t2".into(),
                },
                Fact {
                    key: "ts:label:s6".into(),
                    value: "c1,t2".into(),
                },
                Fact {
                    key: "ts:label:s7".into(),
                    value: "t1,c2".into(),
                },
                Fact {
                    key: "ctl:formula".into(),
                    value: "A G !(c1 & c2)".into(),
                },
            ],
            ..Default::default()
        };
        let out = breed.run(&input).expect("fixture run must succeed");
        assert_eq!(
            out.selected.as_deref(),
            Some("holds"),
            "mutual exclusion AG !(c1 & c2) must hold (Clarke-Emerson-Sistla 1986)"
        );
    }

    #[test]
    fn invariant_idempotency_edges() {
        let breed = CtlCheck;
        // Adding duplicate edges shouldn't change the evaluation outcome.
        let mut input1 = BreedInput {
            facts: vec![
                Fact {
                    key: "ctl:formula".into(),
                    value: "E F q".into(),
                },
                Fact {
                    key: "ts:init".into(),
                    value: "s0".into(),
                },
                Fact {
                    key: "ts:edge:s0".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:edge:s1".into(),
                    value: "s1".into(),
                },
                Fact {
                    key: "ts:label:s1".into(),
                    value: "q".into(),
                },
            ],
            ..Default::default()
        };
        let out1 = breed.run(&input1).unwrap();

        let mut input2 = input1.clone();
        input2.facts.push(Fact {
            key: "ts:edge:s0".into(),
            value: "s1".into(),
        }); // Duplicate edge
        let out2 = breed.run(&input2).unwrap();

        assert_eq!(out1.selected, out2.selected);
    }
}
