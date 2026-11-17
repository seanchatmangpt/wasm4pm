<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: scripts/pm4py-parity/wasm-parity-notes.md; source-sha256: 546fbef35b417959167653468f90563e5875494940704d906f7ddebbdbb6456b; reason: path-local documentation retained pending domain-specific supersession -->

# wasm4pm vs pm4py Parity Notes — sepsis.xes (verification lane)

Date: 2026-10-10. Repo: `/Users/sac/wasm4pm` (main, uncommitted working tree).
Oracle reference: `scripts/pm4py-parity/sepsis-inductive.json` (pm4py 2.7.22.1).

## Comparison route used

Like-for-like on the SAME model: pm4py's inductively discovered net was exported to
PNML (pm4py `write_pnml`; 39 places, 50 transitions, 34 invisible transitions marked
`toolspecific activity="$invisible$"`, initial marking on place `source`, final
marking on `sink`) and fed to wasm4pm's PNML importer (`wasm4pm/src/pnml_io.rs`,
which does parse `$invisible$` and both marking styles) via the CLI:

```bash
# model export (pm4py 2.7.22.1, same inductive discovery as the oracle run)
python3 - <<'PY'   # cwd /Users/sac/wasm4pm
import pm4py
log = pm4py.read_xes("bench_data/sepsis.xes", return_legacy_log_object=True)
net, im, fm = pm4py.discover_petri_net_inductive(log, activity_key="concept:name")
pm4py.write_pnml(net, im, fm, "/tmp/sepsis-inductive.pnml")
PY

# wasm4pm side (binary built with CARGO_TARGET_DIR=/Users/sac/wasm4pm/_t-parity)
_t-parity/debug/wpm mining conformance bench_data/sepsis.xes /tmp/sepsis-inductive.pnml
```

Both commands exit 0. PNML file kept at `/tmp/sepsis-inductive.pnml` (not committed;
only this notes file was written into `scripts/pm4py-parity/`).

## Numbers — same log, same PNML model

| Metric (token-based) | pm4py 2.7.22.1 | wasm4pm CLI | delta |
|---|---|---|---|
| average trace fitness | 1.0 | 0.0045 | -0.9955 |
| log fitness (Σ-based) | 1.0 | n/a (CLI reports average) | — |
| % fitting traces | 100.0 | 0 / 1050 conforming | — |
| ETConformance precision | 0.25762075419340746 | 0.1538 | -0.1038 |
| generalization (wasm4pm dim.) | — | 0.9132 | — |

wasm4pm per-trace diagnostics (`-v`) show missing+remaining tokens on essentially
every trace of a model that replays perfectly in pm4py — e.g. case 0: 16 missing /
9 remaining.

## Additional wasm4pm-only observations (gaps, no Rust modified)

1. **Token replay breaks on a trivial net.** A hand-written 2-transition net
   (`source → A → B → sink`, 1 initial token, correct final marking) against a
   2-trace XES of exactly `A,B`: pm4py TBR = fitness 1.0, precision 1.0; wasm4pm CLI
   = average fitness 0.25, "conforming cases 0 / 2", with `-v` reporting
   `event #0 activity=A type=missing_tokens` — i.e. the replay reports a missing
   token on the very first event despite the initial marking containing it.
   pm4py cross-check of the identical PNML returned fitness 1.0 / precision 1.0.
2. **Self round-trip is not self-consistent.** `wpm mining discover --algo
   ilp-petri-net` on the same 2-trace log, then conformance against its own emitted
   PNML: average fitness 0.75, conforming 2 / 2 (expected 1.0 average for perfectly
   fitting traces). On sepsis, ILP self-fitness is 0.18 with 0 / 1050 conforming.
3. **`--algo inductive` degenerates on real data.** `wpm mining discover
   bench_data/sepsis.xes --algo inductive` returns a process tree with a single
   `Operator { operator: Silent, children: [] }` root and no children — an empty
   model — so wasm4pm's own inductive miner cannot currently serve as the wasm-side
   model source for sepsis. (`discover -o` is also only honored by `heuristic` and
   `ilp-petri-net`, so the inductive tree cannot be exported at all.)

