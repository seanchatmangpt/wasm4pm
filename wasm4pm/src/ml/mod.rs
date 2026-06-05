//! ML sub-module — contextual bandits and learning agents.

pub mod automl;
pub mod classification;
pub mod clustering;
pub mod forecasting;
pub mod linucb;
pub mod pca;
pub mod regression;
pub mod utils;

pub use linucb::LinUCBAgent;
