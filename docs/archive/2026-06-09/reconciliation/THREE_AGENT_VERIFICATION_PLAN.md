# THREE-AGENT VERIFICATION PLAN — Agent 3 (Reachability / Verification / Receipt Preparer)

**Generated:** 2026-05-30 (finish-wip-primitives) | **Mode:** read-only / PREPARE only.
**Companion:** `THREE_AGENT_REACHABILITY_MATRIX.md` (this dir).
**NO ALIVE verdict from this team. No wiring applied. No heavy cargo run (active build target lock).**

---

## 1. Reconciliation gate commands (run AFTER both `wf_41df99e1-9a4` build and the
alignment-audit complete — NOT now; listed, the contending ones NOT executed by this team)

There is **no root `Makefile.toml`** (`find -maxdepth 3 -name Makefile.toml` → only
`crates/wasm4pm-cognition/Makefile.toml`). The user rule "use `cargo make` not `cargo`" therefore
relies on cargo-make's built-in default tasks at the workspace root. Exact gate sequence:

| # | Purpose | Command | When this team may run it |
|---|---------|---------|---------------------------|
| G-1 | Type-check whole workspace (incl. newly wired `powl_to_wf`) | `cargo make check` (built-in → `cargo check --workspace`) | ❌ contends with build target lock — DEFER to reconciliation |
| G-2 | Run the new module's tests (inline `#[cfg(test)]` ships once wired) | `cargo make test` then narrow: `cargo test -p wasm4pm powl_to_wf` | ❌ DEFER (heavy + needs wiring first) |
| G-3 | Round-trip + soundness oracle for C1/C6 (the 13 inline tests) | `cargo test -p wasm4pm powl_to_wf:: -- --nocapture` | ❌ DEFER (module must be wired first) |
| G-4 | WASM build (browser/cloud) — proves WASM leg of GAP-PMAX-005 | `npm --prefix wasm4pm run build:nodejs` (= `wasm-pack build --target nodejs --release --features cloud`) | ❌ DEFER (heavy; contends) |
| G-5 | CLI/TS gate (wpm verbs incl. ocpq, powl convert) | `pnpm --filter @wasm4pm/cli test` (= `vitest run`) | ⚠️ light; still DEFER while build active to avoid disk/IO contention |
| RO-1 | **Read-only inspection this team MAY run** | `grep`, `ls`, `sed -n`, `df` | ✅ done |

**Why this team executes none of G-1..G-5:** all touch the shared `target/` lock or require the
deferred `pub mod` wiring. Running them now would either fail to compile (no wiring) or corrupt the
active build. They are the reconciliation gate's job.

---

## 2. Verification obligations per landed primitive (the per-primitive ledger inputs)

For each, the reconciliation synthesizer must confirm all six ALIVE legs (plan §"Anti-cheat ALIVE rule").
This team supplies the **positive/negative proof handles and reachability verdict**; the synthesizer
runs them and emits the verdict.

### Primitive: POWL→WF-net forward synthesis (C1)
- **Paper grounding:** Kourani/Park/van der Aalst, Separable WF-nets, Defs 3.6–3.9, Thm 1 §5 (round-trip language preservation).
- **Artifact:** `wasm4pm/src/powl_to_wf.rs` (un-wired).
- **Positive proof (PREPARED, run at reconciliation):** inline tests `roundtrip_single_transition`,
  `roundtrip_sequence`, `roundtrip_parallel`, `roundtrip_xor_choice_graph`,
  `three_element_total_order`, `three_element_parallel`, `forward_synthesis_is_sound_and_safe`
  (asserts synthesized net `is_sound_and_safe()` via `crate::soundness::analyze_petri_net`).
- **Negative/refusal proof:** `irreducible_powl_refuses_tree_projection`,
  `nested_irreducible_poisons_partial_order_tree`, `three_element_genuine_partial_order` →
  `NonBlockStructured` (honest BLOCKED, never a forced false tree).
- **Reachability:** Rust-only (un-wired) ⇒ **PREPARE_NOT_WIRE**; NOT ALIVE until §3 patch applied.

### Primitive: POWL→process tree projection (C1)
- **Artifact:** `powl_to_wf.rs::powl_to_process_tree` + `do_redo_loop_to_loop_tree`, `process_tree_projection_cases`.
- **Reachability:** Rust-only ⇒ PREPARE_NOT_WIRE.

### Primitive: OCPQ runtime + Fig.6 (C4)
- **Reachability:** ✅ Rust + WASM (`evaluate_ocpq`, lib.rs:3304) + CLI (`wpm ocpq query`).
- **Obligation:** reconciliation must verify the Fig.6-faithful encoding (`box(v0)`, `CBS(A,1,1)`,
  `TBE(e1,e2,0,4w)`) — fidelity check, reachability already lawful.

### Primitive: Soundness
- **Reachability:** ✅ Rust + WASM + CLI (`wpm powl validate` → `check_powl_soundness`). SAFE_TO_FINISH_NOW.

### Primitive: OCEL v2
- **Reachability:** Rust + WASM (4 exports); CLI dedicated-verb coverage to be confirmed (GAP-PMAX-005) ⇒ DEFER.

---

## 3. Wiring patch PLAN (PREPARED — DO NOT APPLY while build runs)

Apply only during reconciliation, AFTER `wf_41df99e1-9a4` completes. Three edits, smallest-first.

