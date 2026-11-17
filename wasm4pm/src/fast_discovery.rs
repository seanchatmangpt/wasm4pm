use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{evaluate_edges_fitness, to_js_str};
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// Discover a process model using genuine A* search over DFG edge subsets.
///
/// State = (canonical ascending subset of DFG edge candidates), g(n) = real
/// accumulated value in pair-coverage units (covered pair occurrences minus a
/// fixed per-edge complexity penalty), h(n) = admissible optimistic bound on
/// remaining improvement (see [`discover_astar_bounded_from_log`]). Searched with
/// a `BinaryHeap` priority queue and deterministic (f, lexicographic-state) order.
///
/// Returns `{handle, algorithm: "astar", nodes, edges, iterations: usize}`.
///
/// **IMPORTANT:** The `iterations` field in the result is a node-expansion count,
/// **not a fitness score**. Do not interpret it as model quality.
///
/// # Parameters
/// * `max_iterations` — Maximum node expansions. Use 500–2000 for real logs.
///   Higher values allow more thorough search but take longer.
#[wasm_bindgen]
pub fn discover_astar(
    eventlog_handle: &str,
    activity_key: &str,
    max_iterations: usize,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.astar",
        algorithm = "astar",
        activity_key = activity_key,
        max_iterations = max_iterations,
        "A* search discovery started"
    );

    let (best_dfg, iterations) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                tracing::info!(
                    target: "wasm4pm.discovery.astar",
                    checkpoint = "feature_extraction",
                    log_size = log.traces.len(),
                    activity_count = log.get_activities(activity_key).len(),
                    "Log loaded and analyzed"
                );
                Ok(discover_astar_from_log(log, activity_key, max_iterations))
            }
            Some(_) => Err(crate::error::js_val("Not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let node_count = best_dfg.nodes.len();
    let edge_count = best_dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.astar",
        checkpoint = "result_generation",
        node_count = node_count,
        edge_count = edge_count,
        iterations_used = iterations,
        "DFG model discovered"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "astar",
        "nodes": node_count,
        "edges": edge_count,
        "iterations": iterations,
    }))
}

/// Bounded A* discovery (WASM surface). With `beam_width = Some(w)`, the open
/// set is truncated to the `w` best nodes after every expansion, so optimality
/// is lost and the search degenerates to beam search (bounded A*); the result
/// JSON then reports `"algorithm": "beam"`. With `None`, genuine (optimal) A*.
#[wasm_bindgen]
pub fn discover_astar_bounded(
    entrylog_handle: &str,
    activity_key: &str,
    max_iterations: wasm_bindgen::JsValue,
    beam_width: Option<usize>,
) -> Result<JsValue, JsValue> {
    let max_iterations: usize = if max_iterations.is_null() || max_iterations.is_undefined() {
        1000
    } else {
        max_iterations
            .as_f64()
            .map(|v| v as usize)
            .unwrap_or(1000)
    };
    discover_astar_bounded_wasm(entrylog_handle, activity_key, max_iterations, beam_width)
}

fn discover_astar_bounded_wasm(
    eventlog_handle: &str,
    activity_key: &str,
    max_iterations: usize,
    beam_width: Option<usize>,
) -> Result<JsValue, JsValue> {
    let (best_dfg, iterations) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(discover_astar_bounded_from_log(
                log,
                activity_key,
                max_iterations,
                beam_width,
            )),
            Some(_) => Err(crate::error::js_val("Not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let node_count = best_dfg.nodes.len();
    let edge_count = best_dfg.edges.len();
    let algorithm = if beam_width.is_some() { "beam" } else { "astar" };

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": algorithm,
        "nodes": node_count,
        "edges": edge_count,
        "iterations": iterations,
    }))
}

/// Hill Climbing - greedy local optimization
#[wasm_bindgen]
pub fn discover_hill_climbing(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.hill_climbing",
        algorithm = "hill_climbing",
        activity_key = activity_key,
        "Hill Climbing discovery started"
    );

    let current_dfg = get_or_init_state().with_event_log(eventlog_handle, |log| {
        tracing::info!(
            target: "wasm4pm.discovery.hill_climbing",
            checkpoint = "feature_extraction",
            log_size = log.traces.len(),
            activity_count = log.get_activities(activity_key).len(),
            "Log loaded and analyzed"
        );
        Ok(discover_hill_climbing_from_log(log, activity_key))
    })?;

    let node_count = current_dfg.nodes.len();
    let edge_count = current_dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.hill_climbing",
        checkpoint = "result_generation",
        node_count = node_count,
        edge_count = edge_count,
        complexity = if node_count > 0 { edge_count as f64 / node_count as f64 } else { 0.0 },
        "DFG model optimized"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(current_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "hill_climbing",
        "nodes": node_count,
        "edges": edge_count,
    }))
}

