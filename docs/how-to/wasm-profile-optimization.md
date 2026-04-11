# WASM Profile Optimization Guide

**Version:** 1.0  
**Target:** pictl WASM builds for different deployment environments  
**Last Updated:** 2026-04-10

Practical guide to optimizing pictl WASM binaries for specific deployment profiles. Each profile provides a different balance of size, features, and performance.

---

## Quick Start

### For Browsers (500KB target)

```bash
cd wasm4pm
npm run build:browser
ls -lh pkg/wasm4pm_bg.wasm
# Expected: ~500KB
```

### For Edge/CDN (1.5MB target)

```bash
cd wasm4pm
npm run build:edge
ls -lh pkg/wasm4pm_bg.wasm
# Expected: ~1.5MB
```

### For Cloud/Development (full features)

```bash
cd wasm4pm
npm run build
# or: npm run build:cloud
# Expected: ~2.78MB
```

---

## Understanding Profiles

Each profile is a Cargo feature set that includes/excludes algorithms, dependencies, and optimizations.

| Profile | Size | Use Case | Key Constraint | Features |
|---------|------|----------|---|---|
| **browser** | 500KB | Web browsers, mobile web | Limited bandwidth, mobile RAM | Basic discovery, SIMD |
| **edge** | 1.5MB | Edge servers, CDN workers | Moderate latency budget | Advanced algorithms, ML |
| **fog** | 2.0MB | Regional aggregation, IoT gateways | Good memory availability | Swarm algorithms, full streaming |
| **iot** | 1.0MB | Embedded systems, battery-powered | Severe resource constraints | Minimal discovery, streaming DFG |
| **cloud** | 2.78MB | Data centers, unlimited resources | None | Everything (default) |

---

## Profile Details & Trade-offs

### Browser Profile (~500KB)

**When to use:**
- Web-based SPA (React, Vue, Angular)
- Electron desktop apps
- Progressive web apps (PWAs)
- Mobile web applications
- User agents with 3G/4G connections

**Trade-offs:**

| Removed | Savings | Impact |
|---------|---------|--------|
| statrs library | ~200KB | Use hand-rolled median/percentile functions |
| POWL modules | ~400KB | Cannot generate process orchestrations |
| Advanced algorithms | ~100KB | Only basic discovery (DFG, heuristic, alpha++) |
| ML algorithms | ~150KB | No prediction/clustering/anomaly detection |
| Full streaming | ~50KB | Streaming disabled |

**Included algorithms:**
- `dfg` — Directly-Follows Graph
- `process_skeleton` — Process skeleton discovery
- `alpha_plus_plus` — Alpha+ algorithm
- `heuristic_miner` — Heuristic Miner
- `token_replay` — Token replay conformance

**Memory profile:**
- Typical: 50-100MB at runtime
- Peak: 200MB with large event logs (>100K events)
- Browser: OK for logs < 50K events
- Mobile: OK for logs < 20K events

**Performance:**
- DFG: ~50-200ms (5K-50K events)
- Alpha+: ~100-500ms (same)
- SIMD acceleration: ~5-10x speedup for DFG

**Build command:**
```bash
npm run build:browser
```

**Size verification:**
```bash
ls -lh pkg/wasm4pm_bg.wasm
# Should be ~500KB
gzip -c pkg/wasm4pm_bg.wasm | wc -c
# Should be ~150-180KB gzipped
```

**Production example:**
```typescript
// In your web app
import init, { discover } from '@pictl/wasm4pm-browser';

await init();
const result = discover({
  algorithm: 'dfg',
  eventLog: xesData,
});
```

### Edge Profile (~1.5MB)

**When to use:**
- Cloudflare Workers
- AWS Lambda@Edge
- Vercel Edge Functions
- Azure Edge
- Fastly Compute@Edge

**Trade-offs:**

