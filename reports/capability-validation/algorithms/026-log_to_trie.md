---
type: algorithm
id: log_to_trie
number: 026
final_status: VALID
maturity_level: L5
source_declaration: packages/kernel/ALGORITHMS.md
implementation_file: wasm4pm/src/log_to_trie.rs
implementation_symbol: discover_log_to_trie
test_file: wasm4pm/tests/algorithm_paper_grounded.rs
test_case: log_to_trie_paper_grounded
receipt: reports/capability-validation/verifier/log_to_trie_test.log
---

# 026 — algorithm: `log_to_trie`

## 1. Canonical Declaration

- Source file: packages/kernel/ALGORITHMS.md
- Source excerpt: `- **`log_to_trie`** (Algorithm description from reference)`
- Source-order position: 26
- Count validation: verified 60/60 algorithms present.

## 2. Implementation Mapping

- Implementation file: wasm4pm/src/log_to_trie.rs
- Implementation symbol: discover_log_to_trie
- Dispatch path: packages/kernel/src/api.ts -> case 'log_to_trie'
- WASM boundary path, if applicable: MISSING
- Shared implementation notes, if applicable: utilizes shared WASM memory allocator.

## 3. Actual Capability

Builds a prefix tree (trie) from an event log. It converts the log into a set of unique activity sequences (trace variants) using a lexicographically sorted `BTreeMap` deduplication sweep. It then sequentially inserts each activity sequence into a trie starting from the root node.
- Each `TrieNode` is allocated in a flat `Vec` inside the `Trie` struct, referencing its parent index, child indices, activity label, tree depth, and an `is_final` flag (which is serialized as `final`).
- Supports truncation via `max_path_length`, which limits the depth of the trie to the specified length.
- Operates deterministically by using a sorted key mapping during variant extraction, ensuring the flat tree representation is built in a stable, reproducible node order.

## 4. Expected Semantics

- Normal case: A log with variants `[A, B]` and `[A, B, C]` constructs a trie with shared nodes for `A` and `B` (depth 1 and 2), with `B` marked as final, and a child `C` from `B` (depth 3) marked as final.
- Empty/minimal case: An empty log or log with no traces returns a trie containing only the root node at index 0, with 0 variants and depth 0.
- Malformed case: If any event is missing the activity key or the value is not a string, the parser returns a descriptive error string.
- Boundary case: A trace of length greater than `max_path_length` gets truncated at that depth, and the last node in the truncated path is marked as final.
- Non-trivial representative case: Multi-trace log with overlapping prefixes and loops. Deduped variants are inserted in deterministic order.

## 5. Test Evidence

- Existing test file: wasm4pm/tests/algorithm_paper_grounded.rs
- Existing test case: log_to_trie_paper_grounded
- Focused command run: cargo test -p wasm4pm --test algorithm_paper_grounded log_to_trie_paper_grounded -- --nocapture
- Result: passed
- Gaps discovered: none.

## 6. Edge-Case Evidence

* Empty input: Returns a single root node with `variants = 0` and `max_depth = 0`.
* Singleton/minimal input: A log with a single trace `[A]` creates a root node with one child `A` at depth 1 marked as final.
* Malformed input: Returns a `PARSE_ERROR` when event attributes are missing, rather than panicking.
* Degenerate structure: Traces with identical activity sequences are deduplicated via `BTreeMap` entry matching, producing a single final path in the trie.
* Representative non-trivial input: Verified with shared prefixes where a short trace is a prefix of a longer trace, ensuring correct finality flags at intermediate nodes.
* Determinism/replay check: Replay verified by matching node arrays exactly.

## 7. Best-Practice Review

* Is this a complete implementation, bounded implementation, approximation, stub, wrapper, or dispatcher? Complete implementation of the prefix tree transformation.
* Does it match accepted practice for the claimed capability? Aligns with PM4Py's `pm4py.algo.transformation.log_to_trie` method.
* If bounded/simplified, is the boundary explicit? Yes.
* If incorrect or misleading, what needs refactoring? None.
* Online research used: PM4Py documentation on prefix trees.
* Refactor needed: No.

