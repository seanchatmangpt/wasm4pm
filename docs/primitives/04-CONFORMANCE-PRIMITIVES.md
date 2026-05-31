# Agent 5 — Conformance Primitive Agent

## Mission
Make conformance a primitive, not an application feature. Build or harden token replay,
alignment fitness, ET conformance precision, Declare conformance, prefix conformance.

## Status
Implemented. All five conformance primitives are present and exposed via `#[wasm_bindgen]`
exports. Boundary guards (`conformance_guards.rs`) enforce fitness clamping and zero-
denominator safety. Streaming prefix conformance is fully integrated. Alignment-based
fitness and ETConformance precision are feature-gated (`alignment_fitness`,
`align_etconformance`).

---

## Paper / Specification Grounding

| Primitive | Reference |
|---|---|
| Token replay | Rozinat & van der Aalst, "Conformance Checking of Processes Based on Monitoring Real Behavior", *IS* 2008 |
| Alignment fitness | van der Aalst et al., "Replaying History on Process Models for Conformance Checking and Performance Analysis", *WIRES DMKD* 2012 |
| ETConformance precision | Munoz-Gama & Carmona, "A Fresh Look at Precision in Process Conformance", ICATPN 2010 |
| Declare conformance | Pesic & van der Aalst, "A Declarative Approach for Flexible Business Processes Management", BPM 2006 |
| Prefix conformance | van Zelst et al., "Online Process Monitoring Using Incremental State-Space Expansion", BPM 2018 |
| Generalization | van der Aalst, *Process Mining* (2016), §9.3 — four quality dimensions |

---

## Implementation Files

| File | Role |
|---|---|
| `wasm4pm/src/conformance.rs` | Token replay (`token_replay_pure`, `check_token_based_replay`), `PetriNetLookup` cache, bitmask replay path |
| `wasm4pm/src/conformance_guards.rs` | Fitness boundary enforcement: empty-log guard, zero-denominator guard, bounds clamp |
| `wasm4pm/src/conformance_cache.rs` | LRU memoization for fitness/precision (log_hash:model_hash key) |
| `wasm4pm/src/conformance_reporting.rs` | Structured reporting: per-trace deviations, summary stats |
| `wasm4pm/src/alignment_fitness.rs` | A*-based optimal alignment fitness (feature-gated) |
| `wasm4pm/src/align_etconformance.rs` | Alignment-based ETConformance precision (feature-gated) |
| `wasm4pm/src/etconformance_precision.rs` | Escaping-edges ETConformance precision (always-on) |
| `wasm4pm/src/declare_conformance.rs` | Declare template checking (`Response(A,B)` and more) |
| `wasm4pm/src/streaming_conformance.rs` | Prefix conformance session API, streaming token replay |
| `wasm4pm/src/generalization.rs` | Generalization quality metric (activity-coverage approach) |
| `wasm4pm/src/simd_token_replay.rs` | SIMD-accelerated token replay (feature-streaming-full) |
| `wasm4pm/src/powl/conformance/token_replay.rs` | POWL-native token replay (separate from model-based) |
| `wasm4pm/src/powl/conformance/soundness.rs` | WF-net soundness (deadlock-free, bounded, proper completion) |
| `wasm4pm/src/powl/conformance/footprints_conf.rs` | Footprint-based precision for POWL models |

---

## WASM Exports

| Export | Module | Notes |
|---|---|---|
| `check_token_based_replay` | `conformance.rs` | Always-on; handles, returns `ConformanceResult` JSON |
| `conformance_info` | `conformance.rs` | Meta: returns formula + version string |
| `alignment_fitness` | `alignment_fitness.rs` | Feature-gated `alignment_fitness`; A* search |
| `align_etconformance_precision` | `align_etconformance.rs` | Feature-gated `align_etconformance` |
| `wasm_compute_precision` | `etconformance_precision.rs` | Always-on escaping-edges precision |
| `check_declare_conformance` | `declare_conformance.rs` | Log handle + declare handle |
| `store_declare_from_json` | `declare_conformance.rs` | Stores Declare model, returns handle |
| `streaming_conformance_begin` | `streaming_conformance.rs` | Opens streaming session against a model |
| `streaming_conformance_add_event` | `streaming_conformance.rs` | Feeds one event into prefix checker |
| `streaming_conformance_close_trace` | `streaming_conformance.rs` | Finalises one trace, returns result |
| `streaming_conformance_finalize` | `streaming_conformance.rs` | Closes session, aggregates stats |
| `check_prefix_conformance` | `streaming_conformance.rs` | One-shot prefix check (no session) |
| `generalization` | `generalization.rs` | Activity-coverage generalization score |
| `check_powl_soundness` | `powl_api.rs` | Delegates to `powl/conformance/soundness.rs` |

