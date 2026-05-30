# 07 — Route-Driven TDD Primitive

**Agent A9.** Route-driven TDD is a *primitive* of the wasm4pm kernel: a test does
not pass on its assertions alone — it passes only if its execution was a **lawful
POWL-2 route replayed at exact conformance (`fitness == 1.0`)**. Anything below 1.0
is an `AndonPull` (a typed line-stop), not a soft pass. This document inventories
the substrate, the proc-macro sugar, the harness types, the file/test/command
locations, and the FM-5 posture.

> **Doctrine (mcpp-conformance.md):** `0.999 < 1.0` is `AndonPull::RouteConformanceGap`.
> There is no tolerance. A test may not fabricate a passing verdict by omitting a
> proof dimension — an unmeasured plane returns `AndonPull::TestRouteIncomplete`
> *before* any threshold comparison.

---

## Paper grounding

- **POWL-2 routes** — partial orders + choice graphs (`routes/*.powl.json`). A route
  declares the lawful motion; the harness replays observed evidence against it.
- **Exact-1.0 admission** — the fit-gauge doctrine: a part either fits or it does not.
  Five conformance planes (fitness, precision, receipt-coverage, required-stage-coverage,
  object-lifecycle-validity) must each be `Measured(1.0)`.
- **Andon (Toyota Production System)** — a conformance gap is not a warning; it stops
  the line. Each gap maps to exactly one typed `AndonPull` variant.

---

## The substrate (Rust — `wasm4pm::testing`)

| Type / fn | File | Role |
|-----------|------|------|
| `PowlTestHarness` | `wasm4pm/src/testing/harness.rs` | Records activities/objects, replays against a POWL model, produces a verdict. |
| `ExpectedConformance` | `wasm4pm/src/testing/conformance.rs` | The admission contract. Only constructor: `::exact()` (all 5 planes = 1.0). No "acceptable 0.8" constructor exists. |
| `ReplayReport` | `wasm4pm/src/testing/conformance.rs` | Per-plane `ProofDimension` (`Measured(f64)` or `NotMeasured`). |
| `ProofDimension` | `wasm4pm/src/testing/conformance.rs` | `Measured` vs `NotMeasured`. `NotMeasured` ≠ zero — it is *unknown* and fails admission unconditionally. |
| `ConformanceVerdict` | `wasm4pm/src/testing/conformance.rs` | `Passed` or `Andon(AndonPull)`. No partial pass. |
| `AndonPull` | `wasm4pm/src/testing/conformance.rs` | 8 typed line-stop causes (see table). |
| `classify_conformance(report, expected)` | `wasm4pm/src/testing/conformance.rs` | Pure classifier: dimensions checked in priority order; first failure wins. |

### `AndonPull` variants (one per plane / structural cause)

| Variant | Fires when |
|---------|-----------|
| `RouteConformanceGap` | fitness `< 1.0` (control-flow deviation) |
| `IllegalRouteMotion` | precision `< 1.0` (underfit / illegal motion) |
| `MissingReceiptCoverage` | receipt-coverage `< 1.0` |
| `MissingRouteActivity` | required-stage-coverage `< 1.0` |
| `ObjectLifecycleViolation` | object-lifecycle-validity `< 1.0` |
| `UnexpectedAuthority` | an undeclared authority claim appears |
| `UnhandledPanic` | the body panics before evidence is complete |
| `TestRouteIncomplete` | the model cannot be loaded **or** any plane is `NotMeasured` |

---

## The proc-macro sugar (`crates/wasm4pm-macros`)

A `proc-macro = true` companion crate (`crates/wasm4pm-macros/src/lib.rs`,
workspace member, dep `wasm4pm-macros = { path = "crates/wasm4pm-macros" }`). It
provides two attribute macros — sugar over the explicit `PowlTestHarness` API, which
remains fully usable without them.

### `#[powl_test(route = "...", model = "...")]`

Expands a function into a `#[test]` that:

