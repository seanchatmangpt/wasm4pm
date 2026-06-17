# THREE-AGENT REACHABILITY MATRIX — Agent 3 (Reachability / Verification / Receipt Preparer)

**Generated:** 2026-05-30 (finish-wip-primitives) | **Mode:** read-only static inspection only.
**Verdict scope:** reachability classification + wiring PREPARATION. NO ALIVE verdict from this team.
**Doctrine:** "Rust-only is NOT reachable" — a `pub fn` that is never `#[wasm_bindgen]`-exported and
never reached by a `wpm` verb is *correct-but-unreachable* until wired (SAFE_TO_PREPARE_NOT_WIRE),
never ALIVE. No fake reachability.

---

## 0. Live-state constraint (binding)

The main build (`wf_41df99e1-9a4`) is ACTIVE and `wasm4pm/src/lib.rs` + `Cargo.toml [workspace] members`
are shared manifests. **No wiring edit (`pub mod`, member add, `#[wasm_bindgen]` in lib.rs) may be
applied while the build runs.** Everything below is PREPARED, not applied. `.agents/sentinel` is active —
do NOT delete `.agents`.

---

## 1. Reachability legend

| Column | Meaning |
|--------|---------|
| **Rust** | A `pub` symbol callable from in-crate Rust (and from `tests/*.rs` **only if** its module is `pub mod`-wired in lib.rs). |
| **WASM** | A `#[wasm_bindgen]` export exists (directly in the module, or a wrapper in `lib.rs` that calls it). |
| **CLI** | A `wpm <verb>` path in `apps/wasm4pm/src/commands/*.ts` calls the WASM export. |
| **Verdict** | SAFE_TO_FINISH_NOW (already reachable, lawful) · SAFE_TO_PREPARE_NOT_WIRE (Rust content landed, wiring deferred) · DEFER_TO_RECONCILIATION (needs shared-manifest edit) |

---

## 2. Primitive reachability matrix (verified by grep, not assumed)

