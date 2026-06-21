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

/// Discover a process model using a Genetic Algorithm.
///
/// Evolves a population of edge sets (DFG edge subsets) over multiple generations,
/// selecting for high fitness (coverage of log traces). Uses a fixed random seed (42)
/// for deterministic output.
///
/// # Parameters
/// * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
/// * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
/// * `population_size` — Number of candidate models per generation (e.g. `50`–`200`).
/// * `generations` — Number of evolution cycles (e.g. `50`–`200`; more = higher quality but slower).
///
/// # Returns
/// `Result<JsValue, JsValue>` — On success:
/// ```json
/// { "handle": "...", "algorithm": "genetic_algorithm", "nodes": 8, "edges": 12, "final_fitness": 0.87 }
/// ```
/// Returns `Err("no_edges")` if the log has no directly-follows edges (e.g. all single-activity traces).
///
/// # Note
/// Deterministic: seed 42 is hardcoded. Same log + same parameters → same output.
/// For high-quality models, use `population_size=100, generations=100`.
/// For faster results at lower quality, reduce both to `50`.
#[wasm_bindgen]
pub fn discover_genetic_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    population_size: usize,
    generations: usize,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.genetic_algorithm",
        algorithm = "genetic_algorithm",
        activity_key = activity_key,
        population_size = population_size,
        generations = generations,
        "Genetic Algorithm discovery started"
    );

    let (best_dfg, best_fitness) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                tracing::info!(
                    target: "wasm4pm.discovery.genetic_algorithm",
                    checkpoint = "feature_extraction",
                    log_size = log.traces.len(),
                    activity_count = log.get_activities(activity_key).len(),
                    "Log loaded and analyzed"
                );
                discover_genetic_algorithm_from_log(log, activity_key, population_size, generations)
                    .ok_or_else(|| crate::error::js_val("no_edges"))
            }
            Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let node_count = best_dfg.nodes.len();
    let edge_count = best_dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.genetic_algorithm",
        checkpoint = "result_generation",
        node_count = node_count,
        edge_count = edge_count,
        fitness = best_fitness,
        "DFG model evolved"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "genetic_algorithm",
        "nodes": node_count,
        "edges": edge_count,
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
) -> Option<(DFG, f64)> {
    // Parameter validation: prevent panics on index access at line 108
    if population_size < 2 {
        return None; // population_size must be >= 2 for genetic algorithm
    }
    if generations == 0 {
        return None; // at least 1 generation required
    }

    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
    let mut edge_freq: FxHashMap<(u32, u32), f64> = FxHashMap::default();
    let mut node_freq: FxHashMap<u32, usize> = FxHashMap::default();
    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end {
            *node_freq.entry(col.events[i]).or_insert(0) += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                let cnt = edge_freq.entry(edge).or_insert(0.0);
                if *cnt == 0.0 {
                    edge_vocab.push(edge);
                }
                *cnt += 1.0;
            }
        }
    }
    if edge_vocab.is_empty() {
        return None;
    }
    let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();
    let vocab_len = edge_vocab.len();
    let mut rng = StdRng::seed_from_u64(42);

    let mut population: Vec<(EdgeSet, f64)> = (0..population_size)
        .map(|_| {
            let es = create_random_edge_set_seeded(&edge_vocab, 0.7, &mut rng);
            let f = evaluate_edges_fitness(&es, &col, vocab_len);
            (es, f)
        })
        .collect();

    for _ in 0..generations {
        population.sort_by(|a, b| b.1.total_cmp(&a.1));
        let elite_size = (population_size / 4).max(1);
        let mut next = population[..elite_size].to_vec();
        while next.len() < population_size {
            let p1 = population[rand_select_seeded(&population, &mut rng)]
                .0
                .clone();
            let p2 = population[rand_select_seeded(&population, &mut rng)]
                .0
                .clone();
            let mut child = crossover_edges_seeded(&p1, &p2, &mut rng);
            mutate_edges_seeded(&mut child, 0.1, &edge_vocab, &mut rng);
            let f = evaluate_edges_fitness(&child, &col, vocab_len);
            next.push((child, f));
        }
        next.truncate(population_size);
        population = next;
    }

    population.sort_by(|a, b| b.1.total_cmp(&a.1));
    let best_fitness = population[0].1;
    let best_edges = population.remove(0).0;
    Some((
        edge_set_to_dfg(&best_edges, &vocab, &edge_freq, &node_freq),
        best_fitness,
    ))
}

