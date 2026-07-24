//! Partitioned shared working state (ARD §3.6 Blackboard).
//!
//! Independent cognition modules never mutate a partition directly — they
//! submit proposals through [`Blackboard::propose_admission`], which routes
//! through the [`AdmissionEngine`] gate. This keeps admission the single
//! choke point for what becomes trusted state.

use super::admission::{AdmissionEngine, AdmittedFact, RawObservation, RefusalReason};
use std::collections::BTreeSet;

/// Shared session working state, partitioned per the ARD blackboard design.
#[derive(Debug, Clone, Default)]
pub struct Blackboard {
    /// Facts that passed the [`AdmissionEngine`] gate, in admission order.
    admitted: Vec<AdmittedFact>,
    /// Outstanding obligations that must be resolved before completion.
    obligations: BTreeSet<String>,
    /// Unresolved residue carried forward between turns/workflows.
    residue: Vec<String>,
}

impl Blackboard {
    /// A fresh, empty blackboard (bootstrap: nothing admitted, no obligations).
    pub fn new() -> Self {
        Self::default()
    }

    /// Facts admitted so far, in order.
    pub fn admitted(&self) -> &[AdmittedFact] {
        &self.admitted
    }

    /// Outstanding obligations.
    pub fn obligations(&self) -> &BTreeSet<String> {
        &self.obligations
    }

    /// Unresolved residue.
    pub fn residue(&self) -> &[String] {
        &self.residue
    }

    /// Add an obligation.
    pub fn add_obligation(&mut self, obligation: impl Into<String>) {
        self.obligations.insert(obligation.into());
    }

    /// Resolve (remove) an obligation.
    pub fn resolve_obligation(&mut self, obligation: &str) {
        self.obligations.remove(obligation);
    }

    /// Carry forward a piece of unresolved residue.
    pub fn push_residue(&mut self, note: impl Into<String>) {
        self.residue.push(note.into());
    }

    /// The only path by which a raw observation becomes trusted state: routed
    /// through the [`AdmissionEngine`], which sees the *current* admitted set
    /// (so the first admission — first mile — is evaluated with an empty
    /// prior, not skipped because there's nothing to compare against).
    pub fn propose_admission(
        &mut self,
        engine: &AdmissionEngine,
        observation: &RawObservation,
        confidence: f32,
    ) -> Result<&AdmittedFact, RefusalReason> {
        let fact = engine.admit(&self.admitted, observation, confidence)?;
        self.admitted.push(fact);
        Ok(self.admitted.last().expect("just pushed"))
    }
}
