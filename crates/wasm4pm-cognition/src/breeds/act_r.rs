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
