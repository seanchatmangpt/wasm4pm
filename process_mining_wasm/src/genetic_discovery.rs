use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};

/// Genetic Algorithm for process model discovery
/// Evolves a population of DFGs to find models that fit the log well
#[wasm_bindgen]
pub fn discover_genetic_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    population_size: usize,
    generations: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows = log.get_directly_follows(activity_key);

            // Initialize population with random DFGs
            let mut population: Vec<(DirectlyFollowsGraph, f64)> = Vec::new();

            // Create initial population
            for _ in 0..population_size {
                let dfg = create_random_dfg(&activities, &directly_follows, 0.7);
                let fitness = evaluate_fitness(&dfg, &log, activity_key);
                population.push((dfg, fitness));
            }

            // Evolution loop
            for _generation in 0..generations {
                // Sort by fitness (descending)
                population.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

                // Keep top performers (elitism)
                let elite_size = (population_size / 4).max(1);
                let mut new_population = population[..elite_size].to_vec();

                // Generate offspring through crossover and mutation
                while new_population.len() < population_size {
                    let parent1 = &population[rand_select(&population)].0;
                    let parent2 = &population[rand_select(&population)].0;

                    let mut child = crossover(parent1, parent2);
                    mutate(&mut child, 0.1); // 10% mutation rate

                    let fitness = evaluate_fitness(&child, &log, activity_key);
                    new_population.push((child, fitness));
                }

                // Trim to population size
                new_population.truncate(population_size);
                population = new_population;
            }

            // Get best solution
            population.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
            let best_dfg = &population[0].0;
            let best_fitness = population[0].1;

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "genetic_algorithm",
                "nodes": best_dfg.nodes.len(),
                "edges": best_dfg.edges.len(),
                "final_fitness": best_fitness,
                "population_size": population_size,
                "generations": generations,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Particle Swarm Optimization for process discovery
/// Uses swarm intelligence to explore the model space
#[wasm_bindgen]
pub fn discover_pso_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    swarm_size: usize,
    iterations: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows = log.get_directly_follows(activity_key);

            // Initialize swarm (particles)
            let mut particles: Vec<(DirectlyFollowsGraph, f64)> = Vec::new();
            let mut best_global: Option<(DirectlyFollowsGraph, f64)> = None;

            for _ in 0..swarm_size {
                let dfg = create_random_dfg(&activities, &directly_follows, 0.6);
                let fitness = evaluate_fitness(&dfg, &log, activity_key);

                if best_global.is_none() || fitness > best_global.as_ref().unwrap().1 {
                    best_global = Some((dfg.clone(), fitness));
                }

                particles.push((dfg, fitness));
            }

            // PSO iterations
            for _iter in 0..iterations {
                for i in 0..particles.len() {
                    let current_fitness = particles[i].1;
                    let best_global_fitness = best_global.as_ref().unwrap().1;

                    // Move toward best solution with some randomness
                    let improvement_rate = 0.5 + (best_global_fitness - current_fitness).max(0.0) / 10.0;
                    let move_probability = improvement_rate.min(0.9);

                    if random_float() < move_probability {
                        particles[i].0 = blend_dfgs(
                            &particles[i].0,
                            &best_global.as_ref().unwrap().0,
                            0.3,
                        );

                        // Add small mutation for exploration
                        mutate(&mut particles[i].0, 0.05);
                    }

                    let new_fitness = evaluate_fitness(&particles[i].0, &log, activity_key);
                    particles[i].1 = new_fitness;

                    // Update global best
                    if new_fitness > best_global.as_ref().unwrap().1 {
                        best_global = Some((particles[i].0.clone(), new_fitness));
                    }
                }
            }

            let best_dfg = &best_global.unwrap().0;
            let best_fitness = best_global.unwrap().1;

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "pso_algorithm",
                "nodes": best_dfg.nodes.len(),
                "edges": best_dfg.edges.len(),
                "final_fitness": best_fitness,
                "swarm_size": swarm_size,
                "iterations": iterations,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

// Helper: Create random DFG structure
fn create_random_dfg(
    activities: &[String],
    directly_follows: &HashSet<(String, String)>,
    inclusion_probability: f64,
) -> DirectlyFollowsGraph {
    let mut dfg = DirectlyFollowsGraph::new();

    // Add all activities as nodes
    let mut activity_frequencies: HashMap<String, usize> = HashMap::new();
    for activity in activities {
        activity_frequencies.insert(activity.clone(), 1);
        dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: 1,
        });
    }

    // Add edges based on directly-follows with probability
    for (from, to) in directly_follows {
        if random_float() < inclusion_probability {
            dfg.edges.push(DirectlyFollowsRelation {
                from: from.clone(),
                to: to.clone(),
                frequency: 1,
            });
        }
    }

    dfg
}