/// Pure-Rust Hill Climbing discovery: takes EventLog directly, returns DFG.
/// Testable without wasm-bindgen runtime — same logic as discover_hill_climbing.
///
/// Uses fitness-driven greedy pruning: try removing each edge (sorted for
/// determinism); keep the removal if fitness does not decrease. First-improvement
/// restart until no beneficial removal remains.
pub fn discover_hill_climbing_from_log(log: &EventLog, activity_key: &str) -> DFG {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    // Pre-size: n² / 4 is a practical upper bound for DFG edge count (sparse graphs).
    let n = col.vocab.len();
    let cap = n.saturating_mul(n) / 4 + 1;
    let mut current_edges: std::collections::BTreeSet<(u32, u32)> =
        std::collections::BTreeSet::new();
    let mut edge_freq: FxHashMap<(u32, u32), usize> =
        FxHashMap::with_capacity_and_hasher(cap, Default::default());
    let mut node_freq: FxHashMap<u32, usize> =
        FxHashMap::with_capacity_and_hasher(n + 1, Default::default());

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end {
            *node_freq.entry(col.events[i]).or_default() += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                *edge_freq.entry(edge).or_default() += 1;
                current_edges.insert(edge);
            }
        }
    }

    let edge_vocab_len = current_edges.len();
    if edge_vocab_len > 1 {
        // Fitness-driven greedy pruning — first-improvement restart.
        // Sorted iteration makes the search order deterministic regardless of
        // HashSet RandomState. Edges with low observed frequency are tried first.
        //
        // Optimisation: instead of cloning the whole edge set per candidate
        // (O(edges) per trial), remove the edge in-place, evaluate fitness,
        // then re-insert on failure. This turns O(edges²) allocations into
        // O(1) set mutations per trial — no heap allocation in the inner loop.
        let mut current_fitness = evaluate_edges_fitness(&current_edges, &col, edge_vocab_len);
        let mut improved = true;
        while improved && current_edges.len() > 1 {
            improved = false;
            let mut candidates: Vec<(u32, u32)> = current_edges.iter().copied().collect();
            // Sort by ascending frequency so cheapest-to-remove edges are tried first.
            candidates.sort_unstable_by_key(|e| (edge_freq.get(e).copied().unwrap_or(0), *e));
            for &edge in &candidates {
                // Mutate in place — no clone needed.
                current_edges.remove(&edge);
                let trial_fitness = evaluate_edges_fitness(&current_edges, &col, edge_vocab_len);
                if trial_fitness >= current_fitness - f64::EPSILON {
                    current_fitness = trial_fitness;
                    improved = true;
                    break; // first-improvement restart; edge stays removed
                } else {
                    // Fitness dropped — restore the edge and continue.
                    current_edges.insert(edge);
                }
            }
        }
    }

    let mut dfg = DFG::new();
    dfg.nodes
        .extend(col.vocab.iter().enumerate().map(|(idx, act)| DFGNode {
            id: act.to_string(),
            label: act.to_string(),
            frequency: node_freq.get(&(idx as u32)).copied().unwrap_or(0),
        }));
    dfg.edges
        .extend(current_edges.iter().map(|&(f, t)| DirectlyFollowsRelation {
            from: col.vocab[f as usize].to_owned(),
            to: col.vocab[t as usize].to_owned(),
            frequency: edge_freq.get(&(f, t)).copied().unwrap_or(1),
        }));
    dfg
}

/// Per-edge complexity penalty λ (in pair-coverage units): 20% of the mean
/// directly-follows pair frequency, mirroring the 20% simplicity weight of the
/// legacy scoring. An edge is worth selecting iff its frequency exceeds λ.
fn astar_lambda(total_pairs: usize, edge_count: usize) -> f64 {
    if edge_count == 0 {
        0.0
    } else {
        0.2 * total_pairs as f64 / edge_count as f64
    }
}

/// Value of a selected edge subset in real cost units: covered directly-follows
/// pair occurrences minus λ per selected edge. Maximizing this value is exactly
/// minimizing cost = (P − covered) + λ·|E| (P = total pair occurrences).
#[cfg_attr(not(test), allow(dead_code))]
fn astar_value(covered: usize, selected: usize, lambda: f64) -> f64 {
    covered as f64 - lambda * selected as f64
}

/// A search node: a canonical (ascending-index) subset of the sorted
/// directly-follows edge candidates. Each subset is generated exactly once —
/// only from its own prefix (the subset minus its largest index) — so the open
/// set never contains duplicate states.
struct AStarNode {
    /// f = g + h: exact bound on the best value reachable through this node.
    f: f64,
    /// g: real accumulated value (covered − λ·|selected|), in pair units.
    g: f64,
    /// Covered pair occurrences so far (integer, no float drift).
    covered: usize,
    /// Σ max(freq_e − λ, 0) over selected edges (maintains h incrementally).
    positive_sum: f64,
    /// Ascending edge indices — canonical state key, used for tie-breaking.
    key: Vec<usize>,
}

