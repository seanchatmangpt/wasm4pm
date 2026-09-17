<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/packages/README.md; source-sha256: 2d0dd59c33aa4ff971b8dbc377e035959d76991008f381247ff7533460a04648; reason: path-local authority or entrypoint -->

# wasm4pm TypeScript Packages

9 packages forming the TypeScript orchestration layer around the Rust/WASM core.

## Dependency Graph

```
Application Layer:  apps/wasm4pm/
    ↓
Orchestration:    engine → planner → ml
    ↓
Foundation:      kernel → config → contracts → observability
    ↓
WASM Layer:       wasm4pm/ (Rust/WASM core)
```

## Packages

| Package | Role |
|---------|------|
| `@wasm4pm/contracts` | Shared types, receipts, errors, plans, hashing (leaf, no deps) |
| `@wasm4pm/config` | Zod-validated config, `resolveConfig()`, 5-layer precedence |
| `@wasm4pm/kernel` | WASM boundary — 41 algorithms, `run()`, `stream()` |
| `@wasm4pm/engine` | Lifecycle state machine (uninitialized → watching / failed) |
| `@wasm4pm/planner` | `plan(config)` → ExecutionPlan, `explain(config)` → string |
| `@wasm4pm/observability` | 3-layer: CLI human, JSONL machine, OTEL spans |
| `@wasm4pm/testing` | Parity, determinism, CLI, OtelCapture, certification gates |
| `@wasm4pm/ml` | Micro-ML: classify, cluster, forecast, anomaly, regress, PCA |

## Build

```bash
pnpm build     # Build all
pnpm test      # Test all
cd <package> && npm test  # Test one package
```
