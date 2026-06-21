//! Replay verifier — ARD section 12.
//!
//! Given a receipt and the artifacts it references, replay verifies the
//! decision still produces the same proof root and output root.

use crate::kernel::{Kernel, QueryResult};
use crate::types::{QueryAtom8, Receipt};
use serde::{Deserialize, Serialize};

/// Outcome of a replay attempt.
#[must_use]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReplayStatus {
    /// All roots match.
    Verified,
    /// At least one root differs.
    Mismatch,
    /// A required artifact is missing.
    MissingArtifact,
    /// Engine version reported by the receipt is incompatible.
    VersionIncompatible,
    /// The receipt's own integrity hash does not validate.
    ReceiptInvalid,
}

/// Replay a query against a kernel and compare the produced receipt's
/// roots against `expected`. Returns the replay outcome.
#[must_use = "discarding the replay outcome silently bypasses verification"]
pub fn replay(kernel: &Kernel, query: &QueryAtom8, expected: &Receipt) -> ReplayStatus {
    // 1. Verify the receipt's own integrity (recompute its hash).
    if expected.compute_hash() != expected.receipt_hash {
        return ReplayStatus::ReceiptInvalid;
    }

    // 2. Engine version compatibility (string equality is the simplest gate).
    if expected.engine_version != crate::ENGINE_VERSION {
        return ReplayStatus::VersionIncompatible;
    }

    // 3. Replay the query.
    let actual_receipt = match kernel.query(query) {
        QueryResult::Answered(answers) if !answers.is_empty() => answers[0].receipt.clone(),
        QueryResult::Denied(d) => d.receipt,
        QueryResult::Answered(_) => return ReplayStatus::MissingArtifact,
        QueryResult::Invalid(_) => return ReplayStatus::MissingArtifact,
    };

    // 4. Compare each root.
    if actual_receipt.catalog_root != expected.catalog_root
        || actual_receipt.rule_root != expected.rule_root
        || actual_receipt.fact_root != expected.fact_root
        || actual_receipt.input_root != expected.input_root
        || actual_receipt.proof_root != expected.proof_root
        || actual_receipt.output_root != expected.output_root
        || actual_receipt.decision != expected.decision
    {
        return ReplayStatus::Mismatch;
    }

    ReplayStatus::Verified
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{Catalog, PredicateMeta, PredicateProofPolicy};
    use crate::kernel::Kernel;
    use crate::types::{
        Atom8, CatalogId, EpochId, FactBlock8, FactRow8, PredicateId, ProofMode, QueryAtom8,
        SourceId,
    };

    fn build_kernel_and_query() -> (Kernel, QueryAtom8) {
        let mut cat = Catalog::new(CatalogId(1));
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(1),
            label: "p".into(),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        let a = cat.intern_term("a");
        let b = cat.intern_term("b");
        let mut k = Kernel::new(cat);
        k.load_facts(FactBlock8::new(
            PredicateId(1),
            2,
            vec![FactRow8::new(PredicateId(1), 2, &[a, b], SourceId(0))],
        ))
        .unwrap();
        let mut atom = Atom8::new(PredicateId(1), 2, &[a, b]);
        atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom,
            output_mask: 0,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        (k, q)
    }

    #[test]
    fn valid_replay_succeeds() {
        let (k, q) = build_kernel_and_query();
        let r = match k.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => unreachable!(),
        };
        assert_eq!(replay(&k, &q, &r), ReplayStatus::Verified);
    }

    #[test]
    fn modified_proof_root_fails_replay() {
        let (k, q) = build_kernel_and_query();
        let mut r = match k.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => unreachable!(),
        };
        // Tamper with proof root, recompute receipt hash to keep integrity ok.
        r.proof_root[0] ^= 0xFF;
        r.receipt_hash = r.compute_hash();
        assert_eq!(replay(&k, &q, &r), ReplayStatus::Mismatch);
    }

    #[test]
    fn tampered_receipt_hash_is_detected() {
        let (k, q) = build_kernel_and_query();
        let mut r = match k.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => unreachable!(),
        };
        r.receipt_hash[0] ^= 0xFF;
        assert_eq!(replay(&k, &q, &r), ReplayStatus::ReceiptInvalid);
    }

    #[test]
    fn wrong_engine_version_fails_replay() {
        let (k, q) = build_kernel_and_query();
        let mut r = match k.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => unreachable!(),
        };
        r.engine_version = "0.0.0-not-this-engine".into();
        r.receipt_hash = r.compute_hash();
        assert_eq!(replay(&k, &q, &r), ReplayStatus::VersionIncompatible);
    }
}
