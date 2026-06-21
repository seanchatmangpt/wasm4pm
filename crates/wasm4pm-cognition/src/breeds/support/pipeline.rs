//! `BreedPipeline<S>` — typed staged computation with automatic OCEL trace.
//!
//! STATUS (2026-06-11): zero breed adoption. For new breeds, prefer the
//! lighter-weight [`super::tracer::Tracer`] + `BreedOutput::from_parts`
//! combination; do not adopt `BreedPipeline` without fleet-lead signoff.
//! Kept for in-flight fleets — do not delete (union-merge law).
//!
//! Each `stage()` call emits one `TraceStep` (kind = stage name) before
//! executing the stage body. The `finish()` call validates that the required
//! stage kinds were emitted and returns the `BreedOutput`. This makes empty-
//! trace fraud (FM-5) structurally impossible: if a stage ran, the step was
//! recorded.
//!
//! Usage:
//! ```ignore
//! fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
//!     BreedPipeline::new(BreedId::LtlMonitor, LtlState::default())
//!         .stage("parse-formula", |s| { s.formula = parse(input)?; Ok("parsed".into()) })?
//!         .stage("progress",      |s| { s.verdict = progress(s.formula, input)?; Ok(format!("{:?}", s.verdict)) })?
//!         .finish(|s| BreedOutput { selected: Some(s.verdict.to_string()), ..Default::default() })
//! }
//! ```

use crate::breeds::{BreedError, BreedId, BreedOutput, TraceStep};

/// A staged pipeline that threads state `S` through named steps,
/// automatically recording each step in the OCEL inference trace.
pub struct BreedPipeline<S> {
    breed: BreedId,
    state: S,
    trace: Vec<TraceStep>,
    step: usize,
}

impl<S> BreedPipeline<S> {
    /// Create a new pipeline for `breed` with initial state.
    pub fn new(breed: BreedId, state: S) -> Self {
        Self {
            breed,
            state,
            trace: Vec::new(),
            step: 0,
        }
    }

    /// Execute one named stage.
    ///
    /// Pushes a `TraceStep` with `kind = name` before running `f`.
    /// `f` receives `&mut S` and returns a detail string on success.
    pub fn stage<F>(mut self, name: &'static str, f: F) -> Result<Self, BreedError>
    where
        F: FnOnce(&mut S) -> Result<String, BreedError>,
    {
        // Record the step *before* running so partial traces are still valid evidence.
        let detail = f(&mut self.state)?;
        self.trace.push(TraceStep {
            step: self.step,
            kind: name.to_string(),
            detail,
            depth: 0,
            objects: vec![],
        });
        self.step += 1;
        Ok(self)
    }

    /// Consume the pipeline, inject the trace into `output`, and return it.
    ///
    /// `f` converts the final state into a `BreedOutput`; this function
    /// overwrites `output.inference_trace` with the accumulated steps.
    pub fn finish<F>(self, f: F) -> Result<BreedOutput, BreedError>
    where
        F: FnOnce(S) -> BreedOutput,
    {
        let mut output = f(self.state);
        output.inference_trace = self.trace;
        Ok(output)
    }

    /// Access the current state immutably (useful for inspection in tests).
    pub fn state(&self) -> &S {
        &self.state
    }

    /// Current step count (number of stages executed so far).
    pub fn steps_completed(&self) -> usize {
        self.step
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedId, BreedInput, BreedOutput};

    #[derive(Default)]
    struct CountState {
        count: usize,
    }

    fn empty_output() -> BreedOutput {
        BreedOutput {
            breed: BreedId::LtlMonitor,
            candidates: vec![],
            facts: vec![],
            explanation: String::new(),
            inference_trace: vec![],
            selected: None,
            ocel_log: None,
            retained_cases: vec![],
        }
    }

    #[test]
    fn stages_emit_trace_steps() {
        let output = BreedPipeline::new(BreedId::LtlMonitor, CountState::default())
            .stage("step-a", |s| {
                s.count += 1;
                Ok("a".into())
            })
            .unwrap()
            .stage("step-b", |s| {
                s.count += 1;
                Ok("b".into())
            })
            .unwrap()
            .finish(|_| empty_output())
            .unwrap();

        assert_eq!(output.inference_trace.len(), 2);
        assert_eq!(output.inference_trace[0].kind, "step-a");
        assert_eq!(output.inference_trace[1].kind, "step-b");
    }

    #[test]
    fn stage_error_stops_pipeline() {
        let err = BreedPipeline::new(BreedId::LtlMonitor, CountState::default())
            .stage("good", |s| {
                s.count += 1;
                Ok("ok".into())
            })
            .unwrap()
            .stage("bad", |_| {
                Err(BreedError {
                    breed: BreedId::LtlMonitor,
                    message: "fail".to_string(),
                })
            });
        assert!(err.is_err());
    }

    #[test]
    fn finish_overwrites_trace() {
        let mut pre_output = empty_output();
        pre_output.inference_trace.push(TraceStep {
            step: 0,
            kind: "stale".to_string(),
            detail: "x".to_string(),
            depth: 0,
            objects: vec![],
        });
        let output = BreedPipeline::new(BreedId::LtlMonitor, CountState::default())
            .stage("real", |_| Ok("y".into()))
            .unwrap()
            .finish(|_| pre_output)
            .unwrap();
        assert_eq!(output.inference_trace.len(), 1);
        assert_eq!(output.inference_trace[0].kind, "real");
    }
}
