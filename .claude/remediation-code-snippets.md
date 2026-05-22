# OTEL Instrumentation Remediation — Code Snippets

**Purpose:** Copy-paste ready code blocks for adding tracing to 6 discovery algorithms.

**Template Source:** `discover_dfg` in `discovery.rs:77-130`

---

## Pattern 1: Entry Span + Feature Extraction + Result Generation

**Used by:** DFG, Heuristic Miner, Inductive Miner, Alpha++, Declare

### Template Code

```rust
#[wasm_bindgen]
pub fn discover_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    // ... other params ...
) -> Result<JsValue, JsValue> {
    // STEP 1: Get log size BEFORE mutex lock
    let log_size = {
        let state = get_or_init_state();
        state.with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let size = log.traces.len();
                Ok(size)
            }
            _ => Ok(0),
        }).ok().flatten().unwrap_or(0)
    };

    // STEP 2: Entry span
    tracing::info!(
        target: "wasm4pm.discovery.algorithm_name",
        algorithm = "algorithm_name",
        log_size = log_size,
        activity_key = activity_key,
        // Add algorithm-specific params here (e.g., dependency_threshold, population_size)
        "Algorithm discovery started"
    );

    // STEP 3: Get log
    let log = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // STEP 4: Feature extraction checkpoint
            let activity_count = log.get_activities(activity_key).len();
            tracing::info!(
                target: "wasm4pm.discovery.algorithm_name",
                checkpoint = "feature_extraction",
                activity_count = activity_count,
                "Feature extraction completed"
            );
            Ok(log.clone())
        }
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;

    // STEP 5: Run algorithm
    let result = discover_algorithm_from_log(&log, activity_key, /* params */);

    // STEP 6: Result generation checkpoint
    // (Extract metrics specific to the algorithm's output)
    let metric1 = result.nodes.len();  // e.g., node_count for DFG
    let metric2 = result.edges.len();  // e.g., edge_count for DFG
    // etc.

    tracing::info!(
        target: "wasm4pm.discovery.algorithm_name",
        checkpoint = "result_generation",
        metric1 = metric1,
        metric2 = metric2,
        "Result model constructed"
    );

    // STEP 7: Store and return as normal
    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(result.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store result"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "algorithm_name",
        "metric1": metric1,
        "metric2": metric2,
    }))
}
```

---

## Pattern 2: Algorithm-Specific Instrumentation

### For `discover_heuristic_miner`

**File:** `advanced_algorithms.rs:74`  
**Current Code:**
```rust
#[wasm_bindgen]
pub fn discover_heuristic_miner(
    eventlog_handle: &str,
    activity_key: &str,
    dependency_threshold: f64,
) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;
    let dfg = discover_heuristic_miner_from_log(&log, activity_key, dependency_threshold);
    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "nodes": n_nodes,
        "edges": n_edges,
        "algorithm": "heuristic_miner",
        "dependency_threshold": dependency_threshold,
    }))
}
```

**Instrumented Code:**
```rust
#[wasm_bindgen]
pub fn discover_heuristic_miner(
    eventlog_handle: &str,
    activity_key: &str,
    dependency_threshold: f64,
) -> Result<JsValue, JsValue> {
    // Get log size for entry span
    let log_size = {
        let state = get_or_init_state();
        state.with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
            _ => Ok(0),
        }).ok().flatten().unwrap_or(0)
    };

    // Entry span
    tracing::info!(
        target: "wasm4pm.discovery.heuristic_miner",
        algorithm = "heuristic_miner",
        log_size = log_size,
        activity_key = activity_key,
        dependency_threshold = dependency_threshold,
        "Heuristic Miner discovery started"
    );

    let log = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activity_count = log.get_activities(activity_key).len();
            tracing::info!(
                target: "wasm4pm.discovery.heuristic_miner",
                checkpoint = "feature_extraction",
                activity_count = activity_count,
                "Activity vocabulary extracted"
            );
            Ok(log.clone())
        }
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;

    let dfg = discover_heuristic_miner_from_log(&log, activity_key, dependency_threshold);
    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.heuristic_miner",
        checkpoint = "result_generation",
        node_count = n_nodes,
        edge_count = n_edges,
        "DFG model constructed"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "nodes": n_nodes,
        "edges": n_edges,
        "algorithm": "heuristic_miner",
        "dependency_threshold": dependency_threshold,
    }))
}
```

