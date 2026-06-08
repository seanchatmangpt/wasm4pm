# wasm4pm TypeScript Monorepo

**Package structure, config system, CLI contracts.**

## Package Structure (11 packages — `agents`, `cognition`, `config`, `contracts`, `engine`, `kernel`, `ml`, `observability`, `planner`, `swarm`, `testing`)

```
packages/
├── contracts/    # Shared types, receipts, errors, plans, hashing (leaf, no deps)
├── config/       # Zod-validated config, resolveConfig(), 5-layer precedence
├── kernel/       # WASM boundary — 36 algorithms, run(), stream()
├── engine/       # Lifecycle state machine (uninitialized → watching / failed)
├── planner/      # plan(config) → ExecutionPlan, explain(config) → string
├── observability/# 3-layer: CLI human, JSONL machine, OTEL spans
├── testing/      # Parity, determinism, CLI, OtelCapture, certification gates
├── ml/           # Micro-ML: classify, cluster, forecast, anomaly, regress, PCA
└── swarm/        # Multi-worker coordinator with convergence detection
```

## Dependency Graph

```
Application Layer:  apps/wasm4pm/
    ↓
Orchestration:    engine → planner → swarm → ml
    ↓
Foundation:      kernel → config → contracts → observability
    ↓
WASM Layer:       wasm4pm/ (Rust/WASM core)
```

## Build Commands

```bash
pnpm build                    # Build all packages
pnpm test                     # Test all packages
pnpm --filter @wasm4pm/config test  # Test one package
cd packages/engine && npm test     # Test one package (npm)
```

## wasm4pm CLI (apps/wasm4pm/)

**29 commands** (count from `apps/wasm4pm/src/commands/*.ts`; the table below lists the original published set and may lag behind the source):

| Category | Commands |
|----------|----------|
| Core | `run`, `compare`, `diff`, `watch` |
| Prediction | `predict`, `drift-watch` |
| Analysis | `ml`, `powl` |
| Quality | `quality`, `conformance`, `validate` |
| Analysis+ | `simulate`, `temporal`, `social` |
| Autonomic | `autoprocess`, `status`, `doctor`, `explain` |
| Utility | `init`, `results` |

### Exit Code Contract

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Config error |
| 2 | Source error |
| 3 | Execution error |
| 4 | Partial failure |
| 5 | System error |

### Output Formats

- `--format human` — Colored consola output (default)
- `--format json` — `{ status, message, ...data }`

### Auto-save

Results auto-save to `.wasm4pm/results/<timestamp>-<task>.json`. Pass `--no-save` to skip.

## Config System

`resolveConfig(options?)` returns a Zod-validated `Config`.

### 5-Layer Precedence

1. **CLI arguments** (highest priority)
2. **TOML config file** (`wasm4pm.toml`)
3. **JSON config file** (`wasm4pm.json`)
4. **Environment variables** (`WASM4PM_*` prefix)
5. **Defaults** (lowest priority)

**IMPORTANT:** ENV var prefix is `WASM4PM_` (verified in `packages/config/src/resolver.ts:157`). The earlier note "`WASM4PM_`, NOT `WASM4PM_`" was a copy-paste tautology — there is only one prefix.

### ENV Variables

| Variable | Maps To |
|----------|---------|
| `WASM4PM_PROFILE` | execution.profile |
| `WASM4PM_ALGORITHM` | algorithm.name |
| `WASM4PM_OUTPUT_FORMAT` | output.format |
| `WASM4PM_LOG_LEVEL` | observability.logLevel |
| `WASM4PM_WATCH` | watch.enabled |
| `WASM4PM_OTEL_ENABLED` | observability.otel.enabled |
| `WASM4PM_OTEL_ENDPOINT` | observability.otel.endpoint |
| `WASM4PM_OUTPUT_DESTINATION` | output.destination |
| `WASM4PM_SOURCE_KIND` | source.kind |
| `WASM4PM_SINK_KIND` | sink.kind |
| `WASM4PM_PREDICTION_ENABLED` | prediction.enabled |
| `WASM4PM_PREDICTION_TASKS` | prediction.tasks |
| `WASM4PM_PREDICTION_ACTIVITY_KEY` | prediction.activityKey |
| `WASM4PM_PREDICTION_NGRAM_ORDER` | prediction.ngramOrder |
| `WASM4PM_PREDICTION_DRIFT_WINDOW` | prediction.driftWindowSize |

## Testing Harnesses (@wasm4pm/testing)

```typescript
import { checkParity, checkParityBatch }     from '@wasm4pm/testing';
import { checkDeterminism, stableReceiptHash, receiptsMatch } from '@wasm4pm/testing';
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import { OtelCapture, createOtelCapture }   from '@wasm4pm/testing';
import { CertificationGate, runCertification } from '@wasm4pm/testing';
```

### Testing Gotchas

- **Run vitest from package directory**, not monorepo root
- **Read test files before declaring untested** — tests may be in consolidated files
- **`as const` is type-level only**, not runtime frozen
- **`@wasm4pm/ml` handles empty arrays** — don't assume rejection
- **WasmLoader is a singleton** — call `WasmLoader.reset()` between tests
