# 06 — Negative / Sabotage Corpus (Agent A8)

> The product is CodeManufactory; RevOps is merely proof that CodeManufactory works.

A primitive is only ALIVE if the **unlawful case refuses** for the *specific*
reason (ALIVE rule §3). This corpus is the negative half of the proof: a set of
INVALID traces and INVALID models, each isolating exactly one defect, each
REFUSED by the appropriate primitive, each cross-checked so the corpus cannot lie
about its own verdict (no FM-5 self-reference — the oracle is the independent
validator / language / soundness analyser, not the fixture's claim).

## Mission

Manufacture invalid traces and invalid models against the A7 process-world field
(Order-to-Cash; 7 object / 9 event types). For each, state:
- the **expected refusal reason** (mapped to an `AndonPull` / mcpp `AndonReason`),
- the **primitive that must reject it**,
- the **model / log pair**,
- a **minimal counterexample** (the single smallest edit that makes it lawful).

Then prove each fixture is refused — verdict ≠ pass, correct AndonPull — by the
appropriate primitive.

## Files

```
fixtures/negative/
├── manifest.json                              # the 14-entry contract (below)
├── n01-missing-required-event.trace.json      # control-flow: missing required event
├── n02-event-out-of-order.trace.json          # control-flow: event out of order
├── n03-duplicate-terminal-event.trace.json    # control-flow: duplicate terminal event
├── n04-receipt-before-gate.trace.json         # control-flow: receipt before the proof gate
├── n05-o2o-dangling.ocel.json                 # OCEL: object relation impossible (dangling O2O)
├── n06-flattening-loss.ocel.json              # OCEL: flattening loss (convergence + divergence)
├── n07-dead-transition.wf-net.json            # net: dead transition (unsound)
├── n08-unsafe-net.wf-net.json                 # net: unsafe (not 1-bounded)
├── n09-nonconforming-powl-route.trace.json    # POWL: non-conforming route (undeclared move)
├── n10-cardinality-max.ocel.json              # OCEL: O2O / object-type cardinality violation
├── n11-lifecycle-not-terminated.ocel.json     # OCEL: object lifecycle never terminated
├── n12-e2o-empty.ocel.json                     # OCEL: event with zero object refs (E2O_EMPTY)
├── n13-duplicate-object-id.ocel.json           # OCEL: object id uniqueness violation
└── n14-undeclared-event-type.ocel.json         # OCEL: undeclared event type
```

The refusal proof lives in `wasm4pm/tests/negative_corpus.rs` (15 tests:
one per fixture + a manifest-completeness invariant).

## The eleven required categories (all covered)

| # | Category | Fixture | Rejecting primitive | Refusal (AndonPull) |
|---|----------|---------|---------------------|---------------------|
| N01 | missing required event | `n01-missing-required-event.trace.json` | `wf_net_language` (token-replay fitness) | `RouteConformanceGap` |
| N02 | event out of order | `n02-event-out-of-order.trace.json` | `wf_net_language` | `RouteConformanceGap` |
| N03 | duplicate terminal event | `n03-duplicate-terminal-event.trace.json` | `wf_net_language` | `RouteConformanceGap` |
| N04 | receipt-before-gate | `n04-receipt-before-gate.trace.json` | `powl_language` (precedence edge) | `RouteConformanceGap` |
| N05 | object relation missing/impossible | `n05-o2o-dangling.ocel.json` | `ocel_core::validate` (`DANGLING_O2O`) | `ObjectLifecycleViolation` |
| N06 | OCEL flattening loss | `n06-flattening-loss.ocel.json` | `ocel_core::flatten` (convergence + divergence) | `ObjectLifecycleViolation` |
| N07 | dead transition | `n07-dead-transition.wf-net.json` | `analyze_petri_net` (`dead_transitions`) | `ObjectLifecycleViolation` |
| N08 | unsafe net | `n08-unsafe-net.wf-net.json` | `analyze_petri_net` (`is_safe=false`) | `ObjectLifecycleViolation` |
| N09 | non-conforming POWL route | `n09-nonconforming-powl-route.trace.json` | `powl_language` (undeclared move) | `IllegalRouteMotion` |
| N10 | OCEL O2O cardinality violation | `n10-cardinality-max.ocel.json` | `ocel_core::validate` (`CARDINALITY_MAX`) | `ObjectLifecycleViolation` |
| N11 | lifecycle-not-terminated | `n11-lifecycle-not-terminated.ocel.json` | `terminated_by` lifecycle check over `flatten` | `LifecycleNotTerminated` → `ObjectLifecycleViolation` |

Three additional OCEL meta-model corners harden the OCEDO / OCPQ Def. 2 surface:
N12 `E2O_EMPTY` (the activity-only fake move), N13 `DUPLICATE_OBJECT_ID`
(`O` is a set), N14 `UNDECLARED_EVENT_TYPE` (types declared up-front).

## How refusal is proven (oracles, not self-reference)

Each test computes the verdict from a primitive that is **independent of the
fixture**, then asserts (a) the fixture is rejected and (b) the rejection's cause
matches the manifest's declared `expected_refusal`. The fixture cannot pass by
asserting its own innocence.

- **Control-flow defects (N01–N04).** Oracle: Separable-WF-nets §5 language
  preservation — a trace conforms at fitness 1.0 **iff** it is a member of the
  closed-form model language. N01–N03 are checked against `wf_net_language(field_net())`;
  N04 against `powl_language` of an inline `collect < verify < emit` partial order.
  A trace outside the language cannot reach fitness 1.0, so the exact-1.0
  admission gate (`mcpp-conformance.md`: admit requires 1.0) raises
  `RouteConformanceGap`. N04 is the canonical proof-lifecycle defect: a receipt
  sealed before its verification gate is not a linear extension of the route's
  partial order, so it is refused — receipts may only follow the gate.

- **Undeclared move (N09).** Oracle: the manufactured field POWL has no
  cancellation branch; `Cancel Order` is absent from `powl_language(field_powl())`'s
  alphabet. A move the route never declared is **illegal motion** → `IllegalRouteMotion`.

- **OCEL meta-model defects (N05, N10, N12, N13, N14).** Oracle: `ocel_core::validate`
  implements OCEDO / OCPQ Def. 2 (every event qualifies ≥1 object; referential
  integrity of E2O and O2O; id uniqueness; declared types; cardinality window).
  Each fixture must produce the *specific* error code (`DANGLING_O2O`,
  `CARDINALITY_MAX`, `E2O_EMPTY`, `DUPLICATE_OBJECT_ID`, `UNDECLARED_EVENT_TYPE`).

- **OCEL flattening loss (N06).** Oracle: van der Aalst OCEL flattening is lossy.
  We prove the loss two-sided and structurally — **divergence** (some event
  references no object of the chosen type ⇒ dropped: `referencing < raw`) and
  **convergence** (some event references >1 object of the type ⇒ duplicated:
  `flattened_pairs > referencing`). We deliberately do *not* compare
  `flattened_pairs` to `raw_event_count` directly: one drop plus one duplication
  can net to coincidental equality, so equality would be a false oracle. The two
  strict inequalities are the honest proof that the projection cannot round-trip.

- **Soundness defects (N07, N08).** Oracle: Separable-WF-nets Def 3.5 soundness +
  1-bounded safety, via `analyze_petri_net`. N07 carries a transition whose only
  input place is never produced (`is_sound=false`, named in `dead_transitions`).
  N08 lets two branches deposit into the same place without a synchronising join,
  reaching a 2-token marking (`is_safe=false`). The paper's translation targets
  the safe-and-sound class; both fixtures fall outside it.

- **Lifecycle not terminated (N11).** Oracle: `object_types[Order].terminated_by`
  declares the lawful closing events (`Receive Payment`, `Cancel Order`). We
  flatten to the Order case and assert its last activity is **not** a terminator
  (`Send Invoice`), so the lifecycle is left open → `LifecycleNotTerminated`. A
  positive control proves the check is real: the lawful field OCEL's Order case
  *does* close with a terminator.

## AndonPull mapping

The Rust route-conformance harness (`wasm4pm::testing::conformance::AndonPull`)
exposes 8 variants; the richer 11-code mcpp `AndonReason` chain
(`packages/contracts/src/andon-bridge.ts`) collapses onto them. The corpus uses
the canonical mcpp codes in the manifest and maps them in the test:

| mcpp `AndonReason` | local `AndonPull` |
|--------------------|-------------------|
| `RouteConformanceGap` | `RouteConformanceGap` |
| `IllegalRouteMotion` | `IllegalRouteMotion` |
| `LifecycleNotTerminated`, `ObjectLifecycleViolation`, `CardinalityViolation`, `ReceiptSchemaViolation` | `ObjectLifecycleViolation` |
| `MissingReceiptCoverage`, `InsufficientReceiptCoverage` | `MissingReceiptCoverage` |
| `MissingRequiredStages`, `MissingRouteActivity` | `MissingRouteActivity` |

## Minimal counterexamples

Every fixture isolates exactly one defect; the manifest's `minimal_counterexample`
field is the single smallest edit that makes it lawful (e.g. *insert 'Confirm
Order' at index 1*; *delete order-2*; *replace t_b/t_c with one join*). N06 is the
sole exception: flattening loss has **no** repair within flattening — the loss is
inherent to projecting a many-to-many E2O graph onto one object type. The
primitive's duty is to *surface* the loss, not hide it.

## Verification

```bash
cargo test -p wasm4pm --test negative_corpus --features ocel
# test result: ok. 15 passed; 0 failed
```

Each pass is a proof of **refusal** (verdict ≠ pass, correct AndonPull), not a
proof of success. The `manifest_is_complete_…` test guards that every fixture has
a refusal entry and that all eleven required categories are present.

## Per-primitive ledger entry

```
Primitive:        Negative / sabotage corpus
Paper grounding:  OCEDO / OCPQ Def. 2 (validate); Separable-WF-nets Def 3.5 +
                  §5 language preservation (soundness, language); van der Aalst
                  OCEL flattening (convergence/divergence)
Artifact:         fixtures/negative/{manifest.json, n01..n14}, wasm4pm/tests/negative_corpus.rs,
                  docs/primitives/06-NEGATIVE-CORPUS.md
Positive proof:   (controls) field_net is sound+safe; field POWL/WF-net languages
                  contain the lawful traces; the lawful Order case terminates
Negative proof:   n01–n14 each refused for its specific reason; 15/15 tests pass
Reachability:     Rust (ocel_core::validate/flatten, soundness::analyze_petri_net,
                  wf_to_powl::{wf_net_language, powl_language}; foundry field_*)
Verdict:          ALIVE
```