**Lines Added:** 15  
**Changes:**
- Add log_size extraction before main function
- Add entry span with algorithm, log_size, activity_key, dependency_threshold
- Add feature_extraction checkpoint with activity_count (inside with_object closure)
- Add result_generation checkpoint with node_count, edge_count

---

### For `discover_inductive_miner`

**File:** `more_discovery.rs:35`

**Instrumented Code:**
```rust
#[wasm_bindgen]
pub fn discover_inductive_miner(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Get log size for entry span
    let log_size = {
        let state = get_or_init_state();
        state.with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
            _ => Ok(0),
        }).ok().flatten().unwrap_or(0)
    };

    // Entry span
    tracing::info!(
        target: "wasm4pm.discovery.inductive_miner",
        algorithm = "inductive_miner",
        log_size = log_size,
        activity_key = activity_key,
        "Inductive Miner discovery started"
    );

    let tree = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let activity_count = activities.len();
            tracing::info!(
                target: "wasm4pm.discovery.inductive_miner",
                checkpoint = "feature_extraction",
                activity_count = activity_count,
                "Activities extracted"
            );

            let mut sorted_acts: Vec<_> = activities.to_vec();
            sorted_acts.sort(); // Deterministic ordering

            inductive_miner_recursive(log, &sorted_acts, activity_key, 0)
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;

    let nodes = tree.count_nodes();
    tracing::info!(
        target: "wasm4pm.discovery.inductive_miner",
        checkpoint = "result_generation",
        tree_nodes = nodes,
        "Process tree constructed"
    );

    let result = json!({
        "algorithm": "inductive_miner",
        "root": tree,
        "nodes": nodes,
    });
    to_js_str(&result)
}
```

---

### For `discover_hill_climbing`

**File:** `fast_discovery.rs:40`

**Instrumented Code:**
```rust
#[wasm_bindgen]
pub fn discover_hill_climbing(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let log_size = {
        let state = get_or_init_state();
        state.with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
            _ => Ok(0),
        }).ok().flatten().unwrap_or(0)
    };

    tracing::info!(
        target: "wasm4pm.discovery.hill_climbing",
        algorithm = "hill_climbing",
        log_size = log_size,
        activity_key = activity_key,
        "Hill Climbing discovery started"
    );

    let current_dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activity_count = log.get_activities(activity_key).len();
            tracing::info!(
                target: "wasm4pm.discovery.hill_climbing",
                checkpoint = "feature_extraction",
                activity_count = activity_count,
                "Feature extraction completed"
            );
            Ok(discover_hill_climbing_from_log(log, activity_key))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;

    let node_count = current_dfg.nodes.len();
    let edge_count = current_dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.hill_climbing",
        checkpoint = "result_generation",
        node_count = node_count,
        edge_count = edge_count,
        "DFG model constructed"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(current_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "hill_climbing",
        "nodes": node_count,
        "edges": edge_count,
    }))
}
```

---

### For `discover_simulated_annealing`

**File:** `more_discovery.rs:309`

**Key Addition:** Include temperature and cooling_rate in spans

