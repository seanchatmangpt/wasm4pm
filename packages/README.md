# pictl TypeScript Packages

10 packages forming the TypeScript orchestration layer around the Rust/WASM core.

## Dependency Graph

```
Application Layer:  apps/pictl/
    ↓
Orchestration:    engine → planner → swarm → ml
    ↓
Foundation:      kernel → config → contracts → observability
    ↓
WASM Layer:       wasm4pm/ (Rust/WASM core)
```

## Packages

| Package | Role |
|---------|------|
| `@pictl/contracts` | Shared types, receipts, errors, plans, hashing (leaf, no deps) |
| `@pictl/config` | Zod-validated config, `resolveConfig()`, 5-layer precedence |
| `@pictl/kernel` | WASM facade — 41 algorithms, `run()`, `stream()` |
| `@pictl/engine` | Lifecycle state machine (uninitialized → watching / failed) |
| `@pictl/planner` | `plan(config)` → ExecutionPlan, `explain(config)` → string |
| `@pictl/observability` | 3-layer: CLI human, JSONL machine, OTEL spans |
| `@pictl/testing` | Parity, determinism, CLI, OtelCapture, certification gates |
| `@pictl/ml` | Micro-ML: classify, cluster, forecast, anomaly, regress, PCA |
| `@pictl/swarm` | Multi-worker coordinator with convergence detection |

## Build

```bash
pnpm build     # Build all
pnpm test      # Test all
cd <package> && npm test  # Test one package
```
