# Algorithm Review: ilp

## Algorithm ID & Domain
- **Registry ID**: `ilp`
- **Domain**: Process Discovery (Petri Net mining)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns a tuple/JSON containing the Petri Net, fitness, and precision.
- **Boundary Checks**:
  - Checks if `n == 0 || col.trace_offsets.len() <= 1` and exits early returning an empty Petri Net and zero metrics.
  - During token-replay validation (Stage 3), consistency is checked by asserting that tokens never go negative: `if tokens < 0 { return false; }`.
- **Causal Set Greedy Cover**:
  - Instead of compiling an external integer linear programming solver (which is large and complex for WASM environments), the algorithm runs a lightweight greedy cover heuristic (`ilp_greedy_cover`) to pick consistent places.

## Improvement Areas
- **Performance Optimization**:
  - **AND-split / AND-join Candidate Generation**:
    ```rust
    for i in 0..outputs.len() {
        for j in i + 1..outputs.len() {
            let b = outputs[i];
            let c = outputs[j];
            if parallel_pairs.contains(&(b, c)) { ... }
        }
    }
    ```
    For highly parallel event logs, the number of candidate places can scale as `O(N^3)`. A limit on the number of generated candidates would prevent OOM.
  - **Token Replay Pass**: Stage 3 loops over all candidate places, and for each candidate, it replays all traces and events. This requires `O(C * E)` iterations (where `C` is candidates, `E` is events), which is slow.
- **Logic Refinement**:
  - The replay simulation executes in order of events. If a transition is in both input and output sets (a self-loop), it adds a token first, then subtracts it. While this avoids negative tokens during replay, it differs from standard Petri net execution semantics where consumption must precede production.

## Code References
- **Rust Implementation**: `wasm4pm/src/ilp_discovery.rs` -> `discover_ilp_petri_net`, `discover_ilp_petri_net_from_log`, `ilp_greedy_cover`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
