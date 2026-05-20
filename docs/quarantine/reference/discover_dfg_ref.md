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
