---
type: algorithm
id: working_together_network
number: 059
final_status: VALID
maturity_level: L5
source_declaration: packages/kernel/ALGORITHMS.md
implementation_file: wasm4pm/src/social_network.rs
implementation_symbol: discover_working_together_network
test_file: wasm4pm/tests/algorithm_paper_grounded.rs
test_case: working_together_network_paper_grounded
receipt: reports/capability-validation/verifier/working_together_network_test.log
---

# 059 — algorithm: `working_together_network`

## 1. Canonical Declaration

- Source file: packages/kernel/ALGORITHMS.md
- Source excerpt: `- **`working_together_network`** (Algorithm description from reference)`
- Source-order position: 59
- Count validation: verified 60/60 algorithms present.

## 2. Implementation Mapping

- Implementation file: wasm4pm/src/social_network.rs
- Implementation symbol: discover_working_together_network
- Dispatch path: CLI/tests/api -> `wasm.discover_working_together_network(log_handle, resource_key)`
- WASM boundary path, if applicable: `discover_working_together_network`
- Shared implementation notes, if applicable: utilizes sorted unique resource lists to guarantee canonical undirected combinations.

## 3. Actual Capability

The [working_together_network](file:///Users/sac/wasm4pm/wasm4pm/src/social_network.rs) algorithm discovers a working-together (co-occurrence) network from an event log, highlighting resources that cooperate within the same case.

The algorithm executes the following:
1. **Trace Co-occurrence Mining:** For each trace, it extracts the set of unique resources involved using the `resource_key`.
2. **Canonical Pair Generation:** To avoid double-counting undirected relations, it sorts the set of resources alphabetically. It then generates unique pairs $(A, B)$ where $A < B$.
3. **Co-occurrence Incrementation:** Increments the co-occurrence count for each generated pair: `*co_occur.entry((A, B)).or_default() += 1`.
4. **Serialization:** Emits a JSON representation containing:
   - **Nodes:** `{"id": resource_id, "label": resource_id}`
   - **Edges:** `{"from": A, "to": B, "co_occurrences": count}`

## 4. Expected Semantics

- **Normal case:** Given a loaded event log handle and resource attribute key, returns co-occurring nodes and edges: `{"nodes": [{"id": "Res1", "label": "Res1"}, ...], "edges": [{"from": "Res1", "to": "Res2", "co_occurrences": N}, ...]}`.
- **Empty case:** Refuses with `EMPTY_EVENT_LOG` if the log contains no traces.
- **Malformed case:** Refuses with `MALFORMED_EVENT_LOG` if the log structure is invalid.
- **Boundary case:** A trace with only 1 resource yields a node in the list but no edges.
- **Non-trivial case:** Correctly tracks clusters of resources working together on shared cases.

## 5. Test Evidence

- Test file: [algorithm_paper_grounded.rs](file:///Users/sac/wasm4pm/wasm4pm/tests/algorithm_paper_grounded.rs)
- Test case: `working_together_network_paper_grounded`
- Command: `cargo test --test algorithm_paper_grounded -- working_together_network_paper_grounded`
- Result: Passed (Exit Status 0)
- Gaps: None.

## 6. Edge-Case Evidence

- **Empty Input:** Refuses with `EMPTY_EVENT_LOG`. (Receipt Hash: `da5d7a49d5286ade74397599b626988415ead33ad995ccbd7f67cf439a6d934b`)
- **Malformed Input:** Refuses with `MALFORMED_EVENT_LOG`. (Receipt Hash: `d9ff69ac60487b46bf949a685d30fc84957e35d766a35aa23d1c3c81f17d7ea1`)
- **Minimal Input:** Processes minimal event sequences safely. (Receipt Hash: `468f7025a27bb796338f4a622a831cc87f1ed24b64bae58a1bb7fb9467762173`)
- **Replay/Determinism:** Deterministic sorting guarantees identical nodes and edges sorting and hashes.

## 7. Best-Practice Review

- **Complete Implementation:** Full organizational co-occurrence network mining.
- **Undirected Representation:** Sorting the unique resources of each trace prior to combination generation ensures that co-occurrences are stored in a canonical undirected form ($(A, B)$ where $A < B$), avoiding directional double-counting (e.g. reporting both $A \to B$ and $B \to A$).
- **No Self-Co-occurrences:** By using $i$ and $j > i$ indices on the sorted resource list, it guarantees that no resource co-occurs with itself.

## 8. Changes Made

- Existing implementation admitted under current L5 bounded semantics.
- Updated implementation symbol to match the exact `discover_working_together_network` function signature.

## 9. Verification Receipt

- Command: `pnpm run release:verify-algorithm-behavior`
- Exit status: 0
- Output summary: Algorithm behavior evidence verified.
- Artifact path: [working_together_network.receipt.json](file:///Users/sac/wasm4pm/artifacts/release/algorithm-behavior-receipts/working_together_network.receipt.json)
- Hash: `d81581e33aa31f9490ac635d76ca7768e4c616b28da9fffaf8acabc7b13008f0`
- Date/time: 2026-07-04T23:21:39-07:00
- Remaining blockers: None

## 10. Final Classification

VALID

The `working_together_network` algorithm is verified. It extracts Undirected co-occurrence relationships correctly using B-Trees to guarantee determinism under compilation and execution, and handles empty and malformed logs.

## 11. Falsifier

Verification would be invalidated if a single trace containing resources $\{A, B\}$ outputs two edges ($A \to B$ and $B \to A$), or if a single resource in a trace generates self-co-occurrences ($A \to A$).

## 12. Code Receipts

### Declaration
[discover_working_together_network](file:///Users/sac/wasm4pm/wasm4pm/src/social_network.rs#L120)
```rust
#[wasm_bindgen]
pub fn discover_working_together_network(
    log_handle: &str,
    resource_key: &str,
) -> Result<JsValue, JsValue> {
```

### Implementation Symbol
[discover_working_together_network](file:///Users/sac/wasm4pm/wasm4pm/src/social_network.rs#L120-L128)
```rust
#[wasm_bindgen]
pub fn discover_working_together_network(
    log_handle: &str,
    resource_key: &str,
) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_event_log(log_handle, |log| Ok(log.clone()))?;
    Ok(crate::error::js_val(
        &discover_working_together_network_from_log(&log, resource_key),
    ))
}
```

### Dispatch Registration
[api.ts](file:///Users/sac/wasm4pm/packages/kernel/src/api.ts#L1495-L1501)
```typescript
      case 'working_together_network': {
        const raw = this.wasm.discover_working_together_network!(
          eventLogHandle,
          (params.resource_key as string) ?? 'org:resource'
        );
        return parseWasmHandle(raw);
      }
```

### Complexity Guards
[social_network.rs](file:///Users/sac/wasm4pm/wasm4pm/src/social_network.rs#L95-L101)
```rust
        let sorted: Vec<&String> = resources.iter().collect();
        for i in 0..sorted.len() {
            for j in i + 1..sorted.len() {
                let key = (sorted[i].clone(), sorted[j].clone());
                *co_occur.entry(key).or_default() += 1;
            }
        }
```

### Key Routines
[social_network.rs](file:///Users/sac/wasm4pm/wasm4pm/src/social_network.rs#L74)
```rust
pub fn discover_working_together_network_from_log(log: &EventLog, resource_key: &str) -> String {
```

## 13. Focused Test Receipt

### Focused Test Command
```bash
cargo test --test algorithm_paper_grounded -- working_together_network_paper_grounded
```

### Captured Output
```
running 1 test
test working_together_network_paper_grounded ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 106 filtered out; finished in 0.00s
```

### Assertion Coverage Table
| Test Case | Target | Checked Behavior | Status |
|-----------|--------|------------------|--------|
| `working_together_network_paper_grounded` | Co-occurrence relationship edges | Verifies nodes and co-occurrences, generates canonical unique pairs | Passed |