// Helper: Evaluate fitness of a DFG against the event log
fn evaluate_fitness(dfg: &DirectlyFollowsGraph, log: &EventLog, activity_key: &str) -> f64 {
    let mut fitting_traces = 0.0;
    let edge_set: HashSet<(String, String)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();

    for trace in &log.traces {
        let mut trace_fits = true;
        for i in 0..trace.events.len() - 1 {
            if let (
                Some(AttributeValue::String(act1)),
                Some(AttributeValue::String(act2)),
            ) = (
                trace.events[i].attributes.get(activity_key),
                trace.events[i + 1].attributes.get(activity_key),
            ) {
                if !edge_set.contains(&(act1.clone(), act2.clone())) {
                    trace_fits = false;
                    break;
                }
            }
        }
        if trace_fits {
            fitting_traces += 1.0;
        }
    }

    // Fitness = balance of fit and simplicity
    let fit_ratio = fitting_traces / log.traces.len().max(1) as f64;
    let complexity_penalty = 1.0 / (1.0 + (dfg.edges.len() as f64 / 20.0));

    fit_ratio * 0.8 + complexity_penalty * 0.2
}

// Helper: Crossover operation
fn crossover(parent1: &DirectlyFollowsGraph, parent2: &DirectlyFollowsGraph) -> DirectlyFollowsGraph {
    let mut child = DirectlyFollowsGraph::new();

    // Copy all nodes from parent1
    child.nodes = parent1.nodes.clone();

    // Combine edges from both parents
    let mut edge_set: HashSet<(String, String)> = HashSet::new();
    for edge in &parent1.edges {
        edge_set.insert((edge.from.clone(), edge.to.clone()));
    }
    for edge in &parent2.edges {
        if random_float() < 0.5 {
            edge_set.insert((edge.from.clone(), edge.to.clone()));
        }
    }

    // Build edges from set
    for (from, to) in edge_set {
        child.edges.push(DirectlyFollowsRelation {
            from,
            to,
            frequency: 1,
        });
    }

    child.start_activities = parent1.start_activities.clone();
    child.end_activities = parent1.end_activities.clone();

    child
}

// Helper: Blend two DFGs
fn blend_dfgs(dfg1: &DirectlyFollowsGraph, dfg2: &DirectlyFollowsGraph, ratio: f64) -> DirectlyFollowsGraph {
    let mut result = DirectlyFollowsGraph::new();
    result.nodes = dfg1.nodes.clone();

    let set1: HashSet<(String, String)> = dfg1
        .edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();

    for edge in &dfg2.edges {
        let key = (edge.from.clone(), edge.to.clone());
        if random_float() < ratio || set1.contains(&key) {
            if !result.edges.iter().any(|e| e.from == edge.from && e.to == edge.to) {
                result.edges.push(edge.clone());
            }
        }
    }

    result
}

// Helper: Mutation operation
fn mutate(dfg: &mut DirectlyFollowsGraph, mutation_rate: f64) {
    if random_float() < mutation_rate {
        if !dfg.edges.is_empty() && random_float() < 0.5 {
            // Remove random edge
            let idx = (random_float() * dfg.edges.len() as f64) as usize;
            if idx < dfg.edges.len() {
                dfg.edges.remove(idx);
            }
        } else if !dfg.nodes.len() < 2 {
            // Add random edge between nodes
            let from_idx = (random_float() * dfg.nodes.len() as f64) as usize;
            let to_idx = (random_float() * dfg.nodes.len() as f64) as usize;
            if from_idx != to_idx && from_idx < dfg.nodes.len() && to_idx < dfg.nodes.len() {
                let from = dfg.nodes[from_idx].id.clone();
                let to = dfg.nodes[to_idx].id.clone();
                if !dfg.edges.iter().any(|e| e.from == from && e.to == to) {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from,
                        to,
                        frequency: 1,
                    });
                }
            }
        }
    }
}

// Helper: Random selection from population
fn rand_select<T>(_items: &[(T, f64)]) -> usize {
    ((random_float() * _items.len() as f64) as usize).min(_items.len() - 1)
}

// Helper: Random float between 0 and 1
fn random_float() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let nanos = duration.subsec_nanos() as f64;
    (nanos % 1000000.0) / 1000000.0
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
