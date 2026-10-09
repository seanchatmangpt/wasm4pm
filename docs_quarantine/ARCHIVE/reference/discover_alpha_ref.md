<!-- wasm4pm-doc-status: archived; reviewed: 2026-08-02; original: docs_quarantine/ARCHIVE/reference/discover_alpha_ref.md; source-sha256: 72304ef9752e27d40b1fc0bf2b32f7e977b2394940768fc13bc400705392062f; reason: already in an archive surface -->

# Reference: discover_alpha

## Description

Alpha+ Miner - discovers Petri nets with implicit places handling
Implements key relations: →, -|→, ||
Time complexity: O(n + m²) where n = events, m = unique activities
Validated Doctest Example:
```rust
// Validation successful
```

## Signature

```rust
pub fn discover_alpha(...)
```
