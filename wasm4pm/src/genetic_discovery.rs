use crate::discovery_determinism_guards::create_deterministic_rng;
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{evaluate_edges_fitness, to_js_str};
use rand::rngs::StdRng;
use rand::Rng;
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use wasm_bindgen::prelude::*;

type EdgeSet = BTreeSet<(u32, u32)>;

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

    let (best_dfg, best_fitness) = get_or_init_state().with_event_log(eventlog_handle, |log| {
        tracing::info!(
            target: "wasm4pm.discovery.genetic_algorithm",
            checkpoint = "feature_extraction",
            log_size = log.traces.len(),
            activity_count = log.get_activities(activity_key).len(),
            "Log loaded and analyzed"
        );
        discover_genetic_algorithm_from_log(log, activity_key, population_size, generations)
            .ok_or_else(|| crate::error::js_val("no_edges"))
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
            *node_freq.entry(col.events[i]).or_default() += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                let cnt = edge_freq.entry(edge).or_default();
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
    let mut rng = create_deterministic_rng();

    let mut population: Vec<(EdgeSet, f64)> = (0..population_size)
        .map(|_| {
            let es = create_random_edge_set_seeded(&edge_vocab, 0.7, &mut rng);
            let f = evaluate_edges_fitness(&es, &col, vocab_len);
            (es, f)
        })
        .collect();

    for _ in 0..generations {
        population.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));
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

    population.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));
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
    let (best_dfg, best_fitness) = get_or_init_state().with_event_log(eventlog_handle, |log| {
        discover_pso_algorithm_from_log(log, activity_key, swarm_size, iterations)
            .ok_or_else(|| crate::error::js_val("no_edges"))
    })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "pso_canonical",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "final_fitness": best_fitness,
        "swarm_size": swarm_size,
        "iterations": iterations,
    }))
}

/// Pure-Rust PSO discovery: takes EventLog directly, returns (DFG, final_fitness).
/// Testable without wasm-bindgen runtime — same logic as discover_pso_algorithm.
///
/// Canonical PSO over a continuous relaxation of the edge-subset problem:
/// - particle position `x ∈ [0,1]^|E|`, one dimension per candidate edge
/// - velocity `v` with canonical update
///   `v = w·v + c1·r1·(pbest − x) + c2·r2·(gbest − x)`
/// - inertia `w` decays linearly 0.9 → 0.4 over the run, `c1 = c2 = 2.0`,
///   velocity clamped to `[−vmax, vmax]` with `vmax = 2.0`
/// - decode: edge `i` is included iff `x_i > 0.5`
///
/// Deterministic via `create_deterministic_rng` (seed 42).
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
            *node_freq.entry(col.events[i]).or_default() += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                let cnt = edge_freq.entry(edge).or_default();
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
    let mut rng = create_deterministic_rng();

    // --- Canonical PSO over a continuous relaxation of the edge-subset problem ---
    // One dimension per candidate edge; position in [0,1], decoded to a binary
    // edge set with a 0.5 threshold.
    const W_START: f64 = 0.9;
    const W_END: f64 = 0.4;
    const C1: f64 = 2.0;
    const C2: f64 = 2.0;
    const V_MAX: f64 = 2.0;

    let dim = vocab_len;
    let mut positions: Vec<Vec<f64>> = Vec::with_capacity(swarm_size);
    let mut velocities: Vec<Vec<f64>> = Vec::with_capacity(swarm_size);
    let mut pbest_pos: Vec<Vec<f64>> = Vec::with_capacity(swarm_size);
    let mut pbest_fit: Vec<f64> = Vec::with_capacity(swarm_size);
    let mut gbest_pos: Vec<f64> = Vec::new();
    let mut gbest_fit = f64::NEG_INFINITY;

    for _ in 0..swarm_size {
        let x: Vec<f64> = (0..dim).map(|_| rng.gen::<f64>()).collect();
        // Small initial velocities so the swarm starts near steepest-descent-free.
        let v: Vec<f64> = (0..dim).map(|_| (rng.gen::<f64>() - 0.5) * 0.2).collect();
        let f = pso_fitness(&x, &edge_vocab, &col, vocab_len);
        if f > gbest_fit {
            gbest_fit = f;
            gbest_pos = x.clone();
        }
        positions.push(x.clone());
        velocities.push(v);
        pbest_pos.push(x);
        pbest_fit.push(f);
    }

    for iter in 0..iterations {
        // Linear inertia decay over the full run.
        let t = if iterations <= 1 {
            0.0
        } else {
            iter as f64 / (iterations - 1) as f64
        };
        let w = W_START - (W_START - W_END) * t;

        for p in 0..swarm_size {
            let (x_new, v_new): (Vec<f64>, Vec<f64>) = {
                let x = &positions[p];
                let v = &velocities[p];
                let pb = &pbest_pos[p];
                let gb = &gbest_pos;
                x.iter()
                    .zip(v.iter())
                    .zip(pb.iter())
                    .zip(gb.iter())
                    .map(|(((&xi, &vi), &pi), &gi)| {
                        let r1 = rng.gen::<f64>();
                        let r2 = rng.gen::<f64>();
                        // Canonical update: v = w·v + c1·r1·(pbest − x) + c2·r2·(gbest − x)
                        let mut nv =
                            w * vi + C1 * r1 * (pi - xi) + C2 * r2 * (gi - xi);
                        nv = nv.clamp(-V_MAX, V_MAX);
                        let nx = (xi + nv).clamp(0.0, 1.0);
                        (nx, nv)
                    })
                    .unzip()
            };
            let f = pso_fitness(&x_new, &edge_vocab, &col, vocab_len);
            positions[p] = x_new;
            velocities[p] = v_new;
            if f > pbest_fit[p] {
                pbest_fit[p] = f;
                pbest_pos[p] = positions[p].clone();
            }
            if f > gbest_fit {
                gbest_fit = f;
                gbest_pos = positions[p].clone();
            }
        }
    }

    let edges = pso_decode(&gbest_pos, &edge_vocab);
    Some((
        edge_set_to_dfg(&edges, &vocab, &edge_freq, &node_freq),
        gbest_fit,
    ))
}

