//! DENDRAL-style constraint enumeration (Feigenbaum 1971).
//!
//! Level 10 fixes (Feigenbaum 1971):
//! 1. **Declarative constraint logic**: Future enhancement: parse and evaluate
//!    constraint expressions with AND, OR, NOT operators (not just string matching)
//! 2. **Property-based evaluation**: Future enhancement: support property:key=value
//!    patterns for domain-specific attributes
//! 3. **Compositional constraints**: Future enhancement: support complex expressions like
//!    `"forbid:online AND require:offline"` with proper operator precedence
//! 4. **Elimination trace**: Each elimination recorded with full constraint evaluation trace
//!
//! Algorithm:
//! 1. Each `Fact` in `input.facts` whose `key == "constraint"` defines a
//!    rule of the form `value` → which candidate ids violate it.
//! 2. The constraint's `value` field carries the predicate, e.g.
//!    `"forbid:centralized-cloud"` (the candidate id after `forbid:` is
//!    eliminated) or `"require:offline"` (a candidate whose id does not
//!    contain `offline` is eliminated).
//! 3. Surviving candidates are scored unchanged; the highest-score
//!    survivor is selected.
//! 4. Elimination is monotonic: once eliminated, never restored.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, TraceStep,
};

/// DENDRAL constraint-based candidate enumerator.
pub struct Dendral;

fn violates(candidate: &Candidate, constraint_value: &str) -> Option<String> {
    if let Some(rest) = constraint_value.strip_prefix("forbid:") {
        if candidate.id == rest {
            return Some(format!("forbidden by constraint forbid:{}", rest));
        }
    } else if let Some(rest) = constraint_value.strip_prefix("require:") {
        if !candidate.id.contains(rest) {
            return Some(format!("missing required token {}", rest));
        }
    } else if let Some(rest) = constraint_value.strip_prefix("max-score:") {
        if let Ok(thresh) = rest.parse::<f32>() {
            if candidate.score > thresh {
                return Some(format!("score {} exceeds {}", candidate.score, thresh));
            }
        }
    } else if let Some(rest) = constraint_value.strip_prefix("min-score:") {
        if let Ok(thresh) = rest.parse::<f32>() {
            if candidate.score < thresh {
                return Some(format!("score {} below {}", candidate.score, thresh));
            }
        }
    }
    None
}

impl CognitionBreed for Dendral {
    fn id(&self) -> BreedId {
        BreedId::Dendral
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "constraint_enumeration".to_string(),
            "monotonic_elimination".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.candidates.is_empty() {
            return Err("DENDRAL requires at least one candidate".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut candidates = input.candidates.clone();
        let mut trace: Vec<TraceStep> = Vec::new();

        let constraints: Vec<&str> = input
            .facts
            .iter()
            .filter(|f| f.key == "constraint")
            .map(|f| f.value.as_str())
            .collect();

        for c in candidates.iter_mut() {
            if c.eliminated {
                continue;
            }
            for constraint in &constraints {
                if let Some(reason) = violates(c, constraint) {
                    c.eliminated = true;
                    c.elimination_reason = Some(reason.clone());
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "eliminate".to_string(),
                        detail: format!("{} by {}: {}", c.id, constraint, reason),
                        depth: 0,
                    });
                    break;
                }
            }
            if !c.eliminated {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "survive".to_string(),
                    detail: c.id.clone(),
                    depth: 0,
                });
            }
        }

        let selected = candidates
            .iter()
            .filter(|c| !c.eliminated)
            .max_by(|a, b| {
                a.score
                    .partial_cmp(&b.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| b.id.cmp(&a.id))
            })
            .map(|c| c.id.clone());

        let survivors = candidates.iter().filter(|c| !c.eliminated).count();
        let explanation = format!(
            "DENDRAL applied {} constraints; {}/{} candidates survived",
            constraints.len(),
            survivors,
            candidates.len()
        );

        Ok(BreedOutput {
            breed: BreedId::Dendral,
            candidates,
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("DENDRAL must record at least one trace step".to_string());
        }
        Ok(())
    }
}
