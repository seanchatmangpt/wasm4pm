# Enterprise Deployment Guide

## System Requirements

- Node.js 20.x or 22.x LTS
- Memory: 512 MB minimum; 2 GB recommended; 4+ GB for logs >100K events
- WebAssembly SIMD support (Node.js 16+, Chrome 91+, Firefox 89+)

## Installation

### Standard
npm install -g @wasm4pm/cli

### Air-Gapped

On internet-connected machine:
  mkdir offline && cd offline
  npm pack @wasm4pm/cli && npm pack wasm4pm
  npm install --prefix bundle @wasm4pm/cli
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
name = "inductive_miner"

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
| 10K-100K | dfg, heuristic_miner | 1-2 GB |
| 100K-500K | dfg, streaming_dfg | 2-4 GB |
| > 500K | simd_streaming_dfg | 4+ GB |

## HTTP Proxy

export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
npm config set proxy http://proxy.company.com:8080

## Versioning

wasm4pm uses CalVer (YEAR.MONTH.DAY). Always pin exact versions:
  "dependencies": { "@wasm4pm/cli": "26.6.9" }

## Support

- Documentation: README.md, WASM_API.md, TESTING.md
- Bugs: GitHub Issues
- Security: See SECURITY.md
- Commercial: xpointsh@gmail.com
