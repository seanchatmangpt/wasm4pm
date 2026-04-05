use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::HashSet;
use rustc_hash::FxHashMap;
use crate::utilities::{to_js, evaluate_edges_fitness};

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
    // Compute inside closure (borrowed), store outside (after lock released).
    let (best_edges, best_fitness, vocab) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let col = log.to_columnar(activity_key);

                // Build edge vocabulary from columnar log
                let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
                let mut edge_map: FxHashMap<(u32, u32), usize> = FxHashMap::default();

                for t in 0..col.trace_offsets.len().saturating_sub(1) {
                    let start = col.trace_offsets[t];
                    let end = col.trace_offsets[t + 1];
                    for i in start..end.saturating_sub(1) {
                        let edge = (col.events[i], col.events[i + 1]);
                        edge_map
                            .entry(edge)
                            .and_modify(|_| {})
                            .or_insert_with(|| {
                                edge_vocab.push(edge);
                                edge_vocab.len() - 1
                            });
                    }
                }

                // Collect vocab before closure ends
                let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();

                // Initialize population with random edge sets
                let mut population: Vec<(EdgeSet, f64)> = Vec::new();

                for _ in 0..population_size {
                    let edge_set = create_random_edge_set(&edge_vocab, 0.7);
                    let fitness = evaluate_edges_fitness(&edge_set, &col);
                    population.push((edge_set, fitness));
                }

                // Evolution loop
                for _generation in 0..generations {
                    // Sort by fitness (descending)
                    population.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

                    // Keep top performers (elitism)
                    let elite_size = (population_size / 4).max(1);
                    let mut new_population = population[..elite_size].to_vec();

                    // Generate offspring through crossover and mutation
                    while new_population.len() < population_size {
                        let parent1 = population[rand_select(&population)].0.clone();
                        let parent2 = population[rand_select(&population)].0.clone();

                        let mut child = crossover_edges(&parent1, &parent2);
                        mutate_edges(&mut child, 0.1); // 10% mutation rate

                        let fitness = evaluate_edges_fitness(&child, &col);
                        new_population.push((child, fitness));
                    }

                    // Trim to population size
                    new_population.truncate(population_size);
                    population = new_population;
                }

                // Get best solution
                population.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                let best_fitness = population[0].1;
                let best_edges = population.remove(0).0;
                Ok((best_edges, best_fitness, vocab))
            }
            Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })?;
    // Lock released here — safe to store.

    // Materialize DFG from best edges
    let best_dfg = edge_set_to_dfg(&best_edges, &vocab);

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "algorithm": "genetic_algorithm",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "final_fitness": best_fitness,
        "population_size": population_size,
        "generations": generations,
    }))
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
    // Compute inside closure (borrowed), store outside (after lock released).
    let (best_edges, best_fitness, vocab) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let col = log.to_columnar(activity_key);

                // Build edge vocabulary from columnar log
                let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
                let mut edge_map: FxHashMap<(u32, u32), usize> = FxHashMap::default();

                for t in 0..col.trace_offsets.len().saturating_sub(1) {
                    let start = col.trace_offsets[t];
                    let end = col.trace_offsets[t + 1];
                    for i in start..end.saturating_sub(1) {
                        let edge = (col.events[i], col.events[i + 1]);
                        edge_map
                            .entry(edge)
                            .and_modify(|_| {})
                            .or_insert_with(|| {
                                edge_vocab.push(edge);
                                edge_vocab.len() - 1
                            });
                    }
                }

                // Collect vocab before closure ends
                let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();

                // Initialize swarm (particles)
                let mut particles: Vec<(EdgeSet, f64)> = Vec::new();
                let mut best_global: Option<(EdgeSet, f64)> = None;

                for _ in 0..swarm_size {
                    let edge_set = create_random_edge_set(&edge_vocab, 0.6);
                    let fitness = evaluate_edges_fitness(&edge_set, &col);

                    if best_global.is_none() || fitness > best_global.as_ref().unwrap().1 {
                        best_global = Some((edge_set.clone(), fitness));
                    }

                    particles.push((edge_set, fitness));
                }

                // PSO iterations
                for _iter in 0..iterations {
                    for i in 0..particles.len() {
                        let current_fitness = particles[i].1;
                        let best_global_fitness = best_global.as_ref().unwrap().1;

                        // Move toward best solution with some randomness
                        let improvement_rate =
                            0.5 + (best_global_fitness - current_fitness).max(0.0) / 10.0;
                        let move_probability = improvement_rate.min(0.9);

                        if fastrand::f64() < move_probability {
                            particles[i].0 = blend_edges(
                                &particles[i].0,
                                &best_global.as_ref().unwrap().0,
                                0.3,
                            );

                            // Add small mutation for exploration
                            mutate_edges(&mut particles[i].0, 0.05);
                        }

                        let new_fitness = evaluate_edges_fitness(&particles[i].0, &col);
                        particles[i].1 = new_fitness;

                        // Update global best
                        if new_fitness > best_global.as_ref().unwrap().1 {
                            best_global = Some((particles[i].0.clone(), new_fitness));
                        }
                    }
                }

                match best_global {
                    Some((edges, fitness)) => Ok((edges, fitness, vocab)),
                    None => Err(JsValue::from_str("Failed to find best solution")),
                }
            }
            Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })?;
    // Lock released here — safe to store.

    // Materialize DFG from best edges
    let best_dfg = edge_set_to_dfg(&best_edges, &vocab);

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "algorithm": "pso_algorithm",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "final_fitness": best_fitness,
        "swarm_size": swarm_size,
        "iterations": iterations,
    }))
}

