# Troubleshooting

Diagnostic steps for common wasm4pm failures. Start with `wpm doctor check` — it catches most environment issues automatically.

## Exit code reference

| Code | Meaning | First step |
|------|---------|-----------|
| `0` | Success | — |
| `1` | Config error | Check flags and argument spelling |
| `2` | Source error | Check algorithm ID, verify WASM build exists |
| `3` | Execution error | Check input file format; try `--format json` for details |
| `4` | Partial | Some succeeded; check individual outputs |
| `5` | System error | Check disk space, Node.js version, memory |

---

## WASM module not found

**Symptom:**
```
Error: Cannot find module 'wasm4pm' or its corresponding type declarations
```
or
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'wasm4pm'
```

**Cause:** The Node.js WASM target has not been built.

**Fix:**
```bash
cd wasm4pm
npm run build:nodejs
cd ..
pnpm install
```

The WASM build must be re-run after any `git pull` that touches `wasm4pm/src/`. The `pnpm install` step is required because pnpm hard-copies file-protocol deps — it won't pick up the new WASM binary automatically.

---

## Algorithm not found / exit code 2

**Symptom:**
```
wpm run log.xes -a my_algo
# exit 2: SOURCE_ERROR
```

**Cause:** The algorithm ID or alias is not registered.

**Fix:** List all registered algorithms and their aliases:
```bash
wpm algorithms
wpm algorithms --format json | grep '"id"'
```

Algorithm IDs are case-sensitive. Common aliases: `dfg` → `simd_streaming_dfg`, `inductive` → `inductive_miner`, `heuristic` → `heuristic_miner`.

---

## OCEL algorithm fails on XES input

**Symptom:**
```
wpm run log.xes -a ocel_dfg
# exit 3: EXECUTION_ERROR
```

**Cause:** `ocel_*` algorithms require OCEL 2.0 JSON input, not XES.

**Fix:** Use an OCEL 2.0 JSON file:
```bash
wpm run log.json -a ocel_dfg
```

OCEL 2.0 format requires `ocel:events`, `ocel:objects`, and `ocel:object-types` keys at the root. See [Truex OCEL 2.0 Canonical Profile](../truex-ocel2-canonical-profile.md) for the schema.

---

## Cognition run: "missing field 'breed'"

**Symptom:**
```
wpm cognition run --contract test --input intent.json
# error: missing field 'breed'
```

**Cause:** The input JSON is a bare `BreedInput` instead of the full `{ breed, contract }` envelope. The Rust WASM boundary uses `deny_unknown_fields` and requires the outer wrapper.

**Fix:** Wrap your input:
```json
{
  "breed": "mycin",
  "contract": {
    "intent": "...",
    "facts": [...],
    "rules": [...],
    ...
  }
}
```

---

## Cognition run: JSON output is empty or not JSON

**Symptom:** `wpm cognition run` prints human-readable text; parsing it as JSON fails.

**Cause:** The CLI defaults to human-readable output format.

**Fix:** Pass `--format json`:
```bash
wpm cognition run --contract mycin --input intent.json --format json
```

The JSON output is wrapped in the standard CLI envelope: `{ command, status, payload: { ... }, meta }`. The breed-specific result is at `payload.output_hash`, `payload.status`, `payload.output`, etc.

---

## Receipt: input_hash is empty

**Symptom:** `.wasm4pm/receipts/latest.json` has an empty `input_hash`.

**Cause:** `--no-save` was passed, suppressing the receipt write. Alternatively, the run exited before hashing completed.

**Fix:** Omit `--no-save`. Receipts are written by default. If the input hash is still empty after a successful run, check that the input file is non-empty:
```bash
wc -c data/my-log.xes
```

---

## SIGABRT on parallel vitest runs

**Symptom:** Running multiple packages in parallel with `pnpm -r test` crashes with SIGABRT (signal 6) or produces inconsistent pass/fail counts.

**Cause:** Known V8 issue with concurrent WASM module initialization in the same process tree. Affects: `@wasm4pm/contracts`, `@wasm4pm/observability`, `@wasm4pm/ml`, `@wasm4pm/cognition`, `@wasm4pm/planner`, `@wasm4pm/swarm`.

**Fix:** Run WASM-heavy packages sequentially:
```bash
pnpm --filter @wasm4pm/contracts test
pnpm --filter @wasm4pm/observability test
pnpm --filter @wasm4pm/ml test
pnpm --filter @wasm4pm/cognition test
pnpm --filter @wasm4pm/planner test
pnpm --filter @wasm4pm/swarm test
```

Safe to run in parallel: `@wasm4pm/config`, `@wasm4pm/testing`, `@wasm4pm/agents`, `@wasm4pm/supabase`.

---

## wpm doctor check fails

**Symptom:**
```
wpm doctor check
# FAIL: WASM binary not found
```

**Fix steps in order:**
1. `cd wasm4pm && npm run build:nodejs && cd ..` — rebuild WASM
2. `pnpm install` — reinstall to pick up new binary
3. `node apps/wasm4pm/dist/bin/wpm.js --version` — verify CLI binary exists
4. Re-run `wpm doctor check`

If doctor still fails after these steps, check Node.js version:
```bash
node --version  # must be 20.x or 22.x LTS
```

---

## Algorithm produces unexpected results

Before filing a bug:

1. **Check fitness**: `wpm quality -i log.xes -a <algo>` — fitness below 0.85 indicates the algorithm underfits the log.
2. **Try a different algorithm**: `wpm compare dfg,heuristic,inductive -i log.xes` — compare results side-by-side.
3. **Check input encoding**: XES files must be UTF-8. Binary-encoded XES or malformed XML causes silent truncation.
4. **Verify determinism**: Run twice with the same input — output must be identical. If it differs, file a determinism bug.

---

## Getting more help

- `wpm --help` — full command reference
- `wpm <command> --help` — per-command flags
- [CLI Reference](../reference/cli_commands.md) — all commands documented
- [Algorithms Reference](../reference/algorithms.md) — per-algorithm input requirements and known limitations
- [GitHub Issues](https://github.com/seanchatmangpt/wasm4pm/issues) — bug reports