/// Discover a process model using Particle Swarm Optimization (PSO).
///
/// Uses swarm intelligence to explore DFG edge subsets. Underlying function returns
/// `Option<(DFG, f64)>` — returns `Err("no_edges")` to JS when:
/// - `swarm_size < 1`
/// - `iterations == 0`
/// - log has no directly-follows edges (e.g. all single-activity traces)
///
/// On success returns `{handle, algorithm, nodes, edges, final_fitness}`.
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
        .store_object(StoredObject::DFG(best_dfg.clone()))
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
) -> Option<(DFG, f64)> {
    // Parameter validation: prevent empty swarm or zero iterations
    if swarm_size < 1 {
        return None; // swarm_size must be >= 1
    }
    if iterations == 0 {
        return None; // at least 1 iteration required
    }

    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
    let mut edge_freq: FxHashMap<(u32, u32), f64> = FxHashMap::default();
    let mut node_freq: FxHashMap<u32, usize> = FxHashMap::default();
    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end {
            *node_freq.entry(col.events[i]).or_insert(0) += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                let cnt = edge_freq.entry(edge).or_insert(0.0);
                if *cnt == 0.0 {
                    edge_vocab.push(edge);
                }
                *cnt += 1.0;
            }
        }
    }
    if edge_vocab.is_empty() {
        return None;
    }
    let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();
    let vocab_len = edge_vocab.len();
    let mut rng = StdRng::seed_from_u64(42);

    // Particle layout: (current_position, current_fitness, pbest_position, pbest_fitness).
    // Initial pBest is the spawn position (NOT empty) so that the first pBest blend
    // produces a meaningful pull instead of a no-op self-blend.
    let mut particles: Vec<(EdgeSet, f64, EdgeSet, f64)> = Vec::new();
    let mut best_global: Option<(EdgeSet, f64)> = None;

    for _ in 0..swarm_size {
        let edge_set = create_random_edge_set_seeded(&edge_vocab, 0.6, &mut rng);
        let fitness = evaluate_edges_fitness(&edge_set, &col, vocab_len);
        if best_global.is_none() || fitness > best_global.as_ref().unwrap().1 {
            best_global = Some((edge_set.clone(), fitness));
        }
        particles.push((edge_set.clone(), fitness, edge_set, fitness));
    }

    for _ in 0..iterations {
        for (edge_set, current_fitness, pbest, pbest_fitness) in particles.iter_mut() {
            let toward_pbest = blend_edges_seeded(edge_set, pbest, 0.2, &mut rng);
            let toward_global = blend_edges_seeded(
                &toward_pbest,
                &best_global.as_ref().unwrap().0,
                0.3,
                &mut rng,
            );
            *edge_set = toward_global;
            mutate_edges_seeded(edge_set, 0.05, &edge_vocab, &mut rng);
            let new_fitness = evaluate_edges_fitness(edge_set, &col, vocab_len);
            *current_fitness = new_fitness;
            // CRITICAL: update pbest position when fitness improves. Prior bug
            // only assigned pbest_fitness, leaving pbest at its initial value
            // (or empty), so the pBest pull either pulled toward an empty set
            // or never reflected discovered improvements.
            if new_fitness > *pbest_fitness {
                *pbest_fitness = new_fitness;
                *pbest = edge_set.clone();
            }
            if new_fitness > best_global.as_ref().unwrap().1 {
                best_global = Some((edge_set.clone(), new_fitness));
            }
        }
    }
    let (edges, fitness) = best_global?;
    Some((
        edge_set_to_dfg(&edges, &vocab, &edge_freq, &node_freq),
        fitness,
    ))
}

