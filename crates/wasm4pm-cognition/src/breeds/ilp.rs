//! FOIL: top-down induction of first-order Horn clauses by information gain
//! (Quinlan 1990, "Learning logical definitions from relations",
//! Machine Learning 5).
//!
//! FOIL greedily grows one clause at a time: starting from the bare head
//! `target(V0,…)`, it repeatedly adds the body literal with the highest
//! information gain `t · (log2(p1/(p1+n1)) − log2(p0/(p0+n0)))`, where
//! `(p0,n0)` / `(p1,n1)` are the positive/negative binding-tuple counts
//! before/after the literal and `t` is the number of positive bindings that
//! survive. A clause is complete when no negative binding remains; covered
//! positives are removed (cover-remove loop) and the process repeats.
//!
//! Fact contract: `pos:<atom>`, `neg:<atom>`, `bg:<atom>` with ground atoms
//! like `daughter(mary,ann)`. Caps (refusals): ≤64 background facts,
//! ≤32 examples, body length ≤4, ≤256 candidate literals per step.

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// Quinlan FOIL induction engine.
pub struct Ilp;

/// Parse `pred(a,b)` into (pred, args).
fn parse_atom(s: &str) -> Result<(String, Vec<String>), String> {
    match s.find('(') {
        Some(i) => {
            if !s.ends_with(')') {
                return Err(format!("malformed atom '{}'", s));
            }
            let pred = s[..i].trim().to_string();
            let inner = &s[i + 1..s.len() - 1];
            let args: Vec<String> = inner
                .split(',')
                .map(|a| a.trim().to_string())
                .filter(|a| !a.is_empty())
                .collect();
            if pred.is_empty() {
                return Err(format!("malformed atom '{}'", s));
            }
            Ok((pred, args))
        }
        None => Ok((s.trim().to_string(), vec![])),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Literal {
    pred: String,
    /// Variable ids.
    args: Vec<usize>,
}

impl fmt::Display for Literal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}({})",
            self.pred,
            self.args
                .iter()
                .map(|v| format!("V{}", v))
                .collect::<Vec<_>>()
                .join(",")
        )
    }
}

type Binding = Vec<Option<String>>;

/// Extend each binding with all consistent matches of `lit` against `bg`.
fn extend(
    bindings: &[(usize, Binding)],
    lit: &Literal,
    bg: &[(String, Vec<String>)],
    nvars: usize,
) -> Vec<(usize, Binding)> {
    let mut out: Vec<(usize, Binding)> = Vec::new();
    for (ex, b) in bindings {
        for (pred, args) in bg {
            if pred != &lit.pred || args.len() != lit.args.len() {
                continue;
            }
            let mut nb = b.clone();
            nb.resize(nvars, None);
            let mut ok = true;
            for (v, c) in lit.args.iter().zip(args.iter()) {
                match &nb[*v] {
                    Some(existing) if existing != c => {
                        ok = false;
                        break;
                    }
                    Some(_) => {}
                    None => nb[*v] = Some(c.clone()),
                }
            }
            if ok && !out.iter().any(|(e2, b2)| e2 == ex && b2 == &nb) {
                out.push((*ex, nb));
            }
        }
    }
    out
}

