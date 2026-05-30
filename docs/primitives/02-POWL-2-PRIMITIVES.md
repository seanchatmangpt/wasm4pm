# 02 — POWL 2.0 Primitive + WF-net → POWL Translation

## Mission
Center POWL 2.0 as the lawful route model and make the **inverse transformation**
(WF-net → POWL) a real, paper-grounded primitive. Given a safe + sound WF-net,
recursively decompose it into an equivalent POWL 2.0 model built from **partial
orders** (concurrency / causal dependencies) and **choice graphs** (generalized
decisions and cycles), preserving the net's language. Prove language preservation
by round-trip on the separable fixtures A5 proves sound + safe.

## Paper grounding
Kourani, Park & van der Aalst, **"Hierarchical Decomposition of Separable
Workflow-Nets"** (arXiv:2602.15739v3), **Section 4** (the algorithm) and
**Section 5** (correctness: language preservation / completeness). Every step
maps to a numbered definition or algorithm; the test oracle is the math, not the
implementation (no FM-5 self-reference). The round-trip oracle compares two
*independently computed* languages.

| Paper object | Definition / Algorithm | Implemented as |
|---|---|---|
| POWL 2.0 model `t \| ≺(ψ₁..ψₙ) \| γ(ψ₁..ψₙ)` | Def 3.7 | `PowlSpec` (`Transition`/`Silent`/`PartialOrder`/`ChoiceGraph`/`Irreducible`) |
| Choice graph `γ=(N,E)` | Def 3.6 | `PowlSpec::ChoiceGraph { children, edges, start, end }` |
| Order-preserving shuffle `⧢_≺` | Def 3.8 | `order_preserving_shuffle` (+ `cartesian`, `interleave`) |
| POWL 2.0 semantics / language `L(·)` | Def 3.9 | `powl_language` |
| State machine / marked graph | Def 3.10 / 3.11 | (consumed via A5 `StructuralNet` predicates) |
| Substitutive composition, separable WF-net | Def 3.12 / 3.13 | the recursive structure `convert_net` produces; round-trip-tested |
| Conflict-hiding partition (`Partition_MG`) | Def 4.1 / Algorithm 1 | `partition_mg` + `is_conflict_hiding` |
| Entry / exit points `▷T'`, `T'▷`; place equiv `≈_{T'}` | p.14 notation | `entry_points`, `exit_points`, `place_equiv_wrt` |
| Partial-order projection `Project_MG`, `Normalize` | Def 4.2 | `project_part` + `normalize` |
| Execution order `order⁺(N,G)` | Def 4.3 | `execution_order` (transitively closed) |
| Concurrency-hiding partition (`Partition_SM`) | Def 4.4 / Algorithm 2 | `partition_sm` + `is_concurrency_hiding` |
| Forward / backward restricted reachability | Def 4.5 / 4.6 | `forward_restricted_reachability` / `backward_restricted_reachability` |
| Choice-graph projection `Project_SM` | Def 4.7 | `project_part` + `normalize` |
| Execution flow `flow(N,G)` | Def 4.8 | `execution_flow` |
| `ConvertNetToPOWL` (base / MG / SM / fall-through) | Algorithm 3 | `convert_net` |
| Language preservation | Theorem 1 (Section 5) | `powl_language` vs `wf_net_language` round-trip gate |

Token semantics follow A5 / the paper exactly (Section 3.2): unweighted flow,
enabled when each input place holds ≥1 token, safe = never >1 token. The
translation targets the **safe and sound** class (`SoundnessReport::is_sound_and_safe`).

## Files
- `wasm4pm/src/wf_to_powl.rs` — **new** module (this agent): `PowlSpec`,
  `WfToPowlResult`, the partition/projection/order/flow primitives, `convert_net`
  (Algorithm 3), `powl_language` (Def 3.9), `wf_net_language` (reachability
  replay), WASM export `wf_net_to_powl`, native shim `wf_net_to_powl_native`.
- `wasm4pm/src/lib.rs` — minimal additive `pub mod wf_to_powl;` declaration.
- `wasm4pm/src/soundness.rs` — A5's module, **consumed unchanged**: `StructuralNet`
  supplies the bipartite pre-/post-set resolution and the WF-net structural check
  that `WorkNet::from_petri_net` builds on.
- `wasm4pm/src/powl_arena.rs` / `powl_models.rs` — existing in-memory POWL arena
  (`PowlArena`, `BinaryRelation`, `ChoiceGraph` node) — the live POWL model store
  the route catalog uses; `PowlSpec` is the serializable conversion artifact that
  maps onto the same POWL 2.0 grammar.
- `wasm4pm/tests/wf_to_powl.rs` — **new** Chicago-TDD integration tests (this agent).

