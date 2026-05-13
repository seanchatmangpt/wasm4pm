//! SOAR-style preference-based operator selection with impasse detection
//! (Laird 1987).
//!
//! Encoding:
//! - Candidates are the operator population (`input.candidates`).
//! - Preferences are encoded in `input.facts` with `key == "pref"`:
//!   * `value = "best:<id>"`     — best preference for `<id>`
//!   * `value = "worst:<id>"`    — worst preference for `<id>`
//!   * `value = "require:<id>"`  — require `<id>` (vetoes others)
//!   * `value = "prohibit:<id>"` — prohibit `<id>`
//!   * `value = "better:<a>:<b>"` — `<a>` strictly better than `<b>`
//!
//! Algorithm:
//! 1. Eliminate prohibited candidates.
//! 2. If a `require` exists, restrict to that single candidate.
//! 3. Apply `better:` constraints transitively; eliminate dominated
//!    candidates.
//! 4. Among survivors, prefer `best`-tagged candidates over `worst`.
//! 5. If exactly one remains, select it. Otherwise, declare an impasse
//!    and fall back to the highest-score survivor.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};
use std::collections::HashSet;

/// SOAR breed.
pub struct Soar;

#[derive(Debug, Default)]
struct Prefs {
    best: HashSet<String>,
    worst: HashSet<String>,
    require: HashSet<String>,
    prohibit: HashSet<String>,
    /// (better, worse)
    better: Vec<(String, String)>,
}

fn parse_prefs(input: &BreedInput) -> Prefs {
    let mut p = Prefs::default();
    for f in &input.facts {
        if f.key != "pref" {
            continue;
        }
        let v = &f.value;
        if let Some(rest) = v.strip_prefix("best:") {
            p.best.insert(rest.to_string());
        } else if let Some(rest) = v.strip_prefix("worst:") {
            p.worst.insert(rest.to_string());
        } else if let Some(rest) = v.strip_prefix("require:") {
            p.require.insert(rest.to_string());
        } else if let Some(rest) = v.strip_prefix("prohibit:") {
            p.prohibit.insert(rest.to_string());
        } else if let Some(rest) = v.strip_prefix("better:") {
            let parts: Vec<&str> = rest.splitn(2, ':').collect();
            if parts.len() == 2 {
                p.better.push((parts[0].to_string(), parts[1].to_string()));
            }
        }
    }
    p
}

impl CognitionBreed for Soar {
    fn id(&self) -> BreedId {
        BreedId::Soar
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "preference_resolution".to_string(),
            "impasse_detection".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.candidates.is_empty() {
            return Err("SOAR requires at least one operator candidate".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let prefs = parse_prefs(input);
        let mut candidates = input.candidates.clone();
        let mut trace: Vec<TraceStep> = Vec::new();

        // Step 1: prohibit.
        for c in candidates.iter_mut() {
            if prefs.prohibit.contains(&c.id) {
                c.eliminated = true;
                c.elimination_reason = Some("prohibit".to_string());
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "prohibit".to_string(),
                    detail: c.id.clone(),
                    depth: 0,
                });
            }
        }

        // Step 2: require (if any).
        if !prefs.require.is_empty() {
            for c in candidates.iter_mut() {
                if !prefs.require.contains(&c.id) && !c.eliminated {
                    c.eliminated = true;
                    c.elimination_reason = Some("not in require-set".to_string());
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "veto-non-required".to_string(),
                        detail: c.id.clone(),
                        depth: 0,
                    });
                }
            }
        }

        // Step 3: better-than dominance (transitive closure with cycle defence).
        let mut iters = 0;
        let max_iters = prefs.better.len() * candidates.len() + 1;
        loop {
            iters += 1;
            if iters > max_iters {
                break;
            }
            let mut changed = false;
            for (better, worse) in &prefs.better {
                let better_alive = candidates
                    .iter()
                    .any(|c| &c.id == better && !c.eliminated);
                if !better_alive {
                    continue;
                }
                for c in candidates.iter_mut() {
                    if &c.id == worse && !c.eliminated {
                        c.eliminated = true;
                        c.elimination_reason =
                            Some(format!("dominated by {}", better));
                        trace.push(TraceStep {
                            step: trace.len(),
                            kind: "dominate".to_string(),
                            detail: format!("{} > {}", better, worse),
                            depth: 0,
                        });
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }

        // Step 4: best/worst tags among survivors.
        let alive: Vec<&crate::breeds::Candidate> =
            candidates.iter().filter(|c| !c.eliminated).collect();
        let any_best = alive.iter().any(|c| prefs.best.contains(&c.id));
        let surviving_ids: Vec<String> = if any_best {
            alive
                .iter()
                .filter(|c| prefs.best.contains(&c.id))
                .map(|c| c.id.clone())
                .collect()
        } else {
            alive
                .iter()
                .filter(|c| !prefs.worst.contains(&c.id))
                .map(|c| c.id.clone())
                .collect()
        };

        let (selected, impasse) = match surviving_ids.len() {
            0 => (None, true),
            1 => {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "evaluate-single".to_string(),
                    detail: surviving_ids[0].clone(),
                    depth: 0,
                });
                (Some(surviving_ids[0].clone()), false)
            }
            _ => {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "impasse".to_string(),
                    detail: format!("tie among {} candidates", surviving_ids.len()),
                    depth: 0,
                });
                // Subgoal-like resolution: highest-score with id tiebreak.
                let pick = candidates
                    .iter()
                    .filter(|c| surviving_ids.contains(&c.id))
                    .max_by(|a, b| {
                        a.score
                            .partial_cmp(&b.score)
                            .unwrap_or(std::cmp::Ordering::Equal)
                            .then_with(|| b.id.cmp(&a.id))
                    })
                    .map(|c| c.id.clone());
                (pick, true)
            }
        };

        let explanation = format!(
            "SOAR {} selected {:?} (best={}, worst={}, require={}, prohibit={}, better-pairs={})",
            if impasse { "impasse-resolved" } else { "decisive" },
            selected,
            prefs.best.len(),
            prefs.worst.len(),
            prefs.require.len(),
            prefs.prohibit.len(),
            prefs.better.len()
        );

        Ok(BreedOutput {
            breed: BreedId::Soar,
            candidates,
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("SOAR must record at least one evaluation step".to_string());
        }
        Ok(())
    }
}
