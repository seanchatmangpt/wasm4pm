//! Zero-copy query API over a breed's inference trace.
//!
//! [`TraceQuery`] wraps `&[TraceStep]` and provides named assertion methods
//! for every pattern that appears in the 52 breed `postconditions` impls.
//! All methods are read-only; no heap allocation except where documented.

use crate::breeds::{BreedOutput, TraceStep};

/// A read-only query view over a breed's inference trace.
///
/// Construct via [`TraceQuery::new`] or [`TraceQuery::from_output`].
#[derive(Debug, Clone, Copy)]
pub struct TraceQuery<'a> {
    steps: &'a [TraceStep],
}

/// Errors produced by [`TraceQuery`] assertion methods.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum TraceError {
    /// The inference trace contained no steps.
    #[error("empty inference trace (fraud signal)")]
    Empty,
    /// A required step kind was absent.
    #[error("trace missing required kind '{kind}'")]
    MissingKind {
        /// The kind that was expected.
        kind: String,
    },
    /// A kind appeared the wrong number of times.
    #[error("trace must contain exactly {expected} '{kind}' step(s), found {found}")]
    WrongCount {
        /// The step kind.
        kind: String,
        /// Expected count.
        expected: usize,
        /// Actual count.
        found: usize,
    },
    /// A count fell below a required minimum.
    #[error("trace must contain at least {min} '{kind}' step(s), found {found}")]
    TooFew {
        /// The step kind.
        kind: String,
        /// Required minimum.
        min: usize,
        /// Actual count.
        found: usize,
    },
    /// The required ordered subsequence of kinds was not present.
    #[error("trace does not contain ordered subsequence {sequence:?}")]
    MissingSequence {
        /// The required subsequence.
        sequence: Vec<String>,
    },
    /// The first step had the wrong kind.
    #[error("first trace step must be '{expected}', found '{found}'")]
    WrongFirst {
        /// The kind that was expected.
        expected: String,
        /// The kind actually found at position 0.
        found: String,
    },
    /// The last step had the wrong kind.
    #[error("last trace step must be '{expected}', found '{found}'")]
    WrongLast {
        /// The kind that was expected.
        expected: String,
        /// The kind actually found at the last position.
        found: String,
    },
}

impl From<TraceError> for String {
    fn from(e: TraceError) -> Self {
        e.to_string()
    }
}

impl<'a> TraceQuery<'a> {
    /// Wrap a slice of trace steps.
    pub fn new(steps: &'a [TraceStep]) -> Self {
        Self { steps }
    }

    /// Wrap the inference trace from a [`BreedOutput`] reference.
    pub fn from_output(output: &'a BreedOutput) -> Self {
        Self::new(&output.inference_trace)
    }

    /// Total number of steps.
    pub fn len(&self) -> usize {
        self.steps.len()
    }