### Patch 3a — declare the module (shared-manifest edit; DEFER)
In `wasm4pm/src/lib.rs`, in the POWL block (near l.516 `pub mod powl_to_process_tree;`), add:
```rust
pub mod powl_to_wf;
```
**Chesterton check:** lib.rs is the module manifest; its invariant is "every cargo-visible source file is
declared exactly once." Adding one `pub mod` for a file that imports only already-wired modules
(`models`, `wf_to_powl`, `soundness`) preserves that invariant and cannot orphan or double-declare
(verified: no existing `powl_to_wf` line). Breaks nothing; un-blocks the inline tests + enables 3b.

### Patch 3b — WASM export (GAP-PMAX-005; DEFER)
Add a `#[wasm_bindgen]` wrapper following the existing `wf_net_to_powl` pattern (wf_to_powl.rs:1427).
Recommended placement: a small `#[wasm_bindgen]` block at the end of `powl_to_wf.rs` (after wiring 3a),
or a wrapper in lib.rs mirroring `evaluate_ocpq`:
```rust
#[wasm_bindgen]
pub fn powl_spec_to_wf_net(powl_spec_json: &str) -> Result<JsValue, JsValue> {
    let spec: crate::wf_to_powl::PowlSpec = serde_json::from_str(powl_spec_json)
        .map_err(|e| crate::error::js_val(&format!("invalid PowlSpec: {e}")))?;
    let net = crate::powl_to_wf::powl_to_wf_net(&spec);
    crate::utilities::to_js_str(&net)   // to_js_str, NOT to_js (serde_wasm_bindgen json bug)
}

#[wasm_bindgen]
pub fn powl_spec_to_process_tree(powl_spec_json: &str) -> Result<JsValue, JsValue> {
    let spec: crate::wf_to_powl::PowlSpec = serde_json::from_str(powl_spec_json)
        .map_err(|e| crate::error::js_val(&format!("invalid PowlSpec: {e}")))?;
    crate::utilities::to_js_str(&crate::powl_to_wf::powl_to_process_tree(&spec))
}
```
**Note (anti-duplication):** the surface verbs `wpm powl convert --target petri-net|process-tree`
already exist (powl.ts:402/406 → `wasm.powl_to_petri_net`/`powl_to_process_tree`). The NEW exports are
the paper-faithful PowlSpec-typed engine; reconciliation must decide whether to (i) re-point the existing
`convert` targets at the new synthesis or (ii) add a distinct `--engine separable` flag. Recommend (ii)
to avoid changing shipped `convert` behavior without a surface-change review (plan Constraints §).

### Patch 3c — optional `wpm` verb (DEFER; only if not folding into `convert`)
If a distinct verb is chosen, extend `POWL_SUBCOMMANDS`/`CONVERT_TARGETS` in `apps/wasm4pm/src/commands/powl.ts`
(e.g. `--target wf-net-separable`) calling `wasm.powl_spec_to_wf_net`. No new MCP tool (binding constraint).

### Patch 3d — round-trip integration test (DEFER, separate compilation unit)
After 3a, a new `wasm4pm/tests/powl_to_wf_roundtrip.rs` may `use wasm4pm::powl_to_wf::*` and assert
`wf_net_language(powl_to_wf_net(&spec)) == powl_language(&spec)` on A5's separable fixtures. Cannot be
written/compiled before 3a (module not exported) ⇒ DEFER.

---

## 4. Reconciliation receipt — FORMAT / DRAFT (PREPARED; to be filled by synthesizer)

Target: `docs/receipts/WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md`. Per-primitive ledger block (plan §"Final
report"). Draft for the C1/C6 primitive (values in `<…>` filled when gates run post-wiring):

```
Primitive:        POWL → WF-net / process tree (forward synthesis, C1 + cyclic choice C6)
Paper grounding:  Separable WF-nets (Kourani/Park/van der Aalst), Defs 3.6–3.9, Theorem 1 §5
Artifact:         wasm4pm/src/powl_to_wf.rs  (+ lib.rs:pub mod powl_to_wf; + WASM exports powl_spec_to_wf_net / powl_spec_to_process_tree)
Positive proof:   cargo test -p wasm4pm powl_to_wf::tests::{roundtrip_single_transition,roundtrip_sequence,
                  roundtrip_parallel,roundtrip_xor_choice_graph,three_element_total_order,
                  three_element_parallel,forward_synthesis_is_sound_and_safe}  → PASS <count/count>
Negative proof:   powl_to_wf::tests::{irreducible_powl_refuses_tree_projection,
                  nested_irreducible_poisons_partial_order_tree,three_element_genuine_partial_order}
                  → NonBlockStructured / honest BLOCKED (no forced tree)
Reachability:     Rust ✅ | WASM <after 3b> | CLI <after 3c or convert-fold>
Deterministic G1: <BLAKE3 of synthesized net stable across 2 runs>
Receipt G2:       <--verify-receipt-hash result>
Verdict:          PREPARE_NOT_WIRE today → ALIVE only after 3a–3d applied & gates green; else PARTIAL
```

Receipt MUST cite test names/commands/files (plan leg 6). Until 3a–3d land, the C1/C6 line is
**PREPARE_NOT_WIRE**, which floors the kernel verdict away from ALIVE (correct — anti-FAKE-LIVE).

---

## 5. This team's verdict

- `powl_to_wf.rs` content: **SAFE_TO_PREPARE_NOT_WIRE** (real, paper-grounded, un-wired, cargo-invisible).
- All wiring (3a–3d), OCEL-v2 CLI verbs, `describe_log`, structured conformance, C4 Fig.6 verification:
  **DEFER_TO_RECONCILIATION** (shared-manifest / new-build / fidelity scope).
- No ALIVE verdict issued here. No gate executed (active build lock). No fake reachability claimed.
