# 04 — Conformance Primitives

**Agent A6.** Conformance is a *primitive* of the wasm4pm kernel, not an application
feature. This document is a **wiring + reachability audit**: it inventories every
conformance metric, states the formula it computes, names the Rust file, the
`#[wasm_bindgen]` export, the test file whose oracle is the paper/math (not
self-reference), and — critically — classifies the output as either a **diagnostic
scalar** (exploratory, ≥0.8 useful) or part of the **exact-1.0 route-admission verdict**.

> **Audit posture (FM-5):** Each "Verified" claim below was checked by reading the
> source and running the relevant test. The admission-gate behavior was **not changed** —
> it correctly enforces exact `fitness >= 1.0`, else `AndonPull`, exit 6.

---

## The two-tier conformance doctrine (binding)

`mcpp-conformance.md` and the plan's "What is real & correct" both make this distinction
explicit. **There are two different things called "conformance" in this kernel, and they
must never be conflated.**

| Tier | Question it answers | Threshold | Below threshold | Surface |
|------|---------------------|-----------|-----------------|---------|
| **Tier 1 — Diagnostic conformance** | "How well does this *model* explain this *log*?" (statistical model quality) | `≥0.8` is a useful exploratory signal; `<0.85` flags model rework | Returns a raw scalar; no refusal | `wpm conformance`, `wpm quality`, WASM metric exports |
| **Tier 2 — Route admission** | "Was a *lawful declared route* proven on this OCEL run?" (legality, fit-gauge) | **`== 1.0` required** | `AndonPull(RouteConformanceGap)`, exit 6 | `wpm trace conform` (`apps/wasm4pm/src/commands/trace.ts`) |

> **0.8 conformance = 20% of the declared route was not proven = unknown motion = stop the line.**
> A diagnostic `0.999` is still an Andon pull for *admission*, because the missing `0.001`
> is exactly where the defect hides. `0.8` *suggests the route is discoverable*; `1.0` is
> required for the route to be *admitted*.

The two tiers compute **different `fitness`**:

- **Tier 1 fitness** = token-replay / alignment fitness over a Petri net (a *statistical*
  score in `[0,1]`, computed in Rust/WASM — see §1–§2 below).
- **Tier 2 fitness** = *structural route fitness* = `|observed activities ∈ model| / |observed activities|`,
  computed in **TypeScript** inside `trace.ts:854` against the POWL-2 route model. The
  admission verdict at `trace.ts:1025` (`fitnessOk = fitness >= 1.0`) and `trace.ts:1043`
  (`else if (!fitnessOk) andonReason = 'RouteConformanceGap'`) operates on *this* fitness.

This is intentional and correct: a route is admitted only if **every observed activity is
admissible in the declared model** (no extra/unexplained motion), not merely if a Petri net
replays statistically well. Do not re-point the admission gate at the Tier-1 WASM metrics.

---

## Primitive ledger

For each primitive: what it computes · formula · file · WASM export · test file · tier.

### §1 — Token-based replay fitness  *(Tier 1, diagnostic)*

- **Computes:** Per-trace and average fitness by token-game replay of each trace on a
  Petri net (consume/produce tokens; count `missing`, `consumed`, `produced`, `remaining`).
- **Formula (module docstring, classic van der Aalst 2016):**
  `fitness = 1 - (missing + consumed) / (produced + remaining)`.
  **Formula actually computed (per-trace, balanced variant — verified in source & tests):**
  `trace_fitness = 0.5·(1 − missing/consumed) + 0.5·(1 − remaining/produced)`
  (`conformance.rs:344–354`). A perfect, completing trace ⇒ `1.0`; missing/remaining
  tokens drag it toward `0`. *(The two formulas agree on the `1.0` and `0.0` endpoints,
  which is what admission cares about; the interior weighting differs. Documented honestly
  here because the docstring and code diverge.)*
- **File:** `wasm4pm/src/conformance.rs` (pure core: `token_replay_pure`); SIMD variant
  `wasm4pm/src/simd_token_replay.rs` (`replay_log`).
- **WASM export:** `check_token_based_replay` (returns `{ fitness, precision, case_fitness[], avg_fitness, deviations[] }`).
- **Test file:** `wasm4pm/tests/ground_truth_conformance_tests.rs` — **Rank-1 oracle**: 18
  cases with *hand-derived* expected fitness (e.g. `[A,B]` on a sequence net ⇒ `0.75` from
  `0.5·(1−0/2)+0.5·(1−1/2)`; reversed trace ⇒ `0.0`; loop two iters ⇒ `0.875`). No
  self-reference. **Verified: 18/18 pass.**
- **Tier:** Diagnostic scalar. *(NOT the admission gate — that uses Tier-2 structural fitness.)*

### §2 — Alignment fitness  *(Tier 1, diagnostic)*

- **Computes:** Optimal-alignment log fitness via A* search between each trace and a Petri
  net, accumulating synchronous / log-move / model-move costs.
