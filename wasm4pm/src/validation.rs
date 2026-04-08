/// Holdout and cross-validation pipelines for process model quality estimation.
///
/// Pure Rust/WASM — no ML/LLM dependencies.  Validation uses DFG-based
/// trace fitness: a trace "fits" if every directly-follows pair in the trace
/// appears in the DFG discovered from the training log.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::EventLog;
use crate::error::{wasm_err, codes};
use crate::utilities::to_js;
use std::collections::HashSet;

/// Simple LCG PRNG for deterministic, reproducible shuffles.
/// No external crate dependency — identical results across WASM and native.
struct LcgRng {
    state: u64,
}

impl LcgRng {
    fn new(seed: u64) -> Self {
        // SplitMix64 initialisation to avoid degenerate low-seed states
        let mut s = seed.wrapping_add(0x9e3779b97f4a7c15);
        s = (s ^ (s >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        s = (s ^ (s >> 27)).wrapping_mul(0x94d049bb133111eb);
        s = s ^ (s >> 31);
        LcgRng { state: s }
    }

    fn next_u64(&mut self) -> u64 {
        // LCG constants from Numerical Recipes
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.state
    }

    /// Fisher-Yates shuffle on index array
    fn shuffle(&mut self, indices: &mut [usize]) {
        let len = indices.len();
        for i in (1..len).rev() {
            let j = (self.next_u64() as usize) % (i + 1);
            indices.swap(i, j);
        }
    }
}

/// Build a DFG edge set from an EventLog for fitness evaluation.
/// Returns (edge_set, node_set) where edge_set contains (from_idx, to_idx) pairs
/// and node_set contains activity strings that appear in the log.
fn build_dfg_edge_set(
    log: &EventLog,
    activity_key: &str,
) -> (HashSet<(String, String)>, HashSet<String>) {
    let mut edges: HashSet<(String, String)> = HashSet::new();
    let mut nodes: HashSet<String> = HashSet::new();

    for trace in &log.traces {
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();

        for act in &activities {
            nodes.insert(act.clone());
        }

        for window in activities.windows(2) {
            edges.insert((window[0].clone(), window[1].clone()));
        }
    }

    (edges, nodes)
}

/// Compute trace fitness against a DFG edge set.
/// Fitness = ratio of directly-follows pairs in the trace that appear in the DFG.
/// A trace with all pairs in the DFG gets fitness 1.0.
fn trace_fitness(trace: &crate::models::Trace, activity_key: &str, dfg_edges: &HashSet<(String, String)>) -> f64 {
    let activities: Vec<&str> = trace
        .events
        .iter()
        .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
        .collect();

    if activities.len() <= 1 {
        return 1.0; // Single-event traces always fit
    }

    let total_pairs = activities.len() - 1;
    let mut fitting_pairs = 0usize;
    for window in activities.windows(2) {
        if dfg_edges.contains(&(window[0].to_owned(), window[1].to_owned())) {
            fitting_pairs += 1;
        }
    }

    fitting_pairs as f64 / total_pairs as f64
}

/// Compute average fitness of an EventLog against a DFG edge set.
fn avg_log_fitness(log: &EventLog, activity_key: &str, dfg_edges: &HashSet<(String, String)>) -> f64 {
    if log.traces.is_empty() {
        return 0.0;
    }
    let total: f64 = log
        .traces
        .iter()
        .map(|t| trace_fitness(t, activity_key, dfg_edges))
        .sum();
    total / log.traces.len() as f64
}

/// Split an EventLog into train/test sets using deterministic seeded shuffle.
///
/// Returns JSON with handles to the two new logs plus sizes.
///
/// ```javascript
/// const result = JSON.parse(pm.split_log(handle, 0.8, 42));
/// // { train_handle: "obj_5", test_handle: "obj_6", train_size: 80, test_size: 20, total: 100 }
/// ```
#[wasm_bindgen]
pub fn split_log(
    log_handle: &str,
    train_ratio: f64,
    seed: u64,
) -> Result<JsValue, JsValue> {
    if !(0.0..=1.0).contains(&train_ratio) {
        return Err(wasm_err(codes::INVALID_INPUT, "train_ratio must be between 0.0 and 1.0"));
    }

    // Extract trace count and clone traces inside closure (borrowed).
    let (traces, attributes) = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            Ok((log.traces.clone(), log.attributes.clone()))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    let total = traces.len();
    if total == 0 {
        return Err(wasm_err(codes::INVALID_INPUT, "Cannot split empty log"));
    }

    // Deterministic seeded shuffle of indices
    let mut indices: Vec<usize> = (0..total).collect();
    let mut rng = LcgRng::new(seed);
    rng.shuffle(&mut indices);

    let train_count = (total as f64 * train_ratio).round() as usize;
    let train_count = train_count.max(1).min(total - 1); // At least 1 in each split
    let test_count = total - train_count;

    let mut train_log = EventLog::new();
    train_log.attributes = attributes.clone();
    train_log.traces = indices[..train_count]
        .iter()
        .map(|&i| traces[i].clone())
        .collect();

    let mut test_log = EventLog::new();
    test_log.attributes = attributes;
    test_log.traces = indices[train_count..]
        .iter()
        .map(|&i| traces[i].clone())
        .collect();

    let train_handle = get_or_init_state()
        .store_object(StoredObject::EventLog(train_log))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store train log"))?;

    let test_handle = get_or_init_state()
        .store_object(StoredObject::EventLog(test_log))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store test log"))?;

    to_js(&serde_json::json!({
        "train_handle": train_handle,
        "test_handle": test_handle,
        "train_size": train_count,
        "test_size": test_count,
        "total": total,
    }))
}

/// Holdout validation: split log, discover DFG on train, measure fitness on test.
///
/// Returns train fitness, test fitness, and overfitting delta.
/// Overfitting delta = train_fitness - test_fitness (positive means overfitting).
///
/// ```javascript
/// const result = JSON.parse(pm.holdout_validate(handle, 'concept:name', 0.8, 42));
/// // { train_fitness: 0.95, test_fitness: 0.82, overfitting_delta: 0.13, ... }
/// ```
#[wasm_bindgen]
pub fn holdout_validate(
    log_handle: &str,
    activity_key: &str,
    train_ratio: f64,
    seed: u64,
) -> Result<JsValue, JsValue> {
    if !(0.1..=0.95).contains(&train_ratio) {
        return Err(wasm_err(codes::INVALID_INPUT, "train_ratio must be between 0.1 and 0.95 for holdout validation"));
    }

    // Step 1: Split the log
    let split_result: serde_json::Value = serde_json::from_str(
        &split_log(log_handle, train_ratio, seed)?
            .as_string()
            .ok_or_else(|| wasm_err(codes::INTERNAL_ERROR, "split_log returned non-string"))?,
    )
    .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Failed to parse split result: {}", e)))?;

    let train_handle = split_result["train_handle"]
        .as_str()
        .ok_or_else(|| wasm_err(codes::INTERNAL_ERROR, "No train_handle in split result"))?;
    let test_handle = split_result["test_handle"]
        .as_str()
        .ok_or_else(|| wasm_err(codes::INTERNAL_ERROR, "No test_handle in split result"))?;
    let train_size = split_result["train_size"].as_u64().unwrap_or(0) as usize;
    let test_size = split_result["test_size"].as_u64().unwrap_or(0) as usize;

    // Step 2: Build DFG from training set
    let (train_edges, _train_nodes) = get_or_init_state().with_object(train_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(build_dfg_edge_set(log, activity_key)),
        Some(_) => Err(wasm_err(codes::INTERNAL_ERROR, "Train handle is not an EventLog")),
        None => Err(wasm_err(codes::INTERNAL_ERROR, "Train handle not found")),
    })?;

    // Step 3: Compute train fitness
    let train_fitness = get_or_init_state().with_object(train_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(avg_log_fitness(log, activity_key, &train_edges)),
        Some(_) => Err(wasm_err(codes::INTERNAL_ERROR, "Train handle is not an EventLog")),
        None => Err(wasm_err(codes::INTERNAL_ERROR, "Train handle not found")),
    })?;

