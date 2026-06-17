//! [`MonotonicTrace`] — append-only, monotonically-indexed sequence of
//! [`TraceStep`]s.
//!
//! Enforces two invariants that `Vec<TraceStep>` does not:
//! 1. Step indices are monotonically increasing with no gaps (`step[i] == i`).
//! 2. The collection is append-only (no mutation of past steps).
//!
//! `BreedOutput::inference_trace` remains `Vec<TraceStep>` for backward compat.
//! Use `MonotonicTrace` internally in new breeds to get the invariant at the
//! type level.

use crate::breeds::TraceStep;
use serde::{Deserialize, Serialize};

/// Append-only sequence of [`TraceStep`]s with monotonic step indices.
///
/// Serializes transparently as an array (same wire format as `Vec<TraceStep>`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub struct MonotonicTrace(Vec<TraceStep>);

impl MonotonicTrace {
    /// Create an empty trace.
    pub fn new() -> Self {
        Self(Vec::new())
    }

    /// Append the next step.
    ///
    /// Returns `Err` if the step index is wrong (monotonicity violation).
    pub fn push(&mut self, step: TraceStep) -> Result<(), String> {
        let expected = self.0.len();
        if step.step != expected {
            return Err(format!(
                "trace step index {} out of order (expected {})",
                step.step, expected
            ));
        }
        self.0.push(step);
        Ok(())
    }

    /// Number of steps.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// True if empty.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Borrow the inner slice.
    pub fn as_slice(&self) -> &[TraceStep] {
        &self.0
    }

    /// Consume into a plain `Vec<TraceStep>` (already monotonic).
    pub fn into_vec(self) -> Vec<TraceStep> {
        self.0
    }
}

impl From<Vec<TraceStep>> for MonotonicTrace {
    /// Import a pre-existing trace, renumbering steps to enforce monotonicity.
    fn from(v: Vec<TraceStep>) -> Self {
        let fixed = v.into_iter().enumerate().map(|(i, mut s)| { s.step = i; s }).collect();
        Self(fixed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(step: usize, kind: &str) -> TraceStep {
        TraceStep { step, kind: kind.to_string(), detail: String::new(), depth: 0, objects: vec![] }
    }

    #[test]
    fn push_in_order_succeeds() {
        let mut mt = MonotonicTrace::new();
        assert!(mt.push(ts(0, "a")).is_ok());
        assert!(mt.push(ts(1, "b")).is_ok());
        assert_eq!(mt.len(), 2);
    }

    #[test]
    fn push_out_of_order_fails() {
        let mut mt = MonotonicTrace::new();
        assert!(mt.push(ts(0, "a")).is_ok());
        let err = mt.push(ts(2, "b")).unwrap_err();
        assert!(err.contains("out of order"));
    }

    #[test]
    fn from_vec_renumbers() {
        let v = vec![ts(5, "x"), ts(10, "y")];
        let mt = MonotonicTrace::from(v);
        assert_eq!(mt.as_slice()[0].step, 0);
        assert_eq!(mt.as_slice()[1].step, 1);
    }

    #[test]
    fn serde_transparent() {
        let mut mt = MonotonicTrace::new();
        mt.push(ts(0, "init")).unwrap();
        let json = serde_json::to_string(&mt).unwrap();
        assert!(json.starts_with('['));
        let back: MonotonicTrace = serde_json::from_str(&json).unwrap();
        assert_eq!(back.len(), 1);
    }
}
