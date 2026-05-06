//! Fitness function traits and utilities
//!
//! Provides generic interfaces for evaluating solution fitness
//! and common helper functions.

use std::sync::Arc;
use std::marker::PhantomData;
use super::types::Individual;

/// Trait for fitness evaluation functions
///
/// Implementations define how to evaluate the quality of a solution.
///
/// # Type Parameters
/// * `T` - The gene type
pub trait FitnessFunction<T>: Send + Sync {
    /// Evaluate the fitness of an individual
    ///
    /// # Arguments
    /// * `individual` - The individual to evaluate
    ///
    /// # Returns
    /// The fitness value (higher is better, unless minimizing)
    ///
    /// # Note
    /// Implementations should cache results if evaluation is expensive
    fn evaluate(&self, individual: &Individual<T>) -> f64;

    /// Get the problem dimensionality (number of genes)
    fn dimension(&self) -> usize;
}

/// Boxed fitness function for dynamic dispatch
pub type BoxedFitnessFunction<T> = Arc<dyn FitnessFunction<T>>;

/// Simple closure-based fitness function
///
/// Wraps a closure to implement FitnessFunction trait
pub struct ClosureFitnessFunction<T, F>
where
    F: Fn(&[T]) -> f64 + Send + Sync,
{
    f: F,
    dimension: usize,
    _phantom: PhantomData<T>,
}

impl<T, F> ClosureFitnessFunction<T, F>
where
    F: Fn(&[T]) -> f64 + Send + Sync,
{
    /// Create a new fitness function from a closure
    ///
    /// # Arguments
    /// * `f` - The closure to evaluate fitness
    /// * `dimension` - The problem dimensionality
    #[inline]
    pub fn new(f: F, dimension: usize) -> Self {
        Self {
            f,
            dimension,
            _phantom: PhantomData,
        }
    }
}

impl<T, F> FitnessFunction<T> for ClosureFitnessFunction<T, F>
where
    T: Send + Sync,
    F: Fn(&[T]) -> f64 + Send + Sync,
{
    #[inline]
    fn evaluate(&self, individual: &Individual<T>) -> f64 {
        (self.f)(&individual.genes)
    }

    #[inline]
    fn dimension(&self) -> usize {
        self.dimension
    }
}

/// Minimizing fitness function wrapper
///
/// Converts a minimization problem to a maximization problem
/// by negating the fitness value.
pub struct Minimizing<F> {
    inner: F,
}

impl<F> Minimizing<F> {
    /// Wrap a fitness function to minimize instead of maximize
    #[inline]
    pub fn new(inner: F) -> Self {
        Self { inner }
    }
}

impl<T, F: FitnessFunction<T>> FitnessFunction<T> for Minimizing<F> {
    #[inline]
    fn evaluate(&self, individual: &Individual<T>) -> f64 {
        -self.inner.evaluate(individual)
    }

    #[inline]
    fn dimension(&self) -> usize {
        self.inner.dimension()
    }
}

/// Evaluate a population of individuals
///
/// # Arguments
/// * `population` - The population to evaluate
/// * `fitness_fn` - The fitness function to use
///
/// # Returns
/// The number of individuals evaluated
pub fn evaluate_population<T>(
    population: &mut [Individual<T>],
    fitness_fn: &dyn FitnessFunction<T>,
) -> usize {
    let mut evaluated = 0;
    for individual in population.iter_mut() {
        if individual.fitness == f64::NEG_INFINITY {
            individual.fitness = fitness_fn.evaluate(individual);
            evaluated += 1;
        }
    }
    evaluated
}

