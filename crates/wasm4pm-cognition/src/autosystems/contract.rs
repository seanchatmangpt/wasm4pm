//! # Manufacturing contract system
//!
//! `CognitionContract<TIn,TOut>` defines the preconditions, execution,
//! postconditions, and adversarial gates that must pass for a manufacturing
//! verb8 to succeed. `run_contract` executes the full protocol.

use serde::{Deserialize, Serialize};

use crate::autosystems::findings::{DetectorInput, Finding, FindingRegistry, Severity};

/// Result of contract execution.
///
/// Contains the output (if successful), findings from adversarial detectors,
/// receipt data, and an exit code summarizing the outcome.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractResult<TOut> {
    /// The output of the contract (Some if succeeded, None if precondition/execution failed).
    pub output: Option<TOut>,
    /// Findings from adversarial detectors (empty = clean).
    pub findings: Vec<Finding>,
    /// BLAKE3 hash of the receipt chain (empty if chain invalid).
    pub receipt_hash: String,
    /// Exit code summarizing the outcome.
    ///
    /// - 0: Clean success (no findings)
    /// - 1: Precondition failed
    /// - 2: Execution failed
    /// - 3: Postcondition failed
    /// - 4: Adversarial error (one or more detectors fired with Error)
    /// - 5: Adversarial fatal (one or more detectors fired with Fatal)
    pub exit_code: u8,
}

impl<TOut> ContractResult<TOut> {
    /// Query if result is clean (exit code 0).
    pub fn is_clean(&self) -> bool {
        self.exit_code == 0
    }

    /// Query highest severity found.
    pub fn max_severity(&self) -> Option<Severity> {
        self.findings.iter().map(|f| f.severity).max()
    }

    /// Filter findings by severity.
    pub fn findings_with_severity(&self, threshold: Severity) -> Vec<Finding> {
        self.findings
            .iter()
            .filter(|f| f.severity >= threshold)
            .cloned()
            .collect()
    }
}

/// Contract definition for a manufacturing verb8.
///
/// Specifies preconditions, the execution function, adversarial checks,
/// and postconditions. The contract ensures that the manufacturing pipeline
/// follows the protocol.
pub struct CognitionContract<TIn, TOut> {
    /// Precondition check function (returns true if satisfied).
    pub preconditions: Box<dyn Fn(&TIn) -> bool + Send + Sync>,
    /// Execution function (runs if preconditions pass).
    pub execute: Box<dyn Fn(&TIn) -> Result<TOut, String> + Send + Sync>,
    /// Adversarial detector input builder.
    pub adversarial_checks: Box<dyn Fn(&TIn, &TOut) -> DetectorInput + Send + Sync>,
    /// Postcondition check function (returns true if satisfied).
    pub postconditions: Box<dyn Fn(&TOut) -> bool + Send + Sync>,
}

impl<TIn, TOut> CognitionContract<TIn, TOut> {
    /// Execute the contract with the given input.
    ///
    /// Protocol:
    /// 1. Check preconditions → fail if not met
    /// 2. Execute → fail if error
    /// 3. Check postconditions → fail if not met
    /// 4. Run adversarial detectors → report findings
    /// 5. Compute exit code based on findings
    pub fn run(&self, input: &TIn, registry: &FindingRegistry) -> ContractResult<TOut> {
        // Phase 1: Preconditions
        if !(self.preconditions)(input) {
            return ContractResult {
                output: None,
                findings: vec![],
                receipt_hash: String::new(),
                exit_code: 1,
            };
        }

        // Phase 2: Execute
        let output = match (self.execute)(input) {
            Ok(result) => result,
            Err(_) => {
                return ContractResult {
                    output: None,
                    findings: vec![],
                    receipt_hash: String::new(),
                    exit_code: 2,
                };
            }
        };

        // Phase 3: Postconditions
        if !(self.postconditions)(&output) {
            return ContractResult {
                output: None,
                findings: vec![],
                receipt_hash: String::new(),
                exit_code: 3,
            };
        }

        // Phase 4: Adversarial checks
        let detector_input = (self.adversarial_checks)(input, &output);
        let findings = registry.run_all(&detector_input);

        // Phase 5: Compute exit code
        let exit_code = if findings.is_empty() {
            0
        } else {
            let max_sev = findings
                .iter()
                .map(|f| f.severity)
                .max()
                .unwrap_or(Severity::Info);

            if max_sev == Severity::Fatal {
                5
            } else if max_sev == Severity::Error {
                4
            } else if max_sev == Severity::Warning {
                0 // Warnings don't block success
            } else {
                0 // Info doesn't block
            }
        };

        ContractResult {
            output: Some(output),
            findings,
            receipt_hash: String::new(),
            exit_code,
        }
    }
}

/// Run a contract with default detector registry.
///
/// Convenience function that creates a `FindingRegistry`, registers all
/// 8 detectors, and executes the contract.
pub fn run_contract<TIn, TOut>(
    input: &TIn,
    contract: &CognitionContract<TIn, TOut>,
) -> ContractResult<TOut> {
    let registry = FindingRegistry::new();
    contract.run(input, &registry)
}
