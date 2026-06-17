# Getting Started

## 1. Install

`@wasm4pm/cli` is not yet published to npmjs.org. Install from source:

```bash
git clone https://github.com/seanchatmangpt/wasm4pm
cd wasm4pm
# Build the Node.js WASM target (required once per clone)
cd wasm4pm && npm run build:nodejs && cd ..
pnpm install
```

Verify the install:

```bash
node apps/wasm4pm/dist/bin/wpm.js --version
```

For convenience, add a shell alias:

```bash
alias wpm='node /path/to/wasm4pm/apps/wasm4pm/dist/bin/wpm.js'
```

## 2. Process Mining

The bundled sample log is [`data/small-example.xes`](../../data/small-example.xes).

**Default algorithm:** `config.algorithm.name` from `wasm4pm.toml` / `wasm4pm.json` in the current directory, else the first algorithm for your execution profile, else `simd_streaming_dfg`. The repo root ships a streaming preset (`wasm4pm.toml`) that sets `algorithm.name = "simd_streaming_dfg"`.

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

## 3. Health Checks

```bash
wpm doctor check
wpm status --format json
```

## 4. End-to-End Workflow Example

`examples/full-workflow.ts` chains discovery → quality → prediction → ML in a single script:

```bash
tsx examples/full-workflow.ts data/small-example.xes
```

RL autonomic monitoring (5 agents, convergence analysis):

```bash
tsx examples/rl-monitoring.ts 100
```

Watch mode — re-run on file change:

```bash
bash examples/watch-mode.sh data/small-example.xes
```

## 5. Programmatic Usage

```typescript
import { readFileSync } from 'fs';
import { Kernel } from 'wasm4pm';
import * as wasm from 'wasm4pm';

const logHandle = wasm.load_eventlog_from_xes(
  readFileSync('data/small-example.xes', 'utf8')
);
const kernel = new Kernel(wasm);
await kernel.init();

const { handle, metadata } = await kernel.discover('dfg', logHandle, {
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

## 5. Cognition

```bash
wpm cognition run --contract mycin --input examples/cognition/mycin/intent.json
```

## 6. Truex — OCEL 2.0 Receipts

Verify object-centric execution envelopes with cryptographic admission control:

```bash
wpm truex verify examples/out/truex_ocel2_valid.json
```

See [Truex Receipt Verification](truex_receipts.md) for admitted/refused examples and the canonical profile.

## Next Steps

- [Predictive Monitoring](predictive_monitoring.md) — `wpm predict` for next-activity, remaining-time, drift
- [Truex Receipt Verification](truex_receipts.md) — OCEL 2.0 envelope verification
- [CLI Reference](../reference/cli_commands.md) — full command catalog
- [Examples](../../examples/README.md) — runnable ML, prediction, Truex, and cognition examples
- [README](../../README.md) — algorithm domains and deployment profiles
