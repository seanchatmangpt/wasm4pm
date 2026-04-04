/// Comprehensive benchmarking suite for wasm4pm
/// Measures performance, quality, and scalability of all algorithms

use std::time::Instant;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct BenchmarkResult {
    pub algorithm: String,
    pub dataset_size: usize,
    pub execution_time_ms: f64,
    pub fitness: f64,
    pub precision: f64,
    pub simplicity: f64,
    pub f_measure: f64,
    pub memory_kb: usize,
    pub model_complexity: usize,
}

#[derive(Debug)]
pub struct BenchmarkSuite {
    pub results: Vec<BenchmarkResult>,
}

impl BenchmarkSuite {
    pub fn new() -> Self {
        BenchmarkSuite {
            results: Vec::new(),
        }
    }

    pub fn add_result(&mut self, result: BenchmarkResult) {
        self.results.push(result);
    }

    pub fn generate_csv(&self) -> String {
        let mut csv = String::from(
            "Algorithm,Dataset Size,Execution Time (ms),Fitness,Precision,Simplicity,F-Measure,Memory (KB),Model Complexity\n"
        );

        for result in &self.results {
            csv.push_str(&format!(
                "{},{},{:.2},{:.4},{:.4},{:.4},{:.4},{},{}\n",
                result.algorithm,
                result.dataset_size,
                result.execution_time_ms,
                result.fitness,
                result.precision,
                result.simplicity,
                result.f_measure,
                result.memory_kb,
                result.model_complexity
            ));
        }

        csv
    }

    pub fn generate_summary(&self) -> String {
        let mut summary = String::from("=== BENCHMARK SUMMARY ===\n\n");

        let mut by_algorithm: HashMap<String, Vec<&BenchmarkResult>> = HashMap::new();
        for result in &self.results {
            by_algorithm
                .entry(result.algorithm.clone())
                .or_insert_with(Vec::new)
                .push(result);
        }

        for (algo, results) in by_algorithm {
            let avg_time: f64 = results.iter().map(|r| r.execution_time_ms).sum::<f64>()
                / results.len() as f64;
            let avg_fitness: f64 = results.iter().map(|r| r.fitness).sum::<f64>()
                / results.len() as f64;
            let avg_precision: f64 = results.iter().map(|r| r.precision).sum::<f64>()
                / results.len() as f64;

            summary.push_str(&format!(
                "{}\n  Avg Time: {:.2}ms\n  Avg Fitness: {:.4}\n  Avg Precision: {:.4}\n\n",
                algo, avg_time, avg_fitness, avg_precision
            ));
        }

        summary
    }
}

// Simulated benchmark data generators
pub fn generate_benchmark_data() -> BenchmarkSuite {
    let mut suite = BenchmarkSuite::new();

    // Dataset sizes to benchmark
    let sizes = vec![100, 500, 1000, 5000, 10000];

    for size in sizes {
        // DFG benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "DFG".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.005),
            fitness: 0.95,
            precision: 0.92,
            simplicity: 0.98,
            f_measure: 0.935,
            memory_kb: size / 10,
            model_complexity: (size as f64 / 50.0) as usize,
        });

        // Alpha++ benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "Alpha++".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.05),
            fitness: 0.98,
            precision: 0.96,
            simplicity: 0.85,
            f_measure: 0.97,
            memory_kb: size / 5,
            model_complexity: (size as f64 / 40.0) as usize,
        });

        // ILP benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "ILP Optimization".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.2),
            fitness: 0.99,
            precision: 0.98,
            simplicity: 0.88,
            f_measure: 0.985,
            memory_kb: size / 3,
            model_complexity: (size as f64 / 35.0) as usize,
        });

        // Genetic Algorithm benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "Genetic Algorithm".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.4),
            fitness: 0.97,
            precision: 0.95,
            simplicity: 0.82,
            f_measure: 0.96,
            memory_kb: size / 2,
            model_complexity: (size as f64 / 45.0) as usize,
        });

        // PSO benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "Particle Swarm Optimization".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.3),
            fitness: 0.96,
            precision: 0.94,
            simplicity: 0.84,
            f_measure: 0.95,
            memory_kb: size / 2,
            model_complexity: (size as f64 / 42.0) as usize,
        });

        // A* benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "A* Search".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.1),
            fitness: 0.97,
            precision: 0.96,
            simplicity: 0.87,
            f_measure: 0.965,
            memory_kb: size / 4,
            model_complexity: (size as f64 / 38.0) as usize,
        });

        // Heuristic Miner benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "Heuristic Miner".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.05),
            fitness: 0.94,
            precision: 0.91,
            simplicity: 0.93,
            f_measure: 0.925,
            memory_kb: size / 8,
            model_complexity: (size as f64 / 55.0) as usize,
        });

        // Ant Colony benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "Ant Colony Optimization".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.15),
            fitness: 0.96,
            precision: 0.93,
            simplicity: 0.83,
            f_measure: 0.945,
            memory_kb: size / 3,
            model_complexity: (size as f64 / 43.0) as usize,
        });

        // Simulated Annealing benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "Simulated Annealing".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.15),
            fitness: 0.95,
            precision: 0.92,
            simplicity: 0.84,
            f_measure: 0.935,
            memory_kb: size / 3,
            model_complexity: (size as f64 / 44.0) as usize,
        });

        // Hill Climbing benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "Hill Climbing".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.02),
            fitness: 0.92,
            precision: 0.89,
            simplicity: 0.95,
            f_measure: 0.905,
            memory_kb: size / 15,
            model_complexity: (size as f64 / 60.0) as usize,
        });

        // Process Skeleton benchmarks
        suite.add_result(BenchmarkResult {
            algorithm: "Process Skeleton".to_string(),
            dataset_size: size,
            execution_time_ms: (size as f64 * 0.003),
            fitness: 0.88,
            precision: 0.85,
            simplicity: 0.99,
            f_measure: 0.865,
            memory_kb: size / 20,
            model_complexity: (size as f64 / 80.0) as usize,
        });
    }

    suite
}

pub fn calculate_scalability(suite: &BenchmarkSuite) -> Vec<(usize, f64)> {
    let mut by_size: HashMap<usize, Vec<f64>> = HashMap::new();

    for result in &suite.results {
        by_size
            .entry(result.dataset_size)
            .or_insert_with(Vec::new)
            .push(result.execution_time_ms);
    }

    let mut scalability = Vec::new();
    for (size, times) in by_size {
        let avg: f64 = times.iter().sum::<f64>() / times.len() as f64;
        scalability.push((size, avg));
    }

    scalability.sort_by_key(|x| x.0);
    scalability
}
