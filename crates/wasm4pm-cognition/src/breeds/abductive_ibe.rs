//! Abduction as Inference to the Best Explanation
//! (Harman, "The Inference to the Best Explanation", Philosophical Review 74(1),
//! 1965; Thagard, "The Best Explanation: Criteria for Theory Choice", Journal
//! of Philosophy 75(2), 1978).
//!
//! Thagard's criteria are operationalized as a closed-form score:
//!   score(H) = consilience − 0.1 · simplicity-cost
//!            = |observations covered by H| − 0.1 · Σ_{h∈H} cost(h)
//!
//! Input facts:
//! - `ibe:obs:<o>` = "true"            — an observation to be explained
//! - `ibe:hyp:<h>:covers` = "o1,o2"    — observations hypothesis h explains
//! - `ibe:hyp:<h>:cost`   = "<f32>"    — assumption cost of h (≥ 0)
//!
//! Hypothesis sets of size 1 and 2 (≤10 hypotheses) are scored; ties broken
//! lexicographically on the joined set name (deterministic).

use std::collections::{BTreeMap, BTreeSet};

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};

/// Maximum number of hypotheses.
const MAX_HYPOTHESES: usize = 10;
/// Simplicity penalty per unit cost (Thagard's simplicity criterion weight).
const COST_WEIGHT: f32 = 0.1;

/// IBE breed: best-explanation selection by consilience-minus-cost scoring.
pub struct AbductiveIbe;

struct Hypothesis {
    covers: BTreeSet<String>,
    cost: f32,
}

fn parse(input: &BreedInput) -> Result<(BTreeSet<String>, BTreeMap<String, Hypothesis>), String> {
    let mut obs: BTreeSet<String> = BTreeSet::new();
    let mut hyps: BTreeMap<String, Hypothesis> = BTreeMap::new();
    for f in &input.facts {
        if let Some(o) = f.key.strip_prefix("ibe:obs:") {
            obs.insert(o.to_string());
        } else if let Some(rest) = f.key.strip_prefix("ibe:hyp:") {
            if let Some(h) = rest.strip_suffix(":covers") {
                let entry = hyps.entry(h.to_string()).or_insert(Hypothesis {
                    covers: BTreeSet::new(),
                    cost: 0.0,
                });
                for o in f.value.split(',').map(str::trim).filter(|s| !s.is_empty()) {
                    entry.covers.insert(o.to_string());
                }
            } else if let Some(h) = rest.strip_suffix(":cost") {
                let cost: f32 = f
                    .value
                    .trim()
                    .parse()
                    .map_err(|_| format!("malformed cost '{}' for hypothesis {}", f.value, h))?;
                if cost < 0.0 {
                    return Err(format!("negative cost {} for hypothesis {}", cost, h));
                }
                hyps.entry(h.to_string())
                    .or_insert(Hypothesis {
                        covers: BTreeSet::new(),
                        cost: 0.0,
                    })
                    .cost = cost;
            }
        }
    }
    Ok((obs, hyps))
}

fn score(set: &[&String], hyps: &BTreeMap<String, Hypothesis>, obs: &BTreeSet<String>) -> f32 {
    let mut covered: BTreeSet<&String> = BTreeSet::new();
    let mut cost = 0.0f32;
    for h in set {
        let hyp = &hyps[*h];
        for o in hyp.covers.intersection(obs) {
            covered.insert(o);
        }
        cost += hyp.cost;
    }
    covered.len() as f32 - COST_WEIGHT * cost
}

