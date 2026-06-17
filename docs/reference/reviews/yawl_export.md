# Algorithm Review: yawl_export

## Algorithm ID & Domain
- **Algorithm ID**: `yawl_export`
- **Domain**: Process Mining / Input-Output (POWL to YAWL v6 XML Export)

## Correctness Audit
- **XML Escaping and ID Sanitization**:
  - Task labels are escaped using `xml_escape` (lines 248-254) which replaces `&`, `<`, `>`, `"`, `'` with their XML entity equivalents.
  - IDs are sanitized using `sanitize_id` (lines 256-283) to keep only alphanumeric characters and underscores, avoiding invalid XML attribute IDs.
- **Operator Translations**:
  - XOR: mapped via `convert_xor` (lines 117-137), introducing conditions as merge and fork elements, which is the correct YAWL representation of XOR splits/joins.
  - Loop: mapped via `convert_loop` (lines 139-162), introducing merge and fork conditions with back-edges from the redo-exit to the merge-entry.
  - Sequence: mapped via `chain` (lines 227-246) which chains child conversions sequentially.
- **Critical Correctness Bug (Unstable Topological Sort / Leveling)**:
  - In `convert_spo` (lines 164-225), the algorithm groups Strict Partial Order children into level groups. It determines levels by running a single-pass nested loop:
    ```rust
    let mut level = vec![0usize; n];
    for i in 0..n {
        for j in 0..n {
            if order.is_edge(i, j) && level[j] <= level[i] {
                level[j] = level[i] + 1;
            }
        }
    }
    ```
    This single-pass loop is **incorrect** for finding levels in a general DAG. If `order.is_edge(i, j)` is true for `i > j` (which is possible if the children array is not topologically sorted), `level[j]` is computed based on `level[i]`. But if `level[i]` is updated later during the loop, `level[j]` is never updated again!
    This results in incorrect level groupings, causing concurrent tasks to be misidentified as sequential, or sequential tasks to overlap incorrectly. A standard longest-path or BFS-based topological leveling algorithm should have been used.

## Improvement Areas
- **Use Stable Topological Leveling**:
  - Replace the single-pass $O(N^2)$ loop with a standard Kahn's or DFS-based leveling algorithm to ensure that levels are computed correctly regardless of the order of nodes in the `children` array.
- **DecisionGraph and ChoiceGraph Fallbacks**:
  - `DecisionGraph` and `ChoiceGraph` conversions are approximated as simple direct flows (lines 106-113). While safe against crashes, this means any routing logic inside Decision Graphs or Choice Graphs is completely lost in the exported YAWL file.

## Code References
- **Rust Implementation**: `wasm4pm/src/powl/conversion/to_yawl.rs` (method: `powl_to_yawl_string` / `to_yawl_xml`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `yawl_export`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