## The algorithm (Algorithm 3, `ConvertNetToPOWL`)

`convert_net(net, depth)` mirrors the paper's recursion:

1. **Base case** (line 2) — `|T|=1`, `|P|=2`, `F={(src,t),(t,sink)}` → a single
   `PowlSpec::Transition` (or `Silent` for τ).
2. **Marked-graph attempt** (lines 5–13) — `partition_mg` (Algorithm 1) merges
   transitions to hide every top-level XOR-split (forward analysis) and XOR-join
   (backward analysis) using the transition-reachability relation `⤳` (Def 3.1).
   The result is validated against Def 4.1 (`is_conflict_hiding`): no place is an
   entry/exit of >1 part (conditions 1–2), and every part's entry/exit places are
   `≈_{T_i}`-equivalent (conditions 3–4, the SESE requirement). Each part is
   projected (`project_part` + `normalize`, Def 4.2), recursed, and assembled
   into a `PartialOrder` with `order⁺(N,G)` (Def 4.3, transitively closed).
3. **State-machine attempt** (lines 14–23) — `partition_sm` (Algorithm 2) merges
   transitions to hide every AND-split / AND-join via forward / backward
   *restricted* reachability (Defs 4.5 / 4.6, stopping at the split/join). The
   result is validated against Def 4.4 (`is_concurrency_hiding`: `|▷T_i|=1 ∧
   |T_i▷|=1`). Each part is projected (Def 4.7), recursed, and assembled into a
   `ChoiceGraph` with `flow(N,G)` (Def 4.8: edges between parts sharing a place,
   plus `start→i` for the source-entry parts and `i→end` for the sink-exit parts).
4. **Fall-through** (line 25) — neither a base case nor a lawful partition: the
   net is outside the separable class (Def 3.13) at this level; return a
   `PowlSpec::Irreducible` leaf carrying the failing transition labels (Section 4.4
   "conversion failure"). `WfToPowlResult.converted = false` and the reason cites
   the separability violation — the lawful refusal (analogous to an AndonPull).

### Language-preservation validity gate (the key correctness mechanism)
Algorithm 3 line 7/17 demands "structural progress" (`∄ T_i: Project(N,T_i) ≅ N`).
We enforce the **stronger, defining** criterion directly: a candidate assembly is
accepted only if its language equals the current net's language
(`language_matches`, Theorem 1). Both languages are computed independently —
`powl_language` from the POWL 2.0 grammar (Def 3.8/3.9) and `WorkNet::language`
from the Petri-net firing semantics — so the comparison is a genuine cross-check,
not a re-statement of the code. For a separable net the structurally-valid
partition always preserves the language (paper completeness §5.4); for a
non-separable net a structural partition may exist but its `order`/`flow` assembly
has a *different* language — exactly what the gate rejects, forcing the lawful
fall-through.

### Refinement over the paper's structural-only algorithm
The paper proves *structural* completeness on the separable class (Def 3.13).
Separability is a structural property, **not** a language one. Paper **Fig.2** is
structurally non-separable (it has a TP-handle), yet its language
`{⟨a,c,e,b,d,f⟩, ⟨a,e,c,b,d,f⟩, ⟨a,e,b,c,d,f⟩}` *is* a plain partial order and so
IS expressible in POWL 2.0. Our language-preservation gate therefore accepts a
language-equivalent partial order for Fig.2 — a result *stronger* than the strict
structural algorithm (which would fall-through). The gate admits exactly the nets
whose **language** is POWL-expressible, which is the correct admission rule. The
genuine refusal case is a net whose *language* cannot be a POWL 2.0 model — e.g. a
**long-term dependency** (`a` forces `d`, `b` forces `e` across a shared middle
`c`): language `{⟨a,c,d⟩, ⟨b,c,e⟩}`, which excludes `⟨a,c,e⟩`/`⟨b,c,d⟩` and so is
neither a partial order nor a clean choice-graph composition → fall-through.

## Reachable surface
- **Rust:** `wasm4pm::wf_to_powl::wf_net_to_powl_spec(&PetriNet) -> WfToPowlResult`;
  `powl_language(&PowlSpec)` and `wf_net_language(&PetriNet)` are `pub`.
- **WASM:** `wf_net_to_powl(petri_net_handle: &str) -> Result<JsValue, JsValue>`
  (`#[wasm_bindgen]`, compiled for `wasm32`), returns the fixed JSON summary
  `{ is_wf_net, converted, powl, repr, reason }` (the `powl` field is the tagged
  `PowlSpec` tree). Takes a stored `PetriNet` handle — the same handle surface A5's
  `check_wf_net_soundness` uses.
