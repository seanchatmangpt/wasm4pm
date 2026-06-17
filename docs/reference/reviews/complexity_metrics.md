# Algorithm Review: complexity_metrics

## Algorithm ID & Domain
- **Algorithm ID**: `complexity_metrics`
- **Domain**: Process Mining / Analysis (POWL Process Model Complexity Metrics)

## Correctness Audit
- **Early Exit / Default Values**:
  - `measure` initializes a `Collector` and traverses the POWL tree.
  - If the model is a leaf transition, cyclomatic complexity defaults to `1` (line 47).
- **Division-by-Zero Protection**:
  - Halstead Volume: `volume = if vocab > 1 { length as f64 * (vocab as f64).log2() } else { 0.0 }` (lines 189-193). This avoids `log2(0)` or `log2(1)` which would be zero/undefined.
  - Halstead Difficulty: `difficulty = if n2 > 0 { (n1 as f64 / 2.0) * (cap_n2 as f64 / n2 as f64) } else { 0.0 }` (lines 194-198), preventing division-by-zero when the activity count `n2` is 0.
  - Branching Factor: `branching_factor = if col.operator_children_counts.is_empty() { 0.0 } else { sum / len }` (lines 200-205), guarding against division-by-zero for models without operators.
- **Operator Complexity Rules**:
  - XOR: `cyclomatic += n.saturating_sub(1);` (line 93). The use of `saturating_sub(1)` prevents integer underflow if XOR has 0 children.
  - Loop: `cyclomatic += 1` (line 102). CFC is computed as `2 * do_cfc` (where `do_cfc` is the CFC of the loop body) (line 112). This represents standard loop complexity.
  - Sequence and SPO: CFC is the maximum CFC of the children: `child_cfcs.iter().copied().max().unwrap_or(1)` (lines 120, 138, 155, 174).

## Improvement Areas
- **Deep Recursion**:
  - The metrics collector uses recursive traversal (`visit` function, lines 59-177). For extremely nested, adversarial POWL models, this could cause stack overflow. However, in practice, process models are relatively small, so stack overflow is unlikely.
- **Unnecessary Vectors Clones**:
  - In `visit`, the children vectors are cloned: `op.children.clone()`, `spo.children.clone()`, etc. (lines 84, 126, 143, 151). Since the arena is read-only during complexity measurement, the nodes could expose reference slices `&[u32]` to avoid heap allocations.

## Code References
- **Rust Implementation**: `wasm4pm/src/powl/analysis/complexity.rs` (method: `measure`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `complexity_metrics`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
