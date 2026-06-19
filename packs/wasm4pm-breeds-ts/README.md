# wasm4pm-breeds-ts

A self-contained [ggen](https://ggen.dev) pack that generates a standalone
**TypeScript** consumer surface for the wasm4pm cognition layer: a typed list of
breed ids and a catalog of breed metadata (label, doc, paper citation), plus the
fixed WASM contract types and a typed client wrapper.

Requires `ggen` (tested with 26.6.11). The pack bundles its own ontology
(vocabulary + all 55 `compat:CognitionBreed` instances), so you do **not** need
the `wasm4pm-compat` sibling repo.

## What it produces

Rendered into **your** `src/` (Overwrite mode — regenerate any time):

| File | Exports |
|------|---------|
| `src/breed-ids.ts` | `export const BREED_IDS = [...] as const` and `export type BreedId = typeof BREED_IDS[number]` (55 entries) |
| `src/breed-catalog.ts` | `export interface BreedInfo` and `export const BREED_CATALOG: readonly BreedInfo[]` (55 entries: id, label, doc, citation) |

Shipped as **static** files (copy them into your `src/` — they are fixed, not generated):

| File | Contents |
|------|----------|
| `static/breed-types.ts` | `BreedInput`, `Fact`, `Rule`, `Goal`, `StateAtom`, `Candidate`, `Case`, `CognitionRunInput`, `ContractResult` — matching the WASM contract exactly (`status: "ok"`, `output_hash`, `run_id`, `replay_pointer`). |
| `static/client.ts` | `cognitionRun(breed: BreedId, contract: BreedInput, options?): Promise<ContractResult>` — typed wrapper; the `init()`/WASM call is a documented stub to wire to your `wasm4pm-cognition` build. |

## Layout

```
packs/wasm4pm-breeds-ts/
  ggen/ontology/breeds.ttl        vocabulary + 55 breed instances (bundled, standalone)
  ggen/queries/extract-breeds.rq  SELECT over compat:CognitionBreed
  ggen/templates/
    breed-ids.ts.tera
    breed-catalog.ts.tera
  static/
    breed-types.ts
    client.ts
  example-consumer-ggen.toml       copy-paste working manifest
  README.md
```

## Use it

1. **Vendor the pack** into your project (e.g. `./packs/wasm4pm-breeds-ts` or a vendor dir).

2. **Add the generation rules to your `ggen.toml`.** Copy `example-consumer-ggen.toml`
   and adjust the paths to wherever you vendored the pack:

   ```toml
   [ontology]
   source        = "./packs/wasm4pm-breeds-ts/ggen/ontology/breeds.ttl"
   standard_only = false

   [generation]
   output_dir = "."

   [[generation.rules]]
   name        = "breed-ids"
   query       = { file = "./packs/wasm4pm-breeds-ts/ggen/queries/extract-breeds.rq" }
   template    = { file = "./packs/wasm4pm-breeds-ts/ggen/templates/breed-ids.ts.tera" }
   output_file = "src/breed-ids.ts"
   mode        = "Overwrite"

   [[generation.rules]]
   name        = "breed-catalog"
   query       = { file = "./packs/wasm4pm-breeds-ts/ggen/queries/extract-breeds.rq" }
   template    = { file = "./packs/wasm4pm-breeds-ts/ggen/templates/breed-catalog.ts.tera" }
   output_file = "src/breed-catalog.ts"
   mode        = "Overwrite"

   # ggen requires >=1 inference rule (the DMAIC "Measure" gate). No-op identity:
   [inference]
   rules = [
     { name = "identity", construct = "CONSTRUCT { ?b a <https://wasm4pm.dev/ns#CognitionBreed> } WHERE { ?b a <https://wasm4pm.dev/ns#CognitionBreed> }" }
   ]
   ```

3. **Copy the static types** into your source tree:

   ```bash
   cp packs/wasm4pm-breeds-ts/static/breed-types.ts src/
   cp packs/wasm4pm-breeds-ts/static/client.ts      src/
   ```

4. **Generate:**

   ```bash
   ggen sync --manifest ./ggen.toml
   ```

   > Always pass `--manifest`. Without it, ggen searches parent directories and
   > may pick up an unrelated `ggen.toml`.

5. **Import and use:**

   ```ts
   import { BREED_IDS, type BreedId } from "./breed-ids";
   import { BREED_CATALOG } from "./breed-catalog";
   import { cognitionRun } from "./client";

   const breed: BreedId = "mycin"; // type-checked against BREED_IDS
   const info = BREED_CATALOG.find((b) => b.id === breed);
   console.log(info?.citation);

   const result = await cognitionRun(breed, {
     intent: "diagnose",
     candidates: [], facts: [], cases: [], rules: [], goals: [], state: [],
   });
   if (result.status === "ok") console.log(result.run_id, result.output_hash);
   ```

## Regenerating after an ontology change

Edit `ggen/ontology/breeds.ttl` (add/change a `compat:CognitionBreed` instance),
then re-run `ggen sync --manifest ./ggen.toml`. `breed-ids.ts` and
`breed-catalog.ts` are Overwrite-mode — they are fully regenerated; do not hand-edit them.

## Notes

- Breed `doc`/`citation` text is emitted inside TypeScript template literals with
  `` ` `` and `${` escaped. The bundled ontology normalizes embedded double-quotes
  to single quotes so the literals stay valid and self-contained.
- The generated + static files type-check under `tsc --strict`.
