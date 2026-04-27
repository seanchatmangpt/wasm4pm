# Deployment Profiles for wasm4pm

wasm4pm supports 5 deployment profiles to optimize WASM binary size for different target environments. Each profile includes a specific set of algorithms and features tailored to the constraints of the deployment environment.

## Overview

| Profile     | Target Size          | Use Case                      | Key Features                           |
| ----------- | -------------------- | ----------------------------- | -------------------------------------- |
| **mobile**  | ~1.8MB               | Mobile apps, minimal web      | Basic discovery, SIMD acceleration     |
| **edge**    | ~2.1MB               | Edge servers, CDN workers     | Advanced algorithms, ML, streaming     |
| **fog**     | ~2.4MB               | Fog computing, IoT gateways   | Swarm algorithms, full streaming, OCEL |
| **iot**     | ~1.9MB               | IoT devices, embedded systems | Minimal discovery, streaming DFG       |
| **browser** | **2.7MB** (measured) | Cloud servers, web apps       | Full feature set (default for npm)     |

## Profile Details

### mobile Profile (~500KB target)

**Use case:** Mobile apps, minimal web deployments, size-critical environments

**Constraints:**

- Limited bandwidth (3G/4G)
- Memory constrained (mobile devices)
- Fast initial load required
- Interactive latency sensitive

**Includes:**

- Basic discovery: dfg, process_skeleton, alpha_plus_plus, heuristic_miner
- Basic conformance: token replay
- Essential utilities: XES I/O, filtering, validation
- SIMD acceleration

**Excludes:**

- statrs → Replaced with hand-rolled median (saves ~200KB)
- POWL modules (~400KB)
- Advanced algorithms (genetic, ILP, A\*, ACO, PSO, simulated_annealing)
- ML/prediction algorithms
- Full streaming suite
- OCEL support

**Build command:**

```bash
cd wasm4pm
npm run build:mobile
```

### edge Profile (~1.5MB target)

**Use case:** Edge servers, CDN workers, Cloudflare Workers

**Constraints:**

- More memory than browser
- Moderate bandwidth
- Need for conformance and analytics
- Some ML capability useful

**Includes:**

- All browser features
- Advanced algorithms: inductive_miner, genetic, ILP, A\*, hill_climbing
- ML/prediction: All 6 ML algorithms
- Streaming: Basic streaming DFG
- Conformance: Full token replay + alignments

**Excludes:**

- statrs → Hand-rolled statistics (saves ~200KB)
- POWL modules (~400KB)
- Swarm algorithms (ACO, PSO, simulated_annealing)
- OCEL support

**Build command:**

```bash
cd wasm4pm
npm run build:edge
```

### fog Profile (~2.0MB target)

**Use case:** Fog computing, regional aggregation, IoT gateways

**Constraints:**

- Near-cloud capabilities
- Good memory availability
- Need for comprehensive analysis
- Batch processing acceptable

**Includes:**

- All edge features
- Swarm algorithms: ACO, PSO, simulated_anealing
- Full streaming suite (DFG, skeleton, heuristic, inductive, A\*)
- statrs: Full statistics library
- OCEL support: Object-centric event logs

**Excludes:**

- POWL modules (~400KB)

**Build command:**

```bash
cd wasm4pm
npm run build:fog
```

### iot Profile (~1.0MB target)

**Use case:** IoT devices, embedded systems, resource-constrained edge

**Constraints:**

- Very limited memory (RAM < 64MB)
- Limited storage
- Battery-powered
- Network-constrained

**Includes:**

- Basic discovery: dfg, process_skeleton
- Streaming: Streaming DFG only (for real-time processing)
- Essential utilities: XES I/O, basic filtering
- SIMD acceleration

**Excludes:**

- statrs → Hand-rolled statistics (saves ~200KB)
- POWL modules (~400KB)
- Advanced algorithms
- ML/prediction
- Full conformance
- OCEL support
- Heavy analytics

**Build command:**

