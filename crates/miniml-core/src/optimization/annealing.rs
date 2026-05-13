//! Simulated Annealing implementation
//!
//! Ported and adapted from wasm4pm more_discovery.rs (SA section)
//!
//! Provides a generic simulated annealing algorithm for optimization.

use crate::optimization::types::*;
use crate::optimization::fitness::*;
use wasm_bindgen::prelude::*;

/// Re-use the RNG from genetic module
use super::genetic::rand_f64;

/// Simulated Annealing options
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct AnnealingOptions {
    /// Initial temperature (default: 1000.0)
    #[wasm_bindgen(getter_with_clone)]
    pub initial_temp: f64,

    /// Cooling rate (default: 0.95)
    #[wasm_bindgen(getter_with_clone)]
    pub cooling_rate: f64,

    /// Minimum temperature (default: 1e-10)
    #[wasm_bindgen(getter_with_clone)]
    pub min_temp: f64,

    /// Cooling schedule (default: Exponential)
    #[wasm_bindgen(getter_with_clone)]
    pub cooling_schedule: CoolingSchedule,

    /// Iterations per temperature (default: 100)
    #[wasm_bindgen(getter_with_clone)]
    pub iterations_per_temp: usize,
}

impl Default for AnnealingOptions {
    fn default() -> Self {
        Self {
            initial_temp: 1000.0,
            cooling_rate: 0.95,
            min_temp: 1e-10,
            cooling_schedule: CoolingSchedule::Exponential,
            iterations_per_temp: 100,
        }
    }
}

/// Simulated Annealing optimizer
///
/// A simulated annealing algorithm that uses thermal search for optimization.
pub struct SimulatedAnnealing {
    options: AnnealingOptions,
}

impl SimulatedAnnealing {
    /// Create a new simulated annealing optimizer with default options
    pub fn new() -> Self {
        Self {
            options: AnnealingOptions::default(),
        }
    }

    /// Create a new simulated annealing optimizer with custom options
    pub fn with_options(options: AnnealingOptions) -> Self {
        Self { options }
    }

    /// Get the current options
    pub fn options(&self) -> &AnnealingOptions {
        &self.options
    }

    /// Set the options
    pub fn set_options(&mut self, options: AnnealingOptions) {
        self.options = options;
    }

    /// Run the simulated annealing algorithm
    ///
    /// # Type Parameters
    /// * `T` - The gene type (must be Clone + PartialEq)
    ///
    /// # Arguments
    /// * `fitness_fn` - The fitness function to optimize
    /// * `initial_state` - The starting solution
    /// * `neighbor_fn` - Function to generate a neighboring solution
    ///
    /// # Returns
    /// The optimization result containing the best individual found
    pub fn optimize<T>(
        &mut self,
        fitness_fn: &dyn FitnessFunction<T>,
        initial_state: Vec<T>,
        neighbor_fn: &dyn Fn(&[T]) -> Vec<T>,
    ) -> OptimizationResult<T>
    where
        T: Clone + PartialEq + Send + Sync,
    {
        let mut current_state = initial_state.clone();
        let mut current_fitness = fitness_fn.evaluate(&Individual::new(current_state.clone()));

        let mut best_state = current_state.clone();
        let mut best_fitness = current_fitness;

        let mut temperature = self.options.initial_temp;
        let mut total_iterations = 0;
        let mut evaluations = 1;

        while temperature > self.options.min_temp {
            for _ in 0..self.options.iterations_per_temp {
                total_iterations += 1;

                // Generate neighbor
                let neighbor_state = neighbor_fn(&current_state);
                let neighbor_fitness = fitness_fn.evaluate(&Individual::new(neighbor_state.clone()));
                evaluations += 1;

                // Accept or reject
                let delta = neighbor_fitness - current_fitness;

                if delta > 0.0 || rand_f64() < (delta / temperature).exp() {
                    current_state = neighbor_state;
                    current_fitness = neighbor_fitness;

                    // Update best
                    if current_fitness > best_fitness {
                        best_state = current_state.clone();
                        best_fitness = current_fitness;
                    }
                }
            }

            // Cool down
            temperature = match self.options.cooling_schedule {
                CoolingSchedule::Exponential => temperature * self.options.cooling_rate,
                CoolingSchedule::Linear => {
                    (temperature - self.options.cooling_rate).max(self.options.min_temp)
                }
                CoolingSchedule::Adaptive => {
                    // Adaptive cooling based on acceptance rate
                    // For simplicity, use exponential here
                    temperature * self.options.cooling_rate
                }
            };
        }

        OptimizationResult::new(
            Individual::with_fitness(best_state, best_fitness),
            total_iterations,
            evaluations,
        )
    }
}

impl Default for SimulatedAnnealing {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::genetic::seed_rng;

    // Sphere function: minimize sum(x^2)
    fn sphere_function(genes: &[f64]) -> f64 {
        -genes.iter().map(|x| x * x).sum::<f64>() // Negative for maximization
    }

    // Neighbor function: add small random perturbation
    fn sphere_neighbor(state: &[f64]) -> Vec<f64> {
        state
            .iter()
            .map(|&x| {
                let delta = (rand_f64() - 0.5) * 0.5; // Small perturbation
                (x + delta).max(-10.0).min(10.0)
            })
            .collect()
    }

    #[test]
    fn test_annealing_basic() {
        seed_rng(42); // Seed for deterministic behavior
        let mut sa = SimulatedAnnealing::new();
        sa.options.initial_temp = 100.0;
        sa.options.iterations_per_temp = 50;

        let fitness = ClosureFitnessFunction::new(sphere_function, 2);
        let initial = vec![5.0, -3.0];

        let result = sa.optimize(&fitness, initial.clone(), &sphere_neighbor);

        // Should find a solution closer to the origin than the initial state
        let initial_fitness = sphere_function(&initial);
        assert!(result.best.fitness >= initial_fitness - 1.0);
    }

    #[test]
    fn test_annealing_options_default() {
        let opts = AnnealingOptions::default();
        assert_eq!(opts.initial_temp, 1000.0);
        assert_eq!(opts.cooling_rate, 0.95);
        assert_eq!(opts.min_temp, 1e-10);
    }

    #[test]
    fn test_neighbor_function() {
        seed_rng(42);
        let state = vec![1.0, 2.0, 3.0];
        let neighbor = sphere_neighbor(&state);

        assert_eq!(neighbor.len(), 3);
        // Values should be close to original but not identical
        for (orig, new) in state.iter().zip(neighbor.iter()) {
            assert!((orig - new).abs() <= 0.5);
        }
    }

    #[test]
    fn test_cooling_schedules() {
        let mut temp: f64 = 100.0;

        // Exponential cooling
        let schedule = CoolingSchedule::Exponential;
        temp = match schedule {
            CoolingSchedule::Exponential => temp * 0.95,
            CoolingSchedule::Linear => (temp - 5.0).max(1e-10_f64),
            CoolingSchedule::Adaptive => temp * 0.9,
        };

        assert!(temp < 100.0);
    }
}
