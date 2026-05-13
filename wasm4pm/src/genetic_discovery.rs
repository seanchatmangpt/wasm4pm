use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{evaluate_edges_fitness, to_js_str};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

type EdgeSet = HashSet<(u32, u32)>;

/// Genetic Algorithm for process model discovery
/// Evolves a population of edge sets to find models that fit the log well
#[wasm_bindgen]
pub fn discover_genetic_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    population_size: usize,
    generations: usize,
) -> Result<JsValue, JsValue> {
    let (best_dfg, best_fitness) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                discover_genetic_algorithm_from_log(log, activity_key, population_size, generations)
                    .ok_or_else(|| crate::error::js_val("no_edges"))
            }
            Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "genetic_algorithm",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "final_fitness": best_fitness,
        "population_size": population_size,
        "generations": generations,
    }))
}

/// Pure-Rust GA discovery: takes EventLog directly, returns (DFG, final_fitness).
/// Testable without wasm-bindgen runtime — same logic as discover_genetic_algorithm.
pub fn discover_genetic_algorithm_from_log(
    log: &EventLog,
    activity_key: &str,
    population_size: usize,
    generations: usize,
) -> Option<(DirectlyFollowsGraph, f64)> {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
    let mut edge_map: FxHashMap<(u32, u32), usize> = FxHashMap::default();
    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end.saturating_sub(1) {
            let edge = (col.events[i], col.events[i + 1]);
            edge_map.entry(edge).and_modify(|_| {}).or_insert_with(|| {
                edge_vocab.push(edge);
                edge_vocab.len() - 1
            });
        }
    }
    if edge_vocab.is_empty() {
        return None;
    }
    let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();
    let mut rng = StdRng::seed_from_u64(42);

    let mut population: Vec<(EdgeSet, f64)> = (0..population_size)
        .map(|_| {
            let es = create_random_edge_set_seeded(&edge_vocab, 0.7, &mut rng);
            let f = evaluate_edges_fitness(&es, &col);
            (es, f)
        })
        .collect();

    for _ in 0..generations {
        population.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let elite_size = (population_size / 4).max(1);
        let mut next = population[..elite_size].to_vec();
        while next.len() < population_size {
            let p1 = population[rand_select_seeded(&population, &mut rng)].0.clone();
            let p2 = population[rand_select_seeded(&population, &mut rng)].0.clone();
            let mut child = crossover_edges_seeded(&p1, &p2, &mut rng);
            mutate_edges_seeded(&mut child, 0.1, &edge_vocab, &mut rng);
            let f = evaluate_edges_fitness(&child, &col);
            next.push((child, f));
        }
        next.truncate(population_size);
        population = next;
    }

    population.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let best_fitness = population[0].1;
    let best_edges = population.remove(0).0;
    Some((edge_set_to_dfg(&best_edges, &vocab), best_fitness))
}

/// Particle Swarm Optimization for process discovery
/// Uses swarm intelligence to explore the model space
#[wasm_bindgen]
pub fn discover_pso_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    swarm_size: usize,
    iterations: usize,
) -> Result<JsValue, JsValue> {
    let (best_dfg, best_fitness) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                discover_pso_algorithm_from_log(log, activity_key, swarm_size, iterations)
                    .ok_or_else(|| crate::error::js_val("no_edges"))
            }
            Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "pso_algorithm",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "final_fitness": best_fitness,
        "swarm_size": swarm_size,
        "iterations": iterations,
    }))
}

