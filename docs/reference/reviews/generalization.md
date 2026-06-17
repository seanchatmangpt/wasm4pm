# Algorithm Review: generalization

## Algorithm ID & Domain
- **Algorithm ID**: `generalization`
- **Domain**: Process Mining / Evaluation (Generalization Quality Metric for Petri Nets)

## Correctness Audit
- **Early Exit Guards**:
  - `compute_quality` checks if the number of visible transitions is 0 (lines 262-266) and returns a default generalization score of `1.0` and penalty `0.0`.
- **Division-by-Zero Protection**:
  - In `compute_generalization`, the raw score is computed as `1.0 - penalty_sum / visible_count as f64` (line 339). A guard `if visible_count == 0` (lines 329-331) protects against division-by-zero.
  - The final score is checked using `raw.is_finite()` (lines 340-344). If it is finite, it is clamped to `[0.0, 1.0]`. If it is `NaN` or `Infinity`, it defaults to `0.0`. This is a highly robust guard.
- **Special Cases / Edge Behaviors**:
  - During token replay, if a transition cannot fire, the algorithm injects missing tokens (lines 214-222) by setting preset places to `1` token if they were `0`, and then forces the transition to fire. This is a standard and correct implementation of token-based replay.
  - Silent transitions (those with `is_invisible = Some(true)`) are correctly excluded from the visible transitions count (lines 312-314) and from the penalty sum (lines 312-314).

## Improvement Areas
- **Unnecessary Cloning in Replay Loop**:
  - In `replay_trace` (lines 176-227), for every event in the trace:
    - It clones candidate IDs: `let candidates = self.label_to_transitions.get(activity).cloned().unwrap_or_default();` (lines 182-186).
    - Inside the candidate loop, it clones the preset and postset place vectors:
      `let preset_clone = preset.clone();` and `let postset_clone = postset.clone();` (lines 197-198, 212-213).
    - Since preset and postset are `Vec<usize>`, this allocates heap memory for every single transition check and firing. Since `self.transitions` is not mutated during replay (only `self.marking` is), the code could pass references `&[usize]` to `is_enabled` and `fire`, avoiding these allocations.
- **Event Log Cloning**:
  - In `generalization` (lines 368-388), it clones the entire EventLog object: `let log = log.clone();` (line 375). This is done to release the lock on the global state before acquiring the lock for the PetriNet object. While necessary to avoid deadlocks in a dual-handle API, this allocation is expensive for large logs.

## Code References
- **Rust Implementation**: `wasm4pm/src/generalization.rs` (method: `generalization` / `compute_quality`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `generalization`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
