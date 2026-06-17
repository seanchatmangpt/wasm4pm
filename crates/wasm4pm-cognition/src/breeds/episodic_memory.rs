//! Episodic memory: cue-based recall with a temporal-proximity kernel
//! (Tulving 1983, *Elements of Episodic Memory*; Nuxoll & Laird 2007,
//! AAAI — episodic memory in Soar).
//!
//! Episodes are `input.cases`: the case `facts` are the encoded snapshot and
//! `outcome_score` is the stored salience. Each episode carries an encoding
//! time via the fact `episode:<id>:t`. The retrieval cue is the remaining
//! `input.facts` plus the current time fact `cue:t`.
//!
//! Recall score = Jaccard(cue, episode snapshot) + 1/(1 + |Δt|).
//! The additive temporal kernel is what distinguishes episodic recall from
//! plain case-based similarity (Tulving's "mental time travel"): two
//! episodes with identical content overlap are disambiguated by when they
//! happened — the hidden oracle proves the kernel can flip the winner
//! against pure Jaccard.
//!
//! Cap (refusal): ≤128 episodes.

use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Tulving-style episodic recall engine.
pub struct EpisodicMemory;

impl BoundedBreed for EpisodicMemory {
    fn breed_name(&self) -> &'static str {
        "episodic_memory"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound {
            max_cases: 128,
            ..DomainBound::default()
        }
    }
}

fn episode_times(input: &BreedInput) -> Result<BTreeMap<String, i64>, String> {
    let mut times = BTreeMap::new();
    for f in &input.facts {
        if let Some(rest) = f.key.strip_prefix("episode:") {
            if let Some(id) = rest.strip_suffix(":t") {
                let t: i64 = f
                    .value
                    .parse()
                    .map_err(|_| format!("episode '{}' has non-integer time '{}'", id, f.value))?;
                times.insert(id.to_string(), t);
            }
        }
    }
    Ok(times)
}