| Primitive | Module / symbol | Rust | WASM | CLI | Verdict | Evidence |
|-----------|-----------------|:----:|:----:|:---:|---------|----------|
| **C1/C6 forward synthesis** `POWL→WF-net` | `powl_to_wf.rs::powl_to_wf_net` (l.337) | ❌ (un-wired: no `pub mod powl_to_wf;` in lib.rs → cargo-invisible) | ❌ | ❌ | **SAFE_TO_PREPARE_NOT_WIRE** | `grep powl_to_wf wasm4pm/src/lib.rs` → empty; content is real (not stub), imports only wired modules `models`,`wf_to_powl`,`soundness` (lib.rs l.92/94/96) |
| **C1 tree projection** `POWL→process tree` | `powl_to_wf.rs::powl_to_process_tree` (l.378) | ❌ (same module, un-wired) | ❌ | ❌ | **SAFE_TO_PREPARE_NOT_WIRE** | distinct from the *existing* wired module `powl_to_process_tree.rs` (lib.rs l.516) — naming overlaps the FUNCTION, not the module; no collision |
| **POWL→Petri (pre-existing surface path)** | `powl_to_petri_net` / `powl_to_process_tree` WASM exports | ✅ | ✅ | ✅ `wpm powl convert --target petri-net\|process-tree` | **SAFE_TO_FINISH_NOW** (already reachable; pre-dates this team) | `powl.ts` l.402/406 call `wasm.powl_to_petri_net` / `wasm.powl_to_process_tree` |
| **WF-net→POWL (inverse, A4)** | `wf_to_powl.rs::wf_net_to_powl` (l.1428, `#[wasm_bindgen]`) | ✅ | ✅ | ⚠️ (no dedicated verb found; WASM-reachable) | **SAFE_TO_FINISH_NOW** (WASM leg lawful) | `grep wasm_bindgen wf_to_powl.rs` → l.1427 |
| **Round-trip oracle** `wf_net_language` / `powl_language` | `wf_to_powl.rs` l.1390 / l.1141 | ✅ | ❌ (internal oracle, not a surface) | ❌ | **SAFE_TO_FINISH_NOW** (oracle is test-internal by design, not a consumer surface) | used by `powl_to_wf.rs` tests l.487 |
| **OCEL v2** | `ocel_v2.rs` (4× `#[wasm_bindgen]`) | ✅ | ✅ (4 exports) | ⚠️ partial (`wpm trace ocel` reads OCEL; no dedicated `ocel-v2` verb) | **DEFER_TO_RECONCILIATION** (confirm O2O/qualifier/cardinality exports each have a CLI/typed-report path — GAP-PMAX-005) | `grep -c wasm_bindgen ocel_v2.rs` → 4; lib.rs l.367 wired |
| **OCPQ runtime** | `ocpq_runtime.rs` (0× local `#[wasm_bindgen]`) + lib.rs wrapper `evaluate_ocpq` (l.3304) | ✅ | ✅ (via `evaluate_ocpq`) | ✅ `wpm ocpq query -q ...` | **SAFE_TO_FINISH_NOW** (lawfully reachable) | `lib.rs:3304 pub fn evaluate_ocpq`; `process-law-e2e.test.ts:200 ['ocpq','query',...]` |
| **OCPQ Fig.6 fidelity (C4)** | `ocpq_runtime` constr/CBS/TBE encoding | ✅ | ✅ | ✅ | **DEFER_TO_RECONCILIATION** (reachable, but Fig.6-faithful `box(v0)/CBS(A,1,1)/TBE(0,4w)` encoding must be verified against C4 — paper-fidelity, not reachability) | C4 in plan l.176–180 |
| **Soundness (analyze + structural)** | `soundness.rs::analyze_petri_net` (l.713), `StructuralNet::is_workflow_net` (l.247), `is_sound_and_safe` (l.705); 2× `#[wasm_bindgen]` | ✅ | ✅ (2 exports) + `check_powl_soundness` | ✅ `wpm powl validate` (calls `wasm.check_powl_soundness`, powl.ts l.794) | **SAFE_TO_FINISH_NOW** | grep counts above |
| **GAP-PMAX-001 `describe_log`** | (search) | — | — | — | **DEFER_TO_RECONCILIATION** (no `describe_log` export found → must be built+wired; out of this team's safe surface) | `grep describe_log` → none in surface |
| **GAP-PMAX-002 structured conformance** | conformance struct | partial | — | — | **DEFER_TO_RECONCILIATION** | owner A6 |

### Reachability summary
- **Already lawfully reachable (SAFE_TO_FINISH_NOW):** OCPQ query, soundness, POWL→Petri/tree surface path, WF→POWL (WASM).
- **Correct-but-unreachable (SAFE_TO_PREPARE_NOT_WIRE):** the two new `powl_to_wf.rs` functions — Rust content is real and paper-grounded, but un-wired ⇒ NOT ALIVE until reconciliation wires them.
- **DEFER (needs build + shared-manifest wiring, owned by full reconciliation):** `describe_log`, structured conformance report, OCEL-v2 dedicated CLI verbs, C4 Fig.6 verification.

---

## 3. Why `powl_to_wf.rs` is PREPARE-not-WIRE and a new `tests/*.rs` is DEFER

- Editing `powl_to_wf.rs` **content** cannot break the concurrent build: cargo never sees the file
  (no `pub mod powl_to_wf;`), and its `#[cfg(test)]` block is equally invisible.
- A new `wasm4pm/tests/powl_to_wf_roundtrip.rs` is a **separate compilation unit** that would
  `use wasm4pm::powl_to_wf::...` — which does not resolve until the module is `pub mod`-wired.
  Therefore it would NOT compile ⇒ **DEFER**, never SAFE_WRITE. The inline `#[cfg(test)] mod tests`
  already inside `powl_to_wf.rs` (l.483) is the correct home for now and ships for free at wire time.
