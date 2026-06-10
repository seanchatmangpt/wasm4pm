# Three-Agent Finish Team — Agent 2 (Primitive Code Finisher) Report

**Branch:** `finish-wip-primitives`
**Active workflows at time of work:** `wf_41df99e1-9a4` (main build, writing the tree) + `.agents/sentinel` orchestration — both still running. No shared-manifest edits performed.
**Verdict:** `SAFE_TO_FINISH_NOW` (for the `powl_to_wf.rs` content I touched). Wiring remains `DEFER_TO_RECONCILIATION`.

---

## Scope honored

- Edited ONLY `wasm4pm/src/powl_to_wf.rs` — the file Agent 1 marked SAFE_WRITE
  (content-only, un-wired, cargo-invisible: confirmed no `pub mod powl_to_wf;` in
  `wasm4pm/src/lib.rs`, grep exit 1).
- Wrote this report under the greenfield `docs/reconciliation/` dir (not in cargo graph).
- Did NOT add the `lib.rs` `pub mod` line, any `Cargo.toml` member, any
  `#[wasm_bindgen]` export, any `wpm` verb, or any external `tests/*.rs`
  referencing `powl_to_wf` (all DEFER — a separate compilation unit would not
  compile against an unexported module).

## Chesterton's Fence — invariants reconstructed BEFORE editing

1. **Why it exists:** closes audit gaps **C1** (forward POWL→WF-net + POWL→process-tree;
   the inverse `wf_to_powl` already existed) and **C6** (cyclic choice graph). It is the
   `↔` leg of the primitive DAG + the tree projection the foundry consumes.
2. **Invariant it protects:**
   - (a) language preservation / round-trip: `wf_net_language(powl_to_wf_net(s)) == powl_language(s)` for acyclic input (Theorem 1, §5);
   - (b) every synthesized net is a structurally valid WF-net (Def 3.3);
   - (c) POWL 2.0 strictly generalizes process trees, so genuinely non-block-structured
     POWL must yield `NonBlockStructured` (the honest BLOCKED leaf), **never** a forced/false tree.
3. **What depends on it:** nothing at compile time today (un-wired); the only consumer is its
   own `#[cfg(test)]` mod, which imports already-wired modules
   (`crate::soundness`, `crate::wf_to_powl`).
4. **What breaks if changed:** nothing in the concurrent build — un-wired ⇒ cargo-invisible.
   Adding tests inside the existing `#[cfg(test)] mod tests` cannot affect a build.
5. **Stronger completion that preserves the invariant:** add invariant + negative tests that
   tighten the existing proof without altering the synthesis logic or weakening any threshold.

## Changes made (inside SAFE_WRITE file only)

All additions are **inside the existing `#[cfg(test)] mod tests`** (cargo-invisible until the
module is wired in reconciliation). No production-path logic changed. One import added to the
test module: `analyze_petri_net` from `crate::soundness` (already `pub`).

New tests:

| Test | Proof kind | Oracle |
|------|-----------|--------|
| `forward_synthesis_is_sound_and_safe` | **invariant (strong)** | `crate::soundness::analyze_petri_net(...).is_sound_and_safe()` over Sequence/Parallel/XOR + language preservation. Links nets to soundness (Def 3.5), the class the paper targets — stronger than the prior `is_wf_net`-only checks. |
| `three_element_total_order` | positive + round-trip | A≺B≺C ⇒ `{A·B·C}`, Sequence tree |
| `three_element_parallel` | positive + round-trip | A∥B∥C ⇒ all 3!=6 interleavings, Parallel tree |
| `three_element_genuine_partial_order` | **refusal (tree) + positive (net)** | genuine PO (A≺B,A≺C) ⇒ valid language-preserving WF-net `{A·B·C, A·C·B}` BUT `NonBlockStructured` tree carrying the "partial order" reason — proves it does not force a false tree |
| `do_redo_loop_to_loop_tree` | positive + C6 | do/redo choice graph ⇒ `↺(do=A, redo=B)` Loop tree; POWL language enumerates `A` and `A·B·A` loop unrollings |
| `irreducible_powl_refuses_tree_projection` | **negative / refusal** | irreducible POWL ⇒ `NonBlockStructured` reason naming "irreducible" + the labels X,Y; anti-FAKE-LIVE refusal path |
| `nested_irreducible_poisons_partial_order_tree` | **negative (propagation)** | irreducible child poisons the parent PO tree — projection never silently drops unconvertible sub-models |

Proof style satisfied: **positive + negative/refusal + invariant/round-trip**, oracle = paper
math (`crate::soundness`, `crate::wf_to_powl::{powl_language, wf_net_language}`), not the
module's own code (no FM-5).

## Thresholds / fences NOT touched

- Exact-1.0 admission gate: untouched (lives in `apps/wasm4pm/src/commands/trace.ts`).
- Diagnostic ≥0.8 vs route-admission 1.0 distinction: untouched.
- No Rust-only code marked reachable; `NonBlockStructured` (honest BLOCKED) semantics preserved.

## Residual / execution-time risk (cannot run cargo — build lock contention)

I did **not** run `cargo`/`cargo make` to avoid contending with the active build's target lock,
per hard constraints; verification was read-only static reasoning against the dependency contracts.

- **`forward_synthesis_is_sound_and_safe` on the XOR net** is the single assertion with
  residual execution-time risk. By construction it is a free-choice **state machine** (Def 3.10) —
  one control token, both branches reachable (so no dead τ), single token reaches the sink
  (proper completion, safe) — therefore sound+safe per the paper. Sequence/Parallel are
  AND-split/AND-join marked graphs and are clearly sound+safe. If, at reconciliation, the bounded
  reachability explorer is more conservative on the XOR net than the paper predicts, the
  correct fix is to scope that single sub-assertion to `is_wf_net` (matching the file's prior
  cyclic test rationale) — NOT to weaken any invariant. Flagged here so the reconciliation owner
  runs `cargo make` once the module is wired and adjusts only this leaf if needed.

## DEFER list (reconciliation, while build is quiescent)

1. `wasm4pm/src/lib.rs` line `pub mod powl_to_wf;` (shared-manifest edit — never while build runs).
2. Run `cargo make test` for the now-visible `powl_to_wf::tests` (7 prior + 7 new = 14 tests).
3. `#[wasm_bindgen]` export of `powl_to_wf_net` / `powl_to_process_tree` + `wpm` verb
   (GAP-PMAX-005 reachability — turns this from Rust-only into ALIVE).
4. Any external `wasm4pm/tests/*.rs` exercising the public functions (won't compile until #1).

## File ledger

- `wasm4pm/src/powl_to_wf.rs` — test module strengthened (production logic unchanged).
- `docs/reconciliation/THREE_AGENT_CODE_FINISH_REPORT.md` — this report.
