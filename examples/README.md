# wasm4pm Examples

Runnable examples for ML, RL, prediction, and process mining workflows.

## ML Analysis

| Example | What it shows | Quick run |
|---------|--------------|-----------|
| `ml-classify.ts` | Outcome classification (naive Bayes, decision tree) | `tsx examples/ml-classify.ts log.xes` |
| `ml-cluster.ts` | Cohort discovery (k-means) | `tsx examples/ml-cluster.ts log.xes 5` |
| `ml-forecast.ts` | Throughput time-series forecasting | `tsx examples/ml-forecast.ts log.xes` |
| `ml-anomaly.ts` | Outlier detection (EMA-based) | `tsx examples/ml-anomaly.ts log.xes 0.5` |
| `ml-regress.ts` | Remaining-time prediction | `tsx examples/ml-regress.ts log.xes linear` |
| `ml-pca.ts` | Dimensionality reduction (PCA) | `tsx examples/ml-pca.ts log.xes 3` |

**Docs:** [`docs/guides/ml-quickstart.md`](../docs/guides/ml-quickstart.md) | [`docs/ml-complete.md`](../docs/ml-complete.md)

## RL & Autonomic

| Example | What it shows | Quick run |
|---------|--------------|-----------|
| `rl-monitoring.ts` | 5 RL agents, convergence analysis | `tsx examples/rl-monitoring.ts 100` |

**Docs:** [`docs/guides/rl-quickstart.md`](../docs/guides/rl-quickstart.md) | [`docs/rl-complete.md`](../docs/rl-complete.md)

## Prediction & Drift

| Example | What it shows | Quick run |
|---------|--------------|-----------|
| `prediction-next-activity.ts` | n-gram next-activity forecasting | `tsx examples/prediction-next-activity.ts log.xes` |
| `drift-detection.ts` | EWMA concept drift detection | `tsx examples/drift-detection.ts log.xes 100 0.3` |

**Docs:** [`docs/guides/prediction-quickstart.md`](../docs/guides/prediction-quickstart.md) | [`docs/drift-detection.md`](../docs/drift-detection.md)

## End-to-End Workflows

| Example | What it shows | Quick run |
|---------|--------------|-----------|
| `full-workflow.ts` | Discovery → quality → prediction → ML | `tsx examples/full-workflow.ts log.xes` |

**Docs:** [`docs/guides/cli-guide.md`](../docs/guides/cli-guide.md)

## Setup

### Prerequisites

```bash
pnpm install                             # Install all packages
pnpm build                               # Build @wasm4pm/* packages
cd wasm4pm && npm run build:nodejs       # Build WASM for Node.js
```

### Get a sample log

Either use your own, or download the freely-licensed
[Road Traffic Fine Management](https://www.tf-pm.org/dataset) log:

```bash
curl -o sample.xes https://data.tf-pm.org/rtfm.xes.gz
gunzip sample.xes.gz
```

## Running examples

All examples use `tsx` for TypeScript execution. If you don't have it:

```bash
npm install -D tsx
# or
pnpm add -D tsx
```

Then run any example:

```bash
tsx examples/ml-classify.ts sample.xes
tsx examples/rl-monitoring.ts 50
tsx examples/full-workflow.ts sample.xes
```

## Configuration

Examples inherit from `wasm4pm.toml` and environment variables (`WASM4PM_*`).

Override via environment:

```bash
WASM4PM_LOG_LEVEL=debug tsx examples/ml-classify.ts sample.xes
WASM4PM_PROFILE=quality tsx examples/full-workflow.ts sample.xes
```

## Output

Examples print human-readable summaries to stdout. Most also auto-save detailed results:

```bash
ls .wasm4pm/results/          # Browse auto-saved artifacts
```

To disable auto-save:

```bash
tsx examples/ml-classify.ts sample.xes --no-save
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Module not found` | Run `pnpm install && pnpm build` |
| `WASM load failed` | Run `cd wasm4pm && npm run build:nodejs` |
| `File not found: log.xes` | Provide absolute path or check working directory |
| `Memory error on large logs` | Use faster profile: `WASM4PM_PROFILE=fast` |

See [`../docs/troubleshooting.md`](../docs/troubleshooting.md) for detailed debugging.

## Next steps

- **Quick start:** [`docs/guides/ml-quickstart.md`](../docs/guides/ml-quickstart.md)
- **All commands:** [`docs/guides/cli-guide.md`](../docs/guides/cli-guide.md)
- **Configuration:** [`docs/guides/configuration-guide.md`](../docs/guides/configuration-guide.md)
- **Tutorials:** [`docs/tutorials/`](../docs/tutorials/)