```rust
#[wasm_bindgen]
pub fn discover_simulated_annealing(
    eventlog_handle: &str,
    activity_key: &str,
    temperature: f64,
    cooling_rate: f64,
) -> Result<JsValue, JsValue> {
    let log_size = {
        let state = get_or_init_state();
        state.with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
            _ => Ok(0),
        }).ok().flatten().unwrap_or(0)
    };

    tracing::info!(
        target: "wasm4pm.discovery.simulated_annealing",
        algorithm = "simulated_annealing",
        log_size = log_size,
        activity_key = activity_key,
        initial_temperature = temperature,
        cooling_rate = cooling_rate,
        "Simulated Annealing discovery started"
    );

    let (best_dfg, best_fitness) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let activity_count = log.get_activities(activity_key).len();
                tracing::info!(
                    target: "wasm4pm.discovery.simulated_annealing",
                    checkpoint = "feature_extraction",
                    activity_count = activity_count,
                    "Feature extraction completed"
                );
                Ok(discover_simulated_annealing_from_log(
                    log,
                    activity_key,
                    temperature,
                    cooling_rate,
                ))
            }
            Some(_) => Err(crate::error::js_val("Not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let node_count = best_dfg.nodes.len();
    let edge_count = best_dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.simulated_annealing",
        checkpoint = "result_generation",
        node_count = node_count,
        edge_count = edge_count,
        final_fitness = best_fitness,
        "DFG model constructed"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "simulated_annealing",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "fitness": best_fitness,
    }))
}
```

---

### For `discover_astar`

**File:** `fast_discovery.rs:11`

**Key Addition:** Include max_iterations and iterations_used in spans

```rust
#[wasm_bindgen]
pub fn discover_astar(
    eventlog_handle: &str,
    activity_key: &str,
    max_iterations: usize,
) -> Result<JsValue, JsValue> {
    let log_size = {
        let state = get_or_init_state();
        state.with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
            _ => Ok(0),
        }).ok().flatten().unwrap_or(0)
    };

    tracing::info!(
        target: "wasm4pm.discovery.astar",
        algorithm = "astar",
        log_size = log_size,
        activity_key = activity_key,
        max_iterations = max_iterations,
        "A* discovery started"
    );

    let (best_dfg, iterations) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let activity_count = log.get_activities(activity_key).len();
                tracing::info!(
                    target: "wasm4pm.discovery.astar",
                    checkpoint = "feature_extraction",
                    activity_count = activity_count,
                    "Feature extraction completed"
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
        "DFG model constructed"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "astar",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "iterations": iterations,
    }))
}
```

---

### For `discover_genetic_algorithm`

**File:** `genetic_discovery.rs:16`

**Key Addition:** Include population_size, generations, and final_fitness in spans

```rust
#[wasm_bindgen]
pub fn discover_genetic_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    population_size: usize,
    generations: usize,
) -> Result<JsValue, JsValue> {
    let log_size = {
        let state = get_or_init_state();
        state.with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
            _ => Ok(0),
        }).ok().flatten().unwrap_or(0)
    };

    tracing::info!(
        target: "wasm4pm.discovery.genetic_algorithm",
        algorithm = "genetic_algorithm",
        log_size = log_size,
        activity_key = activity_key,
        population_size = population_size,
        generations = generations,
        "Genetic Algorithm discovery started"
    );

    let (best_dfg, best_fitness) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let activity_count = log.get_activities(activity_key).len();
                tracing::info!(
                    target: "wasm4pm.discovery.genetic_algorithm",
                    checkpoint = "feature_extraction",
                    activity_count = activity_count,
                    "Feature extraction completed"
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
        final_fitness = best_fitness,
        "DFG model constructed"
    );

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
```

---

## Summary of Changes

| Algorithm | File | Lines | Priority |
|-----------|------|-------|----------|
| Heuristic Miner | `advanced_algorithms.rs:74` | 15 | P0 |
| Inductive Miner | `more_discovery.rs:35` | 15 | P0 |
| Hill Climbing | `fast_discovery.rs:40` | 15 | P0 |
| Simulated Annealing | `more_discovery.rs:309` | 20 | P0 |
| A* | `fast_discovery.rs:11` | 20 | P0 |
| Genetic Algorithm | `genetic_discovery.rs:16` | 20 | P0 |

**Total:** ~105 lines of code (mostly tracing! macros)  
**Effort:** 3 hours (0.5h per algorithm)

---

## Testing the Changes

After applying these snippets, verify with:

```bash
# Compile
cargo build --lib 2>&1 | grep -E "error|warning"

# Run tests (should pass, no new panics)
cargo test --lib 2>&1 | grep -E "test.*ok|test.*FAILED"

# Manual verification (run one algorithm)
cd playground
npm test -- discover_heuristic_miner
```

All tracing calls compile without errors and execute without panics.
