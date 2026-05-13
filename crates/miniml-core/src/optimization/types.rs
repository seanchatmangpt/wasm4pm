//! Core types for optimization algorithms
//!
//! Provides generic types for representing individuals, populations,
//! and optimization results independent of any specific domain.

use std::fmt;
use wasm_bindgen::prelude::*;

/// Represents a potential solution in the search space
///
/// # Type Parameters
/// * `T` - The gene type (e.g., f64 for continuous, bool for binary)
#[derive(Clone, Debug)]
pub struct Individual<T> {
    /// The chromosome/genes representing the solution
    pub genes: Vec<T>,
    /// The fitness value (higher is better, unless minimizing)
    pub fitness: f64,
}

impl<T> Individual<T> {
    /// Create a new individual with the given genes
    ///
    /// # Arguments
    /// * `genes` - The chromosome/genes representing the solution
    ///
    /// # Returns
    /// A new individual with fitness set to f64::NEG_INFINITY
    #[inline]
    pub fn new(genes: Vec<T>) -> Self {
        Self {
            genes,
            fitness: f64::NEG_INFINITY,
        }
    }

    /// Create a new individual with known fitness
    ///
    /// # Arguments
    /// * `genes` - The chromosome/genes representing the solution
    /// * `fitness` - The pre-computed fitness value
    #[inline]
    pub fn with_fitness(genes: Vec<T>, fitness: f64) -> Self {
        Self { genes, fitness }
    }
}

/// Result of an optimization run
///
/// Contains the best solution found and metadata about the optimization
#[derive(Clone, Debug)]
pub struct OptimizationResult<T> {
    /// The best individual found
    pub best: Individual<T>,
    /// Number of iterations/generations run
    pub iterations: usize,
    /// Number of fitness evaluations performed
    pub evaluations: usize,
    /// Whether the algorithm converged to a solution
    pub converged: bool,
}

impl<T> OptimizationResult<T> {
    /// Create a new optimization result
    #[inline]
    pub fn new(best: Individual<T>, iterations: usize, evaluations: usize) -> Self {
        Self {
            best,
            iterations,
            evaluations,
            converged: false,
        }
    }

    /// Mark the result as converged
    #[inline]
    pub fn with_converged(mut self) -> Self {
        self.converged = true;
        self
    }
}

/// Error types for optimization operations
#[derive(Clone, Debug)]
pub enum OptimizationError {
    /// Empty population provided
    EmptyPopulation,
    /// Invalid gene bounds
    InvalidBounds,
    /// Maximum iterations reached without convergence
    MaxIterationsReached,
    /// Other error with message
    Other(String),
}

impl fmt::Display for OptimizationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyPopulation => write!(f, "Population cannot be empty"),
            Self::InvalidBounds => write!(f, "Invalid gene bounds specified"),
            Self::MaxIterationsReached => write!(f, "Maximum iterations reached without convergence"),
            Self::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for OptimizationError {}

/// Convert OptimizationError to JsValue for WASM
impl From<OptimizationError> for JsValue {
    fn from(err: OptimizationError) -> Self {
        JsValue::from_str(&err.to_string())
    }
}

/// Selection method for genetic algorithms
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[wasm_bindgen]
pub enum SelectionMethod {
    /// Tournament selection: select k individuals at random, choose best
    Tournament,
    /// Roulette wheel selection: probability proportional to fitness
    Roulette,
    /// Rank-based selection: probability based on fitness rank
    Rank,
}

/// Crossover operator for genetic algorithms
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[wasm_bindgen]
pub enum CrossoverMethod {
    /// Single-point crossover
    SinglePoint,
    /// Two-point crossover
    TwoPoint,
    /// Uniform crossover (each gene from random parent)
    Uniform,
}

/// Cooling schedule for simulated annealing
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[wasm_bindgen]
pub enum CoolingSchedule {
    /// Exponential cooling: T = T * cooling_rate
    Exponential,
    /// Linear cooling: T = T - cooling_rate
    Linear,
    /// Adaptive cooling based on acceptance rate
    Adaptive,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_individual_creation() {
        let genes = vec![1.0, 2.0, 3.0];
        let individual = Individual::new(genes.clone());

        assert_eq!(individual.genes, genes);
        assert_eq!(individual.fitness, f64::NEG_INFINITY);
    }

    #[test]
    fn test_individual_with_fitness() {
        let genes = vec![1.0, 2.0, 3.0];
        let individual = Individual::with_fitness(genes.clone(), 0.5);

        assert_eq!(individual.genes, genes);
        assert_eq!(individual.fitness, 0.5);
    }

    #[test]
    fn test_optimization_result() {
        let best = Individual::with_fitness(vec![1.0, 2.0], 10.0);
        let result = OptimizationResult::new(best, 100, 1000);

        assert_eq!(result.iterations, 100);
        assert_eq!(result.evaluations, 1000);
        assert!(!result.converged);

        let result = result.with_converged();
        assert!(result.converged);
    }
}