```bash
cd wasm4pm
npm run build:iot
```

### browser Profile (~2.78MB target - DEFAULT)

**Use case:** Cloud servers, web apps, data centers, unlimited resources

**Constraints:**

- No memory constraints
- High bandwidth
- Need for maximum capability
- Batch processing acceptable

**Includes:**

- Everything
- All 41 discovery algorithms
- All 6 ML/prediction features
- Full POWL suite
- Full streaming suite
- OCEL support
- statrs, rayon (for native builds), chrono

**Note:** This is the default profile for the published npm package. Developers get all capabilities immediately and can opt into smaller profiles for production use if needed.

**Build command:**

```bash
cd wasm4pm
npm run build:browser
# Or simply:
npm run build
```

## Usage Examples

### Development (Default)

```bash
# Build with all features (browser profile - default)
cd wasm4pm
npm run build

# Check binary size
npm run size:check
```

### Production Mobile Deployment

```bash
# Build minimal profile for mobile apps
cd wasm4pm
npm run build:mobile

# Expected output: ~500KB WASM binary
ls -lh pkg/wasm4pm_bg.wasm
```

### Production Edge Deployment

```bash
# Build with ML and advanced algorithms for edge servers
cd wasm4pm
npm run build:edge

# Expected output: ~1.5MB WASM binary
ls -lh pkg/wasm4pm_bg.wasm
```

### All Profiles (CI/CD)

```bash
# Build all profiles for testing
cd wasm4pm
npm run build:all-profiles
```

## Size Verification

Check the actual binary size after building:

```bash
# Build for specific profile
npm run build:mobile

# Check size
ls -lh pkg/wasm4pm_bg.wasm

# Check gzip compressed size
gzip -c pkg/wasm4pm_bg.wasm | wc -c
```

Expected sizes (uncompressed):

- mobile: ~500KB (82% reduction from 2.78MB)
- iot: ~1.0MB (64% reduction)
- edge: ~1.5MB (46% reduction)
- fog: ~2.0MB (28% reduction)
- browser: ~2.78MB (no reduction, full feature set, default)

## Feature Flags

The deployment profiles are implemented using Rust Cargo feature flags. See `wasm4pm/Cargo.toml` for the complete feature definition:

```toml
[features]
default = ["browser"]  # Full feature set for npm package (renamed from "cloud")
mobile = ["basic", "simd", "hand_rolled_stats"]
edge = ["basic", "advanced", "ml", "streaming_basic", "hand_rolled_stats"]
fog = ["edge", "swarm", "streaming_full", "statrs", "ocel"]
iot = ["minimal", "streaming_basic", "hand_rolled_stats"]
browser = ["basic", "advanced", "ml", "streaming_full", "swarm", "statrs", "powl", "ocel"]
cloud = ["browser"]  # Deprecated alias for backward compatibility
```

## Algorithm Availability by Profile

| Algorithm           | mobile | edge | fog | iot | browser |
| ------------------- | ------ | ---- | --- | --- | ------- |
| dfg                 | ✅     | ✅   | ✅  | ✅  | ✅      |
| process_skeleton    | ✅     | ✅   | ✅  | ✅  | ✅      |
| alpha_plus_plus     | ✅     | ✅   | ✅  | ❌  | ✅      |
| heuristic_miner     | ✅     | ✅   | ✅  | ❌  | ✅      |
| inductive_miner     | ❌     | ✅   | ✅  | ❌  | ✅      |
| genetic_algorithm   | ❌     | ❌   | ✅  | ❌  | ✅      |
| ilp                 | ❌     | ❌   | ✅  | ❌  | ✅      |
| a_star              | ❌     | ✅   | ✅  | ❌  | ✅      |
| aco                 | ❌     | ❌   | ✅  | ❌  | ✅      |
| pso                 | ❌     | ❌   | ✅  | ❌  | ✅      |
| simulated_annealing | ❌     | ❌   | ✅  | ❌  | ✅      |
| ml_classify         | ❌     | ✅   | ✅  | ❌  | ✅      |
| ml_cluster          | ❌     | ✅   | ✅  | ❌  | ✅      |
| ml_forecast         | ❌     | ✅   | ✅  | ❌  | ✅      |
| ml_anomaly          | ❌     | ✅   | ✅  | ❌  | ✅      |
| ml_regress          | ❌     | ✅   | ✅  | ❌  | ✅      |
| ml_pca              | ❌     | ✅   | ✅  | ❌  | ✅      |