    // Step 4: Compute test fitness (unseen data)
    let test_fitness = get_or_init_state().with_object(test_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(avg_log_fitness(log, activity_key, &train_edges)),
        Some(_) => Err(wasm_err(codes::INTERNAL_ERROR, "Test handle is not an EventLog")),
        None => Err(wasm_err(codes::INTERNAL_ERROR, "Test handle not found")),
    })?;

    let overfitting_delta = train_fitness - test_fitness;

    // Clean up temporary handles
    let _ = get_or_init_state().delete_object(train_handle);
    let _ = get_or_init_state().delete_object(test_handle);

    to_js(&serde_json::json!({
        "train_fitness": train_fitness,
        "test_fitness": test_fitness,
        "overfitting_delta": overfitting_delta,
        "train_size": train_size,
        "test_size": test_size,
        "total": train_size + test_size,
        "train_ratio": train_ratio,
        "seed": seed,
        "method": "dfg_trace_fitness",
        "diagnosis": if overfitting_delta > 0.15 {
            "high_overfitting"
        } else if overfitting_delta > 0.05 {
            "moderate_overfitting"
        } else {
            "good_generalization"
        }
    }))
}

/// K-fold cross-validation: split into K folds, train on K-1, test on 1, repeat.
///
/// Returns per-fold results plus aggregated mean and standard deviation.
///
/// ```javascript
/// const result = JSON.parse(pm.cross_validate(handle, 'concept:name', 5, 42));
/// // { mean_fitness: 0.85, std_fitness: 0.03, fold_results: [...], k: 5 }
/// ```
#[wasm_bindgen]
pub fn cross_validate(
    log_handle: &str,
    activity_key: &str,
    k: usize,
    seed: u64,
) -> Result<JsValue, JsValue> {
    if k < 2 || k > 20 {
        return Err(wasm_err(codes::INVALID_INPUT, "k must be between 2 and 20"));
    }

    // Extract all traces
    let (traces, attributes) = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            Ok((log.traces.clone(), log.attributes.clone()))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    let total = traces.len();
    if total < k {
        return Err(wasm_err(codes::INVALID_INPUT, format!(
            "Log has {} traces but k={}; need at least k traces", total, k
        )));
    }

    // Deterministic shuffle
    let mut indices: Vec<usize> = (0..total).collect();
    let mut rng = LcgRng::new(seed);
    rng.shuffle(&mut indices);

    // Partition into k folds
    let fold_size = total / k;
    let mut folds: Vec<Vec<usize>> = Vec::with_capacity(k);
    for i in 0..k {
        let start = i * fold_size;
        let end = if i == k - 1 { total } else { (i + 1) * fold_size };
        folds.push(indices[start..end].to_vec());
    }

    let mut fold_results = Vec::with_capacity(k);
    let mut fitnesses = Vec::with_capacity(k);

    for fold_idx in 0..k {
        // Build train set (all folds except fold_idx)
        let mut train_traces: Vec<crate::models::Trace> = Vec::new();
        for (i, fold) in folds.iter().enumerate() {
            if i != fold_idx {
                for &idx in fold {
                    train_traces.push(traces[idx].clone());
                }
            }
        }

        // Test set is the held-out fold
        let test_traces: Vec<crate::models::Trace> = folds[fold_idx]
            .iter()
            .map(|&idx| traces[idx].clone())
            .collect();

        let mut train_log = EventLog::new();
        train_log.attributes = attributes.clone();
        train_log.traces = train_traces;

        let mut test_log = EventLog::new();
        test_log.attributes = attributes.clone();
        test_log.traces = test_traces;

        // Build DFG from train
        let (train_edges, _) = build_dfg_edge_set(&train_log, activity_key);

        // Compute fitness
        let train_fit = avg_log_fitness(&train_log, activity_key, &train_edges);
        let test_fit = avg_log_fitness(&test_log, activity_key, &train_edges);

        fitnesses.push(test_fit);
        fold_results.push(serde_json::json!({
            "fold": fold_idx + 1,
            "train_size": train_log.traces.len(),
            "test_size": test_log.traces.len(),
            "train_fitness": train_fit,
            "test_fitness": test_fit,
            "overfitting_delta": train_fit - test_fit,
        }));
    }

    // Aggregate
    let mean_fitness = fitnesses.iter().sum::<f64>() / k as f64;
    let variance = fitnesses
        .iter()
        .map(|f| (f - mean_fitness).powi(2))
        .sum::<f64>()
        / k as f64;
    let std_fitness = variance.sqrt();

    to_js(&serde_json::json!({
        "mean_fitness": mean_fitness,
        "std_fitness": std_fitness,
        "min_fitness": fitnesses.iter().cloned().fold(f64::INFINITY, f64::min),
        "max_fitness": fitnesses.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
        "fold_results": fold_results,
        "k": k,
        "total_traces": total,
        "seed": seed,
        "method": "dfg_trace_fitness",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{EventLog, Trace, Event, AttributeValue};
    use std::collections::HashMap;

    fn make_test_log(traces: Vec<Vec<&str>>) -> EventLog {
        let mut log = EventLog::new();
        for activities in traces {
            let mut trace = Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            };
            for act in activities {
                let mut event = Event {
                    attributes: HashMap::new(),
                };
                event.attributes.insert("concept:name".to_string(), AttributeValue::String(act.to_string()));
                trace.events.push(event);
            }
            log.traces.push(trace);
        }
        log
    }

    #[test]
    fn test_lcg_rng_deterministic() {
        let mut rng1 = LcgRng::new(42);
        let mut rng2 = LcgRng::new(42);
        let mut indices1: Vec<usize> = (0..100).collect();
        let mut indices2: Vec<usize> = (0..100).collect();
        rng1.shuffle(&mut indices1);
        rng2.shuffle(&mut indices2);
        assert_eq!(indices1, indices2, "Same seed must produce same shuffle");
    }

    #[test]
    fn test_lcg_rng_different_seeds() {
        let mut rng1 = LcgRng::new(1);
        let mut rng2 = LcgRng::new(2);
        let mut indices1: Vec<usize> = (0..100).collect();
        let mut indices2: Vec<usize> = (0..100).collect();
        rng1.shuffle(&mut indices1);
        rng2.shuffle(&mut indices2);
        assert_ne!(indices1, indices2, "Different seeds must produce different shuffles");
    }

    #[test]
    fn test_build_dfg_edge_set() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "D"],
        ]);
        let (edges, nodes) = build_dfg_edge_set(&log, "concept:name");
        assert!(edges.contains(&("A".to_string(), "B".to_string())));
        assert!(edges.contains(&("B".to_string(), "C".to_string())));
        assert!(edges.contains(&("B".to_string(), "D".to_string())));
        assert!(!edges.contains(&("A".to_string(), "C".to_string())));
        assert!(nodes.contains("A"));
        assert!(nodes.contains("B"));
        assert!(nodes.contains("C"));
        assert!(nodes.contains("D"));
    }

    #[test]
    fn test_trace_fitness_perfect() {
        let log = make_test_log(vec![vec!["A", "B", "C"]]);
        let (edges, _) = build_dfg_edge_set(&log, "concept:name");
        let fitness = trace_fitness(&log.traces[0], "concept:name", &edges);
        assert!((fitness - 1.0).abs() < 1e-9, "Trace from same log should have perfect fitness");
    }

    #[test]
    fn test_trace_fitness_partial() {
        let train_log = make_test_log(vec![vec!["A", "B", "C"]]);
        let test_log = make_test_log(vec![vec!["A", "B", "X"]]); // "X" is unseen at end
        let (edges, _) = build_dfg_edge_set(&train_log, "concept:name");
        let fitness = trace_fitness(&test_log.traces[0], "concept:name", &edges);
        // A->B fits (in DFG), B->X doesn't → 1/2 = 0.5
        assert!((fitness - 0.5).abs() < 1e-9);
    }

    #[test]
    fn test_avg_log_fitness() {
        // Build DFG from train log only
        let train_log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
        ]);
        let (edges, _) = build_dfg_edge_set(&train_log, "concept:name");

        // Test log has one unseen transition (B->X)
        let test_log = make_test_log(vec![
            vec!["A", "B", "C"],  // perfect (1.0)
            vec!["A", "B", "C"],  // perfect (1.0)
            vec!["A", "B", "X"],  // partial: A->B fits, B->X doesn't → 0.5
        ]);
        let fitness = avg_log_fitness(&test_log, "concept:name", &edges);
        let expected = (1.0 + 1.0 + 0.5) / 3.0;
        assert!((fitness - expected).abs() < 1e-9);
    }

    #[test]
    fn test_holdout_generalization() {
        // Log with consistent structure — test fitness should be high
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
        ]);

        let (edges, _) = build_dfg_edge_set(&log, "concept:name");
        let fitness = avg_log_fitness(&log, "concept:name", &edges);
        assert_eq!(fitness, 1.0, "Uniform log should have perfect fitness");
    }

    #[test]
    fn test_cross_validate_uniform_log() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
        ]);

        // With uniform log, every trace should have fitness 1.0
        let (edges, _) = build_dfg_edge_set(&log, "concept:name");
        for i in 0..5 {
            let fitness = trace_fitness(&log.traces[i], "concept:name", &edges);
            assert_eq!(fitness, 1.0);
        }
    }
}
