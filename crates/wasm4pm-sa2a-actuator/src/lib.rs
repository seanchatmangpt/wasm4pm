//! Independent SA2A actuator.
//!
//! Authority is external and signer quorum must span independent trust domains.
//! Resource allocation is powerless input admitted before the durable actuator
//! claim. Allocation identity is bound into the same durable record as the
//! effect claim.

pub mod actuator;
pub mod c3_court_manifest;
pub mod crypto;
pub mod effector;
pub mod error;
pub mod ledger;
pub mod resource;
pub mod resource_admission;
pub mod resource_ocel;
pub mod resource_receipt;
pub mod resource_recovery;
pub mod trust_domain;
pub mod verifier;
pub mod wire;

pub use actuator::{ActuationReceipt, Actuator, ActuatorContext};
pub use c3_court_manifest::{by_id as c3_court_by_id, CourtVector as C3CourtVector, Expected as C3Expected, VECTORS as C3_COURT_VECTORS};
pub use effector::{Effector, EffectorOutcome, Utf8FileWriteEffector};
pub use error::ActuatorRefusal;
pub use ledger::{EffectClaimRecord, EffectLedger, FileEffectLedger, LedgerState};
pub use resource::{ResourceBudget, ResourceEnvelope};
pub use resource_admission::ResourceAdmission;
pub use resource_ocel::ResourceOcelEvent;
pub use resource_receipt::ResourceReceipt;
pub use resource_recovery::{ResourceRecovery, ResourceRecoveryState};
pub use trust_domain::TrustDomainId;
pub use verifier::{KeyRecord, KeyRegistry, KeyState, SecurityVerifier, SignatureAlgorithm};
pub use wire::{ActuationCertificate, CertificateSignature, PreparedEffect};