    /// True when the trace has no steps.
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    /// Borrow the raw slice.
    pub fn as_slice(&self) -> &'a [TraceStep] {
        self.steps
    }

    /// Count steps whose `kind` field equals `kind`.
    pub fn count_of(&self, kind: &str) -> usize {
        self.steps.iter().filter(|t| t.kind == kind).count()
    }

    /// First step whose `kind` equals `kind`.
    pub fn first_of(&self, kind: &str) -> Option<&'a TraceStep> {
        self.steps.iter().find(|t| t.kind == kind)
    }

    /// Last step whose `kind` equals `kind`.
    pub fn last_of(&self, kind: &str) -> Option<&'a TraceStep> {
        self.steps.iter().rfind(|t| t.kind == kind)
    }

    /// The `index`-th (0-based) step of the given `kind`.
    pub fn kth_of(&self, kind: &str, index: usize) -> Option<&'a TraceStep> {
        self.steps.iter().filter(|t| t.kind == kind).nth(index)
    }

    /// True when at least one step has this `kind`.
    pub fn has_kind(&self, kind: &str) -> bool {
        self.steps.iter().any(|t| t.kind == kind)
    }

    /// True when no step has this `kind`.
    pub fn lacks_kind(&self, kind: &str) -> bool {
        !self.has_kind(kind)
    }

    /// `detail` of the first step with this `kind`.
    pub fn detail_of(&self, kind: &str) -> Option<&'a str> {
        self.first_of(kind).map(|t| t.detail.as_str())
    }

    /// `detail` of the k-th step with this `kind`.
    pub fn detail_kth(&self, kind: &str, index: usize) -> Option<&'a str> {
        self.kth_of(kind, index).map(|t| t.detail.as_str())
    }

    /// True when all `kinds` appear in the trace in the given order (not
    /// necessarily contiguous).
    pub fn sequence_contains(&self, kinds: &[&str]) -> bool {
        let mut remaining = kinds;
        for step in self.steps {
            if let Some((&head, tail)) = remaining.split_first() {
                if step.kind == head {
                    remaining = tail;
                }
            }
            if remaining.is_empty() {
                return true;
            }
        }
        remaining.is_empty()
    }

    // ── Assertion helpers ─────────────────────────────────────────────────

    /// Fail with [`TraceError::Empty`] when the trace is empty (FM-5 guard).
    pub fn require_non_empty(&self) -> Result<(), TraceError> {
        if self.is_empty() {
            Err(TraceError::Empty)
        } else {
            Ok(())
        }
    }

    /// Fail with [`TraceError::MissingKind`] when `kind` is absent.
    pub fn require_kind(&self, kind: &str) -> Result<(), TraceError> {
        if self.has_kind(kind) {
            Ok(())
        } else {
            Err(TraceError::MissingKind {
                kind: kind.to_string(),
            })
        }
    }

    /// Fail unless ALL `kinds` appear at least once.
    pub fn require_kinds(&self, kinds: &[&str]) -> Result<(), TraceError> {
        for &kind in kinds {
            self.require_kind(kind)?;
        }
        Ok(())
    }

    /// Fail unless `kind` appears exactly `expected` times.
    pub fn require_count(&self, kind: &str, expected: usize) -> Result<(), TraceError> {
        let found = self.count_of(kind);
        if found == expected {
            Ok(())
        } else {
            Err(TraceError::WrongCount {
                kind: kind.to_string(),
                expected,
                found,
            })
        }
    }

    /// Fail unless `kind` appears at least `min` times.
    pub fn require_at_least(&self, kind: &str, min: usize) -> Result<(), TraceError> {
        let found = self.count_of(kind);
        if found >= min {
            Ok(())
        } else {
            Err(TraceError::TooFew {
                kind: kind.to_string(),
                min,
                found,
            })
        }
    }

    /// Fail unless the given `kinds` appear as an ordered subsequence.
    pub fn require_sequence(&self, kinds: &[&str]) -> Result<(), TraceError> {
        if self.sequence_contains(kinds) {
            Ok(())
        } else {
            Err(TraceError::MissingSequence {
                sequence: kinds.iter().map(|s| s.to_string()).collect(),
            })
        }
    }

    /// Fail unless the FIRST step of the trace has the given `kind`.
    pub fn require_first(&self, kind: &str) -> Result<(), TraceError> {
        match self.steps.first() {
            None => Err(TraceError::Empty),
            Some(s) if s.kind == kind => Ok(()),
            Some(s) => Err(TraceError::WrongFirst {
                expected: kind.to_string(),
                found: s.kind.clone(),
            }),
        }
    }

    /// Fail unless the LAST step of the trace has the given `kind`.
    pub fn require_last(&self, kind: &str) -> Result<(), TraceError> {
        match self.steps.last() {
            None => Err(TraceError::Empty),
            Some(s) if s.kind == kind => Ok(()),
            Some(s) => Err(TraceError::WrongLast {
                expected: kind.to_string(),
                found: s.kind.clone(),
            }),
        }
    }

    /// Require non-empty AND all `kinds` present — the canonical postcondition
    /// opening.
    pub fn require_non_empty_with_kinds(&self, kinds: &[&str]) -> Result<(), TraceError> {
        self.require_non_empty()?;
        self.require_kinds(kinds)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(step: usize, kind: &str) -> TraceStep {
        TraceStep {
            step,
            kind: kind.to_string(),
            detail: format!("detail-{}", kind),
            depth: 0,
            objects: vec![],
        }
    }

    fn tq(steps: &[TraceStep]) -> TraceQuery<'_> {
        TraceQuery::new(steps)
    }

    #[test]
    fn count_of_zero_on_empty() {
        assert_eq!(tq(&[]).count_of("x"), 0);
    }

    #[test]
    fn count_of_correct() {
        let steps = vec![step(0, "a"), step(1, "b"), step(2, "a")];
        assert_eq!(tq(&steps).count_of("a"), 2);
        assert_eq!(tq(&steps).count_of("b"), 1);
        assert_eq!(tq(&steps).count_of("c"), 0);
    }

    #[test]
    fn first_of_and_last_of() {
        let steps = vec![step(0, "x"), step(1, "y"), step(2, "x")];
        let tq = tq(&steps);
        assert_eq!(tq.first_of("x").unwrap().step, 0);
        assert_eq!(tq.last_of("x").unwrap().step, 2);
    }

    #[test]
    fn kth_of_correct() {
        let steps = vec![step(0, "k"), step(1, "k"), step(2, "k")];
        assert_eq!(tq(&steps).kth_of("k", 0).unwrap().step, 0);
        assert_eq!(tq(&steps).kth_of("k", 2).unwrap().step, 2);
        assert!(tq(&steps).kth_of("k", 3).is_none());
    }

    #[test]
    fn detail_of_delegates() {
        let steps = vec![step(0, "ltl-verdict")];
        assert_eq!(
            tq(&steps).detail_of("ltl-verdict"),
            Some("detail-ltl-verdict")
        );
        assert_eq!(tq(&steps).detail_of("missing"), None);
    }

    #[test]
    fn sequence_contains_ordered() {
        let steps = vec![step(0, "a"), step(1, "b"), step(2, "c")];
        assert!(tq(&steps).sequence_contains(&["a", "c"]));
        assert!(tq(&steps).sequence_contains(&["a", "b", "c"]));
    }

    #[test]
    fn sequence_contains_rejects_reversed() {
        let steps = vec![step(0, "a"), step(1, "b"), step(2, "c")];
        assert!(!tq(&steps).sequence_contains(&["c", "a"]));
    }

    #[test]
    fn sequence_contains_empty_kinds() {
        let steps = vec![step(0, "a")];
        assert!(tq(&steps).sequence_contains(&[]));
        assert!(tq(&[]).sequence_contains(&[]));
    }

    #[test]
    fn require_non_empty_empty_trace() {
        assert_eq!(tq(&[]).require_non_empty(), Err(TraceError::Empty));
    }

    #[test]
    fn require_non_empty_nonempty_trace() {
        let steps = vec![step(0, "x")];
        assert!(tq(&steps).require_non_empty().is_ok());
    }

    #[test]
    fn require_kind_missing() {
        let steps = vec![step(0, "a")];
        assert!(matches!(
            tq(&steps).require_kind("b"),
            Err(TraceError::MissingKind { .. })
        ));
    }

    #[test]
    fn require_count_exact_pass() {
        let steps = vec![step(0, "v"), step(1, "v")];
        assert!(tq(&steps).require_count("v", 2).is_ok());
    }

    #[test]
    fn require_count_exact_fail() {
        let steps = vec![step(0, "v")];
        assert!(matches!(
            tq(&steps).require_count("v", 2),
            Err(TraceError::WrongCount {
                found: 1,
                expected: 2,
                ..
            })
        ));
    }

    #[test]
    fn require_at_least_pass() {
        let steps = vec![step(0, "k"), step(1, "k"), step(2, "k")];
        assert!(tq(&steps).require_at_least("k", 2).is_ok());
    }

    #[test]
    fn require_at_least_fail() {
        let steps = vec![step(0, "k")];
        assert!(matches!(
            tq(&steps).require_at_least("k", 3),
            Err(TraceError::TooFew {
                found: 1,
                min: 3,
                ..
            })
        ));
    }

    #[test]
    fn require_sequence_pass() {
        let steps = vec![step(0, "init"), step(1, "progress"), step(2, "verdict")];
        assert!(tq(&steps).require_sequence(&["init", "verdict"]).is_ok());
    }

    #[test]
    fn require_sequence_fail() {
        let steps = vec![step(0, "init"), step(1, "verdict")];
        assert!(matches!(
            tq(&steps).require_sequence(&["verdict", "init"]),
            Err(TraceError::MissingSequence { .. })
        ));
    }

    #[test]
    fn require_non_empty_with_kinds_pass() {
        let steps = vec![step(0, "a"), step(1, "b")];
        assert!(tq(&steps).require_non_empty_with_kinds(&["a", "b"]).is_ok());
    }

    #[test]
    fn require_non_empty_with_kinds_empty_trace() {
        assert_eq!(
            tq(&[]).require_non_empty_with_kinds(&["a"]),
            Err(TraceError::Empty)
        );
    }

    #[test]
    fn require_first_pass_and_fail() {
        let steps = vec![step(0, "init"), step(1, "work")];
        assert!(tq(&steps).require_first("init").is_ok());
        assert!(matches!(
            tq(&steps).require_first("work"),
            Err(TraceError::WrongFirst { .. })
        ));
        assert_eq!(tq(&[]).require_first("init"), Err(TraceError::Empty));
    }

    #[test]
    fn require_last_pass_and_fail() {
        let steps = vec![step(0, "work"), step(1, "verdict")];
        assert!(tq(&steps).require_last("verdict").is_ok());
        assert!(matches!(
            tq(&steps).require_last("work"),
            Err(TraceError::WrongLast { .. })
        ));
        assert_eq!(tq(&[]).require_last("verdict"), Err(TraceError::Empty));
    }

    #[test]
    fn trace_error_into_string() {
        let e = TraceError::Empty;
        let s: String = e.into();
        assert!(s.contains("fraud signal"));
    }

    #[test]
    fn lacks_kind_correct() {
        let steps = vec![step(0, "a")];
        assert!(tq(&steps).lacks_kind("b"));
        assert!(!tq(&steps).lacks_kind("a"));
    }
}

