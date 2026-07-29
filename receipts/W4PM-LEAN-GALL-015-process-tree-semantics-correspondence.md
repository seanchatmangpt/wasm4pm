---
receipt: W4PM-LEAN-GALL-015
date: 2026-07-29
status: ALIVE
gate: POWL/process-tree semantics correspondence (proof-dependency program, checkpoint 015/020)
git_revision: 8d11cbd60
predecessor: W4PM-LEAN-GALL-014 (receipts/W4PM-LEAN-GALL-014-declare-semantics-correspondence.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 015 — POWL/Process-Tree Semantics Correspondence

Flagged in advance (013's closing summary) as the largest and most contested checkpoint in
this program, since `W4PM-LEAN-GALL-009` found `mfw` and `mfact` have two independent,
non-agreeing POWL formalizations. This checkpoint resolves the contest by **sidestepping it
entirely**, not by unifying it.

## Why POWL-proper is a dead end this pass — and what isn't

`mfw/mfw-theory/MFW/Crown/POWLBridge.lean`'s "POWL Crown Theorem" is proven but **fully
abstract** — generic over an opaque `WorkflowSpace α` with no real POWL operators anywhere
in the file or its imports; the theorem could be renamed for BPMN or YAWL with no textual
change. `mfact/procint/ProcInt/Models/Powl.lean` has real n-ary operators (`atom/silent/
xor(List)/loop(doP,redoP)/po(List,prec)` with a `WellFormed` side-condition) but **no
`language` function** — no trace semantics proven for it at all, confirmed by direct file
read this checkpoint. Neither is a viable bridge target.

**What is real**: `mfact/procint/ProcInt/Models/ProcessTree.lean` — a *separate* file from
`Powl.lean`, binary constructors (`leaf/silent/seq/xor/par/loop`), with a proven
`ProcessTree.language` trace-semantics function, no `sorry`/`axiom`. This checkpoint bridges
wasm4pm directly to this file, same pattern as 010-014 (bridge to one specific proven Lean
artifact, not an aspirational unification of everything named "process tree").

## Scope: Sequence, ExclusiveChoice, Parallel — binary, acyclic only

wasm4pm's `ProcessTreeOperator` (`process_tree.rs:116-143`) is n-ary at the type level
(`children: Vec<ProcessTree>`) and includes `Loop` and `Or`. This harness restricts to a
purpose-built `RestrictedTree` carrier:
- **Binary only** — matching `ProcessTree.lean`'s constructors exactly. No n-ary
  desugaring built this pass (would need its own associativity/language-preservation
  proof, deferred to 015B).
- **`Or`-free, confirmed dead code** — a prior exploration this checkpoint found zero real
  call sites of `ProcessTree::or(...)` outside `process_tree.rs` itself and its own unit
  test; `inductive_miner_recursive` and the POWL↔ProcessTree conversion bridges
  (`powl/conversion/{to,from}_process_tree.rs`) never construct `Or`. Not merely
  inconvenient to exclude — genuinely unused by any real discovery/conversion path.
- **`Loop`-free** — `LoopLang`'s trace language (body, then zero-or-more `(redo++body)`
  rounds) is genuinely infinite for nontrivial body/redo. The governing program explicitly
  requires bisimulation or automata-language equivalence for cyclic structures, not a
  bounded trace sample — exhaustive finite-trace enumeration cannot honestly cover this.
  Deferred to 015B.

## Lean side (quoted exactly, re-confirmed live)
`mfact/procint/ProcInt/Models/ProcessTree.lean` (`content_sha256`
`00c76db7a3391ccf0dc5eb1346f29dd6e2e097564e8f549d22453348839935e0`) — no `sorry`/`axiom`:
```lean
def interleavings {α} : List α → List α → List (List α)
  | [], ys => [ys]
  | xs, [] => [xs]
  | x :: xs, y :: ys =>
      ((interleavings xs (y :: ys)).map (fun w => x :: w)) ++
      ((interleavings (x :: xs) ys).map (fun w => y :: w))
def seqLang {α} (A B : Set (List α)) : Set (List α) := setOf (fun w => ∃ u ∈ A, ∃ v ∈ B, w = u ++ v)
def ProcessTree.language : ProcessTree α → Set (List α)
  | .leaf a => {[a]}
  | .seq l r => seqLang l.language r.language
  | .xor l r => l.language ∪ r.language
  | .par l r => setOf (fun w => ∃ u ∈ l.language, ∃ v ∈ r.language, w ∈ interleavings u v)
```

## Method: exhaustive trace-language enumeration, not sampling
Per the program's own requirement. All `RestrictedTree` shapes up to 3 leaves, 2-symbol
alphabet, Seq/Xor/Par at every internal node: **158 distinct trees enumerated**, full
trace-language set equality checked per tree (not a bounded trace sample), 0 disagreements.

## Positive witnesses & negative falsifier
- `sequence_is_concatenation`, `exclusive_choice_is_union`, `parallel_is_all_interleavings`
  — direct confirmations of each operator's semantics on minimal 2-leaf trees.
- `exhaustive_small_trees_all_agree` — the exhaustive check: 158 trees, 0 disagreements.
- `wrong_language_is_caught` — asserts sequence is genuinely non-commutative (unlike
  xor/par), proving the differential distinguishes formula families, not just checks any
  set-equality.
- `lean_file_hash_matches_citation` — staleness detection.

## Full command output
```
running 6 tests
test correspondence::process_tree_semantics::tests::parallel_is_all_interleavings ... ok
test correspondence::process_tree_semantics::tests::wrong_language_is_caught ... ok
test correspondence::process_tree_semantics::tests::exclusive_choice_is_union ... ok
test correspondence::process_tree_semantics::tests::sequence_is_concatenation ... ok
exhaustive_small_trees_all_agree: checked 158 trees (MAX_LEAVES=3)
test correspondence::process_tree_semantics::tests::exhaustive_small_trees_all_agree ... ok
test correspondence::process_tree_semantics::tests::lean_file_hash_matches_citation ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 989 filtered out; finished in 0.02s
```
Full crate-wide `cargo test`: **2289 passed, 0 failed** (up from 2283 pre-harness — the +6
new correspondence tests, no other change).

## Evidence class achieved
`carrier_mapped_formula_correspondence (exhaustive_acyclic_language_domain)` — a new
qualifier distinct from every prior checkpoint's, reflecting full trace-language set
equality over an exhaustively-enumerated acyclic domain (stronger evidence per tree than
010's example cases, differently structured from 011's single-firing-step exhaustion or
014's fixed six-evidence-type domain).

## Explicit scope boundary
This checkpoint does **not** cover: `Loop` (cyclic, genuinely infinite language, deferred
to 015B pending a bisimulation/automata-equivalence approach); `Or` (dead code, no Lean
counterpart); n-ary trees (no desugaring built — real wasm4pm discovery output with 3+
children per node is untested against this harness); `mfact/Models/Powl.lean`'s partial
orders, choice graphs, transitive reduction, normalization, or Petri-net conversion (none
proven with a trace semantics in mfact at all, let alone bridged); `mfw`'s POWLBridge.lean
(sidestepped — its abstraction makes it inapplicable to any concrete bridge); an encoder
from wasm4pm's real `ProcessTree` type to this checkpoint's `RestrictedTree` carrier (not
built — this harness exercises the restricted carrier directly, not real discovery output).

## Live Re-verification (W4PM-LEAN-GALL-022)

Performed against the now-working mfact toolchain (checkpoint 023 confirmed `lake exe cache
get` fetches prebuilt Mathlib oleans).

**Hash check** — `shasum -a 256 procint/ProcInt/Models/ProcessTree.lean` in `/Users/sac/mfact`:
```
00c76db7a3391ccf0dc5eb1346f29dd6e2e097564e8f549d22453348839935e0  procint/ProcInt/Models/ProcessTree.lean
```
Matches `LEAN_PROCESS_TREE_FILE_SHA256` in
`wasm4pm/wasm4pm/src/correspondence/process_tree_semantics.rs` exactly — **MATCH**, file
untouched since original citation.

**Cache**: `cd /Users/sac/mfact && lake exe cache get` → `Completed successfully in 32296 ms!`
(8538 already-cached files decompressed, no downloads needed; shared run with checkpoint 014).

**Build**: `cd /Users/sac/mfact/procint && lake build ProcInt.Models.ProcessTree`:
```
Build completed successfully (8558 jobs).
```
(no new files rebuilt — already up to date from the Declare.lean build moments earlier, both
under the same `ProcInt` root).

**Axiom check** on the theorems this checkpoint's bridge cites (`ProcessTree.language`'s
defining equations plus the concrete lemmas about it; actual namespace is `ProcInt`, e.g.
`ProcInt.ProcessTree.language_leaf_silent`, confirmed via `namespace ProcInt` at line 10 of
the Lean file):
```
'ProcInt.ProcessTree.language_leaf_silent' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.ProcessTree.mem_language_seq_leaf' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.ProcessTree.language_seq_assoc' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.length_of_mem_interleavings' depends on axioms: [propext, Classical.choice, Quot.sound]
```
No `sorryAx` on any of the four — only standard Lean/Mathlib axioms (`propext`,
`Classical.choice`, `Quot.sound`, expected for `Set`-valued definitions). `grep -n
"sorry\|axiom" ProcessTree.lean` also returns no matches.

## Standing
`ALIVE` — hash matched, `lake build ProcInt.Models.ProcessTree` succeeded from a real working
toolchain, and `#print axioms` on `ProcessTree.language`'s key lemmas shows no `sorryAx`
dependency. The POWL-vs-ProcessTree scoping decision and all explicit-scope-boundary
exclusions above remain unchanged by this gate — this closes only the "is the Lean side
kernel-checked" question, not the scope questions.