- **Formula:** `fitness = 1 − total_cost / worst_case_cost`, where moves are weighted by
  `sync_cost` (default `0.0`), `log_move_cost` (default `1.0`), `model_move_cost` (default
  `1.0`); worst case is an all-log-move alignment.
  *(Source note `alignment_fitness.rs:198–201` flags a denominator caveat when
  `log_move_cost ≠ model_move_cost` — recorded here as a known sharp edge.)*
- **File:** `wasm4pm/src/alignment_fitness.rs` (`compute_alignment_fitness`); A* engine in
  `wasm4pm/src/alignments.rs`.
- **WASM exports:** `alignment_fitness` (fitness + move stats); `compute_alignments`,
  `compute_optimal_alignments` (raw alignment moves).
- **Test file:** inline `#[cfg(test)]` in `alignment_fitness.rs` (5 tests) and
  `alignments.rs` (5 tests). Oracle = cost-arithmetic on small constructed nets.
- **Tier:** Diagnostic scalar.

### §3 — ET-Conformance precision  *(Tier 1, diagnostic)*

- **Computes:** Escaping-edges precision: transitions enabled in the model at a replay step
  but never actually fired ("escaping edges") indicate an under-fitting / over-permissive
  model.
- **Formula:** `precision = 1 − Σ escaping / (Σ escaping + Σ consumed)`, clamped to `[0,1]`;
  empty log ⇒ `precision = 1.0` (`etconformance_precision.rs:9–16`).
- **File:** `wasm4pm/src/etconformance_precision.rs`; alignment-based variant
  `wasm4pm/src/align_etconformance.rs`.
- **WASM exports:** `wasm_compute_precision` (token/escaping-edge precision);
  `align_etconformance_precision` (alignment-based precision).
- **Test file:** inline `#[cfg(test)]` in `etconformance_precision.rs` (10 tests). Oracle =
  hand-counted escaping edges on small nets.
- **Tier:** Diagnostic scalar.

### §4 — Generalization  *(Tier 1, diagnostic)*

- **Computes:** How well the model generalizes to unseen behavior (penalizes rarely/never
  firing visible transitions, the classic over-fitting symptom).
- **Formula:** `generalization = 1 − (Σ_t 1/√(fire_count_t)) / num_visible_transitions`
  (silent transitions excluded); a transition firing `n` times contributes penalty `1/√n`
  (`generalization.rs:240–242, 309–317`).
- **Reference:** Buijs, van der Aalst et al. (2012), "A Genetic Perspective on Process
  Discovery", IJBPIM 1(2):63–76 (cited in the module header).
- **File:** `wasm4pm/src/generalization.rs`.
- **WASM export:** `generalization`.
- **Test file:** inline `#[cfg(test)]` in `generalization.rs` (8 tests). Oracle = closed-form
  `1/√n` arithmetic.
- **Tier:** Diagnostic scalar.

### §5 — Declare conformance  *(Tier 1, diagnostic)*

- **Computes:** Per-constraint and average fitness of a log against a stored DECLARE model.
  Templates implemented: `Response(A,B)` (every A eventually followed by B), `Existence(A)`,
  `Absence(A)`, plus the constraints exercised by the all-constraints test
  (precedence/succession/co-existence variants).
- **Formula:** per constraint `c`, `fitness_c = 1 − violations_c / total_traces` where
  `violations_c` = number of traces violating `c`; overall `avg_fitness` = mean over
  constraints (`declare_conformance.rs:40–75`).
- **File:** `wasm4pm/src/declare_conformance.rs`.
- **WASM exports:** `check_declare_conformance`; `store_declare_from_json` (load a model
  handle).
- **Test files:** `wasm4pm/tests/declare_all_constraints_test.rs` (27 tests; oracle =
  template semantics on synthetic perfect / single-violation logs — **Verified: 27/27 pass**)
  and `wasm4pm/tests/declare_conformance_integration_test.rs`.
- **Tier:** Diagnostic scalar.

### §6 — Object-centric (OC) / OC-Declare conformance  *(Tier 1, diagnostic)*

- **Computes:** Conformance of an OCEL against an Object-Centric Petri Net. For each object
  type: flatten OCEL → per-type EventLog → discover a reference net → token-replay → fitness.
- **Formula:** per object type, `fitness = fitting_traces / total_traces`; an `overall`
  block aggregates across types (`oc_conformance.rs` header + `oc_conformance_check_inner`).
- **File:** `wasm4pm/src/oc_conformance.rs` (gated `#[cfg(feature = "ocel")]`).
- **WASM exports:** `oc_conformance_check`; `oc_conformance_info`.
- **Test file:** inline `#[cfg(test)]` in `oc_conformance.rs` (4 tests) +
  `wasm4pm/tests/ocel_*`-adjacent coverage. Oracle = per-type fitting-trace counts.
- **Tier:** Diagnostic scalar. *(OC-Declare proper — object-typed Declare templates per the
  OCPQ/OCED papers — is the natural extension point; currently OC conformance is net-based
  per type. Flagged as a future primitive, not claimed ALIVE beyond what tests prove.)*

