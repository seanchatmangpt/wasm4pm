# Reference: Deployment Profiles

wasm4pm provides optimized WASM bundles for different deployment environments by gating features during compilation.

## Summary Table

| Profile | Target | Size Target | Features | Algorithms |
|---------|--------|-------------|----------|-----------|
| `mobile` | Mobile devices | ~500KB | basic discovery, conformance | ~10-15 |
| `iot` | IoT devices, embedded | ~1.0MB | basic discovery, conformance | ~12-18 |
| `edge` | CDN workers, edge servers | ~1.5MB | adv. discovery, basic streaming | ~18-25 |
| `fog` | Fog computing, gateways | ~2.0MB | all except POWL, full streaming, ML | ~35-40 |
| `browser` | Web browsers (DEFAULT) | **3.4MB** | all features | 60 |

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
| `feature-hand-rolled-stats` | Size optimization | mobile, iot, edge |
| `feature-statrs` | Full-precision statistics | fog, browser |
| `feature-rayon` | Parallel processing (non-WASM) | N/A for WASM |

## Build Commands

Run these from the `wasm4pm/` subdirectory:

```bash
# Mobile profile
npm run build:mobile

# IoT profile
npm run build:iot

# Edge profile
npm run build:edge

# Fog profile
npm run build:fog

# Browser profile (DEFAULT)
npm run build
```

To measure all sizes: `npm run measure-sizes`.

## Registry Integration

The `@wasm4pm/kernel` registry automatically detects available algorithms based on the WASM build profile. 

```typescript
import { getRegistry } from '@wasm4pm/kernel';

const registry = getRegistry();
const mobileAlgos = registry.getForDeploymentProfile('mobile');
```
