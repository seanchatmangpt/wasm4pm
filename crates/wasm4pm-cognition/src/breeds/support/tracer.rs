//! `Tracer` — append-only `TraceStep` accumulator.
//!
//! Replaces the hand-rolled local `push` closure found in most breeds:
//!
//! ```ignore
//! let mut push = |kind: &str, detail: String, depth: u32| {
//!     trace.push(TraceStep { step: trace.len(), kind: kind.to_string(),
//!                            detail, depth, objects: vec![] });
//! };
//! ```
//!
//! Field semantics are identical to that pattern (`step` = current length,
//! `objects` empty), so migrating a breed from the closure to `Tracer`
//! produces byte-identical `BreedOutput` serialization — receipts and the
//! `breed_determinism` gate are unaffected.

use crate::breeds::TraceStep;

/// Append-only trace accumulator with monotonic step indices.
#[derive(Debug, Default)]
pub struct Tracer {
    steps: Vec<TraceStep>,
}

impl Tracer {
    /// Empty trace.
    pub fn new() -> Self {
        Self { steps: Vec::new() }
    }

    /// Append a step at depth 0.
    pub fn push(&mut self, kind: impl Into<String>, detail: impl Into<String>) {
        self.push_at(kind, detail, 0);
    }

    /// Append a step at an explicit recursion depth.
    pub fn push_at(&mut self, kind: impl Into<String>, detail: impl Into<String>, depth: u32) {
        self.steps.push(TraceStep {
            step: self.steps.len(),
            kind: kind.into(),
            detail: detail.into(),
            depth,
            objects: vec![],
        });
    }

    /// Append a step carrying OCEL object references.
    pub fn push_with_objects(
        &mut self,
        kind: impl Into<String>,
        detail: impl Into<String>,
        depth: u32,
        objects: Vec<(String, String)>,
    ) {
        self.steps.push(TraceStep {
            step: self.steps.len(),
            kind: kind.into(),
            detail: detail.into(),
            depth,
            objects,
        });
    }

    /// Number of steps recorded so far.
    pub fn len(&self) -> usize {
        self.steps.len()
    }

    /// True if no steps have been recorded (an FM-5 fraud signal if a breed
    /// returns such a trace from `run()`).
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    /// Consume the tracer, yielding the trace for `BreedOutput`.
    pub fn into_vec(self) -> Vec<TraceStep> {
        self.steps
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_indices_are_monotonic_from_zero() {
        let mut t = Tracer::new();
        t.push("parse", "a");
        t.push_at("expand", "b", 2);
        t.push("close", "c");
        let v = t.into_vec();
        assert_eq!(v.iter().map(|s| s.step).collect::<Vec<_>>(), vec![0, 1, 2]);
        assert_eq!(v[1].depth, 2);
        assert_eq!(v[0].depth, 0);
        assert!(v.iter().all(|s| s.objects.is_empty()));
    }

    #[test]
    fn byte_identical_to_hand_rolled_closure() {
        // The exact pattern Tracer replaces — serialized bytes must match.
        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |kind: &str, detail: String, depth: u32, trace: &mut Vec<TraceStep>| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth,
                objects: vec![],
            });
        };
        push("fire-rule", "r1".to_string(), 0, &mut trace);
        push("unify", "x/y".to_string(), 1, &mut trace);

        let mut t = Tracer::new();
        t.push("fire-rule", "r1");
        t.push_at("unify", "x/y", 1);

        assert_eq!(
            serde_json::to_vec(&trace).unwrap(),
            serde_json::to_vec(&t.into_vec()).unwrap()
        );
    }

    #[test]
    fn objects_are_carried_through() {
        let mut t = Tracer::new();
        t.push_with_objects("emit", "artifact", 0, vec![("part".into(), "p1".into())]);
        let v = t.into_vec();
        assert_eq!(v[0].objects, vec![("part".to_string(), "p1".to_string())]);
    }
}