---

## Test Suite

| Test File | Coverage |
|---|---|
| `wasm4pm/tests/conformance_real_data_tests.rs` | Token replay, alignment fitness, ETConformance on real XES data |
| `wasm4pm/tests/conformance_edge_cases.rs` | Boundary guards: empty log, zero denominator, single event, degenerate model |
| `wasm4pm/tests/conformance_model_truth_gaps.rs` | Van der Aalst 5-gap audit: bounds, ordering, case-count, token balance, final-state coherence |
| `wasm4pm/tests/ground_truth_conformance_tests.rs` | Known-answer oracle: synthetic log/model pair with expected fitness 1.0 |
| `wasm4pm/tests/self_conformance_tests.rs` | Self-conformance: log discovered from itself must achieve fitness 1.0 |
| `wasm4pm/tests/declare_conformance_integration_test.rs` | Declare `Response(A,B)` with violations injected |
| `wasm4pm/tests/declare_all_constraints_test.rs` | All supported Declare templates exercised |
| `wasm4pm/tests/powl_cross_validation.rs` | POWL token replay: Loop, ChoiceGraph, AND, XOR precision |
| `wasm4pm/tests/algorithm_correctness.rs` | Soundness over synthetic WF-nets |
| `wasm4pm/tests/gpu_conformance_vectors.rs` | SIMD / GPU conformance vector parity (feature-gated) |

---

## Verification Criteria

1. **Fitness formula** — `fitness = 1.0 - (missing + consumed) / max(1, produced + remaining)`.
   All guards in `conformance_guards.rs` enforce `fitness ∈ [0.0, 1.0]` and protect against
   zero-denominator. Regression: `conformance_edge_cases.rs`.

2. **Self-conformance invariant** — Discovering a Petri net from a log and replaying that
   same log must yield fitness ≥ 0.85. `self_conformance_tests.rs` enforces this for
   all kernel-registered discovery algorithms.

3. **Alignment optimality (Rank 1 oracle)** — A* finds the globally optimal alignment
   (minimum edit distance). Tested: cost(optimal alignment) ≤ cost(any greedy alignment)
   on same log/model pair.

4. **ETConformance escaping-edge identity** — `precision = 1 - escaping / (escaping + consumed)`.
   Empty log yields precision 1.0 (no escaping edges observed). A perfectly-fitted model
   yields precision 1.0. `conformance_model_truth_gaps.rs` validates the ordering invariant
   `fitness ≥ precision` (always true by definition).

5. **Declare response template** — For `Response(A, B)`: every occurrence of A must be
   followed by B. Injecting a trace `[A, C]` (no B after A) must produce a violation.

6. **Streaming session hygiene** — `streaming_conformance_close_trace` on an unknown
   `case_id` returns an error; `streaming_conformance_finalize` on an already-finalized
   session returns the cached result, not a panic.

---

## Key Data Structures

```rust
// wasm4pm/src/models.rs:933
pub struct TokenReplayResult {
    pub case_id: String,
    pub is_conforming: bool,
    pub trace_fitness: f64,
    pub tokens_missing: usize,
    pub tokens_remaining: usize,
    pub deviations: Vec<TokenReplayDeviation>,
}

// wasm4pm/src/models.rs:950
pub struct ConformanceResult {
    pub case_fitness: Vec<TokenReplayResult>,
    pub avg_fitness: f64,
    pub conforming_cases: usize,
    pub total_cases: usize,
}

// wasm4pm/src/alignment_fitness.rs:19
pub struct AlignmentFitnessReport {
    pub fitness: f64,
    pub total_cost: f64,
    pub total_sync_moves: usize,
    pub total_log_moves: usize,
    pub total_model_moves: usize,
}

// wasm4pm/src/etconformance_precision.rs:40
pub struct PrecisionResult {
    pub precision: f64,   // 0.0–1.0
    // ... per-trace escaping/consumed counts
}

// wasm4pm/src/powl/conformance/soundness.rs:18
pub struct SoundnessResult {
    pub sound: bool,
    pub deadlock_free: bool,
    pub bounded: bool,
    pub liveness: bool,
}
```

---

## Planned / Not Yet Implemented

- **Generalization via log sampling** — Current `generalization.rs` uses activity-coverage.
  The full van der Aalst §9.3 generalization (bootstrapped log sampling) is not yet
  implemented; the metric is approximate.
- **Multi-perspective conformance** — Combining control-flow, time, and resource conformance
  into a single score is planned but not yet a registered kernel algorithm.
- **Declare templates beyond Response** — `Existence`, `Precedence`, `Absence`, and
  `Succession` constraints are scaffolded in `declare_all_constraints_test.rs` but
  not all are implemented in `declare_conformance.rs`.