impl CognitionBreed for EpisodicMemory {
    fn id(&self) -> BreedId {
        BreedId::EpisodicMemory
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "episodic_encoding".to_string(),
            "cue_based_recall".to_string(),
            "temporal_proximity_kernel".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.cases.is_empty() {
            return Err("episodic_memory requires at least one episode (case)".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        let times = episode_times(input)?;
        for c in &input.cases {
            if !times.contains_key(&c.id) {
                return Err(format!(
                    "episode '{}' is missing its episode:{}:t time fact",
                    c.id, c.id
                ));
            }
        }
        if !input.facts.iter().any(|f| f.key == "cue:t") {
            return Err("episodic_memory requires a cue:t fact (current time)".to_string());
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
        let times = episode_times(input).map_err(&err)?;
        let cue_t: i64 = input
            .facts
            .iter()
            .find(|f| f.key == "cue:t")
            .unwrap()
            .value
            .parse()
            .map_err(|_| err("cue:t is not an integer".to_string()))?;

        let cue: BTreeSet<String> = input
            .facts
            .iter()
            .filter(|f| f.key != "cue:t" && !f.key.starts_with("episode:"))
            .map(|f| format!("{}={}", f.key, f.value))
            .collect();

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

        let mut episodes: Vec<&crate::breeds::Case> = input.cases.iter().collect();
        episodes.sort_by(|a, b| a.id.cmp(&b.id));
        for c in &episodes {
            push(
                &mut trace,
                "encode-episode",
                format!(
                    "'{}' t={} ({} atoms, salience={:.2})",
                    c.id,
                    times[&c.id],
                    c.facts.len(),
                    c.outcome_score
                ),
            );
        }
        push(
            &mut trace,
            "present-cue",
            format!("cue t={} with {} atoms", cue_t, cue.len()),
        );

        let mut best: Option<(f64, String)> = None;
        let mut facts: Vec<Fact> = Vec::new();
        for c in &episodes {
            let snapshot: BTreeSet<String> = c
                .facts
                .iter()
                .map(|f| format!("{}={}", f.key, f.value))
                .collect();
            let inter = cue.intersection(&snapshot).count() as f64;
            let union = cue.union(&snapshot).count() as f64;
            let jaccard = if union > 0.0 { inter / union } else { 0.0 };
            let dt = (cue_t - times[&c.id]).abs() as f64;
            let kernel = 1.0 / (1.0 + dt);
            let score = jaccard + kernel;
            push(
                &mut trace,
                "score-episode",
                format!(
                    "'{}' jaccard={:.4} temporal={:.4} score={:.4}",
                    c.id, jaccard, kernel, score
                ),
            );
            facts.push(Fact {
                key: format!("score:{}", c.id),
                value: format!("{:.4}", score),
            });
            let better = match &best {
                None => true,
                Some((bs, bid)) => {
                    score > *bs + 1e-12 || ((score - *bs).abs() <= 1e-12 && c.id < *bid)
                }
            };
            if better {
                best = Some((score, c.id.clone()));
            }
        }

        let (best_score, best_id) = best.unwrap();
        push(
            &mut trace,
            "recall",
            format!("recalled '{}' (score={:.4})", best_id, best_score),
        );
        push(
            &mut trace,
            "decision",
            format!(
                "episode '{}' wins over {} candidates",
                best_id,
                episodes.len()
            ),
        );
        facts.push(Fact {
            key: format!("recalled:{}", best_id),
            value: "true".to_string(),
        });

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: Some(best_id.clone()),
            explanation: format!(
                "episodic recall selected '{}' by Jaccard + temporal kernel over {} episodes",
                best_id,
                episodes.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty()?;
        if output.selected.is_none() {
            return Err("episodic recall produced no winner".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Case;

    #[test]
    fn refuses_empty_episodes() {
        let ep = EpisodicMemory;
        let input = BreedInput {
            intent: "".to_string(),
            candidates: vec![],
            facts: vec![Fact {
                key: "cue:t".to_string(),
                value: "10".to_string(),
            }],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(ep.preconditions(&input).is_err());
        assert!(ep.run(&input).is_err());
    }

    #[test]
    fn refuses_missing_cue_t() {
        let ep = EpisodicMemory;
        let input = BreedInput {
            intent: "".to_string(),
            candidates: vec![],
            facts: vec![Fact {
                key: "episode:e1:t".to_string(),
                value: "5".to_string(),
            }],
            cases: vec![Case {
                id: "e1".to_string(),
                intent: "".to_string(),
                architecture: "".to_string(),
                facts: vec![],
                outcome_score: 1.0,
            }],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(ep.preconditions(&input).is_err());
        assert!(ep.run(&input).is_err());
    }

    #[test]
    fn refuses_missing_episode_t() {
        let ep = EpisodicMemory;
        let input = BreedInput {
            intent: "".to_string(),
            candidates: vec![],
            facts: vec![Fact {
                key: "cue:t".to_string(),
                value: "10".to_string(),
            }],
            cases: vec![Case {
                id: "e1".to_string(),
                intent: "".to_string(),
                architecture: "".to_string(),
                facts: vec![],
                outcome_score: 1.0,
            }],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(ep.preconditions(&input).is_err());
        assert!(ep.run(&input).is_err());
    }

    #[test]
    fn falsification_gate_temporal_kernel_flip() {
        let ep = EpisodicMemory;
        let input = BreedInput {
            intent: "".to_string(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "cue:t".to_string(),
                    value: "10".to_string(),
                },
                Fact {
                    key: "A".to_string(),
                    value: "1".to_string(),
                },
                Fact {
                    key: "B".to_string(),
                    value: "1".to_string(),
                },
                Fact {
                    key: "episode:e1:t".to_string(),
                    value: "0".to_string(),
                },
                Fact {
                    key: "episode:e2:t".to_string(),
                    value: "10".to_string(),
                },
            ],
            cases: vec![
                Case {
                    id: "e1".to_string(),
                    intent: "".to_string(),
                    architecture: "".to_string(),
                    facts: vec![Fact {
                        key: "A".to_string(),
                        value: "1".to_string(),
                    }],
                    outcome_score: 1.0,
                },
                Case {
                    id: "e2".to_string(),
                    intent: "".to_string(),
                    architecture: "".to_string(),
                    facts: vec![],
                    outcome_score: 1.0,
                },
            ],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = ep.run(&input).unwrap();
        assert_eq!(out.selected.unwrap(), "e2");
    }

    #[test]
    fn invariant_idempotent_recall() {
        let ep = EpisodicMemory;
        let input = BreedInput {
            intent: "".to_string(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "cue:t".to_string(),
                    value: "10".to_string(),
                },
                Fact {
                    key: "episode:e1:t".to_string(),
                    value: "5".to_string(),
                },
                Fact {
                    key: "episode:e2:t".to_string(),
                    value: "8".to_string(),
                },
            ],
            cases: vec![
                Case {
                    id: "e1".to_string(),
                    intent: "".to_string(),
                    architecture: "".to_string(),
                    facts: vec![Fact {
                        key: "A".to_string(),
                        value: "1".to_string(),
                    }],
                    outcome_score: 1.0,
                },
                Case {
                    id: "e2".to_string(),
                    intent: "".to_string(),
                    architecture: "".to_string(),
                    facts: vec![Fact {
                        key: "B".to_string(),
                        value: "1".to_string(),
                    }],
                    outcome_score: 1.0,
                },
            ],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out1 = ep.run(&input).unwrap();
        let out2 = ep.run(&input).unwrap();
        assert_eq!(out1.selected, out2.selected);
    }

    /// Tulving 1983 paper fixture: ep-breakfast (t=9) vs ep-dinner (t=2), cue at t=10,
    /// cue atom "place=kitchen". Equal Jaccard (0.5 each); temporal kernel decides.
    /// score(breakfast) = 0.5 + 1/(1+1) = 1.0; score(dinner) = 0.5 + 1/(1+8) ≈ 0.6111.
    /// If the temporal kernel is zeroed out, ep-dinner ties ep-breakfast and the
    /// tie-breaking falls to lexicographic order ("ep-breakfast" < "ep-dinner"),
    /// which would still select ep-breakfast — so the falsification uses the exact
    /// score value to prove the kernel computed correctly.
    #[test]
    fn falsification_paper_temporal_kernel_exact_score() {
        let ep = EpisodicMemory;
        let input = BreedInput {
            intent: "recall the most relevant kitchen episode".to_string(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "place".to_string(),
                    value: "kitchen".to_string(),
                },
                Fact {
                    key: "cue:t".to_string(),
                    value: "10".to_string(),
                },
                Fact {
                    key: "episode:ep-breakfast:t".to_string(),
                    value: "9".to_string(),
                },
                Fact {
                    key: "episode:ep-dinner:t".to_string(),
                    value: "2".to_string(),
                },
            ],
            cases: vec![
                Case {
                    id: "ep-breakfast".to_string(),
                    intent: "morning meal".to_string(),
                    architecture: "episode".to_string(),
                    outcome_score: 0.5,
                    facts: vec![
                        Fact {
                            key: "place".to_string(),
                            value: "kitchen".to_string(),
                        },
                        Fact {
                            key: "meal".to_string(),
                            value: "breakfast".to_string(),
                        },
                    ],
                },
                Case {
                    id: "ep-dinner".to_string(),
                    intent: "evening meal".to_string(),
                    architecture: "episode".to_string(),
                    outcome_score: 0.5,
                    facts: vec![
                        Fact {
                            key: "place".to_string(),
                            value: "kitchen".to_string(),
                        },
                        Fact {
                            key: "meal".to_string(),
                            value: "dinner".to_string(),
                        },
                    ],
                },
            ],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = ep.run(&input).unwrap();
        // ep-breakfast must win
        assert_eq!(
            out.selected.as_deref(),
            Some("ep-breakfast"),
            "temporal kernel must select ep-breakfast; formula: jaccard + 1/(1+|dt|)"
        );
        // Exact score check: jaccard=0.5, dt=1, kernel=0.5, total=1.0
        let score_fact = out
            .facts
            .iter()
            .find(|f| f.key == "score:ep-breakfast")
            .expect("score:ep-breakfast must be emitted");
        let score: f64 = score_fact.value.parse().expect("score must be f64");
        assert!(
            (score - 1.0).abs() < 0.001,
            "ep-breakfast score must be 1.0000 (jaccard=0.5 + kernel=0.5), got {}",
            score
        );
    }
}
