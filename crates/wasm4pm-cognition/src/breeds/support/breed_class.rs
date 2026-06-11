//! Breed class supertraits: shared postcondition contracts for the four
//! behavioural classes (Verifier, Planner, Classifier, Optimizer).
//!
//! All four traits are dyn-compatible (no associated consts, no generics).
//! Assertion methods are called from within each breed's `postconditions()`.

use crate::breeds::{BreedOutput, CognitionBreed};

/// Marker + contract for breeds that reduce their output to a single symbolic verdict
/// stored in `output.selected`.
///
/// Catches **AC-ALWAYS** (constant-output fraud): `assert_verdict_valid` rejects
/// any `selected` value outside the declared vocabulary.
pub trait VerifierBreed: CognitionBreed {
    /// Exhaustive set of symbolic verdict strings.
    ///
    /// Override to tighten: e.g. `LtlMonitor` uses `["true", "false"]`.
    fn valid_verdicts(&self) -> &'static [&'static str] {
        &["satisfied", "violated", "unknown"]
    }

    /// Assert that `output.selected` is `Some(v)` where `v ∈ valid_verdicts()`.
    ///
    /// Call at the start of `postconditions()`:
    /// ```rust,ignore
    /// fn postconditions(&self, input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
    ///     self.assert_verdict_valid(output)?;
    ///     // … breed-specific checks …
    ///     Ok(())
    /// }
    /// ```
    fn assert_verdict_valid(&self, output: &BreedOutput) -> Result<(), String> {
        match &output.selected {
            None => Err(format!(
                "{}: VerifierBreed requires output.selected to be Some(verdict)",
                self.id()
            )),
            Some(v) if self.valid_verdicts().contains(&v.as_str()) => Ok(()),
            Some(v) => Err(format!(
                "{}: verdict '{}' not in valid set {:?}",
                self.id(), v, self.valid_verdicts()
            )),
        }
    }
}

/// Marker + contract for breeds that produce an ordered action plan evidenced
/// by a structured `inference_trace`.
///
/// Catches **AC-FLAT** (empty-plan fraud): every required trace kind must appear.
pub trait PlannerBreed: CognitionBreed {
    /// Trace `kind` strings that MUST appear at least once for the plan to be
    /// considered evidenced.
    fn required_trace_kinds(&self) -> &'static [&'static str];

    /// Assert that every `required_trace_kinds()` entry appears at least once.
    fn assert_plan_trace_complete(&self, output: &BreedOutput) -> Result<(), String> {
        for kind in self.required_trace_kinds() {
            if !output.inference_trace.iter().any(|t| t.kind == *kind) {
                return Err(format!(
                    "{}: PlannerBreed requires trace kind '{}' (AC-FLAT guard)",
                    self.id(), kind
                ));
            }
        }
        Ok(())
    }
}

/// Marker + contract for breeds that return a ranked list of candidates in
/// `output.candidates`, sorted by `score` descending.
///
/// Catches **AC-SHUFFLE** (arbitrary-order fraud): verifying descending sort
/// forces the breed to actually compute and compare scores.
pub trait ClassifierBreed: CognitionBreed {
    /// Assert that `output.candidates` is sorted by `score` descending.
    ///
    /// Equal scores are permitted; no candidate may have a higher score than
    /// any preceding candidate.
    fn assert_ranking_valid(&self, output: &BreedOutput) -> Result<(), String> {
        let mut prev = f32::INFINITY;
        for (i, c) in output.candidates.iter().enumerate() {
            if c.score > prev {
                return Err(format!(
                    "{}: ClassifierBreed candidates not sorted by score descending \
                     (index {} score={:.6} > prev={:.6})",
                    self.id(), i, c.score, prev
                ));
            }
            prev = c.score;
        }
        Ok(())
    }
}