impl Eq for AStarNode {}
impl PartialEq for AStarNode {
    fn eq(&self, other: &Self) -> bool {
        self.f.total_cmp(&other.f) == std::cmp::Ordering::Equal && self.key == other.key
    }
}
impl Ord for AStarNode {
    // BinaryHeap is a max-heap: "greater" pops first. Pop order = ascending f
    // (most promising bound first), ties broken by ascending canonical key —
    // fully deterministic, no RNG.
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        let by_f = other.f.total_cmp(&self.f);
        if by_f == std::cmp::Ordering::Equal {
            other.key.cmp(&self.key)
        } else {
            by_f
        }
    }
}
impl PartialOrd for AStarNode {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// Pure-Rust genuine A* discovery: takes EventLog directly, returns (DFG, expansions).
///
/// # Design
///
/// * **State**: an ascending-index subset of the deterministically sorted
///   directly-follows candidates (`EventLog::get_directly_follows` returns
///   (from, to, freq) aggregated per pair and sorted, so indexing is stable).
/// * **g(n)**: real accumulated value in pair-coverage units,
///   `g = covered − λ·|E|` with `λ = 0.2·P/D` (P = total pair occurrences,
///   D = distinct DF edges; the 20% mirrors the legacy simplicity weight).
///   Maximizing g == minimizing cost `(P − covered) + λ·|E|`.
/// * **h(n)**: `Σ_{e ∉ E_n} max(freq_e − λ, 0)`.
///   **Admissibility argument**: the objective is additive over edges — adding
///   edge e changes the value by exactly `freq_e − λ` independently of the rest
///   of the set, and each edge can be selected at most once, so the best
///   remaining gain from n is at most the sum of positive individual gains of
///   unselected edges. Because DF pairs are aggregated (a pair's occurrences are
///   covered by that one candidate edge only), there is no overlap term, and the
///   bound is in fact **exact** (h = h*): f(n) equals the optimal value
///   achievable through n. A heuristic can never be more admissible than exact.
/// * **Search**: `BinaryHeap` ordered by (f ascending, canonical key ascending)
///   — fully deterministic. Every state is a goal candidate; the best g seen is
///   tracked over all generated nodes, and a popped node with `f ≤ best_g`
///   terminates the search early (branch-and-bound cut: every remaining heap
///   entry has f ≥ the popped f, so no completion can beat best_g).
/// * **Budget**: `max_iterations` bounds node expansions (pops).
pub fn discover_astar_from_log(
    log: &EventLog,
    activity_key: &str,
    max_iterations: usize,
) -> (DFG, usize) {
    discover_astar_bounded_from_log(log, activity_key, max_iterations, None)
}

/// A* with an optional open-set width bound. `beam_width = None` runs genuine
/// (optimal-with-budget) A*. `Some(w)` truncates the open set to the `w`
/// best-ranked nodes after every expansion: optimality guarantees are lost and
/// the algorithm **degenerates to beam search (bounded A*)** — the admissible
/// ranking still orders what survives, but low-f bound branches are discarded.
pub fn discover_astar_bounded_from_log(
    log: &EventLog,
    activity_key: &str,
    max_iterations: usize,
    beam_width: Option<usize>,
) -> (DFG, usize) {
    let activities = log.get_activities(activity_key);
    let directly_follows = log.get_directly_follows(activity_key);

    let mut dfg = DFG::new();
    dfg.nodes.extend(activities.iter().map(|activity| DFGNode {
        id: activity.clone(),
        label: activity.clone(),
        frequency: 0,
    }));
    if directly_follows.is_empty() {
        return (dfg, 0);
    }

    let total_pairs: usize = directly_follows.iter().map(|(_, _, freq)| freq).sum();
    let lambda = astar_lambda(total_pairs, directly_follows.len());
    // h(root) = Σ max(freq − λ, 0) over ALL edges: the optimistic (here exact)
    // bound on total achievable improvement.
    let h_total: f64 = directly_follows
        .iter()
        .map(|(_, _, freq)| (*freq as f64 - lambda).max(0.0))
        .sum();

    let mut open = std::collections::BinaryHeap::new();
    open.push(AStarNode {
        f: h_total,
        g: 0.0,
        covered: 0,
        positive_sum: 0.0,
        key: Vec::new(),
    });
    let mut best_g = 0.0f64;
    let mut best_key: Vec<usize> = Vec::new();
    let mut iterations = 0usize;

    while iterations < max_iterations && !open.is_empty() {
        let node = match open.pop() {
            Some(n) => n,
            None => break,
        };
        // Branch-and-bound cut: f is the exact best value reachable through
        // this node; every remaining heap entry has f ≥ this f, so if this f
        // cannot beat best_g, nothing can. The search ends optimal.
        if node.f <= best_g {
            break;
        }
        iterations += 1;

        let start_from = node.key.last().map_or(0, |&l| l + 1);
        let mut children: Vec<AStarNode> = Vec::with_capacity(directly_follows.len());
        for j in start_from..directly_follows.len() {
            let freq = directly_follows[j].2;
            let gain = freq as f64 - lambda;
            let mut key = node.key.clone();
            key.push(j);
            let child_positive = node.positive_sum + gain.max(0.0);
            let child_covered = node.covered + freq;
            let g = child_covered as f64 - lambda * key.len() as f64;
            let h = h_total - child_positive;
            children.push(AStarNode {
                f: g + h,
                g,
                covered: child_covered,
                positive_sum: child_positive,
                key,
            });
        }

        // Best tracking over GENERATED nodes (not just popped): expansion of
        // the root already yields the best single edge even at budget 1.
        for child in &children {
            if child.g > best_g {
                best_g = child.g;
                best_key = child.key.clone();
            }
        }

        if let Some(w) = beam_width {
            if children.len() > w {
                children.sort_by(|a, b| b.cmp(a));
                children.truncate(w);
            }
        }
        for child in children {
            open.push(child);
        }
    }

    let mut best_dfg = dfg;
    best_dfg.edges.extend(best_key.into_iter().map(|idx| {
        let (from, to, freq) = &directly_follows[idx];
        DirectlyFollowsRelation {
            from: from.clone(),
            to: to.to_owned(),
            frequency: *freq,
        }
    }));
    (best_dfg, iterations)
}

/// Legacy bounded beam search preserved for callers that want the historical
/// behavior (open set truncated to the top 128 by the old ad-hoc
/// fitness-minus-penalty score). Not optimal; superseded by
/// [`discover_astar_bounded_from_log`] for bounded runs. Returns (DFG, expansions).
pub fn discover_beam_from_log(
    log: &EventLog,
    activity_key: &str,
    max_iterations: usize,
) -> (DFG, usize) {
    let activities = log.get_activities(activity_key);
    let directly_follows = log.get_directly_follows(activity_key);

    let total_pairs: usize = directly_follows.iter().map(|(_, _, freq)| freq).sum();
    let total_df = directly_follows.len().max(1);

    let mut best_dfg = DFG::new();
    for activity in &activities {
        best_dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: 0,
        });
    }

    let mut open_set = vec![(best_dfg.clone(), 0f64)];
    let mut best_score = 0f64;
    let mut iterations = 0;

    while !open_set.is_empty() && iterations < max_iterations {
        open_set.sort_unstable_by(|a, b| a.1.total_cmp(&b.1));
        let (current_dfg, _score) = match open_set.pop() {
            Some(item) => item,
            None => break,
        };

        let current_covered_pairs: usize = current_dfg.edges.iter().map(|e| e.frequency).sum();
        let current_edge_count = current_dfg.edges.len();

        let new_candidates: Vec<(DFG, f64)> = directly_follows
            .iter()
            .filter(|(from, to, _)| {
                !current_dfg
                    .edges
                    .iter()
                    .any(|e| &e.from == from && &e.to == to)
            })
            .filter_map(|(from, to, freq)| {
                // Incremental fitness calculation
                let new_covered_pairs = current_covered_pairs + freq;
                let new_edge_count = current_edge_count + 1;

                let coverage = if total_pairs == 0 {
                    1.0
                } else {
                    new_covered_pairs as f64 / total_pairs as f64
                };
                let relative_density = new_edge_count as f64 / total_pairs.max(1) as f64;
                let simplicity = 1.0 / (1.0 + relative_density);
                let fitness = coverage.mul_add(0.8, simplicity * 0.2);

                let edge_penalty = new_edge_count as f64 / total_df as f64;
                let candidate_score = fitness.mul_add(0.8, -edge_penalty * 0.2);

                if fitness > 0.0 {
                    let mut new_dfg = current_dfg.clone();
                    new_dfg.edges.push(DirectlyFollowsRelation {
                        from: from.clone(),
                        to: to.clone(),
                        frequency: *freq,
                    });
                    Some((new_dfg, candidate_score))
                } else {
                    None
                }
            })
            .collect();
        // Track best across NEW candidates (where the actual scores live), not the
        // parent we just popped. Prior bug: `if score > best_score` only ever read
        // the popped score — for iteration 0 that score is always 0 (the seed
        // empty DFG), so `best_dfg` perpetually lagged the frontier by one step
        // and an A* run with `max_iterations=1` always returned an empty DFG.
        for (cand_dfg, cand_score) in &new_candidates {
            if *cand_score > best_score {
                best_score = *cand_score;
                best_dfg = cand_dfg.clone();
            }
        }
        open_set.extend(new_candidates);
        // Beam: sort descending by score and cap the open set to prevent memory explosion.
        open_set.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));
        open_set.truncate(128);
        iterations += 1;
    }
    (best_dfg, iterations)
}

