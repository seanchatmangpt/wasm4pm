# Reference: Deployment Profiles

wasm4pm provides WASM builds for different deployment environments by gating features during compilation.

> **Bundle sizes reflect the current build — size optimization (profile-specific tree-shaking) is planned for a future release.**
> All profiles currently produce similar bundle sizes because wasm-opt is disabled and Rust's dead-code elimination is limited across the single cdylib. The profiles differ by **feature flags** (which algorithm subsets are compiled in), not by bundle size today.

## Summary Table

| Profile | Target | Measured Size | Features | Algorithms |
|---------|--------|---------------|----------|-----------|
| `mobile` | Mobile devices | ~5.4 MB | basic conformance, branchless stats | subset |
| `iot` | IoT devices, embedded | ~5.4 MB | basic discovery + conformance, branchless stats | subset |
| `edge` | CDN workers, edge servers | ~5.4 MB | adv. discovery, basic streaming, branchless stats | subset |
| `fog` | Fog computing, gateways | ~5.4 MB | all except POWL, full streaming, ML, OCEL | ~55 |
| `browser` | Web browsers (DEFAULT) | ~7.6 MB | all features including POWL | 60 |

## Canonical Feature Flags

| Feature | Purpose | Profiles |
|---------|---------|----------|
| `feature-conformance-basic` | Token-based replay fitness | All |
| `feature-conformance-full` | Alignments + full conformance | fog, browser |
| `feature-discovery-advanced` | Genetic, ILP, ACO, PSO | edge, fog, browser |
| `feature-ml` | ML algorithms (6 total) | fog, browser |
| `feature-ocel` | Object-centric event logs | fog, browser |
| `feature-powl` | Partial-order workflows | browser only |
| `feature-streaming-basic` | DFG streaming | edge, fog, browser |
| `feature-streaming-full` | SIMD-accelerated streaming | fog, browser |
| `feature-gpu` | GPU acceleration (non-WASM) | N/A for WASM |
| `feature-hand-rolled-stats` | Branchless hand-rolled statistics | mobile, iot, edge |
| `feature-statrs` | Full-precision statistics (statrs crate) | fog, browser |
| `feature-rayon` | Parallel processing (non-WASM) | N/A for WASM |

## Profile Feature Sets (from Cargo.toml)

### `mobile`
- `feature-conformance-basic` — token replay fitness
- `feature-hand-rolled-stats` — branchless stats (size trade-off, no statrs)
- `bcinr` — branchless algorithms

### `iot`
- `feature-conformance-basic`
- `feature-hand-rolled-stats`
- `discovery_basic` (alpha++, heuristic miner, inductive miner)
- `bcinr`

### `edge`
- `feature-conformance-basic`
- `feature-discovery-advanced` (genetic, ILP, ACO, PSO, A*, simulated annealing)
- `feature-streaming-basic` (DFG streaming)
- `feature-hand-rolled-stats`
- `bcinr`

### `fog`
- `feature-conformance-full` (alignments, ET-conformance)
- `feature-discovery-advanced`
- `feature-ml` (classify, cluster, forecast, anomaly, regress, PCA)
- `feature-streaming-full` (SIMD-accelerated)
- `feature-ocel`
- `feature-statrs`
- `bcinr`

### `browser` (DEFAULT)
- All fog features plus:
- `feature-powl` — partial-order workflows
- `petri_net_playout`, `extensive_playout`, `montecarlo`
- `console_error_panic_hook`
- `import`

## Build Commands

Run these from the `wasm4pm/` subdirectory:

```bash
# Mobile profile
pnpm run build:mobile

# IoT profile
pnpm run build:iot

# Edge profile
pnpm run build:edge

# Fog profile
pnpm run build:fog

# Browser profile (DEFAULT)
pnpm run build
```

To measure all sizes: `pnpm run measure-sizes`.

## Registry Integration

The `@wasm4pm/kernel` registry automatically detects available algorithms based on the WASM build profile.

```typescript
import { getRegistry } from '@wasm4pm/kernel';

const registry = getRegistry();
const mobileAlgos = registry.getForDeploymentProfile('mobile');
```
