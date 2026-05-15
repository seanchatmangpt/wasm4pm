/// PROOF-OF-CONCEPT ONLY — gated by `poc_gate_validator` feature.
///
/// Uses an in-memory `Mutex<HashSet<ProofGate>>` as a fake gate store.
/// NOT connected to the SPARQL receipt store and MUST NOT be used on any
/// production proof-admission path.
///
/// For production gate checks, use `proof_gate_registry`.
use crate::proof_gate_registry::ProofGate;
use std::sync::Mutex;
use std::collections::HashSet;

/// Thread-safe gate state for tracking passed proof gates
static PASSED_GATES: Mutex<Option<HashSet<ProofGate>>> = Mutex::new(None);

/// Initialize gate state for a test run
pub fn init_gates() {
    if let Ok(mut gates) = PASSED_GATES.lock() {
        *gates = Some(HashSet::new());
    }
}

/// Mark a gate as passed
pub fn mark_gate_passed(gate: ProofGate) {
    if let Ok(mut gates_opt) = PASSED_GATES.lock() {
        if let Some(ref mut gates) = *gates_opt {
            gates.insert(gate);
        }
    }
}

/// Check if a gate has passed
pub fn gate_passed(gate: ProofGate) -> bool {
    PASSED_GATES
        .lock()
        .ok()
        .and_then(|gates_opt| gates_opt.as_ref().map(|gates| gates.contains(&gate)))
        .unwrap_or(false)
}

/// Returns list of all passed gates
pub fn passed_gates() -> Vec<ProofGate> {
    PASSED_GATES
        .lock()
        .ok()
        .and_then(|gates_opt| gates_opt.as_ref().map(|gates| gates.iter().copied().collect()))
        .unwrap_or_default()
}

/// Verify that test_suite_passes gate has been reached before export
/// Returns Ok(()) if gate passed, or Err with diagnostic message
#[inline]
pub fn verify_export_gate() -> Result<(), String> {
    if gate_passed(ProofGate::gate_test_suite_passes) {
        Ok(())
    } else {
        Err(format!(
            "Cannot export results: {} gate not passed. Required gates: {}",
            ProofGate::gate_test_suite_passes,
            ProofGate::pipeline_order()
                .iter()
                .map(|g| g.label())
                .collect::<Vec<_>>()
                .join(", ")
        ))
    }
}

/// Optional trait for algorithms that must pass gates before export
pub trait GatedExport {
    fn verify_export_allowed(&self) -> Result<(), String>;
}

impl GatedExport for () {
    fn verify_export_allowed(&self) -> Result<(), String> {
        verify_export_gate()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gate_lifecycle() {
        init_gates();
        assert!(!gate_passed(ProofGate::gate_test_suite_passes));

        mark_gate_passed(ProofGate::gate_test_suite_passes);
        assert!(gate_passed(ProofGate::gate_test_suite_passes));

        assert_eq!(passed_gates().len(), 1);
    }

    #[test]
    fn test_verify_export_requires_gate() {
        init_gates();
        assert!(verify_export_gate().is_err());

        mark_gate_passed(ProofGate::gate_test_suite_passes);
        assert!(verify_export_gate().is_ok());
    }
}
