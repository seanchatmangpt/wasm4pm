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

/// Validate a constraint value's syntax. Returns `Err` for malformed inputs
/// so DENDRAL fails loudly (TPS Andon) instead of silently no-opping.
///
/// Recognized prefixes: `forbid:`, `require:`, `max-score:<f32>`, `min-score:<f32>`.
/// Any other prefix is rejected as a malformed constraint.
fn validate_constraint(constraint_value: &str) -> Result<(), String> {
    if let Some(rest) = constraint_value.strip_prefix("max-score:") {
        rest.parse::<f32>()
            .map(|_| ())
            .map_err(|_| format!("max-score requires f32 threshold, got '{}'", rest))
    } else if let Some(rest) = constraint_value.strip_prefix("min-score:") {
        rest.parse::<f32>()
            .map(|_| ())
            .map_err(|_| format!("min-score requires f32 threshold, got '{}'", rest))
    } else if constraint_value.starts_with("forbid:") || constraint_value.starts_with("require:") {
        Ok(())
    } else {
        Err(format!(
            "unknown constraint prefix in '{}' (expected forbid:, require:, max-score:, min-score:)",
            constraint_value
        ))
    }
}

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
        // validate_constraint() has already gated the parse — unwrap is sound.
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

        // Stop-the-line: validate every constraint syntactically up front.
        // A malformed constraint (e.g. `max-score:abc` or `unknown:foo`) that
        // silently no-ops would let candidates which should have been
        // eliminated slip through — a Rank-2 contract violation.
        for constraint in &constraints {
            if let Err(reason) = validate_constraint(constraint) {
                return Err(BreedError {
                    breed: BreedId::Dendral,
                    message: format!("malformed constraint: {}", reason),
                });
            }
        }

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
                        objects: vec![],
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
                    objects: vec![],
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
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("DENDRAL must record at least one trace step".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    fn cand(id: &str, score: f32) -> Candidate {
        Candidate {
            id: id.to_string(),
            score,
            eliminated: false,
            elimination_reason: None,
        }
    }

    fn input_with(candidates: Vec<Candidate>, constraint_values: Vec<&str>) -> BreedInput {
        BreedInput {
            intent: "constraint_enumeration".to_string(),
            candidates,
            facts: constraint_values
                .into_iter()
                .map(|v| Fact {
                    key: "constraint".to_string(),
                    value: v.to_string(),
                })
                .collect(),
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    // Rank-2 (domain contract): the documented constraint grammar is
    // {forbid,require,max-score,min-score}. An unknown prefix must NOT
    // silently no-op — it must stop the line.
    #[test]
    fn unknown_constraint_prefix_is_rejected() {
        let input = input_with(vec![cand("alpha", 0.7)], vec!["weird:foo"]);
        let err = Dendral.run(&input).expect_err("unknown prefix should fail");
        assert_eq!(err.breed, BreedId::Dendral);
        assert!(
            err.message.contains("unknown constraint prefix"),
            "expected unknown-prefix error, got: {}",
            err.message
        );
    }

    // Rank-2: a malformed `max-score:abc` (non-parseable threshold) must
    // not silently let high-score candidates through.
    #[test]
    fn malformed_max_score_threshold_is_rejected() {
        let input = input_with(vec![cand("alpha", 99.0)], vec!["max-score:not-a-number"]);
        let err = Dendral
            .run(&input)
            .expect_err("malformed threshold should fail");
        assert!(
            err.message.contains("max-score"),
            "expected max-score parse error, got: {}",
            err.message
        );
    }

    // Rank-2: min-score parse failure must also be loud.
    #[test]
    fn malformed_min_score_threshold_is_rejected() {
        let input = input_with(vec![cand("alpha", 0.1)], vec!["min-score:NaNoNaN"]);
        let err = Dendral
            .run(&input)
            .expect_err("malformed threshold should fail");
        assert!(err.message.contains("min-score"), "got: {}", err.message);
    }

    // Rank-1 (mathematical theorem) — domain monotonicity:
    // For a well-formed `max-score:T`, a candidate with score == T must
    // SURVIVE (strict > means tied scores pass) and score > T must be
    // eliminated. This pins the boundary against off-by-one regressions.
    #[test]
    fn max_score_boundary_strict_greater() {
        let input = input_with(
            vec![cand("at_thresh", 5.0), cand("above", 5.5)],
            vec!["max-score:5.0"],
        );
        let out = Dendral.run(&input).expect("well-formed run");
        let at = out.candidates.iter().find(|c| c.id == "at_thresh").unwrap();
        let above = out.candidates.iter().find(|c| c.id == "above").unwrap();
        assert!(!at.eliminated, "score==threshold must survive max-score");
        assert!(above.eliminated, "score>threshold must be eliminated");
    }

    // Regression: well-formed constraints still work after up-front validation.
    #[test]
    fn well_formed_constraints_still_work() {
        let input = input_with(
            vec![cand("alpha", 0.7), cand("bravo", 0.8)],
            vec!["forbid:alpha"],
        );
        let out = Dendral.run(&input).expect("forbid is well-formed");
        assert_eq!(out.selected.as_deref(), Some("bravo"));
    }
}
