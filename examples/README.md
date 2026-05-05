# pictl examples

Runnable examples for the ML, RL and prediction subsystems.

| Example                          | What it shows                              | Docs link                                    |
|----------------------------------|--------------------------------------------|----------------------------------------------|
| `ml-classify.ts`                 | Train + apply a trace classifier            | [ml-algorithms.md](../docs/ml-algorithms.md) |
| `ml-cluster.ts`                  | k-means cohort discovery                    | [ml-algorithms.md](../docs/ml-algorithms.md) |
| `rl-monitoring.ts`               | RL orchestrator over synthetic telemetry    | [rl-system.md](../docs/rl-system.md)         |
| `prediction-next-activity.ts`    | n-gram next-activity prediction             | [prediction.md](../docs/prediction.md)       |
| `drift-detection.ts`             | Streaming EWMA drift detection              | [drift-detection.md](../docs/drift-detection.md) |
| `observability-setup.ts`         | OTEL bootstrapping (existing)               | [tutorials/observability-setup.md](../docs/tutorials/observability-setup.md) |
| `conformance-audit-example.mjs`  | End-to-end conformance audit (existing)     | —                                            |
| `service-api.js`                 | HTTP service mode (existing)                | —                                            |

## Prerequisites

```bash
pnpm install
pnpm build               # builds @pictl/* packages
cd wasm4pm && npm run build:nodejs    # only needed for rl-monitoring.ts
```

## Running

```bash
tsx examples/ml-classify.ts ./sample.xes
tsx examples/ml-cluster.ts ./sample.xes 4
tsx examples/rl-monitoring.ts 50
tsx examples/prediction-next-activity.ts ./sample.xes
tsx examples/drift-detection.ts ./sample.xes 100 0.25
```

If you don't have a sample log, try the freely-licensed
*Road Traffic Fine Management* log from `tf-pm.org`.

## Troubleshooting

See [`../docs/ml-rl-faq.md`](../docs/ml-rl-faq.md).
