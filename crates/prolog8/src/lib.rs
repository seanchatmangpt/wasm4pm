//! # Prolog8 — Byte-Capped Proof Engine
//!
//! Implements the Prolog8 PRD/ARD: a Rust/WASM proof engine for bounded
//! rules, graph/bit execution, action admission, and replayable decisions.
//!
//! ## Doctrine
//!
//! - **No parser in the kernel.** The kernel accepts only IDs, byte arrays,
//!   and graph objects. Authoring text becomes IDs at boundary time.
//! - **The byte is the governor.** Arity ≤ 8, body atoms ≤ 8, variables ≤ 8,
//!   binding patterns ≤ 256.
//! - **Need9 means split.** Constructs that exceed eight elements must be
//!   decomposed into multiple predicates or rules.
//! - **Proof is the product.** Every decision emits a positive or negative
//!   proof and a receipt sufficient for deterministic replay.
//!
//! ## Components
//!
//! - [`types`] — core types: `Atom8`, `Rule8`, `FactRow8`, `FactBlock8`,
//!   `QueryAtom8`, `ProofNode`, `Receipt`, identifier newtypes.
//! - [`catalog`] — predicate / term registries.
//! - [`admission`] — `Admit(x)` law: caps, feature mask, indexability checks.
//! - [`kernel`] — query execution: binding-mask dispatch, scans, joins,
//!   proof emission, receipt assembly.
//! - [`replay`] — receipt verifier.
//! - [`hash`] — BLAKE3 root computations with domain-separation tags.
//!
//! Build with `--features wasm` to expose the byte-buffer ABI defined by
//! `wasm.rs`.

#![forbid(unsafe_code)]
#![deny(missing_docs)]

pub mod admission;
pub mod catalog;
pub mod hash;
pub mod kernel;
pub mod replay;
pub mod types;

#[cfg(feature = "wasm")]
pub mod wasm;

pub use admission::{admit_atom, admit_rule, RejectionCode};
pub use catalog::{Catalog, PredicateMeta, PredicateProofPolicy};
pub use hash::{combine_roots, hash_bytes, link_hash, Hash, DOMAIN_PROLOG8_RECEIPT};
pub use kernel::{Decision, Kernel, QueryResult};
pub use replay::{replay, ReplayStatus};
pub use types::{
    Atom8, CatalogId, DecisionKind, EpochId, FactBlock8, FactBlockMeta, FactRow8, FeatureBit,
    PredicateId, ProofKind, ProofMode, ProofNode, ProofNodeId, QueryAtom8, Receipt, Rule8, RuleId,
    SourceId, SubstitutionId, TermId, ARITY_CAP, BINDING_PATTERNS, BODY_CAP, VAR_CAP,
};

/// Engine version reported in receipts.
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Engine identifier reported in receipts.
pub const ENGINE_NAME: &str = "prolog8";