/// Decode a continuous PSO position into a binary edge set (threshold 0.5).
fn pso_decode(pos: &[f64], edge_vocab: &[(u32, u32)]) -> EdgeSet {
    pos.iter()
        .zip(edge_vocab.iter())
        .filter(|(&xi, _)| xi > 0.5)
        .map(|(_, &edge)| edge)
        .collect()
}

/// Fitness of the binary decode of a continuous PSO position. NaN/Inf fitness is
/// sanitized to 0.0 (same discipline as ACO's SPC NaN guard) so it cannot win
/// pbest/gbest comparisons.
fn pso_fitness(
    pos: &[f64],
    edge_vocab: &[(u32, u32)],
    col: &ColumnarLog<'_>,
    vocab_len: usize,
) -> f64 {
    let edges = pso_decode(pos, edge_vocab);
    let f = evaluate_edges_fitness(&edges, col, vocab_len);
    if f.is_finite() {
        f
    } else {
        0.0
    }
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

    for (from_id, to_id) in edge_set.iter().copied() {
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
    let mut edge_set: EdgeSet = BTreeSet::new();
    for &edge in edge_vocab {
        if rng.gen::<f64>() < inclusion_probability {
            edge_set.insert(edge);
        }
    }
    edge_set
}

fn crossover_edges_seeded(parent1: &EdgeSet, parent2: &EdgeSet, rng: &mut StdRng) -> EdgeSet {
    let mut child: EdgeSet = BTreeSet::new();

    for &edge in parent1 {
        if rng.gen::<f64>() < 0.5 {
            child.insert(edge);
        }
    }

    for &edge in parent2 {
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
            let pick = (rng.gen::<f64>() * edge_set.len() as f64) as usize;
            let to_remove = *edge_set.iter().nth(pick).unwrap();
            edge_set.remove(&to_remove);
        } else if !edge_vocab.is_empty() {
            let idx = (rng.gen::<f64>() * edge_vocab.len() as f64) as usize;
            edge_set.insert(edge_vocab[idx]);
        }
    }
}

