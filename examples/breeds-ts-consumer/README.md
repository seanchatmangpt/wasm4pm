# breeds-ts-consumer — working example

A runnable TypeScript app that consumes the **`wasm4pm-breeds-ts`** ggen pack: it
generates typed cognition-breed bindings from the breed ontology — **no per-breed
hand-coding** — and uses them.

## Run

```bash
ggen sync          # regenerate src/breed-ids.ts + src/breed-catalog.ts from the pack
npm install        # tsx + typescript
npm start          # runs the demo via tsx
npm run typecheck  # tsc --noEmit --strict
```

(The generated files are committed so the demo runs out of the box; `ggen sync`
regenerates them.)

## What it demonstrates

- `BREED_IDS` / `BreedId` — a compile-time-checked union over all 55 breeds.
- `BREED_CATALOG` — every breed's id, label, doc, and paper citation.
- The fixed WASM contract types (`BreedInput`/`ContractResult` with the exact
  field names — `status:"ok"`, `output_hash`, `run_id`, `replay_pointer`), shipped
  by the pack in `static/breed-types.ts`, plus a typed `cognitionRun()` client.
- Building a typed MYCIN `cognition_run` request.

## How it's wired

`ggen.toml` points at the pack (`../../packs/wasm4pm-breeds-ts`), runs two
Overwrite generation rules, and the fixed types + client are copied once from the
pack's `static/`. To execute against the real core, implement `loadWasm()` in
`client.ts` against your `@wasm4pm/cognition` package, then call
`cognitionRun(breed, contract)`.