/// Trace Variants - extract unique process paths and their frequencies
#[wasm_bindgen]
pub fn analyze_trace_variants(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut variants: std::collections::BTreeMap<Vec<String>, usize> =
            std::collections::BTreeMap::new();

        for trace in &log.traces {
            let path: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(activity_key)?
                        .as_string()
                        .map(str::to_owned)
                })
                .collect();
            *variants.entry(path).or_default() += 1;
        }

        let mut variant_list: Vec<(Vec<String>, usize)> = variants.into_iter().collect();
        variant_list.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));

        let top_variants: Vec<_> = variant_list
            .iter()
            .take(20)
            .map(|(path, count)| {
                json!({
                    "path": path,
                    "count": count,
                    "percentage": (*count as f64 / log.traces.len() as f64 * 100.0).round()
                })
            })
            .collect();

        to_js_str(&json!({
            "total_variants": variant_list.len(),
            "top_variants": top_variants,
            "coverage": (top_variants.len() as f64 / variant_list.len().max(1) as f64 * 100.0),
        }))
    })
}

/// Sequential Pattern Mining - find frequent activity sequences
#[wasm_bindgen]
pub fn mine_sequential_patterns(
    eventlog_handle: &str,
    activity_key: &str,
    min_support: f64,
    pattern_length: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut patterns: std::collections::BTreeMap<Vec<String>, usize> =
            std::collections::BTreeMap::new();
        let min_count = ((log.traces.len() as f64 * min_support).ceil()) as usize;

        for trace in &log.traces {
            let activities: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(activity_key)?
                        .as_string()
                        .map(str::to_owned)
                })
                .collect();

            for window in activities.windows(pattern_length) {
                *patterns.entry(window.to_vec()).or_default() += 1;
            }
        }

        let mut frequent_patterns: Vec<_> = patterns
            .into_iter()
            .filter(|(_, count)| *count >= min_count)
            .collect();
        frequent_patterns.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));

        let result_patterns: Vec<_> = frequent_patterns
            .iter()
            .take(50)
            .map(|(pattern, count)| {
                json!({
                    "pattern": pattern,
                    "count": count,
                    "support": (*count as f64 / log.traces.len() as f64)
                })
            })
            .collect();

        to_js_str(&json!({
            "pattern_length": pattern_length,
            "patterns": result_patterns,
            "min_support": min_support,
        }))
    })
}

