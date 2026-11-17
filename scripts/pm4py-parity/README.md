<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: scripts/pm4py-parity/README.md; source-sha256: 0cacfa6ad810e7fe69188b27b389635b987507c3e0401175aaaf85c58ed53a0e; reason: path-local authority or entrypoint -->

# pm4py Parity Oracle

Reference oracle for wasm4pm conformance metrics. Runs PM4Py's reference
implementations of token-based replay fitness, ETConformance precision, and
alignment-based fitness on an XES log + PNML net (or a discovered net) and
emits a deterministic JSON record. Lane 9 (wasm4pm conformance parity)
consumes this as ground truth.

## Usage

```bash
cd /Users/sac/wasm4pm
python3 scripts/pm4py-parity/oracle.py \
    --log bench_data/sepsis.xes --discover inductive --out result.json
# or: --net model.pnml instead of --discover inductive|alphaminer
```

Exactly one of `--net` / `--discover` is required. Deterministic, no network.
Requires pm4py 2.7.x on system python3.

## What each number means

### token_based_replay

pm4py functions: `fitness_token_based_replay` +
`conformance_diagnostics_token_based_replay`.

Token-based replay pushes each trace through the net from the initial
marking, inserting artificial tokens (`missing`) when a required transition
is not enabled, and counting tokens left over at the end (`remaining`).

pm4py per-trace fitness (classic Muñoz-Gama/Rozinat formula):

```
trace_fitness = 0.5 * (1 - missing/consumed) + 0.5 * (1 - remaining/produced)
```

pm4py `log_fitness` is the aggregate (Σ-deficit) form:
`1 - 0.5*(Σmissing/Σconsumed + Σremaining/Σproduced)`.

### etconformance_precision

pm4py function: `precision_token_based_replay` (ETConformance variant,
Muñoz-Gama & Carmona). For each prefix state s of the log:

```
precision = 1 - Σ_s w(s)*|escapingEdges(s)| / Σ_s w(s)*|enabled(s)|
```

where `escapingEdges(s)` = behavior in the model from s not seen in the log.
1.0 = model allows no more behavior than observed; low = underfitting model.

### alignment_fitness

pm4py function: `fitness_alignments` (A* optimal alignments, standard cost
function: log move cost 1, visible model move cost 1, invisible model move
cost 0). `log_fitness = 1 - total_cost / worst_case_cost`, where worst case
is all-log-moves. 1.0 = every trace replays optimally without deviations.

## Refereed wasm4pm counterparts (formulas + file:line)

Refs as of main@e7dc95ced, 2026-10-10. Paths relative to repo root.

| Metric | wasm4pm counterpart | Formula site |
|---|---|---|
| token replay per-trace fitness | `wasm4pm/src/conformance.rs:627 token_replay_pure`, `:646 check_token_based_replay` | `trace_fitness = 0.5*(1 - missing/consumed) + 0.5*(1 - remaining/produced)` at conformance.rs:591-593 (vec engine) and :422-423 (bitmask engine) |
| token replay aggregate | `avg_fitness` (mean of per-trace) at conformance.rs:626 area; Σ token totals in `TokenReplayResult` | pm4py `log_fitness` is Σ-based; compare pm4py `average_trace_fitness` to wasm4pm `avg_fitness` (both mean-of-per-trace) |
| ETConformance precision | `wasm4pm/src/etconformance_precision.rs:193 compute_precision` | Formula at etconformance_precision.rs:14: `precision = 1 - Σ_s w(s)*|escaping(s)| / Σ_s w(s)*|enabled(s)|`; empty-log guard precision=1.0 at :280-283 |
| alignment fitness | `wasm4pm/src/alignment_fitness.rs:29 compute_alignment_fitness` | `fitness = 1 - total_cost/worst_case_cost` at alignment_fitness.rs:139-143; worst case = total_log_events * log_move_cost at :134 |

## Comparability notes for lane 9

- pm4py `average_trace_fitness` (token replay) ↔ wasm4pm `avg_fitness`:
  both are the mean of per-trace fitnesses — directly comparable.
- pm4py `log_fitness` (token replay, Σ-based) has no identical wasm4pm
  aggregate; do not compare it to `avg_fitness`.
- pm4py alignment `log_fitness` and wasm4pm alignment fitness both use
  `1 - cost/worst_case`; confirm per-trace vs Σ aggregation matches before
  asserting equality (pm4py is Σ-based; check wasm4pm's aggregation).
- pm4py `trace_is_fit` = missing == 0 AND remaining == 0; wasm4pm
  `is_conforming` must use the same definition for parity.
- Alignment move counts: oracle emits Σ log moves / model moves across all
  optimal alignments; compare like-for-like totals, not per-trace means.
- Empty-log guards: both sides return 1.0 for empty logs — keep that
  definition fixed on both sides.
