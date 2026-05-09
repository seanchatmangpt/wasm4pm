# wasm4pm MCP Server

**Model Context Protocol integration for AI-assisted process mining.**

## Architecture

- **File**: `wasm4pm/src/mcp_server.ts`
- **SDK**: `@modelcontextprotocol/sdk`
- **Protocol**: stdio-based JSON-RPC
- **Transport**: Standard input/output (stdio)

## Available MCP Tools

The MCP server in `wasm4pm/src/mcp_server.ts` registers **~37 tools** (count of `name:` entries minus the server identifier). The categorization below is illustrative; for the authoritative list, grep `name:\s*['"]` in `wasm4pm/src/mcp_server.ts`.

### Discovery (sample)

| Tool | Algorithm | Speed |
|------|-----------|-------|
| `discover_dfg` | Directly-Follows Graph | ~0.5ms/100 events |
| `discover_alpha_plus_plus` | Petri net (Alpha++) | ~5ms/100 events |
| `discover_ilp_optimization` | Petri net (ILP) | ~20ms/100 events |
| `discover_genetic_algorithm` | Petri net (Genetic) | ~400ms/1000 events |
| `discover_variants` | Trace variant analysis | Fast |
| `discover_dfg_simd` | SIMD-accelerated DFG | Fast |
| `discover_dfg_hierarchical` | Hierarchical DFG | Fast |
| `discover_alpha_footprints` | Alpha footprint matrix | Fast |

### Analysis & Conformance (sample)

| Tool | Purpose |
|------|---------|
| `check_conformance` | Log-to-model fitness and precision |
| `analyze_statistics` | Log statistics and metrics |
| `detect_bottlenecks` | Find slow activities |
| `detect_concept_drift` | Detect process changes over time |
| `compute_conformance_fitness` | Token-replay fitness |
| `simd_replay` | SIMD-accelerated token replay |

### Object-Centric (OCEL)

`load_ocel`, `flatten_ocel`, `discover_ocel_dfg_per_type`, `discover_oc_petri_net`, `encode_ocel_as_text`.

### Predictive / ML

`predict_next_activity`, `predict_case_duration`, `score_trace_anomaly`, `extract_case_features`, `ml_classify_traces`, `ml_cluster_traces`, `ml_forecast_throughput`, `ml_detect_anomalies`, `ml_regress_remaining_time`, `ml_pca_reduce`.

### Encoding & Utilities

`encode_dfg_as_text`, `compare_algorithms`, `streaming_log_estimate`, `smart_engine_run`, `get_capability_registry`, `clear_caches`, `cache_stats`, `check_backend_health`.

> NOTE: previous versions of this doc claimed dedicated `generate_mermaid_diagram` and `generate_html_report` visualization tools and a separate `parse_xes` / `validate_model` utility set. Those names do **not** appear in `wasm4pm/src/mcp_server.ts` today. Visualization is currently delivered via `encode_dfg_as_text` / `encode_ocel_as_text`.

## MCP Tool Development

### Tool Schema Pattern

```typescript
{
  name: 'discover_dfg',
  description: 'Discover a Directly-Follows Graph from an event log',
  inputSchema: {
    type: 'object',
    properties: {
      logHandle: { type: 'string', description: 'Event log handle' },
      activityKey: { type: 'string', default: 'concept:name' }
    },
    required: ['logHandle']
  }
}
```

### Error Handling

- Return `ErrorResult` with code and message
- Never throw exceptions across MCP protocol
- Validate input before execution
- Log errors via OTEL instrumentation

### Claude Integration

Configure in Claude Desktop settings:

```json
{
  "mcpServers": {
    "wasm4pm": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/sac/chatmangpt/wasm4pm/dist/mcp_server.js"]
    }
  }
}
```

Claude discovers tools dynamically via `listTools` and selects algorithms based on natural language queries.

## Swarm MCP Server

A separate MCP server in `@wasm4pm/swarm` provides multi-worker coordination:

```typescript
import { createSwarmMcpServer } from '@wasm4pm/swarm';
```

## Build & Run

```bash
cd wasm4pm
npm run build:mcp            # Compile MCP server
npm run start:mcp            # Build + run MCP server
```

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| discover_dfg (100 events) | 0.5ms | Fastest |
| analyze_statistics (1K events) | 1-2ms | Quick analysis |
| discover_alpha_plus_plus (1K events) | 50ms | Balanced |
| discover_genetic_algorithm (1K events, 100 gen) | 400ms | High quality |
| check_conformance (10K events) | 100-200ms | Depends on model size |
