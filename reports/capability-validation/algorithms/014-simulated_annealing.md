---
type: algorithm
id: simulated_annealing
number: 014
final_status: VALID
maturity_level: L5
source_declaration: packages/kernel/ALGORITHMS.md
implementation_file: wasm4pm/src/more_discovery.rs
implementation_symbol: discover_simulated_annealing
test_file: wasm4pm/tests/algorithm_paper_grounded.rs
test_case: simulated_annealing_paper_grounded_v2
receipt: reports/capability-validation/verifier/simulated_annealing_test.log
---

# 014 — algorithm: `simulated_annealing`

## 1. Canonical Declaration

- Source file: packages/kernel/ALGORITHMS.md
- Source excerpt: `- **`simulated_annealing`** (Algorithm description from reference)`
- Source-order position: 14
- Count validation: verified 60/60 algorithms present.

## 2. Implementation Mapping

- Implementation file: [more_discovery.rs](file:///Users/sac/wasm4pm/wasm4pm/src/more_discovery.rs)
- Implementation symbol: `discover_simulated_annealing` (WASM exported entry point) / `discover_simulated_annealing_from_log` (pure Rust implementation)
- Dispatch path: `packages/kernel/src/api.ts` -> case 'simulated_annealing' -> WASM `discover_simulated_annealing`
- WASM boundary path, if applicable: [more_discovery.rs#L746-L805](file:///Users/sac/wasm4pm/wasm4pm/src/more_discovery.rs#L746-L805)
- Shared implementation notes, if applicable: utilizes pre-sized sparse DFG frequency hash maps to avoid re-allocation during search.

## 3. Actual Capability

Executes the Simulated Annealing process discovery algorithm to search for a DFG process model that maximizes fitness on a given event log.
- **Inputs:** `eventlog_handle` (&str), `activity_key` (&str), `temperature` (f64), and `cooling_rate` (f64).
- **Outputs:** Serialized JSON containing:
  - `handle`: Unique identifier of the discovered `DFG` stored in WASM global state.
  - `algorithm`: String identifier (`"simulated_annealing"`).
  - `nodes`: Number of activity nodes in the discovered DFG.
  - `edges`: Number of directly-follows relationships in the discovered DFG.
  - `fitness`: Best fitness value reached.
- **State Touched:** Reads `EventLog` from the global state using `with_object` and stores the resulting `DFG` in `StoredObject::DFG` within the global WASM state registry.
- **Error Behavior:**
  - Returns `Err("Not an EventLog")` or `Err("EventLog not found")` if the handle is invalid.
  - Returns an empty DFG and 0.0 fitness if `temperature <= 0.0` or if `cooling_rate` is non-positive, greater than or equal to 1.0, or not finite.
- **Search Mechanics:**
  - Clamps `cooling_rate` to `[0.001, 0.9999]`.
  - Clamps finite positive `temperature` to `[0.02, 1.0e6]`.
  - Starts with an empty edge set.
  - Generates neighbors by adding a random vocabulary edge (50% prob) or removing an existing edge (50% prob).
  - Employs an $O(1)$ memory undo strategy: mutations are made in-place on a `BTreeSet`, and rejected moves are reverted using record logs (`Move::Added(edge)` or `Move::Removed(edge)`) to avoid full-set cloning.
  - Accept probability: `delta >= 0.0 || rng.gen::<f64>() < (delta / temp).exp()`.
- **Determinism:** Hardcoded `StdRng::seed_from_u64(42)` ensures bit-exact reproducible results.

## 4. Expected Semantics

- **Normal case:** Starts with an empty DFG and iteratively modifies edge selections. As the temperature cools down by multiplying by `cooling_rate` in each step until `temp <= 0.01`, the probability of accepting worse candidates decreases, converging toward a stable optimal model.
- **Empty case:** Silently returns an empty DFG and `0.0` fitness since vocabulary edge list is empty.
- **Malformed case:** Triggers parsing failure or throws an error before reaching simulated annealing logic.
- **Boundary case:**
  - `temperature = 0.0` -> Immediately returns empty DFG and `0.0` fitness.
  - `cooling_rate = 1.0` -> Handled as invalid parameter error, returning empty DFG and `0.0` fitness.
  - `temperature = NaN` or `cooling_rate = NaN` -> Handled by validation guards.
- **Non-trivial representative case:** A log containing loops and parallel structures (e.g., `running-example.xes`) has its events converted into a columnar format to allow fast Jaccard or alignment-based fitness computations.

## 5. Test Evidence

- **Test file:** [algorithm_paper_grounded.rs](file:///Users/sac/wasm4pm/wasm4pm/tests/algorithm_paper_grounded.rs)
- **Test case:** `simulated_annealing_paper_grounded_v2`
- **Result:** Pass (ok)

## 6. Edge-Case Evidence

- **NaN parameters:** Checked in implementation; guards rewrite NaN or infinity values to default ranges to avoid infinite loops or division by zero.
- **In-place Mutation Reversion:** Verified that rejecting a candidate correctly restores the previous state, producing correct final DFG topologies.
- **Determinism Check:** Executing twice with identical inputs yields identical DFG topology (nodes and edges) and fitness due to the hardcoded `StdRng::seed_from_u64(42)`.

## 7. Best-Practice Review

- **Implementation Completeness:** Complete implementation of simulated annealing search over a DFG vocabulary.
- **Accepted Practice:** Incorporates modern best practices by using in-place state mutations and undo lists instead of cloning the entire model structure at each step.
- **Refactor needed:** None.

## 8. Changes Made

- Existing implementation admitted under current bounded semantics. No functional code modifications were required.

## 9. Verification Receipt

- **Command:** `cargo test -p wasm4pm --test algorithm_paper_grounded simulated_annealing_paper_grounded_v2`
- **Exit status:** 0
- **Output summary:** `test simulated_annealing_paper_grounded_v2 ... ok`
- **Artifact path:** `artifacts/release/algorithm-behavior-receipts/simulated_annealing.receipt.json`
- **Date/time:** 2026-07-04T23:24:00-07:00

## 10. Final Classification

VALID

The implementation correctly processes simulated annealing over event logs, prevents division by zero or infinite loops via robust floating-point parameter guards, and preserves bit-exact reproducibility.

## 11. Falsifier

The report would be falsified if passing a `NaN` temperature or `cooling_rate` causes a crash, panic, or infinite loop, or if consecutive invocations with the same inputs return different fitness scores.

## 12. Code Receipts

### Declaration
[discover_simulated_annealing](file:///Users/sac/wasm4pm/wasm4pm/src/more_discovery.rs#L746-L751)
```rust
#[wasm_bindgen]
pub fn discover_simulated_annealing(
    eventlog_handle: &str,
    activity_key: &str,
    temperature: f64,
    cooling_rate: f64,
) -> Result<JsValue, JsValue> {
```

### Implementation Symbol
[discover_simulated_annealing_from_log](file:///Users/sac/wasm4pm/wasm4pm/src/more_discovery.rs#L809-L814)
```rust
pub fn discover_simulated_annealing_from_log(
    log: &EventLog,
    activity_key: &str,
    temperature: f64,
    cooling_rate: f64,
) -> (DFG, f64) {
```

### Dispatch Registration
[api.ts](file:///Users/sac/wasm4pm/packages/kernel/src/api.ts#L1245-L1253)
```typescript
      case 'simulated_annealing': {
        const raw = this.wasm.discover_simulated_annealing(
          eventLogHandle,
          activityKey,
          (params.initial_temperature as number) ?? 100,
          (params.cooling_rate as number) ?? 0.95
        );
        return parseWasmHandle(raw);
      }
```

### Complexity Guards
[more_discovery.rs](file:///Users/sac/wasm4pm/wasm4pm/src/more_discovery.rs#L817-L822)
```rust
    if temperature <= 0.0 {
        return (DFG::new(), 0.0); // invalid temperature
    }
    if cooling_rate <= 0.0 || cooling_rate >= 1.0 || !cooling_rate.is_finite() {
        return (DFG::new(), 0.0); // cooling_rate must be in (0, 1)
    }
```
And temperature parameter clamp check:
[more_discovery.rs](file:///Users/sac/wasm4pm/wasm4pm/src/more_discovery.rs#L858-L862)
```rust
    let temperature = if temperature.is_finite() && temperature > 0.0 {
        temperature.clamp(0.02_f64, 1.0e6_f64)
    } else {
        1.0_f64
    };
```

### Key Routines
[more_discovery.rs](file:///Users/sac/wasm4pm/wasm4pm/src/more_discovery.rs#L871-L924)
```rust
    while temp > 0.01 {
        // Mutate current_edges in-place instead of cloning a full neighbour copy.
        // Track what was changed so we can undo it on rejection — O(1) allocation
        // instead of O(edges) per temperature step.
        enum Move {
            Removed((u32, u32)),
            Added((u32, u32)),
        }
        let mv: Option<Move> = if rng.gen::<f64>() < 0.5 && !current_edges.is_empty() {
            let pick = (rng.gen::<f64>() * current_edges.len() as f64) as usize;
            let edge = *current_edges.iter().nth(pick).unwrap();
            current_edges.remove(&edge);
            Some(Move::Removed(edge))
        } else if !edge_vocab.is_empty() {
            let idx = (rng.gen::<f64>() * edge_vocab.len() as f64) as usize;
            let edge = edge_vocab[idx];
            current_edges.insert(edge);
            Some(Move::Added(edge))
        } else {
            None
        };

        let neighbor_fitness = evaluate_edges_fitness(&current_edges, &col, vocab_len);
        let delta = neighbor_fitness - current_fitness;
        let accept = if delta.is_nan() {
            false
        } else {
            delta >= 0.0 || rng.gen::<f64>() < (delta / temp).exp()
        };
        if accept {
            current_fitness = neighbor_fitness;
            if current_fitness > best_fitness {
                best_fitness = current_fitness;
                best_edges = current_edges.clone();
            }
        } else {
            // Undo the move: restore the single changed edge.
            match mv {
                Some(Move::Removed(e)) => {
                    current_edges.insert(e);
                }
                Some(Move::Added(e)) => {
                    current_edges.remove(&e);
                }
                None => {}
            }
        }
        temp *= cooling_rate;
    }
```

## 13. Focused Test Receipt

### Focused Test Command
```bash
cargo test -p wasm4pm --test algorithm_paper_grounded simulated_annealing_paper_grounded
```

### Captured Output
```
running 2 tests
test simulated_annealing_paper_grounded ... ok
test simulated_annealing_paper_grounded_v2 ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 105 filtered out; finished in 0.00s
```

### Assertion Coverage Table
| Test Case | Target | Checked Behavior | Status |
|-----------|--------|------------------|--------|
| `simulated_annealing_paper_grounded` | Simulated Annealing discovery | Verifies SA discovery process converges to optimal fitness DFG and matches expected behavior | Passed |
| `simulated_annealing_paper_grounded_v2` | Simulated Annealing v2 discovery | Verifies SA v2 discovery on grounded event log converges correctly and yields stable fitness | Passed |
