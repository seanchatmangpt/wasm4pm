<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/reference/discover_dfg_ref.md; source-sha256: aea165880af69057781a09b991d5484ea4c6b6f28240091529ef5b4bbecc8a2d; reason: tooling or agent control surface -->

# Reference: discover_dfg

## Description

Branchless Directly-Follows Graph discovery with columnar optimization
Time complexity: O(n) where n = total events across all traces
Space complexity: O(k + e) where k = unique activities, e = directly-follows edges
Uses integer-ID columnar representation for efficient processing
Validated Doctest Example:
```rust
// Validation successful
```

## Signature

```rust
pub fn discover_dfg(...)
```
