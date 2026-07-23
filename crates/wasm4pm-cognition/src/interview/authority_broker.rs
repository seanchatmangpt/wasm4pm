//! Side-effect authorization (ARD §3.15 Authority Broker).
//!
//! Distinct from [`crate::authority::AuthorityClassifier`], which classifies
//! the *provenance* of a piece of text. This module gates *actions* — nothing
//! outside `observe`/`admit`/`project`/`execute_code` may happen without an
//! explicit grant, and grants are default-deny.

use std::collections::BTreeSet;

/// A class of side effect that requires explicit authorization.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AuthorityClass {
    /// Observe an event.
    Observe,
    /// Admit an observation into the blackboard.
    Admit,
    /// Project assistance to the candidate.
    Project,
    /// Execute candidate code in the sandbox.
    ExecuteCode,
    /// Record a session artifact.
    Record,
    /// Retain a recorded artifact beyond the session.
    Retain,
    /// Export session data outside the local runtime.
    Export,
    /// Communicate on the candidate's behalf.
    Communicate,
}

/// A capability request was denied because it was never granted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthorityDenied(pub AuthorityClass);

/// Broker of side-effect authority for one session.
///
/// A fresh broker denies every [`AuthorityClass`] — grants must be explicit.
#[derive(Debug, Clone, Default)]
pub struct AuthorityBroker {
    granted: BTreeSet<AuthorityClass>,
}

impl AuthorityBroker {
    /// A fresh broker with nothing granted (bootstrap: default-deny).
    pub fn new() -> Self {
        Self {
            granted: BTreeSet::new(),
        }
    }

    /// Grant a class of authority for the remainder of the session.
    pub fn grant(&mut self, class: AuthorityClass) {
        self.granted.insert(class);
    }

    /// Revoke a previously granted authority class.
    pub fn revoke(&mut self, class: AuthorityClass) {
        self.granted.remove(&class);
    }

    /// Check whether `class` is currently authorized.
    pub fn authorize(&self, class: AuthorityClass) -> Result<(), AuthorityDenied> {
        if self.granted.contains(&class) {
            Ok(())
        } else {
            Err(AuthorityDenied(class))
        }
    }
}
