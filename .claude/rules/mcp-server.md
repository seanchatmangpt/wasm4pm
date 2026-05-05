# wasm4pm MCP Server

**Model Context Protocol integration for AI-assisted process mining.**

## Architecture

- **File**: `wasm4pm/src/mcp_server.ts`
- **SDK**: `@modelcontextprotocol/sdk`
- **Protocol**: stdio-based JSON-RPC
- **Transport**: Standard input/output (stdio)

## Available MCP Tools

### Discovery (5 tools)

| Tool | Algorithm | Speed |
|------|-----------|-------|
| `discover_dfg` | Directly-Follows Graph | ~0.5ms/100 events |
| `discover_alpha_plus_plus` | Petri net (Alpha++) | ~5ms/100 events |
| `discover_ilp_optimization` | Petri net (ILP) | ~20ms/100 events |
| `discover_genetic_algorithm` | Petri net (Genetic) | ~400ms/1000 events |
| `discover_variants` | Trace variant analysis | Fast |

### Analysis (4 tools)

| Tool | Purpose |
|------|---------|
| `check_conformance` | Log-to-model fitness and precision |
| `analyze_statistics` | Log statistics and metrics |
| `detect_bottlenecks` | Find slow activities |
| `detect_concept_drift` | Detect process changes over time |

### Visualization (2 tools)

| Tool | Purpose |
|------|---------|
| `generate_mermaid_diagram` | Mermaid process diagram |
| `generate_html_report` | Comprehensive HTML report |

### Utilities (3+ tools)

| Tool | Purpose |
|------|---------|
| `compare_algorithms` | Benchmark multiple algorithms |
| `parse_xes` | Parse XES event log |
| `validate_model` | Validate process model soundness |

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
