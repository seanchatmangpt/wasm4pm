/// Typestate-based gate validator for verifying proof-of-correctness.
///
/// This implementation uses strict Rust typestates to ensure that results can only
/// be exported if the required proof gates have been passed.
///
/// PROOF-OF-CONCEPT ONLY — gated by `poc_gate_validator` feature.
use crate::proof_gate_registry::ProofGate;
use std::collections::HashSet;

/// A run that has not yet been verified against required gates.
#[derive(Debug, Default, Clone)]
pub struct UnverifiedRun {
    passed_gates: HashSet<ProofGate>,
}

/// A run that has successfully passed the required gates.
#[derive(Debug, Clone)]
pub struct VerifiedRun {
    passed_gates: HashSet<ProofGate>,
}

impl UnverifiedRun {
    /// Start a new unverified run.
    pub fn new() -> Self {
        Self {
            passed_gates: HashSet::new(),
        }
    }

    /// Mark a gate as passed in this run.
    pub fn mark_gate_passed(&mut self, gate: ProofGate) {
        self.passed_gates.insert(gate);
    }

    /// Check if a gate has passed in this run.
    pub fn gate_passed(&self, gate: ProofGate) -> bool {
        self.passed_gates.contains(&gate)
    }

    /// Returns list of all passed gates.
    pub fn passed_gates(&self) -> Vec<ProofGate> {
        self.passed_gates.iter().copied().collect()
    }

    /// Consumes the UnverifiedRun and returns a VerifiedRun if all required gates passed.
    ///
    /// Required gate: `gate_test_suite_passes`
    pub fn verify(self) -> Result<VerifiedRun, String> {
        if self.passed_gates.contains(&ProofGate::gate_test_suite_passes) {
            Ok(VerifiedRun {
                passed_gates: self.passed_gates,
            })
        } else {
            Err(format!(
                "Cannot verify run: {} gate not passed. Required gates: {}",
                ProofGate::gate_test_suite_passes,
                ProofGate::pipeline_order()
                    .iter()
                    .map(|g| g.label())
                    .collect::<Vec<_>>()
                    .join(", ")
            ))
        }
    }
}

impl VerifiedRun {
    /// Returns list of all passed gates.
    pub fn passed_gates(&self) -> Vec<ProofGate> {
        self.passed_gates.iter().copied().collect()
    }

    /// Export results (only possible from a VerifiedRun).
    pub fn export_results(&self) -> String {
        format!(
            "Exporting results verified with {} gates: {:?}",
            self.passed_gates.len(),
            self.passed_gates
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_typestate_lifecycle() {
        let mut run = UnverifiedRun::new();
        assert!(!run.gate_passed(ProofGate::gate_test_suite_passes));

        run.mark_gate_passed(ProofGate::gate_test_suite_passes);
        assert!(run.gate_passed(ProofGate::gate_test_suite_passes));

        let verified_run = run.verify().expect("Should pass verification");
        assert_eq!(verified_run.passed_gates().len(), 1);
        println!("{}", verified_run.export_results());
    }

    #[test]
    fn test_verify_requires_gate() {
        let run = UnverifiedRun::new();
        assert!(run.verify().is_err());

        let mut run = UnverifiedRun::new();
        run.mark_gate_passed(ProofGate::gate_test_suite_passes);
        assert!(run.verify().is_ok());
    }
}
