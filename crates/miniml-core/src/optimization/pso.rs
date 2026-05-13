//! Particle Swarm Optimization implementation
//!
//! Ported and adapted from wasm4pm genetic_discovery.rs (PSO section)
//!
//! Provides a generic PSO algorithm for continuous optimization.

use crate::optimization::types::*;
use crate::optimization::fitness::*;
use wasm_bindgen::prelude::*;

/// Re-use the RNG from genetic module
use super::genetic::rand_f64;

/// PSO options
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct PSOOptions {
    /// Swarm size (default: 30)
    #[wasm_bindgen(getter_with_clone)]
    pub swarm_size: usize,

    /// Number of iterations (default: 100)
    #[wasm_bindgen(getter_with_clone)]
    pub iterations: usize,

    /// Inertia weight (default: 0.7)
    #[wasm_bindgen(getter_with_clone)]
    pub w: f64,

    /// Cognitive coefficient (default: 1.5)
    #[wasm_bindgen(getter_with_clone)]
    pub c1: f64,

    /// Social coefficient (default: 1.5)
    #[wasm_bindgen(getter_with_clone)]
    pub c2: f64,

    /// Optional bounds for particle positions (min, max)
    #[wasm_bindgen(skip)]
    pub bounds: Option<(f64, f64)>,
}

impl Default for PSOOptions {
    fn default() -> Self {
        Self {
            swarm_size: 30,
            iterations: 100,
            w: 0.7,
            c1: 1.5,
            c2: 1.5,
            bounds: None,
        }
    }
}

/// Particle in the swarm
#[derive(Clone, Debug)]
struct Particle {
    position: Vec<f64>,
    velocity: Vec<f64>,
    best_position: Vec<f64>,
    best_fitness: f64,
}

impl Particle {
    fn new(dimension: usize, bounds: Option<(f64, f64)>) -> Self {
        let (min, max) = bounds.unwrap_or((-5.0, 5.0));
        let position: Vec<f64> = (0..dimension).map(|_| rand_f64() * (max - min) + min).collect();
        let velocity: Vec<f64> = (0..dimension).map(|_| rand_f64() * 2.0 - 1.0).collect();

        Self {
            position: position.clone(),
            velocity,
            best_position: position,
            best_fitness: f64::NEG_INFINITY,
        }
    }

    fn update_velocity(&mut self, global_best: &[f64], w: f64, c1: f64, c2: f64) {
        for i in 0..self.position.len() {
            let r1 = rand_f64();
            let r2 = rand_f64();

            self.velocity[i] = w * self.velocity[i]
                + c1 * r1 * (self.best_position[i] - self.position[i])
                + c2 * r2 * (global_best[i] - self.position[i]);

            // Clamp velocity to prevent explosion
            self.velocity[i] = self.velocity[i].max(-2.0).min(2.0);
        }
    }

    fn update_position(&mut self, bounds: Option<(f64, f64)>) {
        for i in 0..self.position.len() {
            self.position[i] += self.velocity[i];

            // Apply bounds if specified
            if let Some((min, max)) = bounds {
                self.position[i] = self.position[i].max(min).min(max);
            }
        }
    }
}

/// Particle Swarm Optimization optimizer
///
/// A PSO algorithm that optimizes using swarm intelligence.
pub struct PSO {
    options: PSOOptions,
}

impl PSO {
    /// Create a new PSO optimizer with default options
    pub fn new() -> Self {
        Self {
            options: PSOOptions::default(),
        }
    }

    /// Create a new PSO optimizer with custom options
    pub fn with_options(options: PSOOptions) -> Self {
        Self { options }
    }

    /// Get the current options
    pub fn options(&self) -> &PSOOptions {
        &self.options
    }

    /// Set the options
    pub fn set_options(&mut self, options: PSOOptions) {
        self.options = options;
    }

