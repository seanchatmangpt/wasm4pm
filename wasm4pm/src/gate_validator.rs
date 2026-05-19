/// PROOF-OF-CONCEPT ONLY — gated by `poc_gate_validator` feature.
///
/// Uses an in-memory `RefCell<HashSet<ProofGate>>` as a fake gate store.
/// WASM single-threaded safety: RefCell instead of Mutex to avoid deadlock risk.
/// NOT connected to the SPARQL receipt store and MUST NOT be used on any
/// production proof-admission path.
///
/// For production gate checks, use `proof_gate_registry`.
use crate::proof_gate_registry::ProofGate;
use std::cell::RefCell;
use std::collections::HashSet;

/// Gate state for tracking passed proof gates (single-threaded WASM safety)
thread_local! {
    static PASSED_GATES: RefCell<Option<HashSet<ProofGate>>> = const { RefCell::new(None) };
}

fn gates<R>(f: impl FnOnce(&RefCell<Option<HashSet<ProofGate>>>) -> R) -> R {
    PASSED_GATES.with(f)
}

/// Initialize gate state for a test run
pub fn init_gates() {
    gates(|g| {
        *g.borrow_mut() = Some(HashSet::new());
    });
}

/// Mark a gate as passed
pub fn mark_gate_passed(gate: ProofGate) {
    gates(|g| {
        if let Some(ref mut gates) = *g.borrow_mut() {
            gates.insert(gate);
        }
    });
}

/// Check if a gate has passed
pub fn gate_passed(gate: ProofGate) -> bool {
    gates(|g| {
        g.borrow()
            .as_ref()
            .map(|gates| gates.contains(&gate))
            .unwrap_or(false)
    })
}

/// Returns list of all passed gates
pub fn passed_gates() -> Vec<ProofGate> {
    gates(|g| {
        g.borrow()
            .as_ref()
            .map(|gates| gates.iter().copied().collect())
            .unwrap_or_default()
    })
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
