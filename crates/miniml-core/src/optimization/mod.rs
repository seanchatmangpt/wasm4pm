//! # Optimization and Prediction Algorithms
//!
//! This module provides metaheuristic optimization and prediction algorithms ported from
//! wasm4pm (WebAssembly Process Mining) and adapted for general ML use cases.
//!
//! ## Optimization Algorithms
//!
//! - **Genetic Algorithm (GA)**: Evolutionary optimization using selection, crossover, and mutation
//! - **Particle Swarm Optimization (PSO)**: Swarm intelligence for continuous optimization
//! - **Simulated Annealing (SA)**: Thermal search for escaping local optima
//!
//! ## Prediction and Analysis Algorithms
//!
//! - **Feature Importance**: Permutation-based feature importance analysis
//! - **Anomaly Detection**: Sequence and statistical outlier detection
//! - **Markov Prediction**: N-gram based sequence prediction
//! - **Beam Search**: Future path prediction with pruning
//! - **EWMA**: Exponential weighted moving average for trend detection
//! - **Boundary Coverage**: Probability of normal completion from prefix
//! - **Drift Detection**: Concept drift and statistical change detection
//! - **UCB1 Bandit**: Multi-armed bandit for sequential decision-making
//! - **Queue Delay**: M/M/1 queueing model for delay estimation
//!
//! ## Use Cases
//!
//! - Hyperparameter tuning for ML models
//! - Feature selection for classification/regression
//! - Sequence prediction and anomaly detection
//! - Time series trend analysis and drift detection
//! - Reinforcement learning and decision optimization
//! - General-purpose optimization (continuous and discrete)
//!
//! ## Algorithm Selection Guide
//!
//! | Use Case | Best Algorithm | Reason |
//! |----------|---------------|---------|
//! | Discrete/combinatorial | Genetic Algorithm | Handles binary/integer variables well |
//! | Continuous optimization | PSO | Fast convergence on continuous problems |
//! | Multi-modal (many local optima) | Simulated Annealing | Good at escaping local optima |
//! | Feature selection | Feature Importance | Permutation-based importance |
//! | Sequence prediction | Markov + Beam Search | Probabilistic path prediction |
//! | Trend detection | EWMA | Exponential smoothing |
//! | Concept drift | Jaccard Window / Statistical | Detect distribution changes |
//! | Sequential decisions | UCB1 Bandit | Balance exploration/exploitation |
//!
//! ## Performance Notes
//!
//! - All algorithms use deterministic XORShift64 PRNG (seedable via `genetic::seed_rng()`)
//! - Zero external dependencies (only `wasm-bindgen`)
//! - Optimized for WASM compilation (size target: <10KB additional)
//!
//! ## Ported From
//!
//! - `wasm4pm/wasm4pm/src/genetic_discovery.rs` (GA, PSO)
//! - `wasm4pm/wasm4pm/src/more_discovery.rs` (Simulated Annealing)
//! - `wasm4pm/wasm4pm/src/utilities.rs` (Fitness evaluation)
//! - `wasm4pm/wasm4pm/src/feature_importance.rs` (Feature importance)
//! - `wasm4pm/wasm4pm/src/anomaly.rs` (Anomaly detection)
//! - `wasm4pm/wasm4pm/src/prediction_additions.rs` (Markov, beam search, EWMA)
//! - `wasm4pm/wasm4pm/src/prediction_drift.rs` (Drift detection)
//! - `wasm4pm/wasm4pm/src/prediction_resource.rs` (UCB1 bandit, queue delay)

mod types;
mod fitness;

// Re-export public types
pub use types::*;
pub use fitness::*;

pub mod genetic;
pub mod pso;
pub mod annealing;
pub mod feature_importance;
pub mod anomaly;
pub mod prediction;
pub mod bandit;
pub mod drift;

// Re-export module items
pub use bandit::*;
pub use drift::*;
pub use anomaly::*;
pub use genetic::rand_f64;
pub use genetic::seed_rng;