    /// Run the PSO algorithm
    ///
    /// # Arguments
    /// * `fitness_fn` - The fitness function to optimize
    /// * `dimension` - The number of dimensions
    ///
    /// # Returns
    /// The optimization result containing the best individual found
    pub fn optimize(
        &mut self,
        fitness_fn: &dyn FitnessFunction<f64>,
        dimension: usize,
    ) -> OptimizationResult<f64> {
        // Initialize swarm
        let mut swarm: Vec<Particle> = (0..self.options.swarm_size)
            .map(|_| Particle::new(dimension, self.options.bounds))
            .collect();

        // Evaluate initial positions
        let mut global_best_position: Vec<f64> = Vec::new();
        let mut global_best_fitness = f64::NEG_INFINITY;
        let mut evaluations = 0;

        for particle in &mut swarm {
            let individual = Individual::new(particle.position.clone());
            let fitness = fitness_fn.evaluate(&individual);
            evaluations += 1;

            particle.best_fitness = fitness;
            particle.best_position = particle.position.clone();

            if fitness > global_best_fitness {
                global_best_fitness = fitness;
                global_best_position = particle.position.clone();
            }
        }

        // Main loop
        for iteration in 0..self.options.iterations {
            for particle in &mut swarm {
                // Update velocity
                particle.update_velocity(
                    &global_best_position,
                    self.options.w,
                    self.options.c1,
                    self.options.c2,
                );

                // Update position
                particle.update_position(self.options.bounds);

                // Evaluate new position
                let individual = Individual::new(particle.position.clone());
                let fitness = fitness_fn.evaluate(&individual);
                evaluations += 1;

                // Update personal best
                if fitness > particle.best_fitness {
                    particle.best_fitness = fitness;
                    particle.best_position = particle.position.clone();
                }

                // Update global best
                if fitness > global_best_fitness {
                    global_best_fitness = fitness;
                    global_best_position = particle.position.clone();
                }
            }

            // Check convergence (swarm has clustered)
            let avg_position: Vec<f64> = (0..dimension)
                .map(|i| {
                    swarm.iter().map(|p| p.position[i]).sum::<f64>() / swarm.len() as f64
                })
                .collect();

            let diversity: f64 = swarm
                .iter()
                .map(|p| {
                    avg_position
                        .iter()
                        .zip(p.position.iter())
                        .map(|(a, b)| (a - b).powi(2))
                        .sum::<f64>()
                })
                .sum::<f64>()
                / swarm.len() as f64;

            if diversity < 1e-10 {
                return OptimizationResult::new(
                    Individual::with_fitness(global_best_position, global_best_fitness),
                    iteration + 1,
                    evaluations,
                )
                .with_converged();
            }
        }

        OptimizationResult::new(
            Individual::with_fitness(global_best_position, global_best_fitness),
            self.options.iterations,
            evaluations,
        )
    }
}

impl Default for PSO {
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

    #[test]
    fn test_pso_basic() {
        seed_rng(42); // Seed for deterministic behavior
        let mut pso = PSO::new();
        pso.options.swarm_size = 20;
        pso.options.iterations = 50;

        let fitness = ClosureFitnessFunction::new(sphere_function, 2);
        let result = pso.optimize(&fitness, 2);

        // Should find a solution near the origin (0, 0)
        assert!(result.best.fitness > -50.0, "Fitness too low: {}", result.best.fitness);
        assert!(result.iterations <= 50);
    }

    #[test]
    fn test_pso_options_default() {
        let opts = PSOOptions::default();
        assert_eq!(opts.swarm_size, 30);
        assert_eq!(opts.iterations, 100);
        assert_eq!(opts.w, 0.7);
        assert_eq!(opts.c1, 1.5);
        assert_eq!(opts.c2, 1.5);
    }

    #[test]
    fn test_particle_creation() {
        let particle = Particle::new(3, Some((-10.0, 10.0)));
        assert_eq!(particle.position.len(), 3);
        assert_eq!(particle.velocity.len(), 3);
        assert_eq!(particle.best_position.len(), 3);
        // Check bounds
        for &pos in &particle.position {
            assert!(pos >= -10.0 && pos <= 10.0);
        }
    }

    #[test]
    fn test_particle_update() {
        let mut particle = Particle::new(2, None);
        let global_best = vec![1.0, 1.0];

        let original_pos = particle.position.clone();
        particle.update_velocity(&global_best, 0.7, 1.5, 1.5);
        particle.update_position(None);

        // Position should have changed
        assert!(particle.position != original_pos);
    }
}