/// Pure-Rust PSO discovery: takes EventLog directly, returns (DFG, final_fitness).
/// Testable without wasm-bindgen runtime — same logic as discover_pso_algorithm.
pub fn discover_pso_algorithm_from_log(
    log: &EventLog,
    activity_key: &str,
    swarm_size: usize,
    iterations: usize,
) -> Option<(DirectlyFollowsGraph, f64)> {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
    let mut edge_map: FxHashMap<(u32, u32), usize> = FxHashMap::default();
    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end.saturating_sub(1) {
            let edge = (col.events[i], col.events[i + 1]);
            edge_map.entry(edge).and_modify(|_| {}).or_insert_with(|| {
                edge_vocab.push(edge);
                edge_vocab.len() - 1
            });
        }
    }
    if edge_vocab.is_empty() {
        return None;
    }
    let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();
    let mut rng = StdRng::seed_from_u64(42);

    let mut particles: Vec<(EdgeSet, f64, EdgeSet, f64)> = Vec::new();
    let mut best_global: Option<(EdgeSet, f64)> = None;

    for _ in 0..swarm_size {
        let edge_set = create_random_edge_set_seeded(&edge_vocab, 0.6, &mut rng);
        let fitness = evaluate_edges_fitness(&edge_set, &col);
        if best_global.is_none() || fitness > best_global.as_ref().unwrap().1 {
            best_global = Some((edge_set.clone(), fitness));
        }
        particles.push((edge_set, fitness, HashSet::new(), fitness));
    }

    let mut best_particle_idx: usize = 0;
    let mut best_particle_fitness: f64 = f64::NEG_INFINITY;

    for _ in 0..iterations {
        for (idx, (edge_set, current_fitness, pbest, pbest_fitness)) in particles.iter_mut().enumerate() {
            let pbest_ref = if pbest.is_empty() { &*edge_set } else { &*pbest };
            let toward_pbest = blend_edges_seeded(edge_set, pbest_ref, 0.2, &mut rng);
            let toward_global = blend_edges_seeded(&toward_pbest, &best_global.as_ref().unwrap().0, 0.3, &mut rng);
            *edge_set = toward_global;
            mutate_edges_seeded(edge_set, 0.05, &edge_vocab, &mut rng);
            let new_fitness = evaluate_edges_fitness(edge_set, &col);
            *current_fitness = new_fitness;
            if new_fitness > *pbest_fitness {
                *pbest_fitness = new_fitness;
                if new_fitness > best_particle_fitness {
                    best_particle_fitness = new_fitness;
                    best_particle_idx = idx;
                }
            }
            if new_fitness > best_global.as_ref().unwrap().1 {
                best_global = Some((edge_set.clone(), new_fitness));
            }
        }
    }
    if best_particle_fitness > f64::NEG_INFINITY {
        let winner_set = particles[best_particle_idx].0.clone();
        particles[best_particle_idx].2 = winner_set;
    }
    let (edges, fitness) = best_global?;
    Some((edge_set_to_dfg(&edges, &vocab), fitness))
}

// Helper: Materialize a DirectlyFollowsGraph from edge set and vocabulary
fn edge_set_to_dfg(edge_set: &EdgeSet, vocab: &[String]) -> DirectlyFollowsGraph {
    let mut dfg = DirectlyFollowsGraph::new();

    // Add all activities as nodes
    for activity in vocab.iter() {
        dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: 1,
        });
    }

    // Add edges from edge set
    for &(from_id, to_id) in edge_set {
        let from_idx = from_id as usize;
        let to_idx = to_id as usize;

        // Only add edge if indices are valid
        if from_idx < vocab.len() && to_idx < vocab.len() {
            dfg.edges.push(DirectlyFollowsRelation {
                from: vocab[from_idx].clone(),
                to: vocab[to_idx].clone(),
                frequency: 1,
            });
        }
    }

    dfg
}

// Seeded variants for determinism

fn create_random_edge_set_seeded(
    edge_vocab: &[(u32, u32)],
    inclusion_probability: f64,
    rng: &mut StdRng,
) -> EdgeSet {
    let mut edge_set: EdgeSet = HashSet::new();
    for &edge in edge_vocab {
        if rng.gen::<f64>() < inclusion_probability {
            edge_set.insert(edge);
        }
    }
    edge_set
}

fn crossover_edges_seeded(parent1: &EdgeSet, parent2: &EdgeSet, rng: &mut StdRng) -> EdgeSet {
    let mut child: EdgeSet = HashSet::new();

    // Fix C: iterate the sets directly — no intermediate Vec allocation
    for &edge in parent1.iter() {
        if rng.gen::<f64>() < 0.5 {
            child.insert(edge);
        }
    }

    for &edge in parent2.iter() {
        if rng.gen::<f64>() < 0.5 {
            child.insert(edge);
        }
    }

    child
}