/// Concept Drift Detection - identify where process behavior changes
#[wasm_bindgen]
pub fn detect_concept_drift(
    eventlog_handle: &str,
    activity_key: &str,
    window_size: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut drifts = Vec::new();
        let mut previous_activities: HashSet<String> = HashSet::new();

        for (idx, window) in log.traces.windows(window_size).enumerate() {
            let mut current_activities: HashSet<String> = HashSet::new();

            for trace in window {
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        current_activities.insert(activity.clone());
                    }
                }
            }

            if !previous_activities.is_empty() {
                let jaccard_distance = 1.0
                    - (current_activities
                        .intersection(&previous_activities)
                        .count() as f64
                        / current_activities
                            .union(&previous_activities)
                            .count()
                            .max(1) as f64);

                if jaccard_distance > 0.3 {
                    drifts.push(json!({
                        "position": idx * window_size,
                        "distance": jaccard_distance,
                        "type": "concept_drift"
                    }));
                }
            }

            previous_activities = current_activities;
        }

        to_js_str(&json!({
            "drifts_detected": drifts.len(),
            "drifts": drifts,
            "window_size": window_size,
        }))
    })
}

/// Helper: Encode traces as bitsets for O(1) Jaccard similarity
/// Returns (bitsets, activity_index) where bitsets[i] is u128 encoding of trace i
fn encode_traces_as_bitsets(
    log: &EventLog,
    activity_key: &str,
) -> (Vec<u128>, FxHashMap<String, u16>) {
    // Build activity_index: each unique activity gets a bit position 0..127
    let mut activity_index: FxHashMap<String, u16> = FxHashMap::default();
    let mut next_bit = 0u16;

    // First pass: collect all unique activities
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                if !activity_index.contains_key(activity) && next_bit < 128 {
                    activity_index.insert(activity.clone(), next_bit);
                    next_bit += 1;
                }
            }
        }
    }

    // Second pass: encode each trace as a bitset
    let mut bitsets = Vec::new();
    for trace in &log.traces {
        let mut bitset: u128 = 0;
        for event in &trace.events {
            if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                if let Some(&bit_pos) = activity_index.get(activity) {
                    bitset |= 1u128 << bit_pos;
                }
            }
        }
        bitsets.push(bitset);
    }

    (bitsets, activity_index)
}

