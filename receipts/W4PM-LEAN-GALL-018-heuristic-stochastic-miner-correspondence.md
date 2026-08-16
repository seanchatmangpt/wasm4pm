---
receipt: W4PM-LEAN-GALL-018
date: 2026-07-29
status: PARTIAL_ALIVE
gate: heuristic/stochastic miner correspondence (proof-dependency program, checkpoint 018/020)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-017 (receipts/W4PM-LEAN-GALL-017-ocel-semantics-correspondence.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 018 — Heuristic/Stochastic Miner Correspondence

## All 6 algorithms are `no_lean_coverage` — independently re-confirmed, not assumed

Two lumen-first Explore agents checked genetic mining, ACO, PSO, Heuristic Miner, Inductive
Miner, and ILP Petri-net discovery against `mfact`/`mfw` directly (not by trusting the
existing `W4PM-LEAN-GALL-009`/`009A` master ledger — by independently re-searching both
repos for actual `.lean` source matching these algorithms). No genuine Lean formalization of
any of the 6 exists in either repo; a Python "genetic tactic search" tool
(`mfact/scripts/genetic_tactic_search.py`, explicitly labeled "exploratory, off-ledger
tooling") and a markdown "Theorem 3.1" prose sketch in `mfw` were both found and explicitly
rejected as coverage — neither is a kernel-checked Lean proof. This confirms the master
ledger exactly; no correction was needed.

Three of the six (genetic, ACO, PSO) are stochastic by design — population/swarm/pheromone
sampling means exact correspondence is structurally impossible even with full proof
coverage; only a probabilistic convergence claim could ever be proven, and none exists.
Heuristic Miner, Inductive Miner, and ILP discovery are fully deterministic, but no Lean
work targets any of them either.

Since no Lean-side claim exists to bridge to for any of these 6, this checkpoint's real
contribution is not a correspondence harness — it is a **confirmed-live defect fix**,
matching the standing Autonomous Gall Closure Directive's explicitly-flagged "degenerate
ACO result" active defect.

## The ACO degenerate-result gap was live, not hypothetical

The CLI bridge (`aco_bridge.rs`) already refused a `DEGENERATE_RESULT` (nontrivial input
converging to an empty DFG) at its own layer. The Explore agent confirmed the core crate's
`discover_aco_algorithm_from_log` had no equivalent guard — any direct caller bypassing the
CLI bridge remained exposed.

**Attempting the obvious fix (a bare refusal returning `None` on empty edges) broke two
existing, previously-passing tests** (`aco_fitness_in_range`, `aco_deterministic_same_seed`)
— at their exact parameter range (5 ants, 5–10 iterations, seed 42), every ant's Bernoulli
edge-selection draw legitimately fails every iteration, and `best_solution` converges to a
genuinely empty edge set on nontrivial input. This is decisive, reproducible evidence the
degenerate case is real, not a theoretical edge case.

**Fix applied**: when the stochastic search converges to an empty edge set, fall back to the
full observed edge vocabulary (the raw directly-follows relation) rather than either
silently reporting success with an empty DFG (the old bug) or refusing outright (which
breaks legitimate low-parameter usage) — an honest "nothing better than the raw DFG was
found" answer, with a genuinely computed fallback fitness, not a fabricated one.

A new regression test, `aco_never_returns_empty_dfg_on_nontrivial_input`
(`wasm4pm/tests/algorithm_correctness.rs`), asserts the invariant directly: whenever
`discover_aco_algorithm_from_log` returns `Some(...)`, the DFG must have a nonempty edge set.

## Flagged, not fixed, this checkpoint
- Genetic, ACO, and PSO each construct their own `StdRng::seed_from_u64(42)` locally in
  `genetic_discovery.rs`, rather than the documented `support::rng::seeded_rng()`
  single-RNG-source convention. Reproducible today, but architecturally inconsistent — a
  future centralization would need to touch 3 call sites.
- PSO's core function has the same core-level-only-input-empty-guard shape ACO had before
  this fix. Not demonstrated as a *live* failure (no existing test broke), so not fixed here
  — worth a follow-up parameter sweep.
- ILP discovery's name is a terminology mismatch with its implementation (a deterministic
  threshold-sweep + greedy set-cover approximation, not a true ILP solver) — not a
  correctness defect, worth a doc clarification only.

## Full command output
```
running 3 tests
test aco_never_returns_empty_dfg_on_nontrivial_input ... ok
test aco_fitness_in_range ... ok
test aco_deterministic_same_seed ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 47 filtered out; finished in 0.00s
```
Full `algorithm_correctness` integration-test file: **50 passed, 0 failed** (up from 49
pre-fix — the +1 new regression test only, no other change). Crate-scoped `cargo test
--lib`: **1004 passed, 0 failed, 12 ignored** — unchanged from checkpoint 017 (this fix
touches only `genetic_discovery.rs`, an integration-test-covered path, not a lib unit test).

## Evidence class achieved
All 6 algorithms: `UNMAPPED (no_lean_coverage)` — independently re-confirmed, no correction
to the master ledger needed. The ACO fix is evidenced by a before/after test result (a
concrete defect closure, following the same discipline as checkpoint 014's DECLARE fix),
not a Rust↔Lean correspondence claim — there is no Lean side to claim correspondence to.

## Explicit scope boundary
This checkpoint does **not** claim: any Lean correspondence for genetic/ACO/PSO/Heuristic
Miner/Inductive Miner/ILP (none possible — no Lean coverage exists for any of them); that
PSO's analogous degenerate-result risk has been verified live or fixed (flagged only); that
the RNG-source architectural inconsistency has been resolved (flagged only); that ACO's
fallback-to-raw-DFG behavior is optimal in any formal sense — it is an honest, non-silent
answer, not a proven-best one.

## Standing
`PARTIAL_ALIVE` — a confirmed-live defect (ACO core-level degenerate result) found and
fixed with before/after test evidence, plus an honest, independently-re-verified ledger of
`no_lean_coverage` across all 6 algorithms and 3 explicitly flagged (not fixed) related
findings. No Lean correspondence is claimed anywhere in this checkpoint, since none is
possible given current mfact/mfw coverage.
