//! Rust-side typed capability contract (ARD §3.8 Capability Registry).
//!
//! This is the descriptor/precondition contract only — no execution, no
//! HTTP dispatch. The Next.js interview-sandbox site's capability catalog
//! (owned by a separate session) is a distinct, HTTP-facing artifact; this
//! registry exists so cognition-side code can check "is this capability's
//! precondition satisfied" without depending on that site at all.

use super::authority_broker::AuthorityClass;
use super::blackboard::Blackboard;
use std::collections::BTreeMap;

/// A typed description of one capability's contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapabilityDescriptor {
    /// Stable identifier, e.g. `"compile_python"`.
    pub capability_id: String,
    /// Obligation names that must already be present on the [`Blackboard`]
    /// before this capability may be requested.
    pub preconditions: Vec<String>,
    /// Obligation names this capability, once exercised, is expected to resolve.
    pub postconditions: Vec<String>,
    /// Free-form description of side effects this capability has.
    pub effects: Vec<String>,
    /// The [`AuthorityClass`] a caller must hold to invoke this capability.
    pub authority_requirement: AuthorityClass,
}

/// A capability request was refused because a precondition was not met.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreconditionUnmet {
    /// The capability that was requested.
    pub capability_id: String,
    /// The specific missing precondition.
    pub missing: String,
}

/// The capability was requested but has no registered descriptor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownCapability(pub String);

/// Registry of capability descriptors, keyed by id.
#[derive(Debug, Clone, Default)]
pub struct CapabilityRegistry {
    descriptors: BTreeMap<String, CapabilityDescriptor>,
}

impl CapabilityRegistry {
    /// A fresh, empty registry (bootstrap: nothing registered).
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a capability descriptor.
    pub fn register(&mut self, descriptor: CapabilityDescriptor) {
        self.descriptors
            .insert(descriptor.capability_id.clone(), descriptor);
    }

    /// Look up a descriptor by id.
    pub fn get(&self, capability_id: &str) -> Option<&CapabilityDescriptor> {
        self.descriptors.get(capability_id)
    }

    /// Check that `capability_id` is registered and every one of its
    /// preconditions is currently present among `blackboard`'s obligations —
    /// having a registered descriptor does not, by itself, grant the request.
    pub fn check_preconditions(
        &self,
        capability_id: &str,
        blackboard: &Blackboard,
    ) -> Result<&CapabilityDescriptor, PreconditionRefusal> {
        let descriptor = self.descriptors.get(capability_id).ok_or_else(|| {
            PreconditionRefusal::Unknown(UnknownCapability(capability_id.to_string()))
        })?;

        for precondition in &descriptor.preconditions {
            if !blackboard.obligations().contains(precondition) {
                return Err(PreconditionRefusal::Unmet(PreconditionUnmet {
                    capability_id: capability_id.to_string(),
                    missing: precondition.clone(),
                }));
            }
        }
        Ok(descriptor)
    }
}

/// Why a capability request was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreconditionRefusal {
    /// No descriptor is registered for the requested capability.
    Unknown(UnknownCapability),
    /// A registered precondition was not satisfied.
    Unmet(PreconditionUnmet),
}
