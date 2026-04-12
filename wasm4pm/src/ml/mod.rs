//! ML sub-module — contextual bandits and learning agents.
//!
//! Currently provides:
//! - `linucb` — LinUCB contextual bandit (CPU baseline / ground truth)

pub mod linucb;
pub use linucb::LinUCBAgent;
