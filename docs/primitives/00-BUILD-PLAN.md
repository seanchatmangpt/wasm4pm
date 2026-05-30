# 00 — wasm4pm Process-Primitive Kernel: Build Plan & Dependency DAG

**Agent:** A-SYNTH (final synthesizer) · **Branch:** `finish-wip-primitives` · **Date:** 2026-05-30
**Scope:** Synthesis of the 11-agent parallel build (A1–A10 + clean/verify). This document is the
*plan-of-record*: the primitive dependency DAG, existing-vs-new module ledger, per-primitive tests &
gates, blocked items, and the proof-layer note. The verdict ledger lives in the companion receipt
`docs/receipts/WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md`.

> **Doctrine reminder (FM-5):** "Build workflow completed" is not proof. A primitive is ALIVE only when
> the *math object exists*, a *lawful case passes*, an *unlawful case refuses for the specific reason*,
> a *reachable surface* (WASM/CLI) exposes it, a *deterministic gate* passes, and the *receipt names the
> proof*. Markdown alone makes nothing ALIVE.

---

## 1. Primitive dependency DAG

The convergence target from the plan, annotated with the modules that realize each node and the
verdict from the receipt ledger. `→` = "is consumed by / feeds"; `↔` = bidirectional conversion.

```
                       ┌─────────────────────────────────────────────────────────────┐
                       │              PROCESS WORLD (foundry)                          │
                       │   crates: foundry.rs — Order-to-Cash, 7 objects / 9 events    │
                       │   single sound+safe+separable WF-net → every lawful projection│
                       └───────────────┬──────────────────────────────┬──────────────┘
                                       │ emits                         │ emits
                                       ▼                               ▼
                           ┌──────────────────────┐        ┌─────────────────────────┐
                           │   OCEL v2 (evidence)  │        │ pos/neg traces · XES/CSV │
                           │ crates/ocel-core      │        │ fixtures/world,negative  │
                           │ L=(E,O,eval,oaval)    │        └───────────┬─────────────┘
                           │ O2O qualifiers,       │                    │
                           │ cardinality, time-    │                    │
                           │ stable type/objects   │                    │
                           └─────────┬─────────────┘                    │
                                     │ feeds                            │
            ┌────────────────────────┼───────────────────────┐         │
            ▼                        ▼                         ▼         ▼
   ┌─────────────────┐   ┌──────────────────────┐   ┌──────────────────────────────┐
   │   POWL-2 model  │◄─►│  WF-net / Petri      │   │  OCPQ runtime                │
   │  powl_api.rs    │   │  soundness.rs        │   │  crates/ocpq                 │
   │  powl_to_wf.rs  │   │  reachability /      │   │  binding boxes, query trees, │
   │  wf_to_powl.rs  │   │  liveness / safe /   │   │  E2O/O2O/TBE, CHILD SET,     │
   │  (Separable;    │   │  free-choice;        │   │  constr → sat/violated       │
   │   Partition_MG) │   │  PNML*               │   └──────────────────────────────┘
   └───────┬─────────┘   └──────────┬───────────┘
           │ projects               │
           ▼                        ▼
   ┌─────────────────┐     (soundness gates the
   │  Process tree   │      separable decomposition)
   │ powl_to_*tree   │
   └─────────────────┘
                    │
                    ▼  all models + OCEL evidence feed:
   ┌────────────────────────────────────────────────────────────────────────────┐
   │  CONFORMANCE / REPLAY:  token replay · alignments · precision ·              │
   │  Declare / OC-Declare · OCPQ   (wasm4pm-algos + ocpq)                        │
   └───────────────────────────────┬────────────────────────────────────────────┘
                                    ▼
   ┌────────────────────────────────────────────────────────────────────────────┐
   │  ROUTE-DRIVEN TDD:  exact-1.0 admission gate else AndonPull (trace.ts)       │
   │  powl_test! macro sugar (PowlTestHarness/ExpectedConformance/Verdict/Andon)  │
   └───────────────────────────────┬────────────────────────────────────────────┘
                                    ▼
   ┌────────────────────────────────────────────────────────────────────────────┐
   │  RECEIPT / REPLAY FIXTURE  (BLAKE3 chain)  →  BENCHMARK GATE  (G1–G5)        │
   │  apps/wasm4pm/src/commands/benchmark.ts `wpm benchmark gate`                 │
   └────────────────────────────────────────────────────────────────────────────┘
```

`*` PNML round-trip (reconciliation delta **C5**) is **not yet test-evidenced** — see §4 Blocked.

The `↔` between POWL-2 and WF-net is realized in both directions: `wf_to_powl.rs` (reverse,
Separable-WF-nets Algorithm 3) and `powl_to_wf.rs` (forward — reconciliation delta **C1**:
`powl_to_wf_net`, `powl_to_process_tree`). Soundness (`soundness.rs`) is the gate on the WF-net node:
the separable decomposition is only lawful when the net is sound/safe/free-choice.

---

## 2. Existing modules reused vs new modules required

