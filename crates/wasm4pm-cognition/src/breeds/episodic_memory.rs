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
use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
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
                return Err(format!("episode '{}' is missing its episode:{}:t time fact", c.id, c.id));
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
                format!("'{}' t={} ({} atoms, salience={:.2})", c.id, times[&c.id], c.facts.len(), c.outcome_score),
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
                Some((bs, bid)) => score > *bs + 1e-12 || ((score - *bs).abs() <= 1e-12 && c.id < *bid),
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
            format!("episode '{}' wins over {} candidates", best_id, episodes.len()),
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