/// Helper: Compute Jaccard similarity between two bitsets
/// jaccard(a, b) = popcount(a & b) / popcount(a | b)
#[inline]
fn jaccard_bitset(a: u128, b: u128) -> f64 {
    let intersection = (a & b).count_ones() as f64;
    let union = (a | b).count_ones() as f64;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

/// Helper: Recompute cluster center using majority voting on each bit
fn recompute_center(cluster_indices: &[usize], bitsets: &[u128]) -> u128 {
    if cluster_indices.is_empty() {
        return 0u128;
    }

    let mut center: u128 = 0;
    let threshold = (cluster_indices.len() as f64 / 2.0).ceil() as usize;

    // For each of 128 bits: count how many traces have bit set
    for bit_pos in 0..128 {
        let bit_mask = 1u128 << bit_pos;
        let count = cluster_indices
            .iter()
            .filter(|&&idx| (bitsets[idx] & bit_mask) != 0)
            .count();
        // Set bit in center if majority of traces have it
        if count >= threshold {
            center |= bit_mask;
        }
    }

    center
}

/// Process Clustering - group similar traces using bitset-based k-means
/// Time complexity: O(T×K) where T = traces, K = clusters (vs O(T×K×A) for string-based)
#[wasm_bindgen]
pub fn cluster_traces(
    eventlog_handle: &str,
    activity_key: &str,
    num_clusters: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        if log.traces.is_empty() {
            return to_js_str(&json!({
                "num_clusters": num_clusters,
                "cluster_sizes": [],
                "total_traces": 0,
            }));
        }

        let num_clusters = num_clusters.min(log.traces.len());

        // Encode all traces as bitsets: O(T×A) but amortized O(T) after index build
        let (bitsets, _activity_index) = encode_traces_as_bitsets(log, activity_key);

        let mut cluster_centers: Vec<u128> = vec![0u128; num_clusters];
        let mut clusters: Vec<Vec<usize>> = vec![Vec::new(); num_clusters];

        // Initialize centers from first K traces
        cluster_centers[..num_clusters].copy_from_slice(&bitsets[..num_clusters]);

        // K-means: converge with bitset operations
        let max_iterations = 10;
        let mut converged = false;
        let mut iteration = 0;

        while !converged && iteration < max_iterations {
            iteration += 1;
            converged = true;

            // Clear cluster assignments
            for cluster in &mut clusters {
                cluster.clear();
            }

            // Assignment: O(T×K) — integer bitwise ops, no String operations
            for (trace_idx, &bitset) in bitsets.iter().enumerate() {
                let mut best_cluster = 0;
                let mut best_similarity = -1.0;

                for (center_idx, &center) in cluster_centers.iter().enumerate() {
                    let similarity = jaccard_bitset(bitset, center);
                    if similarity > best_similarity {
                        best_similarity = similarity;
                        best_cluster = center_idx;
                    }
                }

                clusters[best_cluster].push(trace_idx);
            }

            // Update centers using majority voting: O(K×128) = O(K)
            for (center_idx, cluster_indices) in clusters.iter().enumerate() {
                let new_center = recompute_center(cluster_indices, &bitsets);
                if new_center != cluster_centers[center_idx] {
                    converged = false;
                }
                cluster_centers[center_idx] = new_center;
            }
        }

        // Build result
        let cluster_sizes: Vec<_> = clusters
            .iter()
            .enumerate()
            .map(|(idx, cluster)| {
                json!({
                    "cluster": idx,
                    "size": cluster.len(),
                    "percentage": (cluster.len() as f64 / log.traces.len() as f64 * 100.0)
                })
            })
            .collect();

        to_js_str(&json!({
            "num_clusters": num_clusters,
            "cluster_sizes": cluster_sizes,
            "total_traces": log.traces.len(),
            "iterations": iteration,
        }))
    })
}

/// Start/End Activity Analysis - find entry and exit points
#[wasm_bindgen]
pub fn analyze_start_end_activities(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
            let mut start_acts: FxHashMap<String, usize> = FxHashMap::default();
            let mut end_acts: FxHashMap<String, usize> = FxHashMap::default();
            let mut start_end_pairs: FxHashMap<(String, String), usize> = FxHashMap::default();

            for trace in &log.traces {
                if !trace.events.is_empty() {
                    if let Some(AttributeValue::String(first)) =
                        trace.events[0].attributes.get(activity_key)
                    {
                        *start_acts.entry(first.clone()).or_default() += 1;
                    }

                    if let Some(AttributeValue::String(last)) =
                        trace.events[trace.events.len() - 1]
                            .attributes
                            .get(activity_key)
                    {
                        *end_acts.entry(last.clone()).or_default() += 1;
                    }

                    if trace.events.len() >= 2 {
                        if let (
                            Some(AttributeValue::String(first)),
                            Some(AttributeValue::String(last)),
                        ) = (
                            trace.events[0].attributes.get(activity_key),
                            trace.events[trace.events.len() - 1]
                                .attributes
                                .get(activity_key),
                        ) {
                            *start_end_pairs
                                .entry((first.clone(), last.clone()))
                                .or_default() += 1;
                        }
                    }
                }
            }

            let mut starts: Vec<_> = start_acts.into_iter().collect();
            let mut ends: Vec<_> = end_acts.into_iter().collect();
            let mut pairs: Vec<_> = start_end_pairs.into_iter().collect();

            starts.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            ends.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            pairs.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

            to_js_str(&json!({
                "start_activities": starts.iter().take(10).map(|(a, c)| json!({"activity": a, "count": c})).collect::<Vec<_>>(),
                "end_activities": ends.iter().take(10).map(|(a, c)| json!({"activity": a, "count": c})).collect::<Vec<_>>(),
                "start_end_pairs": pairs.iter().take(10).map(|(p, c)| json!({"start": p.0, "end": p.1, "count": c})).collect::<Vec<_>>(),
            }))
    })
}

