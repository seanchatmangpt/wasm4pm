# 03 — WF-net / Petri-net Primitive + Formal Soundness

## Mission
Make Petri/WF-net compatibility the formal execution substrate. Provide the
formal structural and behavioural primitives — places, transitions, arcs,
markings, reachability graph, **soundness**, free-choice / state-machine /
marked-graph predicates, PNML import/export — grounded in the math of the
*Separable Workflow-Nets* paper, not in ad-hoc heuristics.

## Paper grounding
Kourani, Park & van der Aalst, **"Hierarchical Decomposition of Separable
Workflow-Nets"** (arXiv:2602.15739v3), Section 3 *Preliminaries*. Each primitive
maps to a numbered definition; the test oracle is the definition, so no test
derives its expected value from the implementation (no FM-5 self-reference).

| Paper object | Definition | Implemented as |
|---|---|---|
| Petri net `N=(P,T,F)`, pre-set `•x`, post-set `x•` | Def 3.1 | `StructuralNet::from_petri_net`, `t_pre`/`t_post`/`p_pre`/`p_post` |
| Workflow net (unique source, unique sink, connectivity) | Def 3.3 | `StructuralNet::is_workflow_net` → `WfNetCheck` |
| Free-choiceness `(•t1 ∩ •t2 ≠ ∅) ⇒ (•t1 = •t2)` | Def 3.4 | `StructuralNet::is_free_choice` |
| Soundness (no dead transitions, option to complete, proper completion) | Def 3.5 | `StructuralNet::check_soundness` → `SoundnessReport` |
| State machine `|•t|≤1 ∧ |t•|≤1` | Def 3.10 | `StructuralNet::is_state_machine` |
| Marked graph `|•p|≤1 ∧ |p•|≤1` | Def 3.11 | `StructuralNet::is_marked_graph` |
| Separable WF-net (recursive SM/MG substitution) | Def 3.12–3.13 | *out of scope here* — separability classification is the POWL↔WF-net agent's primitive; this module supplies the SM/MG/free-choice/soundness predicates it builds on, and exercises a Fig.2 fixture (free-choice & sound but NOT separable). |

The token semantics follow the paper exactly (Section 3.2): the flow relation
`F` is **unweighted** (an ordinary Petri net, not a P/T net), a transition is
*enabled* when each input place holds ≥1 token, firing consumes one token per
`•t` place and produces one per `t•` place, and a net is *safe* when no place
ever holds more than one token.

## Files
- `wasm4pm/src/soundness.rs` — **new** module: `StructuralNet`, `Marking`,
  `ReachabilityGraph`, `WfNetCheck`, `SoundnessReport`, `analyze_petri_net`,
  WASM export `check_wf_net_soundness`, native bridge `check_wf_net_soundness_native`.
- `wasm4pm/src/models.rs` — existing `PetriNet`/`PetriNetPlace`/`PetriNetTransition`/
  `PetriNetArc` (the substrate `StructuralNet` normalises). Consumed by `soundness.rs`.
- `wasm4pm/src/lib.rs` — minimal additive `pub mod soundness;` declaration.
- `wasm4pm/src/pnml_io.rs` — existing PNML import (`from_pnml`) / export (`to_pnml`)
  with WASM wrappers `from_pnml_wasm` / `to_pnml_wasm`.
- `wasm4pm/tests/wf_soundness.rs` — **new** integration tests (this agent).

## What is implemented

### Structural view — `StructuralNet` (Def 3.1)
`PetriNet` stores arcs as `(from, to)` string-id pairs without recording whether
each endpoint is a place or a transition. `StructuralNet::from_petri_net`
resolves that once into integer-indexed pre-/post-sets:
- `t_pre[t]` = `•t` (input place indices), `t_post[t]` = `t•` (output place indices),
- `p_pre[p]` = `•p` (input transition indices), `p_post[p]` = `p•` (output transition indices).

Place→place / transition→transition arcs (which violate bipartiteness) and arcs
referencing unknown ids are dropped; the structural predicates then reflect the
resulting structure rather than panicking.

### WF-net structure — `is_workflow_net` (Def 3.3)
Verifies (i) a unique source place `•p=∅`, (ii) a unique sink place `p•=∅`, and
(iii) connectivity: every node lies on a directed source→sink path. Connectivity
is decided by a forward flood from the source and a backward flood from the sink
over the bipartite flow relation; a node qualifies iff it is in both sets.

### Free-choiceness — `is_free_choice` (Def 3.4)
Pairwise check of the contrapositive: if two transitions share an input place but
have different pre-sets, the net is not free-choice. Exact for the definition.

### State machine / marked graph — `is_state_machine`, `is_marked_graph` (Defs 3.10, 3.11)
Direct degree-bound predicates over the resolved pre-/post-sets. A pure sequence
satisfies both (SM/MG duality); an exclusive choice is an SM but not an MG; an
AND-split/join is an MG but not an SM.

### Reachability graph — `reachability_graph`
Bounded BFS from `[N_source]` (one token in the source place). Records every
distinct reachable marking, the `(transition, target)` edges, the first **unsafe**
marking found (a place > 1 token), and whether exploration hit the
`MAX_REACHABLE_MARKINGS = 100_000` bound (`truncated`). This is the shared engine
for soundness.