fn blend_edges_seeded(set1: &EdgeSet, set2: &EdgeSet, ratio: f64, rng: &mut StdRng) -> EdgeSet {
    let mut result: EdgeSet = BTreeSet::new();

    // BTreeSet iterates in ascending order — no explicit sort needed.
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

/// Pure-Rust ACO discovery: takes EventLog directly, returns (DFG, final_fitness).
/// Seed=42 for determinism. Testable without wasm-bindgen runtime.
///
/// Solution construction is canonical per-arc-normalized ACO: at each decision
/// point (source node with outgoing candidate edges) the ant computes
/// `p(e) = τ(e)^α · η(e)^β` over the candidate set, normalizes so the step's
/// probabilities sum to 1, and samples one edge. There is NO fallback to the
/// full edge vocabulary: a failed ant contributes fitness 0, and if every ant
/// in every iteration fails the caller gets an honest empty model with
/// fitness 0.0.
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
            *node_freq.entry(col.events[i]).or_default() += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                let cnt = edge_freq.entry(edge).or_default();
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
    let mut rng = create_deterministic_rng();
    let mut best_solution: Option<(EdgeSet, f64)> = None;

    // Classical MMAS bounds: pheromone is clamped into [tau_min, tau_max] each
    // iteration. Without bounds, repeated deposits q*fitness grow tau unboundedly
    // while evaporation only multiplies by (1 - rho).
    let tau_max: f64 = 10.0;
    let tau_min: f64 = tau_0 * 0.01_f64.max(1e-6);

    // Candidate edges grouped by source node — each source node is a decision
    // point where the ant normalizes τ^α·η^β over its outgoing candidate set and
    // samples ONE edge (probabilities sum to 1 at every construction step).
    let mut candidates_by_source: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
    for (i, &(src, _)) in edge_vocab.iter().enumerate() {
        candidates_by_source.entry(src).or_default().push(i);
    }

    for _iter in 0..iterations {
        let mut iteration_solutions: Vec<(EdgeSet, f64)> = Vec::new();

        for _ant in 0..ant_count {
            let mut ant_edges: EdgeSet = BTreeSet::new();
            for cand_idx in candidates_by_source.values() {
                let weights: Vec<f64> = cand_idx
                    .iter()
                    .map(|&i| {
                        let edge = edge_vocab[i];
                        let tau = pheromone.get(&edge).copied().unwrap_or(tau_0);
                        let eta = heuristic.get(&edge).copied().unwrap_or(0.01);
                        // SPC NaN guard: sanitize non-finite weights before sampling.
                        let w = tau.powf(alpha) * eta.powf(beta);
                        if w.is_finite() && w > 0.0 {
                            w
                        } else {
                            0.0
                        }
                    })
                    .collect();
                let probs = normalized_aco_probabilities(&weights);
                // Roulette-wheel sample from the normalized per-decision-point
                // distribution. If all weights are zero the decision point is
                // honestly skipped (no edge forced in).
                let mut threshold = rng.gen::<f64>();
                let mut picked: Option<usize> = None;
                for (j, &p) in probs.iter().enumerate() {
                    threshold -= p;
                    if threshold <= 0.0 {
                        picked = Some(cand_idx[j]);
                        break;
                    }
                }
                if let Some(i) = picked {
                    ant_edges.insert(edge_vocab[i]);
                }
            }
            let fitness_raw = evaluate_edges_fitness(&ant_edges, &col, vocab_len);
            // SPC NaN guard: non-finite fitness contributes 0.0 so it can neither
            // become best via `NaN > x == false` reordering nor poison pheromone.
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

    // Honest-degenerate handling (replaces the old full-vocabulary fallback, which
    // laundered a failed run into a "raw directly-follows" model): return the best
    // solution actually constructed. An ant that fails (all-zero weights or NaN
    // fitness) contributes fitness 0. If every ant in every iteration produced
    // nothing usable, the result is an honest empty model with fitness 0.0 —
    // callers (e.g. aco_bridge) see a 0-fitness/0-edge result, not a padded one.
    let (edges, fitness) = best_solution.unwrap_or((BTreeSet::new(), 0.0));
    Some((
        edge_set_to_dfg(&edges, &vocab, &edge_freq, &node_freq),
        fitness,
    ))
}

/// Normalize raw τ^α·η^β weights at one construction step into a probability
/// distribution that sums to 1 (canonical ACO per-arc normalization). Non-finite
/// or non-positive weights contribute 0. If the total is not positive and finite
/// (all-zero / NaN weights), all probabilities are 0 — the step is skipped.
fn normalized_aco_probabilities(weights: &[f64]) -> Vec<f64> {
    let total: f64 = weights
        .iter()
        .filter(|w| w.is_finite() && **w > 0.0)
        .sum();
    if !(total.is_finite() && total > 0.0) {
        return vec![0.0; weights.len()];
    }
    weights
        .iter()
        .map(|&w| if w.is_finite() && w > 0.0 { w / total } else { 0.0 })
        .collect()
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
    let (best_dfg, best_fitness) = get_or_init_state().with_event_log(eventlog_handle, |log| {
        discover_aco_algorithm_from_log(log, activity_key, ant_count, iterations)
            .ok_or_else(|| crate::error::js_val("no_edges"))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, Trace};

    fn attr_log(traces: &[&[&str]]) -> EventLog {
        EventLog {
            attributes: BTreeMap::new(),
            traces: traces
                .iter()
                .map(|events| Trace {
                    attributes: BTreeMap::new(),
                    events: events
                        .iter()
                        .map(|act| {
                            let mut e = Event::new();
                            e.attributes
                                .insert("concept:name".to_string(), AttributeValue::String((*act).to_string()));
                            e
                        })
                        .collect(),
                })
                .collect(),
        }
    }

    /// 5x chain a→b→c plus 1 noisy c→a trace. Vocab: a=0, b=1, c=2.
    /// The unique 100%-fit edge set is the full observed vocabulary
    /// {(0,1),(1,2),(2,0)} — every strict subset misses a trace.
    fn noisy_chain_log() -> EventLog {
        let mut traces: Vec<Vec<&str>> = vec![vec!["a", "b", "c"]; 5];
        traces.push(vec!["c", "a"]);
        let refs: Vec<&[&str]> = traces.iter().map(|v| v.as_slice()).collect();
        attr_log(&refs)
    }

    #[test]
    fn pso_converges_to_known_best_edge_set() {
        let log = noisy_chain_log();
        let (dfg, fitness) = discover_pso_algorithm_from_log(&log, "concept:name", 24, 60)
            .expect("non-empty edge vocabulary");
        let got: BTreeSet<(u32, u32)> = dfg
            .edges
            .iter()
            .map(|e| {
                let vocab: Vec<&str> = vec!["a", "b", "c"];
                (
                    vocab.iter().position(|s| *s == e.from).unwrap() as u32,
                    vocab.iter().position(|s| *s == e.to).unwrap() as u32,
                )
            })
            .collect();
        assert_eq!(
            got,
            BTreeSet::from([(0u32, 1u32), (1, 2), (2, 0)]),
            "PSO must recover the full observed edge set (unique 100%-fit model)"
        );
        assert!(fitness >= 0.85, "expected high fitness, got {fitness}");
    }

    #[test]
    fn aco_probabilities_sum_to_one_at_each_step() {
        let cases: Vec<Vec<f64>> = vec![
            vec![1.0, 2.0, 3.0],
            vec![0.001, 0.002],
            vec![7.5],
            vec![0.0, 5.0, 0.0],
            // NaN/Inf weights are sanitized, remainder still sums to 1.
            vec![f64::NAN, 4.0, f64::INFINITY, 1.0],
        ];
        for weights in &cases {
            let probs = normalized_aco_probabilities(weights);
            assert_eq!(probs.len(), weights.len());
            let total: f64 = probs.iter().sum();
            assert!(
                (total - 1.0).abs() < 1e-9,
                "probabilities must sum to 1 for weights {weights:?}, got {total}"
            );
            assert!(probs.iter().all(|p| p.is_finite() && *p >= 0.0));
        }
        // All-zero weights: honest all-zero step (skipped), never fabricated.
        assert_eq!(
            normalized_aco_probabilities(&[0.0, 0.0]),
            vec![0.0, 0.0]
        );
    }

    #[test]
    fn aco_low_iteration_run_does_not_launder_full_vocab() {
        let log = branching_log();
        // Adversarial budget: 1 ant, 1 iteration. The old code fell back to the
        // full edge vocabulary; the honest result is whatever the single ant
        // actually sampled — one edge per decision point. With source `a`
        // having two outgoing candidates, a 1-ant run samples exactly one and
        // can never return the full two-edge vocabulary.
        let (dfg, _fitness) =
            discover_aco_algorithm_from_log(&log, "concept:name", 1, 1)
                .expect("non-empty edge vocabulary");
        assert!(
            dfg.edges.len() <= 1,
            "1-ant/1-iteration result must not be the full vocabulary, got {} edges",
            dfg.edges.len()
        );
    }

    /// Branching log: 3x a→b, 1x a→c. Vocab: a=0, b=1, c=2.
    /// Full vocabulary = {(0,1),(0,2)} — source `a` is a real decision point
    /// with two outgoing candidates.
    fn branching_log() -> EventLog {
        let traces: Vec<Vec<&str>> = vec![vec!["a", "b"], vec!["a", "b"], vec!["a", "b"], vec!["a", "c"]];
        let refs: Vec<&[&str]> = traces.iter().map(|v| v.as_slice()).collect();
        attr_log(&refs)
    }

    #[test]
    fn aco_full_run_recovers_chain_and_is_deterministic() {
        let log = noisy_chain_log();
        let (dfg1, f1) = discover_aco_algorithm_from_log(&log, "concept:name", 12, 20)
            .expect("non-empty edge vocabulary");
        let (dfg2, f2) = discover_aco_algorithm_from_log(&log, "concept:name", 12, 20)
            .expect("non-empty edge vocabulary");
        assert!((f1 - f2).abs() < 1e-12, "same seed must be deterministic");
        // Both source decision points (a, c) must have their outgoing edge present.
        let froms: BTreeSet<&str> = dfg1.edges.iter().map(|e| e.from.as_str()).collect();
        assert!(froms.contains("a") && froms.contains("c"));
    }
}