impl CognitionBreed for AbductiveIbe {
    fn id(&self) -> BreedId {
        BreedId::AbductiveIbe
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "inference-to-best-explanation".to_string(),
            "consilience-scoring".to_string(),
            "simplicity-penalty".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let (obs, hyps) = parse(input)?;
        if obs.is_empty() {
            return Err("abductive_ibe requires at least one ibe:obs:* fact".to_string());
        }
        if hyps.is_empty() {
            return Err("abductive_ibe requires at least one ibe:hyp:*:covers fact".to_string());
        }
        if hyps.len() > MAX_HYPOTHESES {
            return Err(format!(
                "hypothesis count {} exceeds cap {}",
                hyps.len(),
                MAX_HYPOTHESES
            ));
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let (obs, hyps) = parse(input).map_err(|m| BreedError {
            breed: BreedId::AbductiveIbe,
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

        let obs_list: Vec<&String> = obs.iter().collect();
        tr(
            &mut trace,
            "collect-observations",
            format!(
                "{} observations [{}], {} hypotheses",
                obs.len(),
                obs_list
                    .iter()
                    .map(|s| s.as_str())
                    .collect::<Vec<_>>()
                    .join(","),
                hyps.len()
            ),
            0,
        );

        // Candidate sets: singletons then pairs, lexicographic.
        let names: Vec<String> = hyps.keys().cloned().collect();
        let mut candidates: Vec<Vec<&String>> = Vec::new();
        for h in &names {
            candidates.push(vec![h]);
        }
        for i in 0..names.len() {
            for j in (i + 1)..names.len() {
                candidates.push(vec![&names[i], &names[j]]);
            }
        }

        let mut best: Option<(String, f32)> = None;
        for set in &candidates {
            let s = score(set, &hyps, &obs);
            let name = set
                .iter()
                .map(|h| h.as_str())
                .collect::<Vec<_>>()
                .join("+");
            tr(
                &mut trace,
                "score-hypothesis",
                format!("{} score={:.4}", name, s),
                1,
            );
            let better = match &best {
                None => true,
                Some((bn, bs)) => s > *bs || (s == *bs && name < *bn),
            };
            if better {
                tr(
                    &mut trace,
                    "compare",
                    format!(
                        "new best {} ({:.4}{})",
                        name,
                        s,
                        best.as_ref()
                            .map(|(bn, bs)| format!(" beats {} {:.4}", bn, bs))
                            .unwrap_or_default()
                    ),
                    1,
                );
                best = Some((name, s));
            }
        }

        let (best_name, best_score) = best.ok_or_else(|| BreedError {
            breed: BreedId::AbductiveIbe,
            message: "no candidate hypothesis sets".to_string(),
        })?;
        tr(
            &mut trace,
            "best-explanation",
            format!("{} score={:.4}", best_name, best_score),
            0,
        );

        let facts = vec![
            Fact {
                key: "ibe:best".to_string(),
                value: best_name.clone(),
            },
            Fact {
                key: "ibe:score".to_string(),
                value: format!("{:.4}", best_score),
            },
        ];

        Ok(BreedOutput {
            breed: BreedId::AbductiveIbe,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(best_name.clone()),
            explanation: format!(
                "IBE over {} candidate sets: best explanation '{}' with score {:.4} (coverage − {}·cost).",
                candidates.len(),
                best_name,
                best_score,
                COST_WEIGHT
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
        if output.inference_trace.last().map(|t| t.kind.as_str()) != Some("best-explanation") {
            return Err("final step must be 'best-explanation'".to_string());
        }
        if output.selected.is_none() {
            return Err("IBE must select a best explanation".to_string());
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
            intent: "explain".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// Cheaper partial hypothesis beats full-coverage costly one:
    /// A covers all 3 at cost 25 → 3 − 2.5 = 0.5; B covers 2 at cost 2 → 2 − 0.2 = 1.8.
    #[test]
    fn cheap_partial_beats_costly_full() {
        let out = AbductiveIbe
            .run(&input(vec![
                fact("ibe:obs:o1", "true"),
                fact("ibe:obs:o2", "true"),
                fact("ibe:obs:o3", "true"),
                fact("ibe:hyp:grand:covers", "o1,o2,o3"),
                fact("ibe:hyp:grand:cost", "25"),
                fact("ibe:hyp:lean:covers", "o1,o2"),
                fact("ibe:hyp:lean:cost", "2"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("lean"));
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "score-hypothesis" && t.detail == "grand score=0.5000"));
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "score-hypothesis" && t.detail == "lean score=1.8000"));
    }

    /// Pair sets are scored; combined coverage counted once.
    #[test]
    fn pair_coverage_union() {
        let out = AbductiveIbe
            .run(&input(vec![
                fact("ibe:obs:o1", "true"),
                fact("ibe:obs:o2", "true"),
                fact("ibe:hyp:h1:covers", "o1"),
                fact("ibe:hyp:h1:cost", "1"),
                fact("ibe:hyp:h2:covers", "o2"),
                fact("ibe:hyp:h2:cost", "1"),
            ]))
            .unwrap();
        // h1+h2: 2 − 0.2 = 1.8 beats singletons (1 − 0.1 = 0.9).
        assert_eq!(out.selected.as_deref(), Some("h1+h2"));
        let score_fact = out.facts.iter().find(|f| f.key == "ibe:score").unwrap();
        assert_eq!(score_fact.value, "1.8000");
    }

    #[test]
    fn refuses_without_observations() {
        let inp = input(vec![fact("ibe:hyp:h1:covers", "o1")]);
        assert!(AbductiveIbe.preconditions(&inp).is_err());
    }
}
