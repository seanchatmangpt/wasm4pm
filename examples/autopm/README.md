# AutoPM end-to-end example

Runs `@wasm4pm/autopm` over a sepsis.xes-like log profile and emits a winning
`wasm4pm.toml`.

What it does:

1. Defines sepsis-like `LogCharacteristics` (~1050 traces, ~15000 events, ~16 activities, avg len ~14, max ~185).
2. Calls `runAutoPM(log, { seed, generations, populationSize })` — a deterministic
   NSGA-II search over pipeline genomes (discovery algorithm + optional conform/reason
   stages), scored on **quality** (maximize, grounded in `@wasm4pm/planner`'s
   `ALGORITHM_PROFILES`) and **cost** (minimize, bench-calibrated `estimateDurationMs`).
3. Prints the Pareto front: each candidate's genome summary, quality, cost, and
   BLAKE3 receipt hash (`@wasm4pm/contracts`).
4. Projects the winning genome to a `wasm4pm.toml`, validates it against the canonical
   `@wasm4pm/config` Zod schema, and writes it to `out/wasm4pm.toml`.

## Run

```bash
# from this directory
npm run start

# or from the repo root via the examples workspace
pnpm --filter wasm4pm-examples run:autopm
```

Determinism is law: the same `seed` always yields a byte-identical winner and
receipt hash.