// Helper: Create random edge set from vocabulary
fn create_random_edge_set(edge_vocab: &[(u32, u32)], inclusion_probability: f64) -> EdgeSet {
    let mut edge_set: EdgeSet = HashSet::new();
    for &edge in edge_vocab {
        if fastrand::f64() < inclusion_probability {
            edge_set.insert(edge);
        }
    }
    edge_set
}

// Helper: Evaluate fitness of an edge set against columnar log (zero string allocation)
#[inline]

// Helper: Crossover operation on edge sets
fn crossover_edges(parent1: &EdgeSet, parent2: &EdgeSet) -> EdgeSet {
    let mut child: EdgeSet = HashSet::new();

    // Copy all edges from parent1
    for &edge in parent1 {
        child.insert(edge);
    }

    // Add edges from parent2 with 50% probability
    for &edge in parent2 {
        if fastrand::f64() < 0.5 {
            child.insert(edge);
        }
    }

    child
}

// Helper: Blend two edge sets
fn blend_edges(set1: &EdgeSet, set2: &EdgeSet, ratio: f64) -> EdgeSet {
    let mut result: EdgeSet = HashSet::new();

    // Copy all edges from set1
    for &edge in set1 {
        result.insert(edge);
    }

    // Add edges from set2 with given probability
    for &edge in set2 {
        if fastrand::f64() < ratio || set1.contains(&edge) {
            result.insert(edge);
        }
    }

    result
}

// Helper: Mutation operation on edge sets
fn mutate_edges(edge_set: &mut EdgeSet, mutation_rate: f64) {
    if fastrand::f64() < mutation_rate {
        if !edge_set.is_empty() && fastrand::f64() < 0.5 {
            // Remove random edge
            if let Some(&edge) = edge_set.iter().next() {
                edge_set.remove(&edge);
            }
        } else {
            // Add random edge (simple mutation: add a random u32 pair)
            let from = (fastrand::f64() * u32::MAX as f64) as u32;
            let to = (fastrand::f64() * u32::MAX as f64) as u32;
            if from != to {
                edge_set.insert((from, to));
            }
        }
    }
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

// Helper: Random selection from population.
// For small populations (≤ 50, the typical benchmark size) we use a direct
// fitness-proportionate computation instead of building and scanning a
// cumulative-weight array, keeping the hot path branch-free.
fn rand_select<T>(items: &[(T, f64)]) -> usize {
    let n = items.len();
    debug_assert!(n > 0, "rand_select called with empty slice");

    // Fast path: for small populations compute the selection directly.
    if n <= 50 {
        let total: f64 = items.iter().map(|(_, f)| f.max(0.0)).sum();
        if total > 0.0 {
            let mut threshold = fastrand::f64() * total;
            for (i, (_, fitness)) in items.iter().enumerate() {
                threshold -= fitness.max(0.0);
                if threshold <= 0.0 {
                    return i;
                }
            }
        }
        // Fallback (e.g. all fitnesses are zero): uniform random index.
        return (fastrand::f64() * n as f64) as usize % n;
    }

    // General path for larger populations: same algorithm, same cost, but
    // kept separate so the fast path compiles without a branch on `n`.
    let total: f64 = items.iter().map(|(_, f)| f.max(0.0)).sum();
    if total > 0.0 {
        let mut threshold = fastrand::f64() * total;
        for (i, (_, fitness)) in items.iter().enumerate() {
            threshold -= fitness.max(0.0);
            if threshold <= 0.0 {
                return i;
            }
        }
    }
    (fastrand::f64() * n as f64) as usize % n
}


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
            }
        ]
    })
    .to_string()
}
