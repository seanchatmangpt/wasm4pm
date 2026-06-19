# wasm4pm-compat-ts (ggen pack)

A **self-contained ggen pack** that renders the wasm4pm-compat domain type law as
TypeScript [Zod](https://zod.dev) schemas. It is the consumable, vendorable form of
the projection that lives in `wasm4pm-compat/ggen` — you do **not** need the
`wasm4pm-compat` sibling repo to use it.

This mirrors the `wasm4pm-breeds-ts` pack pattern: bundle the ontology + query +
template, ship an example consumer manifest, prove it renders.

## What it generates

A single file (`src/zod_schemas.ts` by default) containing **~41 exported Zod
schemas** plus matching `z.infer<>` type aliases, including:

- `ConformanceResultSchema`, `ConformanceVerdictSchema`
- `BpmnProcessSchema`, `BpmnNodeSchema`, `BpmnEdgeSchema`, `BpmnLaneSchema`
- `PetriNetSchema`, `ArcSchema`
- `CompatDiagnosticSchema`
- … and the rest of the compat domain types.

The output imports `zod` (a peer/runtime dependency of the consumer) and is
zod **v3 and v4 compatible** (`z.record` is emitted with explicit key+value types).

## Contents

```
ggen/ontology/zod-types.ttl        # self-contained zod vocabulary + domain type instances
ggen/queries/extract-zod-schemas.rq # SELECT over compat:rustType + zod:hasField
ggen/templates/zod-schemas.ts.tera  # renders z.object schemas + z.infer types
example-consumer-ggen.toml          # copy, fix the /ABS/PATH/TO placeholders, sync
```

## Usage

1. Vendor this pack into your project (e.g. `vendor/wasm4pm-compat-ts`).
2. Copy `example-consumer-ggen.toml` to your project root as `ggen.toml`.
3. Replace every `/ABS/PATH/TO/wasm4pm-compat-ts` placeholder with the real
   absolute path to the vendored pack.
4. Render:

   ```bash
   ggen sync --manifest ./ggen.toml
   ```

   You should see `"files_synced": 1` and `src/zod_schemas.ts` with ~41
   `export const …Schema = z.object(...)` consts.

5. Consume:

   ```ts
   import { ConformanceResultSchema, type ConformanceResult } from './src/zod_schemas';

   const result: ConformanceResult = ConformanceResultSchema.parse(raw);
   ```

> Already-packaged alternative: the rendered bindings are also published as the
> npm package **`@wasm4pm/compat-ts`** (from `wasm4pm-compat/wasm4pm-compat-ts`).
> Use this pack when you want to re-render from the ontology yourself; use the npm
> package when you just want the schemas.

## Verified render proof

```
$ ggen sync --manifest ./ggen.toml   # from a clean /tmp consumer, no compat sibling
  "files_synced": 1
  "status": "success"
$ grep -cE "export const .*Schema = z" src/zod_schemas.ts
41
$ tsc --noEmit --strict --skipLibCheck src/zod_schemas.ts   # zod v4.4.3
(exit 0)
```