| Removed | Savings | Gain |
|---------|---------|------|
| statrs | ~200KB | Hand-rolled stats (compatible API) |
| POWL modules | ~400KB | Lose orchestration generation |
| Swarm algorithms | ~100KB | Lose ACO, PSO, simulated annealing |
| Full streaming | ~50KB | Basic streaming available |

**Included algorithms:**
- All browser algorithms
- `inductive_miner` — Inductive Miner
- `genetic_algorithm` — Genetic algorithm
- `ilp` — Integer Linear Programming
- `a_star` — A* search
- `ml_classify`, `ml_forecast`, `ml_cluster`, `ml_anomaly`, `ml_regress`, `ml_pca` — All 6 ML algorithms
- `streaming_dfg` — Streaming DFG

**Latency budget:**
- Cold start: ~100-500ms
- Warm execution: ~50-200ms (DFG)
- Genetic (100 generations): ~2-5 seconds
- ILP: ~5-30 seconds (depends on model size)

**Memory profile:**
- Typical: 100-200MB
- Peak: 400MB with complex models
- Safe for logs < 100K events

**Performance:**
- DFG: 50-200ms
- Inductive: 200-1000ms
- Genetic (50 gen, 30 pop): 3-8 seconds
- A*: 200-5000ms (depends on heuristic)

**Build command:**
```bash
npm run build:edge
```

**Performance tuning for edge:**

Reduce iterations/population for edge constraints:
```typescript
const result = discover({
  algorithm: 'genetic',
  parameters: {
    generations: 20,      // Reduce from 100
    populationSize: 20,   // Reduce from 50
  },
  eventLog: xesData,
});
```

**Production example:**
```typescript
// Cloudflare Worker
import init, { discover } from '@pictl/wasm4pm-edge';

export default {
  async fetch(request) {
    await init();
    const log = await request.json();
    const result = discover({
      algorithm: 'dfg',
      eventLog: log,
    });
    return new Response(JSON.stringify(result));
  },
};
```

### Fog Profile (~2.0MB)

**When to use:**
- Regional data aggregation hubs
- IoT gateway servers (e.g., balena)
- Fog computing clusters
- Local k8s nodes with moderate resources
- Multi-tenant edge computing

**Trade-offs:**

| Removed | Savings | Gain |
|---------|---------|------|
| Nothing | N/A | All edge features + |
| — | — | Swarm algorithms |
| — | — | Full streaming suite |
| — | — | statrs library (full) |
| — | — | OCEL support |

**Included algorithms:**
- All edge algorithms
- `aco` — Ant Colony Optimization
- `pso` — Particle Swarm Optimization
- `simulated_annealing` — Simulated Annealing
- `streaming_*` — All streaming variants
- Full statrs library (nalgebra-based statistics)
- OCEL event log support

**Memory profile:**
- Typical: 200-400MB
- Peak: 800MB (large models + streaming)
- Safe for logs < 500K events

**Performance:**
- DFG: 50-200ms
- Inductive: 200-1000ms
- Genetic: 3-10 seconds
- ACO: 5-60 seconds (depends on iterations)
- PSO: 5-60 seconds
- Streaming DFG: 100-500ms (per batch)

**Latency budget:**
- Per-artifact: 30-60 seconds (batch processing OK)
- No real-time constraints

**Build command:**
```bash
npm run build:fog
```

**Performance tuning for fog:**

Increase iterations for quality (fog has more time/memory):
```typescript
const result = discover({
  algorithm: 'aco',
  parameters: {
    ants: 50,
    iterations: 100,
    evaporation: 0.1,
  },
  eventLog: largeLog,
  streaming: {
    enabled: true,
    batchSize: 10000,
  },
});
```

**Production example:**
```typescript
// Node.js fog gateway
import init, { discover } from '@pictl/wasm4pm-fog';
import { OcelLog } from '@pictl/ocel';

await init();
const ocelLog = new OcelLog();
// ... stream events into ocelLog

const result = discover({
  algorithm: 'aco',
  eventLog: ocelLog,
  streaming: { enabled: true },
});
```

