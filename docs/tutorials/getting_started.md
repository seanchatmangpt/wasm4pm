# Getting Started

## 1. Install

```bash
npm install -g @wasm4pm/cli
wpm --version
```

From the repo root without a global install:

```bash
# CLI requires the Node.js WASM target (once per clone)
cd wasm4pm && npm run build:nodejs && cd ..
npm exec --workspace @wasm4pm/cli -- wpm run data/small-example.xes
```

## 2. Process Mining

The bundled sample log is [`data/small-example.xes`](../../data/small-example.xes).

**Default algorithm:** `config.algorithm.name` from `wasm4pm.toml` / `wasm4pm.json` in the current directory, else the first algorithm for your execution profile, else `heuristic_miner`. The repo root ships a streaming preset (`wasm4pm.toml`) that sets `algorithm.name = "simd_streaming_dfg"`.

```bash
wpm run data/small-example.xes
```

Run a specific algorithm by alias or registry ID:

```bash
wpm run data/small-example.xes -a dfg
wpm run data/small-example.xes -a inductive
wpm run data/small-example.xes -a heuristic_miner
wpm run data/small-example.xes -a ocel_dfg   # requires OCEL input
```

Browse all 60 registered algorithms:

```bash
wpm algorithms
wpm algorithms --format json
```

Compare algorithms side-by-side:

```bash
wpm compare dfg,heuristic,genetic -i data/small-example.xes
```

## 3. Programmatic Usage

```typescript
import { readFileSync } from 'fs';
import { Kernel } from 'wasm4pm';
import * as wasm from 'wasm4pm';

const logHandle = wasm.load_eventlog_from_xes(
  readFileSync('data/small-example.xes', 'utf8')
);
const kernel = new Kernel(wasm);
await kernel.init();

const { output } = await kernel.discover('dfg', logHandle, {
  activity_key: 'concept:name',
});
console.log(output);
```

Low-level WASM without the Kernel wrapper:

```typescript
import * as wasm from 'wasm4pm';
import { readFileSync } from 'fs';

const xes = readFileSync('data/small-example.xes', 'utf8');
const logHandle = wasm.load_eventlog_from_xes(xes);
const dfgJson = wasm.discover_dfg(logHandle, 'concept:name');
console.log(JSON.parse(dfgJson));
```

## 4. Cognition

```bash
wpm cognition run --contract mycin --input examples/cognition/mycin/intent.json
```

## 5. Truex — OCEL 2.0 Receipts

Verify object-centric execution envelopes with cryptographic admission control:

```bash
wpm truex verify examples/out/truex_ocel2_valid.json
```

See [Truex Receipt Verification](truex_receipts.md) for admitted/refused examples and the canonical profile.

## Next Steps

- [Predictive Monitoring](predictive_monitoring.md) — `wpm predict` for next-activity, remaining-time, drift
- [Truex Receipt Verification](truex_receipts.md) — OCEL 2.0 envelope verification
- [CLI Reference](../reference/cli_commands.md) — full command catalog
- [README](../../README.md) — algorithm domains and deployment profiles
