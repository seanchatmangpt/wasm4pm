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

/// Authority-separated federated consequence runtime.
#[path = "graduation/protocol_runtime.rs"]
pub mod protocol_runtime;

pub use pc_powl2::{
    canonical_digest, replay_receipt, FiniteStateDomain, PcPowl2Broker, PcPowl2Checker,
    PcpResult, VerificationReport, VerificationStanding,
};

pub use protocol_runtime::{
    append_protocol_outcome, protocol_receipt_to_ocel_event, verify_receipt_chain, AdmittedDo,
    AuthorityDecisionView, AuthorityEvidence, AuthorityVerifier, BrokerReceipt, ConsequenceBroker,
    DoOutcome, IntentView, ProtocolReceipt, ProtocolRuntime, ReceiptRequirementView,
    ReversiblePhase, ReversibleReceipt, RuntimeRefusal,
};

/// Intake a `GraduationCandidate` into the wasm4pm execution layer.
///
/// Verifies that the candidate is grounded (carrying both a valid subject and
/// a justifying evidence reference) before admitting it for execution.
///
/// This check grants no consequential authority. A candidate that later reaches
/// protocol DO must still cross [`ProtocolRuntime::execute_do`], whose signature
/// requires an exact authority decision, an external authority verifier, a
/// receiptability contract, and the exclusive consequence broker.
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