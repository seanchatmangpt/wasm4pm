---
receipt: GALL_CHECKPOINT_2026-07-29
date: 2026-07-29
status: MIXED
gate: Explore-phase ground-truth audit (9 agents, real commands only)
---

# Gall's Law Checkpoint — wasm4pm ground truth

Every verdict below is backed by a command actually run or a file actually read on
2026-07-29, not by restating CLAUDE.md's prior claims. Vocabulary: **ALIVE** (verified
working) · **PARTIAL** (some evidence, not fully verified) · **BLOCKED** (tried, hit a
named error) · **MOCKED** (stub/fake stands in for a real check) · **UNSUPPORTED** (no
counterpart exists) · **UNVERIFIABLE** (no ground truth to check against).

## Surface status

| Surface | Verdict | Evidence |
|---|---|---|
| ggen regeneration of `registration.rs`/`registry.json`/`breed-ids.ts` | **BLOCKED** | `ggen sync run --dry-run` → `FM-GEN-006: QuerySource::Pack (pack 'wasm4pm-compat') is not implemented yet`. Installed `ggen 26.7.59` vs `~/ggen` HEAD `26.15.2`. `just ggen-gate` invokes bare `ggen sync`, a verb that no longer exists standalone. |
| Cognition breed registry (55 breeds) | **ALIVE** | `registry.json`: 55/55 `PARTIAL_ALIVE`. 5-breed sample all have `ocel/reports/<breed>.json` with `admitted:true, fitness:1.0`. `cargo check -p wasm4pm-cognition`: PASS. `cargo test --lib`: 440/441 (1 real, narrow bug: `session::tests::refuses_tampered_state_hash`). `anti_fraud_gate.rs`: 55/55 PASS. |
| Core wasm4pm/ algorithms — native build | **ALIVE** | `cargo check`: PASS, 15.65s. |
| Core wasm4pm/ algorithms — wasm32 gate | **BLOCKED as documented** | CLAUDE.md's `cargo check --target wasm32-unknown-unknown --features wasm` fails: `wasm4pm` crate has no `wasm` feature. Same command without `--features wasm`: PASS, 45.38s. |
| "60 algorithms" claim | **UNVERIFIABLE** | No registry/count exists in code. Proxy (`discover_*` fns) = 66, but overcounts wasm-facade/pure-core pairs; real distinct count ≈ 35-40. |
| TS monorepo structure | **ALIVE** | `packages/*` = 12 dirs, matches claim exactly. `crates/wasm4pm-cognition/pkg` WASM output present (2.07MB, not stale vs source). |
| `pnpm build` | **BLOCKED** | Fails immediately: `examples/web-dashboard/index.html` references `./src/main.js`, which does not exist. Aborts the whole recursive build before other packages run. |
| `pnpm test` | **BLOCKED** | Root `package.json`: `"test": "pnpm run test:integration"`, `"test:integration": "pnpm run test --workspaces --if-present"` — the two scripts call each other recursively, appending `--workspaces --if-present` forever. Ran for real (300s): ~1600 repeated invocations, zero test-framework output, killed by timeout. **No test in this monorepo currently runs via `pnpm test`.** |
| New `wpm mining` CLI bridges (11 files) | **mostly ALIVE, undocumented** | `cargo check -p wasm4pm-cli`: PASS. Live-ran heuristic/inductive/ilp/genetic/pso/social-network/cognition against real fixtures — all produced real output. `aco` ran but returned a degenerate empty-DFG result (fitness 0.2, no edges) — PARTIAL. `ocdfg`/`conformance` are real code with no fixture in-repo to exercise them live — UNVERIFIED live, ALIVE by inspection. |

## mfact / mfw Lean 4 formalization vs wasm4pm Rust