/// Marker + contract for breeds that prove optimality by writing a named fact
/// into `output.facts`.
///
/// Catches **AC-STUB-POLICY** (stub output fraud): the breed cannot return a
/// plausible-looking output without running the optimization step.
pub trait OptimizerBreed: CognitionBreed {
    /// Fact key prefix that MUST appear in `output.facts` at least once.
    ///
    /// Examples: `"mdp:policy:"`, `"pomdp:belief:"`, `"rl:policy:"`.
    fn optimality_fact_key(&self) -> &'static str;

    /// Assert that `output.facts` contains at least one fact with the
    /// `optimality_fact_key()` prefix.
    fn assert_optimality_fact_present(&self, output: &BreedOutput) -> Result<(), String> {
        let key = self.optimality_fact_key();
        if output.facts.iter().any(|f| f.key.starts_with(key)) {
            Ok(())
        } else {
            Err(format!(
                "{}: OptimizerBreed requires fact with prefix '{}' (AC-STUB-POLICY guard)",
                self.id(), key
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, Candidate};

    /// Minimal dummy breed implementing all four class traits.
    struct Dummy;

    impl CognitionBreed for Dummy {
        fn id(&self) -> BreedId {
            BreedId::SatCdcl
        }
        fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
            Ok(())
        }
        fn run(&self, _input: &BreedInput) -> Result<BreedOutput, BreedError> {
            unreachable!("dummy breed never runs")
        }
        fn postconditions(&self, _input: &BreedInput, _output: &BreedOutput) -> Result<(), String> {
            Ok(())
        }
    }

    impl VerifierBreed for Dummy {
        fn valid_verdicts(&self) -> &'static [&'static str] {
            &["SAT", "UNSAT"]
        }
    }
    impl PlannerBreed for Dummy {
        fn required_trace_kinds(&self) -> &'static [&'static str] {
            &["plan-step"]
        }
    }
    impl ClassifierBreed for Dummy {}
    impl OptimizerBreed for Dummy {
        fn optimality_fact_key(&self) -> &'static str {
            "policy:"
        }
    }

    fn empty_output() -> BreedOutput {
        BreedOutput {
            breed: BreedId::SatCdcl,
            candidates: vec![],
            facts: vec![],
            selected: None,
            explanation: String::new(),
            inference_trace: vec![],
            ocel_log: None,
            retained_cases: vec![],
        }
    }

    #[test]
    fn verifier_rejects_bogus_verdict() {
        let mut out = empty_output();
        out.selected = Some("bogus".to_string());
        let err = Dummy.assert_verdict_valid(&out).unwrap_err();
        assert!(err.contains("not in valid set"), "{}", err);
        // None is also rejected.
        out.selected = None;
        assert!(Dummy.assert_verdict_valid(&out).is_err());
        // Valid verdicts pass.
        out.selected = Some("SAT".to_string());
        assert!(Dummy.assert_verdict_valid(&out).is_ok());
    }

    #[test]
    fn planner_rejects_missing_trace_kind() {
        let out = empty_output();
        let err = Dummy.assert_plan_trace_complete(&out).unwrap_err();
        assert!(err.contains("plan-step"), "{}", err);
    }

    #[test]
    fn optimizer_rejects_missing_fact() {
        let out = empty_output();
        let err = Dummy.assert_optimality_fact_present(&out).unwrap_err();
        assert!(err.contains("policy:"), "{}", err);
    }

    #[test]
    fn classifier_rejects_unsorted_candidates() {
        let mut out = empty_output();
        out.candidates = vec![
            Candidate {
                id: "low".to_string(),
                score: 0.2,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "high".to_string(),
                score: 0.9,
                eliminated: false,
                elimination_reason: None,
            },
        ];
        let err = Dummy.assert_ranking_valid(&out).unwrap_err();
        assert!(err.contains("not sorted"), "{}", err);
        // Descending order passes.
        out.candidates.reverse();
        assert!(Dummy.assert_ranking_valid(&out).is_ok());
    }
}