1. binds a `mut h: PowlTestHarness` local (route + model path resolved against the
   *consumer crate's* `CARGO_MANIFEST_DIR`),
2. runs the body (which records evidence on `h`),
3. calls `h.finish()` and asserts the verdict.

```rust,ignore
#[powl_test(route = "macro-sequential-ab",
            model = "routes/test-harness/sequential-two-step.powl.json")]
fn sequential_trace_passes() {
    h.complete_activity(ActivityEvidence::new("A")
        .with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))])).unwrap();
    h.complete_activity(ActivityEvidence::new("B")
        .with_inputs(vec![ObjectEvidence::new("a-out", bh("A:output"))])
        .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))])).unwrap();
}
```

**Negative path** — `expect_refusal = "<AndonVariant>"` asserts a *specific*
`AndonPull` fires, instead of expecting a pass:

```rust,ignore
#[powl_test(route = "a9-macro-missing-model",
            model = "routes/__a9_does_not_exist__.powl.json",
            expect_refusal = "TestRouteIncomplete")]
fn missing_model_fires_test_route_incomplete() {
    h.record_activity("A"); // model cannot be loaded → AndonPull::TestRouteIncomplete
}
```

### `#[powl_activity(activity = "...")]`

Prepends a `wasm4pm::testing::record_activity("...")` call to a function without
altering its return value — instrumentation for route evidence inside ordinary
helpers. Oracle: the wrapped function's contract is unchanged.

---

## Reachability

| Surface | Reachable? | Evidence |
|---------|-----------|----------|
| **Rust** | ✅ | `wasm4pm::testing::*` re-exports all six types + `classify_conformance`; `wasm4pm_macros::{powl_test, powl_activity}`. |
| **Macro** | ✅ | `crates/wasm4pm-macros` is a workspace member; consumed by `wasm4pm/tests/powl_macro_a9_tests.rs` and `wasm4pm/tests/powl_macro_tests.rs`. |

The route-TDD primitive is a **developer surface** (test-time), not a runtime WASM/CLI
export. Its runtime sibling — the exact-1.0 route-admission gate — is `wpm trace conform`
(see `04-CONFORMANCE-PRIMITIVES.md`) and the aggregate `wpm benchmark gate` G3
(see `08-BENCHMARK-GATES.md`).

---

## Proof (Chicago-TDD, oracle = doctrine/math, not self-reference)

**File:** `wasm4pm/tests/powl_macro_a9_tests.rs` (self-contained — no external
`routes/*.powl.json` fixture dependency, so it runs on any checkout).

| Test | Plane proven | Oracle |
|------|--------------|--------|
| `macro_missing_model_fires_test_route_incomplete` | `#[powl_test]` negative path → `AndonPull::TestRouteIncomplete` | harness contract: no loadable model ⇒ refusal |
| `powl_activity_preserves_return_value` | `#[powl_activity]` is behavior-transparent | return value unchanged |
| `c7_all_four_harness_types_named_and_exercised` | **C7**: names `PowlTestHarness`, `ExpectedConformance`, `ConformanceVerdict`, `AndonPull` by name, incl. the negative path | a harness with no model refuses with `TestRouteIncomplete` |
| `c7_exact_conformance_admits_only_at_one` | exact-1.0 admission; `0.999 ⇒ RouteConformanceGap` | mcpp-conformance.md (no tolerance) |

```
$ cargo test --test powl_macro_a9_tests
running 4 tests
test c7_exact_conformance_admits_only_at_one ... ok
test powl_activity_preserves_return_value ... ok
test c7_all_four_harness_types_named_and_exercised ... ok
test macro_missing_model_fires_test_route_incomplete ... ok
test result: ok. 4 passed; 0 failed; 0 ignored
```

The pure classifier `classify_conformance` additionally carries 24 unit tests in
`wasm4pm/src/testing/conformance.rs` (priority order, `NotMeasured` semantics,
per-plane AndonPull mapping).

---

## FM-5 posture

- The expected verdicts are derived from the **route-TDD doctrine** (`exact 1.0 / typed
  AndonPull`), not from the macro's own output → no self-reference.
- The negative path is proven *by construction* (a model file that does not exist),
  needing no external fixture and no mock.
- `#[powl_activity]` transparency is asserted on an independent arithmetic oracle
  (`build_value(20) == 41`), not on the macro's internals.

---

## Verdict

```
Primitive:        Route-Driven TDD (proc-macro sugar + harness)
Paper grounding:  POWL-2 routes; exact-1.0 admission; Andon (TPS)
Artifact:         crates/wasm4pm-macros/src/lib.rs (powl_test!, powl_activity!),
                  wasm4pm/src/testing/{conformance.rs,harness.rs,mod.rs}
Positive proof:   c7_exact_conformance_admits_only_at_one (exact 1.0 admits)
Negative proof:   macro_missing_model_fires_test_route_incomplete (AndonPull::TestRouteIncomplete);
                  c7_exact_conformance_admits_only_at_one (0.999 ⇒ RouteConformanceGap)
Reachability:     Rust | Macro
Verdict:          ALIVE
```