| Domain | Lean proof status | Rust correspondence | Verdict |
|---|---|---|---|
| Petri net / WfNet soundness | `WfNet.Sound` proven, no `sorry`/`axiom` (`mfact/procint/ProcInt/Workflow/Soundness.lean`) | `wasm4pm/src/soundness.rs` faithfully encodes the same 3 clauses; non-negative markings match | **ALIVE**-compatible. Gaps are scope, not bugs: Rust has no weighted arcs, no short-circuited-net liveness/boundedness exposure, but adds bounded/truncated reachability + safeness Lean doesn't model |
| `wasm4pm-compat/src/petri.rs` (the file mfact's doc comment actually names) | same `Soundness.lean` | Typestate scaffold (`SoundnessClaimed`/`SoundnessWitnessed`) that explicitly computes nothing — module doc says so | **UNVERIFIED, not MOCKED** — doesn't fake a check, has none. Not dead code, not production-load-bearing either. Lean's claim about it is accurate; no fix needed, this file's role is to be superseded |
| Conformance fitness | `TokenReplay.lean`'s `fitness` proven, bounded [0,1], perfect-fitness-is-1 | `wasm4pm/src/conformance.rs`'s `trace_fitness` — exact same formula (Lean docstring confirms deliberate port) | **ALIVE** — strongest correspondence found. The 0.1775 fitness number from a live ILP-miner run is a genuine instance of this proven notion |
| Conformance precision | No `def`/`theorem` for precision anywhere in reviewed Lean files | `wasm4pm/src/etconformance_precision.rs` computes a real weighted escaping-edges formula | **UNSUPPORTED on the Lean side** — Rust is ahead; mfact would need to formalize this to catch up |
| POWL / process-tree Crown bridge | `mfw/.../POWLBridge.lean` proven but fully abstract (no POWL operators at all); `mfact/.../Powl.lean` proven and POWL-concrete, but the two repos don't reference each other | `wasm4pm/src/process_tree.rs`'s `Loop` arity is only a `debug_assert!`, not a type invariant | **UNCONNECTED** — no file anywhere instantiates either Lean theorem against wasm4pm's real `ProcessTree` type. Three-way work needed: mfw must concretize its abstraction, wasm4pm must make `Loop` binary by construction, and mfw/mfact must reconcile their two independent POWL definitions |
| OCEL | `Ocel/Core.lean` proven, no sorry | `wasm4pm/src/models.rs`'s `OCELEvent` — structurally isomorphic for qualified E2O; adds a legacy unqualified `object_ids` track Lean doesn't model | **PARTIAL** — no correctness bug, just superset-vs-subset scope |
| DECLARE | `Models/Declare.lean` proves 7 templates, no sorry | `wasm4pm/src/declare_conformance.rs` implements 5; `Succession`/`NotCoExistence` fall through to `_ => false` | **Real correctness bug, confirmed reachable**: `discovery.rs`'s `discover_declare` actually constructs both constraint kinds and feeds them into the checker via the `wasm_bindgen` path. A normal mine→check run silently reports these as always-satisfied. Existing tests don't exercise this path despite claiming full template coverage. Fix identified: `Succession = Response ∧ Precedence`, `NotCoExistence = ¬(∃a ∧ ∃b)` per `Declare.lean:67-68`, reusing logic already inline in the same file |
| Causal nets / binding functions | `Models/CausalNet.lean` proves full XOR/AND binding-function structure with signed ℚ dependency measure | `wasm4pm/src/advanced_algorithms.rs::classify_heuristic_splits_joins` does real per-node AND/XOR classification (tested), but only a single tag per node, not full binding sets; unsigned `f64` scores, no proof obligations | **PARTIAL** (corrected from an initial UNSUPPORTED verdict after a lumen-based re-search found the classifier) — formal-equivalence gap to Lean's proven binding-set structure remains open |

## Bugs found during this audit (not fixed in this pass — doc/receipt only)

1. `declare_conformance.rs` silently reports Succession/NotCoExistence constraints as always-satisfied; reachable through the real discovery pipeline.
2. `pnpm test`'s root scripts recursively invoke each other and never run a real test.
3. `pnpm build` fails immediately on `examples/web-dashboard`'s missing `src/main.js`.
4. `session::tests::refuses_tampered_state_hash` in `wasm4pm-cognition` asserts the wrong error variant.
5. The `aco` mining bridge produces a degenerate empty-DFG result on at least one real log.

## What did not need to change

`crates/wasm4pm-cognition/breeds/registry.json`, `registration.rs`, `breed-ids.ts`, and every other ggen-rendered surface are correct as checked in — the problem is regeneration tooling version drift, not the artifacts themselves. Do not hand-edit these while sync is BLOCKED; wait for a ggen-side fix to `QuerySource::Pack` support in the declarative-rules sync path.