### IoT Profile (~1.0MB)

**When to use:**
- Raspberry Pi / Edge devices
- Smart watches / wearables
- Battery-powered IoT sensors
- Embedded Linux systems
- Memory-constrained environments (< 64MB RAM)

**Trade-offs:**

| Removed | Savings | Impact |
|---------|---------|--------|
| All advanced algorithms | ~400KB | Only DFG + skeleton + minimal heuristic |
| ML algorithms | ~150KB | No prediction |
| statrs | ~200KB | Hand-rolled statistics |
| POWL | ~400KB | No orchestration |
| Full streaming | ~50KB | Streaming DFG only |

**Included algorithms:**
- `dfg` — Directly-Follows Graph
- `process_skeleton` — Process skeleton
- `streaming_dfg` — Streaming DFG (for real-time)
- Essential utilities: XES I/O, filtering, validation

**Memory profile:**
- Typical: 30-50MB
- Peak: 100MB (stress test)
- Recommended max: 50MB heap
- Safe for logs < 10K events

**Performance:**
- DFG: 10-50ms (small logs)
- Streaming DFG: 5-20ms per batch

**Battery considerations:**
- Minimize wake time: ~50-200ms per analysis
- Enable SIMD for 5-10x speedup
- Process in batches during non-critical hours

**Build command:**
```bash
npm run build:iot
```

**Memory tuning for IoT:**

Use streaming mode to minimize memory:
```typescript
const result = discover({
  algorithm: 'dfg',
  streaming: {
    enabled: true,
    batchSize: 1000,    // Small batches
    flushIntervalMs: 60000,
  },
  eventLog: sensorData,
});
```

**Production example:**
```typescript
// Raspberry Pi process monitoring
import init, { discover } from '@pictl/wasm4pm-iot';

await init();
const result = discover({
  algorithm: 'dfg',
  streaming: {
    enabled: true,
    batchSize: 500,
  },
  eventLog: systemLogs,
});
```

### Cloud Profile (~2.78MB - Default)

**When to use:**
- Development and testing
- Cloud servers with unlimited resources
- Data centers
- Research and experimentation
- CI/CD pipelines

**What you get:**
- All 21+ discovery algorithms
- All 6 ML algorithms
- Full POWL suite
- Streaming with full options
- OCEL support
- Full statrs library
- No feature limitations

**Performance:**
- Everything: Optimized for accuracy, not speed
- Complex models: 10-120 seconds
- Large logs: Handles 1M+ events

**Build command:**
```bash
npm run build       # Default
npm run build:cloud # Explicit
```

---

## Optimization Techniques

### Link-Time Optimization (LTO)

Enabled on all profiles. LTO runs optimization across entire codebase:

```toml
# In Cargo.toml
[profile.release]
lto = true
opt-level = "z"  # Optimize for size
```

**Effect:** 10-15% size reduction (already included)

**Trade-off:** Build time +30-60 seconds

### Profile-Guided Optimization (PGO)

Not enabled by default. For production builds, consider:

```bash
# Collect profiling data
LLVM_PROFILE_FILE="pgo-%p-%m.profraw" cargo build --profile release-pgo -Z pgo-instrument

# Run representative workload
./target/release-pgo/my-app < representative-log.xes

# Rebuild with profile data
llvm-profdata merge pgo-*.profraw -o pgo.profdata
LLVM_PGO_SAMPLE_USE=pgo.profdata cargo build --profile release-pgo
```

**Effect:** 5-10% performance gain (but slower build)

**Trade-off:** Complex setup, slower builds

### Feature Flags (Compile-Time Elimination)

All profiles use Cargo feature flags. Disable unused features:

```bash
# Build with specific features only
cargo build --release --features "basic,simd" --no-default-features
```

