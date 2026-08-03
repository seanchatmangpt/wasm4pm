<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: WASM_API.md; source-sha256: 25e9edf8b1d5144f41f1a796ab3c0419f88bb2de982968fe8297fb77c715e0d7; reason: canonical WASM boundary reference -->

# WASM API boundary

The generated declaration file for an exact build is the export inventory. This document explains the contract and verification procedure; it does not maintain a hand-counted list of every export.

## Sources of truth

Use these in order:

1. Owning Rust functions annotated for `wasm-bindgen` under `wasm4pm/src/` and relevant crates.
2. The exact generated declarations in `wasm4pm/pkg/wasm4pm.d.ts` for the Node target being executed.
3. Runtime feature/capability introspection where implemented.
4. Integration tests that invoke the generated package.
5. This explanatory document.

Do not copy an export name from a previous release, browser build, host-only Rust function, or stale Markdown page without checking the current generated declaration.

## Host boundary rules

- Validate data before it crosses into WASM.
- Convert Rust failures to typed JavaScript-visible refusals; do not panic across the boundary.
- Parse outputs defensively because generated bindings may return JSON text or JavaScript objects depending on the export.
- Do not use a TypeScript fallback to convert an authoritative WASM refusal into success.
- Include target, feature set, and WASM hash in artifact-level evidence.
- Reset singleton loaders between tests that require independent module state.

A useful defensive parser is:

```ts
export function parseWasmResult(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return JSON.parse(value);
}
```

Callers should apply a more specific schema after parsing.

## Vision 2030 session exports

The OCEL-v2 → POWL → WASM composition root requires these exact build-time exports:

| Export | Role |
|---|---|
| `load_ocel_v2(content)` | Parse and normalize OCEL-v2 JSON inside Rust/WASM. |
| `flatten_ocel_v2(content, objectType)` | Produce deterministic object-type cases. |
| `discover_powl_from_log(logJson, variant)` | Discover a POWL model using default discovery parameters. |
| `discover_powl_from_log_config(logJson, activityKey, variant, minTraceCount, noiseThreshold)` | Discover with explicit bounded configuration. |
| `parse_powl(model)` | Parse the canonical POWL representation. |
| `validate_partial_orders(model)` | Validate partial-order constraints. |
| `powl_execute(model, configJson)` | Execute the admitted model with bounded configuration. |

A missing export is `UNSUPPORTED` or `BUILD_BROKEN` for that exact build. It is not evidence that a similarly named host function executed.

## Session behavior

`wpm evidence session` performs all of the following before reporting `ALIVE`:

1. Detect OCEL-v2 input.
2. Invoke Rust/WASM normalization.
3. Invoke Rust/WASM object flattening.
4. Independently flatten with the TypeScript reader and require equality.
5. Reject empty or ungrouped episodes.
6. Project a deterministic event log.
7. Discover and parse POWL.
8. Require valid partial orders.
9. Execute POWL with a bounded iteration configuration.
10. Hash input, normalized OCEL, event log, model, output, and evidence.
11. Replay and compare the hashes when requested.

OCEL-v1 and OCEL NDJSON are not accepted by this route until equivalent WASM admission exports are implemented.

## Handle and resource discipline

Exports that allocate handles must provide and use the corresponding deletion or finalization route. Tests should exercise repeated create/use/delete cycles and confirm invalid or expired handles produce typed failures rather than panics or cross-session state leakage.

## Serialization discipline

Use stable serialization before hashing. Rust maps with nondeterministic iteration order must not feed deterministic evidence without sorting or conversion to ordered collections. JSON object key order must be canonicalized by the hashing layer when identity depends on it.

## Verifying a build

```bash
pnpm run build:wasm

test -s wasm4pm/pkg/wasm4pm_bg.wasm
rg 'load_ocel_v2|flatten_ocel_v2|discover_powl_from_log|parse_powl|validate_partial_orders|powl_execute' \
  wasm4pm/pkg/wasm4pm.d.ts

wpm system doctor capabilities --only ocel-powl-wasm-session --format json
```

The declaration search proves names are generated. The doctor session check executes the composition route. Only a successful execution and replay against the same WASM bytes can establish `ALIVE`.

## Adding or changing an export

1. Change the owning Rust implementation.
2. Add typed positive and negative tests.
3. Generate the required Node/browser target.
4. Inspect the generated declaration and glue.
5. Update TypeScript callers without adding decision authority.
6. Execute the real target.
7. Update the smallest canonical reference or tutorial.
8. Bind any release claim to the resulting WASM hash and certificate.

Generated `pkg` files are build products. Follow repository policy before committing or hand-editing them.
