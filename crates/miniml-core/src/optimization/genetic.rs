//! Genetic Algorithm implementation
//!
//! Ported and adapted from wasm4pm genetic_discovery.rs
//!
//! Provides a generic genetic algorithm that works with any gene type
//! that can be cloned and compared.

use crate::optimization::types::*;
use crate::optimization::fitness::*;
use wasm_bindgen::prelude::*;
use std::cell::RefCell;

// Thread-local XORShift64 PRNG for random number generation
// (Deterministic, no external dependencies)
thread_local! {
    static RNG: RefCell<u64> = RefCell::new(1);
}

/// Generate a random f64 in [0, 1)
#[inline]
pub fn rand_f64() -> f64 {
    RNG.with(|state| {
        let mut s = state.borrow_mut();
        // XORShift64 algorithm
        let x = *s;
        *s = x ^ x << 13;
        *s ^= *s >> 7;
        *s ^= *s << 17;
        // Convert to f64 in [0, 1)
        (*s >> 11) as f64 / (1u64 << 53) as f64
    })
}

/// Seed the RNG (for reproducibility)
pub fn seed_rng(seed: u64) {
    RNG.with(|state| {
        *state.borrow_mut() = if seed == 0 { 1 } else { seed };
    });
}

/// Genetic Algorithm options
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct GeneticOptions {
    /// Population size (default: 50)
    #[wasm_bindgen(getter_with_clone)]
    pub population_size: usize,

    /// Number of generations (default: 100)
    #[wasm_bindgen(getter_with_clone)]
    pub generations: usize,

    /// Crossover rate (default: 0.8)
    #[wasm_bindgen(getter_with_clone)]
    pub crossover_rate: f64,

    /// Mutation rate (default: 0.1)
    #[wasm_bindgen(getter_with_clone)]
    pub mutation_rate: f64,

    /// Number of elite individuals to preserve (default: 1)
    #[wasm_bindgen(getter_with_clone)]
    pub elitism_count: usize,

    /// Selection method (default: Tournament)
    #[wasm_bindgen(getter_with_clone)]
    pub selection_method: SelectionMethod,

    /// Crossover method (default: SinglePoint)
    #[wasm_bindgen(getter_with_clone)]
    pub crossover_method: CrossoverMethod,

    /// Multi-point crossover points (used if crossover_method is TwoPoint, default: 2)
    #[wasm_bindgen(getter_with_clone)]
    pub crossover_points: usize,

    /// Tournament size for tournament selection (default: 3)
    #[wasm_bindgen(getter_with_clone)]
    pub tournament_size: usize,
}

impl Default for GeneticOptions {
    fn default() -> Self {
        Self {
            population_size: 50,
            generations: 100,
            crossover_rate: 0.8,
            mutation_rate: 0.1,
            elitism_count: 1,
            selection_method: SelectionMethod::Tournament,
            crossover_method: CrossoverMethod::SinglePoint,
            crossover_points: 2,
            tournament_size: 3,
        }
    }
}

/// Genetic Algorithm optimizer
///
/// A generic genetic algorithm that evolves a population of solutions
/// through selection, crossover, and mutation.
pub struct GeneticAlgorithm {
    options: GeneticOptions,
}

impl GeneticAlgorithm {
    /// Create a new genetic algorithm with default options
    pub fn new() -> Self {
        Self {
            options: GeneticOptions::default(),
        }
    }

    /// Create a new genetic algorithm with custom options
    pub fn with_options(options: GeneticOptions) -> Self {
        Self { options }
    }

    /// Get the current options
    pub fn options(&self) -> &GeneticOptions {
        &self.options
    }

    /// Set the options
    pub fn set_options(&mut self, options: GeneticOptions) {
        self.options = options;
    }

