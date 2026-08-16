---
receipt: W4PM-LEAN-GALL-034
date: 2026-07-29
status: PARTIAL_ALIVE
gate: PSO degenerate-result parameter sweep + GA/ACO/PSO RNG centralization (Rust-internal defect closure, follow-up to 018)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-020 (receipts/W4PM-LEAN-GALL-020-algorithm-crown.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 034 — PSO Guard Check and RNG Centralization

## Scope

Checkpoint W4PM-LEAN-GALL-018 fixed a confirmed-live core-level degenerate-result defect in
`discover_aco_algorithm_from_log` (`wasm4pm/src/genetic_discovery.rs`) and flagged, but did not
verify, two related items as out of scope:

1. `discover_pso_algorithm_from_log` has the same core-level-only-input-empty-guard shape ACO
   had before its fix — not demonstrated as a live failure, "worth a follow-up parameter sweep."
2. GA, ACO, and PSO each locally construct `StdRng::seed_from_u64(42)` rather than using a
   single centralized RNG-source convention — "a future centralization would need to touch 3
   call sites."

This checkpoint addresses both, with one confirmed non-defect and one completed migration.

## Task 1 — PSO degenerate-result sweep: genuine negative finding, no algorithm change

A new regression test, `pso_degenerate_result_sweep`
(`wasm4pm/tests/algorithm_correctness.rs`), calls `discover_pso_algorithm_from_log` on the same
nontrivial `controlled_log()` fixture ACO's regression test uses, across every
`(swarm_size, iterations)` pair in `1..=10 × 1..=10` (100 combinations total), and asserts that
whenever the function returns `Some(...)`, the DFG's edge set is nonempty.

**Result: zero degenerate cases across all 100 combinations.** The assertion passed on first
run with no code changes:

```
running 1 test
test pso_degenerate_result_sweep ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 50 filtered out; finished in 0.06s
```

Per the task directive and the no-overclaiming discipline this project runs under: since the
sweep found nothing, **no fallback-to-full-edge-vocabulary fix was applied to
`discover_pso_algorithm_from_log`.** Inventing a fix for a defect that was not demonstrated
would itself be an overclaim. The reason PSO does not exhibit ACO's failure mode is structural,
not incidental to this sweep: PSO's particle position always starts from a spawn draw with
inclusion probability 0.6 (vs. ACO's per-edge Bernoulli draw gated by `tau^alpha * eta^beta`,
which can legitimately collapse toward 0 at low iteration counts before pheromone accumulates),
and PSO's global best is carried forward from the first spawn (`best_global` is seeded from the
first particle, never `None` after initialization) rather than recomputed fresh each iteration
the way ACO's per-iteration ant colony is. This is offered as an explanation for the empirical
result, not as a proof PSO can never degenerate outside the swept parameter range.

The sweep test is retained permanently in `algorithm_correctness.rs` as regression coverage —
if a future change to PSO's spawn/blend logic ever introduces this failure mode, the test will
catch it.

## Task 2 — RNG centralization: drop-in swap to an in-crate function, not the cognition-crate one

The task directive named `support::rng::seeded_rng()` (per the project's global gotchas file)
as the target of centralization. Investigation via `mcp__plugin_lumen_lumen__semantic_search`
found that this function lives at
`crates/wasm4pm-cognition/src/breeds/support/rng.rs`, in the **wasm4pm-cognition crate**, and
returns `rand::rngs::SmallRng` — a different RNG type from the `StdRng` that
`genetic_discovery.rs`'s seeded helper functions (`create_random_edge_set_seeded`,
`crossover_edges_seeded`, `mutate_edges_seeded`, `blend_edges_seeded`, `rand_select_seeded`, all
typed `&mut StdRng`) are written against. Migrating to it would require either a cross-crate
dependency from `wasm4pm` (core) onto `wasm4pm-cognition` (a layer that currently depends on
`wasm4pm`, not the reverse) or retyping five helper functions and their call sites — out of
proportion to a same-behavior RNG-source consolidation, and not what "drop-in" means per the
task's own instruction to check the signature before assuming.

The `wasm4pm` crate already has an in-crate function built for exactly this purpose:
`discovery_determinism_guards::create_deterministic_rng()`
(`wasm4pm/src/discovery_determinism_guards.rs`), which returns
`StdRng::seed_from_u64(STOCHASTIC_ALGORITHM_SEED)` with `STOCHASTIC_ALGORITHM_SEED == 42` — the
exact same type and exact same seed as the three local `StdRng::seed_from_u64(42)` call sites,
and its own doc comment states "All algorithms must use this function to ensure consistency."
This is the actual drop-in target within the crate genetic_discovery.rs lives in.

