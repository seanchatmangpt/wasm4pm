# Algorithm Review: transition_system

## Algorithm ID & Domain
- **Algorithm ID**: `transition_system`
- **Domain**: Process Mining / Discovery (Transition System State Machine Generation)

## Correctness Audit
- **Early Exit Guards**:
  - `discover_transition_system` checks if the parsed activities sequence for a trace is empty (lines 113-115) and skips the trace.
  - If the log has no traces or all traces are empty, it returns a `TransitionSystem` with empty states and transitions, and `initial_state` is set to `None`.
- **Division-by-Zero Protection**:
  - There are no mathematical divisions in this algorithm.
- **Out-of-Bounds Protection**:
  - The lookback window index is guarded using `let start = i.saturating_sub(window);` (line 121), which protects against integer underflow (since `i` and `window` are `usize`).
  - The forward/backward slicing is safe: `activities[start..=i]` is safe since `start <= i`.
  - For the backward direction, the slice is `activities[i..=(i + window).min(activities.len() - 1)]` (lines 125-128). The `.min()` guard prevents index out of bounds.
- **Initial State Semantics**:
  - The initial state is tracked as `if initial_state.is_none() { initial_state = Some(state_id); }` (lines 147-149). This selects the first state encountered (first state of the first trace). If subsequent traces start with different activities, they will transition from those new states, but the global `initial_state` remains fixed to the first trace's start state. This is a simple heuristic that might miss multiple entry points but is consistent.

## Improvement Areas
- **String Allocations**:
  - In `discover_transition_system`, states are represented as string joins: `let state_name = state_activities.join(", ");` (line 131). This occurs for every event in every trace. If a log has $E$ events and window size is $W$, it allocates $E$ strings. Furthermore, these strings are used as keys in a `FxHashMap<String, usize>`.
  - To optimize this, the algorithm could work directly with integer activity IDs rather than string names. A state could be represented as a `Vec<u32>` or a fixed-size window slice, and hashed directly, avoiding string creation and copying during traversal.
- **Transition Map Conversion**:
  - The intermediate transition counts are stored in `transition_map: FxHashMap<(usize, usize, String), usize>` (line 94). The `String` inside the tuple is cloned for every transition lookup. Using a reference or mapping activity strings to integer IDs first would eliminate this cloning overhead.

## Code References
- **Rust Implementation**: `wasm4pm/src/transition_system.rs` (method: `discover_transition_system` / `discover_transition_system_from_handle`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `transition_system`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