### Reused (KEEP — already real & correct, not rebuilt)
| Surface | Location | Role |
|---|---|---|
| Exact-1.0 admission gate | `apps/wasm4pm/src/commands/trace.ts:1025,1038–1065` | `fitness>=1.0` else `AndonPull` exit 6; `mcpp-admission-gate.test.ts` |
| POWL-2 routes (15) | `routes/*.powl.json` | `object_types` created_by/terminated_by/schema/cardinality |
| Rust testing harness | `wasm4pm::testing` | `PowlTestHarness`, `classify_conformance`, 24 `AndonPull` variants |
| BLAKE3 + determinism | hashing + determinism harness | G1/G2 substrate |
| Discovery / conformance | 15 discovery algos, 6 conformance metrics (`wasm4pm-algos`) | replay/alignment/precision |
| OCEL v1 + flatten | `wasm4pm/src/ocel_flatten.rs` (`#[wasm_bindgen]`) | WASM-reachable OCEL surface |
| POWL parser / streaming | `powl_api.rs` etc. | model intake |

### New (BUILT this run)
| Module | Crate / file | Agent | Paper object |
|---|---|---|---|
| OCEL v2 model | `crates/ocel-core` (`OCELRelationship`, `OCELObject`, `ObjectTypeCardinality`, `o2o()`, timelines) | A2 | OCED `L=(E,O,eval,oaval)`, O2O qualifiers, cardinality |
| OCPQ runtime | `crates/ocpq` (`ocpq_eval` `#[wasm_bindgen]`) | A3 | OCPQ binding boxes, query trees, E2O/O2O/TBE, CHILD SET, `constr` |
| WF-net soundness | `wasm4pm/src/soundness.rs` (2 wasm exports) | A5 | Separable-WF-nets §3: reachability/liveness/safe/free-choice |
| WF→POWL | `wasm4pm/src/wf_to_powl.rs` (1 wasm export) | A4 | Separable-WF-nets §4 Algorithm 3 ConvertNetToPOWL |
| POWL→WF / POWL→tree (C1) | `wasm4pm/src/powl_to_wf.rs` | reconc/A4 | forward conversions for the `↔` + tree projection |
| Process-world foundry | `wasm4pm/src/foundry.rs` | A7 | Order-to-Cash sound/safe/separable source-of-truth |
| Negative corpus | `fixtures/negative/n01–n09…` + `wasm4pm/tests/negative_corpus.rs` | A8 | invalid traces/models + expected refusal |
| Route-TDD sugar + gate | `powl_test!` macro; `wpm benchmark gate` G1–G5 in `benchmark.ts` | A9 | exact-1.0/AndonPull harness + machine-readable gates |
| ML/AI review doc | `docs/primitives/09b-ML-AI-PRIMITIVES.md` | A10 | FM-1/TS-1/CB-1 audit (already-fixed); LTN as future |

### NOT built (gaps — see §4)
- PMAx consumer-contract layer: `describe_log`, `filter_*`, `summarize_*`, structured conformance
  struct (GAP-PMAX-001..005). Searched both Rust and TS surfaces — **absent**.
- C5 PNML round-trip; C6 cyclic choice-graph round-trip — not test-evidenced.
- A2/A3 dedicated `wpm ocel`/`wpm ocpq`(new-runtime) CLI verbs — deferred by those agents.
- `00-WIP-ADJUDICATION.md` + `WASM4PM_WIP_CLEANUP_RECEIPT.md` (cleanup receipt deltas) — absent
  (owned by the clean/reconciliation agent, not A-SYNTH).

---

## 3. Tests & gates per primitive

Independently re-run by A-SYNTH on `finish-wip-primitives` (not trusted from ledger markdown):

| Primitive | Test file / command | Result (re-run) |
|---|---|---|
| OCEL v2 | `cargo test -p ocel-core --test ocel_v2` | **19/19 pass** |
| OCPQ | `cargo test -p ocpq --test ocpq_paper` | **16/16 pass** |
| WF-net soundness | `cargo test -p wasm4pm --test wf_soundness` | **17/17 pass** |
| WF↔POWL | `cargo test -p wasm4pm --test wf_to_powl` | **14/14 pass** |
| Process-world foundry | `cargo test -p wasm4pm --test foundry` | **13/13 pass** |
| Negative corpus | `cargo test -p wasm4pm --test negative_corpus` | **15/15 pass** |
| Route-TDD macro | `cargo test -p wasm4pm --test powl_macro_a9_tests` | **4/4 pass** |
| Workspace | `cargo check --workspace` | **OK** (0 err, 1 benign warning) |

**Benchmark gates (G1–G5)** — `wpm benchmark gate` in `apps/wasm4pm/src/commands/benchmark.ts`:
- G1 DETERMINISM — same input ⇒ same BLAKE3 (discover_dfg twice).
- G2 RECEIPT-VERIFY — BLAKE3 receipt chain recomputes to stored hash (`--verify-receipt-hash`).
- G3 CONFORMANCE — token-replay fitness == 1.0 admits; below ⇒ AndonPull (RouteConformanceGap).
- G4 — implemented as **METRIC-INTERDEPENDENCY** (I-1..I-5 invariants). Reconciliation delta **C3**
  asks G4 to be re-scoped to **EQUIVALENCE** (POWL↔WF-net / POWL→tree / OCEL flatten round-trip);
  not yet applied. Recorded as a gate-naming gap.
