//! Graduation intake path in wasm4pm.
//!
//! Consumes structure-only compatibility candidates and protocol contracts at
//! the explicit seam where evidence may graduate into execution. Graduation is
//! never itself authority: consequential DO remains authority-verified,
//! brokered, receipted, replayable, and OCEL-observable.

use wasm4pm_compat::engine_bridge::GraduationCandidate;

/// Executable proof-carrying POWL 2 checker, broker, receipt, and replay bridge.
#[path = "pc_powl2/mod.rs"]
pub mod pc_powl2;

// The federated consequence kernel is intentionally private until the canonical
// phase-typed protocol substrate from wasm4pm-compat is available through this
// repository's required crates.io dependency. This keeps the machinery
// executable under its own tests without exposing a generic trait seam through
// which an arbitrary caller could masquerade as a DO intent. The later public
// adapter must be a zero-policy mapping from compat's sealed SELECT / CONSTRUCT /
// DO types into this kernel.
#[path = "graduation/protocol_runtime.rs"]
mod protocol_runtime;

pub use pc_powl2::{
    canonical_digest, replay_receipt, FiniteStateDomain, PcPowl2Broker, PcPowl2Checker, PcpResult,
    VerificationReport, VerificationStanding,
<<<<<<< HEAD
};

// Verification and evidence shapes are safe to expose before the typed adapter:
// none can reach the private authority verifier or consequence broker.
pub use protocol_runtime::{
    protocol_receipt_to_ocel_event, verify_receipt_chain, ProtocolReceipt, ReversiblePhase,
    ReversibleReceipt, RuntimeRefusal,
=======
>>>>>>> origin/integration/finish-wip-v26.9.1-20260815
};

/// Intake a `GraduationCandidate` into the wasm4pm execution layer.
///
/// Verifies that the candidate is grounded (carrying both a valid subject and
/// a justifying evidence reference) before admitting it for execution.
///
/// This check grants no consequential authority. Until the phase-typed compat
/// substrate is published, the federated DO kernel itself remains private. Once
/// the exact compat types are consumable, its public adapter must still require
/// exact external authority verification, receiptability, and the exclusive
/// consequence broker before any consequential call.
///
/// # Errors
///
/// Returns an error if the candidate is not grounded.
pub fn intake_candidate(candidate: &GraduationCandidate) -> Result<(), String> {
    if !candidate.is_grounded() {
        return Err(
            "GraduationCandidate is ungrounded (missing subject or evidence reference)".to_string(),
        );
    }

    tracing::info!(
        target: "wasm4pm.graduation",
        reason = ?candidate.reason,
        subject = %candidate.subject,
        evidence_ref = %candidate.evidence_ref,
        "GraduationCandidate successfully admitted to wasm4pm engine"
    );

    Ok(())
}

// ── Economic actuation boundary ─────────────────────────────────────────────
//
// DfCM rule: economic semantic identity and execution authority are orthogonal.
// The operation type is intentionally generic so this module does not copy the
// canonical byte registry from ex4pm/wasm4pm-compat.  When the compat projection
// is present, its admitted opcode type can be used directly as `O`.

/// A selected economic operation. Selection is information-plane state only;
/// constructing this value grants no permission to actuate anything.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectedEconomicOperation<O> {
    operation: O,
}

impl<O> SelectedEconomicOperation<O> {
    /// Manufacture a selection without crossing the DO boundary.
    pub fn new(operation: O) -> Self {
        Self { operation }
    }

    /// Inspect the selected operation without consuming or authorizing it.
    pub fn operation(&self) -> &O {
        &self.operation
    }
}

/// Explicit proof presented to the economic DO boundary.
///
/// This is deliberately separate from the economic verb.  An opcode such as
/// PAY or TRANSFER never implies that this receipt exists.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EconomicDoAuthority {
    /// Subject authorized to cross the DO boundary.
    pub subject: String,
    /// Scope identifying the allowed actuation surface.
    pub scope: String,
    /// Receipt/evidence identifier that can be independently verified.
    pub evidence_ref: String,
}

impl EconomicDoAuthority {
    /// Authority is grounded only when all three independent coordinates are
    /// present.  Empty strings are not silently promoted to authority.
    pub fn is_grounded(&self) -> bool {
        !self.subject.trim().is_empty()
            && !self.scope.trim().is_empty()
            && !self.evidence_ref.trim().is_empty()
    }
}

/// Operation whose selection and DO authority have been joined at the boundary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedEconomicOperation<O> {
    pub operation: O,
    pub authority: EconomicDoAuthority,
}

/// Named refusal for economic actuation admission.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EconomicActuationRefusal {
    /// No authority receipt was supplied.
    MissingDoAuthority,
    /// Receipt exists structurally but lacks subject/scope/evidence grounding.
    UngroundedDoAuthority,
}

impl core::fmt::Display for EconomicActuationRefusal {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::MissingDoAuthority => write!(f, "MissingDoAuthority"),
            Self::UngroundedDoAuthority => write!(f, "UngroundedDoAuthority"),
        }
    }
}

impl std::error::Error for EconomicActuationRefusal {}

/// Cross SELECT → DO only when a separate, grounded authority receipt exists.
///
/// No economic opcode, planner choice, OCEL event, model output, or selection
/// can satisfy this gate by itself.
pub fn admit_economic_do<O>(
    selected: SelectedEconomicOperation<O>,
    authority: Option<EconomicDoAuthority>,
) -> Result<AuthorizedEconomicOperation<O>, EconomicActuationRefusal> {
    let authority = authority.ok_or(EconomicActuationRefusal::MissingDoAuthority)?;
    if !authority.is_grounded() {
        return Err(EconomicActuationRefusal::UngroundedDoAuthority);
    }

    Ok(AuthorizedEconomicOperation {
        operation: selected.operation,
        authority,
    })
}

#[cfg(test)]
mod economic_authority_tests {
    use super::*;

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct CanonicalOpcode(u8);

    fn grounded() -> EconomicDoAuthority {
        EconomicDoAuthority {
            subject: "account:merchant-42".into(),
            scope: "settlement:invoice-7".into(),
            evidence_ref: "receipt:blake3:abc123".into(),
        }
    }

    #[test]
    fn selection_does_not_imply_do_authority() {
        let selected = SelectedEconomicOperation::new(CanonicalOpcode(0x41));
        assert_eq!(
            admit_economic_do(selected, None),
            Err(EconomicActuationRefusal::MissingDoAuthority)
        );
    }

    #[test]
    fn ungrounded_authority_is_refused() {
        let selected = SelectedEconomicOperation::new(CanonicalOpcode(0x41));
        let authority = EconomicDoAuthority {
            subject: "account:merchant-42".into(),
            scope: "".into(),
            evidence_ref: "receipt:blake3:abc123".into(),
        };
        assert_eq!(
            admit_economic_do(selected, Some(authority)),
            Err(EconomicActuationRefusal::UngroundedDoAuthority)
        );
    }

    #[test]
    fn grounded_authority_admits_without_changing_operation_identity() {
        let selected = SelectedEconomicOperation::new(CanonicalOpcode(0x41));
        let admitted = admit_economic_do(selected, Some(grounded())).unwrap();
        assert_eq!(admitted.operation, CanonicalOpcode(0x41));
        assert_eq!(admitted.authority.scope, "settlement:invoice-7");
    }
}
