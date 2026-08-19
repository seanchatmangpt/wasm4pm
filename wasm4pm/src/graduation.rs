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
    canonical_digest, replay_receipt, FiniteStateDomain, PcPowl2Broker, PcPowl2Checker,
    PcpResult, VerificationReport, VerificationStanding,
};

// Verification and evidence shapes are safe to expose before the typed adapter:
// none can reach the private authority verifier or consequence broker.
pub use protocol_runtime::{
    protocol_receipt_to_ocel_event, verify_receipt_chain, ProtocolReceipt, ReversiblePhase,
    ReversibleReceipt, RuntimeRefusal,
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