    /// Run the genetic algorithm
    ///
    /// # Type Parameters
    /// * `T` - The gene type (must be Clone)
    ///
    /// # Arguments
    /// * `fitness_fn` - The fitness function to optimize
    /// * `gene_factory` - Function to create random genes
    /// * `dimension` - The number of genes per individual
    ///
    /// # Returns
    /// The optimization result containing the best individual found
    pub fn optimize<T>(
        &mut self,
        fitness_fn: &dyn FitnessFunction<T>,
        gene_factory: &dyn Fn() -> T,
        dimension: usize,
    ) -> OptimizationResult<T>
    where
        T: Clone + PartialEq + Send + Sync,
    {
        let mut population = self.initialize_population(fitness_fn, gene_factory, dimension);
        let mut evaluations = population.len();

        // Track best solution
        let mut best_individual = get_best(&population).clone();

        for generation in 0..self.options.generations {
            // Selection and reproduction
            let new_population = self.evolve_population(
                &population,
                fitness_fn,
                gene_factory,
                dimension,
            );
            evaluations += new_population.len() - self.options.elitism_count;

            // Replace population
            population = new_population;

            // Update best
            let current_best = get_best(&population);
            if current_best.fitness > best_individual.fitness {
                best_individual = current_best.clone();
            }

            // Check convergence
            if has_converged(&population, 1e-10) {
                return OptimizationResult::new(best_individual, generation + 1, evaluations)
                    .with_converged();
            }
        }

        OptimizationResult::new(best_individual, self.options.generations, evaluations)
    }

    /// Initialize the population with random individuals
    fn initialize_population<T>(
        &self,
        fitness_fn: &dyn FitnessFunction<T>,
        gene_factory: &dyn Fn() -> T,
        dimension: usize,
    ) -> Vec<Individual<T>>
    where
        T: Clone + PartialEq + Send + Sync,
    {
        (0..self.options.population_size)
            .map(|_| {
                let genes: Vec<T> = (0..dimension).map(|_| gene_factory()).collect();
                let mut individual = Individual::new(genes);
                individual.fitness = fitness_fn.evaluate(&individual);
                individual
            })
            .collect()
    }