### Soundness — `check_soundness` (Def 3.5) + safeness (Section 3.2)
A WF-net is sound iff all three hold; the report also records safeness and the
structural class:
1. **No dead transitions** — every `t` is enabled at some reachable marking
   (`dead_transitions` names the offenders).
2. **Option to complete** — `[N_sink]` is reachable from every reachable marking.
   Computed by reverse BFS from `[N_sink]` over the reachability-graph edges;
   markings that cannot reach `[N_sink]` are reported as `deadlock_markings`.
3. **Proper completion** — `[N_sink]` is the *only* reachable marking holding a
   token in the sink place (`improper_markings` names violators).

`SoundnessReport::is_sound_and_safe()` is the precise class the paper's
translation targets (Section 4: "safe and sound WF-nets").

### PNML round-trip (C5)
PNML import (`from_pnml`) and export (`to_pnml`) already exist in
`wasm4pm/src/pnml_io.rs` with WASM wrappers. A sound/unsafe PNML round-trip test
is owned by the conformance/PNML agent (A5/A6 reconciliation, delta C5); the
soundness module consumes the resulting `PetriNet` unchanged.

## Reachable surface
- **Rust:** `wasm4pm::soundness::analyze_petri_net(&PetriNet) -> SoundnessReport`
  and all `StructuralNet` predicates are `pub`.
- **WASM:** `check_wf_net_soundness(petri_net_handle: &str) -> Result<JsValue, JsValue>`
  (`#[wasm_bindgen]`, compiled for `wasm32`), returning a fixed JSON summary.
- **Native test bridge:** `check_wf_net_soundness_native(&PetriNet) -> String`
  returns the *identical* JSON so the wire contract is tested under `cargo test`.

## Tests — `wasm4pm/tests/wf_soundness.rs`
All grounded in the paper definition named in the test:

| Test | Checks |
|---|---|
| `def_3_3_seq_is_workflow_net` | unique source/sink + connectivity (Def 3.3, positive) |
| `def_3_3_two_sinks_is_not_workflow_net` | two sink places ⇒ not a WF-net (negative) |
| `def_3_10_state_machine_predicate` | SM bounds: choice/sequence yes, AND-fork no (Def 3.10) |
| `def_3_11_marked_graph_predicate` | MG bounds: concurrent/sequence yes, choice no (Def 3.11) |
| `def_3_10_3_11_duality_on_sequence` | a pure sequence is both SM and MG |
| `def_3_4_free_choice_positive` | SM and MG fixtures are free-choice (Def 3.4) |
| `def_3_4_free_choice_negative` | shared input place with differing pre-sets is not free-choice |
| `fig2_is_free_choice_but_not_separable` | Fig.2 net is free-choice (paper caption) |
| `def_3_5_sequence_is_sound_and_safe` | A→B sequence sound + safe; 3 reachable markings |
| `def_3_5_choice_is_sound_and_safe` | exclusive choice sound + safe; 2 markings |
| `def_3_5_concurrent_is_sound_and_safe` | AND-split/join (marked graph) sound + safe |
| `def_3_5_unsafe_net_is_unsound` | place accumulates 2 tokens ⇒ unsafe + improper ⇒ unsound |
| `def_3_5_dead_transition_net_is_unsound` | `tDead` never enabled ⇒ unsound; report names `Dead` |
| `def_3_5_deadlock_net_has_no_option_to_complete` | mis-sync deadlock; `[pC,pD]` reported as witness |
| `fig2_net_is_sound` | paper Fig.2 is a sound free-choice WF-net |
| `json_contract_reports_all_fields` | WASM/native JSON contract has every field; sound-net booleans |
| `json_contract_negative_names_the_dead_transition` | JSON negative path names `Dead` + refusal reason |

### Fixtures (positive / negative nets)
- `seq_sound_net` — A→B sequence (sound, safe, SM ∧ MG).
- `choice_sound_net` — exclusive choice (sound, safe, state machine).
- `concurrent_sound_net` — AND-split/join (sound, safe, marked graph).
- `unsafe_net` — a place reaches 2 tokens (unsafe + improper completion).
- `dead_transition_net` — structurally valid WF-net with a never-enabled transition.
- `non_free_choice_net` — shared input place with differing pre-sets (Def 3.4 violated).
- `fig2_non_separable_net` — paper Fig.2: free-choice & sound but **not** separable
  (the `e`-split / `d`-join TP-handle cross-link).

## Verification
```
cargo test --test wf_soundness                                  # 17 passed; 0 failed
cargo check -p wasm4pm                                          # lib (native) OK
cargo check -p wasm4pm --target wasm32-unknown-unknown --lib    # WASM export OK
```

## Status
Implemented. Reachability-graph–driven soundness (Def 3.5), free-choice (Def 3.4),
state-machine (Def 3.10) and marked-graph (Def 3.11) predicates, WF-net structure
(Def 3.3), safeness, positive/negative fixtures, and a reachable `#[wasm_bindgen]`
export are in place and tested against the paper math.