## Migration Guide

### Before (Current)

```bash
# All users build the same binary
npm run build
# Gets: 2.78MB binary with everything
```

### After (v26.4.16)

```bash
# Default build (full-featured browser profile)
npm run build
# Gets: 2.78MB binary with everything (browser profile, all 41 algorithms)

# Production optimization (new capability)
npm run build:mobile
# Gets: ~500KB binary for production mobile deployments

# Other profiles
npm run build:edge   # ~1.5MB
npm run build:fog    # ~2.0MB
npm run build:iot    # ~1.0MB
npm run build:browser  # ~2.78MB (same as default, explicit, all features)
```

**Key point:** Profile reorganization: "cloud" profile renamed to "browser" (default), and old "browser" profile renamed to "mobile" (minimal, 82% size reduction).

## Backward Compatibility

**Alias support:** `--features cloud` maps to `--features browser` for backward compatibility.

**Migration path:**

1. Existing users: No change needed, `npm run build` still works (now builds browser profile)
2. New users: Get full capabilities by default, can opt into smaller profiles
3. Production users: Use `npm run build:mobile` for size optimization

**Compat alias:** Users with old build scripts can use `npm run build:cloud` which is an alias for `npm run build:browser`.

## Technical Details

### statrs Replacement

For mobile, edge, and iot profiles, the `statrs` dependency (with nalgebra) is replaced with a hand-rolled statistics module (`hand_stats.rs`) that provides:

- median(), mean(), percentile_95(), std_deviation(), min(), max()
- Compatible API with statrs::statistics::Data trait
- ~200KB binary size savings

### POWL Modules

The POWL (Process Orchestrations and Workflows Language) modules (~400KB) are only included in the browser profile (full-featured). Other profiles exclude them to save space.

### Conditional Compilation

All modules use `#[cfg(feature)]` gates to conditionally compile based on the active features. This ensures that unused code is not included in the final binary.

## Testing

Run the deployment profile tests:

```bash
cd wasm4pm
npm test -- deployment-profiles.test.ts
```

These tests verify:

- Algorithms are correctly filtered by deployment profile
- Browser profile has fewer algorithms than edge
- Edge profile includes ML algorithms
- Fog profile includes swarm algorithms
- Cloud profile includes all algorithms
- IoT profile has minimal algorithm set

## Performance Considerations

### SIMD Acceleration

All profiles include SIMD acceleration via `RUSTFLAGS="-C target-feature=+simd128"`. This provides approximately 500x speedup for streaming DFG operations.

### Link-Time Optimization (LTO)

All builds use LTO (`lto = true`) and size optimization (`opt-level = "z"`) to minimize binary size while maintaining performance.

### Panic = Abort

All builds use `panic = "abort"` to remove panic unwinding code, reducing binary size.

## Future Enhancements

Potential future improvements:

- Add wasm-opt post-processing for additional size reduction
- Create profile-specific test suites
- Add benchmark comparisons between profiles
- Create visual profile comparison tool
- Add profile recommendations based on log characteristics

## Implementation Notes

Deployment profiles were implemented in v26.4.9 using Cargo feature flags with conditional `#[cfg(feature)]` compilation. See [DEPLOYMENT_PROFILES_IMPLEMENTATION_SUMMARY.md](./DEPLOYMENT_PROFILES_IMPLEMENTATION_SUMMARY.md) for complete technical details including the 30+ feature flag mapping and conditional compilation strategy.