/// Get the best individual from a population (maximizing)
///
/// # Arguments
/// * `population` - The population to search
///
/// # Returns
/// A reference to the individual with the highest fitness
///
/// # Panics
/// Panics if the population is empty
#[inline]
pub fn get_best<T>(population: &[Individual<T>]) -> &Individual<T> {
    population
        .iter()
        .max_by(|a, b| {
            a.fitness
                .partial_cmp(&b.fitness)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .expect("Population cannot be empty")
}

/// Get the worst individual from a population (maximizing)
///
/// # Arguments
/// * `population` - The population to search
///
/// # Returns
/// A reference to the individual with the lowest fitness
///
/// # Panics
/// Panics if the population is empty
#[inline]
pub fn get_worst<T>(population: &[Individual<T>]) -> &Individual<T> {
    population
        .iter()
        .min_by(|a, b| {
            a.fitness
                .partial_cmp(&b.fitness)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .expect("Population cannot be empty")
}

/// Calculate average fitness of a population
///
/// # Arguments
/// * `population` - The population to analyze
///
/// # Returns
/// The average fitness, or 0.0 if population is empty
#[inline]
pub fn average_fitness<T>(population: &[Individual<T>]) -> f64 {
    if population.is_empty() {
        return 0.0;
    }
    population.iter().map(|ind| ind.fitness).sum::<f64>() / population.len() as f64
}

/// Calculate fitness diversity (standard deviation)
///
/// # Arguments
/// * `population` - The population to analyze
///
/// # Returns
/// The standard deviation of fitness values, or 0.0 if population has < 2 individuals
#[inline]
pub fn fitness_diversity<T>(population: &[Individual<T>]) -> f64 {
    if population.len() < 2 {
        return 0.0;
    }

    let avg = average_fitness(population);
    let variance = population.iter().map(|ind| {
        let diff = ind.fitness - avg;
        diff * diff
    }).sum::<f64>() / population.len() as f64;

    variance.sqrt()
}

/// Check if population has converged
///
/// Convergence is defined as having fitness diversity below a threshold
///
/// # Arguments
/// * `population` - The population to check
/// * `threshold` - The diversity threshold (default: 1e-6)
///
/// # Returns
/// true if the population has converged
#[inline]
pub fn has_converged<T>(population: &[Individual<T>], threshold: f64) -> bool {
    fitness_diversity(population) < threshold
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestFitness;
    impl FitnessFunction<f64> for TestFitness {
        fn evaluate(&self, individual: &Individual<f64>) -> f64 {
            individual.genes.iter().sum()
        }

        fn dimension(&self) -> usize {
            3
        }
    }

    #[test]
    fn test_closure_fitness_function() {
        let fitness = ClosureFitnessFunction::new(|genes: &[f64]| genes[0] * genes[0], 1);
        let individual = Individual::new(vec![3.0]);

        assert_eq!(fitness.evaluate(&individual), 9.0);
        assert_eq!(fitness.dimension(), 1);
    }

    #[test]
    fn test_minimizing_wrapper() {
        let fitness = ClosureFitnessFunction::new(|genes: &[f64]| genes.iter().sum(), 2);
        let minimizing = Minimizing::new(fitness);

        let individual = Individual::new(vec![1.0, 2.0]);
        assert_eq!(minimizing.evaluate(&individual), -3.0);
    }

    #[test]
    fn test_evaluate_population() {
        let fitness = TestFitness;
        let mut population = vec![
            Individual::new(vec![1.0, 2.0, 3.0]),
            Individual::new(vec![2.0, 3.0, 4.0]),
        ];

        let evaluated = evaluate_population(&mut population, &fitness);
        assert_eq!(evaluated, 2);
        assert_eq!(population[0].fitness, 6.0);
        assert_eq!(population[1].fitness, 9.0);
    }

    #[test]
    fn test_get_best() {
        let population = vec![
            Individual::with_fitness(vec![1.0], 5.0),
            Individual::with_fitness(vec![2.0], 10.0),
            Individual::with_fitness(vec![3.0], 7.0),
        ];

        let best = get_best(&population);
        assert_eq!(best.fitness, 10.0);
    }

    #[test]
    fn test_get_worst() {
        let population = vec![
            Individual::with_fitness(vec![1.0], 5.0),
            Individual::with_fitness(vec![2.0], 10.0),
            Individual::with_fitness(vec![3.0], 7.0),
        ];

        let worst = get_worst(&population);
        assert_eq!(worst.fitness, 5.0);
    }

    #[test]
    fn test_average_fitness() {
        let population = vec![
            Individual::with_fitness(vec![1.0], 5.0),
            Individual::with_fitness(vec![2.0], 10.0),
            Individual::with_fitness(vec![3.0], 7.0),
        ];

        assert_eq!(average_fitness(&population), 22.0 / 3.0);
    }

    #[test]
    fn test_fitness_diversity() {
        let population = vec![
            Individual::with_fitness(vec![1.0], 5.0),
            Individual::with_fitness(vec![2.0], 10.0),
        ];

        let diversity = fitness_diversity(&population);
        assert!((diversity - 2.5).abs() < 1e-10);
    }

    #[test]
    fn test_has_converged() {
        let converged = vec![
            Individual::with_fitness(vec![1.0], 10.0),
            Individual::with_fitness(vec![2.0], 10.000001),
        ];

        let not_converged = vec![
            Individual::with_fitness(vec![1.0], 5.0),
            Individual::with_fitness(vec![2.0], 10.0),
        ];

        assert!(has_converged(&converged, 1e-5));
        assert!(!has_converged(&not_converged, 1e-5));
    }
}
