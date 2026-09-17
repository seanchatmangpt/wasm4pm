<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/reference/discover_heuristic_ref.md; source-sha256: 186fe0e22190faeb343fab0c5d29e1a4bef92bb2dd4db1983921c37bbeb48df9; reason: tooling or agent control surface -->

# Reference: discover_heuristic

## Description

Heuristic Miner - discovers DFG based on activity frequencies and directly-follows relationships
Time complexity: O(n + m) where n = events, m = edges
Space complexity: O(k + e) where k = unique activities, e = edges
Validated Doctest Example:
```rust
// Validation successful
```

## Signature

```rust
pub fn discover_heuristic(...)
```