fn mutate_edges_seeded(
    edge_set: &mut EdgeSet,
    mutation_rate: f64,
    edge_vocab: &[(u32, u32)],
    rng: &mut StdRng,
) {
    if rng.gen::<f64>() < mutation_rate {
        if !edge_set.is_empty() && rng.gen::<f64>() < 0.5 {
            if let Some(&edge) = edge_set.iter().next() {
                edge_set.remove(&edge);
            }
        } else if !edge_vocab.is_empty() {
            let idx = (rng.gen::<f64>() * edge_vocab.len() as f64) as usize;
            edge_set.insert(edge_vocab[idx]);
        }
    }
}

fn blend_edges_seeded(set1: &EdgeSet, set2: &EdgeSet, ratio: f64, rng: &mut StdRng) -> EdgeSet {
    let mut result: EdgeSet = HashSet::new();

    // Keep edges from set1 with probability (1 - ratio)
    for &edge in set1 {
        if rng.gen::<f64>() > ratio {
            result.insert(edge);
        }
    }

    // Add edges from set2 with probability ratio
    for &edge in set2 {
        if rng.gen::<f64>() < ratio {
            result.insert(edge);
        }
    }

    result
}

fn rand_select_seeded<T>(items: &[(T, f64)], rng: &mut StdRng) -> usize {
    let n = items.len();
    debug_assert!(n > 0, "rand_select_seeded called with empty slice");

    if n <= 50 {
        let total: f64 = items.iter().map(|(_, f)| f.max(0.0)).sum();
        if total > 0.0 {
            let mut threshold = rng.gen::<f64>() * total;
            for (i, (_, fitness)) in items.iter().enumerate() {
                threshold -= fitness.max(0.0);
                if threshold <= 0.0 {
                    return i;
                }
            }
        }
        return (rng.gen::<f64>() * n as f64) as usize % n;
    }

    let total: f64 = items.iter().map(|(_, f)| f.max(0.0)).sum();
    if total > 0.0 {
        let mut threshold = rng.gen::<f64>() * total;
        for (i, (_, fitness)) in items.iter().enumerate() {
            threshold -= fitness.max(0.0);
            if threshold <= 0.0 {
                return i;
            }
        }
    }
    (rng.gen::<f64>() * n as f64) as usize % n
}

// ---------------------------------------------------------------------------
// Ant Colony Optimization (ACO)
// ---------------------------------------------------------------------------

