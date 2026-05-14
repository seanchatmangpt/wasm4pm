//! Route-Driven TDD substrate for `wasm4pm`.
//!
//! Proves not only that a test result is correct, but that the result was
//! produced through a lawful POWL v2 route with exact conformance (1.0).
//! Below 1.0 is [`AndonPull`]. There is no partial pass.
//!
//! # Public Surface
//!
//! ```
//! use wasm4pm::testing::{
//!     PowlTestHarness,
//!     ExpectedConformance,
//!     ReplayReport,
//!     ConformanceVerdict,
//!     AndonPull,
//!     AndonPolicy,
//!     classify_conformance,
//! };
//! ```
//!
//! # Doctrine
//!
//! A test may not pass on output alone. `fitness == 1.0` is the only
//! admitted conformance. `0.999 < 1.0` is [`AndonPull::RouteConformanceGap`].
//! The harness is usable without macros — [`PowlTestHarness`] is explicit Rust.
//! Proc-macros are sugar added in Phase 9.

pub mod conformance;
pub mod env_bridge;
pub mod harness;
pub mod ocel_exporter;
pub mod proof_pack;
pub mod recorder;

pub use conformance::{
    classify_conformance, AndonPolicy, AndonPull, ConformanceVerdict, ExpectedConformance,
    ProofDimension, ReplayReport,
};
pub use harness::{PowlTestHarness, TestEvent};
pub use proof_pack::ProofPackWriter;
pub use recorder::record_activity;