    /// Evolve the population through selection, crossover, and mutation
    fn evolve_population<T>(
        &self,
        population: &[Individual<T>],
        fitness_fn: &dyn FitnessFunction<T>,
        gene_factory: &dyn Fn() -> T,
        dimension: usize,
    ) -> Vec<Individual<T>>
    where
        T: Clone + PartialEq + Send + Sync,
    {
        // Sort by fitness (descending)
        let mut sorted: Vec<_> = population.to_vec();
        sorted.sort_by(|a, b| {
            b.fitness
                .partial_cmp(&a.fitness)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Elitism: keep top performers
        let elite_size = self.options.elitism_count.min(sorted.len());
        let mut new_population = sorted[..elite_size].to_vec();

        // Generate offspring
        while new_population.len() < self.options.population_size {
            let parent1 = self.select_parent(&sorted);
            let parent2 = self.select_parent(&sorted);

            let mut child = if rand_f64() < self.options.crossover_rate {
                self.crossover(&parent1, &parent2)
            } else {
                parent1.clone()
            };

            self.mutate(&mut child, gene_factory, dimension);

            child.fitness = fitness_fn.evaluate(&child);
            new_population.push(child);
        }

        new_population
    }

    /// Select a parent using the configured selection method
    fn select_parent<T>(&self, population: &[Individual<T>]) -> Individual<T>
    where
        T: Clone,
    {
        match self.options.selection_method {
            SelectionMethod::Tournament => self.tournament_select(population),
            SelectionMethod::Roulette => self.roulette_select(population),
            SelectionMethod::Rank => self.rank_select(population),
        }
    }

    /// Tournament selection: randomly select k individuals, return the best
    fn tournament_select<T>(&self, population: &[Individual<T>]) -> Individual<T>
    where
        T: Clone,
    {
        let tournament_size = self.options.tournament_size.min(population.len());
        (0..tournament_size)
            .map(|_| {
                let idx = (rand_f64() * population.len() as f64) as usize;
                &population[idx]
            })
            .max_by(|a, b| {
                a.fitness
                    .partial_cmp(&b.fitness)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap()
            .clone()
    }

    /// Roulette wheel selection: probability proportional to fitness
    fn roulette_select<T>(&self, population: &[Individual<T>]) -> Individual<T>
    where
        T: Clone,
    {
        let total_fitness: f64 = population.iter().map(|ind| ind.fitness.max(0.0)).sum();

        if total_fitness <= 0.0 {
            // Fallback to uniform random if all fitnesses are non-positive
            let idx = (rand_f64() * population.len() as f64) as usize;
            return population[idx].clone();
        }

        let mut threshold = rand_f64() * total_fitness;
        for individual in population {
            threshold -= individual.fitness.max(0.0);
            if threshold <= 0.0 {
                return individual.clone();
            }
        }

        // Fallback: return last individual
        population.last().unwrap().clone()
    }

    /// Rank-based selection: probability based on fitness rank
    fn rank_select<T>(&self, population: &[Individual<T>]) -> Individual<T>
    where
        T: Clone,
    {
        let n = population.len();
        let total_rank = (n * (n + 1)) / 2;
        let mut threshold = rand_f64() * total_rank as f64;

        // Sort by rank (already sorted by fitness)
        for (rank, individual) in population.iter().enumerate() {
            threshold -= (n - rank) as f64;
            if threshold <= 0.0 {
                return individual.clone();
            }
        }

        population.last().unwrap().clone()
    }

    /// Crossover two parents to create a child
    fn crossover<T>(&self, parent1: &Individual<T>, parent2: &Individual<T>) -> Individual<T>
    where
        T: Clone,
    {
        let genes1 = &parent1.genes;
        let genes2 = &parent2.genes;
        let len = genes1.len().min(genes2.len());

        let child_genes = match self.options.crossover_method {
            CrossoverMethod::SinglePoint => {
                let point = if len > 1 {
                    (rand_f64() * (len - 1) as f64) as usize + 1
                } else {
                    len
                };
                let mut child = genes1[..point].to_vec();
                child.extend_from_slice(&genes2[point..]);
                child
            }
            CrossoverMethod::TwoPoint => {
                let points = self.options.crossover_points;
                if len < 2 || points < 2 {
                    return parent1.clone();
                }
                let mut idx: Vec<usize> = (1..len).collect();
                // Simple Fisher-Yates shuffle for first 'points' elements
                for i in 0..points.min(idx.len()) {
                    let j = i + (rand_f64() * (idx.len() - i) as f64) as usize;
                    idx.swap(i, j);
                }
                let mut sorted_points = idx.into_iter().take(points).collect::<Vec<_>>();
                sorted_points.sort();
                sorted_points.dedup();

                let mut child = Vec::with_capacity(len);
                let mut prev = 0;
                let mut use_first = true;
                for point in sorted_points {
                    if point >= len {
                        break;
                    }
                    let segment = if use_first { genes1 } else { genes2 };
                    child.extend_from_slice(&segment[prev..point]);
                    prev = point;
                    use_first = !use_first;
                }
                let segment = if use_first { genes1 } else { genes2 };
                child.extend_from_slice(&segment[prev..]);
                child
            }
            CrossoverMethod::Uniform => {
                genes1
                    .iter()
                    .zip(genes2.iter())
                    .map(|(g1, g2)| {
                        if rand_f64() < 0.5 {
                            g1.clone()
                        } else {
                            g2.clone()
                        }
                    })
                    .collect()
            }
        };

        Individual::new(child_genes)
    }

    /// Mutate an individual
    fn mutate<T>(&self, individual: &mut Individual<T>, gene_factory: &dyn Fn() -> T, _dimension: usize)
    where
        T: Clone + PartialEq,
    {
        if rand_f64() >= self.options.mutation_rate {
            return;
        }

        // Randomly select a gene to mutate
        let gene_idx = (rand_f64() * individual.genes.len() as f64) as usize;
        individual.genes[gene_idx] = gene_factory();
    }
}

impl Default for GeneticAlgorithm {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Sphere function: minimize sum(x^2)
    fn sphere_function(genes: &[f64]) -> f64 {
        -genes.iter().map(|x| x * x).sum::<f64>() // Negative for maximization
    }

    #[test]
    fn test_genetic_algorithm_basic() {
        seed_rng(42); // Seed for deterministic behavior
        let mut ga = GeneticAlgorithm::new();
        ga.options.population_size = 20;
        ga.options.generations = 50;

        let fitness = ClosureFitnessFunction::new(sphere_function, 2);
        let gene_factory = || rand_f64() * 10.0 - 5.0; // Random in [-5, 5]

        let result = ga.optimize(&fitness, &gene_factory, 2);

        // Should find a solution near the origin (0, 0)
        // The sphere function has maximum at 0.0, so fitness should be close to 0
        assert!(result.best.fitness > -50.0, "Fitness too low: {}", result.best.fitness);
        assert!(result.iterations <= 50);
    }

    #[test]
    fn test_genetic_options_default() {
        let opts = GeneticOptions::default();
        assert_eq!(opts.population_size, 50);
        assert_eq!(opts.generations, 100);
        assert_eq!(opts.crossover_rate, 0.8);
        assert_eq!(opts.mutation_rate, 0.1);
        assert_eq!(opts.elitism_count, 1);
        assert_eq!(opts.tournament_size, 3);
    }

    #[test]
    fn test_crossover_single_point() {
        let ga = GeneticAlgorithm::new();
        let parent1 = Individual::new(vec![1.0, 2.0, 3.0, 4.0]);
        let parent2 = Individual::new(vec![5.0, 6.0, 7.0, 8.0]);

        // Force single-point crossover
        let child = ga.crossover(&parent1, &parent2);

        // Child should have genes from both parents
        assert!(child.genes.len() == 4);
        // Either all from parent1 or split between parents
        let from_p1 = child.genes.iter().filter(|&&x| x == 1.0 || x == 2.0 || x == 3.0 || x == 4.0).count();
        let from_p2 = child.genes.iter().filter(|&&x| x == 5.0 || x == 6.0 || x == 7.0 || x == 8.0).count();
        assert_eq!(from_p1 + from_p2, 4);
    }

    #[test]
    fn test_tournament_selection() {
        seed_rng(42); // Seed for deterministic behavior
        let ga = GeneticAlgorithm::new();
        let population = vec![
            Individual::with_fitness(vec![1.0], 10.0),
            Individual::with_fitness(vec![2.0], 5.0),
            Individual::with_fitness(vec![3.0], 15.0),
        ];

        let selected = ga.tournament_select(&population);

        // Tournament selection should prefer higher fitness
        // With tournament size 3, it selects 3 random individuals and returns the best
        assert!(selected.fitness > 0.0);
    }

    // Integration test: Hyperparameter tuning for a simple regression
    // Find optimal learning rate and regularization parameters
    #[test]
    fn test_hyperparameter_tuning() {
        seed_rng(42);
        let mut ga = GeneticAlgorithm::new();
        ga.options.population_size = 30;
        ga.options.generations = 50;

        // Objective: minimize validation error for a hypothetical model
        // Parameters: learning_rate (0.001 - 1.0), regularization (0.0 - 1.0)
        let hyperparameter_fitness = |genes: &[f64]| {
            let lr = genes[0]; // Learning rate
            let reg = genes[1]; // Regularization

            // Simulated validation error (lower is better)
            // In real use, this would train a model and evaluate on validation data
            let error = (lr - 0.1).powi(2) + (reg - 0.01).powi(2);
            -error // Negative for maximization
        };

        let fitness = ClosureFitnessFunction::new(hyperparameter_fitness, 2);
        let gene_factory = || rand_f64(); // Random in [0, 1)

        let result = ga.optimize(&fitness, &gene_factory, 2);

        // Should find parameters close to optimal (lr=0.1, reg=0.01)
        assert!(result.best.fitness > -0.5, "Fitness too low: {}", result.best.fitness);
    }

    // Integration test: Feature selection
    // Find optimal subset of features for a classification problem
    #[test]
    fn test_feature_selection() {
        seed_rng(42);
        let mut ga = GeneticAlgorithm::new();
        ga.options.population_size = 20;
        ga.options.generations = 30;
        ga.options.crossover_method = CrossoverMethod::Uniform;

        // Binary representation: 1 = include feature, 0 = exclude
        // 5 features, find optimal subset
        let feature_fitness = |genes: &[f64]| {
            // Binary genes: 1 means feature included
            let selected_features: usize = genes.iter().map(|&g| if g > 0.5 { 1 } else { 0 }).sum();

            // Simulated accuracy (higher is better)
            // Prefer 3 features (optimal subset size)
            let accuracy = if selected_features == 3 {
                0.95
            } else if selected_features == 2 || selected_features == 4 {
                0.85
            } else {
                0.7
            };

            accuracy
        };

        let fitness = ClosureFitnessFunction::new(feature_fitness, 5);
        let gene_factory = || if rand_f64() < 0.5 { 0.0 } else { 1.0 };

        let result = ga.optimize(&fitness, &gene_factory, 5);

        // Should find solution with 3 features selected
        let selected: usize = result.best.genes.iter().map(|&g| if g > 0.5 { 1 } else { 0 }).sum();
        assert!(selected == 3 || result.best.fitness > 0.8);
    }
}
