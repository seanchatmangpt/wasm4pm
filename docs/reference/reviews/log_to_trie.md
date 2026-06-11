# Algorithm Review: log_to_trie

## Algorithm ID & Domain
- **Algorithm ID**: `log_to_trie`
- **Domain**: Process Mining / Transformation (Prefix Tree / Trie Construction)

## Correctness Audit
- **Early Exit Guards**:
  - `get_variants_from_log` returns an error if any event lacks the activity name attribute or if the value is not a string (lines 228-238).
- **Infinite Loop / Denial of Service Guards**:
  - The FNV-1a fingerprint loop bounds are limited: `let max_activity_len = activities.len().min(256);` and `let max_bytes = activity.len().min(64);` (lines 247-251). This prevents payload bombs from consuming excessive CPU time.
  - The hash table linear probing is capped by `max_probes = hashtable_size` (line 267), preventing infinite loops when the hash table is full.
- **Critical Correctness Bug (Silent Drop on Overflow)**:
  - In `get_variants_from_log`, the custom open-addressing hash table is initialized with a fixed size: `let hashtable_size = (estimated_variants * 2).next_power_of_two();` (line 217), where `estimated_variants` is derived as 10% of total traces: `(log.traces.len() / 10).max(16)` (line 216).
  - If the log has high trace diversity (e.g., more than 10% unique variants, which is extremely common in real-life logs), the number of unique variants can exceed `hashtable_size`.
  - When the table becomes 100% full, any subsequent new variants will loop through all `max_probes` slots, find no empty slots, and fail to insert. They are **silently dropped** from the deduplicated variants vector. This means the resulting trie will omit valid traces from the log, which is a major correctness defect.

## Improvement Areas
- **Use Standard Resizing Collections**:
  - The custom open-addressing table was implemented to optimize allocations, but it has a severe correctness bug under high variance. Replacing the custom table with a standard `rustc_hash::FxHashMap<Vec<String>, usize>` would resolve the correctness issue, support automatic resizing, and simplify the code.
- **Zero-Allocation Lookups**:
  - Despite the custom hash table aiming for low allocations, it still creates and allocates a new `Vec<String>` and clones all activity strings for *every single trace* in the event log (lines 226-241) before checking if the trace already exists in the table. This defeats the purpose of the custom table's zero-allocation design.
- **Trie Child Scanning**:
  - In `Trie::get_or_create_child` (lines 101-108), the code performs a linear scan over the parent's children to check if a child with the label exists. If a node has a large branching factor (e.g., many different activities can follow a prefix), this linear search becomes slow. Using a map for child lookups would speed this up.

## Code References
- **Rust Implementation**: `wasm4pm/src/log_to_trie.rs` (method: `discover_prefix_tree` / `discover_prefix_tree_inner`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `log_to_trie`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
