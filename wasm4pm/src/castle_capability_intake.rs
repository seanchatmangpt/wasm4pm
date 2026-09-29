//! CASTLE process-evidence compatibility intake.
//!
//! wasm4pm-compat is already a dependency of the real wasm4pm crate. This
//! module makes its CASTLE placement explicit: structural compatibility behind
//! the deterministic WASM owner, never a second process engine or authority
//! boundary.

/// Exact ggen-ecosystem projection that selected this donor.
pub const PROJECTION_SOURCE: &str =
    "seanchatmangpt/ggen-ecosystem@50fdfa20c84205a80c6eb94e916cffbedc4b816e";

/// WASM4PM's irreducible CASTLE capability.
pub const OWNER_CAPABILITY: &str = "DETERMINISTIC_WASM_RUNTIME";

/// Projected donor repository.
pub const DONOR_REPOSITORY: &str = "seanchatmangpt/wasm4pm-compat";

/// Exact donor source observed by the projection.
pub const DONOR_SHA: &str = "c90e2d974c6bb9b2edc5bb25ac1d9e7364148a25";

/// Projected donor capability.
pub const DONOR_CAPABILITY: &str = "PROCESS_EVIDENCE_COMPATIBILITY";

/// Runtime placement for the donor.
pub const RUNTIME_PLACEMENT: &str = "STRUCTURAL_COMPATIBILITY_BOUNDARY";

/// Maximum authority this projection may manufacture.
pub const AUTHORITY_CEILING: &str = "CONSTRUCT";

/// Compatibility projection never carries process execution authority.
#[must_use]
pub const fn process_execution_authority() -> bool {
    false
}

/// Compatibility projection never carries CASTLE consequence authority.
#[must_use]
pub const fn consequence_authority() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compat_is_bound_to_real_wasm_owner_without_authority() {
        assert_eq!(OWNER_CAPABILITY, "DETERMINISTIC_WASM_RUNTIME");
        assert_eq!(DONOR_REPOSITORY, "seanchatmangpt/wasm4pm-compat");
        assert_eq!(DONOR_SHA, "c90e2d974c6bb9b2edc5bb25ac1d9e7364148a25");
        assert_eq!(RUNTIME_PLACEMENT, "STRUCTURAL_COMPATIBILITY_BOUNDARY");
        assert_eq!(AUTHORITY_CEILING, "CONSTRUCT");
        assert!(!process_execution_authority());
        assert!(!consequence_authority());
    }
}