// Helper: Materialize a DFG from edge set, vocabulary, and frequency maps.
// Uses actual observed frequencies to accurately reflect event density.
fn edge_set_to_dfg(
    edge_set: &EdgeSet,
    vocab: &[String],
    edge_freq: &FxHashMap<(u32, u32), f64>,
    node_freq: &FxHashMap<u32, usize>,
) -> DFG {
    let mut dfg = DFG::new();

    for (idx, activity) in vocab.iter().enumerate() {
        dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: node_freq.get(&(idx as u32)).copied().unwrap_or(0),
        });
    }

    // Sort for deterministic edge order independent of HashSet RandomState.
    let mut sorted_edges: Vec<(u32, u32)> = edge_set.iter().copied().collect();
    sorted_edges.sort_unstable();

    for (from_id, to_id) in sorted_edges {
        let from_idx = from_id as usize;
        let to_idx = to_id as usize;
        if from_idx < vocab.len() && to_idx < vocab.len() {
            let freq = edge_freq.get(&(from_id, to_id)).copied().unwrap_or(1.0) as usize;
            dfg.edges.push(DirectlyFollowsRelation {
                from: vocab[from_idx].clone(),
                to: vocab[to_idx].clone(),
                frequency: freq,
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

    // Sort before iterating: HashSet iteration order is non-deterministic due to hash
    // randomization. Sorting ensures RNG calls are consumed in the same order every run,
    // keeping the RNG state deterministic across WASM invocations.
    let mut p1_edges: Vec<(u32, u32)> = parent1.iter().copied().collect();
    p1_edges.sort_unstable();
    for edge in p1_edges {
        if rng.gen::<f64>() < 0.5 {
            child.insert(edge);
        }
    }

    let mut p2_edges: Vec<(u32, u32)> = parent2.iter().copied().collect();
    p2_edges.sort_unstable();
    for edge in p2_edges {
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
            // Sort for deterministic selection independent of HashSet RandomState.
            let mut edges_sorted: Vec<(u32, u32)> = edge_set.iter().copied().collect();
            edges_sorted.sort_unstable();
            let pick = (rng.gen::<f64>() * edges_sorted.len() as f64) as usize;
            edge_set.remove(&edges_sorted[pick]);
        } else if !edge_vocab.is_empty() {
            let idx = (rng.gen::<f64>() * edge_vocab.len() as f64) as usize;
            edge_set.insert(edge_vocab[idx]);
        }
    }
}

fn blend_edges_seeded(set1: &EdgeSet, set2: &EdgeSet, ratio: f64, rng: &mut StdRng) -> EdgeSet {
    let mut result: EdgeSet = HashSet::new();

    // Sort before iterating: HashSet iteration order is non-deterministic due to hash
    // randomization. Sorting ensures RNG calls are consumed in the same order every run.
    // Keep edges from set1 with probability (1 - ratio)
    let mut s1_edges: Vec<(u32, u32)> = set1.iter().copied().collect();
    s1_edges.sort_unstable();
    for edge in s1_edges {
        if rng.gen::<f64>() > ratio {
            result.insert(edge);
        }
    }

    // Add edges from set2 with probability ratio
    let mut s2_edges: Vec<(u32, u32)> = set2.iter().copied().collect();
    s2_edges.sort_unstable();
    for edge in s2_edges {
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

/// Pure-Rust ACO discovery: takes EventLog directly, returns (DFG, final_fitness).
/// Seed=42 for determinism. Testable without wasm-bindgen runtime.
pub fn discover_aco_algorithm_from_log(
    log: &EventLog,
    activity_key: &str,
    ant_count: usize,
    iterations: usize,
) -> Option<(DFG, f64)> {
    // Parameter validation: prevent empty ant colony or zero iterations
    if ant_count < 1 {
        return None; // ant_count must be >= 1
    }
    if iterations == 0 {
        return None; // at least 1 iteration required
    }

    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
    let mut edge_freq: FxHashMap<(u32, u32), f64> = FxHashMap::default();
    let mut node_freq: FxHashMap<u32, usize> = FxHashMap::default();

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end {
            *node_freq.entry(col.events[i]).or_insert(0) += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                let cnt = edge_freq.entry(edge).or_insert(0.0);
                if *cnt == 0.0 {
                    edge_vocab.push(edge);
                }
                *cnt += 1.0;
            }
        }
    }

    if edge_vocab.is_empty() {
        return None;
    }

    let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();
    let vocab_len = edge_vocab.len();
    let total_edges = edge_freq.values().sum::<f64>().max(1.0);
    let heuristic: FxHashMap<(u32, u32), f64> = edge_freq
        .iter()
        .map(|(e, &f)| (*e, f / total_edges))
        .collect();

    let mut pheromone: FxHashMap<(u32, u32), f64> = FxHashMap::default();
    let tau_0 = 1.0 / edge_vocab.len().max(1) as f64;
    for &edge in &edge_vocab {
        pheromone.insert(edge, tau_0);
    }

    let alpha = 1.0;
    let beta = 2.0;
    let evaporation_rate = 0.1;
    let q = 100.0;
    let mut rng = StdRng::seed_from_u64(42);
    let mut best_solution: Option<(EdgeSet, f64)> = None;

    // Fix (PR #54 SPC NaN class + classical MMAS bounds): pheromone is bounded into
    // [tau_min, tau_max] each iteration. Without bounds, repeated deposits q*fitness
    // grow tau unboundedly while evaporation only multiplies by (1 - rho); after a
    // few hundred iterations tau can exceed `prob.min(0.99)` for every edge, and
    // every ant deterministically picks every edge regardless of heuristic eta.
    // The .min(0.99) probability cap is preserved as a separate safety net.
    let tau_max: f64 = 10.0;
    let tau_min: f64 = tau_0 * 0.01_f64.max(1e-6);

    for _iter in 0..iterations {
        let mut iteration_solutions: Vec<(EdgeSet, f64)> = Vec::new();

        for _ant in 0..ant_count {
            let mut ant_edges: EdgeSet = HashSet::new();
            for &edge in &edge_vocab {
                let tau = pheromone.get(&edge).copied().unwrap_or(tau_0);
                let eta = heuristic.get(&edge).copied().unwrap_or(0.01);
                let prob = tau.powf(alpha) * eta.powf(beta);
                // Fix (PR #54 SPC NaN class): `tau.powf(alpha)` or `eta.powf(beta)` can
                // yield NaN if a deposit ever introduced NaN via NaN fitness; sanitize
                // before sampling.
                let prob = if prob.is_finite() { prob } else { 0.0 };
                if rng.gen::<f64>() < prob.min(0.99) {
                    ant_edges.insert(edge);
                }
            }
            let fitness_raw = evaluate_edges_fitness(&ant_edges, &col, vocab_len);
            // Fix (PR #54 SPC NaN class): if fitness is NaN/Inf, treat as 0.0 so that
            // (a) it cannot become the new best by virtue of `NaN > x` returning false
            //     and `partial_cmp` reordering, and (b) it cannot poison the pheromone
            //     map below.
            let fitness = if fitness_raw.is_finite() {
                fitness_raw
            } else {
                0.0
            };
            if best_solution.is_none() || fitness > best_solution.as_ref().unwrap().1 {
                best_solution = Some((ant_edges.clone(), fitness));
            }
            iteration_solutions.push((ant_edges, fitness));
        }

        for val in pheromone.values_mut() {
            *val *= 1.0 - evaporation_rate;
        }
        for (edges, fitness) in &iteration_solutions {
            let deposit = q * fitness;
            for &edge in edges {
                *pheromone.entry(edge).or_insert(tau_0) += deposit;
            }
        }
        if let Some((best_edges, best_fit)) = iteration_solutions
            .iter()
            .max_by(|a, b| a.1.total_cmp(&b.1))
        {
            let deposit = q * best_fit * 2.0;
            for &edge in best_edges {
                *pheromone.entry(edge).or_insert(tau_0) += deposit;
            }
        }
        // Clamp pheromone into MMAS bounds after deposit+evaporation. Without this,
        // tau grows monotonically with each successful iteration.
        for val in pheromone.values_mut() {
            *val = val.clamp(tau_min, tau_max);
        }
    }

    best_solution.map(|(edges, fitness)| {
        (
            edge_set_to_dfg(&edges, &vocab, &edge_freq, &node_freq),
            fitness,
        )
    })
}

/// Discover a process model using Ant Colony Optimization (ACO).
///
/// Uses pheromone trails and frequency heuristics to construct DFG edge sets.
/// Underlying function returns `Option<(DFG, f64)>` — returns `Err("no_edges")` to JS when:
/// - `ant_count < 1`
/// - `iterations == 0`
/// - log has no directly-follows edges (e.g. all single-activity traces)
///
/// On success returns `{handle, algorithm, nodes, edges, final_fitness}`.
/// Pheromone is bounded (MMAS-style) to prevent NaN from unbounded deposit accumulation.
#[wasm_bindgen]
pub fn discover_aco_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    ant_count: usize,
    iterations: usize,
) -> Result<JsValue, JsValue> {
    let (best_dfg, best_fitness) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                discover_aco_algorithm_from_log(log, activity_key, ant_count, iterations)
                    .ok_or_else(|| crate::error::js_val("no_edges"))
            }
            Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(best_dfg.clone()))
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
