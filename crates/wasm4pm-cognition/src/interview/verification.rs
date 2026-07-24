//! Layered verification status (ARD §3.11 Test and Verification Engine).
//!
//! These states never collapse into one generic "correct" — a caller can ask
//! "did this reach at least VisibleTestsPass" without that being conflated
//! with HiddenTestsPass or FormallyProven, and the ledger refuses to let a
//! caller record or claim a status the candidate didn't actually reach.

use std::collections::BTreeMap;

/// Verification layers, ordered from weakest to strongest evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum VerificationStatus {
    /// The worked example ran and matched.
    ExamplePass,
    /// All visible tests passed.
    VisibleTestsPass,
    /// All hidden tests passed.
    HiddenTestsPass,
    /// Property-based tests passed.
    PropertyTestsPass,
    /// Formally proven against a specification.
    FormallyProven,
}

/// A caller tried to claim a status stronger than what was actually recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnrecordedStatus {
    /// The candidate in question.
    pub candidate_id: String,
    /// What was actually recorded (or `None` if nothing was).
    pub recorded: Option<VerificationStatus>,
    /// What the caller tried to claim.
    pub claimed: VerificationStatus,
}

/// Records the highest verification status actually reached per candidate.
#[derive(Debug, Clone, Default)]
pub struct VerificationLedger {
    reached: BTreeMap<String, VerificationStatus>,
}

impl VerificationLedger {
    /// A fresh ledger with nothing recorded (bootstrap).
    pub fn new() -> Self {
        Self::default()
    }

    /// Record that `candidate_id` reached `status`. Only raises the
    /// recorded status (never silently downgrades a stronger prior record).
    pub fn record(&mut self, candidate_id: impl Into<String>, status: VerificationStatus) {
        let id = candidate_id.into();
        let entry = self.reached.entry(id).or_insert(status);
        if status > *entry {
            *entry = status;
        }
    }

    /// The highest status actually recorded for a candidate, if any.
    pub fn status_of(&self, candidate_id: &str) -> Option<VerificationStatus> {
        self.reached.get(candidate_id).copied()
    }

    /// Assert `candidate_id` reached at least `minimum` — refuses (rather
    /// than silently passing) if nothing was recorded, or if only a weaker
    /// status was reached.
    pub fn assert_minimum(
        &self,
        candidate_id: &str,
        minimum: VerificationStatus,
    ) -> Result<VerificationStatus, UnrecordedStatus> {
        match self.reached.get(candidate_id) {
            Some(&status) if status >= minimum => Ok(status),
            other => Err(UnrecordedStatus {
                candidate_id: candidate_id.to_string(),
                recorded: other.copied(),
                claimed: minimum,
            }),
        }
    }
}