**Features available:**
- `basic` — Core discovery (DFG, heuristic, skeleton)
- `advanced` — Advanced algorithms (inductive, genetic, ILP, A*)
- `ml` — Machine learning (classify, forecast, cluster, anomaly, regress, PCA)
- `streaming_basic` — Basic streaming DFG
- `streaming_full` — Full streaming suite
- `swarm` — Swarm algorithms (ACO, PSO, simulated annealing)
- `powl` — POWL orchestration
- `ocel` — OCEL event logs
- `statrs` — Full statistics library
- `hand_rolled_stats` — Minimal statistics (saves 200KB)
- `simd` — SIMD acceleration (on by default)

**Size impact:**
```
cloud (all):              ~2.78MB
- powl:                   ~2.38MB
- powl - statrs:          ~2.18MB
- powl - statrs - advanced: ~1.88MB (≈ edge)
```

### SIMD Acceleration

All profiles include SIMD. To disable:

```bash
RUSTFLAGS="" cargo build --release  # No SIMD
RUSTFLAGS="-C target-feature=+simd128" cargo build --release  # With SIMD
```

**Effect:** 5-10x speedup for streaming DFG

**Size cost:** ~10KB (negligible)

**Trade-off:** Only works on SIMD-capable processors

### Panic Abort

All profiles use `panic = "abort"` to eliminate unwinding code:

```toml
[profile.release]
panic = "abort"
```

**Effect:** ~50KB size savings

**Trade-off:** Cannot catch/unwind panics (fine for WASM)

---

## Algorithm Selection by Profile

Which algorithms are available in each profile:

| Algorithm | browser | edge | fog | iot | cloud |
|-----------|---------|------|-----|-----|-------|
| dfg | ✅ | ✅ | ✅ | ✅ | ✅ |
| process_skeleton | ✅ | ✅ | ✅ | ✅ | ✅ |
| alpha_plus_plus | ✅ | ✅ | ✅ | ❌ | ✅ |
| heuristic_miner | ✅ | ✅ | ✅ | ❌ | ✅ |
| inductive_miner | ❌ | ✅ | ✅ | ❌ | ✅ |
| genetic_algorithm | ❌ | ✅ | ✅ | ❌ | ✅ |
| ilp | ❌ | ✅ | ✅ | ❌ | ✅ |
| a_star | ❌ | ✅ | ✅ | ❌ | ✅ |
| aco | ❌ | ❌ | ✅ | ❌ | ✅ |
| pso | ❌ | ❌ | ✅ | ❌ | ✅ |
| simulated_annealing | ❌ | ❌ | ✅ | ❌ | ✅ |
| ml_classify | ❌ | ✅ | ✅ | ❌ | ✅ |
| ml_cluster | ❌ | ✅ | ✅ | ❌ | ✅ |
| ml_forecast | ❌ | ✅ | ✅ | ❌ | ✅ |
| ml_anomaly | ❌ | ✅ | ✅ | ❌ | ✅ |
| ml_regress | ❌ | ✅ | ✅ | ❌ | ✅ |
| ml_pca | ❌ | ✅ | ✅ | ❌ | ✅ |

---

## Benchmarking Your Profile

### Size Benchmark

```bash
npm run build:browser

# Uncompressed size
ls -lh pkg/wasm4pm_bg.wasm
# Expected: 500 KB

# Compressed size (production)
gzip -c pkg/wasm4pm_bg.wasm | wc -c
# Expected: 130-150 KB

# Size comparison across profiles
npm run build:all-profiles
du -h pkg/wasm4pm_bg.wasm.* | sort -h
```

### Performance Benchmark

```bash
npm run bench -- --profile browser

# Output:
# Browser profile benchmarks:
# - DFG (5K events): 45ms
# - DFG (50K events): 180ms
# - Alpha+ (5K): 120ms
# - Token replay (5K): 85ms
```

### Memory Benchmark

```typescript
// Measure peak memory during execution
const before = performance.memory?.usedJSHeapSize || 0;
const result = await discover(config, largeLog);
const after = performance.memory?.usedJSHeapSize || 0;
console.log(`Peak memory delta: ${(after - before) / 1024 / 1024}MB`);
```

