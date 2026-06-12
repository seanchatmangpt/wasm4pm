//! ACT-R production cycle with declarative retrieval by activation
//! (Anderson & Lebiere 1998, *The Atomic Components of Thought*).
//!
//! The architecture interleaves a procedural cycle (conflict resolution by
//! utility over matching productions) with declarative memory retrievals.
//! Chunk activation follows the ACT-R activation equation
//! `A_i = B_i + Σ_j W_j · S_ji`: base-level activation `B_i`
//! (= `Case.outcome_score`) plus context spreading from the current working
//! memory, with source weights `W_j = 1/n` over the `n` working-memory atoms
//! and association strength `S_ji = 1` when chunk `i` contains slot atom `j`.
//!
//! Contract:
//! - working memory seeds from `input.facts` as `key=value` atoms
//! - chunks are `input.cases` (`facts` = slots, `outcome_score` = B_i)
//! - productions are `input.rules`; a conclusion `retrieve:<k>=<v>` issues a
//!   retrieval request for chunks with slot `<k>=<v>`; any other conclusion
//!   is written to working memory
//! - the retrieval threshold τ defaults to 0.0 (override: fact `actr:threshold`)
//!
//! The whole interleaved cycle is one multi-kind lifecycle phase
//! (HEARSAY_MODEL precedent). Caps: ≤32 cycles, ≤64 chunks (refusals).

use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
use std::collections::BTreeSet;
use crate::breeds::support::trace_query::TraceQuery;

/// ACT-R production/retrieval cycle.
pub struct ActR;

impl BoundedBreed for ActR {
    fn breed_name(&self) -> &'static str {
        "act_r"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound {
            max_cases: 64,
            ..DomainBound::default()
        }
    }
}