**Migration applied**: all three call sites in `wasm4pm/src/genetic_discovery.rs` —
`discover_genetic_algorithm_from_log` (line 134), `discover_pso_algorithm_from_log` (line 251),
`discover_aco_algorithm_from_log` (line 504) — were changed from
`let mut rng = StdRng::seed_from_u64(42);` to
`let mut rng = create_deterministic_rng();`, with the import updated from
`use rand::{Rng, SeedableRng};` to `use rand::Rng;` plus
`use crate::discovery_determinism_guards::create_deterministic_rng;` (the `SeedableRng` trait
import was no longer needed in this file once no code calls `::seed_from_u64` directly here).

**No public function signatures changed.** `discover_ga_algorithm_from_log`,
`discover_aco_algorithm_from_log`, and `discover_pso_algorithm_from_log` keep their existing
parameter lists and return types (`Option<(DFG, f64)>`), so no caller updates were needed. A
search across `crates/wasm4pm-cli/src/commands/*_bridge.rs` (`aco_bridge.rs`,
`genetic_bridge.rs`, `pso_bridge.rs`) confirmed all three call these functions only by name with
unchanged arguments; `cargo check -p wasm4pm-cli` after the migration compiles clean with no
changes required there.

## Verification — before/after command output

Before any changes:
```
$ cargo test --lib 2>&1 | tail -8
...
test result: ok. 1004 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.41s

$ cargo test --test algorithm_correctness 2>&1 | tail -10
...
test result: ok. 50 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.04s
```

After the sweep test + RNG migration:
```
$ cargo test --lib 2>&1 | tail -8
...
test result: ok. 1004 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.45s

$ cargo test --test algorithm_correctness 2>&1 | tail -15
...
test result: ok. 51 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s
```

`cargo test --lib` did not SIGABRT this run (the project's documented gotcha is a possibility,
not a guarantee) — pass/fail counts are read directly from the `test result:` summary line
either way, per the project's own instruction for that case.

**1004 passed / 0 failed / 12 ignored, unchanged** in `--lib` — confirms the RNG migration
changed no lib-level unit test behavior. **50 → 51 passed in `algorithm_correctness`, 0
failed** — the +1 is exactly the new `pso_degenerate_result_sweep` regression test; every
previously-passing test (including `ga_deterministic_same_seed`, `aco_deterministic_same_seed`,
`pso_deterministic_same_seed`, all of which compare two runs at the same seed) still passes
byte-for-byte after the RNG source change, confirming
`create_deterministic_rng()` is itself deterministic and the migration is behavior-preserving.

`cargo check` (whole workspace, includes `wasm4pm-cognition` and `wasm4pm-cli`) and
`cargo check -p wasm4pm-cli` both complete clean after the migration.

## Deliverables

- `wasm4pm/tests/algorithm_correctness.rs`: new `pso_degenerate_result_sweep` test (permanent
  regression coverage regardless of outcome, per task directive).
- `wasm4pm/src/genetic_discovery.rs`: RNG construction migrated at all 3 call sites (GA line
  134, PSO line 251, ACO line 504) to `discovery_determinism_guards::create_deterministic_rng()`.
  No change to `discover_pso_algorithm_from_log`'s core algorithm — the sweep found nothing to
  fix.
- `wasm4pm/correspondence/maps/heuristic-stochastic-miners.json`: `flagged_defects_out_of_scope`
  and per-algorithm `rng`/`degenerate_result_risk` fields updated to reflect both findings
  (RNG centralization completed; PSO degenerate-result risk checked live and found absent).

## Evidence class achieved

PSO: confirmed **non-defect** (checked live via 100-combination sweep, not merely
unverified-and-assumed-fine). RNG centralization: **ALIVE** — migrated at all 3 call sites,
verified by unchanged before/after test counts (behavior-preserving) and clean
`cargo check`/`cargo check -p wasm4pm-cli`.

## Explicit scope boundary

This checkpoint does **not** claim: that PSO can never produce a degenerate empty-edge result
outside the swept `1..=10 × 1..=10` parameter range (the sweep is evidence over that range, not
a proof over all `(swarm_size, iterations)`); that `discovery_determinism_guards::create_deterministic_rng()`
is the same symbol as the cognition crate's `support::rng::seeded_rng()` (it is a distinct,
crate-local function serving the same architectural role — the task's own instruction was to
verify drop-in compatibility rather than assume it, and that verification found the named
function was the wrong migration target for this crate); any Lean correspondence for GA, ACO,
or PSO (none exists, unchanged from 018).

## Standing

`PARTIAL_ALIVE` — one confirmed non-defect closing an open flag from 018 with live sweep
evidence (not assumed-fine), plus a completed, test-verified RNG centralization at all 3
call sites named in 018's flag, with before/after counts proving the migration is
behavior-preserving.
