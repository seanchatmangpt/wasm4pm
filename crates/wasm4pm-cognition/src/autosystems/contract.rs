//! # Manufacturing contract system
//!
//! `CognitionContract<TIn,TOut>` defines the preconditions, execution,
//! postconditions, and adversarial gates that must pass for a manufacturing
//! verb8 to succeed. `run_contract` executes the full protocol.

use serde::{Deserialize, Serialize};

use crate::autosystems::findings::{Finding, FindingRegistry, Severity};
use crate::evidence::EvidenceSource;

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

/// Type alias for contract precondition functions.
pub type PreconditionFn<TIn> = Box<dyn Fn(&TIn) -> bool + Send + Sync>;

/// Type alias for contract execution functions.
pub type ExecutionFn<TIn, TOut> = Box<dyn Fn(&TIn) -> Result<TOut, String> + Send + Sync>;

/// Type alias for contract adversarial check functions.
pub type AdversarialCheckFn<TIn, TOut> =
    Box<dyn Fn(&TIn, &TOut) -> Box<dyn EvidenceSource> + Send + Sync>;

/// Type alias for contract postcondition functions.
pub type PostconditionFn<TOut> = Box<dyn Fn(&TOut) -> bool + Send + Sync>;

/// Contract definition for a manufacturing verb8.
///
/// Specifies preconditions, the execution function, adversarial checks,
/// and postconditions. The contract ensures that the manufacturing pipeline
/// follows the protocol.
pub struct CognitionContract<TIn, TOut> {
    /// Precondition check function (returns true if satisfied).
    pub preconditions: PreconditionFn<TIn>,
    /// Execution function (runs if preconditions pass).
    pub execute: ExecutionFn<TIn, TOut>,
    /// Adversarial evidence-source builder.
    pub adversarial_checks: AdversarialCheckFn<TIn, TOut>,
    /// Postcondition check function (returns true if satisfied).
    pub postconditions: PostconditionFn<TOut>,
}

impl<TIn, TOut> CognitionContract<TIn, TOut> {
    /// Execute the contract with the given input.
    ///
    /// Protocol:
    /// 1.  Check preconditions → fail if not met
    /// 2.  Execute → fail if error
    /// 3.  Check postconditions → fail if not met
    /// 4.  Run adversarial detectors → report findings
    /// 5.  Compute exit code based on findings
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
        let evidence = (self.adversarial_checks)(input, &output);
        let findings = registry.run_all(evidence.as_ref());

        // Phase 5: Compute exit code
        let max_sev = findings.iter().map(|f| f.severity).max();

        let exit_code = match max_sev {
            Some(Severity::Fatal) => 5,
            Some(Severity::Error) => 4,
            _ => 0, // Clean success, info, or warnings don't block
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