- G5 — final aggregate verdict; non-zero exit on any gate failure.

---

## 4. Blocked / incomplete items (with the exact reason)

1. **PMAx consumer-contract layer (GAP-PMAX-001..005) — NOT BUILT.**
   `describe_log`, `filter_time_range/attribute/activity/variant/object_type/ocel_relation`,
   `summarize_dfg/variants/cases/bottlenecks/model/ocel_objects`, and the *structured* conformance
   report struct (`fitness, precision, F1, alignment_cost, deviations[], …, verdict, receipt_hash`)
   were not found in Rust or TS. **Structural reason:** these are the consumer-reachable report
   surfaces; without them an agentic consumer (PMAx/ggen) cannot call the primitives cleanly →
   GAP-PMAX-005 makes that *consumer-contract* layer FAKE-LIVE even though the underlying kernel
   primitives are ALIVE. This does not retract the ALIVE status of OCEL v2 / OCPQ / soundness /
   WF↔POWL themselves (they are Rust+WASM reachable); it blocks the *report/consumability* primitive.

2. **C5 PNML import/export round-trip — NOT TEST-EVIDENCED.** No `pnml`/`PNML` round-trip test on the
   sound/unsafe fixtures. **Reason:** reconciliation delta not yet applied to the finished tree.

3. **C6 cyclic choice-graph round-trip — NOT TEST-EVIDENCED.** Choice graphs are present but a *cyclic*
   choice-graph fixture + round-trip test is absent. **Reason:** reconciliation delta not yet applied.

4. **C3 G4 re-scope to EQUIVALENCE — NOT APPLIED.** Current G4 is metric-interdependency. **Reason:**
   benchmark gate shipped before the audit re-scope; equivalence may instead live as an extra check.

5. **A2/A3 dedicated CLI verbs — DEFERRED.** OCEL v2 and the new OCPQ runtime crate are Rust+WASM
   reachable (`ocpq_eval` `#[wasm_bindgen]`; OCEL via `ocel_flatten` exports + `trace ocel`), but no
   *new* `wpm ocel`/`wpm ocpq-runtime` verb was added. **Reason:** both agents deferred the CLI leg to
   A9/reconciliation; A9 wired the gate but not these verbs.

6. **WIP-cleanup receipt docs — ABSENT** (`00-WIP-ADJUDICATION.md`,
   `WASM4PM_WIP_CLEANUP_RECEIPT.md`). The clean agent deleted the untracked debris (`.agents/`,
   `launch_agents.py`, `generate_fixtures.py`, `*.bak`, `test-proof-packs-*` — confirmed gone) but
   wrote no receipt. **Reason:** owned by the clean/reconciliation agent, outside A-SYNTH's file scope.

---

## 5. Acceptance sequence (how a consumer proves the kernel)

1. `cargo check --workspace` → compiles.
2. Run the 7 primitive test files above → all green (98 tests total across them).
3. Manufacture a lawful Order-to-Cash field from the foundry → OCEL v2 + POWL-2 + WF-net + tree +
   XES/CSV + positive traces.
4. Replay a positive trace against its route → fitness **exact 1.0**, admitted.
5. Replay each `fixtures/negative/n01..n09` → refused with its specific `AndonPull` reason.
6. `wpm benchmark gate` → G1 (BLAKE3 determinism), G2 (receipt verify), G3 (exact-1.0 conformance)
   pass; non-zero exit on any failure.

---

## 6. Proof-layer note (the kernel's differentiator)

The wasm4pm primitive kernel is **not** a pm4py-codegen consumer. Its differentiator is the **proof
layer**: every manufacturing step emits a **BLAKE3 receipt**, passes a **determinism gate** (G1: same
input ⇒ same hash), and admits a route only at **exact-1.0 conformance** (below ⇒ typed `AndonPull`,
no soft admission). This turns "the agent ran code" into "a *lawful process was proven*". Downstream
consumers — ggen, PMAx-style agentic analysts — **CALL** the reachable deterministic surface (Rust
kernel → WASM exports → `wpm` CLI → typed reports → receipts) and *inherit* the proof. They are not
the center of the kernel and add **no management/dashboard/MCP surface** here. Per the binding
constraint set: no new MCP tools, no agent dashboard, no PMAx clone, no raw-log-to-LLM, no
script-synthesis dependency — exposure is only through Rust, WASM, `wpm`, typed reports, and receipts.

---

## 7. Verdict pointer

The per-primitive ALIVE/PARTIAL/BLOCKED/FAKE-LIVE ledger and the floor-rule kernel verdict
(`WASM4PM-KERNEL-001`) are in `docs/receipts/WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md`.