### Before/After Comparison

Track metrics before and after optimization:

```bash
# Build baseline (cloud)
npm run build
BASELINE_SIZE=$(stat -f%z pkg/wasm4pm_bg.wasm)

# Build optimized (browser)
npm run build:browser
OPTIMIZED_SIZE=$(stat -f%z pkg/wasm4pm_bg.wasm)

# Calculate reduction
REDUCTION=$((100 * (BASELINE_SIZE - OPTIMIZED_SIZE) / BASELINE_SIZE))
echo "Size reduction: $REDUCTION%"
```

**Expected results:**
```
cloud → browser: -82% size, -20% perf
cloud → edge: -46% size, +5% perf
cloud → iot: -64% size, -40% perf
```

---

## Common Issues & Solutions

### Binary Too Large

**Problem:** Browser profile is 600KB instead of 500KB

**Diagnosis:**
```bash
npm run build:browser
wasm-opt -O4 pkg/wasm4pm_bg.wasm -o pkg/wasm4pm_bg_opt.wasm
ls -lh pkg/wasm4pm_bg*.wasm
```

**Solutions:**

1. **Check feature flags:**
   ```bash
   grep "features" Cargo.toml | grep -v '#'
   ```
   Ensure `browser` feature only includes `["basic", "simd", "hand_rolled_stats"]`

2. **Rebuild without incremental:**
   ```bash
   cargo clean
   npm run build:browser
   ```

3. **Use wasm-opt:**
   ```bash
   npm install --save-dev wasm-opt
   npm run build:browser
   wasm-opt -O4 pkg/wasm4pm_bg.wasm -o pkg/wasm4pm_bg_opt.wasm
   # Use pkg/wasm4pm_bg_opt.wasm
   ```

### Memory Exceeded

**Problem:** Browser crashes with "out of memory" on medium logs (20K events)

**Solution:**

1. **Use streaming mode:**
   ```typescript
   const result = discover({
     algorithm: 'dfg',
     streaming: {
       enabled: true,
       batchSize: 2000,
     },
     eventLog: largeLog,
   });
   ```

2. **Switch to IoT profile:**
   ```bash
   npm run build:iot
   # Much lower memory footprint
   ```

3. **Reduce event log complexity:**
   - Filter events before sending to WASM
   - Sample traces for preview

### Timeout on Edge

**Problem:** Edge function times out (30-second limit)

**Solutions:**

1. **Reduce algorithm complexity:**
   ```typescript
   const result = discover({
     algorithm: 'dfg',  // Use simple algorithm
     // Avoid genetic, ACO, ILP
   });
   ```

2. **Reduce iterations:**
   ```typescript
   const result = discover({
     algorithm: 'genetic',
     parameters: {
       generations: 10,      // was 100
       populationSize: 10,   // was 50
     },
   });
   ```

3. **Use smaller event logs:**
   - Sample first 5000 events
   - Pre-filter by date range

### Performance Regression

**Problem:** Edge profile is slower than cloud for same algorithm

**Diagnosis:**

This suggests the optimizations are too aggressive. Check:

```bash
# Verify feature flags
grep "edge =" Cargo.toml

# Check optimization level
grep "opt-level" Cargo.toml

# Rebuild with LTO disabled
RUSTFLAGS="-C lto=off" npm run build:edge
```

**Solution:**

If hand-rolled stats are slower than statrs:
```toml
# In Cargo.toml, change edge to include statrs
edge = ["basic", "advanced", "ml", "streaming_basic", "statrs"]  # Add statrs
```

---

## Deployment Examples

### Web App (Browser Profile)

```bash
# Build
npm run build:browser

# Install in your web app
npm install ./pkg

# Use in React
import init, { discover } from '@pictl/wasm4pm-browser';

useEffect(async () => {
  await init();
}, []);

async function analyzeLog() {
  const result = discover({
    algorithm: 'dfg',
    eventLog: xesData,
  });
  setResult(result);
}
```

