//! Independent SA2A actuator.
//!
//! Authority is external. Resource allocation is powerless input and is
//! admitted before the durable actuator claim. Allocation identity is bound
//! into the same durable record as the effect claim.

pub mod actuator;
pub mod crypto;
pub mod effector;
pub mod error;
pub mod ledger;
pub mod verifier;
pub mod wire;
pub mod resource;
pub mod resource_admission;
pub mod resource_receipt;
pub mod resource_ocel;
pub mod resource_recovery;

pub use actuator::{ActuationReceipt, Actuator, ActuatorContext};
pub use effector::{Effector, EffectorOutcome, Utf8FileWriteEffector};
pub use error::ActuatorRefusal;
pub use ledger::{EffectClaimRecord, EffectLedger, FileEffectLedger, LedgerState};
pub use verifier::{KeyRecord, KeyRegistry, KeyState, SecurityVerifier, SignatureAlgorithm};
pub use wire::{ActuationCertificate, CertificateSignature, PreparedEffect};
pub use resource::{ResourceEnvelope, ResourceBudget};
pub use resource_admission::ResourceAdmission;
pub use resource_receipt::ResourceReceipt;
pub use resource_ocel::ResourceOcelEvent;
pub use resource_recovery::{ResourceRecovery, ResourceRecoveryState};
