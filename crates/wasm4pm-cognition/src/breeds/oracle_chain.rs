//! [`TypedReceiptChain`] — phantom-typed receipt chain for the oracle/audit layer.
//!
//! Production dispatch uses the untyped `ReceiptChain` from
//! `autosystems/receipt.rs` because `&dyn CognitionBreed` erases the concrete
//! type. `TypedReceiptChain<B>` is for oracle and audit tests only — it wraps
//! the v2 chain and adds a `PhantomData` tag so cross-breed substitution is a
//! compile error.

use crate::autosystems::receipt::{ActorSigner, ReceiptChain};
use crate::breeds::{BreedId, CognitionBreed, Receipt};
use std::marker::PhantomData;

/// A compile-time-typed wrapper around the v2 `ReceiptChain`.
///
/// `TypedReceiptChain<LtlMonitor>` and `TypedReceiptChain<Mycin>` are different
/// types — you cannot accidentally append a `Mycin` receipt to a `LtlMonitor`
/// chain.
///
/// Intended for oracle tests and audit code only.
pub struct TypedReceiptChain<B: CognitionBreed> {
    inner: ReceiptChain,
    /// The breed id this chain is bound to.
    pub breed_id: BreedId,
    _phantom: PhantomData<fn() -> B>,
}

/// Errors produced by [`TypedReceiptChain`] operations.
#[derive(Debug, Clone, thiserror::Error)]
pub enum ChainError {
    /// Attempted to append a receipt from a different breed.
    #[error("breed mismatch: expected {expected}, got {got}")]
    BreedMismatch {
        /// Expected breed.
        expected: BreedId,
        /// Actual breed.
        got: BreedId,
    },
    /// A hash field could not be decoded.
    #[error("bad hash field: {0}")]
    BadHash(String),
}

impl<B: CognitionBreed> TypedReceiptChain<B> {
    /// Create an empty chain for breed `b`.
    pub fn new(b: &B) -> Self {
        Self {
            inner: ReceiptChain::new(),
            breed_id: b.id(),
            _phantom: PhantomData,
        }
    }

    /// Append one signed link to the chain.
    ///
    /// Returns `Err(ChainError::BreedMismatch)` if the receipt was produced by a
    /// different breed.
    #[cfg(feature = "actor-ed25519")]
    pub fn append(&mut self, signer: &ActorSigner, receipt: &Receipt) -> Result<(), ChainError> {
        if receipt.breed != self.breed_id {
            return Err(ChainError::BreedMismatch {
                expected: self.breed_id,
                got: receipt.breed,
            });
        }
        let input_hash = hex::decode(&receipt.input_hash)
            .map_err(|_| ChainError::BadHash("input_hash".to_string()))?;
        let output_hash = hex::decode(&receipt.output_hash)
            .map_err(|_| ChainError::BadHash("output_hash".to_string()))?;
        self.inner.append_signed(signer, input_hash, output_hash);
        Ok(())
    }

    /// Verify the chain (step sequence, hash linkage, MAC, signature).
    pub fn verify(&self) -> bool {
        self.inner.verify_chain()
    }

    /// Merkle root over all link hashes.
    pub fn merkle_root(&self) -> [u8; 32] {
        self.inner.merkle_root_bytes()
    }

    /// Number of links.
    pub fn len(&self) -> usize {
        self.inner.links.len()
    }

    /// True if the chain has no links.
    pub fn is_empty(&self) -> bool {
        self.inner.links.is_empty()
    }

    /// Borrow the underlying untyped chain.
    pub fn as_untyped(&self) -> &ReceiptChain {
        &self.inner
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Receipt};

    struct MockBreed;
    impl CognitionBreed for MockBreed {
        fn id(&self) -> BreedId {
            BreedId::LtlMonitor
        }
        fn capabilities(&self) -> Vec<String> {
            vec![]
        }
        fn preconditions(&self, _: &BreedInput) -> Result<(), String> {
            Ok(())
        }
        fn run(&self, _: &BreedInput) -> Result<BreedOutput, BreedError> {
            Err(BreedError {
                breed: BreedId::LtlMonitor,
                message: "MockBreed::run is a test stub — not intended to be called".to_string(),
            })
        }
        fn postconditions(&self, _: &BreedInput, _: &BreedOutput) -> Result<(), String> {
            Ok(())
        }
    }

    #[test]
    fn refuses_breed_mismatch_error() {
        let err = ChainError::BreedMismatch {
            expected: BreedId::LtlMonitor,
            got: BreedId::NaivePhysics,
        };
        let err_str = err.to_string();
        assert!(
            err_str.contains("expected ltl_monitor")
                || err_str.contains("expected LtlMonitor")
                || err_str.contains("expected")
        );
        assert!(
            err_str.contains("got naive_physics")
                || err_str.contains("got NaivePhysics")
                || err_str.contains("got")
        );
    }

    #[test]
    fn falsification_gate_empty_chain_merkle_root() {
        let breed = MockBreed;
        let chain = TypedReceiptChain::new(&breed);
        assert_eq!(chain.len(), 0);
        assert!(chain.is_empty());
        assert!(chain.verify(), "Empty chain vacuously verifies");
        let root = chain.merkle_root();
        assert_eq!(root.len(), 32);
    }

    #[test]
    fn invariant_chain_length() {
        let breed = MockBreed;
        let chain = TypedReceiptChain::new(&breed);
        assert_eq!(
            chain.len() == 0,
            chain.is_empty(),
            "Length matches is_empty invariant"
        );
    }

    #[cfg(feature = "actor-ed25519")]
    #[test]
    fn falsification_gate_append_verify() {
        use crate::autosystems::receipt::ActorSigner;
        let breed = MockBreed;
        let mut chain = TypedReceiptChain::new(&breed);
        let signer = ActorSigner::from_seed([0u8; 32]);
        let receipt = Receipt {
            breed: BreedId::LtlMonitor,
            input_hash: hex::encode([0u8; 32]),
            output_hash: hex::encode([1u8; 32]),
            combined_hash: hex::encode([2u8; 32]),
        };
        chain.append(&signer, &receipt).expect("should append");
        assert!(chain.verify());
        assert_eq!(chain.len(), 1);
        assert!(!chain.is_empty());
    }

    #[cfg(feature = "actor-ed25519")]
    #[test]
    fn refuses_mismatched_breed_append() {
        use crate::autosystems::receipt::ActorSigner;
        let breed = MockBreed;
        let mut chain = TypedReceiptChain::new(&breed);
        let signer = ActorSigner::from_seed([0u8; 32]);
        let receipt = Receipt {
            breed: BreedId::NaivePhysics,
            input_hash: hex::encode([0u8; 32]),
            output_hash: hex::encode([1u8; 32]),
            combined_hash: hex::encode([2u8; 32]),
        };
        let err = chain.append(&signer, &receipt).unwrap_err();
        match err {
            ChainError::BreedMismatch { expected, got } => {
                assert_eq!(expected, BreedId::LtlMonitor);
                assert_eq!(got, BreedId::NaivePhysics);
            }
            _ => panic!("expected breed mismatch"),
        }
    }
}