**Bundle size:**
- WASM: 500KB → 130KB gzipped
- Total bundle: +130KB to your app

### Edge Worker (Edge Profile)

```bash
# Build
npm run build:edge

# Deploy to Cloudflare
wrangler publish

# In wrangler.toml
[env.production]
routes = [{ pattern = "api/discover/*", zone_name = "example.com" }]
```

**Cold start:** ~200-500ms  
**Warm execution:** ~50-200ms  
**Cost:** Free tier compatible

### IoT Device (IoT Profile)

```bash
# Build
npm run build:iot

# Cross-compile for ARM
cargo build --target armv7-unknown-linux-gnueabihf --release --features iot

# Transfer to Raspberry Pi
scp target/armv7-unknown-linux-gnueabihf/release/pictl pi@raspberry:/opt/pictl

# Run on device
ssh pi@raspberry 'nohup /opt/pictl --algorithm dfg --input /var/log/events.xes &'
```

**Memory usage:** 30-50MB  
**Battery impact:** ~200ms CPU per analysis

---

## Size Verification Table

Expected sizes by profile (uncompressed WASM binary):

| Profile | Target | Typical | Gzipped | With deps |
|---------|--------|---------|---------|-----------|
| browser | 500KB | 480KB | 140KB | 180KB |
| iot | 1.0MB | 980KB | 280KB | 350KB |
| edge | 1.5MB | 1.45MB | 420KB | 520KB |
| fog | 2.0MB | 1.95MB | 580KB | 700KB |
| cloud | 2.78MB | 2.75MB | 820KB | 980KB |

*(Gzipped = single file. With deps = including @pictl module dependencies.)*

---

## Advanced: Building Custom Profiles

Create a custom profile for your use case:

```toml
# In Cargo.toml
[features]
my-custom = ["basic", "streaming_basic", "hand_rolled_stats", "simd"]
```

```bash
# Build with custom features
cargo build --release --features "my-custom" --no-default-features
```

**Example: Fast + Streaming**
```toml
fast-streaming = ["basic", "streaming_basic", "hand_rolled_stats"]
```

**Example: ML-only**
```toml
ml-only = ["ml", "hand_rolled_stats", "simd"]
```

---

## Performance Tuning Summary

| Goal | Technique | Profile | Trade-off |
|------|-----------|---------|-----------|
| Smallest binary | `npm run build:browser` | browser | Limited algorithms |
| Balanced | `npm run build:edge` | edge | No swarm/POWL |
| Best quality | `npm run build:cloud` | cloud | Large binary |
| Real-time | `npm run build:iot` + streaming | iot | Basic algorithms only |
| ML focus | Custom `ml-only` | edge | No discovery algorithms |

---

## Checklist: Production Deployment

Before deploying a profile:

- [ ] Build with `npm run build:PROFILE`
- [ ] Verify size: `ls -lh pkg/wasm4pm_bg.wasm`
- [ ] Run tests: `npm test -- --profile PROFILE`
- [ ] Benchmark: `npm run bench -- --profile PROFILE`
- [ ] Measure memory: Peak memory within limits?
- [ ] Verify algorithms: All needed algorithms available?
- [ ] Gzip size: Final size acceptable for distribution?
- [ ] Cold start: First load time acceptable?
- [ ] Warm perf: Steady-state performance acceptable?

---

## References

- **DEPLOYMENT_PROFILES.md** — Full technical specification
- **Cargo Feature Flags** — See `wasm4pm/Cargo.toml`
- **Performance Benchmarks** — See `benchmarks/` directory
- **Profile Tests** — See `packages/kernel/__tests__/deployment-profiles.test.ts`

---

**Last Updated:** 2026-04-10  
**Maintained by:** pictl core team  
**License:** MIT
