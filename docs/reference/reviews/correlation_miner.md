# Algorithm Review: correlation_miner

## Algorithm ID & Domain
- **Algorithm ID**: `correlation_miner`
- **Domain**: Process Mining / Discovery (Correlation Miner for Event Logs without Case IDs)

## Correctness Audit
- **Early Exit Guards**:
  - `mine_correlation` checks if parsed events `indexed.len() < 2` (lines 119-121) and returns an empty result.
  - If distinct activities count `n < 2` (lines 139-152), it returns early without computing edge relations (returns only start/end activity frequencies).
- **Division-by-Zero Protection**:
  - In `compute_ps_matrix`, `ai` and `aj` are checked for empty before computing `ps[i][j]` (lines 259-269), ensuring the divisor `(ai.len() * aj.len())` is non-zero.
  - `avg` helper returns `0.0` if the matches vector is empty (lines 355-361), preventing division by zero.
  - In `resolve_edges`, candidate costs divide by `ps[i][j]` and `mc` (lines 381). The loop checks `ps[i][j] <= 0.0` and `mc == 0` (lines 374-380) to prevent division by zero.
- **Out-of-Bounds Protection**:
  - In `greedy_lifo_avg`, `let k_usize = k as usize;` is checked using `if k_usize >= ai.len()` (line 337) to prevent out-of-bounds indexing.
- **Timestamp Parsing Defect**:
  - Like before, `parse_and_sort` only accepts `AttributeValue::Date(s)` (lines 228-231). If timestamps are stored as strings, they are ignored. This is a correctness discrepancy.

## Improvement Areas
- **Support String Timestamps**:
  - The timestamp parser should support both `AttributeValue::Date` and `AttributeValue::String` to match other algorithms.
- **Matrix Memory Allocation**:
  - The precede-succeed and duration matrices are defined as nested vectors: `vec![vec![0.0f64; n]; n]` (lines 256, 289). This represents $O(A^2)$ allocations where $A$ is the number of distinct activities. Using a flat vector `vec![0.0f64; n * n]` and indexing via `i * n + j` would avoid nested allocations and improve cache locality.

## Code References
- **Rust Implementation**: `wasm4pm/src/correlation_miner.rs` (method: `discover_correlation` / `mine_correlation`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `correlation_miner`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