## Verdict

**Divergence-needs-investigation.** Because the identical PNML (which pm4py replays
at fitness 1.0) yields fitness 0.0045 in wasm4pm, this is NOT model-difference; it
is an implementation divergence on the wasm4pm side. Minimal reproducer: the
2-transition `A→B` net + 2-trace `A,B` XES above, where wasm4pm reports
`missing_tokens` on the first event with a token visibly present in the initial
marking parsed by `pnml_io.rs`. Prime suspects: (a) initial/final marking not
actually threaded from `PetriNet.initial_marking` into `token_replay_pure`'s
replay loop (the CLI comment at `crates/wasm4pm-cli/src/commands/mining.rs:275-281`
notably passes an *empty placeholder* final marking to `compute_precision`), and
(b) silent-transition (`$invisible$`) firing during replay. The ETC precision gap
(0.1538 vs 0.2576) is downstream of the same replay defect. A
parity/implementation-fix lane should start from the trivial reproducer, not from
sepsis.

---

## Resolution (2026-10-10, parity-fix lane)

**Status: fitness parity ACHIEVED on the same log + PNML.**

Root causes fixed (all in wasm4pm):
1. `pnml_io::from_pnml` parsed place-internal `<initialMarking>` into
   `PetriNetPlace.marking` but never merged it into `PetriNet.initial_marking`
   — CLI replay started from an EMPTY marking. Fixed in `wasm4pm/src/pnml_io.rs`.
2. Blanket greedy invisible-transition fixpoint fired taus that were not
   needed, consuming tokens a visible transition needed (dominant cause of the
   sepsis 0.0045). Replaced in `wasm4pm/src/conformance.rs` with a pm4py-style
   minimal enabling BFS (`enable_via_invisible_bitmask` / `_vec`) before each
   event, plus an end-of-trace invisible drain toward the final marking.
3. Remaining tokens counted final-marking tokens as deviations; pm4py counts
   only tokens in places OUTSIDE the final marking. Fixed in both replay
   engines (bitmask + Vec).

Final numbers, same log + same PNML (`/tmp/sepsis-inductive.pnml`):
| Metric | pm4py 2.7.22.1 | wasm4pm (fixed) |
|---|---|---|
| TBR average fitness | 1.0 | **1.0000** |
| % fitting traces | 100.0 | 100.0 (1050/1050) |
| ETConformance precision | 0.2576 | 0.2274 |

**Remaining precision delta (-0.0302)**: wasm4pm's ETConformance precision
implementation is a prefix-state approximation (states keyed by activity-
sequence prefix, not full marking-based prefix alignment). Downstream of the
replay fix; documented, not closed by this lane.

Trivial reproducer now scores 1.0 / 2-of-2 conforming (was 0.25, 0/2).
ILP self round-trip (`discover ilp-petri-net -o` → conformance on own PNML):
1.0 / 2-of-2 (was 0.75, 2/2).

Ground-truth pins: 12 of 18 pins in `ground_truth_conformance_tests.rs` encoded
the pre-parity "final-marking tokens count as remaining" convention and were
re-pinned with re-derived pm4py-convention values (perfect traces now 1.0;
reversed trace 0.25; duplicate-label misroute 0.25; parallel missing-branch
0.7083; unknown-activity 0.75; multi-trace avg 0.75). All 18 original test
names' semantics preserved where still correct. New guards: bitmask reproducer
through the public import path (`pnml_io` test), Vec-engine reproducer (19th
ground-truth test), and a non-vacuous flower-fallback guard (`more_discovery`).

Inductive miner note: the flower fall-through previously emitted a single
empty silent node (vacuous). It now emits loop(xor(all activities), tau) and
the CLI prints an APPROXIMATE-MODEL warning when the fall-through fires. Why
no cut applies on sepsis remains an open quality gap (cut detectors are
strict); the model is no longer silently vacuous.

Unrelated pre-existing CLI test failures (other lanes, not this lane's files):
`ocdfg_bridge::discovers_per_object_type_dfgs`, `ocel_envelope::parses_truex_...`.
