# WASM4PM Primitive Kernel — Synthesis Receipt

**Receipt ID:** `WASM4PM-KERNEL-001`
**Synthesizer:** Agent A-SYNTH · **Branch:** `finish-wip-primitives` · **Date:** 2026-05-30
**Companion plan:** `docs/primitives/00-BUILD-PLAN.md`

This receipt is the **per-primitive ledger** demanded by the completion contract. Every verdict below
was reached by A-SYNTH **independently re-running the tests** on the finished tree (not by trusting the
build agents' markdown — FM-5 doctrine). Each block names the *exact* proof: test command, fixture, and
file. The kernel verdict is the **floor** of the per-primitive verdicts.

---

## Anti-cheat ALIVE rule (applied to every block)

A primitive is ALIVE only if **all six** hold: (1) paper object exists; (2) lawful case passes;
(3) unlawful case refuses for the *specific* reason; (4) reachable surface (WASM/CLI) exposes it;
(5) deterministic gate passes; (6) this receipt names the proof.

---

## Pre-flight (gate)

| Check | Command | Result |
|---|---|---|
| Workspace compiles | `cargo check --workspace` | **OK** — 0 errors, 1 benign warning (`law_model` unused in cli/oracle.rs) |
| Debris removed | `ls .agents launch_agents.py generate_fixtures.py *.bak test-proof-packs-*` | **gone** (CLEAN-AND-BRANCH) |

Note: the M1–M5 "ALL DONE" handoff claim was **not** trusted; VERIFY-CLAIMED-DONE flagged it
unsupported and progress.md's "phases incomplete" as accurate. This receipt re-verifies from tests.

---

## Per-primitive ledger

### 1. OCEL v2
```
Primitive:        OCEL v2 (object-centric evidence)
Paper grounding:  OCED meta-model L=(E,O,eval,oaval); O2O qualifiers; cardinality; time-stable type/objects
Artifact:         crates/ocel-core/src/{lib.rs,intake.rs,validate.rs,flatten.rs}
                  (OCELRelationship, OCELObject, ObjectTypeCardinality, o2o(), object_attr_timeline)
                  WASM-reachable OCEL surface: wasm4pm/src/ocel_flatten.rs (#[wasm_bindgen] ×3)
Positive proof:   cargo test -p ocel-core --test ocel_v2  →  19/19 PASS
Negative proof:   fixtures/negative/n05-o2o-dangling.ocel.json (dangling O2O reference),
                  n06-flattening-loss.ocel.json (flatten information loss) — exercised by negative_corpus (15/15)
Reachability:     Rust ✓ | WASM ✓ (ocel_flatten) | CLI ✓ (trace ocel) — new `wpm ocel` v2 verb DEFERRED (A2)
Verdict:          ALIVE
```

### 2. OCPQ runtime
```
Primitive:        OCPQ (object-centric process querying)
Paper grounding:  OCPQ — binding boxes, query trees, BASIC E2O/O2O/TBE, CHILD SET(u,nmin,nmax), constr→sat/violated
Artifact:         crates/ocpq/src/lib.rs (ocpq_eval, #[wasm_bindgen] at L633)
Positive proof:   cargo test -p ocpq --test ocpq_paper  →  16/16 PASS
                  (includes the Fig.6 faithful encoding per reconciliation delta C4 per A3 ledger)
Negative proof:   ocpq_paper violating-constraint cases (constr → violated) within the 16-test suite
Reachability:     Rust ✓ | WASM ✓ (ocpq_eval) | CLI — new-runtime verb DEFERRED (A3); pre-existing
                  process-law `ocpq query` verb is a DISTINCT surface
Verdict:          ALIVE  (NOTE: C4 Fig.6 fidelity asserted by A3; A-SYNTH confirms 16/16 green but did
                  not line-audit the Fig.6 box encoding — recorded as a fidelity caveat, not a block)
```

### 3. WF-net / Petri + formal soundness
```
Primitive:        WF-net soundness (reachability / liveness / safe / free-choice)
Paper grounding:  Separable-WF-nets (arXiv:2602.15739v3) §3
Artifact:         wasm4pm/src/soundness.rs (#[wasm_bindgen] ×2; wired via `pub mod soundness;` in lib.rs)
Positive proof:   cargo test -p wasm4pm --test wf_soundness  →  17/17 PASS (sound/safe/free-choice nets)
Negative proof:   fixtures/negative/n07-dead-transition.wf-net.json, n08-unsafe-net.wf-net.json —
                  rejected as unsound/unsafe (exercised by wf_soundness + negative_corpus)
Reachability:     Rust ✓ | WASM ✓ (2 exports) | CLI — via kernel/wasm path
Verdict:          ALIVE
```

### 4. WF-net ↔ POWL-2 (incl. forward conversions)
```
Primitive:        WF→POWL (reverse) + POWL→WF-net / POWL→tree (forward, C1)
Paper grounding:  Separable-WF-nets §4 Algorithm 3 ConvertNetToPOWL; Partition_MG; MG/SM duality
Artifact:         wasm4pm/src/wf_to_powl.rs (#[wasm_bindgen]; `pub mod wf_to_powl;` in lib.rs)
                  wasm4pm/src/powl_to_wf.rs (powl_to_wf_net L337, powl_to_process_tree L378)
                  wasm4pm/src/powl_api.rs (powl_to_process_tree L250)
Positive proof:   cargo test -p wasm4pm --test wf_to_powl  →  14/14 PASS (incl. round-trip / language tests)
Negative proof:   fixtures/negative/n09-nonconforming-powl-route.trace.json — route refusal path
Reachability:     Rust ✓ | WASM ✓ (1 export) | CLI — via kernel path
Verdict:          ALIVE
                  CAVEAT: C6 (cyclic choice-graph round-trip) not test-evidenced; C5 PNML round-trip
                  not test-evidenced → both PARTIAL deltas on this primitive (see Blocked §).
```

### 5. Process-World Foundry
```
Primitive:        Order-to-Cash process world (single sound/safe/separable source of truth)
Paper grounding:  Separable-WF-nets composition over 7 object types / 9 event types
Artifact:         wasm4pm/src/foundry.rs; fixtures/world/, fixtures/models/
Positive proof:   cargo test -p wasm4pm --test foundry  →  13/13 PASS
                  (manufactures OCEL v2 + POWL + WF-net + tree + XES/CSV + positive traces from one net)
Negative proof:   foundry emits negative traces consumed by negative_corpus (C2 negative-trace emission);
                  receipt fixtures for G2/--verify-receipt-hash (C2 — A7 ledger asserts both delivered)
Reachability:     Rust ✓ | WASM/CLI — fixtures consumed by trace/benchmark surfaces
Verdict:          ALIVE
```

### 6. Negative corpus
```
Primitive:        Sabotage corpus (invalid traces + invalid models, each with expected refusal)
Paper grounding:  N/A (adversarial completeness over the 11 required categories)
Artifact:         fixtures/negative/n01–n09.*.json (+ manifest per A8); wasm4pm/tests/negative_corpus.rs
Positive proof:   cargo test -p wasm4pm --test negative_corpus  →  15/15 PASS (each invalid case REFUSED)
Negative proof:   IS the negative proof — n01 missing-required-event, n02 out-of-order, n03 dup-terminal,
                  n04 receipt-before-gate, n05 o2o-dangling, n06 flatten-loss, n07 dead-transition,
                  n08 unsafe-net, n09 nonconforming-powl — each maps to its specific AndonPull
Reachability:     fixtures + Rust test harness; replay-reachable via trace conform
Verdict:          ALIVE
```

### 7. Route-driven TDD + benchmark gates
```
Primitive:        Route-TDD (exact-1.0/AndonPull) + powl_test! macro sugar + wpm benchmark gate (G1–G5)
Paper grounding:  MCPP admission doctrine (explore ≥0.8 / admit 1.0); not a model-quality grade
Artifact:         powl_test! macro; apps/wasm4pm/src/commands/benchmark.ts (`gate` subcommand, G1–G5);
                  exact-1.0 gate at apps/wasm4pm/src/commands/trace.ts:1025,1038–1065 (KEEP, not rebuilt)
Positive proof:   cargo test -p wasm4pm --test powl_macro_a9_tests  →  4/4 PASS;
                  admission gate covered by mcpp-admission-gate.test.ts (20+ cases, KEEP)
Negative proof:   below-1.0 fitness ⇒ AndonPull(RouteConformanceGap) exit 6 (G3); negative_corpus n04
Reachability:     Rust ✓ (macro) | CLI ✓ (`wpm benchmark gate`, `wpm trace conform`)
Verdict:          ALIVE
                  CAVEAT: G4 ships as METRIC-INTERDEPENDENCY; reconciliation C3 asks EQUIVALENCE.
                  Gate-naming drift recorded as PARTIAL on G4 only (G1/G2/G3/G5 ALIVE).
```

### 8. ML/AI reachability (A10 review)
```
Primitive:        ML/AI algorithm correctness (RL FM-1, prediction TS-1, circuit CB-1; SPC/circuit export)
Paper grounding:  Bellman equation; Western Electric rules; circuit-breaker FSM
Artifact:         wasm4pm/src/rl_orchestrator.rs, spc.rs, self_healing.rs; docs/primitives/09b-ML-AI-PRIMITIVES.md
Positive proof:   A10 ledger: FM-1/TS-1/CB-1 confirmed ALREADY FIXED by source read (not handoff trust)
Negative proof:   existing adversarial RL/SPC/circuit oracle tests (Rank-1/2 oracles, pre-existing)
Reachability:     Rust ✓ | SPC/circuit WASM export — A10 task per reconciliation delta #5; LTN = future
Verdict:          PARTIAL  (bugs already-fixed & documented; LTN intentionally NOT built — future
                  primitive; SPC/circuit WASM-export status is documentation-level in 09b, not re-proven
                  here by A-SYNTH)
```

### 9. PMAx consumer-contract layer (reachable report surface)
```
Primitive:        describe_log / filter_* / summarize_* / structured-conformance report
Paper grounding:  Consumer-contract gaps GAP-PMAX-001..005 (downstream agentic-analyst reachability)
Artifact:         NONE FOUND — grep of Rust + TS surfaces returned no describe_log, filter_attribute,
                  filter_object_type, summarize_variants/cases/bottlenecks, or structured report struct
Positive proof:   (none)
Negative proof:   (none)
Reachability:     NOT reachable through wpm/WASM
Verdict:          BLOCKED — STRUCTURAL REASON: the consumer-reachable report/abstraction surface
                  (Event-Log Abstraction `describe_log`, typed filters, uniform summaries, and the
                  deterministic conformance STRUCT distinct from the scalar admission gate) was not
                  implemented. Per GAP-PMAX-005 this layer is therefore FAKE-LIVE/BLOCKED: an agentic
                  consumer cannot call these primitives cleanly. This does NOT retract the ALIVE status
                  of the underlying OCEL v2 / OCPQ / soundness / WF↔POWL primitives (they ARE Rust+WASM
                  reachable); it blocks the report/consumability primitive specifically.
```

---

## Floor-rule kernel verdict

The kernel verdict is the **floor** of the per-primitive verdicts. Tally:

| Verdict | Primitives |
|---|---|
| **ALIVE** | OCEL v2, OCPQ, WF-net soundness, WF↔POWL (core), Process-World Foundry, Negative corpus, Route-TDD+gates (core) |
| **PARTIAL** | ML/AI reachability (LTN future, SPC/circuit export doc-level); G4 gate-naming (C3); WF↔POWL deltas C5 PNML / C6 cyclic |
| **BLOCKED** | PMAx consumer-contract layer (GAP-PMAX-001..005 — report/filter/summarize/structured-conformance surface absent) |
| **MISSING DOC** | `00-WIP-ADJUDICATION.md`, `WASM4PM_WIP_CLEANUP_RECEIPT.md` (cleanup receipt deltas; outside A-SYNTH scope) |

**Seven core primitives are genuinely ALIVE** — proven by 98 independently re-run passing Rust tests
(19+16+17+14+13+15+4) plus a clean `cargo check --workspace`. That is a real, paper-grounded kernel.

**But the completion contract is not fully satisfied:** the PMAx consumer-contract layer is BLOCKED
(absent), several reconciliation deltas (C3 G4-equivalence, C5 PNML, C6 cyclic choice-graph) are not
applied, A2/A3 CLI verbs are deferred, and the cleanup receipt docs are absent. Under the floor rule,
any primitive that is missing / non-reachable through the public surface pulls the kernel below ALIVE.

### Verdict

```
WASM4PM-PRIMITIVE-KERNEL — PARTIAL
```

**Why PARTIAL (not ALIVE):** the seven core primitives pass real tests and are Rust+WASM reachable, so
the kernel is *not* FAKE-LIVE (it is not docs-only / flattened / syntax-only / empirical-only /
refusal-skipped / debris-remaining — debris is gone, negatives refuse correctly, soundness is formal,
OCEL is not flattened-only). But it is *not* ALIVE because the consumer-contract report layer is BLOCKED
(GAP-PMAX-001..005 absent → not consumer-reachable) and reconciliation deltas C3/C5/C6 remain unapplied.

**Why not BLOCKED:** the core math objects exist, lawful cases pass at exact 1.0, unlawful cases refuse
for their specific AndonPull reasons, and the benchmark gates G1/G2/G3 execute. The blockage is confined
to the consumer-report layer and named deltas, not the kernel foundation.

**Path to ALIVE (remaining work, ranked):**
1. Build the PMAx layer: `describe_log`, typed `filter_*`, `summarize_*`, and the structured conformance
   struct — Rust + `#[wasm_bindgen]` + `wpm` verbs (lifts §9 BLOCKED → ALIVE).
2. Apply C3 (re-scope G4 to EQUIVALENCE), C5 (PNML round-trip test), C6 (cyclic choice-graph round-trip).
3. Wire A2/A3 dedicated `wpm` CLI verbs for OCEL v2 + OCPQ runtime.
4. Write `00-WIP-ADJUDICATION.md` + `WASM4PM_WIP_CLEANUP_RECEIPT.md` (clean/reconciliation agent).

---

*Proofs cited above are reproducible: run each `cargo test -p … --test …` command on branch
`finish-wip-primitives`. A-SYNTH re-ran all seven and `cargo check --workspace` on 2026-05-30; the
counts in this receipt are observed output, not relayed claims.*