### §7 — Route admission (exact-1.0 / AndonPull)  *(Tier 2 — the verdict)*

- **Computes:** Whether a captured OCEL run *proves the declared POWL-2 route*. Aggregates
  six dimensions: structural fitness, required-stage coverage, route-sequence / choice-graph
  / partial-order validity, object-evidence presence, object-lifecycle validity (create/
  terminate/cardinality), and receipt coverage/schema.
- **Fitness formula (structural, TypeScript):**
  `fitness = |observed activities that are admissible in the model| / |observed activities|`
  (`trace.ts:854`). Admission requires **`fitness === 1.0`** *and* every other dimension OK.
- **Verdict logic (do not modify):** `trace.ts:1025` `fitnessOk = fitness >= 1.0`;
  `trace.ts:1038` default `verdict = 'AndonPull'`; `trace.ts:1043`
  `else if (!fitnessOk) andonReason = 'RouteConformanceGap'`. Priority chain of AndonPull
  reasons: `ActivityOnlyFakeRoute → RouteConformanceGap → MissingRequiredStages →
  RouteSequenceMismatch → PartialOrderViolation → LifecycleNotTerminated →
  CardinalityViolation → ObjectLifecycleViolation → ReceiptSchemaViolation →
  InsufficientReceiptCoverage → TestRouteIncomplete`.
- **File:** `apps/wasm4pm/src/commands/trace.ts` (command `wpm trace conform`).
- **Test file:** `apps/wasm4pm/src/__tests__/mcpp-admission-gate.test.ts` (20+ cases) plus
  `mcpp-route-conformance.test.ts`, `conformance-negative-tests.test.ts`.
- **Tier:** **Route-admission verdict.** Output is `verdict: 'Accepted' | 'AndonPull'`
  (+ exit 6 on AndonPull), NOT a tunable scalar.

---

## Reachability summary (anti-FAKE-LIVE)

All Tier-1 metric modules are `pub mod` in `wasm4pm/src/lib.rs` (lines 305–534) and expose
`#[wasm_bindgen]` entry points; the Tier-2 verdict is reachable via the `wpm trace conform`
CLI command.

| Primitive | Rust | WASM export | CLI | Tier | Verified |
|-----------|:----:|-------------|-----|------|----------|
| Token-replay fitness | ✅ | `check_token_based_replay` | `wpm conformance` | Diagnostic | ✅ 18/18 ground-truth |
| Alignment fitness | ✅ | `alignment_fitness`, `compute_alignments` | `wpm conformance` (alignments) | Diagnostic | ✅ inline (10) |
| ET-Conf precision | ✅ | `wasm_compute_precision`, `align_etconformance_precision` | `wpm conformance`/`quality` | Diagnostic | ✅ inline (10) |
| Generalization | ✅ | `generalization` | `wpm quality` | Diagnostic | ✅ inline (8) |
| Declare conformance | ✅ | `check_declare_conformance` | `wpm conformance` (declare) | Diagnostic | ✅ 27/27 |
| OC conformance | ✅ (`feature=ocel`) | `oc_conformance_check`, `oc_conformance_info` | `wpm conformance` (OCEL) | Diagnostic | ✅ inline (4) |
| Route admission | — (TS) | n/a (verdict layer) | `wpm trace conform` | **Verdict (==1.0)** | ✅ admission-gate suite |

### Known gaps (recorded, not silently passed)

- **Structured conformance report (GAP-PMAX-002):** `wasm4pm/src/conformance_reporting.rs`
  defines `EnhancedConformanceReport` / `FitnessBreakdown` (deterministic struct: per-activity
  fitness, token percentages, bottlenecks) but has **no `#[wasm_bindgen]` export** yet — it is
  Rust-reachable only. To satisfy the "structured struct, not a scalar" consumer contract it
  needs a WASM/CLI surface. Flagged, not claimed ALIVE.
- **Formula docstring drift (§1):** `conformance.rs` module docstring states the classic
  `1−(m+c)/(p+r)` formula, but the code computes the balanced per-trace variant. Endpoints
  (`1.0`/`0.0`) agree; interior differs. Documented above; not "fixed" because the admission
  gate is endpoint-only and changing the interior weighting is a surface-behavior change
  outside this doc-audit's mandate.
- **OC-Declare:** §6 is net-based per object type; true object-typed Declare templates are a
  future primitive.

---

## Verification run (this audit)

- `cargo test --test ground_truth_conformance_tests` → **18 passed; 0 failed** (token-replay Rank-1 oracle).
- `cargo test --test declare_all_constraints_test` → **27 passed; 0 failed** (Declare templates).
- Inline module tests counted by reading source: alignment_fitness 5, alignments 5,
  etconformance_precision 10, generalization 8, oc_conformance 4.
- No admission-gate code changed; `trace.ts:1025/1043` exact-1.0 / `RouteConformanceGap`
  behavior left intact.

**Doc-only change** (no Rust source edited) → no `cargo check` required for this agent's
edits; the two test runs above confirm the documented primitives are reachable and correct.
