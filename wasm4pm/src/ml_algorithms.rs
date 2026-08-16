//! ML algorithms for process mining (Re-exports from Nanosecond Algorithm Families)
//!
//! Gated behind `feature = "ml"` — the underlying `crate::ml` module is itself
//! gated the same way (see lib.rs `pub mod ml`). Without the gate this file
//! generates unconditional `pub use crate::ml::*` re-exports that fail to
//! compile under feature subsets like `feature-powl,feature-conformance-basic,
//! hand_rolled_stats` (used by downstream `mcpp`).

#![cfg(feature = "ml")]

#[cfg(feature = "ml")]
pub use crate::ml::automl::{discover_automl_classify, discover_automl_forecast};
#[cfg(feature = "ml")]
pub use crate::ml::classification::discover_ml_classify;
#[cfg(feature = "ml")]
pub use crate::ml::forecasting::discover_ml_forecast;
#[cfg(feature = "ml")]
pub use crate::ml::pca::discover_ml_pca;
#[cfg(feature = "ml")]
pub use crate::ml::regression::{discover_ml_regress, discover_ml_regress_automl};
