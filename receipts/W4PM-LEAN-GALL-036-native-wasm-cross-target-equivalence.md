---
receipt: W4PM-LEAN-GALL-036
date: 2026-07-29
status: PARTIAL_ALIVE
gate: native/WASM cross-target execution equivalence (proof-dependency program, checkpoint 036)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-020
---

# 036 — Native/WASM32 Cross-Target Execution Equivalence

## Scope: Rust-internal, no Lean side

Same class as checkpoint 019: this claim is entirely internal to wasm4pm's Rust
implementation (native vs. wasm32 execution output), not a Rust↔Lean correspondence.
Checkpoint 019 found that both wasm32 compilation gates pass and SIMD-vs-scalar equivalence
holds within one compile target, but explicitly ledgered as NOT ESTABLISHED: no harness
existed that ran the same compiled algorithm on both a native target and an actual wasm32
runtime and diffed the output. This checkpoint closes that specific gap for 2 algorithms.

## What was built this checkpoint

- `wasm4pm/wasm4pm/wasm-equivalence-tests/fixture_log.json` — a fixed, deterministic
  `EventLog` fixture: 3 traces, 9 events, 4 distinct activities (A, B, C, D), including a
  repeated-activity edge (B→B) and divergent start/end activities, so degenerate
  single-node/single-edge outputs would not mask a real divergence.
- `wasm4pm/wasm4pm/tests/wasm_equivalence_native.rs` — a `cargo test` that loads the fixture,
  calls `discover_dfg_from_log` (the pure-Rust DFG entry point, no wasm-bindgen boundary) and
  `EventLog::event_count`/`case_count` (the same inherent methods `analyze_event_statistics`
  calls), and writes combined output to `wasm-equivalence-tests/native_output.json`.
- `wasm4pm/wasm4pm/wasm-equivalence-tests/compare.mjs` — a Node.js script that loads the
  wasm-pack `nodejs`-target build (`wasm4pm/wasm4pm/pkg`, pre-existing, timestamped
  2026-07-29 12:01, built via the exact command CLAUDE.md documents:
  `wasm-pack build --target nodejs --out-dir pkg`), executes `discover_dfg` and
  `analyze_event_statistics` under Node's real wasm32 (V8 WebAssembly) runtime against the
  identical fixture file, writes `wasm_output.json`, and does a `JSON.stringify` deep-equality
  diff against `native_output.json`.

## Algorithm selection rationale (avoiding the 3 known divergences)

Both algorithms were chosen specifically because they already route through `to_js_str`
(`src/discovery.rs:145`, `src/analysis.rs:64`) — a JSON-string return, not `to_js(&json!(...))`
— so the documented `to_js` → `{}` divergence does not apply. Neither algorithm touches
`OcelLog` or `ActorId`, so those two known divergences are also out of scope for this pair.
This was a deliberate scope choice, not evidence those divergences are fixed — see "Explicit
scope boundary" below.

## Verified this checkpoint (real command execution)

1. **Native run**: `cargo test --test wasm_equivalence_native` (from `wasm4pm/wasm4pm`) —
   **PASS**, 1/1 test, writes `native_output.json`.
2. **wasm32 run**: `node wasm-equivalence-tests/compare.mjs` (from `wasm4pm/wasm4pm`) — loads
   the real wasm32-compiled `pkg/wasm4pm_bg.wasm` under Node's WebAssembly engine, executes
   both algorithms, diffs against the native output.
3. **Result: AGREE for both algorithms** — byte-identical JSON (after `JSON.parse()` of the
   wasm side's string envelope, which is the only normalization applied and is documented
   inline in both files) for:
   - `discover_dfg`: identical `nodes`/`edges`/`start_activities`/`end_activities`, including
     the repeated B→B edge (frequency 1) and both C and D as end activities.
   - `analyze_event_statistics`: identical `total_events` (9), `total_cases` (3),
     `avg_events_per_case` (3.0).

## Full command output

```
$ cargo test --test wasm_equivalence_native   (wasm4pm/wasm4pm)
running 1 test
test native_dfg_and_stats_output_for_cross_target_diff ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

$ node wasm-equivalence-tests/compare.mjs   (wasm4pm/wasm4pm)
=== discover_dfg (DFG discovery) ===
AGREE (byte-identical JSON after normalization)

=== analyze_event_statistics (event/case counts) ===
AGREE (byte-identical JSON after normalization)

=== SUMMARY ===
ALL ALGORITHMS AGREE (native vs wasm32)
```

## Tooling availability (per task instructions, step 1)

- `wasm-pack`: present, `/Users/sac/.cargo/bin/wasm-pack`, version 0.13.1.
- `node`: present, `/opt/homebrew/bin/node`, v25.9.0.
- `wasmtime`: **not found** on PATH — not needed; `node`'s built-in wasm32 runtime (V8
  WebAssembly engine) was used instead, which is a real wasm32 execution environment, not a
  native shim or mock.
- `wasm4pm/wasm4pm/pkg` (the `nodejs`-target wasm-pack build) already existed, freshly built
  (2026-07-29 12:01, same day as this checkpoint) — no rebuild was required.

## Explicit scope boundary

This checkpoint verifies native/wasm32 output equivalence for exactly **2** algorithms:
`discover_dfg` and `analyze_event_statistics`. It does **not**:
- Claim equivalence for the crate's full algorithm surface — dozens of other
  `discover_*`/`analyze_*` wasm-bindgen exports exist and were not run through this harness.
- Claim the 3 CLAUDE.md-documented divergences (`to_js`→`{}`, `OcelLog` field names,
  `ActorId::as_bytes()`) are fixed — they are pre-existing and unaddressed; the 2 algorithms
  here were chosen specifically because they do not exercise those code paths, not because
  those paths were tested and found fine.
- Re-verify checkpoint 019's SIMD-vs-scalar or wasm32-compilation-gate findings — those are
  cited from 019, not re-run this checkpoint.
- Test WF-net soundness / `analyze_petri_net` — deferred; DFG discovery and event statistics
  were chosen as the tractable first pair per task instructions ("pick whichever is easiest
  to invoke through the existing wasm-bindgen surface without hitting the 3 known
  divergences, to keep this checkpoint's first pass tractable").

## Standing

`PARTIAL_ALIVE` — a real, reproducible native-vs-wasm32 cross-target execution-equivalence
harness now exists (previously confirmed absent in checkpoint 019) and shows exact agreement
for 2 algorithms on a fixed fixture. The correspondence-map ledger entry for this claim is
updated from `NOT ESTABLISHED` to `VERIFIED (checkpoint 036, partial scope: 2 algorithms)` —
not to a blanket "native/wasm32 equivalence established" claim, since only 2 of the crate's
many algorithms were exercised and the 3 known divergences remain open for any algorithm that
does touch those code paths.