impl CognitionBreed for ActR {
    fn id(&self) -> BreedId {
        BreedId::ActR
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "production_cycle".to_string(),
            "activation_based_retrieval".to_string(),
            "utility_conflict_resolution".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("act_r requires at least one production rule".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        self.preconditions(input).map_err(|m| BreedError {
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

        let threshold: f64 = input
            .facts
            .iter()
            .find(|f| f.key == "actr:threshold")
            .and_then(|f| f.value.parse().ok())
            .unwrap_or(0.0);

        let mut wm: BTreeSet<String> = input
            .facts
            .iter()
            .filter(|f| f.key != "actr:threshold")
            .map(|f| format!("{}={}", f.key, f.value))
            .collect();

        for c in &input.cases {
            push(
                &mut trace,
                "load-chunk",
                format!("chunk '{}' B={:.3} ({} slots)", c.id, c.outcome_score, c.facts.len()),
            );
        }

        let mut fired: BTreeSet<String> = BTreeSet::new();
        let mut last_retrieved: Option<String> = None;

        for _cycle in 0..32usize {
            // Conflict resolution: all matching unfired productions, highest
            // utility (certainty) first, lexicographic id tie-break.
            let mut applicable: Vec<&crate::breeds::Rule> = input
                .rules
                .iter()
                .filter(|r| !fired.contains(&r.id) && r.premise.iter().all(|p| wm.contains(p)))
                .collect();
            if applicable.is_empty() {
                break;
            }
            applicable.sort_by(|a, b| {
                b.certainty
                    .total_cmp(&a.certainty)
                    .then_with(|| a.id.cmp(&b.id))
            });
            let rule = applicable[0];
            fired.insert(rule.id.clone());
            push(
                &mut trace,
                "match-production",
                format!("'{}' matched (utility={:.3}, {} competitors)", rule.id, rule.certainty, applicable.len() - 1),
            );
            push(&mut trace, "fire-production", format!("fired '{}'", rule.id));

            if let Some(pattern) = rule.conclusion.strip_prefix("retrieve:") {
                push(&mut trace, "retrieval-request", format!("pattern {}", pattern));
                let (pk, pv) = match pattern.split_once('=') {
                    Some(kv) => kv,
                    None => {
                        return Err(BreedError {
                            breed: self.id(),
                            message: format!("malformed retrieval pattern '{}'", pattern),
                        })
                    }
                };
                // ACT-R activation equation over matching chunks.
                let n = wm.len().max(1) as f64;
                let mut best: Option<(f64, &crate::breeds::Case)> = None;
                for c in &input.cases {
                    let slot_atoms: BTreeSet<String> = c
                        .facts
                        .iter()
                        .map(|f| format!("{}={}", f.key, f.value))
                        .collect();
                    if !slot_atoms.contains(&format!("{}={}", pk, pv)) {
                        continue;
                    }
                    let spreading: f64 =
                        wm.iter().filter(|a| slot_atoms.contains(*a)).count() as f64 / n;
                    let activation = c.outcome_score as f64 + spreading;
                    let better = match &best {
                        None => true,
                        Some((ba, bc)) => {
                            activation > *ba + 1e-12
                                || ((activation - *ba).abs() <= 1e-12 && c.id < bc.id)
                        }
                    };
                    if better {
                        best = Some((activation, c));
                    }
                }
                match best {
                    Some((a, c)) if a >= threshold => {
                        push(
                            &mut trace,
                            "retrieve-chunk",
                            format!("retrieved '{}' A={:.4} (tau={:.2})", c.id, a, threshold),
                        );
                        for f in &c.facts {
                            wm.insert(format!("{}={}", f.key, f.value));
                        }
                        wm.insert(format!("retrieved={}", c.id));
                        last_retrieved = Some(c.id.clone());
                    }
                    _ => {
                        push(
                            &mut trace,
                            "retrieval-failure",
                            format!("no chunk matching {} above tau={:.2}", pattern, threshold),
                        );
                        wm.insert("retrieval=failure".to_string());
                    }
                }
            } else {
                wm.insert(rule.conclusion.clone());
            }
        }

        let original: BTreeSet<String> = input
            .facts
            .iter()
            .map(|f| format!("{}={}", f.key, f.value))
            .collect();
        let facts: Vec<Fact> = wm
            .iter()
            .filter(|a| !original.contains(*a))
            .map(|a| match a.split_once('=') {
                Some((k, v)) => Fact {
                    key: k.to_string(),
                    value: v.to_string(),
                },
                None => Fact {
                    key: a.clone(),
                    value: "true".to_string(),
                },
            })
            .collect();

        push(
            &mut trace,
            "decision",
            format!(
                "{} productions fired; last retrieval: {:?}",
                fired.len(),
                last_retrieved
            ),
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: last_retrieved.clone(),
            explanation: format!(
                "ACT-R ran {} productions with activation-based retrieval (last retrieved: {:?})",
                fired.len(),
                last_retrieved
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["fire-production"])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Case, Fact, Rule};

    #[test]
    fn refuses_empty_rules() {
        let breed = ActR;
        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let result = breed.preconditions(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("requires at least one production rule"));
    }

    #[test]
    fn falsification_gate_act_r_retrieval_threshold() {
        let breed = ActR;
        let c1 = Case {
            id: "c1".into(),
            intent: "".into(),
            architecture: "".into(),
            outcome_score: 0.5,
            facts: vec![Fact { key: "slot".into(), value: "v1".into() }],
        };
        let r1 = Rule {
            id: "r1".into(),
            premise: vec![],
            conclusion: "retrieve:slot=v1".into(),
            certainty: 1.0,
        };
        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: vec![Fact { key: "actr:threshold".into(), value: "1.0".into() }],
            cases: vec![c1],
            rules: vec![r1],
            goals: vec![],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        assert!(output.inference_trace.iter().any(|t| t.kind == "retrieval-failure"));
        assert!(output.selected.is_none());
    }

    #[test]
    fn invariant_monotonicity_of_activation() {
        let breed = ActR;
        let c1 = Case {
            id: "c1_high".into(),
            intent: "".into(),
            architecture: "".into(),
            outcome_score: 0.9,
            facts: vec![Fact { key: "slot".into(), value: "v".into() }],
        };
        let c2 = Case {
            id: "c2_low".into(),
            intent: "".into(),
            architecture: "".into(),
            outcome_score: 0.1,
            facts: vec![Fact { key: "slot".into(), value: "v".into() }],
        };
        let r1 = Rule {
            id: "r1".into(),
            premise: vec![],
            conclusion: "retrieve:slot=v".into(),
            certainty: 1.0,
        };
        let input = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![c1.clone(), c2.clone()],
            rules: vec![r1.clone()],
            goals: vec![],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        assert_eq!(output.selected.unwrap(), "c1_high");

        let input2 = BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![c2, c1],
            rules: vec![r1],
            goals: vec![],
            state: vec![],
        };
        let output2 = breed.run(&input2).expect("run ok");
        assert_eq!(output2.selected.unwrap(), "c1_high");
    }

    /// Anderson & Lebiere 1998 Ch. 9: retrieve addition fact 3+4.
    ///
    /// WM = {goal=add, addend1=3, addend2=4}  n=3
    /// fact34: B=0.5, slots {addend1=3, addend2=4, sum=7} → 2 WM matches → A = 0.5 + 2/3 ≈ 1.1667
    /// fact35: B=0.3, slots {addend1=3, addend2=5, sum=8} → 1 WM match  → A = 0.3 + 1/3 ≈ 0.6333
    /// The activation equation must prefer fact34.
    #[test]
    fn paper_activation_equation_selects_fact34() {
        let breed = ActR;
        let input = BreedInput {
            intent: "retrieve 3+4".into(),
            candidates: vec![],
            facts: vec![
                Fact { key: "goal".into(), value: "add".into() },
                Fact { key: "addend1".into(), value: "3".into() },
                Fact { key: "addend2".into(), value: "4".into() },
            ],
            cases: vec![
                Case {
                    id: "fact34".into(),
                    intent: "addition fact".into(),
                    architecture: "declarative-chunk".into(),
                    outcome_score: 0.5,
                    facts: vec![
                        Fact { key: "addend1".into(), value: "3".into() },
                        Fact { key: "addend2".into(), value: "4".into() },
                        Fact { key: "sum".into(), value: "7".into() },
                    ],
                },
                Case {
                    id: "fact35".into(),
                    intent: "addition fact".into(),
                    architecture: "declarative-chunk".into(),
                    outcome_score: 0.3,
                    facts: vec![
                        Fact { key: "addend1".into(), value: "3".into() },
                        Fact { key: "addend2".into(), value: "5".into() },
                        Fact { key: "sum".into(), value: "8".into() },
                    ],
                },
            ],
            rules: vec![Rule {
                id: "p-retrieve-sum".into(),
                premise: vec!["goal=add".into()],
                conclusion: "retrieve:addend1=3".into(),
                certainty: 0.9,
            }],
            goals: vec![],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert_eq!(
            out.selected.as_deref(),
            Some("fact34"),
            "fact34 must win retrieval; A(fact34)≈1.1667 > A(fact35)≈0.6333"
        );
        let retrieve_step = out
            .inference_trace
            .iter()
            .find(|t| t.kind == "retrieve-chunk")
            .expect("must have a retrieve-chunk trace step");
        assert!(
            retrieve_step.detail.contains("A=1.1667"),
            "trace must record A=1.1667 per the paper formula; got: {}",
            retrieve_step.detail
        );
        // sum=7 (from fact34's slots) must appear in output facts.
        assert!(
            out.facts.iter().any(|f| f.key == "sum" && f.value == "7"),
            "sum=7 from fact34 must propagate into working memory / output facts"
        );
    }
}