#[cfg(test)]
mod proptests {
    use super::*;
    use proptest::prelude::*;

    fn arb_steps(kinds: Vec<String>) -> Vec<TraceStep> {
        kinds
            .into_iter()
            .enumerate()
            .map(|(i, kind)| TraceStep {
                step: i,
                kind,
                detail: String::new(),
                depth: 0,
                objects: vec![],
            })
            .collect()
    }

    proptest! {
        #[test]
        fn prop_count_matches_has_kind(kinds in prop::collection::vec("[a-z]{1,8}", 0..15)) {
            let steps = arb_steps(kinds.clone());
            let tq = TraceQuery::new(&steps);
            for k in &kinds {
                prop_assert_eq!(tq.has_kind(k), tq.count_of(k) > 0);
            }
        }

        #[test]
        fn prop_kth_consistent_with_filter(
            kinds in prop::collection::vec("[a-z]{1,6}", 1..15),
            target in "[a-z]{1,6}",
            index in 0usize..10,
        ) {
            let steps = arb_steps(kinds);
            let tq = TraceQuery::new(&steps);
            let via_filter = tq.as_slice().iter().filter(|t| t.kind == target).nth(index);
            prop_assert_eq!(tq.kth_of(&target, index), via_filter);
        }

        #[test]
        fn prop_require_non_empty_iff_empty(n in 0usize..20) {
            let steps: Vec<TraceStep> = (0..n).map(|i| TraceStep {
                step: i, kind: "x".to_string(), detail: String::new(), depth: 0, objects: vec![],
            }).collect();
            let tq = TraceQuery::new(&steps);
            prop_assert_eq!(tq.require_non_empty().is_err(), n == 0);
        }

        #[test]
        fn prop_sequence_empty_always_passes(kinds in prop::collection::vec("[a-z]{1,6}", 0..15)) {
            let steps = arb_steps(kinds);
            let tq = TraceQuery::new(&steps);
            prop_assert!(tq.sequence_contains(&[]));
        }
    }
}
