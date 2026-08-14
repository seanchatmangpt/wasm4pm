//! Minimal real partial-order workflow executor (ARD §3.9 Workflow Engine).
//!
//! A DAG of named steps with precedence edges. `eligible_steps` is where
//! concurrency is expressed — every step whose prerequisites are all
//! completed is independently eligible, not serialized into one arbitrary
//! order. This is deliberately not a BPMN/YAWL conversion engine (that's
//! `bcinr-powl`'s job, untouched); no reusable POWL *executor* exists
//! anywhere else in this workspace, so this is new, minimal, and real.

use std::collections::BTreeSet;

/// A workflow request referenced a step that isn't part of the DAG.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownStep(pub String);

/// A step was completed before all of its prerequisites were.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrerequisitesNotMet {
    /// The step that was requested.
    pub step: String,
    /// A prerequisite that was not yet complete.
    pub missing_prerequisite: String,
}

/// Why `complete_step` refused a request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepRefusal {
    /// The step isn't part of this workflow's DAG.
    Unknown(UnknownStep),
    /// A prerequisite for the step hasn't completed yet.
    NotEligible(PrerequisitesNotMet),
    /// The step was already completed.
    AlreadyCompleted(String),
}

/// A partial-order workflow: named steps, each depending on zero or more
/// prerequisite steps.
#[derive(Debug, Clone, Default)]
pub struct Workflow {
    prerequisites: std::collections::BTreeMap<String, BTreeSet<String>>,
    completed: BTreeSet<String>,
}

impl Workflow {
    /// A fresh workflow with no steps defined (bootstrap).
    pub fn new() -> Self {
        Self::default()
    }

    /// Declare a step and its prerequisite step names (which need not
    /// already be declared, to allow declaring steps in any order).
    pub fn add_step(
        &mut self,
        step: impl Into<String>,
        prerequisites: impl IntoIterator<Item = String>,
    ) {
        self.prerequisites
            .insert(step.into(), prerequisites.into_iter().collect());
    }

    /// Steps completed so far.
    pub fn completed(&self) -> &BTreeSet<String> {
        &self.completed
    }

    /// Every declared, not-yet-completed step whose prerequisites are all in
    /// `self.completed()` — the concurrency surface: all of these may run
    /// independently right now.
    pub fn eligible_steps(&self) -> BTreeSet<String> {
        self.prerequisites
            .iter()
            .filter(|(step, prereqs)| {
                !self.completed.contains(*step)
                    && prereqs.iter().all(|p| self.completed.contains(p))
            })
            .map(|(step, _)| step.clone())
            .collect()
    }

    /// Mark `step` completed, independently re-checking eligibility rather
    /// than trusting the caller's claim that it's ready.
    pub fn complete_step(&mut self, step: &str) -> Result<(), StepRefusal> {
        let Some(prereqs) = self.prerequisites.get(step) else {
            return Err(StepRefusal::Unknown(UnknownStep(step.to_string())));
        };
        if self.completed.contains(step) {
            return Err(StepRefusal::AlreadyCompleted(step.to_string()));
        }
        for prereq in prereqs {
            if !self.completed.contains(prereq) {
                return Err(StepRefusal::NotEligible(PrerequisitesNotMet {
                    step: step.to_string(),
                    missing_prerequisite: prereq.clone(),
                }));
            }
        }
        self.completed.insert(step.to_string());
        Ok(())
    }

    /// Reconstruct a workflow's completed-set by replaying a persisted
    /// sequence of "completed" claims against a fresh instance sharing the
    /// same step declarations — each claim is independently re-validated via
    /// [`Workflow::complete_step`], not trusted because it's a persisted flag.
    pub fn replay_completed(
        &mut self,
        claimed_completed_in_order: &[String],
    ) -> Result<(), StepRefusal> {
        for step in claimed_completed_in_order {
            self.complete_step(step)?;
        }
        Ok(())
    }
}
