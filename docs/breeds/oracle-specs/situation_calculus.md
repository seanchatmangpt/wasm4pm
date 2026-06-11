# situation_calculus — Situation Calculus (Reiter 1991)

Source of truth: `crates/wasm4pm-cognition/src/breeds/situation_calculus.rs`, `tests/fixtures/papers/situation_calculus.json`, oracle in `src/breeds/support/oracle_impls/planning.rs` (lines 378–441), `ocel/models/l1/situation_calculus.ocpn.json`, `breeds/registry.json`.

## Shape

**BreedInput fields used:** `intent`, `facts` (candidates/cases/rules/goals/state unused).

| Fact key | Meaning |
|---|---|
| `fluent:<f>` | fluent `<f>` holds in initial situation S0 |
| `action:<a>:pre` | value names a precondition fluent of `<a>` (repeatable) |
| `action:<a>:add` | value names a fluent added by `<a>` (repeatable) |
| `action:<a>:del` | value names a fluent deleted by `<a>` (repeatable) |
| `do:<n>` | action executed at step `<n>` (0-based, must be contiguous from 0) |

**Caps (refusals, never truncation):** ≤64 fluents (initial + every pre/add/del mention), ≤32 `do:` steps; at least one `do:` step required; every `do:` action must be defined; unknown action slot or non-numeric `do:` index refused. Failed precondition at runtime (`Poss(a,s)`) is a `BreedError`.

**BreedOutput:** `facts` = `holds:<f>` = `"true"` for every fluent in the final situation; `selected` = `s<n>` (n = number of steps); `explanation` reports actions progressed, fluents holding, fluents persisted by inertia.

**Trace table:**

| kind | cardinality | detail format | OCPN phase (model `situation_calculus-l1-v1`) |
|---|---|---|---|
| `load-axioms` | 1 (first) | `S0 \|= {…}; N actions; M steps` | t1: axioms_pending→axioms_loaded |
| `regress-step` | = number of `do:` steps | `do(<a>, s<n>) -> s<n+1>: +{adds} -{dels}` | t2: loop on situation_open |
| `frame-persist` | 1 per initial fluent untouched by any executed action | `fluent '<f>' persists by inertia across <k> steps` | t3: loop on situation_open |
| `decision` | 1 (last) | `final situation \|= {…}` | t4: → situation_final + decision_emitted |

**Postconditions (3-arg):** `TraceQuery::require_non_empty_with_kinds(&["regress-step"])`.

## Data (canonical fixture)

`tests/fixtures/papers/situation_calculus.json` — Reiter (1991), "The frame problem in the situation calculus: a simple solution (sometimes)…", Sections 2–3 (successor-state axioms; blocks-world pickup/putdown), extraction `instantiated`.

Input intent: `progress blocks world through pickup(a); putdown(a, table)`. Facts:
`fluent:on_a_b`, `fluent:on_b_table`, `fluent:clear_a`, `fluent:handempty`, `fluent:color_b_red` (all `"true"`);
`action:pickup_a:pre` = clear_a, handempty, on_a_b; `action:pickup_a:add` = holding_a, clear_b; `action:pickup_a:del` = on_a_b, handempty, clear_a;
`action:putdown_a:pre` = holding_a; `action:putdown_a:add` = on_a_table, handempty, clear_a; `action:putdown_a:del` = holding_a;
`do:0` = pickup_a, `do:1` = putdown_a.

Expected (asserted): `holds_final` = [on_a_table, on_b_table, clear_a, clear_b, handempty, color_b_red]; `not_holds_final` = [on_a_b, holding_a]; `frame_persist_fluents` = [on_b_table, color_b_red]; `regress_steps` = 2.

## Oracle diagram

`BreedOracle for SituationCalculus` (planning.rs):
- `novel_input`: douse a lit lamp — fluents `uo_lamp_lit`, `uo_seal_wax`; action `uo_douse` (pre/del uo_lamp_lit, add uo_lamp_dark); `do:0` = uo_douse.
- `boundary_pair`: same S0, different `do:0` (`uo_douse` vs `uo_polish` adding uo_seal_shine) → different `holds:` facts.
- `refusal_input`: no `do:<n>` steps at all.
- `assert_intermediate`: `require_kind("load-axioms")`, `require_at_least("regress-step", 1)`, `require_kind("decision")`.
- `assert_trace_values`: a `frame-persist` step whose detail contains `uo_seal_wax` must exist ("frame-persist must name the untouched fluent uo_seal_wax").

**Step invariants:**
- Enforced: every executed action's preconditions hold in the situation it fires from (run errors otherwise); `do:` indices contiguous from 0.
- PROPOSED (unenforced between consecutive steps): the situation after `regress-step` n equals the successor-state-axiom image of the situation before it (F(do(a,s)) ≡ add(a,F) ∨ (F(s) ∧ ¬del(a,F))); `frame-persist` fluents are exactly initial ∖ touched.

**Adversary** (anti-cheat-threat-model.md, P3 table): mutable world-state simulator (destructive add/del application, no frame reasoning). Killed by the frame-persistence evidence: an untouched fluent must persist AND the trace must contain a `frame-persist` step NAMING it (`assert_trace_values` above), with regress-step count == action count.

## Class & bounds

- Class trait: none (plain `CognitionBreed`; no `BoundedBreed`/`VerifierBreed`/`OptimizerBreed`). Caps are inline in `preconditions` (64 fluents / 32 steps).
- Registry (`breeds/registry.json`): `status: PARTIAL_ALIVE`, `standing: DISPATCHABLE`, no `complexity_caps` entry (caps live only in code — discrepancy), `historical_ancestor`/`generalized_family`/`specification_relation` = TBD, `input_schema: situation_calculus_input_v1`, `output_schema: situation_calculus_output_v1`, ocel/oracle/receipt/wasm ids `none`.
