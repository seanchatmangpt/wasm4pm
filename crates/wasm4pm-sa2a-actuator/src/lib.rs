//! Independent SA2A actuator.
//!
//! This crate is intentionally separate from WASM4PM planning/runtime code.
//! It owns no authority signing key. It accepts only an exact PreparedEffect
//! plus an independently issued ActuationCertificate, re-verifies the
//! certificate locally, claims the effect in a durable local ledger, executes
//! one typed effector, and records completion or unknown outcome.

pub mod actuator;
pub mod crypto;
pub mod effector;
pub mod error;
pub mod ledger;
pub mod verifier;
pub mod wire;

pub use actuator::{ActuationReceipt, Actuator, ActuatorContext};
pub use effector::{Effector, EffectorOutcome, Utf8FileWriteEffector};
pub use error::ActuatorRefusal;
pub use ledger::{EffectLedger, FileEffectLedger, LedgerState};
pub use verifier::{KeyRecord, KeyRegistry, KeyState, SecurityVerifier, SignatureAlgorithm};
pub use wire::{ActuationCertificate, CertificateSignature, PreparedEffect};
