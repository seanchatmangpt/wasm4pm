# THREE-AGENT BOUNDARY MAP — Agent 1 (Boundary / Ownership / Fence Auditor)

**Generated:** 2026-05-30 ~13:47 local | **Branch:** `finish-wip-primitives`
**Mode:** read-only inspection (this report is the ONLY file Agent 1 writes)
**Verdict scope:** classification only — NO ALIVE verdict from this team.

---

## 0. Live-state assessment (is the main build still running?)

**YES — the main build workflow (`wf_41df99e1-9a4`) is ACTIVELY writing the tree.**

Evidence (BSD `stat` mtimes, now=13:47:17):

| File | mtime | Signal |
|------|-------|--------|
| `wasm4pm/tests/powl_macro_a9_tests.rs` | **13:47:48** | landed seconds ago → A9 active NOW |
| `apps/wasm4pm/src/__tests__/benchmark-gate.test.ts` | 13:46:41 | A9 active |
| `apps/wasm4pm/src/commands/benchmark.ts` | 13:43:38 | A9 active |
| `wasm4pm/tests/negative_corpus.rs` | 13:35:42 | A8 just landed |
| `wasm4pm/src/powl_to_wf.rs` | 13:34:35 | C1 surface just landed (un-wired) |
| `docs/primitives/06-NEGATIVE-CORPUS.md` | 13:35 | A8 doc just landed |
| `wasm4pm/src/foundry.rs` / `tests/foundry.rs` | 13:17 / 13:18 | A7 landed |
| `wasm4pm/src/lib.rs` | 13:13:24 | shared manifest, recently rewritten |
| `.agents/sentinel/BRIEFING.md` | 13:21:53 | **sentinel active within last ~26 min** |

**`.agents/sentinel` is ACTIVE — do NOT delete `.agents` (hard constraint confirmed by live marker).**

### ENVIRONMENTAL HAZARD (new, not in brief)
Disk is at **100% capacity, 549 MiB free**, and a `write error: no space left on device`
already fired during inspection. This is a global constraint: ANY write — including reconciliation
docs — risks failure, and a heavy `cargo`/`cargo make` build would likely fail mid-flight and could
corrupt the active build's target dir. **Reinforces: no heavy cargo, prefer static inspection.**

---

## 1. lib.rs wiring (shared-manifest fence — DEFER, never touch while build runs)

`wasm4pm/src/lib.rs` declares (wired, cargo-visible):
- L94 `pub mod soundness;`
- L96 `pub mod wf_to_powl;`
- L99 `pub mod foundry;`
- L367 `pub mod ocel_v2;`

**NOT declared:** `powl_to_wf` — there is no `pub mod powl_to_wf;`. Confirmed by grep.
`Cargo.toml` workspace members already include `crates/ocel-core` + `crates/ocpq` (both wired).

**Invariant lib.rs protects:** the module graph + crate API surface that the running `cargo`
process resolves on every rebuild. Depends-on: every crate consumer, every `tests/*.rs` integration
test (separate compilation units that `use wasm4pm::...`), `#[wasm_bindgen]` export surface.
**What breaks if changed mid-build:** adding/removing a `pub mod` line forces the active build to
re-resolve the module graph against half-written files → compile break or target-lock contention.
**Classification: DEFER_TO_RECONCILIATION** (all manifest edits, incl. wiring `powl_to_wf`).

---

## 2. File-ownership table

