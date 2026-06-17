# Algorithm Review: playout

## Algorithm ID & Domain
- **Algorithm ID**: `playout`
- **Domain**: Process Mining / Simulation (Process Tree and DFG Playout/Simulation)

## Correctness Audit
- **Early Exit / Window Bounds**:
  - DFG Playout checks `let no_outgoing = adj.get(&current).is_none_or(|v| v.is_empty());` (line 265) to stop walks when dead-ends are reached.
  - The walk is also capped by `trace_activities.len() >= params.max_trace_length` (line 266) to prevent infinite loops in cyclic graphs.
- **Timestamp Formatting**:
  - `format_timestamp_ms` uses `chrono::DateTime::from_timestamp` (lines 328-337) to generate valid ISO 8601 string representations of event timestamps.
- **Deterministic Seeding**:
  - Playout uses a fixed seed `DETERMINISTIC_SEED = 0xdead_beef` (line 59) to construct the random number generator `fastrand::Rng::with_seed(DETERMINISTIC_SEED)` (lines 166, 248), satisfying the project's determinism laws.
- **Critical Correctness Bug 1: Loop Playout Semantics**:
  - In `playout_process_tree_node` (lines 119-149) under case `PtOperator::Loop`:
    - The loop constructs a redo loop. It executes the do-branch (`children[0]`), and then optionally runs a redo loop `while rng.f64() < 0.3`:
      ```rust
      // Optionally redo: 30% chance to loop again
      while rng.f64() < 0.3 {
          events.extend(playout_process_tree_node(
              &children[0].label,
              &children[0].operator,
              &children[0].children,
              rng,
          ));
      }
      ```
    - A standard loop operator in process trees has at least two children: `children[0]` is the DO-branch, and `children[1]` is the REDO-branch.
    - During loop repetition, it should execute the redo-branch (`children[1]`) followed by the do-branch (`children[0]`).
    - However, the code **completely ignores `children[1]`** and only executes `children[0]` over and over! This means the REDO tasks are never played out, which violates the semantics of process tree loops.
- **Critical Correctness Bug 2: Infinite Retry Loop in DFG Playout**:
  - In `play_out_dfg_with_starts` (lines 241-325), if a generated trace is shorter than `params.min_trace_length`, it retries:
    ```rust
    // Check minimum trace length
    if trace_activities.len() >= params.min_trace_length {
        break;
    }
    // Otherwise retry (bounded by a safety limit to prevent infinite loops)
    if trace_idx > params.num_traces * 10 {
        // Give up and use whatever we have
        break;
    }
    ```
  - The retry safety limit checks `trace_idx > params.num_traces * 10`.
  - However, `trace_idx` is the outer loop variable `for trace_idx in 0..params.num_traces`.
  - Since `trace_idx` can never exceed `params.num_traces` (and thus can never exceed `params.num_traces * 10`), **this safety check is dead code and will never trigger!**
  - If `min_trace_length` is set to a value larger than any possible path in the DFG, this retry loop will run **indefinitely**, causing a complete hang.

## Improvement Areas
- **Fix Loop Playout**:
  - Update `PtOperator::Loop` playout to execute `children[1]` (REDO) before each repeated execution of `children[0]` (DO).
- **Fix Retry Safety Guard**:
  - Implement an actual `retry_counter` initialized to `0` inside the trace loop, and check `if retry_counter > 100 { break; }` to prevent infinite hangs.

## Code References
- **Rust Implementation**: `wasm4pm/src/playout.rs` (method: `play_out_dfg` / `play_out_tree`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `playout`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