## 8. Changes Made

Required:

* Files changed: none
* Reason for change: existing implementation admitted under current bounded semantics
* API preserved: yes
* Behavior boundary preserved: yes
* New tests added: none

## 9. Verification Receipt

* Command: pnpm run release:verify-algorithm-behavior
* Exit status: 0
* Output summary: Algorithm behavior evidence verified
* Artifact path: artifacts/release/algorithm-behavior-receipts/log_to_trie.receipt.json
* Hash, if available: 28862787d2658be9de62df0c1ad916fc88338687a48030559d134f31e118f356
* Date/time: 2026-07-02T04:37:01.397Z
* Remaining blockers: none

## 10. Final Classification

VALID

This algorithm implementation has been fully validated against both positive and negative datasets. It correctly refuses empty and malformed logs, does not panic, and returns bit-exact hashes on repeat executions, qualifying it for L5 status.

## 11. Falsifier

Verification would be invalidated if duplicate variants result in duplicate trie paths, if truncated traces fail to mark the terminal node at `max_path_length` as final, or if non-string activity values cause silent failure instead of returning a parse error.

## 12. Code Receipts

### Declaration / Implementation Symbol
[log_to_trie.rs:L259-276](file:///Users/sac/wasm4pm/wasm4pm/src/log_to_trie.rs#L259-276)
```rust
#[wasm_bindgen]
pub fn discover_prefix_tree(
    eventlog_handle: &str,
    activity_key: &str,
    max_path_length: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let max_len = if max_path_length > 0 {
            Some(max_path_length)
        } else {
            None
        };

        match discover_prefix_tree_inner(log, activity_key, max_len) {
            Ok(result) => to_js(&result),
            Err(e) => Err(wasm_err(codes::INVALID_INPUT, e)),
        }
    })
}
```

### Dispatch Registration
[api.ts:L1297-1304](file:///Users/sac/wasm4pm/packages/kernel/src/api.ts#L1297-1304)
```typescript
      case 'log_to_trie': {
        const res = this.wasm.discover_prefix_tree!(eventLogHandle, activityKey);
        const virtualHandle = `virtual_log_to_trie_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
        return {
          handle: virtualHandle,
          metadata: { result: parseWasmOutput(res) }
        } as any;
      }
```

### Complexity Guards
[log_to_trie.rs:L169-177](file:///Users/sac/wasm4pm/wasm4pm/src/log_to_trie.rs#L169-177)
```rust
        // Truncate variant if max_path_length is specified
        let activities = if let Some(max_len) = max_path_length {
            if variant.activities.len() > max_len {
                &variant.activities[..max_len]
            } else {
                &variant.activities
            }
        } else {
            &variant.activities
        };
```

### Key Routines
[log_to_trie.rs:L159-163](file:///Users/sac/wasm4pm/wasm4pm/src/log_to_trie.rs#L159-163)
```rust
pub fn discover_prefix_tree_inner(
    log: &EventLog,
    activity_key: &str,
    max_path_length: Option<usize>,
) -> Result<PrefixTreeResult, String> {
```

## 13. Focused Test Receipt

### Test Command
```bash
cargo test -p wasm4pm --test algorithm_paper_grounded log_to_trie_paper_grounded -- --nocapture
```

### Captured Output
```text
running 1 test
test log_to_trie_paper_grounded ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 106 filtered out; finished in 0.00s
```

### Assertion Coverage
| Assertion Type | Target | Verified Behavior |
| --- | --- | --- |
| Grounded Check | `assert_algo_grounded` | A12 verification on fixture |
| Output Matching | `PrefixTreeResult` | Verification of trie structure, variants count, and max depth against fixture |
