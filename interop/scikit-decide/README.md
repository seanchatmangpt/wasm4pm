# scikit-decide federation interop

This directory owns the `wasm4pm` side of the receipt-bound Chatman ecosystem
federation ABI introduced by `seanchatmangpt/scikit-decide` pull request 5 at
contract head `1ea373a0418123a00234862e2d6495e83a5aa4f0`.

The source-owned adapter closes a narrower boundary than the main
`wasm-bindgen` package. It is a portable core-WebAssembly admission adapter for
`scikit-decide`; it does **not** claim to execute process-mining semantics.
Those remain on the native `wasm4pm` Rust/WASM API surfaces.

## Calculus

| Element | Admitted definition |
| --- | --- |
| Objects | canonical invocation JSON, adapter response JSON, receipt, exact source revision, core-WASM artifact |
| Morphisms | parse → identity check → authority check → operation admission → response construction → receipt |
| Admission | request schema, component, source revision, operation, and `authority.actuation == "none"` must match |
| Closure | zero imports; exactly three memory pages; required exports; positive, refusal, drift, and replay fixtures |
| Authority | `SELECT` and `CONSTRUCT` only |
| Actuation | always `REFUSED:ACTUATION_NOT_ADMITTED`; no host imports or I/O exist |
| Receipt | response binds component, exact build revision, operation, request length/fingerprint, standing, and authority |
| Replay | identical request bytes must produce identical response bytes in the same instance |
| Standing | `ALIVE` is limited to the federation adapter boundary; semantic process execution is not inferred |

The accepted adapter operations are exactly `admit`, `describe`, and
`self_test`. Unknown operations, malformed JSON, identity drift, source-revision
drift, and actuation authority produce typed `REFUSED` responses. `BLOCKED`
never crosses the ABI.

## Manufacture and verification

Use the exact repository SHA being represented by the artifact:

```bash
python3 interop/scikit-decide/verify.py \
  --source-revision "$(git rev-parse HEAD)" \
  --output build/scikit-decide-interop
```

The verifier:

1. compiles `adapter.c` with `clang --target=wasm32`;
2. verifies WebAssembly v1 shape, zero imports, required exports, and an exact
   three-page memory bound;
3. executes the real module through Node's `WebAssembly` runtime;
4. exercises three admitted operations and seven typed refusal cases;
5. verifies exact-byte deterministic replay;
6. corrupts a disposable artifact copy and proves SHA-256 drift rejection;
7. writes `interop-receipt.json` with recomputable request, response, and
   artifact identities.

The build supplies `CHATMAN_SOURCE_REVISION`; it is deliberately not hardcoded
in `adapter.c`. This avoids a self-referential commit identity while allowing
`scikit-decide` to build the adapter from any exact admitted `wasm4pm` SHA.

## Consumer integration rule

`scikit-decide` should register the exact `wasm4pm` revision used to build the
artifact and verify that the guest receipt returns the same revision. The
source-owned artifact replaces the generic federation-only placeholder for
`wasm4pm`; it does not broaden the consumer ABI or grant actuation authority.