/// Activity Co-occurrence - find activities that happen together
#[wasm_bindgen]
pub fn analyze_activity_cooccurrence(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut cooccurrence: FxHashMap<(String, String), usize> = FxHashMap::default();

        for trace in &log.traces {
            let activities: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(activity_key)?
                        .as_string()
                        .map(str::to_owned)
                })
                .collect();

            for i in 0..activities.len() {
                for j in i + 1..activities.len() {
                    let pair = if activities[i] < activities[j] {
                        (activities[i].clone(), activities[j].clone())
                    } else {
                        (activities[j].clone(), activities[i].clone())
                    };
                    *cooccurrence.entry(pair).or_default() += 1;
                }
            }
        }

        let mut pairs: Vec<_> = cooccurrence.into_iter().collect();
        pairs.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

        let result: Vec<_> = pairs
            .iter()
            .take(30)
            .map(|((a1, a2), count)| {
                json!({
                    "activity1": a1,
                    "activity2": a2,
                    "cooccurrence_count": count
                })
            })
            .collect();

        to_js_str(&json!({
            "cooccurrences": result,
        }))
    })
}

/// Partial edge-coverage fitness: fraction of consecutive event pairs in the log
/// that are present in the DFG, minus a complexity penalty per extra edge.
///
/// Unlike all-or-nothing trace fitness, partial coverage provides a non-zero
/// gradient from an empty DFG — essential for incremental construction in A*.
/// Fitness ∈ [0, 1]: 0 = no edges match any pair, 1 = all pairs covered exactly.
fn evaluate_dfg_partial_fitness(dfg: &DFG, log: &EventLog, activity_key: &str) -> f64 {
    let edge_set: HashSet<(&str, &str)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.as_str(), e.to.as_str()))
        .collect();
    let mut total_pairs = 0usize;
    let mut covered_pairs = 0usize;
    for trace in &log.traces {
        for pair in trace.events.windows(2) {
            let a1 = pair[0]
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string());
            let a2 = pair[1]
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string());
            if let (Some(from), Some(to)) = (a1, a2) {
                total_pairs += 1;
                if edge_set.contains(&(from, to)) {
                    covered_pairs += 1;
                }
            }
        }
    }
    if total_pairs == 0 {
        return 1.0;
    }
    // 80% coverage + 20% simplicity (vocabulary-relative density)
    let coverage = covered_pairs as f64 / total_pairs as f64;
    // edge_set.len() == dfg.edges.len() here, so normalize by unique observed pairs
    let relative_density = dfg.edges.len() as f64 / total_pairs.max(1) as f64;
    let simplicity = 1.0 / (1.0 + relative_density);
    coverage.mul_add(0.8, simplicity * 0.2)
}

#[wasm_bindgen]
pub fn fast_discovery_info() -> String {
    json!({
        "status": "fast_discovery_available",
        "algorithms": [
            {"name": "astar", "type": "informed_search", "speed": "fast"},
            {"name": "hill_climbing", "type": "greedy", "speed": "very_fast"},
            {"name": "trace_variants", "type": "analytics", "speed": "very_fast"},
            {"name": "sequential_patterns", "type": "mining", "speed": "fast"},
            {"name": "concept_drift", "type": "analysis", "speed": "medium"},
            {"name": "trace_clustering", "type": "analytics", "speed": "fast"},
            {"name": "activity_cooccurrence", "type": "analytics", "speed": "fast"},
            {"name": "start_end_analysis", "type": "analytics", "speed": "very_fast"},
        ]
    })
    .to_string()
}

/// Value in cost units of a returned DFG against a log: covered DF pair
/// occurrences minus λ per selected edge. Test oracle shared with the search.
#[cfg(test)]
fn astar_value_of_dfg(dfg: &DFG, log: &EventLog, activity_key: &str) -> f64 {
    let df = log.get_directly_follows(activity_key);
    let total_pairs: usize = df.iter().map(|(_, _, freq)| freq).sum();
    let lambda = astar_lambda(total_pairs, df.len());
    let edge_set: HashSet<(&str, &str)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.as_str(), e.to.as_str()))
        .collect();
    let covered = df
        .iter()
        .filter(|(f, t, _)| edge_set.contains(&(f.as_str(), t.as_str())))
        .map(|(_, _, freq)| freq)
        .sum::<usize>();
    astar_value(covered, dfg.edges.len(), lambda)
}

/// Exhaustive optimum over ALL edge subsets — the ground-truth oracle for
/// admissibility spot-checks on tiny instances (|DF| ≤ 12).
#[cfg(test)]
fn astar_exhaustive_optimum(log: &EventLog, activity_key: &str) -> f64 {
    let df = log.get_directly_follows(activity_key);
    let total_pairs: usize = df.iter().map(|(_, _, freq)| freq).sum();
    let lambda = astar_lambda(total_pairs, df.len());
    let mut optimum = astar_value(0, 0, lambda);
    for mask in 1..(1usize << df.len()) {
        let mut covered = 0usize;
        let mut selected = 0usize;
        for j in 0..df.len() {
            if mask & (1 << j) != 0 {
                covered += df[j].2;
                selected += 1;
            }
        }
        optimum = optimum.max(astar_value(covered, selected, lambda));
    }
    optimum
}

#[cfg(test)]
mod astar_tests {
    use super::*;
    use crate::models::{AttributeValue, Event, Trace};

