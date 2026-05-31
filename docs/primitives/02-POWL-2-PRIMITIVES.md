# Agent 3 — POWL 2.0 Primitive Agent

## Mission
Center POWL 2.0 as the lawful route model. Build or harden primitives for partial order,
choice graph, POWL → process tree, POWL → Petri net, POWL validation.

## Status
Implemented. The POWL module (`wasm4pm/src/powl/`) is the most structurally complete
primitive family: parse, simplify, convert (Petri net, process tree, BPMN, YAWL),
discover (from DFG, OCEL, partial orders), conform (token replay, soundness, footprints),
and visualize (SVG). `wf_to_powl.rs` is **not present** (planned — see Planned section).

---

## Paper / Specification Grounding

- **Kourani & van der Aalst, "POWL: Partially Ordered Workflow Language"**, ATAED 2023.
- **Kourani & van der Aalst, "POWL 2.0: Choice Graphs and Frequent Transitions"**,
  CEUR-WS vol. 3783 (2024). Definition 5 (MineDG) is the correctness oracle.
- **van der Aalst, "Process Mining: Data Science in Action"** (2016), Ch. 6 — process trees.
- **Sadl, "The YAWL Language"** (2005) — for YAWL export.

---

## Implementation Files

### Core model

| File | Role |
|---|---|
| `wasm4pm/src/powl_arena.rs` | Arena allocator for POWL nodes (avoids cyclic references) |
| `wasm4pm/src/powl_models.rs` | `PowlModel`, `PowlPetriNet`, `PowlProcessTree`, `PowlCounts` |
| `wasm4pm/src/powl_parser.rs` | Textual POWL syntax → `PowlArena` |
| `wasm4pm/src/powl_api.rs` | All `#[wasm_bindgen]` exports (15 functions) |

### Sub-modules (`wasm4pm/src/powl/`)

| Sub-path | Role |
|---|---|
| `discovery/from_dfg.rs` | Inductive-POWL cut discovery from DFG |
| `discovery/from_partial_orders.rs` | Partial-order variant discovery |
| `discovery/ocel.rs` | POWL discovery from OCEL via OC-DFG |
| `discovery/choice_graph.rs` | Choice graph (MineDG Definition 5) |
| `discovery/cuts.rs` | Sequence, XOR, AND, loop cut detection |
| `conversion/to_petri_net.rs` | POWL → `PowlPetriNet` (recursive translation) |
| `conversion/to_process_tree.rs` | POWL → `PowlProcessTree` |
| `conversion/from_petri_net.rs` | `PetriNet` → POWL |
| `conversion/to_bpmn.rs` | POWL → BPMN XML |
| `conversion/to_yawl.rs` | POWL → YAWL XML |
| `conformance/soundness.rs` | WF-net soundness (deadlock-free, bounded, proper completion) |
| `conformance/dg_soundness.rs` | Choice-graph soundness check |
| `conformance/token_replay.rs` | POWL-native token replay fitness |
| `conformance/footprints_conf.rs` | Footprint-based precision |
| `simplify.rs` | Redundant-arc elimination, silent-transition removal |
| `transitive.rs` | Transitive closure / reduction utilities |
| `footprints.rs` | Activity footprint matrix computation |
| `label_replacing.rs` | Activity label substitution |
| `visualization/process_tree_svg.rs` | SVG renderer for POWL process trees |

---

## WASM Exports (from `powl_api.rs`)

| Export | Purpose |
|---|---|
| `parse_powl` | Text → `PowlModel` handle |
| `validate_partial_orders` | Check partial-order well-formedness |
| `simplify_powl` | Remove redundant structure |
| `simplify_frequent_transitions` | Collapse frequent-transition wrappers |
| `powl_to_petri_net` | Structural translation to WF-net |
| `powl_to_process_tree` | Structural translation to process tree |
| `process_tree_to_powl` | Inverse translation |
| `petri_net_to_powl` | Import from existing Petri net |
| `powl_to_bpmn` | BPMN XML export |
| `token_replay_fitness` | POWL-native conformance fitness |
| `check_powl_soundness` | WF-net soundness check |
| `get_children`, `node_info_json`, `node_to_string` | Arena introspection |

---

## Test Suite

| Test File | Coverage |
|---|---|
| `wasm4pm/tests/powl_cross_validation.rs` | Loop round-trip, ChoiceGraph nesting, concurrency ordering, XOR precision |
| `wasm4pm/tests/adversarial_powl_tests.rs` | 8 categories (Bellman, SPC, circuit breaker, metamorphic, feature-norm, integration, counterfactual, cycle detection) |
| `wasm4pm/tests/powl_macro_tests.rs` | Macro-level POWL construction helpers |
| `wasm4pm/tests/powl_and_prediction_real_data_tests.rs` | Real XES data: POWL discovery + prediction |
| `wasm4pm/tests/choice_graph_paper.rs` | Definition 5 (MineDG) oracle tests |
| `wasm4pm/tests/minedg_choice_graph_test.rs` | MineDG partition-shrinking metamorphic test |
| `wasm4pm/tests/algorithm_correctness.rs` | Soundness over synthetic WF-nets |

---

## Verification Criteria

1. **Soundness triad** — Every WF-net produced by `powl_to_petri_net` must pass
   `check_soundness`: deadlock-free, bounded, proper completion.
2. **Round-trip identity** — `process_tree_to_powl(powl_to_process_tree(m))` must produce
   a structurally equivalent model (same operator tree, same labels).
3. **MineDG correctness (Rank 1 oracle)** — Definition 5 from POWL 2.0: the choice graph's
   MineDG must satisfy the three necessary conditions (completeness, partition, arcs).
4. **Token replay ≥ 0.85 on synthetic logs** — Any POWL model replayed against the log it
   was discovered from must achieve fitness ≥ 0.85.
5. **Concurrent ordering invariance** — For any POWL model with AND operator `[A ‖ B]`,
   token replay must achieve fitness 1.0 for both `[A, B]` and `[B, A]` orderings.

---

## Key Data Structures

```rust
// wasm4pm/src/powl_models.rs:15
pub struct PowlModel {
    pub arena: PowlArena,  // Arena-allocated tree
    pub root: u32,         // Index into arena
}

// wasm4pm/src/powl_arena.rs — PowlNode variants
pub enum PowlNode {
    Transition(SilentOrLabeled),
    FrequentTransition(FrequentTransitionData),
    PartialOrder { children: Vec<u32>, arcs: Vec<(u32, u32)> },
    Choice(Vec<u32>),
    Loop { do_part: u32, redo_part: u32 },
}

// wasm4pm/src/powl/conformance/soundness.rs:18
pub struct SoundnessResult {
    pub sound: bool,
    pub deadlock_free: bool,
    pub bounded: bool,
    pub liveness: bool,
}
```

---

## Planned / Not Yet Implemented

- **`wasm4pm/src/wf_to_powl.rs`** — Planned file for importing existing WF-nets into POWL
  arena. `from_petri_net.rs` in `powl/conversion/` exists but does not yet have a
  top-level WASM export. Status: Scaffolded.
- **POWL diff** — Structural diff between two POWL models (`powl/analysis/diff.rs` is
  present but the WASM export is not registered in the kernel).
- **POWL complexity metrics** — `powl/analysis/complexity.rs` exists; not yet kernel-registered.