- **Native test shim:** `wf_net_to_powl_native(&PetriNet) -> String` returns the
  *identical* JSON, so the wire contract is exercised under `cargo test`.

## Tests — `wasm4pm/tests/wf_to_powl.rs`
All grounded in the paper definition / theorem named in the test. The fixtures
reuse the *same separable WF-nets* A5's soundness suite proves sound + safe.

| Test | Oracle |
|---|---|
| `alg3_base_case_single_visible_transition` | Algorithm 3 base case → single `Transition`; `L` equal both sides |
| `theorem1_sequence_language_preserved` | A→B sequence; `L(POWL)=L(WF)={⟨A,B⟩}`; top is a partial order |
| `theorem1_exclusive_choice_language_preserved` | choice; `L={⟨A⟩,⟨B⟩}`; top is a choice graph (Def 4.8) |
| `theorem1_concurrency_language_preserved` | AND-split/join; `L` = both interleavings of A,B; top is a partial order |
| `theorem1_nested_sequence_of_choice_language_preserved` | choice nested in a sequence (Def 3.12 substitution); choice graph surfaces inside |
| `theorem1_nested_concurrency_in_choice_language_preserved` | concurrency nested in a choice branch; top is a choice graph |
| `fig2_structurally_non_separable_but_language_is_powl_expressible` | Fig.2: non-separable structurally, but `L(POWL)=L(WF)` (gate refinement) |
| `def_4_3_partial_order_carries_transitive_order` | A→B→C; single sequence language; top partial order (`order⁺`) |
| `section_4_4_long_term_dependency_falls_through` | long-term dependency: sound + safe, but `L` non-POWL-expressible ⇒ `converted=false`, `Irreducible`, reason cites separability |
| `non_wf_net_is_refused_with_reason` | two sinks (Def 3.3 violated) ⇒ `is_wf_net=false`, reason explains the refusal |
| `json_contract_reports_all_fields_positive` | WASM/native JSON has every field; positive verdict; `powl.kind="partial_order"` |
| `json_contract_negative_reports_fall_through` | negative path JSON: `converted=false`, `powl.kind="irreducible"`, separability reason |
| `def_3_8_order_preserving_shuffle_matches_paper_example` | the `⧢_≺` oracle reproduces the paper's worked example (Def 3.8) verbatim |
| `def_3_9_silent_transition_emits_empty_sequence` | `L(t)={⟨⟩}` for `l(t)=τ` (Def 3.9) |

### Fixtures
- `seq_sound_net`, `choice_sound_net`, `concurrent_sound_net` — A5's separable
  positives (sound + safe), reused as round-trip targets.
- nested fixtures — choice-in-sequence and concurrency-in-choice (Def 3.12).
- `fig2_net` — paper Fig.2 (structurally non-separable, language-expressible).
- `long_term_dependency_net` — Fig.7a-class: sound + safe, **non-POWL-expressible**
  language (the genuine negative / fall-through case).

## Verification
```
cargo test --test wf_to_powl                                   # 14 passed; 0 failed
cargo test --test wf_soundness                                 # 17 passed; 0 failed (A5, unaffected)
cargo test -p wasm4pm --lib wf_to_powl                         # 3 inline unit tests
cargo clippy -p wasm4pm --lib                                  # no wf_to_powl warnings
cargo check -p wasm4pm --target wasm32-unknown-unknown --lib   # WASM export OK
```

## Forward conversions (reconciliation delta C1 — not in this agent's scope)
The DAG's `↔` and the tree projection require the **forward** `powl_to_wf_net` and
`powl_to_process_tree` conversions. The repository already ships
`wasm4pm/src/powl_petri_net.rs` (POWL→Petri) and `wasm4pm/src/powl_to_process_tree.rs`
(POWL→process tree); wiring a *both-directions* round-trip language-preservation
test on A5's separable fixtures is the C1 reconciliation task. This agent supplies
the reverse direction (`wf_net_to_powl`) and the `powl_language` / `wf_net_language`
oracles those round-trip tests can reuse.

## Status
Implemented. WF-net → POWL 2.0 (Algorithm 3) via conflict-hiding (`Partition_MG`,
Def 4.1/Alg 1) and concurrency-hiding (`Partition_SM`, Def 4.4/Alg 2) partitions,
partial-order (`order⁺`, Def 4.3) and choice-graph (`flow`, Def 4.8) assembly,
projection + normalization (Defs 4.2/4.7), a language-preservation validity gate
(Theorem 1), a reachable `#[wasm_bindgen]` export, and positive/negative fixtures
proven by independent round-trip language equality. 14/14 integration tests pass;
A5's 17 soundness tests are unaffected.
