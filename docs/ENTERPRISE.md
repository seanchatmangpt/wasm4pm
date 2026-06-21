# Enterprise Deployment Guide

## System Requirements

- Node.js 20.x or 22.x LTS
- Memory: 512 MB minimum; 2 GB recommended; 4+ GB for logs >100K events
- WebAssembly SIMD support (Node.js 16+, Chrome 91+, Firefox 89+)

## Installation

### Standard

> **Note:** Global npm publish is not yet available. Install from the monorepo:

```bash
git clone https://github.com/seanchatmangpt/wasm4pm
cd wasm4pm && pnpm install
cd wasm4pm && pnpm build && cd ..
node apps/wasm4pm/dist/bin/wpm.js --version
```

### Air-Gapped

On internet-connected machine:
  mkdir offline && cd offline
  pnpm pack --filter @wasm4pm/cli
  pnpm pack --filter wasm4pm
  pnpm install --prefix bundle @wasm4pm/cli
  tar czf wasm4pm-bundle.tar.gz bundle/

Transfer tarball, then:
  tar xzf wasm4pm-bundle.tar.gz
  export PATH="./bundle/node_modules/.bin:$PATH"

### Corporate npm Registry

.npmrc:
  @wasm4pm:registry=https://your-artifactory.internal/api/npm/npm-virtual/

## Configuration

### Key Environment Variables

| Variable | Description |
|----------|-------------|
| WASM4PM_ALGORITHM | Default algorithm (e.g. dfg, inductive_miner) |
| WASM4PM_PROFILE | Execution profile: fast/balanced/quality/stream |
| WASM4PM_OTEL_ENABLED | Set to 1 to enable OTLP telemetry |
| WASM4PM_OTEL_ENDPOINT | OTLP collector (e.g. http://jaeger:4318) |
| NODE_OPTIONS | e.g. --max-old-space-size=4096 |

### Config File (wasm4pm.toml)

[algorithm]
name = "simd_streaming_dfg"

[execution]
profile = "quality"
timeout = 120000

[observability.otel]
enabled = true
endpoint = "http://otel-collector.internal:4318"

## Telemetry Statement

wasm4pm does NOT collect or transmit any telemetry by default.
No phone-home, analytics, or crash reporting.
OTLP telemetry is opt-in and only sent to YOUR configured endpoint.

## Memory Guidelines

| Log Size | Recommended Algorithm | Memory |
|----------|----------------------|--------|
| < 10K events | Any | 512 MB |
| 10K-100K | dfg, streaming_dfg | 1-2 GB |
| 100K-500K | dfg, streaming_dfg | 2-4 GB |
| > 500K | simd_streaming_dfg | 4+ GB |

## HTTP Proxy

export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
npm config set proxy http://proxy.company.com:8080

## Versioning

wasm4pm uses CalVer (YEAR.MONTH.DAY). Always pin exact versions:
  "dependencies": { "@wasm4pm/cli": "26.6.12" }

## Known Limitations

### CLI to WASM Trace Correlation (Deferred)

The TypeScript CLI and the Rust/WASM core currently generate independent OTEL trace IDs. Distributed tracing across the CLI-WASM boundary is not yet correlated — Jaeger will show disconnected spans for CLI and WASM operations.

**Current behavior:** CLI span (e.g., trace_abc) and WASM span (e.g., trace_xyz) appear as separate traces.
**Impact:** Cross-boundary latency attribution and critical-path analysis in APM tools are unavailable.
**Workaround:** Correlate via cycle_count or timestamp proximity in Jaeger query results.
**Resolution timeline:** Planned for a future release. Design is fully specified in `.claude/rules/_observability-audit-findings.md` (Pattern 1 — context parameter propagation). Estimated implementation effort: 4-6 hours.

### Rust Toolchain Pin

The Rust toolchain is pinned to a specific nightly date in `rust-toolchain.toml` (required by `generic_const_exprs`). Do not change to unpinned `channel = "nightly"` — this would be non-reproducible on CI.

### Stochastic Algorithm Reproducibility

Algorithms using randomness (genetic, ACO, PSO, simulated annealing, A*) use a fixed seed (42). The seed is not currently configurable via CLI or API.

### WASM Binary Size (Browser Profile)

The WASM binary is approximately 5-8 MB depending on feature flags and profile. Profiles (mobile/iot/edge/fog/browser) differ by feature-gated algorithm subsets. Bundle size optimization is planned for a future release.

## Support

- Documentation: README.md, WASM_API.md, TESTING.md
- Bugs: GitHub Issues
- Security: See SECURITY.md
- Commercial: xpointsh@gmail.com

## Domain Use Case Examples

`examples/zoe-la/` demonstrates wasm4pm applied to a real-world service operations domain (community care coordination). Five end-to-end scripts show how the platform's process mining, autonomic monitoring, and cognition layers compose:

| Example | Job-to-be-Done |
|---------|---------------|
| `01-prayer-request-pipeline.ts` | Process discovery over care request flow |
| `02-connect-group-belonging.ts` | Conformance checking on community engagement |
| `03-sunday-threshold-andon.ts` | ANDON gate: detect threshold violations in service log |
| `04-autonomic-care-coordinator.ts` | Autonomic RL monitoring with convergence analysis |
| `05-red-team-adversary.ts` | Adversarial probe: inject invalid logs, verify rejection |

```bash
tsx examples/zoe-la/01-prayer-request-pipeline.ts
tsx examples/zoe-la/05-red-team-adversary.ts
```

These examples are instrumented with OTEL spans and emit BLAKE3 receipts — the same discipline as production deployments.
