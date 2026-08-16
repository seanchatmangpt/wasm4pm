---
receipt: W4PM-LEAN-GALL-033
date: 2026-07-29
status: PARTIAL_ALIVE
gate: OC-DFG implementation unification + oc_conformance docstring fix (Rust-internal defect closure)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-020 (receipts/W4PM-LEAN-GALL-020-algorithm-crown.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 033 — OC-DFG Unification and oc_conformance Docstring Fix

## Scope

Checkpoint W4PM-LEAN-GALL-017 flagged two Rust-internal defects as out of scope for its
correspondence claim (`receipts/W4PM-LEAN-GALL-017-ocel-semantics-correspondence.md`,
"Flagged, out of scope" section). This checkpoint fixes both. Neither fix touches the Lean
side or changes the `UNMAPPED (no_lean_coverage)` status of the OC-DFG-per-type or OC
conformance rows in `wasm4pm/correspondence/maps/ocel-semantics.json` — those rows are
`no_lean_coverage` because no Lean-side claim exists to bridge to, which this checkpoint does
not change.

## Fix 1 — `oc_conformance.rs` docstring overclaim

`oc_conformance_check_inner` (`wasm4pm/src/oc_conformance.rs`, lines 26-127) computes, per
trace, whether every activity in the trace appears as a transition label in the discovered
net (activity-set membership) — it does not replay tokens against the net's control-flow
structure. The docstring at line 21 claimed "Token-replay each trace." Corrected to:

```
/// 3. Check activity-set membership per trace (a trace "fits" iff every one of its
///    activities appears as a transition label in the discovered net — this is a
///    coverage check, not ordered token replay: it does not verify that activities
///    occur in an order the net's control-flow actually permits)
```

No computation logic changed — this is a doc-only fix, deliberately scoped narrow per the
task's own instruction (fixing the replay logic itself would be a much larger, riskier
change).

## Fix 2 — OC-DFG implementation unification

Two independent per-object-type OC-DFG implementations existed:
- `wasm4pm/src/discovery.rs::discover_ocel_dfg_per_type` (wasm-bindgen export, handle-based) —
  the more mature of the two: full sorted activity vocabulary (so every activity gets a node
  even with zero occurrences for a given object type), a bitmask fast path for ≤64 activities,
  and pre-computed global activity frequencies. Its sibling `discover_ocel_dfg_pure` (the
  single-log core sharing the same windows/sort/edge-aggregation pattern) has direct test
  coverage in `wasm4pm/tests/ocel_dfg_discovery_tests.rs` (5 tests) and
  `wasm4pm/tests/ocel_object_centric_audit.rs`.
- `wasm4pm/src/advanced/ocdfg.rs::OCDFG::discover` (`&OCEL -> OCDFG`, used directly by
  `crates/wasm4pm-cli/src/commands/ocdfg_bridge.rs`) — a separate, `HashMap`-iteration-ordered
  reimplementation of the same algorithm (activity/edge/start/end frequency maps populated via
  `HashMap`, non-deterministic node/edge insertion order — a violation of this repo's own rule
  that breed/discovery output must use BTreeMap/BTreeSet/sorted Vec, `CLAUDE.md` "Common
  gotchas"). Its only direct test, `discovers_per_object_type_dfgs`
  (`ocdfg_bridge.rs`), asserts individual edge/activity presence via `.iter().any(...)`, which
  happens to be order-insensitive, masking the underlying non-determinism.

Grepped both symbols across the workspace (`grep -rln "OCDFG\|discover_ocel_dfg_per_type\|discover_ocel_dfg_pure"`)
before changing anything: `OCDFG` is consumed only by `ocdfg_bridge.rs` and `mining.rs` in the
CLI crate; `discover_ocel_dfg_per_type` is consumed by the wasm-bindgen JS/TS surface
(`api.ts`, `client.ts`, `mcp_server.ts`) — confirming neither public signature could change.

**Consolidation applied**: extracted the body of `discover_ocel_dfg_per_type` into a new pure
function `discover_ocel_dfg_per_type_pure(ocel: &OCEL) -> BTreeMap<String, DFG>`
(`wasm4pm/src/discovery.rs`). `discover_ocel_dfg_per_type` (the wasm export) now calls it and
serializes the result — no public signature change. `OCDFG::discover`
(`wasm4pm/src/advanced/ocdfg.rs`) is now a 3-line thin wrapper:

```rust
pub fn discover(ocel: &OCEL) -> Self {
    Self { dfgs: discover_ocel_dfg_per_type_pure(ocel) }
}
```

No public signature changed on either side; `crates/wasm4pm-cli/src/commands/ocdfg_bridge.rs`
was not modified.

### Golden test proving CLI bridge output is unchanged

Added `ocdfg_discover_matches_canonical_per_type_pure`
(`crates/wasm4pm-cli/src/commands/ocdfg_bridge.rs`), on the same `OCEL_JSON` fixture used by
the pre-existing `discovers_per_object_type_dfgs` test:

```rust
let via_wrapper = OCDFG::discover(&ocel).dfgs;
let via_canonical = wasm4pm::discovery::discover_ocel_dfg_per_type_pure(&ocel);
assert_eq!(
    serde_json::to_value(&via_wrapper).unwrap(),
    serde_json::to_value(&via_canonical).unwrap(),
    ...
);
```

## Verification

Baseline, run before any edits:
```
$ cd /Users/sac/wasm4pm/wasm4pm && cargo test --lib
test result: ok. 1004 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.42s
```

After both fixes:
```
$ cd /Users/sac/wasm4pm/wasm4pm && cargo check
    Checking wasm4pm v26.7.23 (/Users/sac/wasm4pm/wasm4pm)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 5.40s
$ cargo test --lib
test result: ok. 1004 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.43s
```

**1004 passed, 0 failed, 12 ignored — identical before and after.** No regressions; no test
count change from the core crate (the new golden test lives in the `wasm4pm-cli` crate, not
`wasm4pm`, so it does not appear in this count).

CLI bridge tests:
```
$ cargo test -p wasm4pm-cli ocdfg
test commands::ocdfg_bridge::tests::discovers_per_object_type_dfgs ... ok
test commands::ocdfg_bridge::tests::ocdfg_discover_matches_canonical_per_type_pure ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 14 filtered out; finished in 0.00s
```

## Explicit scope boundary

This checkpoint does **not**: add Lean-side coverage for OC-DFG-per-type or OC conformance
(both remain `UNMAPPED (no_lean_coverage)` — nothing on the Lean side changed); fix
`oc_conformance_check_inner`'s underlying activity-set-membership computation (only its
docstring, deliberately, per task scope); address the `discover_ocel_dfg_per_type` vs
`discover_ocel_dfg_pure` semantic difference (full activity vocabulary with zero-frequency
nodes vs. observed-only nodes) — the two remain intentionally different functions serving
different callers (per-type vs. single-log), only `OCDFG::discover`'s independent
reimplementation was removed.

## Standing

`PARTIAL_ALIVE` — two Rust-internal defects from checkpoint 017's flagged list are now fixed
with command-verified before/after test evidence and a golden-output test; the underlying
`no_lean_coverage` status of the OC-DFG-per-type and OC-conformance correspondence claims is
unchanged (honest gap, not silently closed).
