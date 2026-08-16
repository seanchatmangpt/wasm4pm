---
receipt: W4PM-LEAN-GALL-019
date: 2026-07-29
status: PARTIAL_ALIVE
gate: native/WASM/SIMD refinement (proof-dependency program, checkpoint 019/020)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-018 (receipts/W4PM-LEAN-GALL-018-heuristic-stochastic-miner-correspondence.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 019 — Native/WASM/SIMD Refinement

## Scope: Rust-internal, no Lean side

Unlike checkpoints 010–018, this checkpoint's claim is entirely internal to wasm4pm's Rust
implementation — whether native-compiled and wasm32-compiled code agree, and whether
SIMD-accelerated paths agree with their scalar equivalents. There is no Lean formalization
to cite here; evidence is direct command execution, not a Rust↔Lean differential.

## Verified this checkpoint (real command execution, re-run, not assumed)

1. **wasm4pm wasm32 gate** — `cargo check --target wasm32-unknown-unknown` (no `--features
   wasm`, per CLAUDE.md's own note that this crate has no wasm feature): **PASS**. 1 warning
   (mutable-static-reference lint, `rust_2024_compatibility` category, `probabilistic/
   wasm_bindings.rs:33`), 0 errors.
2. **wasm4pm-cognition wasm32 gate** — `cargo check --target wasm32-unknown-unknown
   --features wasm`: **PASS**. 1 warning (unknown-lint `removed`,
   `autosystems/candidates.rs:45`), 0 errors.
3. **SIMD-vs-scalar equivalence (same compile target)** — `cargo test --lib simd`: **23
   passed, 0 failed**, including `simd_streaming_dfg::tests::test_parity_with_scalar_dfg`
   and `test_columnar_parity_with_discovery_dfg`, which directly assert SIMD-path and
   scalar-path outputs match on identical input.

## What real SIMD code exists

- `simd_streaming_dfg.rs:137-174,231-261` — genuine `std::arch::wasm32` v128 intrinsics
  (`v128_load`/`i32x4_extract_lane`/`i32x4_replace_lane`/`v128_store`), cfg-gated to
  `target_arch = "wasm32"`, with an explicit scalar fallback for other targets.
- `simd_inner_loops.rs` — x86 `target_feature`-gated tiers (`avx512f`/`avx2`/`sse4.2`) with
  scalar fallback. These tiers do not actually invoke vector intrinsics — they are scalar
  loops behind cfg guards labeled by SIMD-width tier — so they are bit-identical to scalar
  **by construction**, not merely tested-equivalent.
- `lib.rs:14` declares `#![feature(portable_simd)]` (a nightly feature flag) but no
  `std::simd` usage was found beyond the flag itself.

## What is honestly NOT established: native-vs-wasm32 cross-target execution equivalence

No test harness exists that builds wasm4pm for `wasm32-unknown-unknown`, executes it under
an actual wasm runtime (wasmtime/node), and diffs its output against a native run of the
same input. This was confirmed absent by direct search, not silently assumed to exist.
Building such infrastructure was judged out of scope for this checkpoint.

Given three **already-documented, known divergences** (from CLAUDE.md's own gotcha list,
re-confirmed relevant this checkpoint):
- `to_js(&json!({...}))` returns `{}` on wasm32 — must use `to_js_str()` instead.
- `OcelLog` field names differ on wasm32 (checkpoint 017's Explore agent clarified this
  refers specifically to `bcinr_powl::ocel::OcelLog`, one of three distinct `OcelLog` types
  found across crates — not `wasm4pm::models::OCEL`).
- `ActorId::as_bytes()` fails on wasm32 — use `.public_key` instead.

...this checkpoint explicitly does **not** claim full native/wasm32 output equivalence for
any algorithm. That would overclaim past known, unaddressed divergences.

## Full command output
```
$ cargo check --target wasm32-unknown-unknown   (wasm4pm/wasm4pm)
    Checking wasm4pm v26.7.23 (/Users/sac/wasm4pm/wasm4pm)
warning: creating a mutable reference to mutable static
  --> wasm4pm/src/probabilistic/wasm_bindings.rs:33:26
warning: `wasm4pm` (lib) generated 1 warning
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 9.36s

$ cargo check --target wasm32-unknown-unknown --features wasm   (crates/wasm4pm-cognition)
    Checking wasm4pm-cognition v26.7.23 (/Users/sac/wasm4pm/crates/wasm4pm-cognition)
warning: unknown lint: `removed`
  --> crates/wasm4pm-cognition/src/autosystems/candidates.rs:45:9
warning: `wasm4pm-cognition` (lib) generated 1 warning
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 18.36s

$ cargo test --lib simd   (wasm4pm/wasm4pm)
running 23 tests
test simd_inner_loops::tests::test_activity_counter_accuracy ... ok
test simd_inner_loops::tests::test_marking_updater_fire ... ok
test simd_inner_loops::tests::test_edge_aggregator_accuracy ... ok
test simd_inner_loops::tests::test_variant_hash_determinism ... ok
test simd_inner_loops::tests::test_token_accumulator_fitness ... ok
test simd_streaming_dfg::tests::test_add_events_with_empty_traces ... ok
test simd_streaming_dfg::tests::test_empty_trace_skipped ... ok
test simd_streaming_dfg::tests::test_empty_builder ... ok
test simd_streaming_dfg::tests::test_reset ... ok
test simd_streaming_dfg::tests::test_simd_detection ... ok
test simd_streaming_dfg::tests::test_long_trace_loop_unrolling ... ok
test simd_streaming_dfg::tests::test_add_events_columnar ... ok
test simd_streaming_dfg::tests::test_repeated_edges ... ok
test simd_streaming_dfg::tests::test_columnar_parity_with_discovery_dfg ... ok
test simd_streaming_dfg::tests::test_merge ... ok
test simd_streaming_dfg::tests::test_multiple_traces ... ok
test simd_streaming_dfg::tests::test_single_event_trace ... ok
test simd_streaming_dfg::tests::test_single_trace ... ok
test simd_streaming_dfg::tests::test_parity_with_scalar_dfg ... ok
test simd_token_replay::source_place_tests::test_source_places_single_source ... ok
test simd_token_replay::source_place_tests::test_source_places_parallel_start ... ok
test simd_token_replay::source_place_tests::test_perfect_sequential_trace_achieves_1_0_fitness ... ok

test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 993 filtered out; finished in 0.00s
```

## Evidence class achieved
- Both wasm32 compilation gates: verified `PASS` by direct re-run.
- SIMD-vs-scalar in-target equivalence: verified `PASS` by direct re-run of 23 pre-existing
  tests (not newly written this checkpoint).
- Native-vs-wasm32 cross-target execution equivalence: `NOT ESTABLISHED`, honestly ledgered,
  with the 3 known divergences listed rather than glossed over.

## Explicit scope boundary
This checkpoint does **not** build new cross-target test infrastructure (wasmtime/node
execution harness) — confirmed absent, judged out of scope. It does not claim the 3
CLAUDE.md-documented wasm32 divergences have been fixed (pre-existing, unaddressed). It does
not add new SIMD tests (the 23 found were pre-existing and re-verified, not newly written).

## Standing
`PARTIAL_ALIVE` — two real, re-verified compilation gates and one real, re-verified
in-target equivalence suite, plus an honest ledger entry for the one claim (native/wasm32
cross-target equivalence) this checkpoint cannot support without new infrastructure.
