# Algorithm Review: causal_graph

## Algorithm ID & Domain
- **Algorithm ID**: `causal_graph`
- **Domain**: Process Mining / Discovery (Causal Graph Discovery via Alpha Miner and Heuristic Miner Variants)

## Correctness Audit
- **Early Exit Guards**:
  - The entry points `discover_causal_alpha` and `discover_causal_heuristic` validate the object type from the state handles (lines 68, 91).
- **Division-by-Zero Protection**:
  - In `build_causal_heuristic`, the strength formula is computed as:
    `((*freq as f64 - *reverse_freq as f64) / (total + 1.0)).max(0.0)` (line 185)
    where `total` is the sum of forward and reverse frequencies. Since `total >= 0`, `total + 1.0` is guaranteed to be at least `1.0`, preventing division-by-zero.
- **Special Cases / Edge Behaviors**:
  - If a transition pair has no reverse relation, the heuristic strength is set to `1.0` (line 187) which represents maximum causal strength.
  - The strength is clamped using `.max(0.0)` to prevent negative values (when the reverse frequency exceeds the forward frequency) from passing the threshold or producing negative strength values.
  - Only string attributes are parsed: `AttributeValue::String(from)` and `AttributeValue::String(to)` are required (lines 105-110, 164-169). Non-string attributes are safely skipped.

## Improvement Areas
- **Avoid Excessive String Clones**:
  - In both `build_causal_alpha` and `build_causal_heuristic`, the frequency map is defined as `FxHashMap<(String, String), usize>` (lines 98, 157).
  - During the event log traversal, for every transition pair in every trace, the code does:
    `*edge_freq.entry((from.clone(), to.clone())).or_insert(0) += 1;` (lines 111, 170).
  - This clones two strings for every transition in the event log, which creates massive garbage collection and heap allocation overhead for logs with thousands of events.
  - To optimize this, the algorithm should first build an activity dictionary (mapping activity name strings to `u32` integers) and then construct the frequency map using `(u32, u32)` keys. This would avoid all string allocations and cloning during graph construction.

## Code References
- **Rust Implementation**: `wasm4pm/src/causal_graph.rs` (method: `discover_causal_alpha` / `discover_causal_heuristic`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `causal_graph`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
