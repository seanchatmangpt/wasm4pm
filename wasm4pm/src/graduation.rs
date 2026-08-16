//! Graduation intake path in wasm4pm.
//!
//! Consumes a `GraduationCandidate` from the baseline,
//! validating its grounding and allowing execution to proceed.

use wasm4pm_compat::engine_bridge::GraduationCandidate;

/// Executable proof-carrying POWL 2 checker, broker, receipt, and replay bridge.
#[path = "pc_powl2/mod.rs"]
pub mod pc_powl2;

pub use pc_powl2::{
    canonical_digest, replay_receipt, FiniteStateDomain, PcPowl2Broker, PcPowl2Checker,
    PcpResult, VerificationReport, VerificationStanding,
};

/// Intake a `GraduationCandidate` into the wasm4pm execution layer.
///
/// Verifies that the candidate is grounded (carrying both a valid subject and
/// a justifying evidence reference) before admitting it for execution.
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
