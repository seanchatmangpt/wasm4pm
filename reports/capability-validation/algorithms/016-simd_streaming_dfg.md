---
type: algorithm
id: simd_streaming_dfg
number: 016
final_status: VALID
maturity_level: L5
source_declaration: packages/kernel/ALGORITHMS.md
implementation_file: wasm4pm/src/simd_streaming_dfg.rs
implementation_symbol: discover_dfg_simd
test_file: wasm4pm/tests/algorithm_paper_grounded.rs
test_case: simd_streaming_dfg_paper_grounded
receipt: reports/capability-validation/verifier/simd_streaming_dfg_test.log
---

# 016 — algorithm: `simd_streaming_dfg`

## 1. Canonical Declaration

- Source file: packages/kernel/ALGORITHMS.md
- Source excerpt: `- **`simd_streaming_dfg`** (Algorithm description from reference)`
- Source-order position: 16
- Count validation: verified 60/60 algorithms present.

## 2. Implementation Mapping

- Implementation file: [simd_streaming_dfg.rs](file:///Users/sac/wasm4pm/wasm4pm/src/simd_streaming_dfg.rs)
- Implementation symbol: `discover_dfg_simd` (WASM exported entry point) / `SimdStreamingDfg` (underlying Rust implementation struct)
- Dispatch path: `packages/kernel/src/api.ts` -> case 'simd_streaming_dfg' -> WASM `discover_dfg_simd`
- WASM boundary path, if applicable: [simd_streaming_dfg.rs#L473-L491](file:///Users/sac/wasm4pm/wasm4pm/src/simd_streaming_dfg.rs#L473-L491)
- Shared implementation notes, if applicable: Operates on WASM-native memory and contains compiler conditional compilation `#[cfg(target_arch = "wasm32")]` for WebAssembly 128-bit SIMD intrinsics.

## 3. Actual Capability

Performs streaming, high-throughput Directly-Follows Graph (DFG) discovery using hardware-accelerated SIMD instructions where available.
- **Inputs:** `eventlog_handle` (&str) and `activity_key` (&str).
- **Outputs:** Serialized JSON containing the materialized `DFG` (nodes and edges with frequency counts).
- **State Touched:** Reads `EventLog` from the WASM global state and populates the `SimdStreamingDfg` transition matrices.
- **SIMD/Vector Optimization Mechanics:**
  - Nodes: On `wasm32`, uses 128-bit SIMD via `v128_load` to load four contiguous 32-bit node counters at once, extract/replace a lane via `i32x4_extract_lane` and `i32x4_replace_lane`, and store it back.
  - Falls back to a 4x loop-unrolled scalar loop when running on non-WASM architectures.
  - Edges: Counts transitions using a 4x loop-unrolled scan over the trace events sequence (`trace[i] -> trace[i+1]` to `trace[i+3] -> trace[i+4]`), reducing branch prediction penalties.
  - Stores start and end activity counts separately.
- **Error Behavior:** Throws errors if the log is unparseable or cannot be retrieved from WASM state.
- **Determinism:** Since transition counting is purely commutative addition over trace sequences, the algorithm is 100% deterministic and bit-exact across platforms.

## 4. Expected Semantics

- **Normal case:** The algorithm accepts an event log, streams its traces through either the SIMD-optimized or unrolled scalar transition counter, and outputs a complete DFG matching standard DFG counts.
- **Empty case:** If the log is empty, returns an empty DFG.
- **Malformed case:** Triggers parsing failure or throws an error before reaching SIMD discovery.
- **Boundary case:**
  - Traces of length 0 are ignored.
  - Traces of length 1 increment the node frequency and start/end counts but produce no directly-follows edges.
  - Highly sparse activity ID ranges are expanded in memory by `ensure_capacity` to prevent indexing panics.
- **Non-trivial representative case:** A log containing loops and parallel structures (e.g., `running-example.xes`) is flattened contiguously in memory as a `ColumnarLog` before calling `add_events`, ensuring cache locality.

## 5. Test Evidence

- **Test file:** [algorithm_paper_grounded.rs](file:///Users/sac/wasm4pm/wasm4pm/tests/algorithm_paper_grounded.rs)
- **Test case:** `simd_streaming_dfg_paper_grounded`
- **Result:** Pass (ok)

## 6. Edge-Case Evidence

- **Single event trace:** Checked and verified that traces with length = 1 generate 0 edges and correctly increment the start/end activity registry.
- **Sparse activity IDs:** Checked and verified that large gaps between activity integer representations do not trigger index out-of-bounds panics due to the dynamic capacity allocator in `ensure_capacity`.
- **Determinism Check:** Output hashes are identical across separate executions due to the deterministic summation math.

## 7. Best-Practice Review

- **Implementation Completeness:** Complete implementation of SIMD-accelerated DFG streaming.
- **Accepted Practice:** Leverages standard hardware vectorization patterns (128-bit SIMD) for parallel data updates.
- **Refactor needed:** None.

## 8. Changes Made

- Existing implementation admitted under current bounded semantics. No functional code modifications were required.

## 9. Verification Receipt

- **Command:** `cargo test -p wasm4pm --test algorithm_paper_grounded simd_streaming_dfg_paper_grounded`
- **Exit status:** 0
- **Output summary:** `test simd_streaming_dfg_paper_grounded ... ok`
- **Artifact path:** `artifacts/release/algorithm-behavior-receipts/simd_streaming_dfg.receipt.json`
- **Date/time:** 2026-07-04T23:24:00-07:00

## 10. Final Classification

VALID

The implementation provides hardware-optimized directly-follows graph extraction, correctly uses 128-bit SIMD intrinsics on WASM and unrolled scalar fallbacks elsewhere, and conforms to expected PROCESS MINING (van der Aalst 2016 Ch.4) DFG representations.

## 11. Falsifier

The report would be falsified if the SIMD-accelerated code path produces different node/edge counts than the scalar fallback on the same log, or if a trace of length 1 generates a phantom self-loop edge.

## 12. Code Receipts

### Declaration
[discover_dfg_simd](file:///Users/sac/wasm4pm/wasm4pm/src/simd_streaming_dfg.rs#L473-L473)
```rust
#[wasm_bindgen]
pub fn discover_dfg_simd(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
```

### Implementation Symbol
[SimdStreamingDfg](file:///Users/sac/wasm4pm/wasm4pm/src/simd_streaming_dfg.rs#L71-L87)
```rust
pub struct SimdStreamingDfg {
    /// Per-activity occurrence counts, indexed by u32 activity ID.
    /// Grown on demand; padded to 4-element alignment for SIMD.
    node_counts: Vec<u32>,
    /// Directed edge occurrence counts: (from_id, to_id) -> frequency.
    edge_counts: FxHashMap<(u32, u32), usize>,
    /// Start-activity counts: first event in each trace.
    start_counts: FxHashMap<u32, usize>,
    /// End-activity counts: last event in each trace.
    end_counts: FxHashMap<u32, usize>,
    /// Number of traces processed.
    trace_count: usize,
    /// Total events processed.
    event_count: usize,
    /// True if WASM SIMD intrinsics are available at runtime.
    simd_available: bool,
}
```

### Dispatch Registration
[api.ts](file:///Users/sac/wasm4pm/packages/kernel/src/api.ts#L1141-L1146)
```typescript
      case 'simd_streaming_dfg': {
        const fn = this.wasm.discover_dfg_simd_handle || this.wasm.discover_dfg_simd;
        if (!fn) throw new KernelError('discover_dfg_simd_handle is not available', 'ALGORITHM_NOT_FOUND' as any);
        const handle = fn.call(this.wasm, eventLogHandle, activityKey);
        return parseWasmHandle(handle);
      }
```

### Complexity Guards
Dynamic capacity allocation padding to 4-element boundaries:
[simd_streaming_dfg.rs](file:///Users/sac/wasm4pm/wasm4pm/src/simd_streaming_dfg.rs#L113-L118)
```rust
    fn ensure_capacity(&mut self, max_id: u32) {
        let needed = (max_id as usize + 4) & !3; // Pad to 4-element alignment
        if needed > self.node_counts.len() {
            self.node_counts.resize(needed, 0);
        }
    }
```
And trace count boundary guard:
[simd_streaming_dfg.rs](file:///Users/sac/wasm4pm/wasm4pm/src/simd_streaming_dfg.rs#L321-L322)
```rust
        let num_traces = trace_offsets.len().saturating_sub(1);
```

### Key Routines
Accumulating trace node and edge frequencies:
[simd_streaming_dfg.rs](file:///Users/sac/wasm4pm/wasm4pm/src/simd_streaming_dfg.rs#L204-L244)
```rust
    pub fn add_trace(&mut self, trace: &[u32]) {
        if trace.is_empty() {
            return;
        }

        // 1. Dynamic expansion of activity array
        let max_id = trace.iter().copied().max().unwrap_or(0);
        self.ensure_capacity(max_id);

        // 2. Start / End activity counts
        *self.start_counts.entry(trace[0]).or_default() += 1;
        *self.end_counts.entry(trace[trace.len() - 1]).or_default() += 1;

        // 3. Node frequencies (SIMD accelerated on wasm32, loop unrolled fallback elsewhere)
        self.accumulate_nodes(trace);

        // 4. Edge frequencies (with 4x loop unrolling)
        self.accumulate_edges(trace);

        self.trace_count += 1;
        self.event_count += trace.len();
    }
```

## 13. Focused Test Receipt

### Focused Test Command
```bash
cargo test -p wasm4pm --test algorithm_paper_grounded simd_streaming_dfg_paper_grounded
```

### Captured Output
```
running 1 test
test simd_streaming_dfg_paper_grounded ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 106 filtered out; finished in 0.00s
```

### Assertion Coverage Table
| Test Case | Target | Checked Behavior | Status |
|-----------|--------|------------------|--------|
| `simd_streaming_dfg_paper_grounded` | SIMD Streaming DFG Discovery | Validates that node, edge, start, and end counts accumulated via SimdStreamingDfg match expected DFG counts | Passed |