    /// Build an EventLog from activity-name traces.
    fn make_log(traces: &[&[&str]]) -> EventLog {
        let mut log = EventLog::default();
        for acts in traces {
            let events = acts
                .iter()
                .map(|a| {
                    let mut attrs = std::collections::BTreeMap::new();
                    attrs.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(a.to_string()),
                    );
                    Event { attributes: attrs }
                })
                .collect();
            log.traces.push(Trace {
                attributes: Default::default(),
                events,
            });
        }
        log
    }

    /// 6 DF edges: 5 freq-4 chain edges + 1 freq-1 edge (P,Q). λ = 0.7.
    /// Value-optimal set = ALL 6 edges (value 16.8). The legacy beam's ad-hoc
    /// score penalizes the (P,Q) edge's inclusion at every depth (Δscore < 0),
    /// so its argmax-score best never contains it (value 16.5) even though the
    /// search witnesses the full optimum within budget (64 subsets < 128 width).
    fn discriminating_log() -> EventLog {
        let mut traces: Vec<&[&str]> = Vec::new();
        for _ in 0..4 {
            traces.push(&["A", "B", "C", "D", "E", "F"][..]);
        }
        traces.push(&["P", "Q"][..]);
        make_log(&traces)
    }

    #[test]
    fn astar_matches_exhaustive_optimum_on_tiny_logs() {
        let logs: Vec<EventLog> = vec![
            make_log(&[&["A", "B", "C"]]),
            make_log(&[&["A", "B", "C"], &["A", "C"]]),
            make_log(&vec![&["A", "B", "C"][..]; 3]),
            make_log(&vec![&["A", "B", "C", "D"][..]; 5]),
            discriminating_log(),
        ];
        for log in &logs {
            let (dfg, _iters) = discover_astar_from_log(log, "concept:name", 10_000);
            let got = astar_value_of_dfg(&dfg, log, "concept:name");
            let want = astar_exhaustive_optimum(log, "concept:name");
            assert!(
                (got - want).abs() < 1e-9,
                "A* value {got} != exhaustive optimum {want}"
            );
        }
    }

    #[test]
    fn astar_root_heuristic_is_admissible_upper_bound() {
        // h(root) = Σ max(freq − λ, 0) must never underestimate the optimal
        // achievable value (f(root) = h(root) is the exact optimum here, but
        // the admissibility claim is checked against the exhaustive oracle).
        let log = discriminating_log();
        let df = log.get_directly_follows("concept:name");
        let total_pairs: usize = df.iter().map(|(_, _, f)| f).sum();
        let lambda = astar_lambda(total_pairs, df.len());
        let h_root: f64 = df
            .iter()
            .map(|(_, _, f)| (*f as f64 - lambda).max(0.0))
            .sum();
        let optimum = astar_exhaustive_optimum(&log, "concept:name");
        assert!(
            h_root >= optimum - 1e-9,
            "root heuristic {h_root} underestimates optimal value {optimum}"
        );
    }

    #[test]
    fn astar_finds_optimum_legacy_beam_misses_at_equal_budget() {
        let log = discriminating_log();
        let budget = 200; // legacy beam witnesses all 64 subsets well within this
        let (astar_dfg, _) = discover_astar_from_log(&log, "concept:name", budget);
        let (beam_dfg, _) = discover_beam_from_log(&log, "concept:name", budget);
        let astar_v = astar_value_of_dfg(&astar_dfg, &log, "concept:name");
        let beam_v = astar_value_of_dfg(&beam_dfg, &log, "concept:name");
        let optimum = astar_exhaustive_optimum(&log, "concept:name");
        assert!((astar_v - optimum).abs() < 1e-9, "A* missed optimum: {astar_v} != {optimum}");
        assert!(
            beam_v < astar_v - 1e-9,
            "legacy beam unexpectedly matched optimal A* value: beam {beam_v} vs astar {astar_v}"
        );
    }

    #[test]
    fn astar_double_run_is_deterministic() {
        let log = discriminating_log();
        let (a, ia) = discover_astar_from_log(&log, "concept:name", 500);
        let (b, ib) = discover_astar_from_log(&log, "concept:name", 500);
        assert_eq!(ia, ib, "expansion counts differ between runs");
        assert_eq!(a.edges.len(), b.edges.len());
        for (ea, eb) in a.edges.iter().zip(b.edges.iter()) {
            assert_eq!((ea.from.as_str(), ea.to.as_str()), (eb.from.as_str(), eb.to.as_str()));
            assert_eq!(ea.frequency, eb.frequency);
        }
    }

    #[test]
    fn bounded_astar_beam_width_degenerates_but_stays_valid() {
        // With an explicit width bound the search is beam search (bounded A*):
        // no optimality guarantee, but the result must remain a feasible subset.
        let log = discriminating_log();
        let (dfg, iters) =
            discover_astar_bounded_from_log(&log, "concept:name", 200, Some(1));
        assert!(iters <= 200);
        let v = astar_value_of_dfg(&dfg, &log, "concept:name");
        let optimum = astar_exhaustive_optimum(&log, "concept:name");
        assert!(v <= optimum + 1e-9);
    }
}
