# wasm4pm Feature Gating Infrastructure

**Last Updated:** April 16, 2026 (v26.4.16)

Complete guide to WASM feature flags, deployment profiles, and size optimization.

---

## Overview

pictl implements **size-optimized WASM deployment** through conditional feature compilation. A single Rust codebase compiles to 5 different binary profiles (mobile, iot, edge, fog, browser), ranging from 500KB to 2.78MB, with algorithm availability scaled to each target.

**Key principles:**
- One canonical source tree
- Compile-time feature gating (zero runtime overhead)
- 12 canonical semantic features map to Rust `#[cfg]` gates
- TypeScript registry dynamically discovers available algorithms
- Size targets enforced via build scripts

---

## Architecture: Three Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Canonical Features (API-stable)                        │
│ feature-conformance-basic, feature-ml, feature-powl, ...        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│ Layer 2: Deployment Profiles (binary size targets)              │
│ mobile (~500KB), iot (~1MB), edge (~1.5MB), fog (~2MB), ...    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│ Layer 3: Internal Features (#[cfg] module gating)               │
│ conformance_basic, discovery_advanced, ml, streaming_basic, ...│
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Canonical Feature Flags

These 12 features form the **public API** for feature control. They are:
- **Stable** across releases
- **Semantic** (describe what capability, not how)
- **Combinable** (any valid combination compiles)

### Conformance Checking

```
feature-conformance-basic
├─ Token-based replay fitness (fast)
├─ Temporal profile analysis
└─ Available in: all profiles
```

```
feature-conformance-full
├─ Alignments (exact conformance)
├─ ETConformance precision
├─ Depends on: feature-conformance-basic
└─ Available in: fog, cloud only
```

### Discovery Algorithms

```
feature-discovery-advanced
├─ Genetic Algorithm
├─ Integer Linear Programming (ILP)
├─ A* search
├─ Ant Colony Optimization (ACO)
├─ Particle Swarm Optimization (PSO)
├─ Simulated Annealing
└─ Available in: edge, fog, cloud
```

Note: Basic discovery (DFG, Heuristic Miner, Alpha++, Inductive Miner) is **always included**, not feature-gated.

### Machine Learning

```
feature-ml
├─ Classification
├─ Clustering
├─ Forecasting
├─ Anomaly Detection
├─ Regression
├─ Principal Component Analysis (PCA)
└─ Available in: fog, cloud only
```

### Data Formats

```
feature-ocel
├─ Object-Centric Event Log parsing
├─ Multi-object conformance
└─ Available in: fog, cloud only

feature-powl
├─ Partial-Order Workflow Language
├─ Workflow model discovery
└─ Available in: cloud only
```

### Streaming

```
feature-streaming-basic
├─ DFG streaming for real-time discovery
└─ Available in: edge, fog, cloud

feature-streaming-full
├─ SIMD-accelerated streaming
├─ High-throughput DFG
├─ Depends on: feature-streaming-basic
└─ Available in: fog, cloud only
```

### Infrastructure

```
feature-hand-rolled-stats
├─ Minimal statistics (median, percentiles only)
├─ Size optimization (~50KB reduction)
└─ Used by: mobile, iot, edge

feature-statrs
├─ Full-precision statistics (statrs library)
├─ Comprehensive distributions
└─ Used by: fog, cloud

feature-rayon
├─ Multi-threaded parallelism (non-WASM)
└─ Used by: cloud only (fog uses streaming)

feature-gpu
├─ WGPU GPU acceleration
├─ Falls back to CPU on WASM
└─ NOT available on wasm32-unknown-unknown target
```

---

## Layer 2: Deployment Profiles

Each profile combines canonical features into a preset configuration for a specific deployment target.

### Mobile Profile (~500KB target)

**Target:** Mobile apps, web browsers with size constraints, CDN edge endpoints

**Features included:**
- feature-conformance-basic
- feature-hand-rolled-stats
- Basic discovery only (DFG, skeleton, heuristic)

**Algorithms:** ~10-15 (all fast, <50 speedTier)

**Use case:**
```typescript
// Load and analyze an event log in a mobile app
import initWasm, { discover_dfg, delete_object } from "@wasm4pm/cli";

await initWasm();
const log = load_eventlog_from_xes(xesString);
const dfg = discover_dfg(log, "concept:name");
```

**Build:**
```bash
cargo build --release --target wasm32-unknown-unknown --features mobile
```

### IoT Profile (~1.0MB target)

**Target:** IoT devices, embedded systems, resource-constrained environments

**Features included:**
- feature-conformance-basic
- feature-hand-rolled-stats
- Basic discovery (DFG, heuristic, alpha++, inductive)

**Algorithms:** ~12-18

**Constraints:**
- No ML (too large)
- No advanced discovery (genetic/ILP too slow)
- No full streaming (SIMD adds size)

**Build:**
```bash
cargo build --release --target wasm32-unknown-unknown --features iot
```

### Edge Profile (~1.5MB target)

**Target:** Edge servers, CDN workers, fog gateways

**Features included:**
- feature-discovery-advanced
- feature-streaming-basic
- feature-conformance-basic
- feature-hand-rolled-stats

**Algorithms:** ~18-25

**New capabilities:**
- Advanced discovery (genetic, ILP, ACO, PSO)
- Basic streaming (real-time DFG discovery)
- Still no ML, no POWL

**Use case:**
```typescript
// Real-time process monitoring at edge
setInterval(async () => {
  const dfgStream = await kernel.stream('streaming_dfg', logHandle, {
    window_size: 1000,
  });
  // Process results as they arrive
}, 5000);
```

**Build:**
```bash
cargo build --release --target wasm32-unknown-unknown --features edge
```

### Fog Profile (~2.0MB target)

**Target:** Fog computing, IoT gateways, on-premises servers

**Features included:**
- feature-discovery-advanced
- feature-ml
- feature-conformance-full
- feature-streaming-full
- feature-ocel
- feature-statrs

**Algorithms:** ~35-40

**New capabilities:**
- Full ML suite (classification, clustering, forecasting, anomaly)
- SIMD-accelerated streaming
- Full conformance (alignments)
- Object-centric event logs
- Full-precision statistics

**Excluded:**
- POWL (niche, saves ~30KB)

**Use case:**
```typescript
// Comprehensive process analysis on fog node
const prediction = await kernel.run('ml_forecast', logHandle, {
  task: 'remaining-time',
  prefix_length: 5,
});
```

**Build:**
```bash
cargo build --release --target wasm32-unknown-unknown --features fog
```

### Browser Profile (~2.7MB measured, baseline — DEFAULT, full features)

**Target:** Cloud servers, large deployments, development/testing, full-featured web apps

**Features included:**
- All canonical features
- feature-discovery-advanced
- feature-ml
- feature-conformance-full
- feature-streaming-full
- feature-ocel
- feature-powl
- feature-statrs

**Algorithms:** ~41 (all)

**Additional capabilities:**
- Partial-order workflows (POWL)
- GPU acceleration (WGPU, with CPU fallback)
- Full development/debugging
- All 41 discovery, ML, and analysis algorithms

**Build:**
```bash
cargo build --release --target wasm32-unknown-unknown --all-features
```

---

## Layer 3: Internal Features (#[cfg] Module Gating)

Internal features are used in Rust source code for conditional compilation. They are **not part of the public API** and can change between releases. However, they map directly from canonical features.

### Module Conditional Compilation

In `wasm4pm/src/lib.rs`:

```rust
// OCEL modules only compile if feature-ocel is enabled
#[cfg(feature = "ocel")]
pub mod oc_conformance;
#[cfg(feature = "ocel")]
pub mod ocel_flatten;

// ML modules only compile if feature-ml is enabled
#[cfg(feature = "ml")]
pub mod prediction;
#[cfg(feature = "ml")]
pub mod anomaly;

// Advanced discovery only compiled if feature-discovery-advanced is enabled
#[cfg(feature = "discovery_advanced")]
pub mod genetic_discovery;
#[cfg(feature = "discovery_advanced")]
pub mod ilp_discovery;

// Streaming modules
#[cfg(feature = "streaming_basic")]
pub mod simd_streaming_dfg;

#[cfg(feature = "streaming_full")]
pub mod streaming_conformance;
```

### Feature Dependency Chain

```
browser (all-features)
├─ feature-discovery-advanced
│  └─ genetic, ilp, a_star, aco, pso, simulated_annealing
├─ feature-ml
│  └─ ml, ml_classify, ml_cluster, ml_forecast, ml_anomaly, ml_regress, ml_pca
├─ feature-conformance-full
│  ├─ conformance_full
│  ├─ alignment_fitness
│  └─ align_etconformance
├─ feature-streaming-full
│  ├─ streaming_full
│  └─ streaming_basic (< dependency)
└─ ...

mobile (minimal)
├─ feature-conformance-basic
│  └─ conformance_basic
└─ feature-hand-rolled-stats
   └─ hand_rolled_stats
```

---

## Size Analysis

### Binary Size Targets

| Profile | Target (KB) | Actual (KB) | Margin | Notes |
|---------|------------|-------------|--------|-------|
| mobile | 512 | 450-500 | ±50 | Web, mobile |
| iot | 1024 | 900-1000 | ±100 | Embedded |
| edge | 1536 | 1400-1500 | ±150 | CDN, gateways |
| fog | 2048 | 1900-2000 | ±150 | On-prem |
| browser | 2700 | 2697 (measured) | ±100 | Cloud, dev, all features |

### Size Breakdown

Approximate contributions (browser baseline = 2700KB):

```
Base library (always included)
├─ DFG discovery       ≈ 80 KB
├─ Heuristic Miner    ≈ 120 KB
├─ Alpha++/Inductive  ≈ 150 KB
├─ Temporal profiles  ≈ 100 KB
└─ Basic conformance  ≈ 80 KB
   Subtotal: ≈ 530 KB

Optional modules:
├─ Advanced discovery  ≈ 700 KB (genetic, ILP, ACO, PSO)
├─ ML (6 algorithms)   ≈ 600 KB
├─ Streaming (SIMD)    ≈ 400 KB
├─ OCEL support       ≈ 250 KB
├─ POWL support       ≈ 180 KB
├─ Full conformance   ≈ 200 KB
└─ Dependencies
   ├─ statrs lib      ≈ 350 KB
   └─ Other utils     ≈ 100 KB

Total: ~2700 KB (browser profile)
```

### Size Optimization Techniques

1. **Feature flags** — Don't compile unused modules
2. **Hand-rolled stats** — Replace statrs (350KB) with ~50KB custom impl
3. **SIMD selection** — Only enable WASM SIMD when needed
4. **LTO + codegen-units** — Cargo.toml release profile: `lto = true, codegen-units = 1, opt-level = "z"`
5. **wasm-opt** — Binaryen post-processing (disabled by default, can reduce 10-15%)

---

## TypeScript Registry Integration

The `@wasm4pm/kernel` package maintains an algorithm registry with deployment profile metadata. The registry is **generated at WASM build time** and reflects which algorithms are available in each build profile.

### Algorithm Registration

Each algorithm is registered with:
```typescript
interface AlgorithmMetadata {
  id: string;                              // Unique ID
  name: string;
  description: string;
  outputType: 'dfg' | 'petrinet' | ...;
  supportedProfiles: ExecutionProfile[];   // 'fast', 'balanced', 'quality', 'stream'
  deploymentProfiles: DeploymentProfile[]; // 'browser', 'iot', 'edge', 'fog', 'cloud'
  speedTier: number;                       // 0-100 (lower = faster)
  qualityTier: number;                     // 0-100 (higher = better)
  // ... parameters, complexity, estimates
}
```

### Querying Available Algorithms

```typescript
import { getRegistry } from '@wasm4pm/kernel';

const registry = getRegistry();

// Get all algorithms
const all = registry.list();
console.log(`Total: ${all.length} algorithms`);

// Get algorithms for a deployment profile
const browserAlgos = registry.getForDeploymentProfile('browser');
console.log(`Browser: ${browserAlgos.length} algorithms`);

// Get algorithms for an execution profile
const fastAlgos = registry.getForProfile('fast');
console.log(`Fast profile: ${fastAlgos.length} algorithms`);

// Suggest best algorithm for a profile and log size
const suggested = registry.suggestForProfile('balanced', 50000);
console.log(`Suggested: ${suggested?.name}`);
```

### Profile Mapping

**Execution profiles** (from planner):
- `fast` → algorithms with speedTier < 30
- `balanced` → algorithms with speedTier 30-60
- `quality` → algorithms with speedTier > 60
- `stream` → streaming-capable algorithms

**Deployment profiles** (from environment):
- `browser` → smallest + fastest
- `iot` → minimal resource use
- `edge` → good balance of features + size
- `fog` → nearly complete except POWL
- `cloud` → everything

### Build-Time Validation

The registry automatically validates:
```bash
# Check for missing algorithms in build
npm run build:browser
npm run build:fog
npm run test  # Tests validate algorithm counts per profile
```

---

## Building & Testing

### Build All Profiles

```bash
cd wasm4pm
npm run build:profiles
npm run measure-sizes
```

### Build Individual Profile

```bash
# Browser
cargo build --release --target wasm32-unknown-unknown --features browser
wasm-pack build --target bundler --release

# With custom RUSTFLAGS
RUSTFLAGS="-C target-feature=+simd128" cargo build --release --target wasm32-unknown-unknown --features edge
```

### Size Measurement

```bash
bash wasm4pm/measure-size.sh
```

Output:
```
╔═══════════════════════════════════════════════════════════════╗
║  PICTL DEPLOYMENT PROFILE SIZE MEASUREMENT                   ║
╚═══════════════════════════════════════════════════════════════╝

Measuring profile: browser
  browser:    450 KB /    512 KB target   10 algorithms  [PASS]
Measuring profile: iot
  iot:        920 KB /   1024 KB target   15 algorithms  [PASS]
```

### Test Feature Gating

```bash
# Test browser profile
cargo test --test feature_gating_tests --features browser

# Test browser profile (all features)
cargo test --test feature_gating_tests --features browser

# Integration tests
cd packages/kernel && npm test
```

Tests verify:
- ✓ No duplicate algorithm registrations
- ✓ Algorithm counts match profile expectations
- ✓ Essential algorithms in all profiles
- ✓ Advanced algorithms only in larger profiles
- ✓ Cross-profile consistency
- ✓ Size constraints met

---

## Common Tasks

### Add New Algorithm to All Profiles

1. Implement in Rust (no `#[cfg]` guard)
2. Register in `packages/kernel/src/registry.ts`
3. Specify `supportedProfiles` (which execution profiles)
4. Registry auto-infers `deploymentProfiles` based on algorithm speed/quality
5. Run `npm run build:profiles && npm run measure-sizes`

### Restrict Algorithm to Larger Profiles Only

1. Wrap module in `#[cfg]` guard:
   ```rust
   #[cfg(feature = "feature-ml")]
   pub mod expensive_algorithm;
   ```
2. Don't register in browser/iot profiles
3. Update registry metadata: `deploymentProfiles: ['edge', 'fog', 'cloud']`

### Add New Canonical Feature

1. Add to `Cargo.toml` `[features]` section (canonical layer)
2. Map to internal features (layer 3)
3. Create deployment profile that includes it
4. Document in this file and CLAUDE.md
5. Run tests: `cargo test --test feature_gating_tests --all-features`

### Optimize Binary Size

1. Measure current:
   ```bash
   npm run measure-sizes
   ```
2. Profile with `cargo bloat`:
   ```bash
   cargo install cargo-bloat
   cargo bloat --release -n 20
   ```
3. Consider:
   - Removing unused features (check with `cargo tree --features browser`)
   - Hand-rolling statistics (replace statrs with local impl)
   - Disabling unneeded optimizations in small profiles
4. Re-measure and verify targets met

---

## FAQs

**Q: Why 5 profiles instead of using features directly?**

A: Profiles are curated combinations that target specific use cases (web, IoT, edge, fog, cloud). Raw feature selection leaves too much room for invalid combinations (e.g., GPU + wasm32, POWL + browser).

**Q: Can I use feature combination X?**

A: Only the 5 predefined profiles are tested. Custom combinations may not compile or may exceed size targets. Use the profiles as-is.

**Q: Why hand-rolled stats instead of statrs everywhere?**

A: statrs is 350KB (13% of browser size). For browser/IoT, we need size optimization. Hand-rolled stats (median, percentiles, basic distributions) are sufficient for most algorithms.

**Q: Do algorithms behave differently across profiles?**

A: No. Same algorithm code in all profiles. Only availability changes. Results are identical (deterministic, same seed = same output).

**Q: How do I know if an algorithm is available?**

A: Query the registry:
```typescript
const registry = getRegistry();
const algo = registry.get('genetic_algorithm');
if (algo && algo.deploymentProfiles.includes('browser')) {
  // Available
}
```

**Q: Why is POWL only in cloud?**

A: POWL support (Partial-Order Workflow Language) is a specialized feature (< 1% of users). Saves ~180KB for other profiles.

---

## References

- **Cargo Features:** https://doc.rust-lang.org/cargo/reference/features.html
- **wasm-pack:** https://rustwasm.org/docs/wasm-pack/
- **Binary Size Optimization:** https://rustwasm.org/docs/book/reference/code-size.html
- **WASM SIMD:** https://github.com/WebAssembly/simd