/// Ant Colony Optimization for process model discovery
/// Uses pheromone trails and heuristic information to construct process models
#[wasm_bindgen]
pub fn discover_aco_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    ant_count: usize,
    iterations: usize,
) -> Result<JsValue, JsValue> {
    let (best_edges, best_fitness, vocab) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
                    .unwrap_or_else(|| {
                        let owned = log.to_columnar_owned(activity_key);
                        crate::cache::columnar_cache_insert(
                            eventlog_handle.to_string(),
                            activity_key.to_string(),
                            owned.clone(),
                        );
                        owned
                    });
                let col = ColumnarLog::from_owned(&col_owned);

                // Build edge vocabulary from columnar log
                let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
                let mut edge_freq: FxHashMap<(u32, u32), f64> = FxHashMap::default();

                for t in 0..col.trace_offsets.len().saturating_sub(1) {
                    let start = col.trace_offsets[t];
                    let end = col.trace_offsets[t + 1];
                    for i in start..end.saturating_sub(1) {
                        let edge = (col.events[i], col.events[i + 1]);
                        *edge_freq.entry(edge).or_insert(0.0) += 1.0;
                        if edge_freq[&edge] == 1.0 {
                            edge_vocab.push(edge);
                        }
                    }
                }

                // Guard: empty vocabulary (only 1 activity in log)
                if edge_vocab.is_empty() {
                    return Err(crate::error::js_val("no_edges"));
                }

                let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();
                let total_edges = edge_freq.values().sum::<f64>().max(1.0);

                // Heuristic information: normalized edge frequency
                let heuristic: FxHashMap<(u32, u32), f64> = edge_freq
                    .iter()
                    .map(|(e, &f)| (*e, f / total_edges))
                    .collect();

                // Initialize pheromone trails uniformly
                let mut pheromone: FxHashMap<(u32, u32), f64> = FxHashMap::default();
                let tau_0 = 1.0 / edge_vocab.len().max(1) as f64;
                for &edge in &edge_vocab {
                    pheromone.insert(edge, tau_0);
                }

                // ACO constants
                let alpha = 1.0; // pheromone influence
                let beta = 2.0; // heuristic influence
                let evaporation_rate = 0.1;
                let q = 100.0; // pheromone deposit factor

                // Deterministic RNG: seeded for reproducibility
                let mut rng = StdRng::seed_from_u64(42);

                let mut best_solution: Option<(EdgeSet, f64)> = None;

                for _iter in 0..iterations {
                    let mut iteration_solutions: Vec<(EdgeSet, f64)> = Vec::new();

                    for _ant in 0..ant_count {
                        // Construct solution using pheromone + heuristic
                        let mut ant_edges: EdgeSet = HashSet::new();

                        for &edge in &edge_vocab {
                            let tau = pheromone.get(&edge).copied().unwrap_or(tau_0);
                            let eta = heuristic.get(&edge).copied().unwrap_or(0.01);

                            // Probability: (tau^alpha * eta^beta)
                            let prob = tau.powf(alpha) * eta.powf(beta);
                            if rng.gen::<f64>() < prob.min(0.99) {
                                ant_edges.insert(edge);
                            }
                        }

                        let fitness = evaluate_edges_fitness(&ant_edges, &col);

                        // Track global best before moving ant_edges
                        if best_solution.is_none() || fitness > best_solution.as_ref().unwrap().1 {
                            best_solution = Some((ant_edges.clone(), fitness));
                        }

                        iteration_solutions.push((ant_edges, fitness));
                    }

                    // Evaporate pheromones
                    for val in pheromone.values_mut() {
                        *val *= 1.0 - evaporation_rate;
                    }

                    // Deposit pheromones from all ants
                    for (edges, fitness) in &iteration_solutions {
                        let deposit = q * fitness;
                        for &edge in edges {
                            *pheromone.entry(edge).or_insert(tau_0) += deposit;
                        }
                    }

                    // Extra deposit for iteration-best ant
                    if let Some((best_edges, best_fit)) = iteration_solutions
                        .iter()
                        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
                    {
                        let deposit = q * best_fit * 2.0; // elitist bonus
                        for &edge in best_edges {
                            *pheromone.entry(edge).or_insert(tau_0) += deposit;
                        }
                    }
                }

                match best_solution {
                    Some((edges, fitness)) => Ok((edges, fitness, vocab)),
                    None => Err(crate::error::js_val("ACO failed to find solution")),
                }
            }
            Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let best_dfg = edge_set_to_dfg(&best_edges, &vocab);

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "aco",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "final_fitness": best_fitness,
        "ant_count": ant_count,
        "iterations": iterations,
    }))
}

// Simulated Annealing is defined in more_discovery.rs (canonical version)

#[wasm_bindgen]
pub fn genetic_discovery_info() -> String {
    json!({
        "status": "genetic_discovery_available",
        "algorithms": [
            {
                "name": "discover_genetic_algorithm",
                "description": "Evolves DFG population toward optimal process models",
                "parameters": ["activity_key", "population_size", "generations"],
                "returns": ["nodes", "edges", "final_fitness"],
                "better_for": "Finding creative, diverse process model solutions"
            },
            {
                "name": "discover_pso_algorithm",
                "description": "Uses particle swarm intelligence for process discovery",
                "parameters": ["activity_key", "swarm_size", "iterations"],
                "returns": ["nodes", "edges", "final_fitness"],
                "better_for": "Continuous optimization in complex solution spaces"
            },
            {
                "name": "discover_aco_algorithm",
                "description": "Ant Colony Optimization with pheromone trails and heuristic guidance",
                "parameters": ["activity_key", "ant_count", "iterations"],
                "returns": ["nodes", "edges", "final_fitness"],
                "better_for": "Combinatorial optimization with positive feedback loops"
            },
            {
                "name": "discover_simulated_annealing",
                "description": "Temperature-based search accepting worse solutions probabilistically",
                "parameters": ["activity_key", "initial_temp", "cooling_rate", "iterations"],
                "returns": ["nodes", "edges", "final_fitness"],
                "better_for": "Escaping local optima in rugged fitness landscapes"
            }
        ]
    })
    .to_string()
}
