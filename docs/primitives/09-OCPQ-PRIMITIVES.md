# 09 — OCPQ Runtime Primitive

**Agent:** A3
**Crate:** `crates/ocpq/`
**Paper grounding:** Küsters & van der Aalst, *"OCPQ: Object-Centric Process
Querying & Constraints"* (arXiv:2506.11541v1, 2025) — Definitions 3–9, Fig. 6.
**Built on:** `ocel-core` (A2's OCED `L = (E, O, eval, oaval)`), reusing its
`e2o`, `o2o`, `event_set`, `object_set`, and event `time` surfaces.

> The product is the **process-primitive kernel**; OCPQ is the object-centric
> *query & constraint* primitive that turns "did a lawful object-centric
> pattern hold?" into a counted, deterministic, receipt-able verdict.

---

## 1. What this primitive is

OCPQ is **object-centric process querying**. Unlike flat (case-centric) process
querying, it does **not** assume one case per event. Over an OCED
`L = (E, O, eval, oaval)` it lets you express nested constraints spanning
multiple object and event types — e.g. *"every confirmed order is paid within
4 weeks, exactly once"* — and returns, per object/event combination, whether the
constraint is **satisfied** or **violated**.

A query/constraint is a **query tree** of **binding boxes**. Each box filters
**variable bindings** through **BASIC predicates** (E2O / O2O / TBE). A node's
`constr` predicates (which may include **CHILD SET** cardinality predicates)
split the node's output bindings into satisfied / violated.

---

## 2. Formal map (paper → code)

| Paper object | Definition | Code (`crates/ocpq/src/lib.rs`) |
|---|---|---|
| Variable universes `U_evVar`, `U_obVar` | Def. 1 | `VarKind::{Event,Object}` |
| `Var` (typed var declarations) | Def. 6 | `VarDecl { name, kind, types }` |
| Variable binding `b = b1 ∪ b2` | Def. 3 | `Binding { map: var → id }` |
| Parent-child `p ⊑_L c` | Def. 4 | `Binding::refines` |
| `BASIC_L` predicates | Def. 5 | `BasicPredicate::{E2O, O2O, Tbe}` + `holds` |
| Binding box `b_L = (Var, Pred)` | Def. 6 | `BindingBox { vars, preds }` |
| Output set `out_L(b_L)` | Def. 6 | `BindingBox::output` |
| Box satisfaction `b ⊨ b_L` | Def. 6 | `BindingBox::satisfied_by` |
| Box refinement `a ⪯_L b` | Def. 7 | `BindingBox::refines` |
| Filter-restriction `b_L|_X` | Def. 8 | `BindingBox::restrict_to_basic` |
| Query tree `T = (V, F, r, l, box)` | Def. 9 | `QueryTree { root, nodes }`, `Node`, `Edge` |
| `CHILD SET_u^T (A, n_min, n_max)` | Sect. 4 | `ChildSet { edge, n_min, n_max }` |
| `constr(v)` → satisfied / violated | Fig. 6 | `ConstraintPredicate`, `evaluate_constraint` |

### BASIC predicate semantics (Def. 5, verbatim)

- **E2O** `b ⊨ E2O(v,v',q) ⇔ b(v) ∈ E_L ∧ b(v') ∈ O_L ∧ b(v') ∈ obj_L^q(b(v))`
- **O2O** `b ⊨ O2O(v,v',q) ⇔ b(v) ∈ O_L ∧ b(v') ∈ O_L ∧ b(v') ∈ obj_L^q(b(v))`
- **TBE** `b ⊨ TBE(v,v',tmin,tmax) ⇔ b(v),b(v') ∈ E_L ∧ tmin ≤ time_L(b(v')) − time_L(b(v)) ≤ tmax`

A qualifier of `None` is the paper's `*` (any qualifier). A predicate over an
**unbound** variable is **false** (`⊥` is in no relation; matches the paper's
`b_5 ⊭ s_1` note). TBE durations are seconds; the window is **inclusive**.

### CHILD SET (Sect. 4)

`CHILD SET_u^T (A, n_min, n_max)` holds for a parent binding `b` at node `u`
when the set `S = { x ∈ out_L(box(child_A)) | b ⊑_L x }` has `n_min ≤ |S| ≤ n_max`.
`n_max = None` encodes the unbounded case `n_max = *`.

### Constraint (Fig. 6)

For a node `v` with `constr(v) ⊆ P_L`, each output binding of `box(v)` is
**satisfied** iff *every* predicate in `constr(v)` holds for it, else
**violated**. `evaluate_constraint(tree, log)` returns the root node's
`{ satisfied, violated, verdicts[] }` (the `✓` / `✗` column of Fig. 6).
`evaluate_node_constraint` generalizes to any node id.

---

## 3. Reachable surface

| Leg | Symbol | Status |
|---|---|---|
| **Rust** | `ocpq::{BasicPredicate, Binding, BindingBox, ChildSet, ConstraintPredicate, Edge, Node, QueryTree, VarDecl, VarKind, evaluate_constraint, evaluate_node_constraint, evaluate_query, ocpq_eval_json}` | ✅ |
| **WASM** | `#[wasm_bindgen] ocpq_eval(query_json, ocel_json) -> Result<String, String>` (feature `wasm`) | ✅ builds for `wasm32-unknown-unknown` |
| **CLI** | `wpm` subcommand — *deferred to A9 / reconciliation* (wire `ocpq_eval` into a `wpm ocpq eval` verb). The reachable WASM/Rust entry point is ready; no MCP tool is added (plan constraint). | ⏳ |

`ocpq_eval` / `ocpq_eval_json` take a query-tree JSON and an OCEL JSON, evaluate
the **root** constraint, and return a `ConstraintResult` JSON. Errors surface as
`Err(String)` (no panic across the WASM boundary).

### JSON shapes

Query tree (matches `serde` derives):

```json
{
  "root": "v0",
  "nodes": [
    {
      "id": "v0",
      "box": {
        "vars": [
          {"name": "o1", "kind": "Object", "types": ["orders"]},
          {"name": "e1", "kind": "Event",  "types": ["confirm order"]}
        ],
        "preds": [{"kind": "E2O", "event": "e1", "object": "o1"}]
      },
      "children": [{"label": "A", "child": "v1"}],
      "constr": [{"type": "ChildSet", "edge": "A", "n_min": 1, "n_max": 1}]
    },
    {
      "id": "v1",
      "box": {
        "vars": [
          {"name": "o1", "kind": "Object", "types": ["orders"]},
          {"name": "e1", "kind": "Event",  "types": ["confirm order"]},
          {"name": "e2", "kind": "Event",  "types": ["pay order"]}
        ],
        "preds": [
          {"kind": "E2O", "event": "e1", "object": "o1"},
          {"kind": "E2O", "event": "e2", "object": "o1"},
          {"kind": "Tbe", "from": "e1", "to": "e2", "tmin_secs": 0, "tmax_secs": 2419200}
        ]
      },
      "children": [],
      "constr": []
    }
  ]
}
```

OCEL is the standard `ocel-core::OCEL` JSON (objectTypes/eventTypes/objects/events).

Result:

```json
{ "node": "v0", "satisfied": 1, "violated": 2,
  "verdicts": [ {"binding": {"o1":"o_a","e1":"ev_ca"}, "satisfied": true}, ... ] }
```

---

## 4. ALIVE ledger

```
Primitive:        OCPQ runtime (binding boxes, query trees, BASIC predicates, CHILD SET, constr)
Paper grounding:  Küsters & van der Aalst 2025 — Defs. 3–9, Fig. 6
Artifact:         crates/ocpq/{Cargo.toml, src/lib.rs, tests/ocpq_paper.rs}
                  Cargo.toml (workspace member + workspace dep, additive)
Positive proof:   cargo test -p ocpq  → 16/16 PASS, incl.
                    fig6_paid_within_four_weeks_exactly_once (satisfied=1, violated=2)
                    every_order_confirmed_exactly_once_all_satisfied (satisfied=3)
                    def5_{e2o,o2o,tbe}_* (BASIC predicate semantics)
                    def6_box_output_* (out_L enumeration), def4/def7 (⊑_L / ⪯_L)
                    ocpq_eval_json_reproduces_fig6_over_json_inputs (JSON/WASM path)
Negative proof:   double_confirm_makes_an_order_violate — adding a 2nd 'confirm order'
                    pushes o_a's child set to size 2 ∉ [1,1] ⇒ that order is VIOLATED
                    (satisfied=2, violated=1, violator==o_a).
                  fig6: late-paid (o_b, +45d) and never-paid (o_c) orders VIOLATE
                    because their in-window child set is empty (size 0 ∉ [1,1]).
                  ocpq_eval_json_surfaces_parse_errors — malformed query ⇒ Err, not panic.
Reachability:     Rust ✅ | WASM ✅ (wasm32 build green) | CLI ⏳ (A9/reconciliation)
Verdict:          ALIVE (Rust + WASM legs proven; CLI verb deferred to A9 — the
                  reachable entry point ocpq_eval is implemented and wasm-built).
```

---

## 5. Notes & boundaries

- **C4 fidelity (plan delta):** the test encodes **Fig. 6** faithfully
  (`box(v0)={o1:orders, e1:confirm order}`, `E2O(e1,o1,*)`, `CHILD SET(A,1,1)`;
  child `box(v1)` adds `e2:pay order`, `E2O(e2,o1,*)`, `TBE(e1,e2,0,4w)` ⇒
  "every confirmed order paid within 4 weeks, exactly once"). The
  *third-payment-reminder* example of Fig. 2 is the paper's **informal intro**,
  not a formal `constr`; it is intentionally **not** conflated with Fig. 6.
- **Completeness of `out_L`:** the enumerator takes the Cartesian product of each
  variable's type-admissible domain and filters by `satisfied_by`. This is exact
  and complete for the small object-centric logs OCPQ targets. The paper's
  recursive, parallelizable evaluation is an *optimization over the same set* —
  same semantics, faster on large data; not required for kernel correctness.
- **Filter-restriction (Def. 8):** this box type carries only `BASIC_L`
  predicates, so `box|_BASIC_L = box`; `restrict_to_basic` is the identity here,
  present to complete the formal surface the `⪯_L` tree invariant (Def. 9) names.
- **Future:** general data-attribute predicates (e.g. `price` of an order),
  per-node augmentation columns, and the CLI `wpm ocpq` verb (A9).
