//! ML sub-module — contextual bandits and learning agents.

pub mod linucb;
pub mod utils;
pub mod regression;
pub mod forecasting;
pub mod classification;
pub mod pca;
pub mod automl;

pub use linucb::LinUCBAgent;