| Path | Classification | Invariant it protects | Depends-on | Reason |
|------|----------------|-----------------------|------------|--------|
| `wasm4pm/src/powl_to_wf.rs` | **SAFE_WRITE (content)** | C1 forward conversion: POWL→WF-net (`powl_to_wf_net`) + POWL→process-tree (`powl_to_process_tree`) — the DAG `↔` + tree projection | imports `crate::models::PetriNet` + `crate::wf_to_powl::PowlSpec` (both WIRED); its own `#[cfg(test)] mod` uses `crate::soundness` + `crate::wf_to_powl` (wired) | **Un-wired** (no `pub mod` in lib.rs) → cargo-invisible → editing content CANNOT break the concurrent build. Header L32-34 self-documents the intentional un-wiring. Body is REAL (not stub): both fns implemented (L337, L378). |
| `wasm4pm/src/powl_to_wf.rs` — its `pub mod` line in lib.rs | **DEFER_TO_RECONCILIATION** | module-graph resolution | all crate consumers | wiring = shared-manifest edit (§1). Once wired it WOULD compile (all its deps are wired); until then it stays invisible. |
| **A new `wasm4pm/tests/*.rs` referencing `powl_to_wf`** | **DEFER_TO_RECONCILIATION** | round-trip language-preservation proof (C1) | `wasm4pm::powl_to_wf` export | A `tests/*.rs` file is a SEPARATE compilation unit; it can only `use wasm4pm::powl_to_wf` AFTER the `pub mod` is wired. Written now it would FAIL to compile (module not exported) → this is DEFER, not SAFE_WRITE. (Brief's key fact, confirmed.) |
| `docs/reconciliation/` (new dir) | **SAFE_WRITE** | none (greenfield) | nothing in the build graph | new dir, not owned by any agent, not in cargo graph. (This report lives here. NOTE: disk-full may still block writes.) |
| `wasm4pm/src/lib.rs` | **BLOCKED** | module graph + API surface | everything | shared manifest, rewritten 13:13, actively part of build. Hard constraint: no global wiring while build runs. |
| `Cargo.toml` / `wasm4pm/Cargo.toml` | **BLOCKED** | workspace members + dep versions | whole workspace | shared manifests; `ocel-core`/`ocpq` already members. No manifest edits while build runs. |
| `apps/wasm4pm/src/commands/benchmark.ts` | **BLOCKED_BY_ACTIVE_WORKFLOW** | A9 `wpm benchmark gate` G1–G5 CLI surface | benchmark-gate tests, gate consumers | mtime 13:43 — A9 writing NOW. |
| `apps/wasm4pm/src/__tests__/benchmark-gate.test.ts` | **BLOCKED_BY_ACTIVE_WORKFLOW** | gate G1–G5 test proof | benchmark.ts | mtime 13:46 — A9 writing NOW. |
| `wasm4pm/tests/powl_macro_a9_tests.rs` | **BLOCKED_BY_ACTIVE_WORKFLOW** | `powl_test!` macro / 4 harness types (C7) | macro crate + harness | mtime 13:47:48 — landed seconds ago, A9 active. |
| `wasm4pm/src/foundry.rs`, `wasm4pm/tests/foundry.rs` | **BLOCKED_BY_ACTIVE_WORKFLOW** | A7 process-world foundry (Order-to-Cash, neg traces, receipt fixtures C2) | wired (`pub mod foundry`) | mtime 13:17/13:18 — A7 just landed; wired & cargo-visible → editing risks build break. |
| `wasm4pm/tests/negative_corpus.rs`, `docs/primitives/06-NEGATIVE-CORPUS.md` | **BLOCKED_BY_ACTIVE_WORKFLOW** | A8 negative corpus (refusal + AndonPull reason) | foundry/conformance | mtime 13:35 — A8 just landed. |
| `crates/ocpq/**`, `crates/ocel-core/{flatten,validate}.rs`, `crates/ocel-core/tests/**` | **DEFER_TO_RECONCILIATION** | A2/A3 OCEL v2 + OCPQ runtime (paper objects) | wired workspace members | landed 12:29–12:46; wired & cargo-visible. Not being written in last 3 min, but owned by A2/A3 and part of live build graph → DEFER (don't edit while build runs; reconcile C4 OCPQ Fig.6 fidelity later). |
| `wasm4pm/src/{ocel_v2,wf_to_powl,soundness}.rs` + their `tests/*.rs` | **DEFER_TO_RECONCILIATION** | A2/A4/A5 paper objects (OCEL-v2, separable WF→POWL, soundness) | wired modules | landed 11:50–12:35; wired & cargo-visible. Conformance/round-trip corrections (C1 reverse-dir tests, C5 PNML, C6 cyclic choice-graph) belong to reconciliation, not now. |
| `docs/primitives/0X-*.md` (01–05, 09, 09b) | **DEFER_TO_RECONCILIATION** | per-primitive docs (paper grounding) | synthesizer | actively rewritten through 13:35; doc renumbering (delta 3) + FAKE-LIVE verdict (delta 2) are reconciliation tasks. No docs-only completion allowed. |
| `.agents/**` (incl. `sentinel/`) | **BLOCKED** | active sentinel orchestration | live workflow | sentinel marker 13:21; deletion forbidden by hard constraint + live activity. |

---

## 3. Chesterton's Fence — primary candidate (`powl_to_wf.rs`)

1. **Why it exists:** delivers C1 (CRITICAL) — the forward POWL→WF-net + POWL→process-tree
   conversions the DAG's `↔` and tree projection depend on; the build had only the reverse
   (`wf_to_powl`).
2. **Invariant protected:** *language preservation across the POWL↔WF-net boundary* and the
   block-structured tree projection (with explicit `NonBlockStructured`/`Irreducible` reasons —
   no silent fake reachability).
3. **What depends on it:** nothing in the build graph YET (un-wired). On wiring: G4 equivalence
   gate (C3), round-trip tests, GAP-PMAX-005 reachable surface.
4. **What breaks if changed:** nothing in the active build (cargo-invisible). After wiring, its
   `#[cfg(test)] mod` and any new integration test become live.
5. **Stronger completion preserving the invariant:** finish/verify the pure-fn bodies + the
   in-file `#[cfg(test)] mod` (round-trip on A5 separable fixtures, both directions) **as content
   only**; DEFER the `pub mod` wire + any external `tests/*.rs` + the `#[wasm_bindgen]`/`wpm` verb
   to reconciliation. This is the **SAFE_TO_PREPARE_NOT_WIRE** path.

---

## 4. Team verdict (Agent 1)

- **Active workflow:** RUNNING (A9 writing at 13:47:48; sentinel active). → `BLOCKED_BY_ACTIVE_WORKFLOW` for all wired/owned surfaces.
- **Only genuinely safe surface for content work:** `wasm4pm/src/powl_to_wf.rs` (cargo-invisible) → **SAFE_TO_PREPARE_NOT_WIRE**.
- **Safe new dir:** `docs/reconciliation/` (subject to disk-full).
- **DEFER:** all wiring (lib.rs `pub mod powl_to_wf`), any `tests/*.rs` referencing it, OCEL-v2/OCPQ/soundness corrections (C1-rev, C4, C5, C6), doc renumbering + FAKE-LIVE verdict.
- **No ALIVE verdict.** No manifest edits. No `.agents` deletion. No heavy cargo (also blocked by disk).
- **Escalation:** disk at 100% / 549 MiB free + observed write error — reconciliation must reclaim space before any build/gate run, or gates will FAIL for non-logic reasons (FAKE_LIVE_RISK if mistaken for primitive failure).