impl CognitionBreed for Ilp {
    fn id(&self) -> BreedId {
        BreedId::Ilp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "foil_induction".to_string(),
            "information_gain_search".to_string(),
            "cover_remove_loop".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let mut pos = 0usize;
        let mut neg = 0usize;
        let mut bg = 0usize;
        let mut target: Option<(String, usize)> = None;
        for f in &input.facts {
            if let Some(a) = f.key.strip_prefix("pos:") {
                let (p, args) = parse_atom(a)?;
                match &target {
                    None => target = Some((p, args.len())),
                    Some((tp, ta)) => {
                        if *tp != p || *ta != args.len() {
                            return Err(format!(
                                "positive examples mix predicates: {} vs {}/{}",
                                p, tp, ta
                            ));
                        }
                    }
                }
                pos += 1;
            } else if let Some(a) = f.key.strip_prefix("neg:") {
                parse_atom(a)?;
                neg += 1;
            } else if let Some(a) = f.key.strip_prefix("bg:") {
                parse_atom(a)?;
                bg += 1;
            }
        }
        if pos == 0 {
            return Err("ilp requires at least one pos:<atom> example".to_string());
        }
        if bg == 0 {
            return Err("ilp requires background knowledge (bg:<atom> facts)".to_string());
        }
        if bg > 64 {
            return Err(format!(
                "complexity cap exceeded: {} bg facts > 64 (refusal)",
                bg
            ));
        }
        if pos + neg > 32 {
            return Err(format!(
                "complexity cap exceeded: {} examples > 32 (refusal)",
                pos + neg
            ));
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        self.preconditions(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;
        let err = |m: String| BreedError {
            breed: self.id(),
            message: m,
        };

        let mut pos_examples: Vec<Vec<String>> = Vec::new();
        let mut neg_examples: Vec<Vec<String>> = Vec::new();
        let mut bg: Vec<(String, Vec<String>)> = Vec::new();
        let mut target = String::new();
        for f in &input.facts {
            if let Some(a) = f.key.strip_prefix("pos:") {
                let (p, args) = parse_atom(a).map_err(&err)?;
                target = p;
                pos_examples.push(args);
            } else if let Some(a) = f.key.strip_prefix("neg:") {
                let (_, args) = parse_atom(a).map_err(&err)?;
                neg_examples.push(args);
            } else if let Some(a) = f.key.strip_prefix("bg:") {
                bg.push(parse_atom(a).map_err(&err)?);
            }
        }
        pos_examples.sort();
        neg_examples.sort();
        bg.sort();
        let arity = pos_examples[0].len();

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
        for e in &pos_examples {
            push(
                &mut trace,
                "load-example",
                format!("+{}({})", target, e.join(",")),
            );
        }
        for e in &neg_examples {
            push(
                &mut trace,
                "load-example",
                format!("-{}({})", target, e.join(",")),
            );
        }

        // Background predicate signatures.
        let mut sigs: BTreeMap<String, usize> = BTreeMap::new();
        for (p, args) in &bg {
            sigs.insert(p.clone(), args.len());
        }

        let head = Literal {
            pred: target.clone(),
            args: (0..arity).collect(),
        };

        let mut remaining: BTreeSet<usize> = (0..pos_examples.len()).collect();
        let mut clauses: Vec<(Literal, Vec<Literal>)> = Vec::new();
        let mut rule_facts: Vec<Fact> = Vec::new();

        while !remaining.is_empty() {
            if clauses.len() >= 8 {
                return Err(err(
                    "clause budget (8) exhausted without covering all positives".to_string(),
                ));
            }
            // Initial bindings: head variables bound to example tuples.
            let mut pos_b: Vec<(usize, Binding)> = remaining
                .iter()
                .map(|&i| (i, pos_examples[i].iter().map(|c| Some(c.clone())).collect()))
                .collect();
            let mut neg_b: Vec<(usize, Binding)> = neg_examples
                .iter()
                .enumerate()
                .map(|(i, e)| (i, e.iter().map(|c| Some(c.clone())).collect()))
                .collect();
            let mut nvars = arity;
            let mut body: Vec<Literal> = Vec::new();

            while !neg_b.is_empty() {
                if body.len() >= 4 {
                    return Err(err(
                        "body length cap (4) reached with negatives still covered — cannot separate".to_string(),
                    ));
                }
                // Generate candidate literals: every bg predicate, every arg
                // tuple over existing vars plus at most one new var, at least
                // one existing var.
                let mut candidates: Vec<Literal> = Vec::new();
                for (pred, &a) in &sigs {
                    let mut tuples: Vec<Vec<usize>> = vec![vec![]];
                    for _ in 0..a {
                        let mut next = Vec::new();
                        for t in &tuples {
                            for v in 0..=nvars {
                                let mut t2 = t.clone();
                                t2.push(v);
                                next.push(t2);
                            }
                        }
                        tuples = next;
                    }
                    for args in tuples {
                        let new_count = args.iter().filter(|&&v| v == nvars).count();
                        let old_count = args.iter().filter(|&&v| v < nvars).count();
                        if old_count == 0 || new_count > 1 {
                            continue;
                        }
                        let lit = Literal {
                            pred: pred.clone(),
                            args,
                        };
                        if lit == head || body.contains(&lit) {
                            continue;
                        }
                        candidates.push(lit);
                    }
                }
                candidates.sort();
                if candidates.len() > 256 {
                    return Err(err(format!(
                        "candidate literal space {} > 256 (refusal, not truncation)",
                        candidates.len()
                    )));
                }

                let p0 = pos_b.len() as f64;
                let n0 = neg_b.len() as f64;
                let base_info = (p0 / (p0 + n0)).log2();
                let mut best: Option<(
                    f64,
                    Literal,
                    Vec<(usize, Binding)>,
                    Vec<(usize, Binding)>,
                    bool,
                )> = None;
                for lit in &candidates {
                    let uses_new = lit.args.contains(&nvars);
                    let nv = if uses_new { nvars + 1 } else { nvars };
                    let p_ext = extend(&pos_b, lit, &bg, nv);
                    if p_ext.is_empty() {
                        continue;
                    }
                    let n_ext = extend(&neg_b, lit, &bg, nv);
                    let surviving: BTreeSet<usize> = p_ext.iter().map(|(e, _)| *e).collect();
                    let t = surviving.len() as f64;
                    let p1 = p_ext.len() as f64;
                    let n1 = n_ext.len() as f64;
                    let gain = t * ((p1 / (p1 + n1)).log2() - base_info);
                    push(&mut trace, "propose-literal", lit.to_string());
                    push(
                        &mut trace,
                        "score-gain",
                        format!(
                            "{}: t={} p1={} n1={} gain={:.4}",
                            lit,
                            t,
                            p1,
                            n1,
                            gain
                        ),
                    );
                    let better = match &best {
                        None => true,
                        Some((bg_gain, bl, _, _, _)) => {
                            gain > *bg_gain + 1e-9
                                || ((gain - *bg_gain).abs() <= 1e-9 && lit.to_string() < bl.to_string())
                        }
                    };
                    if better {
                        best = Some((gain, lit.clone(), p_ext, n_ext, uses_new));
                    }
                }
                let (gain, lit, p_ext, n_ext, uses_new) = best.ok_or_else(|| {
                    err(
                        "no candidate literal retains any positive binding — cannot separate"
                            .to_string(),
                    )
                })?;
                push(
                    &mut trace,
                    "add-literal",
                    format!("{} (gain={:.4})", lit, gain),
                );
                if uses_new {
                    nvars += 1;
                }
                body.push(lit);
                pos_b = p_ext;
                neg_b = n_ext;
            }

            // Clause complete: covered positives = those with surviving bindings.
            let covered: BTreeSet<usize> = pos_b.iter().map(|(e, _)| *e).collect();
            if covered.is_empty() {
                return Err(err(
                    "completed clause covers no positive example".to_string()
                ));
            }
            for c in &covered {
                push(
                    &mut trace,
                    "cover-remove",
                    format!("+{}({}) covered", target, pos_examples[*c].join(",")),
                );
                remaining.remove(c);
            }
            let clause_text = format!(
                "{} :- {}",
                head,
                body.iter().map(|l| l.to_string()).collect::<Vec<_>>().join(", ")
            );
            push(&mut trace, "emit-clause", clause_text.clone());
            rule_facts.push(Fact {
                key: format!("ilp:rule:{}", clauses.len()),
                value: clause_text,
            });
            clauses.push((head.clone(), body));
        }

        push(
            &mut trace,
            "decision",
            format!(
                "learned {} clause(s) covering {} positives, excluding {} negatives",
                clauses.len(),
                pos_examples.len(),
                neg_examples.len()
            ),
        );

        let selected = rule_facts.first().map(|f| f.value.clone());
        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: rule_facts,
            selected,
            explanation: format!(
                "FOIL induced {} clause(s) for {}/{} by information gain",
                clauses.len(),
                target,
                arity
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["emit-clause"])?;
        // Fraud guard: a learned clause must contain at least one variable.
        if !output
            .facts
            .iter()
            .any(|f| f.key.starts_with("ilp:rule:") && f.value.contains('V'))
        {
            return Err(
                "learned rule contains no variables — ground rule is a fraud signal".to_string(),
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, CognitionBreed, Fact};

    #[test]
    fn refuses_exceed_cap() {
        let breed = Ilp;
        let mut facts = vec![];
        for i in 0..40 {
            facts.push(Fact {
                key: format!("pos:target({})", i),
                value: "".to_string(),
            });
        }
        facts.push(Fact {
            key: "bg:foo(1)".to_string(),
            value: "".to_string(),
        });
        let input = BreedInput {
            facts,
            ..Default::default()
        };
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn falsification_gate_information_gain() {
        let breed = Ilp;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "pos:target(1)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "pos:target(2)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "pos:target(3)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "neg:target(4)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "bg:good(1)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "bg:good(2)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "bg:good(3)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "bg:distractor(1)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "bg:distractor(2)".to_string(),
                    value: "".to_string(),
                },
                Fact {
                    key: "bg:distractor(4)".to_string(),
                    value: "".to_string(),
                },
            ],
            ..Default::default()
        };
        let out = breed.run(&input).unwrap();
        assert_eq!(out.selected.unwrap(), "target(V0) :- good(V0)");
    }

    /// Quinlan 1990 (Machine Learning 5(3):239-266), Section 3 — FOIL daughter task:
    /// From parent/2 and female/1 background, learn daughter(X,Y) :- female(X), parent(Y,X).
    /// The learned clause body must equal {female(V0), parent(V1,V0)} as a set (Quinlan §3).
    #[test]
    fn quinlan_1990_daughter_clause_body_matches() {
        let breed = Ilp;
        let input = BreedInput {
            facts: vec![
                // Background
                Fact {
                    key: "bg:parent(ann,mary)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "bg:parent(ann,tom)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "bg:parent(tom,eve)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "bg:parent(tom,ian)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "bg:female(ann)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "bg:female(mary)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "bg:female(eve)".into(),
                    value: "".into(),
                },
                // Positive examples
                Fact {
                    key: "pos:daughter(mary,ann)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "pos:daughter(eve,tom)".into(),
                    value: "".into(),
                },
                // Negative examples
                Fact {
                    key: "neg:daughter(tom,ann)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "neg:daughter(eve,ann)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "neg:daughter(ian,tom)".into(),
                    value: "".into(),
                },
                Fact {
                    key: "neg:daughter(ann,mary)".into(),
                    value: "".into(),
                },
            ],
            ..Default::default()
        };
        let out = breed
            .run(&input)
            .expect("FOIL must succeed on daughter task");
        let rule_text = out.selected.expect("must emit at least one rule");
        // The head must be daughter(V0,V1)
        assert!(
            rule_text.starts_with("daughter(V0,V1)"),
            "head must be daughter(V0,V1), got: {}",
            rule_text
        );
        // The body must contain female(V0) and parent(V1,V0) as a set
        // (literal order may vary by information-gain ranking)
        assert!(
            rule_text.contains("female(V0)"),
            "body must contain female(V0) (Quinlan 1990 §3), got: {}",
            rule_text
        );
        assert!(
            rule_text.contains("parent(V1,V0)"),
            "body must contain parent(V1,V0) (Quinlan 1990 §3), got: {}",
            rule_text
        );
        // Exactly one clause (the daughter relation is expressible in one Horn clause)
        assert_eq!(
            out.facts
                .iter()
                .filter(|f| f.key.starts_with("ilp:rule:"))
                .count(),
            1,
            "fixture requires exactly 1 clause (Quinlan 1990)"
        );
    }

    #[test]
    fn invariant_example_order_independence() {
        let breed = Ilp;
        let facts1 = vec![
            Fact {
                key: "pos:target(1)".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "pos:target(2)".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "neg:target(3)".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "bg:good(1)".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "bg:good(2)".to_string(),
                value: "".to_string(),
            },
        ];
        let facts2 = vec![
            Fact {
                key: "neg:target(3)".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "pos:target(2)".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "bg:good(2)".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "pos:target(1)".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "bg:good(1)".to_string(),
                value: "".to_string(),
            },
        ];
        let out1 = breed
            .run(&BreedInput {
                facts: facts1,
                ..Default::default()
            })
            .unwrap();
        let out2 = breed
            .run(&BreedInput {
                facts: facts2,
                ..Default::default()
            })
            .unwrap();
        assert_eq!(out1.selected, out2.selected);
    }
}
