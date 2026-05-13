---
name: MCP Tool Patterns
description: 14+ MCP tools, JSON-RPC protocol, tool routing
paths: ["wasm4pm/src/mcp_server.ts"]
type: skill
---

# Skill: MCP Tool Patterns

## Purpose

Implement and register MCP (Model Context Protocol) tools for agent invocation of wasm4pm capabilities.

## The 14+ MCP Tools

| Tool | Endpoint | Input | Output |
|------|----------|-------|--------|
| `wpm_discover` | `wpm discover` | OCEL event log (JSON) | Petri net model (JSON) |
| `wpm_conformance` | `wpm conformance` | OCEL + BPMN model | Fitness/precision/generalization scores |
| `wpm_replay` | `wpm replay` | Event log + model | Alignment matrix |
| `wpm_variants` | `wpm variants` | Event log | Variant statistics |
| `wpm_ocel_validate` | `wpm ocel validate` | OCEL JSON | Validation report |
| `wpm_breed_execute` | `wpm breed execute` | Input + breed selector | Output + BLAKE3 receipt |
| `wpm_receipt_verify` | `wpm receipt verify` | Receipt chain | Chain validity report |
| `wpm_doctor` | `wpm doctor` | None (system query) | System health report |
| `wpm_otel_export` | `wpm otel export` | Time range | OTEL traces (JSON) |
| `wpm_ocel_from_otel` | `wpm ocel from-otel` | Traces JSON | OCEL event log |
| `wpm_benchmark_run` | `wpm benchmark run` | Artifact + algorithm | Timing + memory stats |
| `wpm_cache_clear` | `wpm cache clear` | None | Confirmation |
| `wpm_config_show` | `wpm config show` | None | Current config (JSON) |
| `wpm_logs_tail` | `wpm logs tail` | Line count | Recent log lines |

## Tool Registration Pattern

```typescript
// mcp_server.ts

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: { [key: string]: FieldSchema };
    required: string[];
  };
}

const tools: McpTool[] = [
  {
    name: "wpm_discover",
    description: "Discover process model from OCEL event log using inductive/alpha/heuristics",
    inputSchema: {
      type: "object",
      properties: {
        ocelData: {
          type: "string",
          description: "OCEL 2.0 JSON string",
        },
        algorithm: {
          type: "string",
          enum: ["inductive", "alpha", "heuristics"],
          description: "Discovery algorithm",
        },
      },
      required: ["ocelData", "algorithm"],
    },
  },
  // ... 13+ more tools
];

// Tool router
async function handleToolCall(name: string, input: unknown): Promise<ToolResponse> {
  switch (name) {
    case "wpm_discover":
      return await wpmDiscover(input);
    case "wpm_conformance":
      return await wpmConformance(input);
    // ... 12+ more handlers
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

## Input/Output Schemas

### wpm_discover

**Input:**
```json
{
  "ocelData": "{...OCEL 2.0 JSON...}",
  "algorithm": "inductive"
}
```

**Output:**
```json
{
  "model": {
    "activities": ["breed", "validate", "release"],
    "transitions": [{"from": "breed", "to": "validate"}],
    "startPlace": "start",
    "endPlace": "end"
  },
  "fitness": 0.92,
  "precision": 0.88
}
```

### wpm_conformance

**Input:**
```json
{
  "ocelData": "{...OCEL 2.0...}",
  "modelBpmn": "{...BPMN 2.0...}"
}
```

**Output:**
```json
{
  "fitness": 0.92,
  "precision": 0.88,
  "generalization": 0.85,
  "simplicity": 0.90,
  "deviations": [
    {
      "eventId": "event-042",
      "activity": "validate",
      "expectedBefore": "release",
      "actualBefore": "benchmark"
    }
  ]
}
```

### wpm_breed_execute

**Input:**
```json
{
  "input": "{ cognition input data }",
  "breedSelector": "symbolic"
}
```

**Output:**
```json
{
  "output": "{ cognition output }",
  "receipt": {
    "breed": "symbolic",
    "inputHash": "blake3...",
    "outputHash": "blake3...",
    "signature": "ed25519...",
    "timestamp": "2026-05-07T14:23:45Z"
  }
}
```

## JSON-RPC Protocol

MCP uses JSON-RPC 2.0:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "wpm_discover",
    "arguments": {
      "ocelData": "{...}",
      "algorithm": "inductive"
    }
  }
}
```

Response (success):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Discovery result: 15 activities, 42 transitions, fitness=0.92"
      }
    ]
  }
}
```

Response (error):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid parameters: ocelData is required"
  }
}
```

## Forbidden Patterns

❌ Tool that doesn't validate input schema before processing
❌ Tool that catches errors silently and returns success with empty result
❌ Tool missing error details in output (stack trace, original error must be in JSON)
❌ Tool that modifies global state without documenting side effects
❌ Tool that doesn't emit OTEL spans for timing/tracing

## Required Patterns

✅ Every tool validates input against declared schema
✅ Every tool returns detailed error messages in JSON error object
✅ Every tool emits OTEL span with `mcp.tool.name`, `mcp.tool.duration_ms`
✅ Every tool documents side effects (file writes, cache invalidation)
✅ Every tool has corresponding integration test

## Commands

```bash
# List registered tools
wpm tools list

# Call tool via CLI
wpm discover --ocel-file log.json --algorithm inductive

# Start MCP server (stdio transport)
wpm mcp start --transport stdio

# Start MCP server (HTTP transport)
wpm mcp start --transport http --port 3050
```
